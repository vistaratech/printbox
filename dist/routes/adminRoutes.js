"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const jobService_1 = require("../services/jobService");
const machineService_1 = require("../services/machineService");
const router = (0, express_1.Router)();
/**
 * GET /api/admin/stats
 * Admin dashboard aggregate stats from real backend data only
 */
router.get('/stats', (_req, res) => {
    try {
        const jobs = jobService_1.JobService.getAllJobs(1000, 0);
        const today = new Date().toDateString();
        const todayJobs = jobs.filter(j => new Date(j.createdAt).toDateString() === today);
        const revenue = todayJobs.reduce((s, j) => s + (j.pricing?.totalPrice ?? 0), 0);
        const totalPages = todayJobs.reduce((s, j) => s + (j.options?.copies ?? 1), 0);
        const failed = jobs.filter(j => j.status === 'failed').length;
        const waiting = jobs.filter(j => j.status === 'pending_payment' || j.status === 'payment_received').length;
        const machine = machineService_1.MachineService.getMachine('M-01');
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
    }
    catch (err) {
        return res.status(500).json({ error: err.message || 'Failed to load stats' });
    }
});
exports.default = router;
