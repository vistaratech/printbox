"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const child_process_1 = require("child_process");
const ptp = require('pdf-to-printer');
// ─── Paths ───
const APP_DIR = path_1.default.resolve(process.cwd());
const CONFIG_FILE = path_1.default.join(APP_DIR, 'config.json');
const LOG_FILE = path_1.default.join(APP_DIR, 'printbox.log');
const TEMP_DIR = path_1.default.join(APP_DIR, 'temp_prints');
const DEFAULT_CONFIG = {
    machineId: 'ANNA-XEROX-01',
    apiUrl: 'https://printbox-p5i8.onrender.com/api',
    printerName: 'EPSON4BE5DE (L3250 Series)',
    autoPrint: true,
    soundEnabled: true,
    paperRemaining: 450,
    tonerLevel: 92,
    pollIntervalMs: 2000,
    heartbeatIntervalMs: 30000,
    machineLocation: 'Anna Xerox'
};
// ─── Logging ───
function log(level, message) {
    const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const line = `[${timestamp}] [${level}] ${message}`;
    console.log(line);
    try {
        fs_1.default.appendFileSync(LOG_FILE, line + '\n');
    }
    catch (_) { }
}
// ─── Config Management ───
function loadConfig() {
    try {
        if (fs_1.default.existsSync(CONFIG_FILE)) {
            const data = JSON.parse(fs_1.default.readFileSync(CONFIG_FILE, 'utf8'));
            return { ...DEFAULT_CONFIG, ...data };
        }
    }
    catch (_) { }
    return { ...DEFAULT_CONFIG };
}
function saveConfig(cfg) {
    try {
        fs_1.default.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
    }
    catch (_) { }
}
let appConfig = loadConfig();
saveConfig(appConfig); // Ensure file exists with all fields
let printHistory = [];
let sseClients = [];
let isPolling = false;
let connectionStatus = 'connecting';
let lastHeartbeatOk = false;
let totalJobsCompleted = 0;
let totalRevenue = 0;
let agentStartTime = Date.now();
let pollTimer = null;
let heartbeatTimer = null;
// Ensure temp directory
if (!fs_1.default.existsSync(TEMP_DIR)) {
    fs_1.default.mkdirSync(TEMP_DIR, { recursive: true });
}
// ─── SSE Broadcast ───
function broadcastToUI(event, data) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    sseClients = sseClients.filter(res => {
        try {
            res.write(payload);
            return true;
        }
        catch (_) {
            return false;
        }
    });
}
function broadcastStatus() {
    broadcastToUI('status', {
        connectionStatus,
        lastHeartbeatOk,
        machineId: appConfig.machineId,
        printerName: appConfig.printerName || 'Auto-detect',
        paperRemaining: appConfig.paperRemaining,
        tonerLevel: appConfig.tonerLevel,
        totalJobs: totalJobsCompleted,
        totalRevenue,
        uptime: Math.floor((Date.now() - agentStartTime) / 1000),
        autoPrint: appConfig.autoPrint,
        historyCount: printHistory.length
    });
}
async function getConnectedPrinters() {
    try {
        const all = await ptp.getPrinters();
        let def = null;
        try {
            def = await ptp.getDefaultPrinter();
        }
        catch (_) { }
        let winPorts = {};
        try {
            const ps = (0, child_process_1.execSync)('powershell -NoProfile -Command "Get-Printer | Select-Object Name, PortName | ConvertTo-Json"', { encoding: 'utf8', timeout: 5000 });
            const parsed = JSON.parse(ps);
            const list = Array.isArray(parsed) ? parsed : [parsed];
            list.forEach((p) => { if (p.Name)
                winPorts[p.Name] = p.PortName; });
        }
        catch (_) { }
        return all.map((p) => {
            const nameLower = (p.name || '').toLowerCase();
            const isVirtual = nameLower.includes('pdf') || nameLower.includes('onenote') ||
                nameLower.includes('xps') || nameLower.includes('fax');
            return {
                name: p.name,
                isDefault: def && def.name === p.name,
                isPhysical: !isVirtual,
                port: winPorts[p.name] || 'Unknown'
            };
        });
    }
    catch (err) {
        log('ERROR', `Printer scan failed: ${err}`);
        return [];
    }
}
function checkPrinterHealth(preferredName) {
    const target = (preferredName || appConfig.printerName || '').trim();
    try {
        const psScript = `
      $target = '${target.replace(/'/g, "''")}';
      $p = $null;
      if ($target) { $p = Get-Printer | Where-Object { $_.Name -eq $target } | Select-Object -First 1; }
      if (-not $p) { $p = Get-Printer | Where-Object { $_.Name -like '*EPSON*' -or $_.PortName -like 'WSD*' } | Select-Object -First 1; }
      if (-not $p) { $p = Get-Printer | Where-Object { -not ($_.Name -like '*PDF*' -or $_.Name -like '*OneNote*' -or $_.Name -like '*XPS*' -or $_.Name -like '*Fax*') } | Select-Object -First 1; }
      if ($p) {
        $w = Get-CimInstance Win32_Printer -Filter ('Name = ''' + $p.Name.Replace('''', '''''') + '''');
        $isWsd = ($p.PortName -like 'WSD*' -or $p.PortName -like 'IP*' -or $p.PortName -like 'TCP*');
        $isUsb = ($p.PortName -like 'USB*');
        $isOffline = [bool]($w.WorkOffline -or $p.PrinterStatus -eq 'Offline' -or $w.PrinterStatus -eq 7);
        [PSCustomObject]@{
          name = $p.Name;
          port = $p.PortName;
          isWiFi = $isWsd;
          isUsb = $isUsb;
          isOnline = (-not $isOffline);
          printerStatus = [string]$p.PrinterStatus;
          driver = [string]$p.DriverName;
        } | ConvertTo-Json -Compress;
      } else {
        'null';
      }
    `;
        const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
        const stdout = (0, child_process_1.execSync)(`powershell -NoProfile -EncodedCommand ${encoded}`, { encoding: 'utf8', timeout: 5000 }).trim();
        if (stdout && stdout !== 'null') {
            const parsed = JSON.parse(stdout);
            const isWiFi = Boolean(parsed.isWiFi);
            const isOnline = Boolean(parsed.isOnline);
            const port = parsed.port || 'Unknown';
            const connectionType = isWiFi ? 'Wi-Fi Network (WSD)' : parsed.isUsb ? 'USB Cable' : 'Local Port';
            let statusMessage = '';
            if (isOnline) {
                statusMessage = isWiFi
                    ? `📶 Connected via Wi-Fi · Port: ${port} · Status: Ready to receive print jobs`
                    : `🔌 Connected via USB · Port: ${port} · Status: Ready to receive print jobs`;
            }
            else {
                statusMessage = isWiFi
                    ? `⚠️ Wi-Fi Disconnected / Printer Offline (Port: ${port}) · Check printer power & Wi-Fi`
                    : `⚠️ Printer Offline / Cable Disconnected`;
            }
            return {
                name: parsed.name,
                isOnline,
                isWiFi,
                port,
                connectionType,
                printerStatus: parsed.printerStatus || (isOnline ? 'Normal' : 'Offline'),
                statusMessage,
                driver: parsed.driver || '',
                checkedAt: new Date().toLocaleTimeString('en-IN')
            };
        }
    }
    catch (err) {
        log('WARN', `Printer health check: ${err.message}`);
    }
    return {
        name: target || 'EPSON L3250 Series',
        isOnline: false,
        isWiFi: true,
        port: 'WSD-Auto',
        connectionType: 'Wi-Fi Network',
        printerStatus: 'Offline',
        statusMessage: '⚠️ Printer Not Responding (Check power & Wi-Fi)',
        driver: '',
        checkedAt: new Date().toLocaleTimeString('en-IN')
    };
}
async function resolveTargetPrinter() {
    if (appConfig.printerName && appConfig.printerName.trim() !== '') {
        return appConfig.printerName.trim();
    }
    const printers = await getConnectedPrinters();
    // Prefer Epson L3250 Series or WSD physical printers
    const epson = printers.find(p => p.name.toLowerCase().includes('l3250') || p.name.toLowerCase().includes('epson'));
    if (epson)
        return epson.name;
    const wsd = printers.find(p => p.isPhysical && (p.port || '').startsWith('WSD-'));
    if (wsd)
        return wsd.name;
    const physical = printers.find(p => p.isPhysical);
    if (physical)
        return physical.name;
    const def = printers.find(p => p.isDefault);
    return def ? def.name : undefined;
}
// ─── Heartbeat ───
async function sendHeartbeat() {
    try {
        const res = await fetch(`${appConfig.apiUrl}/kiosk/${appConfig.machineId}/heartbeat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                paperRemaining: appConfig.paperRemaining,
                tonerLevelPercent: appConfig.tonerLevel
            })
        });
        lastHeartbeatOk = res.ok;
        connectionStatus = res.ok ? 'connected' : 'disconnected';
        broadcastToUI('heartbeat', {
            ok: res.ok,
            timestamp: new Date().toLocaleTimeString('en-IN'),
            paperRemaining: appConfig.paperRemaining
        });
    }
    catch (err) {
        lastHeartbeatOk = false;
        connectionStatus = 'disconnected';
        broadcastToUI('heartbeat', { ok: false, error: err.message });
    }
    broadcastStatus();
}
// ─── Poll & Print ───
async function pollPrintJobs() {
    if (isPolling || !appConfig.autoPrint)
        return;
    isPolling = true;
    try {
        const res = await fetch(`${appConfig.apiUrl}/kiosk/${appConfig.machineId}/poll`);
        if (res.ok) {
            const data = await res.json();
            if (data.hasJob && data.job) {
                connectionStatus = 'connected';
                await executePrintJob(data.job);
                return;
            }
        }
        // Resilient fallback: If configured machineId is not M-01, also check M-01 in case a job was submitted with default ID
        if (appConfig.machineId !== 'M-01') {
            const fallbackRes = await fetch(`${appConfig.apiUrl}/kiosk/M-01/poll`);
            if (fallbackRes.ok) {
                const fbData = await fallbackRes.json();
                if (fbData.hasJob && fbData.job) {
                    connectionStatus = 'connected';
                    await executePrintJob(fbData.job);
                }
            }
        }
    }
    catch (_) {
        // Server might be offline – handled by heartbeat
    }
    finally {
        isPolling = false;
    }
}
async function executePrintJob(job) {
    const jobCode = job.jobCode;
    log('INFO', `━━━ New Job: ${jobCode} | ${job.file.originalName} | ${job.options.color.toUpperCase()} | ${job.options.copies} copy ━━━`);
    broadcastToUI('job-started', {
        jobCode,
        fileName: job.file.originalName,
        color: job.options.color,
        copies: job.options.copies,
        size: job.options.size,
        sides: job.options.sides,
        totalSheets: job.totalPhysicalPages
    });
    try {
        // Download file
        const localFilePath = path_1.default.join(TEMP_DIR, `${jobCode}_${job.file.fileName}`);
        const serverOrigin = appConfig.apiUrl.replace(/\/api\/?$/, '');
        const remoteUrl = `${serverOrigin}/uploads/${job.file.fileName}`;
        log('INFO', `Downloading: ${remoteUrl}`);
        broadcastToUI('job-progress', { jobCode, step: 'downloading', message: 'Downloading file from server...' });
        const fileRes = await fetch(remoteUrl);
        if (!fileRes.ok)
            throw new Error(`Download failed (HTTP ${fileRes.status})`);
        const buffer = Buffer.from(await fileRes.arrayBuffer());
        fs_1.default.writeFileSync(localFilePath, buffer);
        log('INFO', `Downloaded ${(buffer.length / 1024).toFixed(1)}KB to ${localFilePath}`);
        // Resolve printer
        const targetPrinter = await resolveTargetPrinter();
        if (!targetPrinter) {
            throw new Error('No printer found! Connect a physical printer and try again.');
        }
        // Build print options
        const paperSize = job.options.size || 'A4';
        const printOptions = {
            printer: targetPrinter,
            copies: job.options.copies || 1,
            paperSize: paperSize,
            monochrome: job.options.color === 'bw',
            scale: paperSize === 'A5' ? 'shrink' : 'fit'
        };
        if (job.options.sides === 'double') {
            printOptions.side = 'duplex';
        }
        if (job.options.orient === 'landscape' || job.options.orient === 'portrait') {
            printOptions.orientation = job.options.orient;
        }
        // Custom page range
        if (job.options.pageList && Array.isArray(job.options.pageList)) {
            const activePages = job.options.pageList.filter((p) => !p.d).map((p) => p.i);
            if (activePages.length > 0)
                printOptions.pages = activePages.join(',');
        }
        else if (job.options.range === 'custom' && job.options.rangeText) {
            printOptions.pages = job.options.rangeText;
        }
        // Try to find SumatraPDF for rendering
        const sumatraPaths = [
            path_1.default.resolve(APP_DIR, 'SumatraPDF-3.4.6-32.exe'),
            path_1.default.resolve(__dirname, 'SumatraPDF-3.4.6-32.exe'),
            path_1.default.resolve(__dirname, '..', 'SumatraPDF-3.4.6-32.exe')
        ];
        const foundSumatra = sumatraPaths.find(p => fs_1.default.existsSync(p));
        if (foundSumatra)
            printOptions.sumatraPdfPath = foundSumatra;
        // Report progress
        await fetch(`${appConfig.apiUrl}/kiosk/${appConfig.machineId}/jobs/${jobCode}/progress`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ printedPages: 1, statusMessage: `Printing on ${targetPrinter}…` })
        });
        broadcastToUI('job-progress', { jobCode, step: 'printing', message: `Sending to ${targetPrinter}...`, printer: targetPrinter });
        log('INFO', `Sending to printer: "${targetPrinter}" with options: ${JSON.stringify(printOptions)}`);
        // Print!
        await ptp.print(localFilePath, printOptions);
        // Update paper count
        const sheetsUsed = job.totalPhysicalPages || 1;
        appConfig.paperRemaining = Math.max(0, appConfig.paperRemaining - sheetsUsed);
        saveConfig(appConfig);
        // Mark complete
        await fetch(`${appConfig.apiUrl}/kiosk/${appConfig.machineId}/jobs/${jobCode}/complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const price = job.pricing ? job.pricing.totalPrice : 0;
        totalJobsCompleted++;
        totalRevenue += price;
        const record = {
            time: new Date().toLocaleTimeString('en-IN'),
            jobCode,
            name: job.file.originalName,
            pages: `${job.options.copies || 1} copy (${sheetsUsed} sheets)`,
            color: job.options.color === 'bw' ? 'B&W' : 'Colour',
            size: job.options.size || 'A4',
            amount: `₹${price.toFixed(2)}`,
            status: 'Completed'
        };
        printHistory.unshift(record);
        if (printHistory.length > 100)
            printHistory = printHistory.slice(0, 100);
        broadcastToUI('job-finished', {
            jobCode,
            sheetsUsed,
            paperRemaining: appConfig.paperRemaining,
            printerName: targetPrinter,
            record,
            totalJobs: totalJobsCompleted,
            totalRevenue
        });
        log('INFO', `✅ Job ${jobCode} completed! Sheets: ${sheetsUsed}, Price: ₹${price.toFixed(2)}`);
        // Cleanup temp file
        try {
            fs_1.default.unlinkSync(localFilePath);
        }
        catch (_) { }
    }
    catch (err) {
        log('ERROR', `❌ Job ${jobCode} failed: ${err.message}`);
        try {
            await fetch(`${appConfig.apiUrl}/kiosk/${appConfig.machineId}/jobs/${jobCode}/fail`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason: err.message || 'Printer error' })
            });
        }
        catch (_) { }
        broadcastToUI('job-error', { jobCode, error: err.message });
    }
    broadcastStatus();
}
// ─── Local Express Dashboard Server ───
const dashApp = (0, express_1.default)();
dashApp.use(express_1.default.json());
// Serve dashboard HTML
const dashboardDir = fs_1.default.existsSync(path_1.default.join(__dirname, 'dashboard.html'))
    ? __dirname
    : path_1.default.resolve(APP_DIR);
dashApp.use(express_1.default.static(dashboardDir));
// SSE endpoint
dashApp.get('/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    sseClients.push(res);
    // Send immediate status
    setTimeout(() => broadcastStatus(), 100);
    req.on('close', () => {
        sseClients = sseClients.filter(c => c !== res);
    });
});
// Config APIs
dashApp.get('/api/config', (_req, res) => {
    res.json(appConfig);
});
dashApp.post('/api/config', (req, res) => {
    const prev = { ...appConfig };
    appConfig = { ...appConfig, ...req.body };
    saveConfig(appConfig);
    log('INFO', `Config updated: ${JSON.stringify(req.body)}`);
    // Restart timers if intervals changed
    if (prev.pollIntervalMs !== appConfig.pollIntervalMs || prev.heartbeatIntervalMs !== appConfig.heartbeatIntervalMs) {
        startTimers();
    }
    broadcastStatus();
    res.json({ success: true, config: appConfig });
});
// Printer APIs
dashApp.get('/api/printers', async (_req, res) => {
    const printers = await getConnectedPrinters();
    res.json(printers);
});
// Real-time Wi-Fi Printer Health & Status
dashApp.get('/api/printer/health', (_req, res) => {
    const health = checkPrinterHealth();
    res.json(health);
});
// Server Live Queue & Jobs Proxy
dashApp.get('/api/queue', async (_req, res) => {
    try {
        const resJobs = await fetch(`${appConfig.apiUrl}/jobs?limit=50`);
        if (resJobs.ok) {
            const data = await resJobs.json();
            return res.json(data);
        }
    }
    catch (_) { }
    res.json({ jobs: [] });
});
// History
dashApp.get('/api/history', (_req, res) => {
    res.json(printHistory);
});
// Stats
dashApp.get('/api/stats', (_req, res) => {
    res.json({
        totalJobs: totalJobsCompleted,
        totalRevenue,
        uptime: Math.floor((Date.now() - agentStartTime) / 1000),
        connectionStatus,
        paperRemaining: appConfig.paperRemaining,
        tonerLevel: appConfig.tonerLevel,
        historyCount: printHistory.length
    });
});
// Refill Paper
dashApp.post('/api/refill-paper', (_req, res) => {
    appConfig.paperRemaining = 500;
    saveConfig(appConfig);
    sendHeartbeat();
    log('INFO', 'Paper refilled to 500 sheets');
    res.json({ success: true, paperRemaining: appConfig.paperRemaining });
});
// Test Print
dashApp.post('/api/test-print', async (_req, res) => {
    try {
        const targetPrinter = await resolveTargetPrinter();
        if (!targetPrinter)
            throw new Error('No printer found');
        const psCmd = `powershell -NoProfile -Command "
      Add-Type -AssemblyName System.Drawing;
      $doc = New-Object System.Drawing.Printing.PrintDocument;
      $doc.PrinterSettings.PrinterName = '${targetPrinter.replace(/'/g, "''")}';
      $doc.add_PrintPage({
        param($sender, $ev)
        $font = New-Object System.Drawing.Font('Arial', 16, [System.Drawing.FontStyle]::Bold);
        $subFont = New-Object System.Drawing.Font('Arial', 11);
        $brush = [System.Drawing.Brushes]::Black;
        $ev.Graphics.DrawString('PRINTBOX PRO - HARDWARE TEST', $font, $brush, 60, 60);
        $ev.Graphics.DrawString('Machine: ${appConfig.machineId}', $subFont, $brush, 60, 100);
        $ev.Graphics.DrawString('Printer: ${targetPrinter.replace(/'/g, "''")}', $subFont, $brush, 60, 125);
        $ev.Graphics.DrawString('Time: ' + (Get-Date).ToString('dd-MMM-yyyy hh:mm:ss tt'), $subFont, $brush, 60, 150);
        $ev.Graphics.DrawString('Status: CONNECTED & VERIFIED', $subFont, $brush, 60, 185);
      });
      $doc.Print();
    "`;
        (0, child_process_1.execSync)(psCmd, { timeout: 15000 });
        log('INFO', `Test print sent to "${targetPrinter}"`);
        res.json({ success: true, printer: targetPrinter });
    }
    catch (err) {
        log('ERROR', `Test print failed: ${err.message}`);
        res.status(500).json({ success: false, error: err.message });
    }
});
// Logs
dashApp.get('/api/logs', (_req, res) => {
    try {
        if (fs_1.default.existsSync(LOG_FILE)) {
            const content = fs_1.default.readFileSync(LOG_FILE, 'utf8');
            const lines = content.trim().split('\n').slice(-200);
            res.json(lines);
        }
        else {
            res.json([]);
        }
    }
    catch (err) {
        res.json([]);
    }
});
// ─── Timer Management ───
function startTimers() {
    if (pollTimer)
        clearInterval(pollTimer);
    if (heartbeatTimer)
        clearInterval(heartbeatTimer);
    pollTimer = setInterval(pollPrintJobs, appConfig.pollIntervalMs);
    heartbeatTimer = setInterval(sendHeartbeat, appConfig.heartbeatIntervalMs);
    log('INFO', `Timers started: poll=${appConfig.pollIntervalMs}ms, heartbeat=${appConfig.heartbeatIntervalMs}ms`);
}
// ─── Main Bootstrap ───
async function main() {
    console.log('');
    console.log('╔══════════════════════════════════════════════════════╗');
    console.log('║          🖨️  PrintBox Pro – Desktop Agent            ║');
    console.log('╚══════════════════════════════════════════════════════╝');
    console.log('');
    log('INFO', `Machine ID: ${appConfig.machineId}`);
    log('INFO', `API Server: ${appConfig.apiUrl}`);
    log('INFO', `Auto-Print: ${appConfig.autoPrint ? 'ON' : 'OFF'}`);
    // Detect printers
    try {
        const printers = await getConnectedPrinters();
        log('INFO', `Detected ${printers.length} printer(s):`);
        printers.forEach(p => {
            const tags = [p.isDefault ? '★DEFAULT' : '', p.isPhysical ? 'PHYSICAL' : 'VIRTUAL', p.port].filter(Boolean).join(' | ');
            log('INFO', `  → ${p.name} [${tags}]`);
        });
        const target = await resolveTargetPrinter();
        if (target) {
            log('INFO', `🎯 Target Printer: "${target}"`);
        }
        else {
            log('WARN', '⚠️  No physical printer detected! Connect a printer via USB/Wi-Fi.');
        }
    }
    catch (e) {
        log('WARN', `Printer detection error: ${e.message}`);
    }
    // Start local dashboard server
    const DASH_PORT = 3300;
    dashApp.listen(DASH_PORT, '127.0.0.1', () => {
        log('INFO', `Dashboard running at http://localhost:${DASH_PORT}`);
        // Open dashboard in Edge app mode
        const appUrl = `http://localhost:${DASH_PORT}/dashboard.html`;
        const edgePaths = [
            'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
            'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
        ];
        const edgeBin = edgePaths.find(p => fs_1.default.existsSync(p)) || 'msedge.exe';
        (0, child_process_1.exec)(`"${edgeBin}" --app="${appUrl}" --window-size=1360,860 --no-first-run --no-default-browser-check`, (err) => {
            if (err) {
                log('WARN', `Could not launch Edge in app mode: ${err.message}. Trying standard browser launch...`);
                (0, child_process_1.exec)(`start "" "${appUrl}"`);
            }
        });
    });
    // Start background loops
    await sendHeartbeat();
    startTimers();
}
main().catch(err => {
    log('ERROR', `Fatal: ${err.message}`);
    process.exit(1);
});
