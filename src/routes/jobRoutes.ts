import { Router, Request, Response } from 'express';
import path from 'path';
import { JobService } from '../services/jobService';
import { SseService } from '../services/sseService';
import { config } from '../config';
import { PrintOptions, UploadedFileInfo } from '../types';
import { PaymentService } from '../services/paymentService';

const router = Router();

/**
 * POST /api/jobs
 * Create a new print job (validation is done inside JobService.createJob)
 */
router.post('/', (req: Request, res: Response) => {
  try {
    const { file, options, machineId, paymentMethod } = req.body;

    if (!file || !file.fileName) {
      return res.status(400).json({ error: 'File information is required' });
    }

    if (!options) {
      return res.status(400).json({ error: 'Print options are required' });
    }

    const resolvedFilePath = file.filePath || (file.fileName ? path.join(config.uploadDir, path.basename(file.fileName)) : '');

    const fileInfo: UploadedFileInfo = {
      id: file.id || 'unknown',
      originalName: String(file.originalName || 'document').slice(0, 255),
      fileName: String(file.fileName).slice(0, 255),
      filePath: resolvedFilePath,
      fileSize: Math.max(0, Number(file.fileSize) || 0),
      mimeType: String(file.mimeType || 'application/octet-stream').slice(0, 100),
      detectedPages: Math.min(500, Math.max(1, Math.floor(Number(file.detectedPages) || 1))),
      createdAt: file.createdAt || new Date().toISOString()
    };

    const targetMachineId = String(machineId || config.defaultMachineId).slice(0, 20);
    const targetPaymentMethod = String(paymentMethod || 'gpay').slice(0, 20);

    const job = JobService.createJob(
      fileInfo,
      options as PrintOptions,
      targetMachineId,
      targetPaymentMethod
    );

    return res.status(201).json({
      success: true,
      job
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to create print job' });
  }
});

/**
 * GET /api/jobs/:jobCode
 * Fetch single job details (auto-syncs with Razorpay if pending payment)
 */
router.get('/:jobCode', async (req: Request, res: Response) => {
  const jobCode = String(req.params.jobCode).toUpperCase().slice(0, 20);
  let job = JobService.getJob(jobCode);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  // If pending payment, verify with Razorpay in background in case mobile GPay completed
  if (job.status === 'pending_payment') {
    const synced = await PaymentService.syncPaymentWithRazorpay(jobCode);
    if (synced) job = synced;
  }

  return res.json({ success: true, job });
});

/**
 * GET /api/jobs/:jobCode/stream
 * Server-Sent Events (SSE) live stream for job updates
 */
router.get('/:jobCode/stream', (req: Request, res: Response) => {
  const jobCode = String(req.params.jobCode).toUpperCase().slice(0, 20);
  const job = JobService.getJob(jobCode);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  // Set SSE Headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no' // Disable nginx buffering for SSE
  });

  // Send initial data immediately
  res.write(`data: ${JSON.stringify(job)}\n\n`);

  // Register client (returns false if limits exceeded)
  const added = SseService.addClient(jobCode, res);
  if (!added) {
    res.write(`data: ${JSON.stringify({ type: 'error', message: 'Too many connections. Try again.' })}\n\n`);
    res.end();
  }
});

/**
 * GET /api/jobs
 * List jobs with pagination
 */
router.get('/', (req: Request, res: Response) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const jobs = JobService.getAllJobs(limit, offset);
  return res.json({
    success: true,
    total: JobService.getJobCount(),
    limit,
    offset,
    jobs
  });
});

export default router;
