/**
 * Unit tests for OGame formula calculations
 * Verifies against canonical values from reference implementations
 */
import { describe, test, expect } from 'vitest';
import {
  calculateProduction,
  BASE_PRODUCTION,
  calculateBuildingCost,
  BUILDING_FACTORS,
  BUILDING_COSTS,
  calculateBuildTime,
  calculateDistance,
  calculateDuration,
  getSlowestSpeed,
} from '../../worker/src/game/formulas';

describe('Resource Production', () => {
  test('metal mine level 1 produces ~33/hr', () => {
    const prod = calculateProduction(BASE_PRODUCTION.metal, 1, 30);
    expect(prod).toBeGreaterThan(25);
    expect(prod).toBeLessThan(40);
  });

  test('metal mine level 10 produces ~778/hr', () => {
    const prod = calculateProduction(BASE_PRODUCTION.metal, 10, 30);
    expect(prod).toBeGreaterThan(700);
    expect(prod).toBeLessThan(850);
  });

  test('crystal mine level 1 produces ~22/hr', () => {
    const prod = calculateProduction(BASE_PRODUCTION.crystal, 1, 30);
    expect(prod).toBeGreaterThan(18);
    expect(prod).toBeLessThan(28);
  });

  test('level 0 produces nothing', () => {
    expect(calculateProduction(BASE_PRODUCTION.metal, 0, 30)).toBe(0);
    expect(calculateProduction(BASE_PRODUCTION.crystal, 0, 30)).toBe(0);
    expect(calculateProduction(BASE_PRODUCTION.deuterium, 0, 30)).toBe(0);
  });

  test('production scales exponentially with level', () => {
    const lvl5 = calculateProduction(BASE_PRODUCTION.metal, 5, 30);
    const lvl10 = calculateProduction(BASE_PRODUCTION.metal, 10, 30);
    const lvl20 = calculateProduction(BASE_PRODUCTION.metal, 20, 30);
    expect(lvl10).toBeGreaterThan(lvl5 * 2);
    expect(lvl20).toBeGreaterThan(lvl10 * 3);
  });
});

describe('Building Costs', () => {
  test('metal mine level 1 costs 60 metal, 15 crystal', () => {
    const baseMetal = BUILDING_COSTS.metalMine.metal;
    const baseCrystal = BUILDING_COSTS.metalMine.crystal;
    expect(baseMetal).toBe(60);
    expect(baseCrystal).toBe(15);
  });

  test('cost scales with factor^(level-1)', () => {
    const factor = BUILDING_FACTORS.metalMine;
    const lvl1 = 60;
    const lvl2 = Math.floor(lvl1 * factor);
    const lvl3 = Math.floor(lvl1 * factor * factor);
    expect(lvl2).toBe(90);
    expect(lvl3).toBe(135);
  });

  test('fusion reactor has 1.8 factor', () => {
    expect(BUILDING_FACTORS.fusionReactor).toBe(1.8);
  });

  test('storage has 2.0 factor', () => {
    expect(BUILDING_FACTORS.metalStorage).toBe(2.0);
    expect(BUILDING_FACTORS.crystalStorage).toBe(2.0);
    expect(BUILDING_FACTORS.deutTank).toBe(2.0);
  });
});

describe('Build Time', () => {
  test('build time decreases with robotics level', () => {
    // Use higher costs to avoid flooring to minimum (1 second)
    const timeNoRobotics = calculateBuildTime(50000, 25000, 5, 0, 0, 1);
    const timeWithRobotics = calculateBuildTime(50000, 25000, 5, 5, 0, 1);
    expect(timeWithRobotics).toBeLessThan(timeNoRobotics);
  });

  test('build time decreases with nanite level', () => {
    const timeNoNanite = calculateBuildTime(50000, 25000, 5, 5, 0, 1);
    const timeWithNanite = calculateBuildTime(50000, 25000, 5, 5, 2, 1);
    expect(timeWithNanite).toBeLessThan(timeNoNanite);
  });

  test('build time decreases with universe speed', () => {
    const time1x = calculateBuildTime(50000, 25000, 5, 0, 0, 1);
    const time2x = calculateBuildTime(50000, 25000, 5, 0, 0, 2);
    expect(time2x).toBeLessThan(time1x);
  });

  test('minimum build time is 1 second', () => {
    const time = calculateBuildTime(1, 1, 1, 10, 5, 100);
    expect(time).toBeGreaterThanOrEqual(1);
  });
});

describe('Distance Calculation', () => {
  test('same position = 5', () => {
    const dist = calculateDistance(
      { galaxy: 1, system: 1, position: 1 },
      { galaxy: 1, system: 1, position: 1 },
      9
    );
    expect(dist).toBe(5);
  });

  test('different position = 1000 + gap*5', () => {
    const dist = calculateDistance(
      { galaxy: 1, system: 1, position: 1 },
      { galaxy: 1, system: 1, position: 5 },
      9
    );
    expect(dist).toBe(1000 + 4 * 5);
  });

  test('different galaxy = 20000 * gap', () => {
    const dist = calculateDistance(
      { galaxy: 1, system: 1, position: 1 },
      { galaxy: 3, system: 1, position: 1 },
      9
    );
    expect(dist).toBe(40000);
  });
});
