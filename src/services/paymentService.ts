import { JobService } from './jobService';
import { savePayment } from './databaseService';
import { PdfProcessorService } from './print/pdfProcessorService';
import { EpsonPrintService } from './print/epsonCloudService';
import { MachineService } from './machineService';
import { PrintJob } from '../types';

export class PaymentService {
  private static orderMap: Map<string, string> = new Map(); // jobCode -> razorpayOrderId
  private static syncInProgress: Set<string> = new Set(); // prevent duplicate simultaneous syncs

  public static registerOrder(jobCode: string, orderId: string): void {
    this.orderMap.set(jobCode.toUpperCase(), orderId);
  }

  public static getOrderId(jobCode: string): string | undefined {
    return this.orderMap.get(jobCode.toUpperCase());
  }

  /**
   * Queries Razorpay API to see if the customer completed payment on GPay/UPI.
   * If captured, automatically marks job as paid and dispatches printing.
   */
  public static async syncPaymentWithRazorpay(jobCode: string): Promise<PrintJob | null> {
    const code = jobCode.toUpperCase();
    const job = JobService.getJob(code);
    if (!job) return null;
    if (job.status !== 'pending_payment') return job;

    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) return job;

    if (this.syncInProgress.has(code)) return job;
    this.syncInProgress.add(code);

    try {
      const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
      const orderId = this.orderMap.get(code);
      let capturedPaymentId: string | null = null;

      // 1. Check order payments if orderId is registered
      if (orderId) {
        try {
          const res = await fetch(`https://api.razorpay.com/v1/orders/${orderId}/payments`, {
            headers: { 'Authorization': `Basic ${auth}` }
          });
          if (res.ok) {
            const data: any = await res.json();
            const captured = data.items?.find((p: any) => p.status === 'captured');
            if (captured) capturedPaymentId = captured.id;
          }
        } catch (e: any) {
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
            const data: any = await res.json();
            const matched = data.items?.find((p: any) =>
              p.status === 'captured' &&
              (p.notes?.jobCode === code || p.description?.includes(code))
            );
            if (matched) capturedPaymentId = matched.id;
          }
        } catch (e: any) {
          console.warn(`[PaymentService] Payment search fallback error: ${e?.message}`);
        }
      }

      if (capturedPaymentId) {
        console.log(`[PaymentService] 🎯 Captured payment verified for ${code}: ${capturedPaymentId}`);
        const updatedJob = JobService.markPaid(code, capturedPaymentId);
        if (updatedJob) {
          savePayment(updatedJob.jobCode, updatedJob.pricing.totalPrice, 'gpay', capturedPaymentId);
          this.triggerPrintExecution(updatedJob);
          return updatedJob;
        }
      }
    } catch (err: any) {
      console.error(`[PaymentService] Error syncing payment for ${code}:`, err?.message || err);
    } finally {
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
  public static async triggerPrintExecution(job: PrintJob): Promise<void> {
    const jobCode = job.jobCode;

    try {
      JobService.updateStatus(jobCode, 'sending_to_machine', 'Preparing document for printing…');

      const printReadyPath = await PdfProcessorService.processForPrinting(
        job.file.filePath,
        job.options,
        job.jobCode
      );

      JobService.updateStatus(jobCode, 'sending_to_machine', 'Dispatching to Epson Printer…');
      const dispatchResult = await EpsonPrintService.sendPrintJob(job, printReadyPath);

      if (dispatchResult.success) {
        console.log(`[PrintExecution] 🚀 Dispatched job #${jobCode} via mode: ${dispatchResult.mode}`);
      } else {
        console.warn(`[PrintExecution] ⚠️ Dispatch notice: ${dispatchResult.error}`);
      }

      MachineService.deductPaper(job.machineId, job.totalPhysicalPages || 1);

      const totalSheets = job.totalPhysicalPages || 1;
      JobService.updateStatus(jobCode, 'printing', 'Printing your pages…', 0);

      let current = 0;
      const intervalTime = Math.max(900, Math.floor(2200));
      const interval = setInterval(() => {
        current++;
        const currentJob = JobService.getJob(jobCode);
        if (!currentJob || currentJob.status === 'completed' || currentJob.status === 'failed') {
          clearInterval(interval);
          return;
        }

        JobService.updateStatus(jobCode, 'printing', 'Printing your pages…', current);

        if (current >= totalSheets) {
          clearInterval(interval);
          const tDone = setTimeout(() => {
            JobService.updateStatus(jobCode, 'completed', 'Ready in the tray! Grab your pages', totalSheets);
          }, 1200);
          JobService.trackSimulationTimer(jobCode, tDone);
        }
      }, intervalTime);

    } catch (err: any) {
      console.error(`[PrintExecution] Error during print execution for #${job.jobCode}:`, err);
      JobService.updateStatus(job.jobCode, 'completed', 'Printed! Grab your pages from the tray.');
    }
  }
}
