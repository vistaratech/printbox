import { Router, Request, Response } from 'express';
import { JobService } from '../services/jobService';
import { SseService } from '../services/sseService';
import { config } from '../config';
import { PrintOptions, UploadedFileInfo } from '../types';

const router = Router();

/**
 * POST /api/jobs
 * Create a new print job
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

    const fileInfo: UploadedFileInfo = {
      id: file.id || 'unknown',
      originalName: file.originalName || 'document',
      fileName: file.fileName,
      filePath: file.filePath || '',
      fileSize: file.fileSize || 0,
      mimeType: file.mimeType || 'application/octet-stream',
      detectedPages: file.detectedPages || 1,
      createdAt: file.createdAt || new Date().toISOString()
    };

    const targetMachineId = machineId || config.defaultMachineId;
    const targetPaymentMethod = paymentMethod || 'gpay';

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
 * Fetch single job details
 */
router.get('/:jobCode', (req: Request, res: Response) => {
  const jobCode = String(req.params.jobCode).toUpperCase();
  const job = JobService.getJob(jobCode);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  return res.json({ success: true, job });
});

/**
 * GET /api/jobs/:jobCode/stream
 * Server-Sent Events (SSE) live stream for job updates
 */
router.get('/:jobCode/stream', (req: Request, res: Response) => {
  const jobCode = String(req.params.jobCode).toUpperCase();
  const job = JobService.getJob(jobCode);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  // Set SSE Headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  // Send initial data immediately
  res.write(`data: ${JSON.stringify(job)}\n\n`);

  // Register client
  SseService.addClient(jobCode, res);
});

/**
 * GET /api/jobs
 * List all jobs
 */
router.get('/', (_req: Request, res: Response) => {
  const jobs = JobService.getAllJobs();
  return res.json({ success: true, jobs });
});

export default router;
