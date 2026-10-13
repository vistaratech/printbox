import { Router, Request, Response } from 'express';
import { JobService } from '../services/jobService';
import { MachineService } from '../services/machineService';

const router = Router();

/**
 * GET /api/admin/stats
 * Admin dashboard aggregate stats from real backend data only
 */
router.get('/stats', (_req: Request, res: Response) => {
  try {
    const jobs = JobService.getAllJobs(1000, 0);
    const today = new Date().toDateString();
    const todayJobs = jobs.filter(j => new Date(j.createdAt).toDateString() === today);
    const revenue = todayJobs.reduce((s, j) => s + (j.pricing?.totalPrice ?? 0), 0);
    const totalPages = todayJobs.reduce((s, j) => s + (j.options?.copies ?? 1), 0);
    const failed = jobs.filter(j => j.status === 'failed').length;
    const waiting = jobs.filter(j => j.status === 'pending_payment' || j.status === 'payment_received').length;
    const machine = MachineService.getMachine('M-01');
    return res.json({
      success: true,
      stats: {
        todayRevenue: revenue,
        todayPrints: todayJobs.length,
        totalPages,
        failedJobs: failed,
        waitingJobs: waiting,
        paperRemaining: machine?.paperRemaining ?? 0,
        machineOnline: machine?.isOnline ?? false
      }
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to load stats' });
  }
});

export default router;
