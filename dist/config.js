"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.config = {
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    uploadDir: path_1.default.resolve(process.cwd(), process.env.UPLOAD_DIR || 'uploads'),
    maxFileSizeMb: parseInt(process.env.MAX_FILE_SIZE_MB || '50', 10),
    defaultMachineId: process.env.DEFAULT_MACHINE_ID || 'M-01',
    defaultMachineLocation: process.env.DEFAULT_MACHINE_LOCATION || 'Library Block',
    pricing: {
        baseRateBw: 1.0, // Rs 1 per page
        baseRateColor: 5.0, // Rs 5 per page
        sizeMultipliers: {
            A4: 1.0,
            A3: 2.0,
            A5: 0.8,
            Legal: 1.2
        },
        doubleSideDiscountMultiplier: 0.9, // 10% discount on double sided printing
        highQualityExtra: 0.5, // Rs 0.50 extra per page
        stapleRatePerCopy: 2.0 // Rs 2 per copy for stapling
    },
    epson: {
        printerEmail: process.env.EPSON_PRINTER_EMAIL || '',
        senderEmail: process.env.SMTP_USER || '',
        smtpUser: process.env.SMTP_USER || '',
        smtpPass: process.env.SMTP_PASS || '',
        smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
        smtpPort: parseInt(process.env.SMTP_PORT || '465', 10),
        smtpSecure: process.env.SMTP_SECURE !== 'false',
        enabled: Boolean(process.env.EPSON_PRINTER_EMAIL && process.env.SMTP_USER && process.env.SMTP_PASS)
    }
};
