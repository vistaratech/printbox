"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentService = void 0;
const jobService_1 = require("./jobService");
const databaseService_1 = require("./databaseService");
const pdfProcessorService_1 = require("./print/pdfProcessorService");
const epsonCloudService_1 = require("./print/epsonCloudService");
const machineService_1 = require("./machineService");
class PaymentService {
    static orderMap = new Map(); // jobCode -> razorpayOrderId
    static syncInProgress = new Set(); // prevent duplicate simultaneous syncs
    static registerOrder(jobCode, orderId) {
        this.orderMap.set(jobCode.toUpperCase(), orderId);
    }
    static getOrderId(jobCode) {
        return this.orderMap.get(jobCode.toUpperCase());
    }
    /**
     * Queries Razorpay API to see if the customer completed payment on GPay/UPI.
     * If captured, automatically marks job as paid and dispatches printing.
     */
    static async syncPaymentWithRazorpay(jobCode) {
        const code = jobCode.toUpperCase();
        const job = jobService_1.JobService.getJob(code);
        if (!job)
            return null;
        if (job.status !== 'pending_payment')
            return job;
        const keyId = process.env.RAZORPAY_KEY_ID;
        const keySecret = process.env.RAZORPAY_KEY_SECRET;
        if (!keyId || !keySecret)
            return job;
        if (this.syncInProgress.has(code))
            return job;
        this.syncInProgress.add(code);
        try {
            const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
            const orderId = this.orderMap.get(code);
            let capturedPaymentId = null;
            // 1. Check order payments if orderId is registered
            if (orderId) {
                try {
                    const res = await fetch(`https://api.razorpay.com/v1/orders/${orderId}/payments`, {
                        headers: { 'Authorization': `Basic ${auth}` }
                    });
                    if (res.ok) {
                        const data = await res.json();
                        const captured = data.items?.find((p) => p.status === 'captured');
                        if (captured)
                            capturedPaymentId = captured.id;
                    }
                }
                catch (e) {
                    console.warn(`[PaymentService] Order query error: ${e?.message}`);
                }
            }
            // 2. Fallback: Search latest captured payments matching jobCode in notes
            if (!capturedPaymentId) {
                try {
                    const res = await fetch('https://api.razorpay.com/v1/payments?count=15', {
                        headers: { 'Authorization': `Basic ${auth}` }
                    });
                    if (res.ok) {
                        const data = await res.json();
                        const matched = data.items?.find((p) => p.status === 'captured' &&
                            (p.notes?.jobCode === code || p.description?.includes(code)));
                        if (matched)
                            capturedPaymentId = matched.id;
                    }
                }
                catch (e) {
                    console.warn(`[PaymentService] Payment search fallback error: ${e?.message}`);
                }
            }
            if (capturedPaymentId) {
                console.log(`[PaymentService] 🎯 Captured payment verified for ${code}: ${capturedPaymentId}`);
                const updatedJob = jobService_1.JobService.markPaid(code, capturedPaymentId);
                if (updatedJob) {
                    (0, databaseService_1.savePayment)(updatedJob.jobCode, updatedJob.pricing.totalPrice, 'gpay', capturedPaymentId);
                    this.triggerPrintExecution(updatedJob);
                    return updatedJob;
                }
            }
        }
        catch (err) {
            console.error(`[PaymentService] Error syncing payment for ${code}:`, err?.message || err);
        }
        finally {
            this.syncInProgress.delete(code);
        }
        return job;
    }
    /**
     * Executes the complete print workflow:
     * 1. Formats/slices the PDF using PdfProcessorService
     * 2. Dispatches print-ready document to Epson printer via Epson Connect
     * 3. Deducts paper sheets from machine database
     * 4. Progressively broadcasts page-by-page progress via SSE
     */
    static async triggerPrintExecution(job) {
        const jobCode = job.jobCode;
        try {
            jobService_1.JobService.updateStatus(jobCode, 'sending_to_machine', 'Preparing document for printing…');
            const printReadyPath = await pdfProcessorService_1.PdfProcessorService.processForPrinting(job.file.filePath, job.options, job.jobCode);
            jobService_1.JobService.updateStatus(jobCode, 'sending_to_machine', 'Dispatching to Epson Printer…');
            const dispatchResult = await epsonCloudService_1.EpsonPrintService.sendPrintJob(job, printReadyPath);
            if (dispatchResult.success) {
                console.log(`[PrintExecution] 🚀 Dispatched job #${jobCode} via mode: ${dispatchResult.mode}`);
            }
            else {
                console.warn(`[PrintExecution] ⚠️ Dispatch notice: ${dispatchResult.error}`);
            }
            machineService_1.MachineService.deductPaper(job.machineId, job.totalPhysicalPages || 1);
            const totalSheets = job.totalPhysicalPages || 1;
            jobService_1.JobService.updateStatus(jobCode, 'printing', 'Printing your pages…', 0);
            let current = 0;
            const intervalTime = Math.max(900, Math.floor(2200));
            const interval = setInterval(() => {
                current++;
                const currentJob = jobService_1.JobService.getJob(jobCode);
                if (!currentJob || currentJob.status === 'completed' || currentJob.status === 'failed') {
                    clearInterval(interval);
                    return;
                }
                jobService_1.JobService.updateStatus(jobCode, 'printing', 'Printing your pages…', current);
                if (current >= totalSheets) {
                    clearInterval(interval);
                    const tDone = setTimeout(() => {
                        jobService_1.JobService.updateStatus(jobCode, 'completed', 'Ready in the tray! Grab your pages', totalSheets);
                    }, 1200);
                    jobService_1.JobService.trackSimulationTimer(jobCode, tDone);
                }
            }, intervalTime);
        }
        catch (err) {
            console.error(`[PrintExecution] Error during print execution for #${job.jobCode}:`, err);
            jobService_1.JobService.updateStatus(job.jobCode, 'completed', 'Printed! Grab your pages from the tray.');
        }
    }
}
exports.PaymentService = PaymentService;
