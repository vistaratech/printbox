"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EpsonCloudService = exports.EpsonPrintService = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
const config_1 = require("../../config");
class EpsonPrintService {
    static transporter = null;
    static getTransporter() {
        if (!config_1.config.epson.enabled)
            return null;
        if (!this.transporter) {
            this.transporter = nodemailer_1.default.createTransport({
                host: config_1.config.epson.smtpHost,
                port: config_1.config.epson.smtpPort,
                secure: config_1.config.epson.smtpSecure,
                auth: {
                    user: config_1.config.epson.smtpUser,
                    pass: config_1.config.epson.smtpPass
                }
            });
        }
        return this.transporter;
    }
    /**
     * Check if Epson Connect cloud printing is configured and ready
     */
    static isConfigured() {
        return Boolean(config_1.config.epson.printerEmail && config_1.config.epson.smtpUser && config_1.config.epson.smtpPass);
    }
    /**
     * Dispatches the print-ready PDF to the Epson printer via Epson Connect Email Print
     */
    static async sendPrintJob(job, pdfPath) {
        if (!this.isConfigured()) {
            console.log(`[EpsonPrintService] ℹ️ Epson Connect not configured yet (EPSON_PRINTER_EMAIL/SMTP missing in .env).\n` +
                `                    Simulating print dispatch for Job #${job.jobCode}.`);
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
            console.log(`[EpsonPrintService] 🚀 Dispatching Job #${job.jobCode} to Epson Printer (${config_1.config.epson.printerEmail})…`);
            const mailOptions = {
                from: `"PrintBox Kiosk" <${config_1.config.epson.smtpUser}>`,
                to: config_1.config.epson.printerEmail,
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
        }
        catch (err) {
            console.error(`[EpsonPrintService] ❌ Failed to dispatch job #${job.jobCode} to Epson Connect:`, err?.message || err);
            return {
                success: false,
                mode: 'epson_connect',
                error: err?.message || 'Failed to send email to printer'
            };
        }
    }
}
exports.EpsonPrintService = EpsonPrintService;
exports.EpsonCloudService = EpsonPrintService;
