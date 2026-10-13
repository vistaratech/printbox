"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const jobService_1 = require("../services/jobService");
const databaseService_1 = require("../services/databaseService");
const router = (0, express_1.Router)();
/**
 * POST /api/payments/create-order
 * Initiates payment and generates UPI payment link
 */
router.post('/create-order', (req, res) => {
    const { jobCode } = req.body;
    if (!jobCode || typeof jobCode !== 'string') {
        return res.status(400).json({ error: 'jobCode is required' });
    }
    const job = jobService_1.JobService.getJob(jobCode.toUpperCase());
    if (!job) {
        return res.status(404).json({ error: 'Job not found' });
    }
    if (job.status !== 'pending_payment') {
        return res.status(409).json({ error: 'Payment already processed for this job', status: job.status });
    }
    // Standard NPCI UPI URI Scheme
    const upiId = 'printbox@upi';
    const merchantName = 'PrintBox Vending';
    const amount = job.pricing.totalPrice.toFixed(2);
    const upiIntent = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(merchantName)}&am=${amount}&tr=${job.jobCode}&cu=INR&tn=${encodeURIComponent(`Print Job ${job.jobCode}`)}`;
    return res.json({
        success: true,
        jobCode: job.jobCode,
        amount: job.pricing.totalPrice,
        upiIntent
    });
});
/**
 * POST /api/payments/verify
 * Confirm payment and trigger print job progression
 * CRITICAL: Guards against double-spend (idempotent)
 */
router.post('/verify', (req, res) => {
    const { jobCode, paymentId, autoSimulate } = req.body;
    if (!jobCode || typeof jobCode !== 'string') {
        return res.status(400).json({ error: 'jobCode is required' });
    }
    const job = jobService_1.JobService.getJob(jobCode.toUpperCase());
    if (!job) {
        return res.status(404).json({ error: 'Job not found' });
    }
    // Prevent double-payment: if already paid, return current state
    if (job.status !== 'pending_payment') {
        return res.json({
            success: true,
            message: 'Payment was already verified',
            job
        });
    }
    // Mark as Paid (JobService also guards internally)
    const updatedJob = jobService_1.JobService.markPaid(job.jobCode, paymentId);
    // Persist payment record to database
    if (updatedJob) {
        (0, databaseService_1.savePayment)(updatedJob.jobCode, updatedJob.pricing.totalPrice, updatedJob.paymentMethod, updatedJob.paymentId || `PAY-${Date.now()}`);
    }
    // Only simulate if explicitly requested (e.g. headless tests)
    if (autoSimulate === true) {
        simulatePrintingFlow(job.jobCode);
    }
    return res.json({
        success: true,
        message: 'Payment verified successfully',
        job: updatedJob
    });
});
/**
 * Simulate printer progress with TRACKED timers (clearable on shutdown)
 */
function simulatePrintingFlow(jobCode) {
    const t1 = setTimeout(() => {
        jobService_1.JobService.updateStatus(jobCode, 'sending_to_machine', 'Sending file to the machine…');
    }, 1200);
    jobService_1.JobService.trackSimulationTimer(jobCode, t1);
    const t2 = setTimeout(() => {
        const job = jobService_1.JobService.getJob(jobCode);
        if (!job || job.status === 'completed' || job.status === 'failed')
            return;
        const totalSheets = job.totalPhysicalPages || 1;
        jobService_1.JobService.updateStatus(jobCode, 'printing', 'Printing your pages…', 0);
        let current = 0;
        const intervalTime = Math.max(100, Math.floor(3000 / totalSheets));
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
                const t3 = setTimeout(() => {
                    jobService_1.JobService.updateStatus(jobCode, 'completed', 'Ready in the tray! Grab your pages', totalSheets);
                }, 800);
                jobService_1.JobService.trackSimulationTimer(jobCode, t3);
            }
        }, intervalTime);
    }, 2600);
    jobService_1.JobService.trackSimulationTimer(jobCode, t2);
}
exports.default = router;
