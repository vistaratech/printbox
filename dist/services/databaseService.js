"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDb = getDb;
exports.saveJob = saveJob;
exports.loadJob = loadJob;
exports.loadAllJobs = loadAllJobs;
exports.updateJobStatus = updateJobStatus;
exports.saveMachine = saveMachine;
exports.loadMachine = loadMachine;
exports.savePayment = savePayment;
exports.getJobCount = getJobCount;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const path_1 = __importDefault(require("path"));
const DB_PATH = path_1.default.resolve(process.cwd(), 'printbox.db');
let db;
function getDb() {
    if (!db) {
        db = new better_sqlite3_1.default(DB_PATH);
        db.pragma('journal_mode = WAL');
        db.pragma('foreign_keys = ON');
        migrate(db);
    }
    return db;
}
function migrate(database) {
    database.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      jobCode TEXT PRIMARY KEY,
      machineId TEXT NOT NULL,
      fileName TEXT NOT NULL,
      originalName TEXT NOT NULL,
      filePath TEXT NOT NULL DEFAULT '',
      fileSize INTEGER NOT NULL DEFAULT 0,
      mimeType TEXT NOT NULL DEFAULT '',
      detectedPages INTEGER NOT NULL DEFAULT 1,
      color TEXT NOT NULL DEFAULT 'bw',
      sides TEXT NOT NULL DEFAULT 'single',
      size TEXT NOT NULL DEFAULT 'A4',
      orient TEXT NOT NULL DEFAULT 'portrait',
      pps INTEGER NOT NULL DEFAULT 1,
      quality TEXT NOT NULL DEFAULT 'normal',
      copies INTEGER NOT NULL DEFAULT 1,
      range TEXT NOT NULL DEFAULT 'all',
      rangeText TEXT,
      staple INTEGER NOT NULL DEFAULT 0,
      collateCopies INTEGER NOT NULL DEFAULT 1,
      selectedPages INTEGER NOT NULL DEFAULT 1,
      sheetsPerCopy INTEGER NOT NULL DEFAULT 1,
      totalPaperSheets INTEGER NOT NULL DEFAULT 1,
      pricePerPage REAL NOT NULL DEFAULT 0,
      printPrice REAL NOT NULL DEFAULT 0,
      staplePrice REAL NOT NULL DEFAULT 0,
      totalPrice REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending_payment',
      statusMessage TEXT NOT NULL DEFAULT '',
      printedPages INTEGER NOT NULL DEFAULT 0,
      totalPhysicalPages INTEGER NOT NULL DEFAULT 1,
      paymentMethod TEXT NOT NULL DEFAULT 'gpay',
      paymentId TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      completedAt TEXT
    );
    CREATE TABLE IF NOT EXISTS machines (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      location TEXT NOT NULL,
      isOnline INTEGER NOT NULL DEFAULT 1,
      paperRemaining INTEGER NOT NULL DEFAULT 500,
      maxPaperCapacity INTEGER NOT NULL DEFAULT 500,
      tonerLevelPercent INTEGER NOT NULL DEFAULT 100,
      lastHeartbeat TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      jobCode TEXT NOT NULL,
      amount REAL NOT NULL,
      method TEXT NOT NULL,
      paymentId TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'completed',
      createdAt TEXT NOT NULL,
      FOREIGN KEY (jobCode) REFERENCES jobs(jobCode)
    );
    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
    CREATE INDEX IF NOT EXISTS idx_jobs_created ON jobs(createdAt);
    CREATE INDEX IF NOT EXISTS idx_payments_job ON payments(jobCode);
  `);
}
function saveJob(job) {
    const d = getDb();
    d.prepare(`
    INSERT OR REPLACE INTO jobs (
      jobCode, machineId, fileName, originalName, filePath, fileSize, mimeType, detectedPages,
      color, sides, size, orient, pps, quality, copies, range, rangeText, staple, collateCopies,
      selectedPages, sheetsPerCopy, totalPaperSheets, pricePerPage, printPrice, staplePrice, totalPrice,
      status, statusMessage, printedPages, totalPhysicalPages, paymentMethod, paymentId,
      createdAt, updatedAt, completedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(job.jobCode, job.machineId, job.file.fileName, job.file.originalName, job.file.filePath, job.file.fileSize, job.file.mimeType, job.file.detectedPages, job.options.color, job.options.sides, job.options.size, job.options.orient, job.options.pps, job.options.quality, job.options.copies, job.options.range, job.options.rangeText || null, job.options.staple ? 1 : 0, job.options.collate ? 1 : 0, job.pricing.selectedPages, job.pricing.sheetsPerCopy, job.pricing.totalPaperSheets, job.pricing.pricePerPage, job.pricing.printPrice, job.pricing.staplePrice, job.pricing.totalPrice, job.status, job.statusMessage, job.printedPages, job.totalPhysicalPages, job.paymentMethod, job.paymentId || null, job.createdAt, job.updatedAt, job.completedAt || null);
}
function loadJob(jobCode) {
    const d = getDb();
    const r = d.prepare('SELECT * FROM jobs WHERE jobCode = ?').get(jobCode);
    if (!r)
        return undefined;
    return {
        jobCode: r.jobCode, machineId: r.machineId,
        file: { id: r.jobCode, originalName: r.originalName, fileName: r.fileName, filePath: r.filePath, fileSize: r.fileSize, mimeType: r.mimeType, detectedPages: r.detectedPages, createdAt: r.createdAt },
        options: { color: r.color, sides: r.sides, size: r.size, orient: r.orient, pps: r.pps, quality: r.quality, copies: r.copies, range: r.range, rangeText: r.rangeText || undefined, staple: !!r.staple, collate: !!r.collateCopies },
        pricing: { selectedPages: r.selectedPages, sheetsPerCopy: r.sheetsPerCopy, totalPaperSheets: r.totalPaperSheets, pricePerPage: r.pricePerPage, printPrice: r.printPrice, staplePrice: r.staplePrice, totalPrice: r.totalPrice },
        status: r.status, statusMessage: r.statusMessage,
        printedPages: r.printedPages, totalPhysicalPages: r.totalPhysicalPages,
        paymentMethod: r.paymentMethod, paymentId: r.paymentId || undefined,
        createdAt: r.createdAt, updatedAt: r.updatedAt, completedAt: r.completedAt || undefined
    };
}
function loadAllJobs(limit = 100, offset = 0) {
    const d = getDb();
    const rows = d.prepare('SELECT * FROM jobs ORDER BY createdAt DESC LIMIT ? OFFSET ?').all(limit, offset);
    return rows.map(r => ({
        jobCode: r.jobCode, machineId: r.machineId,
        file: { id: r.jobCode, originalName: r.originalName, fileName: r.fileName, filePath: r.filePath, fileSize: r.fileSize, mimeType: r.mimeType, detectedPages: r.detectedPages, createdAt: r.createdAt },
        options: { color: r.color, sides: r.sides, size: r.size, orient: r.orient, pps: r.pps, quality: r.quality, copies: r.copies, range: r.range, rangeText: r.rangeText || undefined, staple: !!r.staple, collate: !!r.collateCopies },
        pricing: { selectedPages: r.selectedPages, sheetsPerCopy: r.sheetsPerCopy, totalPaperSheets: r.totalPaperSheets, pricePerPage: r.pricePerPage, printPrice: r.printPrice, staplePrice: r.staplePrice, totalPrice: r.totalPrice },
        status: r.status, statusMessage: r.statusMessage,
        printedPages: r.printedPages, totalPhysicalPages: r.totalPhysicalPages,
        paymentMethod: r.paymentMethod, paymentId: r.paymentId || undefined,
        createdAt: r.createdAt, updatedAt: r.updatedAt, completedAt: r.completedAt || undefined
    }));
}
function updateJobStatus(jobCode, status, statusMessage, printedPages) {
    const d = getDb();
    const job = loadJob(jobCode);
    if (!job)
        return undefined;
    job.status = status;
    if (statusMessage)
        job.statusMessage = statusMessage;
    if (printedPages !== undefined)
        job.printedPages = printedPages;
    job.updatedAt = new Date().toISOString();
    if (status === 'completed') {
        job.completedAt = job.updatedAt;
        job.printedPages = job.totalPhysicalPages;
    }
    saveJob(job);
    return job;
}
function saveMachine(machine) {
    const d = getDb();
    d.prepare(`
    INSERT OR REPLACE INTO machines (id, name, location, isOnline, paperRemaining, maxPaperCapacity, tonerLevelPercent, lastHeartbeat)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(machine.id, machine.name, machine.location, machine.isOnline ? 1 : 0, machine.paperRemaining, machine.maxPaperCapacity, machine.tonerLevelPercent, machine.lastHeartbeat);
}
function loadMachine(id) {
    const d = getDb();
    const r = d.prepare('SELECT * FROM machines WHERE id = ?').get(id);
    if (!r)
        return undefined;
    return { id: r.id, name: r.name, location: r.location, isOnline: !!r.isOnline, paperRemaining: r.paperRemaining, maxPaperCapacity: r.maxPaperCapacity, tonerLevelPercent: r.tonerLevelPercent, lastHeartbeat: r.lastHeartbeat };
}
function savePayment(jobCode, amount, method, paymentId, status = 'completed') {
    const d = getDb();
    d.prepare('INSERT INTO payments (jobCode, amount, method, paymentId, status, createdAt) VALUES (?, ?, ?, ?, ?, ?)')
        .run(jobCode, amount, method, paymentId, status, new Date().toISOString());
}
function getJobCount() {
    const d = getDb();
    return d.prepare('SELECT COUNT(*) as c FROM jobs').get().c;
}
