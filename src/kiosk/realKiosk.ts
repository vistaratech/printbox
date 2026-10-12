import path from 'path';
import fs from 'fs';
import { config } from '../config';
const ptp = require('pdf-to-printer');
import { execSync } from 'child_process';

/**
 * Find the best physical printer by checking the Windows port type.
 * WSD ports render documents properly; raw TCP ports send binary garbage.
 */
async function findBestPhysicalPrinter(): Promise<string | undefined> {
  try {
    const available = await ptp.getPrinters();
    const physicalPrinters = available.filter((p: any) => {
      const n = (p.name || '').toLowerCase();
      return !n.includes('pdf') && !n.includes('onenote') && !n.includes('xps') && !n.includes('fax');
    });
    if (physicalPrinters.length === 0) return undefined;

    // Try to pick a WSD printer (renders properly) over a raw TCP printer
    try {
      const psOutput = execSync(
        'powershell -NoProfile -Command "Get-Printer | Select-Object Name, PortName | ConvertTo-Json"',
        { encoding: 'utf-8', timeout: 5000 }
      );
      const winPrinters: any[] = JSON.parse(psOutput);
      // Prefer WSD port printers (they render through Windows print pipeline)
      const wsdPrinter = physicalPrinters.find((p: any) => {
        const wp = winPrinters.find((w: any) => w.Name === p.name);
        return wp && (wp.PortName || '').startsWith('WSD-');
      });
      if (wsdPrinter) return wsdPrinter.name;
    } catch (_) {}

    // Fallback: return first physical printer found
    return physicalPrinters[0].name;
  } catch (_) {
    return undefined;
  }
}

const API_BASE = process.env.API_URL || `http://localhost:${config.port}/api`;
const MACHINE_ID = process.env.MACHINE_ID || config.defaultMachineId;

// Target printer name (leave empty to automatically auto-detect physical printer or use default)
let TARGET_PRINTER = process.env.PRINTER_NAME || undefined;

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
      monochrome: job.options.color === 'bw',
      scale: 'fit'
    };

    if (job.options.orient === 'landscape' || job.options.orient === 'portrait') {
      printOptions.orientation = job.options.orient;
    }

    // Auto-detect physical printer if not explicitly defined
    if (!TARGET_PRINTER) {
      const best = await findBestPhysicalPrinter();
      if (best) {
        TARGET_PRINTER = best;
        console.log(`🎯 Dynamically selected physical printer: "${TARGET_PRINTER}"`);
      }
    }

    if (TARGET_PRINTER) {
      printOptions.printer = TARGET_PRINTER;
      console.log(`🖨️  Sending to printer: "${TARGET_PRINTER}"`);
    } else {
      console.warn(`⚠️  No physical printer found. Falling back to Windows default (may be Print to PDF).`);
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

    if (!TARGET_PRINTER) {
      const best = await findBestPhysicalPrinter();
      if (best) {
        TARGET_PRINTER = best;
        console.log(`🎯 Auto-selected physical printer: "${TARGET_PRINTER}"`);
      } else {
        console.warn('⚠️  ATTENTION: No physical printer driver detected in Windows!');
        console.warn(`   Currently printing to virtual printer: "${def?.name || 'None'}".`);
        console.warn('👉 To print real paper: Open Windows Settings -> "Bluetooth & devices" -> "Printers & scanners" -> "Add device"');
      }
    } else {
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
