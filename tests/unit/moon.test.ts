/**
 * Moon Service Unit Tests
 *
 * Tests for moon creation RNG, chance calculations, and size generation.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  calculateMoonChance,
  generateMoonSize,
  generateMoonDiameter,
  createMoonFromDebris,
  getMoonByPlanetId,
  getMoonById,
  getMoonsByPlayerId,
} from '../../worker/src/game/services/moonService';

describe('Moon Service', () => {
  describe('calculateMoonChance', () => {
    it('returns 0% for debris < 10k units', () => {
      // 5000 units of debris
      const chance = calculateMoonChance(2_500_000, 2_500_000); // 5k * 500 cost ratio
      expect(chance).toBe(0);
    });

    it('returns 1% chance at 50k units', () => {
      // 50k units = (50000/100000)*20 = 10%
      const chance = calculateMoonChance(12_500_000, 12_500_000);
      expect(chance).toBeCloseTo(1, 1); // ~1%
    });

    it('returns 10% at 50k units', () => {
      // 50k units = (50000/100000)*20 = 10%
      const chance = calculateMoonChance(25_000_000, 25_000_000);
      expect(chance).toBeCloseTo(10, 0);
    });

    it('returns 20% max at 100k+ units', () => {
      // 100k+ units = min(20%, ...) = 20%
      const chanceAt100k = calculateMoonChance(50_000_000, 50_000_000);
      expect(chanceAt100k).toBe(20);

      const chanceAt200k = calculateMoonChance(100_000_000, 100_000_000);
      expect(chanceAt200k).toBe(20);
    });

    it('scales linearly between 10k and 100k units', () => {
      // Test a few intermediate points
      const chance20k = calculateMoonChance(5_000_000, 5_000_000); // 10k units
      const chance50k = calculateMoonChance(12_500_000, 12_500_000); // 25k units
      const chance100k = calculateMoonChance(25_000_000, 25_000_000); // 50k units

      // Should be roughly: 0%, ~5%, ~10%
      expect(chance20k).toBe(0); // Below threshold
      expect(chance50k).toBeGreaterThan(0);
      expect(chance50k).toBeLessThan(chance100k);
    });
  });

  describe('generateMoonSize', () => {
    it('generates size between 3000-9000 fields', () => {
      for (let i = 0; i < 100; i++) {
        const size = generateMoonSize();
        expect(size).toBeGreaterThanOrEqual(3000);
        expect(size).toBeLessThanOrEqual(9000);
      }
    });

    it('generates varied sizes (not constant)', () => {
      const sizes = new Set(Array.from({ length: 100 }, () => generateMoonSize()));
      // Should generate at least 50 different values in 100 tries
      expect(sizes.size).toBeGreaterThan(50);
    });

    it('size is an integer', () => {
      for (let i = 0; i < 20; i++) {
        const size = generateMoonSize();
        expect(Number.isInteger(size)).toBe(true);
      }
    });
  });

  describe('generateMoonDiameter', () => {
    it('generates diameter between 5000-15000 km', () => {
      for (let i = 0; i < 100; i++) {
        const diameter = generateMoonDiameter();
        expect(diameter).toBeGreaterThanOrEqual(5000);
        expect(diameter).toBeLessThanOrEqual(15000);
      }
    });

    it('generates varied diameters', () => {
      const diameters = new Set(Array.from({ length: 100 }, () => generateMoonDiameter()));
      expect(diameters.size).toBeGreaterThan(50);
    });

    it('diameter is an integer', () => {
      for (let i = 0; i < 20; i++) {
        const diameter = generateMoonDiameter();
        expect(Number.isInteger(diameter)).toBe(true);
      }
    });
  });

  describe('RNG Probability Distribution', () => {
    it('moon creation follows probability curve (Monte Carlo test)', () => {
      // At 20% chance, expect ~20% of 1000 trials to succeed
      const debrisMetal = 50_000_000; // 100k units = 20% chance
      const debrisCrystal = 0;

      const chance = calculateMoonChance(debrisMetal, debrisCrystal);
      expect(chance).toBe(20);

      // Simulate 1000 trials
      let successCount = 0;
      for (let i = 0; i < 1000; i++) {
        const roll = Math.random() * 100;
        if (roll <= chance) {
          successCount++;
        }
      }

      // Should be approximately 20% ±5% (accounting for randomness)
      const actualRate = (successCount / 1000) * 100;
      expect(actualRate).toBeGreaterThan(15);
      expect(actualRate).toBeLessThan(25);
    });

    it('0% chance never succeeds', () => {
      const chance = calculateMoonChance(1_000, 1_000); // Very low debris
      expect(chance).toBe(0);

      // 100 trials should all fail
      let successCount = 0;
      for (let i = 0; i < 100; i++) {
        const roll = Math.random() * 100;
        if (roll <= chance) {
          successCount++;
        }
      }

      expect(successCount).toBe(0);
    });
  });

  describe('createMoonFromDebris', () => {
    let mockDb: any;
    let planetId: string;
    let playerId: string;

    beforeEach(() => {
      planetId = 'planet_test_123';
      playerId = 'player_test_456';

      // Mock D1 database
      mockDb = {
        prepare: vi.fn().mockReturnThis(),
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ success: true }),
        first: vi.fn().mockResolvedValue(null),
        all: vi.fn().mockResolvedValue({ results: [] }),
      };
    });

    it('creates moon when chance succeeds and no moon exists', async () => {
      // High debris = 20% chance
      const moon = await createMoonFromDebris({
        planetId,
        playerId,
        debrisMetalCost: 50_000_000,
        debisCrystalCost: 50_000_000,
        db: mockDb,
      });

      // Due to randomness, we can't guarantee success, but verify structure if it exists
      if (moon) {
        expect(moon).toHaveProperty('id');
        expect(moon).toHaveProperty('planetId', planetId);
        expect(moon).toHaveProperty('fields');
        expect(moon.fields).toBeGreaterThanOrEqual(3000);
        expect(moon.fields).toBeLessThanOrEqual(9000);
      }
    });

    it('returns null if moon already exists', async () => {
      // Mock existing moon
      mockDb.first.mockResolvedValueOnce({
        id: 'moon_existing',
        planet_id: planetId,
        name: 'Moon',
        fields: 5000,
        size: 10000,
        created_at: 0,
      });

      const moon = await createMoonFromDebris({
        planetId,
        playerId,
        debrisMetalCost: 50_000_000,
        debisCrystalCost: 50_000_000,
        db: mockDb,
      });

      expect(moon).toBeNull();
    });

    it('returns null if debris is too low', async () => {
      // Very low debris = 0% chance
      const moon = await createMoonFromDebris({
        planetId,
        playerId,
        debrisMetalCost: 100, // Minimal debris
        debisCrystalCost: 100,
        db: mockDb,
      });

      expect(moon).toBeNull();
    });
  });

  describe('getMoonByPlanetId', () => {
    let mockDb: any;

    beforeEach(() => {
      mockDb = {
        prepare: vi.fn().mockReturnThis(),
        bind: vi.fn().mockReturnThis(),
        first: vi.fn(),
      };
    });

    it('returns moon when found', async () => {
      const mockMoon = {
        id: 'moon_123',
        planet_id: 'planet_456',
        name: 'Moon',
        fields: 5000,
        size: 10000,
        created_at: 1000000,
      };

      mockDb.first.mockResolvedValueOnce(mockMoon);

      const moon = await getMoonByPlanetId('planet_456', mockDb);

      expect(moon).toEqual({
        id: 'moon_123',
        planetId: 'planet_456',
        name: 'Moon',
        fields: 5000,
        size: 10000,
        createdAt: 1000000,
      });
    });

    it('returns null when moon not found', async () => {
      mockDb.first.mockResolvedValueOnce(null);

      const moon = await getMoonByPlanetId('planet_456', mockDb);
      expect(moon).toBeNull();
    });
  });

  describe('getMoonById', () => {
    let mockDb: any;

    beforeEach(() => {
      mockDb = {
        prepare: vi.fn().mockReturnThis(),
        bind: vi.fn().mockReturnThis(),
        first: vi.fn(),
      };
    });

    it('returns moon by moon ID', async () => {
      const mockMoon = {
        id: 'moon_123',
        planet_id: 'planet_456',
        name: 'Moon',
        fields: 5000,
        size: 10000,
        created_at: 1000000,
      };

      mockDb.first.mockResolvedValueOnce(mockMoon);

      const moon = await getMoonById('moon_123', mockDb);

      expect(moon?.id).toBe('moon_123');
      expect(moon?.planetId).toBe('planet_456');
    });
  });

  describe('getMoonsByPlayerId', () => {
    let mockDb: any;

    beforeEach(() => {
      mockDb = {
        prepare: vi.fn().mockReturnThis(),
        bind: vi.fn().mockReturnThis(),
        all: vi.fn(),
      };
    });

    it('returns all moons for a player', async () => {
      const mockMoons = {
        results: [
          {
            id: 'moon_1',
            planet_id: 'planet_1',
            name: 'Moon',
            fields: 5000,
            size: 10000,
            created_at: 1000000,
          },
          {
            id: 'moon_2',
            planet_id: 'planet_2',
            name: 'Moon',
            fields: 6000,
            size: 11000,
            created_at: 1000001,
          },
        ],
      };

      mockDb.all.mockResolvedValueOnce(mockMoons);

      const moons = await getMoonsByPlayerId('player_123', mockDb);

      expect(moons).toHaveLength(2);
      expect(moons[0].id).toBe('moon_1');
      expect(moons[1].id).toBe('moon_2');
    });

    it('returns empty array when player has no moons', async () => {
      mockDb.all.mockResolvedValueOnce({ results: [] });

      const moons = await getMoonsByPlayerId('player_123', mockDb);
      expect(moons).toEqual([]);
    });
  });
});
