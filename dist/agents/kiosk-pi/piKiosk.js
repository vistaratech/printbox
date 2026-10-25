"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const child_process_1 = require("child_process");
const config_1 = require("../../config");
/**
 * PrintBox Raspberry Pi Kiosk Agent
 * ──────────────────────────────────
 * Runs on Raspberry Pi (Linux) using CUPS printing system.
 * Supports both USB and Wi-Fi (IPP/AirPrint) connected printers.
 *
 * Requirements:
 *   - CUPS installed: sudo apt install cups
 *   - User in lpadmin group: sudo usermod -aG lpadmin pi
 *   - Printer added via CUPS web UI (http://localhost:631) or lpadmin
 *
 * Usage:
 *   npx tsx src/agents/kiosk-pi/piKiosk.ts
 *   # or
 *   npm run kiosk:pi
 */
// ─── Config ───
const API_BASE = process.env.API_URL || config_1.config?.defaultMachineId
    ? (process.env.API_URL || 'https://printbox-p5i8.onrender.com/api')
    : 'https://printbox-p5i8.onrender.com/api';
const MACHINE_ID = process.env.MACHINE_ID || config_1.config?.defaultMachineId || 'M-01';
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || '2000', 10);
const HEARTBEAT_INTERVAL = parseInt(process.env.HEARTBEAT_INTERVAL || '30000', 10);
// Explicit target printer (leave empty for auto-detect)
let TARGET_PRINTER = process.env.PRINTER_NAME || '';
// Temp directory for downloaded files
const TEMP_DIR = path_1.default.resolve(process.cwd(), 'temp_prints');
if (!fs_1.default.existsSync(TEMP_DIR)) {
    fs_1.default.mkdirSync(TEMP_DIR, { recursive: true });
}
// ─── Logging ───
function log(level, msg) {
    const ts = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    console.log(`[${ts}] [${level}] ${msg}`);
}
/**
 * Lists all CUPS printers and their connection type (USB / Wi-Fi / Network)
 */
function listCupsPrinters() {
    try {
        // Get all CUPS printers with their device URIs
        const lpstatOutput = (0, child_process_1.execSync)('lpstat -v 2>/dev/null || true', { encoding: 'utf8', timeout: 5000 });
        const defaultOutput = (0, child_process_1.execSync)('lpstat -d 2>/dev/null || true', { encoding: 'utf8', timeout: 5000 });
        const defaultPrinter = defaultOutput.match(/system default destination:\s*(\S+)/)?.[1] || '';
        const printers = [];
        const lines = lpstatOutput.trim().split('\n').filter(Boolean);
        for (const line of lines) {
            // Format: "device for PrinterName: usb://EPSON/..."
            const match = line.match(/device for (\S+):\s*(.+)/);
            if (!match)
                continue;
            const name = match[1];
            const uri = match[2].trim();
            let connection = 'unknown';
            if (uri.startsWith('usb://')) {
                connection = 'usb';
            }
            else if (uri.startsWith('ipp://') || uri.startsWith('ipps://') || uri.startsWith('dnssd://')) {
                connection = 'wifi';
            }
            else if (uri.startsWith('socket://') || uri.startsWith('lpd://') || uri.startsWith('http://')) {
                connection = 'network';
            }
            // Get printer status
            let status = 'idle';
            try {
                const statusOut = (0, child_process_1.execSync)(`lpstat -p ${name} 2>/dev/null || true`, { encoding: 'utf8', timeout: 3000 });
                if (statusOut.includes('disabled')) {
                    status = 'disabled';
                }
                else if (statusOut.includes('printing')) {
                    status = 'printing';
                }
                else if (statusOut.includes('idle')) {
                    status = 'idle';
                }
            }
            catch (_) { }
            printers.push({
                name,
                status,
                isDefault: name === defaultPrinter,
                connection,
                uri
            });
        }
        return printers;
    }
    catch (err) {
        log('ERROR', `CUPS printer detection failed: ${err.message}`);
        return [];
    }
}
/**
 * Auto-detect the best physical printer to use
 * Priority: Explicit env → Epson → USB printer → Wi-Fi printer → Default → First available
 */
function findBestPrinter(printers) {
    if (TARGET_PRINTER)
        return TARGET_PRINTER;
    if (printers.length === 0)
        return undefined;
    // Filter out disabled printers
    const active = printers.filter(p => p.status !== 'disabled');
    if (active.length === 0)
        return printers[0]?.name;
    // Prefer Epson
    const epson = active.find(p => p.name.toLowerCase().includes('epson') || p.uri.toLowerCase().includes('epson'));
    if (epson)
        return epson.name;
    // Prefer USB (most reliable for kiosk)
    const usb = active.find(p => p.connection === 'usb');
    if (usb)
        return usb.name;
    // Then Wi-Fi
    const wifi = active.find(p => p.connection === 'wifi');
    if (wifi)
        return wifi.name;
    // Then default
    const def = active.find(p => p.isDefault);
    if (def)
        return def.name;
    // Fallback: first active
    return active[0]?.name;
}
/**
 * Get estimated paper count from tray sensor (placeholder for hardware GPIO integration)
 */
function getPaperCount() {
    // TODO: Integrate with actual paper tray sensor via GPIO
    // For now, read from a local state file
    const stateFile = path_1.default.resolve(process.cwd(), '.pi_state.json');
    try {
        if (fs_1.default.existsSync(stateFile)) {
            const state = JSON.parse(fs_1.default.readFileSync(stateFile, 'utf8'));
            return state.paperRemaining || 420;
        }
    }
    catch (_) { }
    return 420;
}
function updatePaperCount(sheetsUsed) {
    const stateFile = path_1.default.resolve(process.cwd(), '.pi_state.json');
    let state = { paperRemaining: 420 };
    try {
        if (fs_1.default.existsSync(stateFile)) {
            state = JSON.parse(fs_1.default.readFileSync(stateFile, 'utf8'));
        }
    }
    catch (_) { }
    state.paperRemaining = Math.max(0, (state.paperRemaining || 420) - sheetsUsed);
    fs_1.default.writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf8');
}
// ─── Helper ───
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
// ─── Heartbeat ───
async function sendHeartbeat() {
    try {
        const paperCount = getPaperCount();
        const res = await fetch(`${API_BASE}/kiosk/${MACHINE_ID}/heartbeat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                paperRemaining: paperCount,
                tonerLevelPercent: 90
            })
        });
        if (res.ok) {
            log('HEARTBEAT', `✅ Paper: ${paperCount} sheets`);
        }
    }
    catch (err) {
        log('HEARTBEAT', `⚠️  Server unreachable: ${err.message}`);
    }
}
// ─── Poll Jobs ───
async function pollJobs() {
    try {
        const res = await fetch(`${API_BASE}/kiosk/${MACHINE_ID}/poll`);
        if (!res.ok)
            return;
        const data = await res.json();
        if (data.hasJob && data.job) {
            await processJob(data.job);
        }
    }
    catch (_) {
        // Server not ready
    }
}
// ─── Download File ───
async function downloadFile(url, destPath) {
    try {
        const res = await fetch(url);
        if (!res.ok)
            return false;
        const buffer = Buffer.from(await res.arrayBuffer());
        const dir = path_1.default.dirname(destPath);
        if (!fs_1.default.existsSync(dir))
            fs_1.default.mkdirSync(dir, { recursive: true });
        fs_1.default.writeFileSync(destPath, buffer);
        return true;
    }
    catch (err) {
        log('ERROR', `Download failed: ${err.message}`);
        return false;
    }
}
// ─── CUPS Print Command Builder ───
function buildLpCommand(filePath, printerName, job) {
    const args = ['lp'];
    // Target printer
    args.push(`-d "${printerName}"`);
    // Copies
    const copies = job.options.copies || 1;
    args.push(`-n ${copies}`);
    // Print options via -o flags
    const opts = [];
    // Paper size mapping (CUPS media names)
    const paperSizeMap = {
        'A4': 'A4',
        'A3': 'A3',
        'A5': 'A5',
        'Legal': 'Legal',
        'Letter': 'Letter'
    };
    const paperSize = paperSizeMap[job.options.size] || 'A4';
    opts.push(`media=${paperSize}`);
    // Color vs B&W
    if (job.options.color === 'bw') {
        // Try multiple CUPS-compatible monochrome options
        opts.push('ColorModel=Gray');
    }
    // Duplex (double-sided)
    if (job.options.sides === 'double') {
        opts.push('sides=two-sided-long-edge');
    }
    else {
        opts.push('sides=one-sided');
    }
    // Orientation
    if (job.options.orient === 'landscape') {
        opts.push('landscape');
    }
    // Fit to page
    opts.push('fit-to-page');
    // Page range
    let pageRange = '';
    if (job.options.pageList && Array.isArray(job.options.pageList)) {
        const activePages = job.options.pageList.filter((p) => !p.d).map((p) => p.i);
        if (activePages.length > 0) {
            pageRange = activePages.join(',');
        }
    }
    else if (job.options.range === 'custom' && job.options.rangeText) {
        pageRange = job.options.rangeText;
    }
    if (pageRange) {
        args.push(`-P ${pageRange}`);
    }
    // Add all -o options
    for (const opt of opts) {
        args.push(`-o ${opt}`);
    }
    // File path
    args.push(`"${filePath}"`);
    return args.join(' ');
}
// ─── Process Print Job ───
async function processJob(job) {
    const jobCode = job.jobCode;
    log('INFO', `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    log('INFO', `🖨️  New Print Job: ${jobCode}`);
    log('INFO', `📄 File: ${job.file.originalName}`);
    log('INFO', `⚙️  ${job.options.color.toUpperCase()} | ${job.options.sides} | ${job.options.size} | ${job.options.copies} copy`);
    log('INFO', `📑 Total Sheets: ${job.totalPhysicalPages}`);
    log('INFO', `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    // 1. Locate or download the file
    let filePath = path_1.default.join(TEMP_DIR, `${jobCode}_${job.file.fileName}`);
    // Download from remote server
    const serverOrigin = API_BASE.replace(/\/api\/?$/, '');
    const remoteUrl = `${serverOrigin}/uploads/${job.file.fileName}`;
    log('INFO', `📥 Downloading: ${remoteUrl}`);
    const downloaded = await downloadFile(remoteUrl, filePath);
    if (!downloaded) {
        log('ERROR', `❌ File download failed!`);
        await fetch(`${API_BASE}/kiosk/${MACHINE_ID}/jobs/${jobCode}/fail`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason: 'Failed to download file from server' })
        }).catch(() => { });
        return;
    }
    log('INFO', `✅ File downloaded: ${(fs_1.default.statSync(filePath).size / 1024).toFixed(1)}KB`);
    try {
        // 2. Report progress
        await fetch(`${API_BASE}/kiosk/${MACHINE_ID}/jobs/${jobCode}/progress`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                printedPages: 1,
                statusMessage: 'Sending to printer via CUPS...'
            })
        }).catch(() => { });
        // 3. Find best printer
        const printers = listCupsPrinters();
        const targetPrinter = findBestPrinter(printers);
        if (!targetPrinter) {
            throw new Error('No printer found! Connect a printer via USB or Wi-Fi and add it in CUPS (http://localhost:631).');
        }
        log('INFO', `🎯 Target Printer: "${targetPrinter}"`);
        // 4. Build and execute CUPS print command
        const printCmd = buildLpCommand(filePath, targetPrinter, job);
        log('INFO', `🚀 Executing: ${printCmd}`);
        (0, child_process_1.execSync)(printCmd, { encoding: 'utf8', timeout: 30000 });
        log('INFO', `✅ Print command sent to CUPS successfully!`);
        // 5. Update paper count
        const sheetsUsed = job.totalPhysicalPages || 1;
        updatePaperCount(sheetsUsed);
        // 6. Mark job complete
        await fetch(`${API_BASE}/kiosk/${MACHINE_ID}/jobs/${jobCode}/complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        log('INFO', `🎉 Job ${jobCode} completed! Sheets used: ${sheetsUsed}`);
    }
    catch (err) {
        log('ERROR', `❌ Print failed: ${err.message}`);
        await fetch(`${API_BASE}/kiosk/${MACHINE_ID}/jobs/${jobCode}/fail`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason: err.message || 'Printer error on Raspberry Pi' })
        }).catch(() => { });
    }
    finally {
        // Cleanup temp file
        try {
            fs_1.default.unlinkSync(filePath);
        }
        catch (_) { }
    }
}
// ─── Main ───
async function main() {
    console.log('');
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║     🍓 PrintBox – Raspberry Pi Kiosk Agent              ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log('');
    log('INFO', `Machine ID  : ${MACHINE_ID}`);
    log('INFO', `API Server  : ${API_BASE}`);
    log('INFO', `Poll Interval: ${POLL_INTERVAL}ms`);
    // Check CUPS availability
    try {
        const cupsVersion = (0, child_process_1.execSync)('lpstat -r 2>/dev/null || echo "CUPS not running"', { encoding: 'utf8' }).trim();
        log('INFO', `CUPS Status : ${cupsVersion}`);
    }
    catch (_) {
        log('ERROR', '❌ CUPS is not installed! Run: sudo apt install cups');
        log('ERROR', '   Then add your user: sudo usermod -aG lpadmin $USER');
        process.exit(1);
    }
    // Detect printers
    const printers = listCupsPrinters();
    if (printers.length === 0) {
        log('WARN', '⚠️  No printers found in CUPS!');
        log('WARN', '   Add printer via: http://localhost:631 (CUPS Web UI)');
        log('WARN', '   Or via command: sudo lpadmin -p MyPrinter -E -v usb://...');
    }
    else {
        log('INFO', `Detected ${printers.length} CUPS printer(s):`);
        printers.forEach(p => {
            const icon = p.connection === 'usb' ? '🔌' : p.connection === 'wifi' ? '📶' : '🌐';
            const def = p.isDefault ? ' ★DEFAULT' : '';
            log('INFO', `  ${icon} ${p.name} [${p.connection.toUpperCase()} | ${p.status}${def}]`);
            log('INFO', `     URI: ${p.uri}`);
        });
    }
    const bestPrinter = findBestPrinter(printers);
    if (bestPrinter) {
        TARGET_PRINTER = bestPrinter;
        log('INFO', `🎯 Selected Printer: "${bestPrinter}"`);
    }
    else {
        log('WARN', '⚠️  No physical printer available. Waiting for printer connection...');
    }
    console.log('');
    log('INFO', '🚀 Starting print job polling loop...');
    console.log('');
    // Initial heartbeat
    await sendHeartbeat();
    setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
    // Continuous job polling
    while (true) {
        await pollJobs();
        await sleep(POLL_INTERVAL);
    }
}
main().catch(err => {
    log('ERROR', `Fatal: ${err.message}`);
    process.exit(1);
});
