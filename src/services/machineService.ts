import { MachineInfo } from '../types';
import { config } from '../config';

const STALE_THRESHOLD_MS = 90 * 1000; // 90 seconds without heartbeat → offline

export class MachineService {
  private static machines: Map<string, MachineInfo> = new Map();

  static {
    // Initialize default machine
    this.machines.set(config.defaultMachineId, {
      id: config.defaultMachineId,
      name: `Machine ${config.defaultMachineId}`,
      location: config.defaultMachineLocation,
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
  private static refreshOnlineStatus(machine: MachineInfo): MachineInfo {
    const elapsed = Date.now() - new Date(machine.lastHeartbeat).getTime();
    machine.isOnline = elapsed < STALE_THRESHOLD_MS;
    return machine;
  }

  public static getMachine(id: string): MachineInfo | undefined {
    const machine = this.machines.get(id);
    if (machine) this.refreshOnlineStatus(machine);
    return machine;
  }

  public static getAllMachines(): MachineInfo[] {
    return Array.from(this.machines.values()).map(m => this.refreshOnlineStatus(m));
  }

  public static updateHeartbeat(id: string, paperRemaining?: number, tonerPercent?: number): MachineInfo {
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
    if (paperRemaining !== undefined) machine.paperRemaining = Math.max(0, Math.floor(paperRemaining));
    if (tonerPercent !== undefined) machine.tonerLevelPercent = Math.max(0, Math.min(100, Math.floor(tonerPercent)));

    return machine;
  }

  public static deductPaper(machineId: string, sheets: number): boolean {
    const machine = this.machines.get(machineId);
    if (!machine) return false;
    machine.paperRemaining = Math.max(0, machine.paperRemaining - sheets);
    return true;
  }
}
