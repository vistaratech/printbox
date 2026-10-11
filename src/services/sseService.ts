import { Response } from 'express';
import { PrintJob } from '../types';

export class SseService {
  private static clients: Map<string, Set<Response>> = new Map();

  public static addClient(jobCode: string, res: Response): void {
    if (!this.clients.has(jobCode)) {
      this.clients.set(jobCode, new Set());
    }

    this.clients.get(jobCode)!.add(res);

    // Clean up when client disconnects
    res.on('close', () => {
      const set = this.clients.get(jobCode);
      if (set) {
        set.delete(res);
        if (set.size === 0) {
          this.clients.delete(jobCode);
        }
      }
    });
  }

  public static broadcastJobUpdate(job: PrintJob): void {
    const clients = this.clients.get(job.jobCode);
    if (!clients || clients.size === 0) return;

    const data = JSON.stringify(job);
    for (const client of clients) {
      try {
        client.write(`data: ${data}\n\n`);
      } catch (err) {
        // Client might have terminated abruptly
      }
    }
  }
}
