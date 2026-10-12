import path from 'path';
import fs from 'fs';
import { config } from '../config';
const ptp = require('pdf-to-printer');

const API_BASE = process.env.API_URL || `http://localhost:${config.port}/api`;
const MACHINE_ID = process.env.MACHINE_ID || config.defaultMachineId;

// Target printer name (leave empty to automatically use Windows default printer)
const TARGET_PRINTER = process.env.PRINTER_NAME || undefined;

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendHeartbeat(paperCount: number = 420) {
  try {
    await fetch(`${API_BASE}/kiosk/${MACHINE_ID}/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paperRemaining: paperCount,
        tonerLevelPercent: 90
      })
    });
  } catch (err) {
    // API server might be starting up
  }
}

async function pollJobs() {
  try {
    const res = await fetch(`${API_BASE}/kiosk/${MACHINE_ID}/poll`);
    if (!res.ok) return;

    const data: any = await res.json();
    if (data.hasJob && data.job) {
      await processJob(data.job);
    }
  } catch (err) {
    // Server not ready yet
  }
}

async function downloadRemoteFile(fileUrl: string, destPath: string): Promise<boolean> {
  try {
    const response = await fetch(fileUrl);
    if (!response.ok) return false;
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const dir = path.dirname(destPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(destPath, buffer);
    return true;
  } catch (err) {
    console.error(`Failed to download remote file from ${fileUrl}:`, err);
    return false;
  }
}

async function processJob(job: any) {
  console.log(`\n======================================================`);
  console.log(`🖨️  [Real Hardware Agent] Processing Job: ${job.jobCode}`);
  console.log(`📄 File: ${job.file.originalName}`);
  console.log(`⚙️  Options: ${job.options.color.toUpperCase()} | ${job.options.sides} | ${job.options.size} | ${job.options.copies} copy(ies)`);
  console.log(`📑 Total Sheets: ${job.totalPhysicalPages}`);
  console.log(`======================================================\n`);

  // Locate or download the uploaded file to disk
  let filePath = job.file.filePath;
  if (!filePath || !fs.existsSync(filePath)) {
    filePath = path.resolve(process.cwd(), config.uploadDir, job.file.fileName);
  }

  // If running against remote HTTPS server, download the file locally
  if (!fs.existsSync(filePath)) {
    const serverOrigin = API_BASE.replace(/\/api\/?$/, '');
    const remoteDownloadUrl = `${serverOrigin}/uploads/${job.file.fileName}`;
    console.log(`📥 Downloading file from HTTPS server: ${remoteDownloadUrl}...`);
    const success = await downloadRemoteFile(remoteDownloadUrl, filePath);
    if (!success) {
      console.error(`❌ Could not retrieve file from remote server.`);
      await fetch(`${API_BASE}/kiosk/${MACHINE_ID}/jobs/${job.jobCode}/fail`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Failed to download file from HTTPS server' })
      });
      return;
    }
    console.log(`✅ File downloaded successfully to local machine.`);
  }

  try {
    // Report starting status
    await fetch(`${API_BASE}/kiosk/${MACHINE_ID}/jobs/${job.jobCode}/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        printedPages: 1,
        statusMessage: 'Sending document to physical printer...'
      })
    });

    console.log(`🚀 Sending "${path.basename(filePath)}" to printer...`);

    // Prepare printer options
    const printOptions: any = {
      copies: job.options.copies || 1,
      paperSize: job.options.size || 'A4',
      monochrome: job.options.color === 'bw'
    };

    if (TARGET_PRINTER) {
      printOptions.printer = TARGET_PRINTER;
    }

    if (job.options.sides === 'double') {
      printOptions.side = 'duplex';
    }

    if (job.options.range === 'custom' && job.options.rangeText) {
      printOptions.pages = job.options.rangeText;
    }

    console.log('Printer Options:', printOptions);

    // Send to physical printer via pdf-to-printer (headless Windows print)
    await ptp.print(filePath, printOptions);

    console.log(`✅ Print command dispatched successfully to printer!`);

    // Complete the job
    await fetch(`${API_BASE}/kiosk/${MACHINE_ID}/jobs/${job.jobCode}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    console.log(`🎉 Job ${job.jobCode} marked completed in queue!\n`);
  } catch (err: any) {
    console.error(`❌ Print execution failed:`, err.message || err);
    await fetch(`${API_BASE}/kiosk/${MACHINE_ID}/jobs/${job.jobCode}/fail`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: err.message || 'Printer hardware error' })
    });
  }
}

async function main() {
  console.log('====================================================');
  console.log(`🤖 PrintBox Real Kiosk Agent starting for Machine: ${MACHINE_ID}`);
  console.log(`📡 Connecting to API: ${API_BASE}`);

  try {
    const printers = await ptp.getPrinters();
    console.log('🖨️  Detected Windows Printers:');
    printers.forEach((p: any) => console.log(`   - ${p.name}`));
    const def = await ptp.getDefaultPrinter();
    console.log(`⭐ Active Default Printer: ${def?.name || 'None'}`);
    if (TARGET_PRINTER) {
      console.log(`🎯 Explicit Target Printer: ${TARGET_PRINTER}`);
    }
  } catch (e) {
    console.warn('⚠️  Could not enumerate printers:', e);
  }

  console.log('====================================================\n');

  // Initial heartbeat
  await sendHeartbeat();
  setInterval(() => sendHeartbeat(), 30000);

  // Continuous job polling
  while (true) {
    await pollJobs();
    await sleep(2000);
  }
}

main().catch(console.error);
