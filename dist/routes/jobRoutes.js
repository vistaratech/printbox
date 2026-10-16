"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const path_1 = __importDefault(require("path"));
const jobService_1 = require("../services/jobService");
const sseService_1 = require("../services/sseService");
const config_1 = require("../config");
const fs_1 = __importDefault(require("fs"));
const paymentService_1 = require("../services/paymentService");
const pdfProcessorService_1 = require("../services/pdfProcessorService");
const router = (0, express_1.Router)();
/**
 * POST /api/jobs
 * Create a new print job (validation is done inside JobService.createJob)
 */
router.post('/', async (req, res) => {
    try {
        const { file, files, options, machineId, paymentMethod } = req.body;
        if ((!file || !file.fileName) && (!Array.isArray(files) || files.length === 0)) {
            return res.status(400).json({ error: 'File information is required' });
        }
        if (!options) {
            return res.status(400).json({ error: 'Print options are required' });
        }
        let fileInfo;
        // Check if multiple files were provided -> Merge them into a unified PDF
        if (Array.isArray(files) && files.length > 1) {
            const filePaths = files.map((f) => f.filePath || (f.fileName ? path_1.default.join(config_1.config.uploadDir, path_1.default.basename(f.fileName)) : ''));
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e4);
            const mergedFileName = `merged_${uniqueSuffix}.pdf`;
            const mergedFilePath = path_1.default.join(config_1.config.uploadDir, mergedFileName);
            const mergedPages = await pdfProcessorService_1.PdfProcessorService.mergeDocuments(filePaths, mergedFilePath);
            let mergedSize = 0;
            try {
                mergedSize = fs_1.default.statSync(mergedFilePath).size;
            }
            catch (_) { }
            fileInfo = {
                id: `merged-${uniqueSuffix}`,
                originalName: `${files.length} Documents Combined (${files.map((f) => f.originalName || 'file').slice(0, 3).join(', ')}${files.length > 3 ? '…' : ''})`,
                fileName: mergedFileName,
                filePath: mergedFilePath,
                fileSize: mergedSize,
                mimeType: 'application/pdf',
                detectedPages: Math.min(500, Math.max(1, mergedPages)),
                createdAt: new Date().toISOString()
            };
        }
        else {
            const primaryFile = (Array.isArray(files) && files.length === 1) ? files[0] : file;
            const resolvedFilePath = primaryFile.filePath || (primaryFile.fileName ? path_1.default.join(config_1.config.uploadDir, path_1.default.basename(primaryFile.fileName)) : '');
            fileInfo = {
                id: primaryFile.id || 'unknown',
                originalName: String(primaryFile.originalName || 'document').slice(0, 255),
                fileName: String(primaryFile.fileName).slice(0, 255),
                filePath: resolvedFilePath,
                fileSize: Math.max(0, Number(primaryFile.fileSize) || 0),
                mimeType: String(primaryFile.mimeType || 'application/octet-stream').slice(0, 100),
                detectedPages: Math.min(500, Math.max(1, Math.floor(Number(primaryFile.detectedPages) || 1))),
                createdAt: primaryFile.createdAt || new Date().toISOString()
            };
        }
        const targetMachineId = String(machineId || config_1.config.defaultMachineId).slice(0, 20);
        const targetPaymentMethod = String(paymentMethod || 'gpay').slice(0, 20);
        const job = jobService_1.JobService.createJob(fileInfo, options, targetMachineId, targetPaymentMethod);
        return res.status(201).json({
            success: true,
            job
        });
    }
    catch (err) {
        return res.status(500).json({ error: err.message || 'Failed to create print job' });
    }
});
/**
 * GET /api/jobs/:jobCode
 * Fetch single job details (auto-syncs with Razorpay if pending payment)
 */
router.get('/:jobCode', async (req, res) => {
    const jobCode = String(req.params.jobCode).toUpperCase().slice(0, 20);
    let job = jobService_1.JobService.getJob(jobCode);
    if (!job) {
        return res.status(404).json({ error: 'Job not found' });
    }
    // If pending payment, verify with Razorpay in background in case mobile GPay completed
    if (job.status === 'pending_payment') {
        const synced = await paymentService_1.PaymentService.syncPaymentWithRazorpay(jobCode);
        if (synced)
            job = synced;
    }
    return res.json({ success: true, job });
});
/**
 * GET /api/jobs/:jobCode/stream
 * Server-Sent Events (SSE) live stream for job updates
 */
router.get('/:jobCode/stream', (req, res) => {
    const jobCode = String(req.params.jobCode).toUpperCase().slice(0, 20);
    const job = jobService_1.JobService.getJob(jobCode);
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
    const added = sseService_1.SseService.addClient(jobCode, res);
    if (!added) {
        res.write(`data: ${JSON.stringify({ type: 'error', message: 'Too many connections. Try again.' })}\n\n`);
        res.end();
    }
});
/**
 * GET /api/jobs
 * List jobs with pagination
 */
router.get('/', (req, res) => {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const jobs = jobService_1.JobService.getAllJobs(limit, offset);
    return res.json({
        success: true,
        total: jobService_1.JobService.getJobCount(),
        limit,
        offset,
        jobs
    });
});
exports.default = router;
