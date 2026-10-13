import { PrintJob, PrintOptions, UploadedFileInfo, JobStatus } from '../types';
import { PricingService } from './pricingService';
import { MachineService } from './machineService';
import { SseService } from './sseService';
import { config } from '../config';
import { saveJob, loadJob, loadAllJobs, updateJobStatus as dbUpdateStatus, getJobCount } from './databaseService';
import fs from 'fs';

const MAX_JOBS = 5000;
const JOB_TTL_MS = 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

export class JobService {
  private static activeSimulations: Map<string, NodeJS.Timeout[]> = new Map();
  private static cleanupTimer: NodeJS.Timeout | null = null;

  public static startCleanupScheduler(): void {
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => this.purgeStaleJobs(), CLEANUP_INTERVAL_MS);
    console.log('[JobService] Cleanup scheduler started (every 5 min)');
  }

  public static stopCleanupScheduler(): void {
    if (this.cleanupTimer) { clearInterval(this.cleanupTimer); this.cleanupTimer = null; }
  }

  public static clearAllSimulations(): void {
    for (const [, timers] of this.activeSimulations) { for (const t of timers) clearTimeout(t); }
    this.activeSimulations.clear();
  }

  private static purgeStaleJobs(): void {
    const now = Date.now();
    const jobs = loadAllJobs(MAX_JOBS, 0);
    let purged = 0;
    for (const job of jobs) {
      if (job.status === 'completed' || job.status === 'failed') {
        const updatedAt = new Date(job.updatedAt).getTime();
        if (now - updatedAt > JOB_TTL_MS) {
          if (job.file.filePath) { try { fs.unlinkSync(job.file.filePath); } catch { /* */ } }
          purged++;
        }
      }
    }
    if (purged > 0) console.log(`[JobService] Purged ${purged} stale jobs from DB.`);
  }

  public static generateJobCode(): string {
    let code = '';
    let attempts = 0;
    do {
      code = `PB-${Math.floor(1000 + Math.random() * 9000)}`;
      attempts++;
      if (attempts > 100) { code = `PB-${Date.now().toString(36).slice(-5).toUpperCase()}`; break; }
    } while (loadJob(code));
    return code;
  }

  public static createJob(file: UploadedFileInfo, options: PrintOptions, machineId: string = config.defaultMachineId, paymentMethod: string = 'gpay'): PrintJob {
    const safePages = Math.min(500, Math.max(1, Math.floor(Number(file.detectedPages) || 1)));
    file.detectedPages = safePages;

    let rangeMode = options.range === 'custom' ? 'custom' : 'all';
    let rangeString = typeof options.rangeText === 'string' ? options.rangeText.slice(0, 200).trim() : undefined;

    // If pageList is provided, derive effective rangeText from non-deleted pages
    const rawPageList = Array.isArray(options.pageList) ? options.pageList : undefined;
    if (rawPageList && rawPageList.length > 0) {
      const activePages = rawPageList.filter((p: any) => !p.d).map((p: any) => p.i);
      if (activePages.length > 0 && activePages.length < rawPageList.length) {
        rangeMode = 'custom';
        rangeString = activePages.join(',');
      }
    } else if (safePages < (file.detectedPages || safePages) && rangeMode === 'all') {
      rangeMode = 'custom';
      rangeString = `1-${safePages}`;
    }

    const safeOptions: PrintOptions = {
      color: (['bw', 'color'] as const).includes(options.color) ? options.color : 'bw',
      sides: (['single', 'double'] as const).includes(options.sides) ? options.sides : 'single',
      size: (['A4', 'A3', 'A5', 'Legal'] as const).includes(options.size) ? options.size : 'A4',
      orient: (['portrait', 'landscape'] as const).includes(options.orient) ? options.orient : 'portrait',
      pps: ([1, 2, 4, 6] as const).includes(options.pps as any) ? options.pps : 1,
      quality: (['draft', 'normal', 'high'] as const).includes(options.quality) ? options.quality : 'normal',
      copies: Math.min(99, Math.max(1, Math.floor(Number(options.copies) || 1))),
      range: rangeMode as 'all' | 'custom',
      rangeText: rangeString,
      staple: Boolean(options.staple),
      collate: options.collate !== false,
      pageList: rawPageList
    };
    const jobCode = this.generateJobCode();
    const pricing = PricingService.calculate(safeOptions, safePages);
    const now = new Date().toISOString();
    const job: PrintJob = {
      jobCode, machineId, file, options: safeOptions, pricing,
      status: 'pending_payment', statusMessage: 'Awaiting payment confirmation',
      printedPages: 0, totalPhysicalPages: pricing.sheetsPerCopy * safeOptions.copies,
      paymentMethod, createdAt: now, updatedAt: now
    };
    saveJob(job);
    return job;
  }

  public static getJob(jobCode: string): PrintJob | undefined { return loadJob(jobCode.toUpperCase()); }
  public static getJobCount(): number { return getJobCount(); }
  public static getAllJobs(limit: number = 50, offset: number = 0): PrintJob[] { return loadAllJobs(limit, offset); }

  public static getNextQueuedJob(machineId: string): PrintJob | undefined {
    const jobs = loadAllJobs(100, 0);
    return jobs.find(j => j.machineId === machineId && (j.status === 'payment_received' || j.status === 'queued'));
  }

  public static markPaid(jobCode: string, paymentId?: string): PrintJob | undefined {
    const job = loadJob(jobCode.toUpperCase());
    if (!job) return undefined;
    if (job.status !== 'pending_payment') return job;
    job.status = 'payment_received';
    job.statusMessage = 'Payment received successfully';
    job.paymentId = paymentId || `PAY-${Date.now()}`;
    job.updatedAt = new Date().toISOString();
    saveJob(job);
    SseService.broadcastJobUpdate(job);
    return job;
  }

  public static updateStatus(jobCode: string, status: JobStatus, statusMessage?: string, printedPages?: number): PrintJob | undefined {
    const updated = dbUpdateStatus(jobCode.toUpperCase(), status, statusMessage, printedPages);
    if (updated) SseService.broadcastJobUpdate(updated);
    return updated;
  }

  public static trackSimulationTimer(jobCode: string, timer: NodeJS.Timeout): void {
    if (!this.activeSimulations.has(jobCode)) this.activeSimulations.set(jobCode, []);
    this.activeSimulations.get(jobCode)!.push(timer);
  }
}
