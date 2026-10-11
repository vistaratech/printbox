import { MachineInfo } from '../types';
import { config } from '../config';

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

  public static getMachine(id: string): MachineInfo | undefined {
    return this.machines.get(id);
  }

  public static getAllMachines(): MachineInfo[] {
    return Array.from(this.machines.values());
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
    if (paperRemaining !== undefined) machine.paperRemaining = paperRemaining;
    if (tonerPercent !== undefined) machine.tonerLevelPercent = tonerPercent;

    return machine;
  }

  public static deductPaper(machineId: string, sheets: number): boolean {
    const machine = this.machines.get(machineId);
    if (!machine) return false;
    machine.paperRemaining = Math.max(0, machine.paperRemaining - sheets);
    return true;
  }
}
