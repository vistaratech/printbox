import { config } from '../../config';

const API_BASE = `http://localhost:${config.port}/api`;
const MACHINE_ID = config.defaultMachineId;

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendHeartbeat() {
  try {
    await fetch(`${API_BASE}/kiosk/${MACHINE_ID}/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paperRemaining: 420,
        tonerLevelPercent: 92
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

async function processJob(job: any) {
  console.log(`\n======================================================`);
  console.log(`🖨️  [Mock Kiosk Simulator] Processing Job: ${job.jobCode}`);
  console.log(`📄 File: ${job.file.originalName} (${job.file.fileSize} bytes)`);
  console.log(`⚙️  Settings: ${job.options.color.toUpperCase()} | ${job.options.sides} | ${job.options.size}`);
  console.log(`📑 Total physical sheets to feed: ${job.totalPhysicalPages}`);
  console.log(`======================================================\n`);

  const totalSheets = job.totalPhysicalPages || 1;

  for (let page = 1; page <= totalSheets; page++) {
    console.log(`[Printer Hardware] Printing page ${page} of ${totalSheets}...`);
    await sleep(1000);

    await fetch(`${API_BASE}/kiosk/${MACHINE_ID}/jobs/${job.jobCode}/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        printedPages: page,
        statusMessage: `Printing page ${page} of ${totalSheets}`
      })
    });
  }

  console.log(`✅ [Printer Hardware] Job ${job.jobCode} completed! Dropping into paper tray.\n`);

  await fetch(`${API_BASE}/kiosk/${MACHINE_ID}/jobs/${job.jobCode}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
}

async function main() {
  console.log(`🤖 PrintBox Mock Kiosk (Dev Simulator) started for Machine: ${MACHINE_ID}`);
  console.log(`📡 Polling endpoint: ${API_BASE}/kiosk/${MACHINE_ID}/poll\n`);

  // Initial heartbeat
  await sendHeartbeat();

  // Heartbeat loop
  setInterval(sendHeartbeat, 30000);

  // Poll loop every 3 seconds
  while (true) {
    await pollJobs();
    await sleep(3000);
  }
}

main().catch(console.error);
