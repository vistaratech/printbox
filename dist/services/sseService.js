"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SseService = void 0;
const MAX_SSE_PER_JOB = 5; // Max concurrent SSE connections per job
const MAX_SSE_GLOBAL = 200; // Max total SSE connections
const SSE_HEARTBEAT_MS = 15000; // Send heartbeat every 15s to keep connection alive
const SSE_TIMEOUT_MS = 10 * 60000; // Auto-close SSE after 10 minutes
class SseService {
    static clients = new Map();
    static globalCount = 0;
    static heartbeatTimers = new Map();
    static timeoutTimers = new Map();
    static getConnectionCount() {
        return this.globalCount;
    }
    static cleanup(jobCode, res) {
        const set = this.clients.get(jobCode);
        if (set) {
            set.delete(res);
            if (set.size === 0)
                this.clients.delete(jobCode);
        }
        this.globalCount = Math.max(0, this.globalCount - 1);
        // Clear timers
        const hb = this.heartbeatTimers.get(res);
        if (hb) {
            clearInterval(hb);
            this.heartbeatTimers.delete(res);
        }
        const to = this.timeoutTimers.get(res);
        if (to) {
            clearTimeout(to);
            this.timeoutTimers.delete(res);
        }
    }
    static addClient(jobCode, res) {
        // Global SSE limit
        if (this.globalCount >= MAX_SSE_GLOBAL) {
            return false;
        }
        // Per-job SSE limit
        const existing = this.clients.get(jobCode);
        if (existing && existing.size >= MAX_SSE_PER_JOB) {
            return false;
        }
        if (!this.clients.has(jobCode)) {
            this.clients.set(jobCode, new Set());
        }
        this.clients.get(jobCode).add(res);
        this.globalCount++;
        // Cleanup when client disconnects
        res.on('close', () => this.cleanup(jobCode, res));
        // Periodic heartbeat to keep proxies/load-balancers from closing idle SSE
        const heartbeat = setInterval(() => {
            try {
                res.write(`:heartbeat\n\n`);
            }
            catch {
                this.cleanup(jobCode, res);
            }
        }, SSE_HEARTBEAT_MS);
        this.heartbeatTimers.set(res, heartbeat);
        // Auto-close stale SSE connections after timeout
        const timeout = setTimeout(() => {
            try {
                res.write(`data: ${JSON.stringify({ type: 'timeout', message: 'Connection timed out' })}\n\n`);
                res.end();
            }
            catch { /* already closed */ }
            this.cleanup(jobCode, res);
        }, SSE_TIMEOUT_MS);
        this.timeoutTimers.set(res, timeout);
        return true;
    }
    static broadcastJobUpdate(job) {
        const clients = this.clients.get(job.jobCode);
        if (!clients || clients.size === 0)
            return;
        const data = JSON.stringify(job);
        for (const client of clients) {
            try {
                client.write(`data: ${data}\n\n`);
            }
            catch {
                // Client terminated abruptly, cleanup will handle via 'close' event
            }
        }
        // Auto-close all SSE connections for completed/failed jobs
        if (job.status === 'completed' || job.status === 'failed') {
            setTimeout(() => {
                const remaining = this.clients.get(job.jobCode);
                if (!remaining)
                    return;
                for (const client of remaining) {
                    try {
                        client.end();
                    }
                    catch { /* ignore */ }
                    this.cleanup(job.jobCode, client);
                }
            }, 2000); // Give client 2s to receive final event
        }
    }
}
exports.SseService = SseService;
