import { Router, Request, Response } from 'express';
import { JobService } from '../services/jobService';
import { config } from '../config';

const router = Router();

/**
 * POST /api/payments/create-order
 * Initiates payment and generates UPI payment link
 */
router.post('/create-order', (req: Request, res: Response) => {
  const { jobCode } = req.body;
  if (!jobCode) {
    return res.status(400).json({ error: 'jobCode is required' });
  }

  const job = JobService.getJob(jobCode.toUpperCase());
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
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
    upiIntent,
    isDemo: config.enableDemoPayment
  });
});

/**
 * POST /api/payments/verify
 * Confirm payment and trigger print job progression
 */
router.post('/verify', (req: Request, res: Response) => {
  const { jobCode, paymentId, autoSimulate } = req.body;
  if (!jobCode) {
    return res.status(400).json({ error: 'jobCode is required' });
  }

  const job = JobService.getJob(jobCode.toUpperCase());
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  // 1. Mark as Paid
  const updatedJob = JobService.markPaid(job.jobCode, paymentId);

  // If autoSimulate is true (or demo mode without external kiosk running),
  // simulate the printing progression automatically with realistic delays
  if (autoSimulate !== false) {
    simulatePrintingFlow(job.jobCode);
  }

  return res.json({
    success: true,
    message: 'Payment verified successfully',
    job: updatedJob
  });
});

/**
 * Helper to simulate printer step progress if physical hardware is not attached
 */
function simulatePrintingFlow(jobCode: string) {
  setTimeout(() => {
    JobService.updateStatus(jobCode, 'sending_to_machine', 'Sending file to the machine…');
  }, 1200);

  setTimeout(() => {
    const job = JobService.getJob(jobCode);
    const totalSheets = job?.totalPhysicalPages || 1;
    JobService.updateStatus(jobCode, 'printing', 'Printing your pages…', 0);

    // Increment pages one by one
    let current = 0;
    const intervalTime = Math.max(100, Math.floor(3000 / totalSheets));
    const interval = setInterval(() => {
      current++;
      JobService.updateStatus(jobCode, 'printing', 'Printing your pages…', current);
      if (current >= totalSheets) {
        clearInterval(interval);
        setTimeout(() => {
          JobService.updateStatus(jobCode, 'completed', 'Ready in the tray! Grab your pages 🎉', totalSheets);
        }, 800);
      }
    }, intervalTime);
  }, 2600);
}

export default router;
