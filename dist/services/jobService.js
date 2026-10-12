"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JobService = void 0;
const pricingService_1 = require("./pricingService");
const machineService_1 = require("./machineService");
const sseService_1 = require("./sseService");
const config_1 = require("../config");
const fs_1 = __importDefault(require("fs"));
const MAX_JOBS = 5000; // Maximum jobs to keep in memory
const JOB_TTL_MS = 60 * 60 * 1000; // 1 hour TTL for completed/failed jobs
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // Run cleanup every 5 minutes
class JobService {
    static jobs = new Map();
    static activeSimulations = new Map();
    static cleanupTimer = null;
    /**
     * Start the periodic cleanup scheduler
     */
    static startCleanupScheduler() {
        if (this.cleanupTimer)
            return;
        this.cleanupTimer = setInterval(() => this.purgeStaleJobs(), CLEANUP_INTERVAL_MS);
        console.log('[JobService] Cleanup scheduler started (every 5 min)');
    }
    /**
     * Stop the cleanup scheduler (for graceful shutdown)
     */
    static stopCleanupScheduler() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
    }
    /**
     * Clear all active simulation timers (for graceful shutdown)
     */
    static clearAllSimulations() {
        for (const [jobCode, timers] of this.activeSimulations) {
            for (const t of timers)
                clearTimeout(t);
        }
        this.activeSimulations.clear();
    }
    /**
     * Purge completed/failed jobs older than TTL and delete their uploaded files
     */
    static purgeStaleJobs() {
        const now = Date.now();
        let purged = 0;
        for (const [code, job] of this.jobs) {
            if (job.status === 'completed' || job.status === 'failed') {
                const updatedAt = new Date(job.updatedAt).getTime();
                if (now - updatedAt > JOB_TTL_MS) {
                    // Delete uploaded file from disk
                    if (job.file.filePath) {
                        try {
                            fs_1.default.unlinkSync(job.file.filePath);
                        }
                        catch { /* already deleted */ }
                    }
                    this.jobs.delete(code);
                    this.activeSimulations.delete(code);
                    purged++;
                }
            }
        }
        // Emergency purge if too many jobs in memory
        if (this.jobs.size > MAX_JOBS) {
            const sorted = Array.from(this.jobs.entries())
                .filter(([, j]) => j.status === 'completed' || j.status === 'failed')
                .sort((a, b) => new Date(a[1].updatedAt).getTime() - new Date(b[1].updatedAt).getTime());
            const toRemove = this.jobs.size - MAX_JOBS;
            for (let i = 0; i < Math.min(toRemove, sorted.length); i++) {
                const [code, job] = sorted[i];
                if (job.file.filePath) {
                    try {
                        fs_1.default.unlinkSync(job.file.filePath);
                    }
                    catch { /* ignore */ }
                }
                this.jobs.delete(code);
                purged++;
            }
        }
        if (purged > 0) {
            console.log(`[JobService] Purged ${purged} stale jobs. Active: ${this.jobs.size}`);
        }
    }
    /**
     * Generate an easy-to-read unique 4-digit kiosk job code, e.g. "PB-4821"
     */
    static generateJobCode() {
        let code = '';
        let attempts = 0;
        do {
            const num = Math.floor(1000 + Math.random() * 9000);
            code = `PB-${num}`;
            attempts++;
            if (attempts > 100) {
                // Fallback: use timestamp-based code
                code = `PB-${Date.now().toString(36).slice(-5).toUpperCase()}`;
                break;
            }
        } while (this.jobs.has(code));
        return code;
    }
    /**
     * Create a new print job with validated options and server-verified pricing
     */
    static createJob(file, options, machineId = config_1.config.defaultMachineId, paymentMethod = 'gpay') {
        // Validate and clamp options
        const safeOptions = {
            color: ['bw', 'color'].includes(options.color) ? options.color : 'bw',
            sides: ['single', 'double'].includes(options.sides) ? options.sides : 'single',
            size: ['A4', 'A3', 'A5', 'Legal'].includes(options.size) ? options.size : 'A4',
            orient: ['portrait', 'landscape'].includes(options.orient) ? options.orient : 'portrait',
            pps: [1, 2, 4, 6].includes(options.pps) ? options.pps : 1,
            quality: ['draft', 'normal', 'high'].includes(options.quality) ? options.quality : 'normal',
            copies: Math.min(99, Math.max(1, Math.floor(Number(options.copies) || 1))),
            range: options.range === 'custom' ? 'custom' : 'all',
            rangeText: typeof options.rangeText === 'string' ? options.rangeText.slice(0, 200) : undefined,
            staple: Boolean(options.staple),
            collate: options.collate !== false
        };
        const safePages = Math.min(500, Math.max(1, Math.floor(Number(file.detectedPages) || 1)));
        file.detectedPages = safePages;
        const jobCode = this.generateJobCode();
        const pricing = pricingService_1.PricingService.calculate(safeOptions, safePages);
        const now = new Date().toISOString();
        const job = {
            jobCode,
            machineId,
            file,
            options: safeOptions,
            pricing,
            status: 'pending_payment',
            statusMessage: 'Awaiting payment confirmation',
            printedPages: 0,
            totalPhysicalPages: pricing.sheetsPerCopy * safeOptions.copies,
            paymentMethod,
            createdAt: now,
            updatedAt: now
        };
        this.jobs.set(jobCode, job);
        return job;
    }
    static getJob(jobCode) {
        return this.jobs.get(jobCode);
    }
    static getJobCount() {
        return this.jobs.size;
    }
    static getAllJobs(limit = 50, offset = 0) {
        return Array.from(this.jobs.values())
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(offset, offset + limit);
    }
    /**
     * Mark payment as received and queue for machine.
     * Guards against double-payment: only transitions from pending_payment.
     */
    static markPaid(jobCode, paymentId) {
        const job = this.jobs.get(jobCode);
        if (!job)
            return undefined;
        // CRITICAL: Prevent double-spend / replay
        if (job.status !== 'pending_payment') {
            return job; // Already paid, return current state without re-processing
        }
        job.status = 'payment_received';
        job.statusMessage = 'Payment received successfully';
        job.paymentId = paymentId || `DEMO-PAY-${Date.now()}`;
        job.updatedAt = new Date().toISOString();
        sseService_1.SseService.broadcastJobUpdate(job);
        return job;
    }
    /**
     * Update print job status and optional printed pages count
     */
    static updateStatus(jobCode, status, statusMessage, printedPages) {
        const job = this.jobs.get(jobCode);
        if (!job)
            return undefined;
        // Don't allow status changes on already-completed or failed jobs
        if (job.status === 'completed' || job.status === 'failed') {
            return job;
        }
        job.status = status;
        if (statusMessage)
            job.statusMessage = statusMessage;
        if (printedPages !== undefined)
            job.printedPages = printedPages;
        job.updatedAt = new Date().toISOString();
        if (status === 'completed') {
            job.completedAt = job.updatedAt;
            job.printedPages = job.totalPhysicalPages;
            machineService_1.MachineService.deductPaper(job.machineId, job.pricing.totalPaperSheets);
            // Clean up simulation timers
            this.activeSimulations.delete(jobCode);
        }
        sseService_1.SseService.broadcastJobUpdate(job);
        return job;
    }
    /**
     * Track a simulation timer so it can be cleared on shutdown
     */
    static trackSimulationTimer(jobCode, timer) {
        if (!this.activeSimulations.has(jobCode)) {
            this.activeSimulations.set(jobCode, []);
        }
        this.activeSimulations.get(jobCode).push(timer);
    }
    /**
     * Get next pending job for a given machine kiosk
     */
    static getNextQueuedJob(machineId) {
        for (const job of this.jobs.values()) {
            if (job.machineId === machineId && (job.status === 'payment_received' || job.status === 'queued')) {
                return job;
            }
        }
        return undefined;
    }
}
exports.JobService = JobService;
