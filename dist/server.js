"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = __importDefault(require("./app"));
const config_1 = require("./config");
const jobService_1 = require("./services/jobService");
const databaseService_1 = require("./services/databaseService");
const PORT = parseInt(process.env.PORT || String(config_1.config.port), 10);
// Initialize database (creates tables if not exist)
(0, databaseService_1.getDb)();
console.log('[Database] SQLite initialized at printbox.db');
const server = app_1.default.listen(PORT, '0.0.0.0', () => {
    console.log('====================================================');
    console.log(`🖨️  PrintBox Backend API running on port ${PORT}`);
    console.log(`📁 Uploads directory: ${config_1.config.uploadDir}`);
    console.log(`🩺 Health check:     /api/health`);
    console.log(`⚙️  Default Machine:  ${config_1.config.defaultMachineId} (${config_1.config.defaultMachineLocation})`);
    console.log(`🛡️  Rate Limiting:    Enabled`);
    console.log(`🔒 Helmet Security:  Enabled`);
    console.log('====================================================');
});
// Start job cleanup scheduler (purges stale jobs + uploaded files)
jobService_1.JobService.startCleanupScheduler();
// Graceful shutdown: clean up timers, SSE connections, and active simulations
function gracefulShutdown(signal) {
    console.log(`\n${signal} received: shutting down gracefully...`);
    jobService_1.JobService.clearAllSimulations();
    jobService_1.JobService.stopCleanupScheduler();
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
