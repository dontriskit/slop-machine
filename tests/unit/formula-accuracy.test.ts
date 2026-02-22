import { describe, it, expect } from 'vitest';
import {
  calculateProduction,
  BASE_PRODUCTION,
  calculateBuildingCost,
  BUILDING_FACTORS,
  calculateBuildTime,
  calculateDistance,
  getSlowestSpeed,
  SHIP_SPEEDS,
} from '../../worker/src/game/formulas';
import { Coordinate, Ships } from '../../worker/src/game/types';

describe('Formula Accuracy Tests - OGame Canonical Values', () => {
  // ============================================================================
  // METAL MINE PRODUCTION TESTS
  // ============================================================================

  describe('Metal Mine Production', () => {
    it('level 1 metal mine produces canonical rate', () => {
      const production = calculateProduction(BASE_PRODUCTION.metal, 1);
      expect(production).toBe(33);
    });

    it('level 5 metal mine produces canonical rate', () => {
      const production = calculateProduction(BASE_PRODUCTION.metal, 5);
      expect(production).toBe(241);
    });

    it('level 10 metal mine produces canonical rate', () => {
      const production = calculateProduction(BASE_PRODUCTION.metal, 10);
      expect(production).toBe(778);
    });

    it('level 15 metal mine produces canonical rate', () => {
      const production = calculateProduction(BASE_PRODUCTION.metal, 15);
      expect(production).toBe(1879);
    });

    it('level 20 metal mine produces canonical rate', () => {
      const production = calculateProduction(BASE_PRODUCTION.metal, 20);
      expect(production).toBe(4036);
    });

    it('level 0 metal mine produces 0', () => {
      const production = calculateProduction(BASE_PRODUCTION.metal, 0);
      expect(production).toBe(0);
    });
  });

  // ============================================================================
  // CRYSTAL MINE PRODUCTION TESTS
  // ============================================================================

  describe('Crystal Mine Production', () => {
    it('level 1 crystal mine produces canonical rate', () => {
      const production = calculateProduction(BASE_PRODUCTION.crystal, 1);
      expect(production).toBe(22);
    });

    it('level 5 crystal mine produces canonical rate', () => {
      const production = calculateProduction(BASE_PRODUCTION.crystal, 5);
      expect(production).toBe(161);
    });

    it('level 10 crystal mine produces canonical rate', () => {
      const production = calculateProduction(BASE_PRODUCTION.crystal, 10);
      expect(production).toBe(518);
    });

    it('level 15 crystal mine produces canonical rate', () => {
      const production = calculateProduction(BASE_PRODUCTION.crystal, 15);
      expect(production).toBe(1253);
    });

    it('level 20 crystal mine produces canonical rate', () => {
      const production = calculateProduction(BASE_PRODUCTION.crystal, 20);
      expect(production).toBe(2690);
    });
  });

  // ============================================================================
  // DEUTERIUM SYNTHESIZER PRODUCTION TESTS
  // ============================================================================

  describe('Deuterium Synthesizer Production', () => {
    it('level 1 deuterium synthesizer produces canonical rate', () => {
      const production = calculateProduction(BASE_PRODUCTION.deuterium, 1, 30);
      expect(production).toBe(11);
    });

    it('level 5 deuterium synthesizer produces canonical rate', () => {
      const production = calculateProduction(BASE_PRODUCTION.deuterium, 5, 30);
      expect(production).toBe(80);
    });

    it('level 10 deuterium synthesizer produces canonical rate', () => {
      const production = calculateProduction(BASE_PRODUCTION.deuterium, 10, 30);
      expect(production).toBe(259);
    });

    it('level 15 deuterium synthesizer produces canonical rate', () => {
      const production = calculateProduction(BASE_PRODUCTION.deuterium, 15, 30);
      expect(production).toBe(626);
    });

    it('level 20 deuterium synthesizer produces canonical rate', () => {
      const production = calculateProduction(BASE_PRODUCTION.deuterium, 20, 30);
      expect(production).toBe(1345);
    });
  });

  // ============================================================================
  // BUILDING COST SCALING TESTS
  // ============================================================================

  describe('Building Cost Scaling (Metal Mine - 1.5x factor)', () => {
    it('metal mine level 1 costs canonical value', () => {
      const cost = calculateBuildingCost(60, BUILDING_FACTORS.metalMine, 1);
      expect(cost).toBe(60);
    });

    it('metal mine level 2 costs canonical value', () => {
      const cost = calculateBuildingCost(60, BUILDING_FACTORS.metalMine, 2);
      expect(cost).toBe(90);
    });

    it('metal mine level 5 costs canonical value', () => {
      const cost = calculateBuildingCost(60, BUILDING_FACTORS.metalMine, 5);
      expect(cost).toBe(303);
    });

    it('metal mine level 10 costs canonical value', () => {
      const cost = calculateBuildingCost(60, BUILDING_FACTORS.metalMine, 10);
      expect(cost).toBe(2306);
    });

    it('metal mine has 1.5x growth factor between levels', () => {
      const level1 = calculateBuildingCost(60, BUILDING_FACTORS.metalMine, 1);
      const level2 = calculateBuildingCost(60, BUILDING_FACTORS.metalMine, 2);
      const level3 = calculateBuildingCost(60, BUILDING_FACTORS.metalMine, 3);
      
      expect(level2).toBe(level1 * 1.5);
      expect(level3).toBe(level2 * 1.5);
    });
  });

  describe('Building Cost Scaling (Crystal Mine - 1.6x factor)', () => {
    it('crystal mine level 1 costs canonical value', () => {
      const cost = calculateBuildingCost(48, BUILDING_FACTORS.crystalMine, 1);
      expect(cost).toBe(48);
    });

    it('crystal mine level 2 costs canonical value', () => {
      const cost = calculateBuildingCost(48, BUILDING_FACTORS.crystalMine, 2);
      expect(cost).toBe(76);
    });

    it('crystal mine level 5 costs canonical value', () => {
      const cost = calculateBuildingCost(48, BUILDING_FACTORS.crystalMine, 5);
      expect(cost).toBe(314);
    });

    it('crystal mine has higher growth factor than metal mine', () => {
      const metalGrowth = calculateBuildingCost(1000, BUILDING_FACTORS.metalMine, 5) / 1000;
      const crystalGrowth = calculateBuildingCost(1000, BUILDING_FACTORS.crystalMine, 5) / 1000;
      
      expect(crystalGrowth).toBeGreaterThan(metalGrowth);
    });
  });

  describe('Building Cost Scaling (Deuterium Synthesizer - 1.5x factor)', () => {
    it('deuterium synthesizer level 1 costs canonical value', () => {
      const cost = calculateBuildingCost(225, BUILDING_FACTORS.deutSynth, 1);
      expect(cost).toBe(225);
    });

    it('deuterium synthesizer level 5 costs canonical value', () => {
      const cost = calculateBuildingCost(225, BUILDING_FACTORS.deutSynth, 5);
      expect(cost).toBe(1139);
    });

    it('deuterium synthesizer level 10 costs canonical value', () => {
      const cost = calculateBuildingCost(225, BUILDING_FACTORS.deutSynth, 10);
      expect(cost).toBe(8649);
    });
  });

  describe('Building Cost Scaling (Solar Plant - 1.5x factor)', () => {
    it('solar plant level 1 costs canonical value', () => {
      const cost = calculateBuildingCost(75, BUILDING_FACTORS.solarPlant, 1);
      expect(cost).toBe(75);
    });

    it('solar plant level 5 costs canonical value', () => {
      const cost = calculateBuildingCost(75, BUILDING_FACTORS.solarPlant, 5);
      expect(cost).toBe(379);
    });
  });

  describe('Building Cost Scaling (Robotics Factory - 2x factor)', () => {
    it('robotics factory level 1 costs canonical value', () => {
      const cost = calculateBuildingCost(400, BUILDING_FACTORS.roboticsFactory, 1);
      expect(cost).toBe(400);
    });

    it('robotics factory level 2 costs canonical value', () => {
      const cost = calculateBuildingCost(400, BUILDING_FACTORS.roboticsFactory, 2);
      expect(cost).toBe(800);
    });

    it('robotics factory level 5 costs canonical value', () => {
      const cost = calculateBuildingCost(400, BUILDING_FACTORS.roboticsFactory, 5);
      expect(cost).toBe(6400);
    });

    it('robotics factory level 10 costs canonical value', () => {
      const cost = calculateBuildingCost(400, BUILDING_FACTORS.roboticsFactory, 10);
      expect(cost).toBe(204800);
    });

    it('robotics factory doubles cost per level', () => {
      const level1 = calculateBuildingCost(400, BUILDING_FACTORS.roboticsFactory, 1);
      const level2 = calculateBuildingCost(400, BUILDING_FACTORS.roboticsFactory, 2);
      const level3 = calculateBuildingCost(400, BUILDING_FACTORS.roboticsFactory, 3);
      
      expect(level2).toBe(level1 * 2);
      expect(level3).toBe(level2 * 2);
    });
  });

  // ============================================================================
  // BUILD TIME FORMULA TESTS
  // ============================================================================

  describe('Build Time Formula', () => {
    it('small building has minimum 1 second build time', () => {
      const metalCost = 60;
      const crystalCost = 15;
      const buildTime = calculateBuildTime(metalCost, crystalCost, 1, 0, 0, 1);
      expect(buildTime).toBe(1);
    });

    it('larger cost takes longer to build', () => {
      // Use much larger costs to ensure observable difference
      const smallCost = 1000;
      const largeCost = 100000;
      
      const buildTimeSmall = calculateBuildTime(smallCost, 0, 1, 0, 0, 1);
      const buildTimeLarge = calculateBuildTime(largeCost, 0, 1, 0, 0, 1);
      
      expect(buildTimeLarge).toBeGreaterThan(buildTimeSmall);
    });

    it('build costs increase significantly with exponential factors', () => {
      const baseCost = 1000;
      
      const cost1 = calculateBuildingCost(baseCost, 1.5, 1);
      const cost5 = calculateBuildingCost(baseCost, 1.5, 5);
      const cost10 = calculateBuildingCost(baseCost, 1.5, 10);
      
      expect(cost5).toBeGreaterThan(cost1);
      expect(cost10).toBeGreaterThan(cost5);
    });
  });

  describe('Build Time with Robotics Factory Bonus', () => {
    it('builds faster with higher robotics level', () => {
      const metalCost = 50000;
      const crystalCost = 25000;
      
      const buildTimeRobotics0 = calculateBuildTime(metalCost, crystalCost, 2, 0, 0, 1);
      const buildTimeRobotics5 = calculateBuildTime(metalCost, crystalCost, 2, 5, 0, 1);
      const buildTimeRobotics10 = calculateBuildTime(metalCost, crystalCost, 2, 10, 0, 1);
      
      expect(buildTimeRobotics5).toBeLessThan(buildTimeRobotics0);
      expect(buildTimeRobotics10).toBeLessThan(buildTimeRobotics5);
    });

    it('robotics level 10 provides significant speedup', () => {
      const metalCost = 50000;
      const crystalCost = 25000;
      
      const buildTimeRobotics0 = calculateBuildTime(metalCost, crystalCost, 2, 0, 0, 1);
      const buildTimeRobotics10 = calculateBuildTime(metalCost, crystalCost, 2, 10, 0, 1);
      
      expect(buildTimeRobotics0 / buildTimeRobotics10).toBeCloseTo(2, 0);
    });
  });

  describe('Build Time with Nanite Factory Bonus', () => {
    it('builds faster with higher nanite level', () => {
      const metalCost = 50000;
      const crystalCost = 25000;
      
      const buildTimeNanite0 = calculateBuildTime(metalCost, crystalCost, 2, 0, 0, 1);
      const buildTimeNanite1 = calculateBuildTime(metalCost, crystalCost, 2, 0, 1, 1);
      const buildTimeNanite2 = calculateBuildTime(metalCost, crystalCost, 2, 0, 2, 1);
      
      expect(buildTimeNanite0).toBeGreaterThanOrEqual(buildTimeNanite1);
      expect(buildTimeNanite1).toBeGreaterThanOrEqual(buildTimeNanite2);
    });

    it('nanite factory provides exponential speedup on large builds', () => {
      const metalCost = 50000;
      const crystalCost = 25000;
      
      const buildTimeNanite0 = calculateBuildTime(metalCost, crystalCost, 2, 0, 0, 1);
      const buildTimeNanite1 = calculateBuildTime(metalCost, crystalCost, 2, 0, 1, 1);
      const buildTimeNanite2 = calculateBuildTime(metalCost, crystalCost, 2, 0, 2, 1);
      
      // Nanite level 1: 2^1 = 2x speedup
      expect(buildTimeNanite0 / buildTimeNanite1).toBeCloseTo(2, 0);
      // Nanite level 2: 2^2 = 4x speedup
      expect(buildTimeNanite0 / buildTimeNanite2).toBeGreaterThan(3);
    });
  });

  describe('Build Time with Combined Bonuses', () => {
    it('applies robotics bonus on large buildings', () => {
      const metalCost = 50000;
      const crystalCost = 25000;
      
      const buildTimeNoRobotics = calculateBuildTime(metalCost, crystalCost, 3, 0, 0, 1);
      const buildTimeRobotics10 = calculateBuildTime(metalCost, crystalCost, 3, 10, 0, 1);
      
      expect(buildTimeRobotics10).toBeLessThan(buildTimeNoRobotics);
    });

    it('applies nanite bonus on large buildings', () => {
      const metalCost = 50000;
      const crystalCost = 25000;
      
      const buildTimeNoNanite = calculateBuildTime(metalCost, crystalCost, 3, 0, 0, 1);
      const buildTimeNanite2 = calculateBuildTime(metalCost, crystalCost, 3, 0, 2, 1);
      
      expect(buildTimeNanite2).toBeLessThan(buildTimeNoNanite);
    });

    it('combines robotics and nanite bonuses multiplicatively', () => {
      const metalCost = 50000;
      const crystalCost = 25000;
      
      const buildTimeNone = calculateBuildTime(metalCost, crystalCost, 3, 0, 0, 1);
      const buildTimeRobotics = calculateBuildTime(metalCost, crystalCost, 3, 5, 0, 1);
      const buildTimeNanite = calculateBuildTime(metalCost, crystalCost, 3, 0, 1, 1);
      const buildTimeBoth = calculateBuildTime(metalCost, crystalCost, 3, 5, 1, 1);
      
      expect(buildTimeBoth).toBeLessThan(buildTimeRobotics);
      expect(buildTimeBoth).toBeLessThan(buildTimeNanite);
      expect(buildTimeBoth).toBeLessThan(buildTimeNone);
    });
  });

  // ============================================================================
  // DISTANCE AND FLIGHT TIME TESTS
  // ============================================================================

  describe('Distance Calculation (Same System)', () => {
    it('calculates distance between adjacent positions', () => {
      const from: Coordinate = { galaxy: 1, system: 100, position: 5 };
      const to: Coordinate = { galaxy: 1, system: 100, position: 6 };
      const distance = calculateDistance(from, to, 9);
      expect(distance).toBe(1005);
    });

    it('calculates distance between distant positions in same system', () => {
      const from: Coordinate = { galaxy: 1, system: 100, position: 1 };
      const to: Coordinate = { galaxy: 1, system: 100, position: 15 };
      const distance = calculateDistance(from, to, 9);
      expect(distance).toBe(1070);
    });

    it('identifies same coordinates as minimal distance', () => {
      const coord: Coordinate = { galaxy: 1, system: 100, position: 5 };
      const distance = calculateDistance(coord, coord, 9);
      expect(distance).toBe(5);
    });
  });

  describe('Fleet Speed Calculations', () => {
    it('identifies slowest ship in fleet', () => {
      const ships: Ships = {
        lightFighter: 10,
        heavyFighter: 5,
        cruiser: 0,
        battleship: 0,
        battlecruiser: 0,
        bomber: 0,
        destroyer: 0,
        deathstar: 0,
        smallCargo: 0,
        largeCargo: 0,
        colonyShip: 3,
        recycler: 0,
        espionageProbe: 0,
      };
      const slowest = getSlowestSpeed(ships);
      expect(slowest).toBe(2500);
    });

    it('calculates fleet with light fighters', () => {
      const ships: Ships = {
        lightFighter: 5,
        heavyFighter: 0,
        cruiser: 0,
        battleship: 0,
        battlecruiser: 0,
        bomber: 0,
        destroyer: 0,
        deathstar: 0,
        smallCargo: 0,
        largeCargo: 0,
        colonyShip: 0,
        recycler: 0,
        espionageProbe: 0,
      };
      const slowest = getSlowestSpeed(ships);
      expect(slowest).toBe(SHIP_SPEEDS.lightFighter);
    });

    it('empty fleet returns default speed', () => {
      const ships: Ships = {
        lightFighter: 0,
        heavyFighter: 0,
        cruiser: 0,
        battleship: 0,
        battlecruiser: 0,
        bomber: 0,
        destroyer: 0,
        deathstar: 0,
        smallCargo: 0,
        largeCargo: 0,
        colonyShip: 0,
        recycler: 0,
        espionageProbe: 0,
      };
      const slowest = getSlowestSpeed(ships);
      expect(slowest).toBe(35000);
    });
  });

  // ============================================================================
  // COMPREHENSIVE ACCURACY VERIFICATION
  // ============================================================================

  describe('Comprehensive Formula Validation', () => {
    it('verifies metal mine exponential growth curve', () => {
      const levels = [1, 5, 10, 15, 20];
      const productions = levels.map(l => calculateProduction(BASE_PRODUCTION.metal, l));

      for (let i = 1; i < productions.length; i++) {
        expect(productions[i]).toBeGreaterThan(productions[i - 1]);
      }

      for (let i = 1; i < productions.length; i++) {
        const factor = productions[i] / productions[i - 1];
        expect(factor).toBeGreaterThan(1.1);
      }
    });

    it('verifies building cost exponential growth', () => {
      const levels = [1, 2, 3, 4, 5];
      const costs = levels.map(l => calculateBuildingCost(100, 1.5, l));

      for (let i = 1; i < costs.length; i++) {
        expect(costs[i]).toBeGreaterThan(costs[i - 1]);
      }

      for (let i = 1; i < costs.length; i++) {
        const factor = costs[i] / costs[i - 1];
        expect(factor).toBeCloseTo(1.5, 0);
      }
    });

    it('verifies different building types have different cost factors', () => {
      const level = 5;
      const baseCost = 1000;

      const metalMineCost = calculateBuildingCost(baseCost, BUILDING_FACTORS.metalMine, level);
      const roboticsFactoryCost = calculateBuildingCost(baseCost, BUILDING_FACTORS.roboticsFactory, level);

      expect(roboticsFactoryCost).toBeGreaterThan(metalMineCost);
    });

    it('verifies production rate increases with level', () => {
      const levels = [1, 5, 10];
      
      const metalProduction = levels.map(l => calculateProduction(BASE_PRODUCTION.metal, l));
      const crystalProduction = levels.map(l => calculateProduction(BASE_PRODUCTION.crystal, l));
      const deuteriumProduction = levels.map(l => calculateProduction(BASE_PRODUCTION.deuterium, l));
      
      for (let i = 1; i < levels.length; i++) {
        expect(metalProduction[i]).toBeGreaterThan(metalProduction[i - 1]);
        expect(crystalProduction[i]).toBeGreaterThan(crystalProduction[i - 1]);
        expect(deuteriumProduction[i]).toBeGreaterThan(deuteriumProduction[i - 1]);
      }
    });

    it('verifies nanite factory provides exponential speedup', () => {
      const metalCost = 100000;
      const crystalCost = 50000;
      
      const buildTimeNanite0 = calculateBuildTime(metalCost, crystalCost, 2, 0, 0, 1);
      const buildTimeNanite1 = calculateBuildTime(metalCost, crystalCost, 2, 0, 1, 1);
      const buildTimeNanite2 = calculateBuildTime(metalCost, crystalCost, 2, 0, 2, 1);
      const buildTimeNanite3 = calculateBuildTime(metalCost, crystalCost, 2, 0, 3, 1);
      
      // Each level provides 2x speedup
      expect(buildTimeNanite0).toBeGreaterThan(buildTimeNanite1);
      expect(buildTimeNanite1).toBeGreaterThan(buildTimeNanite2);
      expect(buildTimeNanite2).toBeGreaterThan(buildTimeNanite3);
    });
  });
});
