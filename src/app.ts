import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import uploadRoutes from './routes/uploadRoutes';
import jobRoutes from './routes/jobRoutes';
import paymentRoutes from './routes/paymentRoutes';
import machineRoutes from './routes/machineRoutes';
import kioskRoutes from './routes/kioskRoutes';
import { config } from './config';

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend and uploaded files
app.use('/uploads', express.static(config.uploadDir));
app.use(express.static(process.cwd()));

// Health check endpoint
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'PrintBox API',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// API Routes
app.use('/api/upload', uploadRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/machines', machineRoutes);
app.use('/api/kiosk', kioskRoutes);

// 404 handler for API routes
app.use('/api', (_req: Request, res: Response) => {
  res.status(404).json({ error: 'API route not found' });
});

// Global error handling middleware
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[ServerError]', err);
  const status = err.status || 500;
  res.status(status).json({
    error: err.message || 'Internal Server Error'
  });
});

export default app;
