import { Router, Request, Response } from 'express';
import { MachineService } from '../services/machineService';
import { config } from '../config';

const router = Router();

/**
 * GET /api/machines
 * List all vending machines
 */
router.get('/', (_req: Request, res: Response) => {
  const machines = MachineService.getAllMachines();
  return res.json({ success: true, machines });
});

/**
 * GET /api/machines/:machineId
 * Get details and paper status of a specific machine
 */
router.get('/:machineId', (req: Request, res: Response) => {
  const machine = MachineService.getMachine(String(req.params.machineId));
  if (!machine) {
    return res.status(404).json({ error: 'Machine not found' });
  }
  return res.json({ success: true, machine });
});

/**
 * GET /api/pricing
 * Get current base pricing rules
 */
router.get('/config/pricing', (_req: Request, res: Response) => {
  return res.json({
    success: true,
    pricing: config.pricing
  });
});

export default router;
