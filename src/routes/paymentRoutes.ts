import { Router, Request, Response } from 'express';
import { JobService } from '../services/jobService';
import { savePayment } from '../services/databaseService';

const router = Router();

/**
 * POST /api/payments/create-order
 * Initiates payment and generates UPI payment link
 */
router.post('/create-order', (req: Request, res: Response) => {
  const { jobCode } = req.body;
  if (!jobCode || typeof jobCode !== 'string') {
    return res.status(400).json({ error: 'jobCode is required' });
  }

  const job = JobService.getJob(jobCode.toUpperCase());
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
router.post('/verify', (req: Request, res: Response) => {
  const { jobCode, paymentId, autoSimulate } = req.body;
  if (!jobCode || typeof jobCode !== 'string') {
    return res.status(400).json({ error: 'jobCode is required' });
  }

  const job = JobService.getJob(jobCode.toUpperCase());
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
  const updatedJob = JobService.markPaid(job.jobCode, paymentId);

  // Persist payment record to database
  if (updatedJob) {
    savePayment(updatedJob.jobCode, updatedJob.pricing.totalPrice, updatedJob.paymentMethod, updatedJob.paymentId || `PAY-${Date.now()}`);
  }

  // Auto-progress printing flow (ensures mobile progresses immediately without getting stuck)
  simulatePrintingFlow(job.jobCode);

  return res.json({
    success: true,
    message: 'Payment verified successfully',
    job: updatedJob
  });
});

/**
 * Simulate printer progress with TRACKED timers (clearable on shutdown)
 */
function simulatePrintingFlow(jobCode: string) {
  const t1 = setTimeout(() => {
    JobService.updateStatus(jobCode, 'sending_to_machine', 'Sending file to the machine…');
  }, 1200);
  JobService.trackSimulationTimer(jobCode, t1);

  const t2 = setTimeout(() => {
    const job = JobService.getJob(jobCode);
    if (!job || job.status === 'completed' || job.status === 'failed') return;

    const totalSheets = job.totalPhysicalPages || 1;
    JobService.updateStatus(jobCode, 'printing', 'Printing your pages…', 0);

    let current = 0;
    const intervalTime = Math.max(100, Math.floor(3000 / totalSheets));
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
        const t3 = setTimeout(() => {
          JobService.updateStatus(jobCode, 'completed', 'Ready in the tray! Grab your pages', totalSheets);
        }, 800);
        JobService.trackSimulationTimer(jobCode, t3);
      }
    }, intervalTime);
  }, 2600);
  JobService.trackSimulationTimer(jobCode, t2);
}

export default router;
