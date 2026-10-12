"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const machineService_1 = require("../services/machineService");
const config_1 = require("../config");
const router = (0, express_1.Router)();
/**
 * GET /api/machines
 * List all vending machines
 */
router.get('/', (_req, res) => {
    const machines = machineService_1.MachineService.getAllMachines();
    return res.json({ success: true, machines });
});
/**
 * GET /api/machines/:machineId
 * Get details and paper status of a specific machine
 */
router.get('/:machineId', (req, res) => {
    const machine = machineService_1.MachineService.getMachine(String(req.params.machineId));
    if (!machine) {
        return res.status(404).json({ error: 'Machine not found' });
    }
    return res.json({ success: true, machine });
});
/**
 * GET /api/pricing
 * Get current base pricing rules
 */
router.get('/config/pricing', (_req, res) => {
    return res.json({
        success: true,
        pricing: config_1.config.pricing
    });
});
exports.default = router;
