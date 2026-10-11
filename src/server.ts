import app from './app';
import { config } from './config';
import { JobService } from './services/jobService';

const server = app.listen(config.port, () => {
  console.log('====================================================');
  console.log(`🖨️  PrintBox Backend API running at http://localhost:${config.port}`);
  console.log(`📁 Uploads directory: ${config.uploadDir}`);
  console.log(`🌐 Web App URL:      http://localhost:${config.port}`);
  console.log(`🩺 Health check:     http://localhost:${config.port}/api/health`);
  console.log(`⚙️  Default Machine:  ${config.defaultMachineId} (${config.defaultMachineLocation})`);
  console.log(`🛡️  Rate Limiting:    Enabled`);
  console.log(`🔒 Helmet Security:  Enabled`);
  console.log('====================================================');
});

// Start job cleanup scheduler (purges stale jobs + uploaded files)
JobService.startCleanupScheduler();

// Graceful shutdown: clean up timers, SSE connections, and active simulations
function gracefulShutdown(signal: string) {
  console.log(`\n${signal} received: shutting down gracefully...`);
  JobService.clearAllSimulations();
  JobService.stopCleanupScheduler();
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
  // Force kill after 10 seconds
  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
