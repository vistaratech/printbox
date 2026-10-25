import path from 'path';
import nodemailer from 'nodemailer';
import { PrintJob } from '../../types';
import { config } from '../../config';

export interface PrintDispatchResult {
  success: boolean;
  mode: 'epson_connect' | 'simulated';
  messageId?: string;
  error?: string;
}

export class EpsonPrintService {
  private static transporter: any = null;

  private static getTransporter(): any {
    if (!config.epson.enabled) return null;

    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host: config.epson.smtpHost,
        port: config.epson.smtpPort,
        secure: config.epson.smtpSecure,
        auth: {
          user: config.epson.smtpUser,
          pass: config.epson.smtpPass
        }
      });
    }

    return this.transporter;
  }

  /**
   * Check if Epson Connect cloud printing is configured and ready
   */
  public static isConfigured(): boolean {
    return Boolean(config.epson.printerEmail && config.epson.smtpUser && config.epson.smtpPass);
  }

  /**
   * Dispatches the print-ready PDF to the Epson printer via Epson Connect Email Print
   */
  public static async sendPrintJob(job: PrintJob, pdfPath: string): Promise<PrintDispatchResult> {
    if (!this.isConfigured()) {
      console.log(
        `[EpsonPrintService] ℹ️ Epson Connect not configured yet (EPSON_PRINTER_EMAIL/SMTP missing in .env).\n` +
        `                    Simulating print dispatch for Job #${job.jobCode}.`
      );
      return {
        success: true,
        mode: 'simulated',
        error: 'Epson Connect credentials not set in .env'
      };
    }

    const transporter = this.getTransporter();
    if (!transporter) {
      return { success: false, mode: 'simulated', error: 'Failed to initialize email transporter' };
    }

    try {
      const cleanFileName = (job.file.originalName || 'document.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');
      const attachmentName = cleanFileName.endsWith('.pdf') ? cleanFileName : `${cleanFileName}.pdf`;

      console.log(`[EpsonPrintService] 🚀 Dispatching Job #${job.jobCode} to Epson Printer (${config.epson.printerEmail})…`);

      const mailOptions: any = {
        from: `"PrintBox Kiosk" <${config.epson.smtpUser}>`,
        to: config.epson.printerEmail,
        subject: `PrintJob #${job.jobCode}`,
        text: `PrintBox automated print job for code: ${job.jobCode}`, // Minimal body; Epson email-print prints attachment
        attachments: [
          {
            filename: attachmentName,
            path: pdfPath
          }
        ]
      };

      const info = await transporter.sendMail(mailOptions);
      console.log(`[EpsonPrintService] ✅ Print job sent to Epson Cloud! Message ID: ${info.messageId}`);

      return {
        success: true,
        mode: 'epson_connect',
        messageId: info.messageId
      };
    } catch (err: any) {
      console.error(`[EpsonPrintService] ❌ Failed to dispatch job #${job.jobCode} to Epson Connect:`, err?.message || err);
      return {
        success: false,
        mode: 'epson_connect',
        error: err?.message || 'Failed to send email to printer'
      };
    }
  }
}

export { EpsonPrintService as EpsonCloudService };

