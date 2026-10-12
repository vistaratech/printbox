"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PricingService = void 0;
const config_1 = require("../config");
class PricingService {
    /**
     * Parse range text (e.g. "1-5, 8, 11-13") and calculate number of selected pages
     */
    static countPages(totalPages, range, rangeText) {
        if (range !== 'custom' || !rangeText || !rangeText.trim()) {
            return Math.max(1, totalPages);
        }
        const set = new Set();
        const parts = rangeText.split(',');
        for (const p of parts) {
            const trimmed = p.trim();
            const match = trimmed.match(/^(\d+)(?:-(\d+))?$/);
            if (!match)
                continue;
            let a = parseInt(match[1], 10);
            let b = match[2] ? parseInt(match[2], 10) : a;
            if (a > b)
                [a, b] = [b, a];
            const start = Math.max(a, 1);
            const end = Math.min(b, totalPages);
            for (let i = start; i <= end; i++) {
                set.add(i);
            }
        }
        return set.size > 0 ? set.size : Math.max(1, totalPages);
    }
    /**
     * Accurately calculate the pricing breakdown for a print job
     */
    static calculate(options, filePages) {
        const selectedPages = this.countPages(filePages, options.range, options.rangeText);
        const pps = options.pps || 1;
        const copies = Math.max(1, options.copies || 1);
        // Number of sheets needed per copy after pages-per-sheet division
        const sheetsPerCopy = Math.ceil(selectedPages / pps);
        // Physical paper sheets used (divided by 2 if double-sided)
        const paperPerCopy = options.sides === 'double' ? Math.ceil(sheetsPerCopy / 2) : sheetsPerCopy;
        const totalPaperSheets = paperPerCopy * copies;
        // Base price per page
        const baseRate = options.color === 'color'
            ? config_1.config.pricing.baseRateColor
            : config_1.config.pricing.baseRateBw;
        const sizeMultiplier = config_1.config.pricing.sizeMultipliers[options.size] || 1.0;
        const qualityExtra = options.quality === 'high' ? config_1.config.pricing.highQualityExtra : 0;
        let pricePerPage = (baseRate * sizeMultiplier) + qualityExtra;
        // Apply 10% discount if double-sided
        if (options.sides === 'double') {
            pricePerPage *= config_1.config.pricing.doubleSideDiscountMultiplier;
        }
        // Print cost: sheetsPerCopy * copies * pricePerPage
        const printPrice = Number((sheetsPerCopy * copies * pricePerPage).toFixed(2));
        // Staple cost: Rs 2 per copy
        const staplePrice = options.staple ? Number((config_1.config.pricing.stapleRatePerCopy * copies).toFixed(2)) : 0;
        const totalPrice = Number((printPrice + staplePrice).toFixed(2));
        return {
            selectedPages,
            sheetsPerCopy,
            totalPaperSheets,
            pricePerPage: Number(pricePerPage.toFixed(2)),
            printPrice,
            staplePrice,
            totalPrice
        };
    }
}
exports.PricingService = PricingService;
