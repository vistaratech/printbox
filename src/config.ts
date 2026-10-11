import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  uploadDir: path.resolve(process.cwd(), process.env.UPLOAD_DIR || 'uploads'),
  maxFileSizeMb: parseInt(process.env.MAX_FILE_SIZE_MB || '50', 10),
  defaultMachineId: process.env.DEFAULT_MACHINE_ID || 'M-01',
  defaultMachineLocation: process.env.DEFAULT_MACHINE_LOCATION || 'Library Block',
  enableDemoPayment: process.env.ENABLE_DEMO_PAYMENT !== 'false',
  pricing: {
    baseRateBw: 1.0, // Rs 1 per page
    baseRateColor: 5.0, // Rs 5 per page
    sizeMultipliers: {
      A4: 1.0,
      A3: 2.0,
      Legal: 1.2
    },
    doubleSideDiscountMultiplier: 0.9, // 10% discount on double sided printing
    highQualityExtra: 0.5, // Rs 0.50 extra per page
    stapleRatePerCopy: 2.0 // Rs 2 per copy for stapling
  }
};
