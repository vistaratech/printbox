import { PrintJob, PrintOptions, UploadedFileInfo, JobStatus } from '../types';
import { PricingService } from './pricingService';
import { MachineService } from './machineService';
import { SseService } from './sseService';
import { config } from '../config';

export class JobService {
  private static jobs: Map<string, PrintJob> = new Map();

  /**
   * Generate an easy-to-read unique 4-digit kiosk job code, e.g. "PB-4821"
   */
  public static generateJobCode(): string {
    let code = '';
    do {
      const num = Math.floor(1000 + Math.random() * 9000);
      code = `PB-${num}`;
    } while (this.jobs.has(code));
    return code;
  }

  /**
   * Create a new print job with verified server pricing
   */
  public static createJob(
    file: UploadedFileInfo,
    options: PrintOptions,
    machineId: string = config.defaultMachineId,
    paymentMethod: string = 'gpay'
  ): PrintJob {
    const jobCode = this.generateJobCode();
    const pricing = PricingService.calculate(options, file.detectedPages);

    const now = new Date().toISOString();
    const job: PrintJob = {
      jobCode,
      machineId,
      file,
      options,
      pricing,
      status: 'pending_payment',
      statusMessage: 'Awaiting payment confirmation',
      printedPages: 0,
      totalPhysicalPages: pricing.sheetsPerCopy * options.copies,
      paymentMethod,
      createdAt: now,
      updatedAt: now
    };

    this.jobs.set(jobCode, job);
    return job;
  }

  public static getJob(jobCode: string): PrintJob | undefined {
    return this.jobs.get(jobCode);
  }

  public static getAllJobs(): PrintJob[] {
    return Array.from(this.jobs.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  /**
   * Mark payment as received and queue for machine
   */
  public static markPaid(jobCode: string, paymentId?: string): PrintJob | undefined {
    const job = this.jobs.get(jobCode);
    if (!job) return undefined;

    job.status = 'payment_received';
    job.statusMessage = 'Payment received successfully';
    job.paymentId = paymentId || `DEMO-PAY-${Date.now()}`;
    job.updatedAt = new Date().toISOString();

    SseService.broadcastJobUpdate(job);
    return job;
  }

  /**
   * Update print job status and optional printed pages count
   */
  public static updateStatus(
    jobCode: string, 
    status: JobStatus, 
    statusMessage?: string,
    printedPages?: number
  ): PrintJob | undefined {
    const job = this.jobs.get(jobCode);
    if (!job) return undefined;

    job.status = status;
    if (statusMessage) job.statusMessage = statusMessage;
    if (printedPages !== undefined) job.printedPages = printedPages;
    job.updatedAt = new Date().toISOString();

    if (status === 'completed') {
      job.completedAt = job.updatedAt;
      job.printedPages = job.totalPhysicalPages;
      MachineService.deductPaper(job.machineId, job.pricing.totalPaperSheets);
    }

    SseService.broadcastJobUpdate(job);
    return job;
  }

  /**
   * Get next pending job for a given machine kiosk
   */
  public static getNextQueuedJob(machineId: string): PrintJob | undefined {
    for (const job of this.jobs.values()) {
      if (job.machineId === machineId && (job.status === 'payment_received' || job.status === 'queued')) {
        return job;
      }
    }
    return undefined;
  }
}
