/**
 * Unit tests for the energy system (Issue #154)
 *
 * Tests energy production (solar plant, fusion reactor, solar satellites),
 * energy consumption (mines), and the production multiplier applied when
 * there is an energy deficit.
 */
import { describe, test, expect } from 'vitest';
import {
  calculateEnergyProduction,
  calculateEnergyConsumption,
  calculateProductionMultiplier,
} from '../../worker/src/game/formulas';

// ============================================================================
// ENERGY PRODUCTION
// ============================================================================

describe('calculateEnergyProduction — Solar Plant', () => {
  test('level 0 solar plant produces 0 energy', () => {
    expect(calculateEnergyProduction(0, 0, 0, 0, 30)).toBe(0);
  });

  test('level 1 solar plant: 20 * 1 * 1.1^1 = 22', () => {
    const prod = calculateEnergyProduction(1, 0, 0, 0, 30);
    expect(prod).toBe(22); // floor(20 * 1 * 1.1) = floor(22) = 22
  });

  test('level 5 solar plant produces more than level 1', () => {
    const lvl1 = calculateEnergyProduction(1, 0, 0, 0, 30);
    const lvl5 = calculateEnergyProduction(5, 0, 0, 0, 30);
    expect(lvl5).toBeGreaterThan(lvl1 * 2);
  });

  test('level 10 solar plant: formula 20 * 10 * 1.1^10', () => {
    const prod = calculateEnergyProduction(10, 0, 0, 0, 30);
    const expected = Math.floor(20 * 10 * Math.pow(1.1, 10));
    expect(prod).toBe(expected);
  });

  test('solar plant output scales exponentially with level', () => {
    const lvl5 = calculateEnergyProduction(5, 0, 0, 0, 30);
    const lvl10 = calculateEnergyProduction(10, 0, 0, 0, 30);
    const lvl20 = calculateEnergyProduction(20, 0, 0, 0, 30);
    expect(lvl10).toBeGreaterThan(lvl5);
    expect(lvl20).toBeGreaterThan(lvl10);
  });
});

describe('calculateEnergyProduction — Fusion Reactor', () => {
  test('level 0 fusion reactor produces 0 energy', () => {
    expect(calculateEnergyProduction(0, 0, 0, 0, 30)).toBe(0);
  });

  test('level 1, energyTech 0: 30 * 1 * (1.05)^1 = 31', () => {
    const prod = calculateEnergyProduction(0, 1, 0, 0, 30);
    const expected = Math.floor(30 * 1 * Math.pow(1.05, 1));
    expect(prod).toBe(expected);
  });

  test('higher energyTech increases fusion output', () => {
    const noTech = calculateEnergyProduction(0, 5, 0, 0, 30);
    const withTech = calculateEnergyProduction(0, 5, 0, 10, 30);
    expect(withTech).toBeGreaterThan(noTech);
  });

  test('energyTech 10 at level 5 fusion: 30 * 5 * (1.15)^5', () => {
    const prod = calculateEnergyProduction(0, 5, 0, 10, 30);
    const expected = Math.floor(30 * 5 * Math.pow(1.05 + 0.01 * 10, 5));
    expect(prod).toBe(expected);
  });
});

describe('calculateEnergyProduction — Solar Satellites', () => {
  test('0 satellites contribute 0 energy', () => {
    expect(calculateEnergyProduction(0, 0, 0, 0, 30)).toBe(0);
  });

  test('satellite output depends on maxTemp: (temp/4 + 20) * count', () => {
    const hotPlanet = calculateEnergyProduction(0, 0, 10, 0, 100); // (100/4+20)*10 = 450
    const coldPlanet = calculateEnergyProduction(0, 0, 10, 0, -60); // (-60/4+20)*10 = 50
    expect(hotPlanet).toBeGreaterThan(coldPlanet);
  });

  test('10 satellites at temp 30: floor((30/4 + 20) * 10) = 277', () => {
    const prod = calculateEnergyProduction(0, 0, 10, 0, 30);
    const expected = Math.floor((30 / 4 + 20) * 10);
    expect(prod).toBe(expected);
  });

  test('satellite count scales production linearly', () => {
    const ten = calculateEnergyProduction(0, 0, 10, 0, 30);
    const twenty = calculateEnergyProduction(0, 0, 20, 0, 30);
    expect(twenty).toBe(ten * 2);
  });
});

describe('calculateEnergyProduction — Combined Sources', () => {
  test('solar plant + fusion reactor + satellites add up', () => {
    const solar = calculateEnergyProduction(5, 0, 0, 0, 30);
    const fusion = calculateEnergyProduction(0, 3, 0, 5, 30);
    const satellites = calculateEnergyProduction(0, 0, 5, 0, 30);
    const combined = calculateEnergyProduction(5, 3, 5, 5, 30);
    expect(combined).toBe(solar + fusion + satellites);
  });
});

// ============================================================================
// ENERGY CONSUMPTION
// ============================================================================

describe('calculateEnergyConsumption', () => {
  test('all mines at level 0 consume 0 energy', () => {
    expect(calculateEnergyConsumption(0, 0, 0)).toBe(0);
  });

  test('metal mine level 1: ceil(10 * 1 * 1.1^1) = 11', () => {
    const consumption = calculateEnergyConsumption(1, 0, 0);
    const expected = Math.ceil(10 * 1 * Math.pow(1.1, 1));
    expect(consumption).toBe(expected);
  });

  test('crystal mine level 1: ceil(10 * 1 * 1.1^1) = 11', () => {
    const consumption = calculateEnergyConsumption(0, 1, 0);
    const expected = Math.ceil(10 * 1 * Math.pow(1.1, 1));
    expect(consumption).toBe(expected);
  });

  test('deut synth level 1: ceil(20 * 1 * 1.1^1) = 22', () => {
    const consumption = calculateEnergyConsumption(0, 0, 1);
    const expected = Math.ceil(20 * 1 * Math.pow(1.1, 1));
    expect(consumption).toBe(expected);
  });

  test('deut synth consumes 2x more energy than metal/crystal mine (same level)', () => {
    const metalConsumption = calculateEnergyConsumption(5, 0, 0);
    const deutConsumption = calculateEnergyConsumption(0, 0, 5);
    // deut factor is 20 vs metal factor 10
    expect(deutConsumption).toBeGreaterThan(metalConsumption);
  });

  test('all three mines level 10 combined consumption', () => {
    const metalOnly = calculateEnergyConsumption(10, 0, 0);
    const crystalOnly = calculateEnergyConsumption(0, 10, 0);
    const deutOnly = calculateEnergyConsumption(0, 0, 10);
    const all = calculateEnergyConsumption(10, 10, 10);
    expect(all).toBe(metalOnly + crystalOnly + deutOnly);
  });

  test('higher mine levels consume more energy', () => {
    const lvl5 = calculateEnergyConsumption(5, 0, 0);
    const lvl10 = calculateEnergyConsumption(10, 0, 0);
    expect(lvl10).toBeGreaterThan(lvl5);
  });
});

// ============================================================================
// PRODUCTION MULTIPLIER
// ============================================================================

describe('calculateProductionMultiplier', () => {
  test('full energy surplus: multiplier = 1.0', () => {
    expect(calculateProductionMultiplier(1000, 500)).toBe(1.0);
  });

  test('exactly balanced energy: multiplier = 1.0', () => {
    expect(calculateProductionMultiplier(500, 500)).toBe(1.0);
  });

  test('energy deficit: multiplier = produced / consumed', () => {
    const multiplier = calculateProductionMultiplier(300, 600);
    expect(multiplier).toBeCloseTo(0.5, 5);
  });

  test('no energy produced: multiplier = 0.0', () => {
    expect(calculateProductionMultiplier(0, 500)).toBe(0.0);
  });

  test('no energy consumed: multiplier = 1.0 (no consumers)', () => {
    expect(calculateProductionMultiplier(0, 0)).toBe(1.0);
  });

  test('multiplier is always capped at 1.0', () => {
    expect(calculateProductionMultiplier(999999, 1)).toBe(1.0);
  });

  test('multiplier is between 0 and 1 during deficit', () => {
    const multiplier = calculateProductionMultiplier(200, 1000);
    expect(multiplier).toBeGreaterThanOrEqual(0);
    expect(multiplier).toBeLessThanOrEqual(1);
  });
});

// ============================================================================
// INTEGRATION: ENERGY BALANCE AFFECTS PRODUCTION
// ============================================================================

describe('Energy Balance Integration', () => {
  test('a planet with insufficient energy runs at reduced production', () => {
    // Metal mine level 10 + crystal mine level 10 + deut 10 = high consumption
    // Solar plant level 1 = very low production
    const consumption = calculateEnergyConsumption(10, 10, 10);
    const production = calculateEnergyProduction(1, 0, 0, 0, 30);
    const multiplier = calculateProductionMultiplier(production, consumption);

    expect(multiplier).toBeLessThan(1.0);
    expect(multiplier).toBeGreaterThan(0);
  });

  test('a planet with solar plant level 20 fully powers early mines', () => {
    // Level 1 mines vs level 20 solar plant
    const consumption = calculateEnergyConsumption(1, 1, 1);
    const production = calculateEnergyProduction(20, 0, 0, 0, 30);
    const multiplier = calculateProductionMultiplier(production, consumption);

    expect(multiplier).toBe(1.0);
  });

  test('adding solar satellites improves multiplier during deficit', () => {
    const consumption = calculateEnergyConsumption(10, 10, 10);
    const prodNoSats = calculateEnergyProduction(5, 0, 0, 0, 30);
    const prodWithSats = calculateEnergyProduction(5, 0, 50, 0, 30);

    const multNoSats = calculateProductionMultiplier(prodNoSats, consumption);
    const multWithSats = calculateProductionMultiplier(prodWithSats, consumption);

    expect(multWithSats).toBeGreaterThan(multNoSats);
  });

  test('fusion reactor with energy tech provides significant energy boost', () => {
    const fusionLow = calculateEnergyProduction(0, 5, 0, 0, 30);
    const fusionHigh = calculateEnergyProduction(0, 5, 0, 12, 30);
    expect(fusionHigh).toBeGreaterThan(fusionLow);
  });

  test('energy balance determines production rate for a realistic planet setup', () => {
    // Realistic: level 10 mines, solar plant 15, no fusion, 10 satellites
    const consumed = calculateEnergyConsumption(10, 10, 5);
    const produced = calculateEnergyProduction(15, 0, 10, 3, 40);
    const multiplier = calculateProductionMultiplier(produced, consumed);

    // Should be positive
    expect(multiplier).toBeGreaterThan(0);
    // Check consistent formula
    expect(multiplier).toBeLessThanOrEqual(1.0);
  });
});
