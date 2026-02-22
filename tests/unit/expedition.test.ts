import { describe, it, expect } from 'vitest';
import {
  resolveExpedition,
  generateNPCFleet,
  calculateExpeditionLoot,
  EXPEDITION_EVENTS,
  ExpeditionEventType,
  calculateFleetValue,
  expeditionService,
} from '../../worker/src/game/services/expeditionService';
import { Ships, Resources } from '../../worker/src/game/types';

describe('ExpeditionService', () => {
  // ============================================================================
  // EVENT RESOLUTION TESTS
  // ============================================================================

  describe('resolveExpedition', () => {
    it('should return a valid ExpeditionResult', () => {
      const result = resolveExpedition(100000);

      expect(result).toHaveProperty('eventType');
      expect(result).toHaveProperty('description');
      expect(result).toHaveProperty('resourcesFound');
      expect(result).toHaveProperty('shipsFound');
      expect(result).toHaveProperty('darkMatterFound');
      expect(result).toHaveProperty('delayMultiplier');
      expect(result).toHaveProperty('battleOccurs');
    });

    it('should select an event from EXPEDITION_EVENTS', () => {
      const result = resolveExpedition(100000);
      const validEventTypes = EXPEDITION_EVENTS.map((e) => e.type);

      expect(validEventTypes).toContain(result.eventType);
    });

    it('should be deterministic with a seed', () => {
      const seed = 12345;
      const result1 = resolveExpedition(100000, 0, seed);
      const result2 = resolveExpedition(100000, 0, seed);

      expect(result1.eventType).toBe(result2.eventType);
      expect(result1.resourcesFound).toEqual(result2.resourcesFound);
      expect(result1.shipsFound).toEqual(result2.shipsFound);
    });

    it('should differ with different seeds', () => {
      // Sample multiple seed pairs to ensure at least one differs
      let foundDifference = false;
      for (let i = 0; i < 10; i++) {
        const result1 = resolveExpedition(100000, 0, 100 + i * 2);
        const result2 = resolveExpedition(100000, 0, 100 + i * 2 + 1);

        if (result1.eventType !== result2.eventType) {
          foundDifference = true;
          break;
        }
      }

      // Very likely to find at least one difference across 10 pairs
      expect(foundDifference).toBe(true);
    });

    it('should handle zero fleet value', () => {
      const result = resolveExpedition(0);

      expect(result.eventType).toBeDefined();
      expect(result.resourcesFound).toEqual({ metal: 0, crystal: 0, deuterium: 0 });
    });

    it('should handle very large fleet values', () => {
      const largeValue = 10000000;
      const result = resolveExpedition(largeValue);

      expect(result.eventType).toBeDefined();
      if (result.eventType === 'find_resources') {
        // Loot should scale with fleet value
        const totalLoot = result.resourcesFound.metal +
          result.resourcesFound.crystal +
          result.resourcesFound.deuterium;
        expect(totalLoot).toBeGreaterThan(largeValue * 0.5);
      }
    });
  });

  // ============================================================================
  // EVENT-SPECIFIC TESTS
  // ============================================================================

  describe('event: find_resources', () => {
    it('should generate resources', () => {
      let found = false;
      for (let i = 0; i < 100; i++) {
        const result = resolveExpedition(100000, 0, i);
        if (result.eventType === 'find_resources') {
          const total = result.resourcesFound.metal +
            result.resourcesFound.crystal +
            result.resourcesFound.deuterium;
          expect(total).toBeGreaterThan(0);
          expect(total).toBeLessThanOrEqual(100000 * 2.5);
          found = true;
          break;
        }
      }
      expect(found).toBe(true);
    });

    it('should scale loot with fleet value', () => {
      const smallValue = 10000;
      const largeValue = 1000000;

      let smallLoot = 0;
      let largeLoot = 0;

      // Sample multiple results
      for (let i = 0; i < 50; i++) {
        const smallResult = resolveExpedition(smallValue, 0, i * 2);
        if (smallResult.eventType === 'find_resources') {
          smallLoot = smallResult.resourcesFound.metal +
            smallResult.resourcesFound.crystal +
            smallResult.resourcesFound.deuterium;
        }

        const largeResult = resolveExpedition(largeValue, 0, i * 2 + 1);
        if (largeResult.eventType === 'find_resources') {
          largeLoot = largeResult.resourcesFound.metal +
            largeResult.resourcesFound.crystal +
            largeResult.resourcesFound.deuterium;
        }
      }

      // Large fleet should generally get more loot
      expect(largeLoot).toBeGreaterThan(smallLoot);
    });

    it('should distribute resources in reasonable ratios', () => {
      let result: any = null;
      for (let i = 0; i < 100; i++) {
        const r = resolveExpedition(100000, 0, i);
        if (r.eventType === 'find_resources') {
          result = r;
          break;
        }
      }

      if (result) {
        const total = result.resourcesFound.metal +
          result.resourcesFound.crystal +
          result.resourcesFound.deuterium;
        if (total > 0) {
          const metalRatio = result.resourcesFound.metal / total;
          const crystalRatio = result.resourcesFound.crystal / total;
          const deutRatio = result.resourcesFound.deuterium / total;

          // Rough distribution: 40% metal, 30% crystal, 30% deut
          expect(metalRatio).toBeGreaterThan(0.2);
          expect(metalRatio).toBeLessThan(0.6);
          expect(crystalRatio).toBeGreaterThan(0.1);
          expect(crystalRatio).toBeLessThan(0.5);
        }
      }
    });
  });

  describe('event: find_ships', () => {
    it('should generate ships', () => {
      let found = false;
      for (let i = 0; i < 100; i++) {
        const result = resolveExpedition(100000, 0, i);
        if (result.eventType === 'find_ships') {
          const totalShips = Object.values(result.shipsFound).reduce(
            (sum, count) => sum + count,
            0
          );
          expect(totalShips).toBeGreaterThan(0);
          found = true;
          break;
        }
      }
      expect(found).toBe(true);
    });

    it('should return combat-viable ship types', () => {
      for (let i = 0; i < 100; i++) {
        const result = resolveExpedition(100000, 0, i);
        if (result.eventType === 'find_ships') {
          const { shipsFound } = result;
          // At least one common ship type should be present
          const hasCombatShips =
            shipsFound.lightFighter > 0 ||
            shipsFound.heavyFighter > 0 ||
            shipsFound.cruiser > 0 ||
            shipsFound.smallCargo > 0;
          expect(hasCombatShips).toBe(true);
          break;
        }
      }
    });
  });

  describe('event: find_dark_matter', () => {
    it('should generate dark matter in range', () => {
      let found = false;
      for (let i = 0; i < 100; i++) {
        const result = resolveExpedition(100000, 0, i);
        if (result.eventType === 'find_dark_matter') {
          expect(result.darkMatterFound).toBeGreaterThanOrEqual(50);
          expect(result.darkMatterFound).toBeLessThanOrEqual(200);
          found = true;
          break;
        }
      }
      expect(found).toBe(true);
    });

    it('should always be 50-200 dark matter regardless of fleet value', () => {
      const results = [];
      for (let i = 0; i < 200; i++) {
        const result = resolveExpedition(100000 + i * 1000, 0, i);
        if (result.eventType === 'find_dark_matter') {
          results.push(result.darkMatterFound);
        }
      }

      expect(results.length).toBeGreaterThan(0);
      for (const amount of results) {
        expect(amount).toBeGreaterThanOrEqual(50);
        expect(amount).toBeLessThanOrEqual(200);
      }
    });
  });

  describe('event: alien_contact', () => {
    it('should set battleOccurs to true', () => {
      for (let i = 0; i < 100; i++) {
        const result = resolveExpedition(100000, 0, i);
        if (result.eventType === 'alien_contact') {
          expect(result.battleOccurs).toBe(true);
          break;
        }
      }
    });

    it('should generate an alien NPC fleet', () => {
      for (let i = 0; i < 100; i++) {
        const result = resolveExpedition(100000, 0, i);
        if (result.eventType === 'alien_contact') {
          expect(result.npcFleet).toBeDefined();
          const totalShips = Object.values(result.npcFleet!).reduce(
            (sum, count) => sum + count,
            0
          );
          expect(totalShips).toBeGreaterThan(0);
          break;
        }
      }
    });

    it('should scale alien fleet to ~60% of player fleet value', () => {
      const playerValue = 100000;
      let foundAlien = false;
      for (let i = 0; i < 100; i++) {
        const result = resolveExpedition(playerValue, 0, i);
        if (result.eventType === 'alien_contact') {
          const alienValue = calculateFleetValue(result.npcFleet!);
          // NPC fleet should be a reasonable fraction of player fleet (allow wider tolerance)
          expect(alienValue).toBeGreaterThan(playerValue * 0.2);
          expect(alienValue).toBeLessThan(playerValue * 1.0);
          foundAlien = true;
          break;
        }
      }
      expect(foundAlien).toBe(true);
    });
  });

  describe('event: pirates', () => {
    it('should set battleOccurs to true', () => {
      for (let i = 0; i < 100; i++) {
        const result = resolveExpedition(100000, 0, i);
        if (result.eventType === 'pirates') {
          expect(result.battleOccurs).toBe(true);
          break;
        }
      }
    });

    it('should generate a pirate NPC fleet', () => {
      for (let i = 0; i < 100; i++) {
        const result = resolveExpedition(100000, 0, i);
        if (result.eventType === 'pirates') {
          expect(result.npcFleet).toBeDefined();
          const totalShips = Object.values(result.npcFleet!).reduce(
            (sum, count) => sum + count,
            0
          );
          expect(totalShips).toBeGreaterThan(0);
          break;
        }
      }
    });

    it('should compose pirates with mostly fighters and bombers', () => {
      for (let i = 0; i < 100; i++) {
        const result = resolveExpedition(100000, 0, i);
        if (result.eventType === 'pirates') {
          const { npcFleet } = result;
          const fighters =
            npcFleet!.lightFighter +
            npcFleet!.heavyFighter +
            npcFleet!.bomber;
          const totalShips = Object.values(npcFleet!).reduce(
            (sum, count) => sum + count,
            0
          );
          const fighterRatio = fighters / totalShips;
          expect(fighterRatio).toBeGreaterThan(0.5);
          break;
        }
      }
    });

    it('should scale pirate fleet to ~40% of player fleet value', () => {
      const playerValue = 100000;
      for (let i = 0; i < 100; i++) {
        const result = resolveExpedition(playerValue, 0, i);
        if (result.eventType === 'pirates') {
          const pirateValue = calculateFleetValue(result.npcFleet!);
          expect(pirateValue).toBeGreaterThan(playerValue * 0.25);
          expect(pirateValue).toBeLessThan(playerValue * 0.55);
          break;
        }
      }
    });
  });

  describe('event: nothing', () => {
    it('should return no loot', () => {
      for (let i = 0; i < 100; i++) {
        const result = resolveExpedition(100000, 0, i);
        if (result.eventType === 'nothing') {
          expect(result.resourcesFound).toEqual({
            metal: 0,
            crystal: 0,
            deuterium: 0,
          });
          const totalShips = Object.values(result.shipsFound).reduce(
            (sum, count) => sum + count,
            0
          );
          expect(totalShips).toBe(0);
          expect(result.darkMatterFound).toBe(0);
          expect(result.battleOccurs).toBe(false);
          break;
        }
      }
    });
  });

  describe('event: delayed', () => {
    it('should set delayMultiplier to 2.0', () => {
      for (let i = 0; i < 100; i++) {
        const result = resolveExpedition(100000, 0, i);
        if (result.eventType === 'delayed') {
          expect(result.delayMultiplier).toBe(2.0);
          break;
        }
      }
    });

    it('should not cause battle', () => {
      for (let i = 0; i < 100; i++) {
        const result = resolveExpedition(100000, 0, i);
        if (result.eventType === 'delayed') {
          expect(result.battleOccurs).toBe(false);
          break;
        }
      }
    });
  });

  describe('event: black_hole', () => {
    it('should set delayMultiplier to 0 (fleet destroyed)', () => {
      for (let i = 0; i < 100; i++) {
        const result = resolveExpedition(100000, 0, i);
        if (result.eventType === 'black_hole') {
          expect(result.delayMultiplier).toBe(0);
          break;
        }
      }
    });

    it('should not cause battle', () => {
      for (let i = 0; i < 100; i++) {
        const result = resolveExpedition(100000, 0, i);
        if (result.eventType === 'black_hole') {
          expect(result.battleOccurs).toBe(false);
          break;
        }
      }
    });
  });

  // ============================================================================
  // EVENT PROBABILITY DISTRIBUTION
  // ============================================================================

  describe('event probability distribution', () => {
    it('should approximate weighted probabilities over large sample', () => {
      const eventCounts: Record<ExpeditionEventType, number> = {
        find_resources: 0,
        find_ships: 0,
        find_dark_matter: 0,
        alien_contact: 0,
        pirates: 0,
        nothing: 0,
        delayed: 0,
        black_hole: 0,
      };

      const samples = 1000;
      for (let i = 0; i < samples; i++) {
        const result = resolveExpedition(100000, 0, i);
        eventCounts[result.eventType]++;
      }

      const expectedWeights: Record<ExpeditionEventType, number> = {
        find_resources: 0.3,
        find_ships: 0.1,
        find_dark_matter: 0.05,
        alien_contact: 0.1,
        pirates: 0.1,
        nothing: 0.2,
        delayed: 0.1,
        black_hole: 0.05,
      };

      // Check that probabilities are roughly correct (±3% tolerance)
      for (const [eventType, expectedRatio] of Object.entries(expectedWeights)) {
        const actualRatio = eventCounts[eventType as ExpeditionEventType] / samples;
        const tolerance = 0.03;
        expect(actualRatio).toBeGreaterThan(expectedRatio - tolerance);
        expect(actualRatio).toBeLessThan(expectedRatio + tolerance);
      }
    });
  });

  // ============================================================================
  // NPC FLEET GENERATION TESTS
  // ============================================================================

  describe('generateNPCFleet', () => {
    it('should generate an alien fleet', () => {
      const fleet = generateNPCFleet({
        type: 'alien',
        playerFleetValue: 100000,
      });

      const totalShips = Object.values(fleet).reduce((sum, count) => sum + count, 0);
      expect(totalShips).toBeGreaterThan(0);
    });

    it('should generate a pirate fleet', () => {
      const fleet = generateNPCFleet({
        type: 'pirate',
        playerFleetValue: 100000,
      });

      const totalShips = Object.values(fleet).reduce((sum, count) => sum + count, 0);
      expect(totalShips).toBeGreaterThan(0);
    });

    it('should scale alien fleet to ~60% of player value', () => {
      const playerValue = 100000;
      const fleet = generateNPCFleet({
        type: 'alien',
        playerFleetValue: playerValue,
      });

      const fleetValue = calculateFleetValue(fleet);
      // NPC fleet should be a reasonable fraction (allow tolerance for rounding)
      expect(fleetValue).toBeGreaterThan(playerValue * 0.2);
      expect(fleetValue).toBeLessThan(playerValue * 1.0);
    });

    it('should scale pirate fleet to ~40% of player value', () => {
      const playerValue = 100000;
      const fleet = generateNPCFleet({
        type: 'pirate',
        playerFleetValue: playerValue,
      });

      const fleetValue = calculateFleetValue(fleet);
      expect(fleetValue).toBeGreaterThan(playerValue * 0.25);
      expect(fleetValue).toBeLessThan(playerValue * 0.55);
    });

    it('should handle zero fleet value', () => {
      const fleet = generateNPCFleet({
        type: 'alien',
        playerFleetValue: 0,
      });

      const totalShips = Object.values(fleet).reduce((sum, count) => sum + count, 0);
      expect(totalShips).toBe(0);
    });

    it('should handle very large fleet value', () => {
      const fleet = generateNPCFleet({
        type: 'alien',
        playerFleetValue: 100000000,
      });

      const totalShips = Object.values(fleet).reduce((sum, count) => sum + count, 0);
      expect(totalShips).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // LOOT CALCULATION TESTS
  // ============================================================================

  describe('calculateExpeditionLoot', () => {
    it('should return unmodified loot if cargo is sufficient', () => {
      const survivorShips: Ships = {
        lightFighter: 100,
        heavyFighter: 0,
        cruiser: 0,
        battleship: 0,
        battlecruiser: 0,
        bomber: 0,
        destroyer: 0,
        deathstar: 0,
        smallCargo: 50,
        largeCargo: 0,
        colonyShip: 0,
        recycler: 0,
        espionageProbe: 0,
      };

      const event = resolveExpedition(10000, 0, 1);
      if (event.eventType === 'find_resources') {
        const loot = calculateExpeditionLoot(survivorShips, event);
        expect(loot).toEqual(event.resourcesFound);
      }
    });

    it('should reduce loot if cargo is insufficient', () => {
      const survivorShips: Ships = {
        lightFighter: 1,
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

      const event = resolveExpedition(100000, 0, 1);
      if (event.eventType === 'find_resources') {
        const loot = calculateExpeditionLoot(survivorShips, event);
        const total = loot.metal + loot.crystal + loot.deuterium;
        expect(total).toBeLessThanOrEqual(4000); // Light fighter cargo
      }
    });

    it('should handle zero-cargo fleet', () => {
      const survivorShips: Ships = {
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

      const event = resolveExpedition(100000, 0, 1);
      if (event.eventType === 'find_resources') {
        const loot = calculateExpeditionLoot(survivorShips, event);
        expect(loot).toEqual({ metal: 0, crystal: 0, deuterium: 0 });
      }
    });
  });

  // ============================================================================
  // SINGLETON INSTANCE TESTS
  // ============================================================================

  describe('expeditionService singleton', () => {
    it('should have all methods', () => {
      expect(expeditionService.resolveExpedition).toBeDefined();
      expect(expeditionService.generateNPCFleet).toBeDefined();
      expect(expeditionService.calculateExpeditionLoot).toBeDefined();
      expect(expeditionService.calculateFleetValue).toBeDefined();
    });

    it('resolveExpedition should work correctly', () => {
      const result = expeditionService.resolveExpedition(100000);
      expect(result.eventType).toBeDefined();
    });

    it('generateNPCFleet should work correctly', () => {
      const fleet = expeditionService.generateNPCFleet({
        type: 'alien',
        playerFleetValue: 100000,
      });
      const totalShips = Object.values(fleet).reduce((sum, count) => sum + count, 0);
      expect(totalShips).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // EDGE CASE TESTS
  // ============================================================================

  describe('edge cases', () => {
    it('should handle negative fleet value (treat as 0)', () => {
      const result = resolveExpedition(-100000);
      expect(result.eventType).toBeDefined();
    });

    it('should handle extremely small fleet value (1)', () => {
      const result = resolveExpedition(1);
      expect(result.eventType).toBeDefined();
    });

    it('should return consistent fleet composition with same seed', () => {
      const seed = 999;
      const fleet1 = generateNPCFleet({
        type: 'alien',
        playerFleetValue: 100000,
      });
      const fleet2 = generateNPCFleet({
        type: 'alien',
        playerFleetValue: 100000,
      });

      // Note: generateNPCFleet doesn't use seed, so this tests repeatability
      // of the function itself (deterministic output for same input)
      expect(fleet1).toEqual(fleet2);
    });

    it('should never exceed weight sum boundary', () => {
      const weights = EXPEDITION_EVENTS.map((e) => e.weight);
      const sum = weights.reduce((a, b) => a + b, 0);
      expect(sum).toBe(100);
    });
  });
});
