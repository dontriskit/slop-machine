/**
 * Unit tests for Officers System
 *
 * Tests cover:
 *  - Officer definitions (completeness, validation)
 *  - Activation/expiry calculations
 *  - Bonus merging (single officer, multiple officers, expired officers)
 *  - All bonus application helpers (production, research, espionage, defense, fleet, build queue)
 *  - Edge cases (no bonuses, zero values, all officers active)
 */

import { describe, test, expect } from 'vitest';
import {
  OFFICER_DEFINITIONS,
  OFFICER_TYPES,
  getOfficerDefinition,
  isOfficerActive,
  calculateExpiry,
  mergeOfficerBonuses,
  applyMineProductionBonus,
  applyEnergyProductionBonus,
  applyResearchSpeedBonus,
  getEffectiveEspionageLevel,
  applyDefenseRepairBonus,
  getTotalBuildQueueSlots,
  getTotalFleetSlots,
  hasFleetRecall,
  hasFleetShortcuts,
  OfficerService,
  officerService,
} from '../../worker/src/game/services/officerService';
import type { ActiveOfficer, OfficerBonuses, OfficerType } from '../../worker/src/game/types';

// ============================================================================
// HELPERS
// ============================================================================

const NOW = 1700000000; // fixed timestamp for deterministic tests

function makeOfficer(
  type: OfficerType,
  overrides: Partial<ActiveOfficer> = {}
): ActiveOfficer {
  return {
    id: `test-${type}`,
    playerId: 'player1',
    officerType: type,
    activatedAt: NOW - 3600,
    expiresAt: NOW + 86400 * 7, // active for 7 days from now
    ...overrides,
  };
}

function makeExpiredOfficer(type: OfficerType): ActiveOfficer {
  return makeOfficer(type, {
    activatedAt: NOW - 86400 * 14,
    expiresAt: NOW - 86400, // expired yesterday
  });
}

// ============================================================================
// OFFICER DEFINITIONS
// ============================================================================

describe('Officer definitions', () => {
  test('all 5 officer types are defined', () => {
    expect(OFFICER_TYPES).toHaveLength(5);
    expect(OFFICER_TYPES).toContain('commander');
    expect(OFFICER_TYPES).toContain('admiral');
    expect(OFFICER_TYPES).toContain('engineer');
    expect(OFFICER_TYPES).toContain('geologist');
    expect(OFFICER_TYPES).toContain('technocrat');
  });

  test('every officer type has a definition', () => {
    for (const type of OFFICER_TYPES) {
      const def = OFFICER_DEFINITIONS[type];
      expect(def).toBeDefined();
      expect(def.type).toBe(type);
      expect(def.name.length).toBeGreaterThan(0);
      expect(def.description.length).toBeGreaterThan(0);
    }
  });

  test('all definitions have positive cost and duration', () => {
    for (const type of OFFICER_TYPES) {
      const def = OFFICER_DEFINITIONS[type];
      expect(def.cost).toBeGreaterThan(0);
      expect(def.durationDays).toBeGreaterThan(0);
    }
  });

  test('getOfficerDefinition returns correct definition', () => {
    const def = getOfficerDefinition('commander');
    expect(def.type).toBe('commander');
    expect(def.name).toBe('Commander');
    expect(def.bonuses.buildQueueSlots).toBe(1);
  });

  test('commander has buildQueueSlots and fleetShortcuts bonuses', () => {
    const def = OFFICER_DEFINITIONS.commander;
    expect(def.bonuses.buildQueueSlots).toBe(1);
    expect(def.bonuses.fleetShortcuts).toBe(true);
  });

  test('admiral has fleetSlots and fleetRecall bonuses', () => {
    const def = OFFICER_DEFINITIONS.admiral;
    expect(def.bonuses.fleetSlots).toBe(1);
    expect(def.bonuses.fleetRecall).toBe(true);
  });

  test('engineer has defenseRepairFactor and energyProductionBonus', () => {
    const def = OFFICER_DEFINITIONS.engineer;
    expect(def.bonuses.defenseRepairFactor).toBe(0.5);
    expect(def.bonuses.energyProductionBonus).toBe(0.10);
  });

  test('geologist has mineProductionBonus', () => {
    const def = OFFICER_DEFINITIONS.geologist;
    expect(def.bonuses.mineProductionBonus).toBe(0.10);
  });

  test('technocrat has espionageLevelBonus and researchSpeedBonus', () => {
    const def = OFFICER_DEFINITIONS.technocrat;
    expect(def.bonuses.espionageLevelBonus).toBe(2);
    expect(def.bonuses.researchSpeedBonus).toBe(0.25);
  });
});

// ============================================================================
// OFFICER ACTIVATION & EXPIRY
// ============================================================================

describe('Officer activation and expiry', () => {
  test('isOfficerActive returns true for active officer', () => {
    const officer = makeOfficer('commander');
    expect(isOfficerActive(officer, NOW)).toBe(true);
  });

  test('isOfficerActive returns false for expired officer', () => {
    const officer = makeExpiredOfficer('commander');
    expect(isOfficerActive(officer, NOW)).toBe(false);
  });

  test('isOfficerActive returns false when expiresAt equals now', () => {
    const officer = makeOfficer('commander', { expiresAt: NOW });
    expect(isOfficerActive(officer, NOW)).toBe(false);
  });

  test('isOfficerActive returns true when expiresAt is 1 second after now', () => {
    const officer = makeOfficer('commander', { expiresAt: NOW + 1 });
    expect(isOfficerActive(officer, NOW)).toBe(true);
  });

  test('calculateExpiry computes correct expiry for 7-day duration', () => {
    const expiry = calculateExpiry(NOW, 7);
    expect(expiry).toBe(NOW + 7 * 86400);
  });

  test('calculateExpiry computes correct expiry for 30-day duration', () => {
    const expiry = calculateExpiry(NOW, 30);
    expect(expiry).toBe(NOW + 30 * 86400);
  });

  test('calculateExpiry with 0 days returns same timestamp', () => {
    const expiry = calculateExpiry(NOW, 0);
    expect(expiry).toBe(NOW);
  });
});

// ============================================================================
// BONUS MERGING
// ============================================================================

describe('mergeOfficerBonuses', () => {
  test('empty officer array returns empty bonuses', () => {
    const bonuses = mergeOfficerBonuses([], NOW);
    expect(bonuses).toEqual({});
  });

  test('single commander returns commander bonuses', () => {
    const officers = [makeOfficer('commander')];
    const bonuses = mergeOfficerBonuses(officers, NOW);
    expect(bonuses.buildQueueSlots).toBe(1);
    expect(bonuses.fleetShortcuts).toBe(true);
    expect(bonuses.fleetSlots).toBeUndefined();
  });

  test('single admiral returns admiral bonuses', () => {
    const officers = [makeOfficer('admiral')];
    const bonuses = mergeOfficerBonuses(officers, NOW);
    expect(bonuses.fleetSlots).toBe(1);
    expect(bonuses.fleetRecall).toBe(true);
  });

  test('single engineer returns engineer bonuses', () => {
    const officers = [makeOfficer('engineer')];
    const bonuses = mergeOfficerBonuses(officers, NOW);
    expect(bonuses.defenseRepairFactor).toBe(0.5);
    expect(bonuses.energyProductionBonus).toBe(0.10);
  });

  test('single geologist returns geologist bonuses', () => {
    const officers = [makeOfficer('geologist')];
    const bonuses = mergeOfficerBonuses(officers, NOW);
    expect(bonuses.mineProductionBonus).toBe(0.10);
  });

  test('single technocrat returns technocrat bonuses', () => {
    const officers = [makeOfficer('technocrat')];
    const bonuses = mergeOfficerBonuses(officers, NOW);
    expect(bonuses.espionageLevelBonus).toBe(2);
    expect(bonuses.researchSpeedBonus).toBe(0.25);
  });

  test('all five officers active returns all bonuses merged', () => {
    const officers = OFFICER_TYPES.map((t) => makeOfficer(t));
    const bonuses = mergeOfficerBonuses(officers, NOW);

    expect(bonuses.buildQueueSlots).toBe(1);
    expect(bonuses.fleetShortcuts).toBe(true);
    expect(bonuses.fleetSlots).toBe(1);
    expect(bonuses.fleetRecall).toBe(true);
    expect(bonuses.defenseRepairFactor).toBe(0.5);
    expect(bonuses.energyProductionBonus).toBe(0.10);
    expect(bonuses.mineProductionBonus).toBe(0.10);
    expect(bonuses.espionageLevelBonus).toBe(2);
    expect(bonuses.researchSpeedBonus).toBe(0.25);
  });

  test('expired officers are excluded from merge', () => {
    const officers = [
      makeExpiredOfficer('commander'),
      makeOfficer('admiral'),
    ];
    const bonuses = mergeOfficerBonuses(officers, NOW);

    expect(bonuses.buildQueueSlots).toBeUndefined();
    expect(bonuses.fleetShortcuts).toBeUndefined();
    expect(bonuses.fleetSlots).toBe(1);
    expect(bonuses.fleetRecall).toBe(true);
  });

  test('all expired officers returns empty bonuses', () => {
    const officers = OFFICER_TYPES.map((t) => makeExpiredOfficer(t));
    const bonuses = mergeOfficerBonuses(officers, NOW);
    expect(bonuses).toEqual({});
  });

  test('mixed active and expired returns only active bonuses', () => {
    const officers = [
      makeOfficer('geologist'),          // active
      makeExpiredOfficer('technocrat'),   // expired
      makeOfficer('engineer'),           // active
      makeExpiredOfficer('commander'),   // expired
    ];
    const bonuses = mergeOfficerBonuses(officers, NOW);

    expect(bonuses.mineProductionBonus).toBe(0.10);
    expect(bonuses.defenseRepairFactor).toBe(0.5);
    expect(bonuses.energyProductionBonus).toBe(0.10);
    expect(bonuses.espionageLevelBonus).toBeUndefined();
    expect(bonuses.buildQueueSlots).toBeUndefined();
  });
});

// ============================================================================
// MINE PRODUCTION BONUS
// ============================================================================

describe('applyMineProductionBonus', () => {
  test('no bonus returns base production', () => {
    expect(applyMineProductionBonus(1000, {})).toBe(1000);
  });

  test('+10% bonus on 1000 returns 1100', () => {
    expect(applyMineProductionBonus(1000, { mineProductionBonus: 0.10 })).toBe(1100);
  });

  test('+10% bonus on 333 returns 366 (floored)', () => {
    expect(applyMineProductionBonus(333, { mineProductionBonus: 0.10 })).toBe(366);
  });

  test('0 base production stays 0', () => {
    expect(applyMineProductionBonus(0, { mineProductionBonus: 0.10 })).toBe(0);
  });

  test('+20% bonus (hypothetical double geologist)', () => {
    expect(applyMineProductionBonus(1000, { mineProductionBonus: 0.20 })).toBe(1200);
  });
});

// ============================================================================
// ENERGY PRODUCTION BONUS
// ============================================================================

describe('applyEnergyProductionBonus', () => {
  test('no bonus returns base energy', () => {
    expect(applyEnergyProductionBonus(500, {})).toBe(500);
  });

  test('+10% bonus on 500 returns 550', () => {
    expect(applyEnergyProductionBonus(500, { energyProductionBonus: 0.10 })).toBe(550);
  });

  test('+10% bonus on 777 returns 854 (floored)', () => {
    expect(applyEnergyProductionBonus(777, { energyProductionBonus: 0.10 })).toBe(854);
  });

  test('0 base energy stays 0', () => {
    expect(applyEnergyProductionBonus(0, { energyProductionBonus: 0.10 })).toBe(0);
  });
});

// ============================================================================
// RESEARCH SPEED BONUS
// ============================================================================

describe('applyResearchSpeedBonus', () => {
  test('no bonus returns base time', () => {
    expect(applyResearchSpeedBonus(3600, {})).toBe(3600);
  });

  test('+25% speed bonus: 3600s becomes 2880s', () => {
    // 3600 / 1.25 = 2880
    expect(applyResearchSpeedBonus(3600, { researchSpeedBonus: 0.25 })).toBe(2880);
  });

  test('+25% speed bonus: 100s becomes 80s', () => {
    expect(applyResearchSpeedBonus(100, { researchSpeedBonus: 0.25 })).toBe(80);
  });

  test('minimum time is 1 second', () => {
    expect(applyResearchSpeedBonus(1, { researchSpeedBonus: 0.25 })).toBeGreaterThanOrEqual(1);
  });

  test('0 bonus returns base time', () => {
    expect(applyResearchSpeedBonus(3600, { researchSpeedBonus: 0 })).toBe(3600);
  });

  test('+50% speed bonus: 3600s becomes 2400s', () => {
    expect(applyResearchSpeedBonus(3600, { researchSpeedBonus: 0.50 })).toBe(2400);
  });
});

// ============================================================================
// ESPIONAGE LEVEL BONUS
// ============================================================================

describe('getEffectiveEspionageLevel', () => {
  test('no bonus returns base level', () => {
    expect(getEffectiveEspionageLevel(5, {})).toBe(5);
  });

  test('+2 bonus on level 5 returns 7', () => {
    expect(getEffectiveEspionageLevel(5, { espionageLevelBonus: 2 })).toBe(7);
  });

  test('+2 bonus on level 0 returns 2', () => {
    expect(getEffectiveEspionageLevel(0, { espionageLevelBonus: 2 })).toBe(2);
  });

  test('+4 bonus (hypothetical) on level 10 returns 14', () => {
    expect(getEffectiveEspionageLevel(10, { espionageLevelBonus: 4 })).toBe(14);
  });
});

// ============================================================================
// DEFENSE REPAIR BONUS
// ============================================================================

describe('applyDefenseRepairBonus', () => {
  test('no bonus (factor 1.0 default) returns base time', () => {
    expect(applyDefenseRepairBonus(600, {})).toBe(600);
  });

  test('0.5 factor: 600s becomes 300s', () => {
    expect(applyDefenseRepairBonus(600, { defenseRepairFactor: 0.5 })).toBe(300);
  });

  test('0.5 factor: 1s stays 1s (minimum)', () => {
    expect(applyDefenseRepairBonus(1, { defenseRepairFactor: 0.5 })).toBe(1);
  });

  test('0.5 factor on 0 returns 0, but minimum is 1', () => {
    // 0 * 0.5 = 0, but min is 1
    expect(applyDefenseRepairBonus(0, { defenseRepairFactor: 0.5 })).toBe(1);
  });

  test('0.25 factor: 1000s becomes 250s', () => {
    expect(applyDefenseRepairBonus(1000, { defenseRepairFactor: 0.25 })).toBe(250);
  });
});

// ============================================================================
// BUILD QUEUE SLOTS
// ============================================================================

describe('getTotalBuildQueueSlots', () => {
  test('no bonus: base 1 stays 1', () => {
    expect(getTotalBuildQueueSlots(1, {})).toBe(1);
  });

  test('+1 bonus: base 1 becomes 2', () => {
    expect(getTotalBuildQueueSlots(1, { buildQueueSlots: 1 })).toBe(2);
  });

  test('+2 bonus: base 1 becomes 3', () => {
    expect(getTotalBuildQueueSlots(1, { buildQueueSlots: 2 })).toBe(3);
  });

  test('base 0 + 1 bonus = 1', () => {
    expect(getTotalBuildQueueSlots(0, { buildQueueSlots: 1 })).toBe(1);
  });
});

// ============================================================================
// FLEET SLOTS
// ============================================================================

describe('getTotalFleetSlots', () => {
  test('no bonus: base 5 stays 5', () => {
    expect(getTotalFleetSlots(5, {})).toBe(5);
  });

  test('+1 bonus: base 5 becomes 6', () => {
    expect(getTotalFleetSlots(5, { fleetSlots: 1 })).toBe(6);
  });

  test('+1 bonus: base 1 becomes 2', () => {
    expect(getTotalFleetSlots(1, { fleetSlots: 1 })).toBe(2);
  });
});

// ============================================================================
// FLEET RECALL
// ============================================================================

describe('hasFleetRecall', () => {
  test('no bonus returns false', () => {
    expect(hasFleetRecall({})).toBe(false);
  });

  test('fleetRecall true returns true', () => {
    expect(hasFleetRecall({ fleetRecall: true })).toBe(true);
  });

  test('fleetRecall false returns false', () => {
    expect(hasFleetRecall({ fleetRecall: false })).toBe(false);
  });
});

// ============================================================================
// FLEET SHORTCUTS
// ============================================================================

describe('hasFleetShortcuts', () => {
  test('no bonus returns false', () => {
    expect(hasFleetShortcuts({})).toBe(false);
  });

  test('fleetShortcuts true returns true', () => {
    expect(hasFleetShortcuts({ fleetShortcuts: true })).toBe(true);
  });

  test('fleetShortcuts false returns false', () => {
    expect(hasFleetShortcuts({ fleetShortcuts: false })).toBe(false);
  });
});

// ============================================================================
// OFFICER SERVICE CLASS
// ============================================================================

describe('OfficerService class', () => {
  test('getDefinitions returns all 5 officer definitions', () => {
    const defs = officerService.getDefinitions();
    expect(defs).toHaveLength(5);
  });

  test('getDefinition returns correct definition', () => {
    const def = officerService.getDefinition('engineer');
    expect(def.type).toBe('engineer');
    expect(def.name).toBe('Engineer');
  });

  test('pure bonus methods are accessible on instance', () => {
    const bonuses: OfficerBonuses = { mineProductionBonus: 0.10 };
    expect(officerService.applyMineProductionBonus(1000, bonuses)).toBe(1100);
    expect(officerService.applyEnergyProductionBonus(500, {})).toBe(500);
    expect(officerService.applyResearchSpeedBonus(3600, { researchSpeedBonus: 0.25 })).toBe(2880);
    expect(officerService.getEffectiveEspionageLevel(5, { espionageLevelBonus: 2 })).toBe(7);
    expect(officerService.applyDefenseRepairBonus(600, { defenseRepairFactor: 0.5 })).toBe(300);
    expect(officerService.getTotalBuildQueueSlots(1, { buildQueueSlots: 1 })).toBe(2);
    expect(officerService.getTotalFleetSlots(5, { fleetSlots: 1 })).toBe(6);
    expect(officerService.hasFleetRecall({ fleetRecall: true })).toBe(true);
    expect(officerService.hasFleetShortcuts({ fleetShortcuts: true })).toBe(true);
  });
});

// ============================================================================
// INTEGRATION-STYLE TESTS (full bonus pipeline)
// ============================================================================

describe('Full officer bonus pipeline', () => {
  test('all officers active: metal production gets +10%', () => {
    const officers = OFFICER_TYPES.map((t) => makeOfficer(t));
    const bonuses = mergeOfficerBonuses(officers, NOW);

    const baseMetal = 1000;
    const boostedMetal = applyMineProductionBonus(baseMetal, bonuses);
    expect(boostedMetal).toBe(1100);
  });

  test('all officers active: energy gets +10%', () => {
    const officers = OFFICER_TYPES.map((t) => makeOfficer(t));
    const bonuses = mergeOfficerBonuses(officers, NOW);

    const baseEnergy = 2000;
    const boostedEnergy = applyEnergyProductionBonus(baseEnergy, bonuses);
    expect(boostedEnergy).toBe(2200);
  });

  test('all officers active: research time reduced by 20%', () => {
    const officers = OFFICER_TYPES.map((t) => makeOfficer(t));
    const bonuses = mergeOfficerBonuses(officers, NOW);

    const baseResearchTime = 5000;
    const boostedTime = applyResearchSpeedBonus(baseResearchTime, bonuses);
    // 5000 / 1.25 = 4000
    expect(boostedTime).toBe(4000);
  });

  test('all officers active: espionage level increased by 2', () => {
    const officers = OFFICER_TYPES.map((t) => makeOfficer(t));
    const bonuses = mergeOfficerBonuses(officers, NOW);

    expect(getEffectiveEspionageLevel(8, bonuses)).toBe(10);
  });

  test('all officers active: defense repair halved', () => {
    const officers = OFFICER_TYPES.map((t) => makeOfficer(t));
    const bonuses = mergeOfficerBonuses(officers, NOW);

    expect(applyDefenseRepairBonus(1000, bonuses)).toBe(500);
  });

  test('all officers active: build queue +1', () => {
    const officers = OFFICER_TYPES.map((t) => makeOfficer(t));
    const bonuses = mergeOfficerBonuses(officers, NOW);

    expect(getTotalBuildQueueSlots(1, bonuses)).toBe(2);
  });

  test('all officers active: fleet slots +1', () => {
    const officers = OFFICER_TYPES.map((t) => makeOfficer(t));
    const bonuses = mergeOfficerBonuses(officers, NOW);

    expect(getTotalFleetSlots(5, bonuses)).toBe(6);
  });

  test('all officers active: fleet recall available', () => {
    const officers = OFFICER_TYPES.map((t) => makeOfficer(t));
    const bonuses = mergeOfficerBonuses(officers, NOW);

    expect(hasFleetRecall(bonuses)).toBe(true);
  });

  test('all officers active: fleet shortcuts available', () => {
    const officers = OFFICER_TYPES.map((t) => makeOfficer(t));
    const bonuses = mergeOfficerBonuses(officers, NOW);

    expect(hasFleetShortcuts(bonuses)).toBe(true);
  });

  test('no officers: no bonuses applied', () => {
    const bonuses = mergeOfficerBonuses([], NOW);

    expect(applyMineProductionBonus(1000, bonuses)).toBe(1000);
    expect(applyEnergyProductionBonus(500, bonuses)).toBe(500);
    expect(applyResearchSpeedBonus(3600, bonuses)).toBe(3600);
    expect(getEffectiveEspionageLevel(5, bonuses)).toBe(5);
    expect(applyDefenseRepairBonus(600, bonuses)).toBe(600);
    expect(getTotalBuildQueueSlots(1, bonuses)).toBe(1);
    expect(getTotalFleetSlots(5, bonuses)).toBe(5);
    expect(hasFleetRecall(bonuses)).toBe(false);
    expect(hasFleetShortcuts(bonuses)).toBe(false);
  });

  test('only geologist: only mine production boosted', () => {
    const officers = [makeOfficer('geologist')];
    const bonuses = mergeOfficerBonuses(officers, NOW);

    expect(applyMineProductionBonus(1000, bonuses)).toBe(1100);
    expect(applyEnergyProductionBonus(500, bonuses)).toBe(500); // no engineer
    expect(applyResearchSpeedBonus(3600, bonuses)).toBe(3600);  // no technocrat
    expect(getTotalBuildQueueSlots(1, bonuses)).toBe(1);       // no commander
    expect(getTotalFleetSlots(5, bonuses)).toBe(5);            // no admiral
    expect(hasFleetRecall(bonuses)).toBe(false);               // no admiral
  });
});
