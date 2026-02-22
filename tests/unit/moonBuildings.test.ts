/**
 * Moon Building Service Unit Tests
 *
 * Tests for lunar base, sensor phalanx, and jump gate mechanics.
 */

import { describe, it, expect } from 'vitest';
import {
  calculateMoonBuildingCost,
  calculateMoonBuildingBuildTime,
  calculateMoonAvailableFields,
  calculatePhalanxRange,
  isPhalanxInRange,
  validateJumpGateTransfer,
  validateMoonBuildingSpace,
  getMoonBuildingSummary,
} from '../../worker/src/game/services/moonBuildingService';

describe('Moon Building Service', () => {
  describe('Lunar Base', () => {
    it('calculates cost for level 1', () => {
      const cost = calculateMoonBuildingCost('lunarBase', 1);
      expect(cost.metal).toBe(5000);
      expect(cost.crystal).toBe(2500);
      expect(cost.deuterium).toBe(0);
    });

    it('calculates cost for level 2 (2× multiplier)', () => {
      const cost = calculateMoonBuildingCost('lunarBase', 2);
      // baseMetal × 2^(2-1) = 5000 × 2
      expect(cost.metal).toBe(10000);
      expect(cost.crystal).toBe(5000);
    });

    it('calculates cost for level 3 (4× multiplier)', () => {
      const cost = calculateMoonBuildingCost('lunarBase', 3);
      // baseMetal × 2^(3-1) = 5000 × 4
      expect(cost.metal).toBe(20000);
      expect(cost.crystal).toBe(10000);
    });

    it('costs scale exponentially', () => {
      const cost1 = calculateMoonBuildingCost('lunarBase', 1);
      const cost2 = calculateMoonBuildingCost('lunarBase', 2);
      const cost3 = calculateMoonBuildingCost('lunarBase', 3);

      expect(cost2.metal).toBe(cost1.metal * 2);
      expect(cost3.metal).toBe(cost2.metal * 2);
    });

    it('provides +3 fields per level', () => {
      const baseMoonFields = 5000;

      expect(calculateMoonAvailableFields(baseMoonFields, 0)).toBe(5000);
      expect(calculateMoonAvailableFields(baseMoonFields, 1)).toBe(5003);
      expect(calculateMoonAvailableFields(baseMoonFields, 5)).toBe(5015);
      expect(calculateMoonAvailableFields(baseMoonFields, 10)).toBe(5030);
    });
  });

  describe('Sensor Phalanx', () => {
    it('calculates range as level²', () => {
      expect(calculatePhalanxRange(1)).toBe(1);
      expect(calculatePhalanxRange(2)).toBe(4);
      expect(calculatePhalanxRange(3)).toBe(9);
      expect(calculatePhalanxRange(4)).toBe(16);
      expect(calculatePhalanxRange(5)).toBe(25);
    });

    it('detects target in same galaxy within range', () => {
      // Phalanx at galaxy 1, system 100, level 3 (range 9)
      const inRange = isPhalanxInRange(1, 100, 1, 105, 3); // 5 systems away
      expect(inRange).toBe(true);

      const outOfRange = isPhalanxInRange(1, 100, 1, 115, 3); // 15 systems away
      expect(outOfRange).toBe(false);
    });

    it('detects nothing across galaxies', () => {
      // Different galaxy = always out of range
      const result = isPhalanxInRange(1, 100, 2, 100, 5); // High level, different galaxy
      expect(result).toBe(false);
    });

    it('validates bidirectional distance', () => {
      const level = 2; // Range 4
      const phalanxSystem = 100;

      // Distance 4 (at edge of range)
      expect(isPhalanxInRange(1, phalanxSystem, 1, phalanxSystem + 4, level)).toBe(true);
      expect(isPhalanxInRange(1, phalanxSystem, 1, phalanxSystem - 4, level)).toBe(true);

      // Distance 5 (outside range)
      expect(isPhalanxInRange(1, phalanxSystem, 1, phalanxSystem + 5, level)).toBe(false);
    });

    it('detects at exact distance', () => {
      const level = 3; // Range 9
      expect(isPhalanxInRange(1, 100, 1, 100, level)).toBe(true); // Same position
      expect(isPhalanxInRange(1, 100, 1, 109, level)).toBe(true); // 9 systems away
      expect(isPhalanxInRange(1, 100, 1, 110, level)).toBe(false); // 10 systems away
    });

    it('costs more than lunar base but less than jump gate', () => {
      const lunarBase = calculateMoonBuildingCost('lunarBase', 1);
      const phalanx = calculateMoonBuildingCost('sensorPhalanx', 1);
      const jumpGate = calculateMoonBuildingCost('jumpGate', 1);

      expect(phalanx.metal).toBeGreaterThan(lunarBase.metal);
      expect(phalanx.metal).toBeLessThan(jumpGate.metal);
    });
  });

  describe('Jump Gate', () => {
    it('requires level 1+ to operate', () => {
      const now = Math.floor(Date.now() / 1000);

      const result0 = validateJumpGateTransfer(0, null, now);
      expect(result0.valid).toBe(false);
      expect(result0.reason).toContain('level 0');

      const result1 = validateJumpGateTransfer(1, null, now);
      expect(result1.valid).toBe(true);
    });

    it('enforces 1-hour cooldown', () => {
      const now = Math.floor(Date.now() / 1000);
      const lastJump = now - 1800; // 30 minutes ago

      const result = validateJumpGateTransfer(1, lastJump, now);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('cooldown');
    });

    it('allows jump after cooldown expires', () => {
      const now = Math.floor(Date.now() / 1000);
      const lastJump = now - 3601; // 1 hour + 1 second ago

      const result = validateJumpGateTransfer(1, lastJump, now);
      expect(result.valid).toBe(true);
    });

    it('allows first jump (no previous jump)', () => {
      const now = Math.floor(Date.now() / 1000);

      const result = validateJumpGateTransfer(1, null, now);
      expect(result.valid).toBe(true);
    });

    it('has highest cost (advanced tech)', () => {
      const lunar = calculateMoonBuildingCost('lunarBase', 1);
      const phalanx = calculateMoonBuildingCost('sensorPhalanx', 1);
      const jumpGate = calculateMoonBuildingCost('jumpGate', 1);

      expect(jumpGate.metal).toBeGreaterThan(phalanx.metal);
      expect(jumpGate.crystal).toBeGreaterThan(phalanx.crystal);
      expect(jumpGate.deuterium).toBeGreaterThan(phalanx.deuterium);
    });
  });

  describe('Build Time Calculations', () => {
    it('calculates base build time', () => {
      // Build time for lunar base level 1
      const time = calculateMoonBuildingBuildTime('lunarBase', 1);
      expect(time).toBeGreaterThan(0);
      expect(Number.isInteger(time)).toBe(true);
    });

    it('build time increases with robotics factory', () => {
      const time0 = calculateMoonBuildingBuildTime('lunarBase', 2, 0, 0);
      const time5 = calculateMoonBuildingBuildTime('lunarBase', 2, 5, 0);
      const time10 = calculateMoonBuildingBuildTime('lunarBase', 2, 10, 0);

      expect(time5).toBeLessThan(time0);
      expect(time10).toBeLessThan(time5);
    });

    it('build time decreases with nanite factory', () => {
      const time0 = calculateMoonBuildingBuildTime('lunarBase', 2, 0, 0);
      const time5 = calculateMoonBuildingBuildTime('lunarBase', 2, 0, 5);
      const time10 = calculateMoonBuildingBuildTime('lunarBase', 2, 0, 10);

      expect(time5).toBeLessThan(time0);
      expect(time10).toBeLessThan(time5);
    });

    it('modifiers stack multiplicatively', () => {
      const timeBase = calculateMoonBuildingBuildTime('lunarBase', 3, 0, 0);
      const timeBoth = calculateMoonBuildingBuildTime('lunarBase', 3, 5, 5);

      expect(timeBoth).toBeLessThan(timeBase);
    });

    it('higher levels take longer to build', () => {
      const level1 = calculateMoonBuildingBuildTime('sensorPhalanx', 1, 0, 0);
      const level2 = calculateMoonBuildingBuildTime('sensorPhalanx', 2, 0, 0);
      const level3 = calculateMoonBuildingBuildTime('sensorPhalanx', 3, 0, 0);

      expect(level2).toBeGreaterThan(level1);
      expect(level3).toBeGreaterThan(level2);
    });
  });

  describe('Field Occupancy', () => {
    it('validates building space (simplified 1 field per building)', () => {
      const result = validateMoonBuildingSpace(100, [
        { type: 'lunarBase', level: 1, occupiedFields: 1 },
        { type: 'sensorPhalanx', level: 1, occupiedFields: 1 },
      ]);

      expect(result.usedFields).toBe(2);
      expect(result.freeFields).toBe(98);
      expect(result.valid).toBe(true);
    });

    it('detects when moon is full', () => {
      const buildings = Array.from({ length: 100 }, (_, i) => ({
        type: 'lunarBase' as const,
        level: 1,
        occupiedFields: 1,
      }));

      const result = validateMoonBuildingSpace(100, buildings);
      expect(result.usedFields).toBe(100);
      expect(result.freeFields).toBe(0);
      expect(result.valid).toBe(false);
    });
  });

  describe('Moon Building Summary', () => {
    it('provides complete building status', () => {
      const summary = getMoonBuildingSummary(
        { lunarBase: 2, sensorPhalanx: 1, jumpGate: 0 },
        5000 // Base moon fields
      );

      expect(summary.lunarBase.level).toBe(2);
      expect(summary.lunarBase.cost.metal).toBeGreaterThan(0);
      expect(summary.sensorPhalanx.range).toBe(1); // Level 1 phalanx = 1² = 1
      expect(summary.jumpGate.level).toBe(0);
      expect(summary.availableFields).toBe(5006); // 5000 + 2×3
    });

    it('reflects next build costs', () => {
      const summary = getMoonBuildingSummary({ lunarBase: 1, sensorPhalanx: 0, jumpGate: 0 }, 5000);

      // Should show costs for level 2 (next level)
      const level2Cost = calculateMoonBuildingCost('lunarBase', 2);
      expect(summary.lunarBase.cost.metal).toBe(level2Cost.metal);
      expect(summary.lunarBase.cost.crystal).toBe(level2Cost.crystal);
    });

    it('applies robotics/nanite modifiers to build times', () => {
      const summaryNoMods = getMoonBuildingSummary(
        { lunarBase: 1, sensorPhalanx: 0, jumpGate: 0 },
        5000,
        0,
        0
      );

      const summaryWithMods = getMoonBuildingSummary(
        { lunarBase: 1, sensorPhalanx: 0, jumpGate: 0 },
        5000,
        10,
        10
      );

      expect(summaryWithMods.lunarBase.buildTime).toBeLessThan(summaryNoMods.lunarBase.buildTime);
    });
  });

  describe('Edge Cases', () => {
    it('handles invalid level 0', () => {
      expect(() => calculateMoonBuildingCost('lunarBase', 0)).toThrow();
    });

    it('handles negative levels', () => {
      expect(() => calculateMoonBuildingCost('lunarBase', -1)).toThrow();
    });

    it('handles very high levels', () => {
      const cost = calculateMoonBuildingCost('lunarBase', 20);
      expect(cost.metal).toBeGreaterThan(0);
      expect(Number.isInteger(cost.metal)).toBe(true);
    });

    it('moon with 0 fields can still build (1 building occupies space)', () => {
      // Edge case: moon created with minimal fields
      const result = validateMoonBuildingSpace(1, []);
      expect(result.valid).toBe(true);
      expect(result.freeFields).toBe(1);
    });
  });
});
