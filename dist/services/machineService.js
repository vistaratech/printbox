"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MachineService = void 0;
const config_1 = require("../config");
const databaseService_1 = require("./databaseService");
const STALE_THRESHOLD_MS = process.env.NODE_ENV === 'production' ? 90 * 1000 : 24 * 60 * 60 * 1000;
class MachineService {
    static initialized = false;
    static {
        this.ensureDefault();
    }
    static ensureDefault() {
        if (this.initialized)
            return;
        const existing = (0, databaseService_1.loadMachine)(config_1.config.defaultMachineId);
        if (!existing) {
            (0, databaseService_1.saveMachine)({
                id: config_1.config.defaultMachineId,
                name: `Machine ${config_1.config.defaultMachineId}`,
                location: config_1.config.defaultMachineLocation,
                isOnline: true,
                paperRemaining: 420,
                maxPaperCapacity: 500,
                tonerLevelPercent: 88,
                lastHeartbeat: new Date().toISOString()
            });
        }
        this.initialized = true;
    }
    static refreshOnlineStatus(machine) {
        const elapsed = Date.now() - new Date(machine.lastHeartbeat).getTime();
        machine.isOnline = elapsed < STALE_THRESHOLD_MS;
        return machine;
    }
    static getMachine(id) {
        this.ensureDefault();
        const machine = (0, databaseService_1.loadMachine)(id);
        if (machine)
            return this.refreshOnlineStatus(machine);
        return undefined;
    }
    static getAllMachines() {
        this.ensureDefault();
        const m = (0, databaseService_1.loadMachine)(config_1.config.defaultMachineId);
        return m ? [this.refreshOnlineStatus(m)] : [];
    }
    static updateHeartbeat(id, paperRemaining, tonerPercent) {
        this.ensureDefault();
        let machine = (0, databaseService_1.loadMachine)(id);
        if (!machine) {
            machine = { id, name: `Machine ${id}`, location: 'Campus Kiosk', isOnline: true, paperRemaining: paperRemaining ?? 500, maxPaperCapacity: 500, tonerLevelPercent: tonerPercent ?? 100, lastHeartbeat: new Date().toISOString() };
        }
        machine.isOnline = true;
        machine.lastHeartbeat = new Date().toISOString();
        if (paperRemaining !== undefined)
            machine.paperRemaining = Math.max(0, Math.floor(paperRemaining));
        if (tonerPercent !== undefined)
            machine.tonerLevelPercent = Math.max(0, Math.min(100, Math.floor(tonerPercent)));
        (0, databaseService_1.saveMachine)(machine);
        return machine;
    }
    static deductPaper(machineId, sheets) {
        const machine = (0, databaseService_1.loadMachine)(machineId);
        if (!machine)
            return false;
        machine.paperRemaining = Math.max(0, machine.paperRemaining - sheets);
        (0, databaseService_1.saveMachine)(machine);
        return true;
    }
}
exports.MachineService = MachineService;
