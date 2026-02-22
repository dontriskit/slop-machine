/**
 * Unit tests for Battle Simulator Service
 * Tests Monte Carlo simulation, break-even fleet calculation, and fleet comparison.
 */
import { describe, test, expect } from 'vitest';
import {
  simulateBattlePreview,
  getBreakEvenFleet,
  compareFleetCompositions,
  BattleSimulationResult,
  BattleSimulatorService,
  battleSimulatorService,
} from '../../worker/src/game/services/battleSimulatorService';
import type { Ships } from '../../worker/src/game/types';
import type { DefenseStructures } from '../../worker/src/game/defenses';
import type { CombatTechLevels } from '../../worker/src/game/services/battleService';

const emptyShips = (): Ships => ({
  lightFighter: 0, heavyFighter: 0, cruiser: 0, battleship: 0,
  battlecruiser: 0, bomber: 0, destroyer: 0, deathstar: 0,
  smallCargo: 0, largeCargo: 0, colonyShip: 0, recycler: 0,
  espionageProbe: 0,
});

const emptyDefenses = (): DefenseStructures => ({
  rocketLauncher: 0, lightLaser: 0, heavyLaser: 0, gaussCannon: 0,
  ionCannon: 0, plasmaTurret: 0, smallShieldDome: 0, largeShieldDome: 0,
  antiBallisticMissile: 0, interplanetaryMissile: 0,
});

const defaultTech = (): CombatTechLevels => ({
  weaponTech: 0, shieldingTech: 0, armorTech: 0,
});

describe('Battle Simulator Service', () => {

  // ===========================================================================
  // simulateBattlePreview
  // ===========================================================================

  describe('simulateBattlePreview', () => {

    test('returns valid structure with all required fields', () => {
      const attacker = { ...emptyShips(), lightFighter: 50 };
      const defender = { ...emptyShips(), lightFighter: 50 };
      const result = simulateBattlePreview(attacker, defender, undefined, defaultTech(), defaultTech(), 10);

      expect(result).toHaveProperty('winRate');
      expect(result).toHaveProperty('drawRate');
      expect(result).toHaveProperty('lossRate');
      expect(result).toHaveProperty('averageAttackerLosses');
      expect(result).toHaveProperty('averageDefenderLosses');
      expect(result).toHaveProperty('averageDebris');
      expect(result).toHaveProperty('roundDistribution');
      expect(result).toHaveProperty('confidenceInterval');
      expect(result).toHaveProperty('averageAttackerSurvivors');
      expect(result).toHaveProperty('averageDefenderSurvivors');
      expect(result).toHaveProperty('runs');
      expect(result.runs).toBe(10);
    });

    test('win rate + draw rate + loss rate equals 1.0', () => {
      const attacker = { ...emptyShips(), cruiser: 30 };
      const defender = { ...emptyShips(), lightFighter: 50 };
      const result = simulateBattlePreview(attacker, defender, undefined, defaultTech(), defaultTech(), 50);

      const total = result.winRate + result.drawRate + result.lossRate;
      expect(total).toBeCloseTo(1.0, 10);
    });

    test('overwhelming attacker has high win rate', () => {
      const attacker = { ...emptyShips(), battleship: 100 };
      const defender = { ...emptyShips(), lightFighter: 5 };
      const result = simulateBattlePreview(attacker, defender, undefined, defaultTech(), defaultTech(), 50);

      expect(result.winRate).toBeGreaterThanOrEqual(0.9);
    });

    test('overwhelming defender results in low attacker win rate', () => {
      const attacker = { ...emptyShips(), lightFighter: 1 };
      const defender = { ...emptyShips(), deathstar: 1 };
      const result = simulateBattlePreview(attacker, defender, undefined, defaultTech(), defaultTech(), 50);

      expect(result.winRate).toBe(0);
      expect(result.lossRate).toBe(1);
    });

    test('average losses are non-negative', () => {
      const attacker = { ...emptyShips(), cruiser: 20 };
      const defender = { ...emptyShips(), lightFighter: 50 };
      const result = simulateBattlePreview(attacker, defender, undefined, defaultTech(), defaultTech(), 30);

      expect(result.averageAttackerLosses.metal).toBeGreaterThanOrEqual(0);
      expect(result.averageAttackerLosses.crystal).toBeGreaterThanOrEqual(0);
      expect(result.averageAttackerLosses.deuterium).toBeGreaterThanOrEqual(0);
      expect(result.averageDefenderLosses.metal).toBeGreaterThanOrEqual(0);
      expect(result.averageDefenderLosses.crystal).toBeGreaterThanOrEqual(0);
      expect(result.averageDefenderLosses.deuterium).toBeGreaterThanOrEqual(0);
    });

    test('debris field is generated when ships are destroyed', () => {
      const attacker = { ...emptyShips(), cruiser: 20 };
      const defender = { ...emptyShips(), lightFighter: 50 };
      const result = simulateBattlePreview(attacker, defender, undefined, defaultTech(), defaultTech(), 30);

      // At least some debris should be generated (ships will be destroyed)
      expect(result.averageDebris.total).toBeGreaterThan(0);
    });

    test('defenses are included in simulation', () => {
      const attacker = { ...emptyShips(), lightFighter: 20 };
      const defender = emptyShips(); // No defender ships
      const defenses: DefenseStructures = {
        ...emptyDefenses(),
        rocketLauncher: 50,
        lightLaser: 20,
      };

      const resultNoDefense = simulateBattlePreview(attacker, defender, undefined, defaultTech(), defaultTech(), 30);
      const resultWithDefense = simulateBattlePreview(attacker, defender, defenses, defaultTech(), defaultTech(), 30);

      // With defenses, attacker should win less often
      expect(resultWithDefense.winRate).toBeLessThanOrEqual(resultNoDefense.winRate);
    });

    test('tech advantages affect outcomes', () => {
      // Use a scenario where attacker is slightly weaker — tech should flip the result
      const attacker = { ...emptyShips(), battleship: 10 };
      const defender = { ...emptyShips(), battleship: 15 };
      const highTech: CombatTechLevels = { weaponTech: 10, shieldingTech: 10, armorTech: 10 };
      const noTech = defaultTech();

      const resultWithTech = simulateBattlePreview(attacker, defender, undefined, highTech, noTech, 100);
      const resultNoTech = simulateBattlePreview(attacker, defender, undefined, noTech, noTech, 100);

      // With tech 10 advantage, attacker should win more than without any tech
      expect(resultWithTech.winRate).toBeGreaterThanOrEqual(resultNoTech.winRate);
      // And the attacker losses should be lower with tech advantage
      expect(resultWithTech.averageAttackerLosses.total).toBeLessThanOrEqual(
        resultNoTech.averageAttackerLosses.total + 1 // +1 for rounding tolerance
      );
    });

    test('round distribution sums to total runs', () => {
      const attacker = { ...emptyShips(), lightFighter: 50 };
      const defender = { ...emptyShips(), lightFighter: 50 };
      const result = simulateBattlePreview(attacker, defender, undefined, defaultTech(), defaultTech(), 30);

      const totalRounds = Object.values(result.roundDistribution).reduce((a, b) => a + b, 0);
      expect(totalRounds).toBe(30);
    });

    test('confidence interval contains the win rate', () => {
      const attacker = { ...emptyShips(), cruiser: 30 };
      const defender = { ...emptyShips(), lightFighter: 40 };
      const result = simulateBattlePreview(attacker, defender, undefined, defaultTech(), defaultTech(), 50);

      expect(result.confidenceInterval.lower).toBeLessThanOrEqual(result.winRate);
      expect(result.confidenceInterval.upper).toBeGreaterThanOrEqual(result.winRate);
      expect(result.confidenceInterval.mean).toBeCloseTo(result.winRate, 10);
    });

    test('runs are clamped to 1-1000 range', () => {
      const attacker = { ...emptyShips(), lightFighter: 10 };
      const defender = { ...emptyShips(), lightFighter: 10 };

      const result1 = simulateBattlePreview(attacker, defender, undefined, defaultTech(), defaultTech(), 0);
      expect(result1.runs).toBe(1);

      const result2 = simulateBattlePreview(attacker, defender, undefined, defaultTech(), defaultTech(), 5000);
      expect(result2.runs).toBe(1000);
    });

    test('attacker with no ships always loses', () => {
      const attacker = emptyShips();
      const defender = { ...emptyShips(), lightFighter: 10 };
      const result = simulateBattlePreview(attacker, defender, undefined, defaultTech(), defaultTech(), 20);

      expect(result.winRate).toBe(0);
      expect(result.lossRate).toBe(1);
    });

  });

  // ===========================================================================
  // getBreakEvenFleet
  // ===========================================================================

  describe('getBreakEvenFleet', () => {

    test('returns empty fleet for empty target', () => {
      const result = getBreakEvenFleet(undefined, emptyShips());
      expect(result.found).toBe(true);
      expect(result.achievedWinRate).toBe(1.0);
    });

    test('finds fleet against light defenders', () => {
      const targetFleet = { ...emptyShips(), lightFighter: 20 };
      const result = getBreakEvenFleet(undefined, targetFleet);

      expect(result.found).toBe(true);
      expect(result.achievedWinRate).toBeGreaterThanOrEqual(0.5);
      // The fleet should have some ships
      const hasAnyShips = Object.values(result.fleet).some(v => v && v > 0);
      expect(hasAnyShips).toBe(true);
    });

    test('finds fleet against defenses', () => {
      const defenses: DefenseStructures = {
        ...emptyDefenses(),
        rocketLauncher: 30,
        lightLaser: 10,
      };
      const result = getBreakEvenFleet(defenses, emptyShips());

      expect(result.found).toBe(true);
      expect(result.achievedWinRate).toBeGreaterThanOrEqual(0.5);
    });

    test('fleet cost is calculated correctly', () => {
      const targetFleet = { ...emptyShips(), lightFighter: 10 };
      const result = getBreakEvenFleet(undefined, targetFleet);

      if (result.found) {
        expect(result.fleetCost.metal).toBeGreaterThanOrEqual(0);
        expect(result.fleetCost.crystal).toBeGreaterThanOrEqual(0);
        expect(result.fleetCost.deuterium).toBeGreaterThanOrEqual(0);
        // Should have at least some metal cost (all combat ships cost metal)
        const totalCost = result.fleetCost.metal + result.fleetCost.crystal + result.fleetCost.deuterium;
        expect(totalCost).toBeGreaterThan(0);
      }
    });

    test('tech advantage reduces required fleet', () => {
      const targetFleet = { ...emptyShips(), cruiser: 20 };
      const noTech = defaultTech();
      const highTech: CombatTechLevels = { weaponTech: 10, shieldingTech: 10, armorTech: 10 };

      const resultNoTech = getBreakEvenFleet(undefined, targetFleet, noTech, noTech);
      const resultHighTech = getBreakEvenFleet(undefined, targetFleet, noTech, highTech);

      if (resultNoTech.found && resultHighTech.found) {
        // With tech advantage, fleet cost should be less (or equal in degenerate cases)
        expect(resultHighTech.fleetCost.metal + resultHighTech.fleetCost.crystal)
          .toBeLessThanOrEqual(resultNoTech.fleetCost.metal + resultNoTech.fleetCost.crystal + 1);
      }
    });

  });

  // ===========================================================================
  // compareFleetCompositions
  // ===========================================================================

  describe('compareFleetCompositions', () => {

    test('returns valid comparison structure', () => {
      const fleet1 = { ...emptyShips(), battleship: 10 };
      const fleet2 = { ...emptyShips(), cruiser: 20 };
      const result = compareFleetCompositions(fleet1, fleet2, defaultTech(), defaultTech(), 20);

      expect(result).toHaveProperty('fleet1WinRate');
      expect(result).toHaveProperty('fleet2WinRate');
      expect(result).toHaveProperty('drawRate');
      expect(result).toHaveProperty('fleet1AverageLosses');
      expect(result).toHaveProperty('fleet2AverageLosses');
      expect(result).toHaveProperty('winner');
      expect(result).toHaveProperty('margin');
      expect(result).toHaveProperty('runs');
    });

    test('identical fleets are roughly even', () => {
      const fleet = { ...emptyShips(), cruiser: 20 };
      const result = compareFleetCompositions(fleet, fleet, defaultTech(), defaultTech(), 50);

      // With identical fleets, the win rates should be similar
      expect(Math.abs(result.fleet1WinRate - result.fleet2WinRate)).toBeLessThan(0.3);
    });

    test('vastly superior fleet wins', () => {
      const bigFleet = { ...emptyShips(), deathstar: 5 };
      const smallFleet = { ...emptyShips(), lightFighter: 10 };
      const result = compareFleetCompositions(bigFleet, smallFleet, defaultTech(), defaultTech(), 30);

      expect(result.winner).toBe('fleet1');
      expect(result.fleet1WinRate).toBeGreaterThan(result.fleet2WinRate);
    });

    test('winner field reflects the stronger fleet', () => {
      const fleet1 = { ...emptyShips(), lightFighter: 5 };
      const fleet2 = { ...emptyShips(), deathstar: 2 };
      const result = compareFleetCompositions(fleet1, fleet2, defaultTech(), defaultTech(), 30);

      expect(result.winner).toBe('fleet2');
    });

    test('margin is non-negative', () => {
      const fleet1 = { ...emptyShips(), battleship: 10 };
      const fleet2 = { ...emptyShips(), cruiser: 20 };
      const result = compareFleetCompositions(fleet1, fleet2, defaultTech(), defaultTech(), 20);

      expect(result.margin).toBeGreaterThanOrEqual(0);
    });

  });

  // ===========================================================================
  // Service class
  // ===========================================================================

  describe('BattleSimulatorService class', () => {

    test('singleton instance exists', () => {
      expect(battleSimulatorService).toBeInstanceOf(BattleSimulatorService);
    });

    test('simulatePreview delegates correctly', () => {
      const attacker = { ...emptyShips(), cruiser: 10 };
      const defender = { ...emptyShips(), lightFighter: 20 };
      const result = battleSimulatorService.simulatePreview(attacker, defender, undefined, defaultTech(), defaultTech(), 10);

      expect(result.runs).toBe(10);
      expect(result.winRate + result.drawRate + result.lossRate).toBeCloseTo(1.0);
    });

    test('compareFleets delegates correctly', () => {
      const fleet1 = { ...emptyShips(), battleship: 5 };
      const fleet2 = { ...emptyShips(), cruiser: 10 };
      const result = battleSimulatorService.compareFleets(fleet1, fleet2, defaultTech(), defaultTech(), 10);

      expect(result.runs).toBe(10);
      expect(result).toHaveProperty('winner');
    });

  });

});
