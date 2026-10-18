"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JobService = void 0;
const pricingService_1 = require("./pricingService");
const sseService_1 = require("./sseService");
const config_1 = require("../config");
const databaseService_1 = require("./databaseService");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const MAX_JOBS = 5000;
const JOB_TTL_MS = 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
class JobService {
    static activeSimulations = new Map();
    static cleanupTimer = null;
    static startCleanupScheduler() {
        if (this.cleanupTimer)
            return;
        this.cleanupTimer = setInterval(() => this.purgeStaleJobs(), CLEANUP_INTERVAL_MS);
        console.log('[JobService] Cleanup scheduler started (every 5 min)');
    }
    static stopCleanupScheduler() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
    }
    static clearAllSimulations() {
        for (const [, timers] of this.activeSimulations) {
            for (const t of timers)
                clearTimeout(t);
        }
        this.activeSimulations.clear();
    }
    static purgeStaleJobs() {
        const now = Date.now();
        const jobs = (0, databaseService_1.loadAllJobs)(MAX_JOBS, 0);
        let purged = 0;
        for (const job of jobs) {
            if (job.status === 'completed' || job.status === 'failed') {
                const updatedAt = new Date(job.updatedAt).getTime();
                if (now - updatedAt > JOB_TTL_MS) {
                    if (job.file.filePath) {
                        try {
                            fs_1.default.unlinkSync(job.file.filePath);
                        }
                        catch { /* */ }
                    }
                    purged++;
                }
            }
        }
        if (purged > 0)
            console.log(`[JobService] Purged ${purged} stale jobs from DB.`);
    }
    static generateJobCode() {
        let code = '';
        let attempts = 0;
        do {
            code = `PB-${Math.floor(1000 + Math.random() * 9000)}`;
            attempts++;
            if (attempts > 100) {
                code = `PB-${Date.now().toString(36).slice(-5).toUpperCase()}`;
                break;
            }
        } while ((0, databaseService_1.loadJob)(code));
        return code;
    }
    static createJob(file, options, machineId = config_1.config.defaultMachineId, paymentMethod = 'gpay') {
        const safePages = Math.min(500, Math.max(1, Math.floor(Number(file.detectedPages) || 1)));
        file.detectedPages = safePages;
        let rangeMode = options.range === 'custom' ? 'custom' : 'all';
        let rangeString = typeof options.rangeText === 'string' ? options.rangeText.slice(0, 200).trim() : undefined;
        // If pageList is provided, derive effective rangeText from non-deleted pages
        const rawPageList = Array.isArray(options.pageList) ? options.pageList : undefined;
        if (rawPageList && rawPageList.length > 0) {
            const activePages = rawPageList.filter((p) => !p.d).map((p) => p.i);
            if (activePages.length > 0 && activePages.length < rawPageList.length) {
                rangeMode = 'custom';
                rangeString = activePages.join(',');
            }
        }
        else if (safePages < (file.detectedPages || safePages) && rangeMode === 'all') {
            rangeMode = 'custom';
            rangeString = `1-${safePages}`;
        }
        const safeOptions = {
            color: ['bw', 'color'].includes(options.color) ? options.color : 'bw',
            sides: ['single', 'double'].includes(options.sides) ? options.sides : 'single',
            size: ['A4', 'A3', 'A5', 'Legal'].includes(options.size) ? options.size : 'A4',
            orient: ['portrait', 'landscape'].includes(options.orient) ? options.orient : 'portrait',
            pps: [1, 2, 4, 6].includes(options.pps) ? options.pps : 1,
            quality: ['draft', 'normal', 'high'].includes(options.quality) ? options.quality : 'normal',
            copies: Math.min(99, Math.max(1, Math.floor(Number(options.copies) || 1))),
            range: rangeMode,
            rangeText: rangeString,
            staple: Boolean(options.staple),
            collate: options.collate !== false,
            pageList: rawPageList
        };
        const jobCode = this.generateJobCode();
        const pricing = pricingService_1.PricingService.calculate(safeOptions, safePages);
        const now = new Date().toISOString();
        const job = {
            jobCode, machineId, file, options: safeOptions, pricing,
            status: 'pending_payment', statusMessage: 'Awaiting payment confirmation',
            printedPages: 0, totalPhysicalPages: pricing.sheetsPerCopy * safeOptions.copies,
            paymentMethod, createdAt: now, updatedAt: now
        };
        (0, databaseService_1.saveJob)(job);
        return job;
    }
    static getJob(jobCode) { return (0, databaseService_1.loadJob)(jobCode.toUpperCase()); }
    static getJobCount() { return (0, databaseService_1.getJobCount)(); }
    static getAllJobs(limit = 50, offset = 0) { return (0, databaseService_1.loadAllJobs)(limit, offset); }
    static getNextQueuedJob(machineId) {
        const jobs = (0, databaseService_1.loadAllJobs)(100, 0);
        const exact = jobs.find(j => j.machineId === machineId && (j.status === 'payment_received' || j.status === 'queued'));
        if (exact)
            return exact;
        return jobs.find(j => (j.machineId === 'M-01' || !j.machineId) && (j.status === 'payment_received' || j.status === 'queued'));
    }
    static markPaid(jobCode, paymentId) {
        const job = (0, databaseService_1.loadJob)(jobCode.toUpperCase());
        if (!job)
            return undefined;
        if (job.status !== 'pending_payment')
            return job;
        job.status = 'payment_received';
        job.statusMessage = 'Payment received successfully';
        job.paymentId = paymentId || `PAY-${Date.now()}`;
        job.updatedAt = new Date().toISOString();
        (0, databaseService_1.saveJob)(job);
        sseService_1.SseService.broadcastJobUpdate(job);
        return job;
    }
    static updateStatus(jobCode, status, statusMessage, printedPages) {
        const updated = (0, databaseService_1.updateJobStatus)(jobCode.toUpperCase(), status, statusMessage, printedPages);
        if (updated)
            sseService_1.SseService.broadcastJobUpdate(updated);
        return updated;
    }
    static trackSimulationTimer(jobCode, timer) {
        if (!this.activeSimulations.has(jobCode))
            this.activeSimulations.set(jobCode, []);
        this.activeSimulations.get(jobCode).push(timer);
    }
    static createTestPrintJob(machineId = config_1.config.defaultMachineId) {
        const sampleFileName = 'test_slip.pdf';
        const sampleFilePath = path_1.default.join(config_1.config.uploadDir, sampleFileName);
        if (!fs_1.default.existsSync(sampleFilePath)) {
            try {
                const files = fs_1.default.readdirSync(config_1.config.uploadDir);
                const existingPdf = files.find(f => f.endsWith('.pdf'));
                if (existingPdf) {
                    fs_1.default.copyFileSync(path_1.default.join(config_1.config.uploadDir, existingPdf), sampleFilePath);
                }
                else {
                    const minimalPdf = `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<<>>>>endobj\n4 0 obj<</Length 55>>stream\nBT /F1 18 Tf 50 750 Td (PrintBox Test Slip - Epson L3250 Ready) Tj ET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000216 00000 n \ntrailer<</Size 5/Root 1 0 R>>\nstartxref\n322\n%%EOF`;
                    fs_1.default.writeFileSync(sampleFilePath, minimalPdf);
                }
            }
            catch (_) { }
        }
        const file = {
            id: 'test-print',
            originalName: 'PrintBox_Test_Slip.pdf',
            fileName: sampleFileName,
            filePath: sampleFilePath,
            fileSize: 72064,
            mimeType: 'application/pdf',
            detectedPages: 1,
            createdAt: new Date().toISOString()
        };
        const options = {
            color: 'bw',
            sides: 'single',
            size: 'A4',
            orient: 'portrait',
            pps: 1,
            quality: 'normal',
            copies: 1,
            range: 'custom',
            rangeText: '1',
            staple: false,
            collate: true
        };
        const job = this.createJob(file, options, machineId, 'test');
        this.updateStatus(job.jobCode, 'payment_received', 'Test print queued for Epson L3250');
        return job;
    }
}
exports.JobService = JobService;
