import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import uploadRoutes from './routes/uploadRoutes';
import jobRoutes from './routes/jobRoutes';
import paymentRoutes from './routes/paymentRoutes';
import machineRoutes from './routes/machineRoutes';
import kioskRoutes from './routes/kioskRoutes';
import { config } from './config';

const app = express();

// ── Security Headers ──
app.use(helmet({
  contentSecurityPolicy: false // Allow inline scripts for the single-file frontend
}));

// ── Request Logging ──
app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'));

// ── CORS – restrict in production ──
app.use(cors({
  origin: config.nodeEnv === 'production'
    ? ['https://printbox.vistaratech.com'] // add your production domain
    : true, // allow all origins in dev
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));

// ── Body Parsers with size limits ──
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ── Global Rate Limiter (per IP) ──
const globalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute window
  max: 120,                 // 120 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down and try again.' }
});
app.use('/api', globalLimiter);

// ── Strict Upload Rate Limiter ──
const uploadLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minute window
  max: 15,                  // 15 uploads per 5 min per IP
  message: { error: 'Upload limit reached. Try again in a few minutes.' }
});
app.use('/api/upload', uploadLimiter);

// ── Payment Rate Limiter ──
const paymentLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 10,
  message: { error: 'Too many payment attempts. Please wait.' }
});
app.use('/api/payments', paymentLimiter);

// ── Serve uploaded files (only the uploads dir, NOT the project root) ──
app.use('/uploads', express.static(config.uploadDir, { maxAge: '1h' }));

// ── Serve ONLY index.html as the frontend (NOT the entire project root) ──
app.get('/', (_req: Request, res: Response) => {
  res.sendFile(path.resolve(process.cwd(), 'index.html'));
});

// Health check endpoint
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'PrintBox API',
    version: '1.0.0',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

// ── API Routes ──
app.use('/api/upload', uploadRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/machines', machineRoutes);
app.use('/api/kiosk', kioskRoutes);

// Global error handling middleware
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  // Handle multer file size errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: `File too large. Maximum size is ${config.maxFileSizeMb}MB.` });
  }
  console.error('[ServerError]', err.message || err);
  const status = err.status || 500;
  res.status(status).json({
    error: config.nodeEnv === 'production' ? 'Internal Server Error' : (err.message || 'Internal Server Error')
  });
});

export default app;
