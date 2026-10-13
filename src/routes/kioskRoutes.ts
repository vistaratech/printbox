import { Router, Request, Response } from 'express';
import { JobService } from '../services/jobService';
import { MachineService } from '../services/machineService';

const router = Router();

/**
 * GET /api/kiosk/:machineId/poll
 * Raspberry Pi polls this endpoint to fetch the next queued print job
 */
router.get('/:machineId/poll', (req: Request, res: Response) => {
  const machineId = String(req.params.machineId);
  const job = JobService.getNextQueuedJob(machineId);

  if (!job) {
    return res.status(200).json({ hasJob: false });
  }

  // Update status to sending_to_machine
  JobService.updateStatus(job.jobCode, 'sending_to_machine', 'Hardware agent received file');

  return res.json({
    hasJob: true,
    job
  });
});

/**
 * POST /api/kiosk/:machineId/jobs/:jobCode/progress
 * Raspberry Pi reports printing progress (e.g. page 3 of 10 printed)
 */
router.post('/:machineId/jobs/:jobCode/progress', (req: Request, res: Response) => {
  const jobCode = String(req.params.jobCode).toUpperCase();
  const { printedPages, statusMessage } = req.body;

  const job = JobService.updateStatus(
    jobCode,
    'printing',
    statusMessage || `Printing page ${printedPages}`,
    Number(printedPages)
  );

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  return res.json({ success: true, job });
});

/**
 * POST /api/kiosk/:machineId/jobs/:jobCode/complete
 * Raspberry Pi reports job finished successfully
 */
router.post('/:machineId/jobs/:jobCode/complete', (req: Request, res: Response) => {
  const jobCode = String(req.params.jobCode).toUpperCase();
  const machineId = String(req.params.machineId);

  const job = JobService.updateStatus(
    jobCode,
    'completed',
    'Ready in the tray! Grab your pages'
  );

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  // Automatically deduct printed sheets from paper tray
  const machine = MachineService.getMachine(machineId);
  if (machine) {
    const sheetsDeducted = job.totalPhysicalPages || 1;
    const newPaperRemaining = Math.max(0, machine.paperRemaining - sheetsDeducted);
    MachineService.updateHeartbeat(machineId, newPaperRemaining);
  }

  return res.json({ success: true, job });
});

/**
 * POST /api/kiosk/:machineId/jobs/:jobCode/fail
 * Raspberry Pi reports error or paper jam
 */
router.post('/:machineId/jobs/:jobCode/fail', (req: Request, res: Response) => {
  const jobCode = String(req.params.jobCode).toUpperCase();
  const { reason } = req.body;

  const job = JobService.updateStatus(
    jobCode,
    'failed',
    reason || 'Printer hardware error occurred'
  );

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  return res.json({ success: true, job });
});

/**
 * POST /api/kiosk/:machineId/heartbeat
 * Hardware sensor telemetry (paper remaining, toner level)
 */
router.post('/:machineId/heartbeat', (req: Request, res: Response) => {
  const machineId = String(req.params.machineId);
  const { paperRemaining, tonerLevelPercent } = req.body;

  const machine = MachineService.updateHeartbeat(
    machineId,
    paperRemaining !== undefined ? Number(paperRemaining) : undefined,
    tonerLevelPercent !== undefined ? Number(tonerLevelPercent) : undefined
  );

  return res.json({ success: true, machine });
});

export default router;
