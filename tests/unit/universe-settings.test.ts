/**
 * Unit tests for Universe Settings Service
 * Tests configuration management for speed multipliers and game rules
 */
import { describe, test, expect, beforeEach, vi } from 'vitest';
import {
  DEFAULT_UNIVERSE_SETTINGS,
  getUniverseSettings,
  updateUniverseSettings,
  resetUniverseSettings,
  UniverseSettings,
} from '../../worker/src/game/services/universeSettingsService';

// Mock D1Database for testing
class MockD1Database {
  private data: Map<string, string> = new Map();

  prepare(sql: string) {
    return {
      bind: (...args: unknown[]) => ({
        first: async () => {
          if (sql.includes('SELECT settings')) {
            const value = this.data.get('universe_settings');
            return value ? { settings: value } : null;
          }
          return null;
        },
        run: async () => {
          if (sql.includes('DELETE')) {
            this.data.delete('universe_settings');
          } else if (sql.includes('INSERT')) {
            const settingsArg = args[1] as string;
            this.data.set('universe_settings', settingsArg);
          }
          return {};
        },
      }),
      run: async () => {
        if (sql.includes('DELETE')) {
          this.data.delete('universe_settings');
        }
        return {};
      },
      first: async () => {
        if (sql.includes('SELECT settings')) {
          const value = this.data.get('universe_settings');
          return value ? { settings: value } : null;
        }
        return null;
      },
    };
  }
}

describe('Universe Settings Service', () => {
  let db: MockD1Database;

  beforeEach(() => {
    db = new MockD1Database();
  });

  describe('Default Settings', () => {
    test('should have correct default values', () => {
      expect(DEFAULT_UNIVERSE_SETTINGS.speed).toBe(1);
      expect(DEFAULT_UNIVERSE_SETTINGS.fleetSpeed).toBe(1);
      expect(DEFAULT_UNIVERSE_SETTINGS.researchSpeed).toBe(1);
      expect(DEFAULT_UNIVERSE_SETTINGS.maxGalaxies).toBe(9);
      expect(DEFAULT_UNIVERSE_SETTINGS.maxSystems).toBe(499);
      expect(DEFAULT_UNIVERSE_SETTINGS.maxPositions).toBe(15);
      expect(DEFAULT_UNIVERSE_SETTINGS.debrisRate).toBe(0.3);
      expect(DEFAULT_UNIVERSE_SETTINGS.defenseRepairRate).toBe(0.7);
      expect(DEFAULT_UNIVERSE_SETTINGS.newbieProtectionPoints).toBe(5000);
      expect(DEFAULT_UNIVERSE_SETTINGS.bashRuleAttacks).toBe(6);
    });
  });

  describe('getUniverseSettings', () => {
    test('should return default settings when database is empty', async () => {
      const settings = await getUniverseSettings(db as unknown as D1Database);
      expect(settings).toEqual(DEFAULT_UNIVERSE_SETTINGS);
    });

    test('should return stored settings from database', async () => {
      const custom: UniverseSettings = {
        ...DEFAULT_UNIVERSE_SETTINGS,
        speed: 2,
        fleetSpeed: 4,
      };

      // Manually set database value
      (db as any).data.set('universe_settings', JSON.stringify(custom));

      const settings = await getUniverseSettings(db as unknown as D1Database);
      expect(settings.speed).toBe(2);
      expect(settings.fleetSpeed).toBe(4);
    });

    test('should merge custom settings with defaults', async () => {
      const partial = { speed: 3 };
      (db as any).data.set('universe_settings', JSON.stringify(partial));

      const settings = await getUniverseSettings(db as unknown as D1Database);
      expect(settings.speed).toBe(3);
      expect(settings.fleetSpeed).toBe(DEFAULT_UNIVERSE_SETTINGS.fleetSpeed);
    });
  });

  describe('updateUniverseSettings', () => {
    test('should update a single setting', async () => {
      const updated = await updateUniverseSettings(db as unknown as D1Database, {
        speed: 2,
      });

      expect(updated.speed).toBe(2);
      expect(updated.fleetSpeed).toBe(DEFAULT_UNIVERSE_SETTINGS.fleetSpeed);
    });

    test('should update multiple settings', async () => {
      const updated = await updateUniverseSettings(db as unknown as D1Database, {
        speed: 2,
        fleetSpeed: 4,
        researchSpeed: 3,
      });

      expect(updated.speed).toBe(2);
      expect(updated.fleetSpeed).toBe(4);
      expect(updated.researchSpeed).toBe(3);
    });

    test('should validate speed range', async () => {
      await expect(
        updateUniverseSettings(db as unknown as D1Database, { speed: 0 })
      ).rejects.toThrow('Speed must be between 0 and 100');

      await expect(
        updateUniverseSettings(db as unknown as D1Database, { speed: 101 })
      ).rejects.toThrow('Speed must be between 0 and 100');
    });

    test('should validate fleetSpeed range', async () => {
      await expect(
        updateUniverseSettings(db as unknown as D1Database, { fleetSpeed: -1 })
      ).rejects.toThrow('Fleet speed must be between 0 and 100');

      await expect(
        updateUniverseSettings(db as unknown as D1Database, { fleetSpeed: 150 })
      ).rejects.toThrow('Fleet speed must be between 0 and 100');
    });

    test('should validate researchSpeed range', async () => {
      await expect(
        updateUniverseSettings(db as unknown as D1Database, { researchSpeed: 0 })
      ).rejects.toThrow('Research speed must be between 0 and 100');
    });

    test('should validate maxGalaxies range', async () => {
      await expect(
        updateUniverseSettings(db as unknown as D1Database, { maxGalaxies: 0 })
      ).rejects.toThrow('Max galaxies must be between 1 and 9');

      await expect(
        updateUniverseSettings(db as unknown as D1Database, { maxGalaxies: 10 })
      ).rejects.toThrow('Max galaxies must be between 1 and 9');
    });

    test('should validate maxSystems range', async () => {
      await expect(
        updateUniverseSettings(db as unknown as D1Database, { maxSystems: 0 })
      ).rejects.toThrow('Max systems must be between 1 and 499');

      await expect(
        updateUniverseSettings(db as unknown as D1Database, { maxSystems: 500 })
      ).rejects.toThrow('Max systems must be between 1 and 499');
    });

    test('should validate maxPositions range', async () => {
      await expect(
        updateUniverseSettings(db as unknown as D1Database, { maxPositions: 0 })
      ).rejects.toThrow('Max positions must be between 1 and 15');

      await expect(
        updateUniverseSettings(db as unknown as D1Database, { maxPositions: 16 })
      ).rejects.toThrow('Max positions must be between 1 and 15');
    });

    test('should validate debrisRate range', async () => {
      await expect(
        updateUniverseSettings(db as unknown as D1Database, { debrisRate: -0.1 })
      ).rejects.toThrow('Debris rate must be between 0 and 1');

      await expect(
        updateUniverseSettings(db as unknown as D1Database, { debrisRate: 1.1 })
      ).rejects.toThrow('Debris rate must be between 0 and 1');
    });

    test('should validate defenseRepairRate range', async () => {
      await expect(
        updateUniverseSettings(db as unknown as D1Database, {
          defenseRepairRate: -0.1,
        })
      ).rejects.toThrow('Defense repair rate must be between 0 and 1');

      await expect(
        updateUniverseSettings(db as unknown as D1Database, {
          defenseRepairRate: 1.5,
        })
      ).rejects.toThrow('Defense repair rate must be between 0 and 1');
    });

    test('should accept valid settings updates', async () => {
      const updated = await updateUniverseSettings(db as unknown as D1Database, {
        speed: 4,
        fleetSpeed: 2,
        researchSpeed: 3,
        maxGalaxies: 5,
        maxSystems: 300,
        maxPositions: 10,
        debrisRate: 0.5,
        defenseRepairRate: 0.5,
        newbieProtectionPoints: 10000,
        bashRuleAttacks: 12,
      });

      expect(updated.speed).toBe(4);
      expect(updated.fleetSpeed).toBe(2);
      expect(updated.researchSpeed).toBe(3);
      expect(updated.maxGalaxies).toBe(5);
      expect(updated.maxSystems).toBe(300);
      expect(updated.maxPositions).toBe(10);
      expect(updated.debrisRate).toBe(0.5);
      expect(updated.defenseRepairRate).toBe(0.5);
      expect(updated.newbieProtectionPoints).toBe(10000);
      expect(updated.bashRuleAttacks).toBe(12);
    });
  });

  describe('resetUniverseSettings', () => {
    test('should reset settings to defaults', async () => {
      // First set custom settings
      await updateUniverseSettings(db as unknown as D1Database, {
        speed: 5,
        fleetSpeed: 10,
      });

      // Then reset
      const reset = await resetUniverseSettings(db as unknown as D1Database);

      expect(reset).toEqual(DEFAULT_UNIVERSE_SETTINGS);
    });

    test('should restore default values after reset', async () => {
      await resetUniverseSettings(db as unknown as D1Database);
      const settings = await getUniverseSettings(db as unknown as D1Database);

      expect(settings.speed).toBe(1);
      expect(settings.fleetSpeed).toBe(1);
      expect(settings.researchSpeed).toBe(1);
    });
  });

  describe('Edge Cases', () => {
    test('should handle fractional speed values', async () => {
      const updated = await updateUniverseSettings(db as unknown as D1Database, {
        speed: 1.5,
      });
      expect(updated.speed).toBe(1.5);
    });

    test('should accept zero for protection points', async () => {
      const updated = await updateUniverseSettings(db as unknown as D1Database, {
        newbieProtectionPoints: 0,
      });
      expect(updated.newbieProtectionPoints).toBe(0);
    });

    test('should accept zero for bash rule attacks', async () => {
      const updated = await updateUniverseSettings(db as unknown as D1Database, {
        bashRuleAttacks: 0,
      });
      expect(updated.bashRuleAttacks).toBe(0);
    });
  });
});
