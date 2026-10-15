"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const crypto_1 = __importDefault(require("crypto"));
const express_1 = require("express");
const jobService_1 = require("../services/jobService");
const databaseService_1 = require("../services/databaseService");
const router = (0, express_1.Router)();
/**
 * POST /api/payments/create-order
 * Initiates payment with Razorpay Order API and falls back to standard UPI intent
 */
router.post('/create-order', async (req, res) => {
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
    const merchantName = 'PrintBox Vending';
    const amount = job.pricing.totalPrice;
    const amountPaise = Math.max(100, Math.round(amount * 100)); // Minimum ₹1 (100 paise) for Razorpay
    // Razorpay integration
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    let razorpayOrderId = null;
    if (keyId && keySecret) {
        try {
            const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
            const rzpRes = await fetch('https://api.razorpay.com/v1/orders', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Basic ${auth}`
                },
                body: JSON.stringify({
                    amount: amountPaise,
                    currency: 'INR',
                    receipt: job.jobCode,
                    notes: {
                        jobCode: job.jobCode,
                        machineId: job.machineId,
                        pages: job.totalPhysicalPages
                    }
                })
            });
            if (rzpRes.ok) {
                const rzpData = await rzpRes.json();
                razorpayOrderId = rzpData.id;
                console.log(`💳 Razorpay Order created: ${razorpayOrderId} for ${job.jobCode} (₹${amount})`);
            }
            else {
                const errText = await rzpRes.text();
                console.warn('⚠️ Razorpay order creation warning:', errText);
            }
        }
        catch (err) {
            console.error('❌ Failed to call Razorpay order API:', err?.message || err);
        }
    }
    // Standard NPCI UPI URI Scheme (fallback / direct QR)
    const upiId = 'printbox@upi';
    const upiIntent = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(merchantName)}&am=${amount.toFixed(2)}&tr=${job.jobCode}&cu=INR&tn=${encodeURIComponent(`Print Job ${job.jobCode}`)}`;
    return res.json({
        success: true,
        jobCode: job.jobCode,
        amount: job.pricing.totalPrice,
        currency: 'INR',
        keyId: keyId || null,
        razorpayOrderId,
        merchantName,
        upiIntent
    });
});
/**
 * POST /api/payments/verify
 * Confirm payment (validates Razorpay signature if provided) and triggers print dispatch
 * CRITICAL: Guards against double-spend (idempotent)
 */
router.post('/verify', (req, res) => {
    const { jobCode, paymentId, autoSimulate, razorpayPaymentId, razorpayOrderId, razorpaySignature } = req.body;
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
    // If Razorpay signature was submitted, cryptographically verify it
    if (razorpaySignature && razorpayPaymentId && razorpayOrderId) {
        const keySecret = process.env.RAZORPAY_KEY_SECRET;
        if (keySecret) {
            const generatedSignature = crypto_1.default
                .createHmac('sha256', keySecret)
                .update(`${razorpayOrderId}|${razorpayPaymentId}`)
                .digest('hex');
            if (generatedSignature !== razorpaySignature) {
                console.error('❌ Razorpay signature mismatch:', { received: razorpaySignature, expected: generatedSignature });
                return res.status(400).json({ error: 'Invalid payment signature. Verification failed.' });
            }
            console.log(`✅ Razorpay payment signature verified for ${job.jobCode}: ${razorpayPaymentId}`);
        }
    }
    const verifiedPaymentId = razorpayPaymentId || paymentId || `PAY-${Date.now()}`;
    // Mark as Paid (JobService also guards internally)
    const updatedJob = jobService_1.JobService.markPaid(job.jobCode, verifiedPaymentId);
    // Persist payment record to database
    if (updatedJob) {
        (0, databaseService_1.savePayment)(updatedJob.jobCode, updatedJob.pricing.totalPrice, updatedJob.paymentMethod, verifiedPaymentId);
    }
    // Only simulate if explicitly requested (e.g. headless tests)
    if (autoSimulate === true) {
        simulatePrintingFlow(job.jobCode);
    }
    return res.json({
        success: true,
        message: 'Payment verified successfully',
        paymentId: verifiedPaymentId,
        job: updatedJob
    });
});
/**
 * POST /api/payments/webhook
 * Razorpay webhook handler for background payment captures
 */
router.post('/webhook', (req, res) => {
    try {
        const event = req.body;
        if (event && (event.event === 'payment.captured' || event.event === 'order.paid')) {
            const paymentEntity = event.payload?.payment?.entity;
            const orderEntity = event.payload?.order?.entity;
            const jobCode = paymentEntity?.notes?.jobCode || orderEntity?.notes?.jobCode || orderEntity?.receipt;
            if (jobCode) {
                const job = jobService_1.JobService.getJob(jobCode.toUpperCase());
                if (job && job.status === 'pending_payment') {
                    console.log(`🔔 Webhook auto-verifying payment for job: ${jobCode}`);
                    jobService_1.JobService.markPaid(job.jobCode, paymentEntity?.id || `WH-${Date.now()}`);
                    (0, databaseService_1.savePayment)(job.jobCode, job.pricing.totalPrice, 'razorpay_webhook', paymentEntity?.id || `WH-${Date.now()}`);
                }
            }
        }
        return res.json({ status: 'ok' });
    }
    catch (err) {
        return res.status(200).json({ status: 'error_handled' });
    }
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
