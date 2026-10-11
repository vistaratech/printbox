import app from './app';
import { config } from './config';

const server = app.listen(config.port, () => {
  console.log('====================================================');
  console.log(`🖨️  PrintBox Backend API running at http://localhost:${config.port}`);
  console.log(`📁 Uploads directory: ${config.uploadDir}`);
  console.log(`🌐 Web App URL:      http://localhost:${config.port}`);
  console.log(`🩺 Health check:     http://localhost:${config.port}/api/health`);
  console.log(`⚙️  Default Machine:  ${config.defaultMachineId} (${config.defaultMachineLocation})`);
  console.log('====================================================');
});

process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
  });
});
