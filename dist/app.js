"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const uploadRoutes_1 = __importDefault(require("./routes/uploadRoutes"));
const jobRoutes_1 = __importDefault(require("./routes/jobRoutes"));
const paymentRoutes_1 = __importDefault(require("./routes/paymentRoutes"));
const machineRoutes_1 = __importDefault(require("./routes/machineRoutes"));
const kioskRoutes_1 = __importDefault(require("./routes/kioskRoutes"));
const adminRoutes_1 = __importDefault(require("./routes/adminRoutes"));
const config_1 = require("./config");
const app = (0, express_1.default)();
// ── Security Headers ──
app.use((0, helmet_1.default)({
    contentSecurityPolicy: false // Allow inline scripts for the single-file frontend
}));
// ── Request Logging ──
app.use((0, morgan_1.default)(config_1.config.nodeEnv === 'production' ? 'combined' : 'dev'));
// ── CORS – restrict in production ──
app.use((0, cors_1.default)({
    origin: true, // Allow all origins — kiosk agent connects from local machine
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
}));
// ── Body Parsers with size limits ──
app.use(express_1.default.json({ limit: '1mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '1mb' }));
// ── Global Rate Limiter (per IP) ──
const globalLimiter = (0, express_rate_limit_1.default)({
    windowMs: 1 * 60 * 1000, // 1 minute window
    max: 120, // 120 requests per minute per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please slow down and try again.' }
});
app.use('/api', globalLimiter);
// ── Strict Upload Rate Limiter ──
const uploadLimiter = (0, express_rate_limit_1.default)({
    windowMs: 5 * 60 * 1000, // 5 minute window
    max: 15, // 15 uploads per 5 min per IP
    message: { error: 'Upload limit reached. Try again in a few minutes.' }
});
app.use('/api/upload', uploadLimiter);
// ── Payment Rate Limiter ──
const paymentLimiter = (0, express_rate_limit_1.default)({
    windowMs: 1 * 60 * 1000,
    max: 10,
    message: { error: 'Too many payment attempts. Please wait.' }
});
app.use('/api/payments', paymentLimiter);
// ── Serve uploaded files (only the uploads dir, NOT the project root) ──
app.use('/uploads', express_1.default.static(config_1.config.uploadDir, { maxAge: '1h' }));
// ── Serve index.html and sticker.html ──
app.get('/', (_req, res) => {
    res.sendFile(path_1.default.resolve(process.cwd(), 'index.html'));
});
app.get('/sticker', (_req, res) => {
    res.sendFile(path_1.default.resolve(process.cwd(), 'sticker.html'));
});
app.get('/admin', (_req, res) => {
    res.sendFile(path_1.default.resolve(process.cwd(), 'admin.html'));
});
app.get('/kiosk', (_req, res) => {
    res.sendFile(path_1.default.resolve(process.cwd(), 'kiosk.html'));
});
// Health check endpoint
app.get('/api/health', (_req, res) => {
    res.json({
        status: 'ok',
        service: 'PrintBox API',
        version: '1.0.0',
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString()
    });
});
// ── API Routes ──
app.use('/api/upload', uploadRoutes_1.default);
app.use('/api/jobs', jobRoutes_1.default);
app.use('/api/payments', paymentRoutes_1.default);
app.use('/api/machines', machineRoutes_1.default);
app.use('/api/kiosk', kioskRoutes_1.default);
app.use('/api/admin', adminRoutes_1.default);
// Global error handling middleware
app.use((err, _req, res, _next) => {
    // Handle multer file size errors
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: `File too large. Maximum size is ${config_1.config.maxFileSizeMb}MB.` });
    }
    console.error('[ServerError]', err.message || err);
    const status = err.status || 500;
    res.status(status).json({
        error: config_1.config.nodeEnv === 'production' ? 'Internal Server Error' : (err.message || 'Internal Server Error')
    });
});
exports.default = app;
