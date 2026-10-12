"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MachineService = void 0;
const config_1 = require("../config");
const STALE_THRESHOLD_MS = 90 * 1000; // 90 seconds without heartbeat → offline
class MachineService {
    static machines = new Map();
    static {
        // Initialize default machine
        this.machines.set(config_1.config.defaultMachineId, {
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
    /**
     * Check if a machine's heartbeat is stale and update isOnline accordingly
     */
    static refreshOnlineStatus(machine) {
        const elapsed = Date.now() - new Date(machine.lastHeartbeat).getTime();
        machine.isOnline = elapsed < STALE_THRESHOLD_MS;
        return machine;
    }
    static getMachine(id) {
        const machine = this.machines.get(id);
        if (machine)
            this.refreshOnlineStatus(machine);
        return machine;
    }
    static getAllMachines() {
        return Array.from(this.machines.values()).map(m => this.refreshOnlineStatus(m));
    }
    static updateHeartbeat(id, paperRemaining, tonerPercent) {
        let machine = this.machines.get(id);
        if (!machine) {
            machine = {
                id,
                name: `Machine ${id}`,
                location: 'Campus Kiosk',
                isOnline: true,
                paperRemaining: paperRemaining ?? 500,
                maxPaperCapacity: 500,
                tonerLevelPercent: tonerPercent ?? 100,
                lastHeartbeat: new Date().toISOString()
            };
            this.machines.set(id, machine);
            return machine;
        }
        machine.isOnline = true;
        machine.lastHeartbeat = new Date().toISOString();
        if (paperRemaining !== undefined)
            machine.paperRemaining = Math.max(0, Math.floor(paperRemaining));
        if (tonerPercent !== undefined)
            machine.tonerLevelPercent = Math.max(0, Math.min(100, Math.floor(tonerPercent)));
        return machine;
    }
    static deductPaper(machineId, sheets) {
        const machine = this.machines.get(machineId);
        if (!machine)
            return false;
        machine.paperRemaining = Math.max(0, machine.paperRemaining - sheets);
        return true;
    }
}
exports.MachineService = MachineService;
