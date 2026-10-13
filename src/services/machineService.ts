import { MachineInfo } from '../types';
import { config } from '../config';
import { saveMachine, loadMachine } from './databaseService';

const STALE_THRESHOLD_MS = 90 * 1000;

export class MachineService {
  private static initialized = false;

  static {
    this.ensureDefault();
  }

  private static ensureDefault(): void {
    if (this.initialized) return;
    const existing = loadMachine(config.defaultMachineId);
    if (!existing) {
      saveMachine({
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
    this.initialized = true;
  }

  private static refreshOnlineStatus(machine: MachineInfo): MachineInfo {
    const elapsed = Date.now() - new Date(machine.lastHeartbeat).getTime();
    machine.isOnline = elapsed < STALE_THRESHOLD_MS;
    return machine;
  }

  public static getMachine(id: string): MachineInfo | undefined {
    this.ensureDefault();
    const machine = loadMachine(id);
    if (machine) return this.refreshOnlineStatus(machine);
    return undefined;
  }

  public static getAllMachines(): MachineInfo[] {
    this.ensureDefault();
    const m = loadMachine(config.defaultMachineId);
    return m ? [this.refreshOnlineStatus(m)] : [];
  }

  public static updateHeartbeat(id: string, paperRemaining?: number, tonerPercent?: number): MachineInfo {
    this.ensureDefault();
    let machine = loadMachine(id);
    if (!machine) {
      machine = { id, name: `Machine ${id}`, location: 'Campus Kiosk', isOnline: true, paperRemaining: paperRemaining ?? 500, maxPaperCapacity: 500, tonerLevelPercent: tonerPercent ?? 100, lastHeartbeat: new Date().toISOString() };
    }
    machine.isOnline = true;
    machine.lastHeartbeat = new Date().toISOString();
    if (paperRemaining !== undefined) machine.paperRemaining = Math.max(0, Math.floor(paperRemaining));
    if (tonerPercent !== undefined) machine.tonerLevelPercent = Math.max(0, Math.min(100, Math.floor(tonerPercent)));
    saveMachine(machine);
    return machine;
  }

  public static deductPaper(machineId: string, sheets: number): boolean {
    const machine = loadMachine(machineId);
    if (!machine) return false;
    machine.paperRemaining = Math.max(0, machine.paperRemaining - sheets);
    saveMachine(machine);
    return true;
  }
}
