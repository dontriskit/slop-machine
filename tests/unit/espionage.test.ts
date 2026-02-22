/**
 * Unit tests for the Espionage System
 *
 * Covers:
 *  - Info level scaling with tech difference
 *  - Counter-espionage probability calculation
 *  - Probe destruction mechanics
 *  - Report completeness at different info levels
 *  - Effective spy difference formula
 *  - Probe recommendation algorithm
 *  - Serialization round-trip
 */
import { describe, test, expect } from 'vitest';
import {
  EspionageService,
  espionageService,
  InfoLevel,
  generateEspionageReport,
  calculateCounterChance,
  calculateEffectiveSpyDiff,
} from '../../worker/src/game/services/espionageService';
import { PlanetState, Ships, TechLevels } from '../../worker/src/game/types';
import { DefenseStructures } from '../../worker/src/game/defenses';

// ============================================================================
// TEST FIXTURES
// ============================================================================

function createTestPlanet(overrides: Partial<PlanetState> = {}): PlanetState {
  return {
    planetId: 'planet-test-1',
    playerId: 'player-defender',
    coordinate: { galaxy: 1, system: 100, position: 5 },
    planetType: 'planet',
    name: 'TestWorld',
    temperature: 30,
    fields: 163,
    universeSpeed: 1,
    buildings: {
      metalMine: 15,
      crystalMine: 12,
      deutSynth: 10,
      solarPlant: 14,
      fusionReactor: 3,
      roboticsFactory: 8,
      naniteFactory: 1,
      shipyard: 7,
      researchLab: 6,
      metalStorage: 4,
      crystalStorage: 4,
      deutTank: 4,
    },
    resources: {
      metal: 500000,
      crystal: 250000,
      deuterium: 100000,
    },
    ships: {
      lightFighter: 100,
      heavyFighter: 50,
      cruiser: 20,
      battleship: 10,
      battlecruiser: 5,
      bomber: 3,
      destroyer: 2,
      deathstar: 0,
      smallCargo: 30,
      largeCargo: 15,
      colonyShip: 1,
      recycler: 10,
      espionageProbe: 25,
    },
    queue: [],
    lastTickAt: Date.now(),
    ...overrides,
  };
}

function createTestDefenses(): DefenseStructures {
  return {
    rocketLauncher: 100,
    lightLaser: 50,
    heavyLaser: 20,
    gaussCannon: 5,
    ionCannon: 10,
    plasmaTurret: 2,
    smallShieldDome: 1,
    largeShieldDome: 1,
    antiBallisticMissile: 5,
    interplanetaryMissile: 0,
  };
}

function createTestTech(overrides: Partial<TechLevels> = {}): TechLevels {
  return {
    energyTech: 5,
    laserTech: 8,
    ionTech: 3,
    hyperspaceTech: 2,
    plasmaTech: 0,
    combustionDrive: 6,
    impulseDrive: 4,
    hyperspaceDrive: 1,
    espionageTech: 4,
    computerTech: 5,
    astrophysics: 2,
    weaponTech: 6,
    shieldingTech: 4,
    armorTech: 5,
    gravitonTech: 0,
    ...overrides,
  };
}

function createEmptyShips(): Ships {
  return {
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
}

// ============================================================================
// EFFECTIVE SPY LEVEL DIFFERENCE
// ============================================================================

describe('Effective Spy Level Difference', () => {
  const svc = new EspionageService();

  test('equal tech + 1 probe = diff of 0', () => {
    expect(svc.calculateEffectiveSpyDiff(5, 5, 1)).toBe(0);
  });

  test('attacker higher tech + 1 probe', () => {
    expect(svc.calculateEffectiveSpyDiff(8, 5, 1)).toBe(3);
  });

  test('defender higher tech + 1 probe', () => {
    expect(svc.calculateEffectiveSpyDiff(3, 5, 1)).toBe(-2);
  });

  test('each additional probe adds +2', () => {
    // 1 probe: 5-5 + 0 = 0
    expect(svc.calculateEffectiveSpyDiff(5, 5, 1)).toBe(0);
    // 2 probes: 5-5 + 2 = 2
    expect(svc.calculateEffectiveSpyDiff(5, 5, 2)).toBe(2);
    // 3 probes: 5-5 + 4 = 4
    expect(svc.calculateEffectiveSpyDiff(5, 5, 3)).toBe(4);
    // 5 probes: 5-5 + 8 = 8
    expect(svc.calculateEffectiveSpyDiff(5, 5, 5)).toBe(8);
  });

  test('high probe count can overcome tech deficit', () => {
    // Tech deficit of -4, but 4 probes gives +6, net = 2
    expect(svc.calculateEffectiveSpyDiff(3, 7, 4)).toBe(2);
  });

  test('zero probes gives base diff only', () => {
    // 0 probes should give just the base diff (probeBonus = max(0,-1)*2 = 0)
    expect(svc.calculateEffectiveSpyDiff(8, 3, 0)).toBe(5);
  });

  test('convenience function matches instance method', () => {
    expect(calculateEffectiveSpyDiff(8, 4, 3)).toBe(
      svc.calculateEffectiveSpyDiff(8, 4, 3),
    );
  });
});

// ============================================================================
// INFO LEVEL DETERMINATION
// ============================================================================

describe('Info Level Scaling', () => {
  const svc = new EspionageService();

  test('negative diff still shows resources', () => {
    expect(svc.getInfoLevel(-5)).toBe(InfoLevel.Resources);
  });

  test('diff 0 shows resources only', () => {
    expect(svc.getInfoLevel(0)).toBe(InfoLevel.Resources);
  });

  test('diff 1 shows resources only (below fleet threshold)', () => {
    expect(svc.getInfoLevel(1)).toBe(InfoLevel.Resources);
  });

  test('diff 2 shows fleet', () => {
    expect(svc.getInfoLevel(2)).toBe(InfoLevel.Fleet);
  });

  test('diff 3 shows fleet (below defense threshold)', () => {
    expect(svc.getInfoLevel(3)).toBe(InfoLevel.Fleet);
  });

  test('diff 4 shows defenses', () => {
    expect(svc.getInfoLevel(4)).toBe(InfoLevel.Defenses);
  });

  test('diff 5 shows defenses', () => {
    expect(svc.getInfoLevel(5)).toBe(InfoLevel.Defenses);
  });

  test('diff 6 shows buildings', () => {
    expect(svc.getInfoLevel(6)).toBe(InfoLevel.Buildings);
  });

  test('diff 7 shows buildings', () => {
    expect(svc.getInfoLevel(7)).toBe(InfoLevel.Buildings);
  });

  test('diff 8 shows research', () => {
    expect(svc.getInfoLevel(8)).toBe(InfoLevel.Research);
  });

  test('diff 20 (massive advantage) shows full research', () => {
    expect(svc.getInfoLevel(20)).toBe(InfoLevel.Research);
  });

  test('info levels are cumulative (higher levels include all lower)', () => {
    // Research includes all
    expect(InfoLevel.Research).toBeGreaterThan(InfoLevel.Buildings);
    expect(InfoLevel.Buildings).toBeGreaterThan(InfoLevel.Defenses);
    expect(InfoLevel.Defenses).toBeGreaterThan(InfoLevel.Fleet);
    expect(InfoLevel.Fleet).toBeGreaterThan(InfoLevel.Resources);
  });
});

// ============================================================================
// COUNTER-ESPIONAGE PROBABILITY
// ============================================================================

describe('Counter-Espionage Probability', () => {
  const svc = new EspionageService();

  test('equal tech, 1 probe = 2% chance', () => {
    // max(0, 5-5+1) * 1 * 2 = 1 * 1 * 2 = 2
    expect(svc.calculateCounterChance(5, 5, 1)).toBe(2);
  });

  test('defender 3 levels higher, 1 probe = 8% chance', () => {
    // max(0, 8-5+1) * 1 * 2 = 4 * 1 * 2 = 8
    expect(svc.calculateCounterChance(5, 8, 1)).toBe(8);
  });

  test('attacker higher tech reduces chance', () => {
    // max(0, 3-8+1) * 1 * 2 = max(0,-4) * 2 = 0
    expect(svc.calculateCounterChance(8, 3, 1)).toBe(0);
  });

  test('more probes = higher detection chance', () => {
    // max(0, 5-5+1) * 5 * 2 = 1 * 5 * 2 = 10
    expect(svc.calculateCounterChance(5, 5, 5)).toBe(10);
    // max(0, 5-5+1) * 10 * 2 = 1 * 10 * 2 = 20
    expect(svc.calculateCounterChance(5, 5, 10)).toBe(20);
  });

  test('high defender tech + many probes can reach 100%', () => {
    // max(0, 10-0+1) * 5 * 2 = 11 * 5 * 2 = 110 -> clamped to 100
    expect(svc.calculateCounterChance(0, 10, 5)).toBe(100);
  });

  test('chance is clamped to 0-100', () => {
    const chance = svc.calculateCounterChance(10, 0, 1);
    expect(chance).toBeGreaterThanOrEqual(0);
    expect(chance).toBeLessThanOrEqual(100);
  });

  test('attacker much higher tech gives 0% chance', () => {
    expect(svc.calculateCounterChance(15, 5, 1)).toBe(0);
  });

  test('convenience function matches instance method', () => {
    expect(calculateCounterChance(5, 8, 3)).toBe(
      svc.calculateCounterChance(5, 8, 3),
    );
  });
});

// ============================================================================
// PROBE DESTRUCTION MECHANICS
// ============================================================================

describe('Probe Destruction', () => {
  const svc = new EspionageService();

  test('applyProbeLoss removes correct number of probes', () => {
    const ships: Ships = { ...createEmptyShips(), espionageProbe: 10 };
    const updated = svc.applyProbeLoss(ships, 3);
    expect(updated.espionageProbe).toBe(7);
  });

  test('applyProbeLoss does not go below 0', () => {
    const ships: Ships = { ...createEmptyShips(), espionageProbe: 2 };
    const updated = svc.applyProbeLoss(ships, 5);
    expect(updated.espionageProbe).toBe(0);
  });

  test('applyProbeLoss does not affect other ships', () => {
    const ships: Ships = {
      ...createEmptyShips(),
      espionageProbe: 10,
      lightFighter: 50,
      cruiser: 20,
    };
    const updated = svc.applyProbeLoss(ships, 5);
    expect(updated.lightFighter).toBe(50);
    expect(updated.cruiser).toBe(20);
    expect(updated.espionageProbe).toBe(5);
  });

  test('applyProbeLoss with 0 loss does nothing', () => {
    const ships: Ships = { ...createEmptyShips(), espionageProbe: 10 };
    const updated = svc.applyProbeLoss(ships, 0);
    expect(updated.espionageProbe).toBe(10);
  });

  test('counter-espionage result probes destroyed when detected', () => {
    // With defender tech much higher, detection is very likely
    // We test the deterministic parts
    const counter = svc.processCounterEspionage(0, 10, 5);
    // detectionChance = max(0, 10-0+1) * 5 * 2 = 110 -> 100
    expect(counter.detectionChance).toBe(100);
    // With 100% chance, probes MUST be destroyed
    expect(counter.detected).toBe(true);
    expect(counter.probesDestroyed).toBe(5);
    expect(counter.probesSurviving).toBe(0);
  });

  test('counter-espionage with 0% chance always preserves probes', () => {
    // Attacker has much higher tech -> 0% detection
    const counter = svc.processCounterEspionage(15, 5, 1);
    expect(counter.detectionChance).toBe(0);
    expect(counter.detected).toBe(false);
    expect(counter.probesDestroyed).toBe(0);
    expect(counter.probesSurviving).toBe(1);
  });
});

// ============================================================================
// REPORT COMPLETENESS AT DIFFERENT LEVELS
// ============================================================================

describe('Report Completeness', () => {
  const svc = new EspionageService();
  const planet = createTestPlanet();
  const defenses = createTestDefenses();
  const tech = createTestTech();

  test('resources-only report (low tech, 1 probe)', () => {
    // Attacker spy 0, defender spy 4, 1 probe -> diff = 0-4+0 = -4
    const report = svc.generateEspionageReport(0, 4, 1, planet, defenses, tech);
    expect(report.infoLevel).toBe(InfoLevel.Resources);
    expect(report.resources).not.toBeNull();
    expect(report.resources!.metal).toBe(500000);
    expect(report.resources!.crystal).toBe(250000);
    expect(report.resources!.deuterium).toBe(100000);
    expect(report.fleet).toBeNull();
    expect(report.defenses).toBeNull();
    expect(report.buildings).toBeNull();
    expect(report.research).toBeNull();
  });

  test('fleet-level report (diff >= 2)', () => {
    // Attacker spy 6, defender spy 4, 1 probe -> diff = 6-4+0 = 2
    const report = svc.generateEspionageReport(6, 4, 1, planet, defenses, tech);
    expect(report.infoLevel).toBe(InfoLevel.Fleet);
    expect(report.resources).not.toBeNull();
    expect(report.fleet).not.toBeNull();
    expect(report.fleet!.lightFighter).toBe(100);
    expect(report.fleet!.heavyFighter).toBe(50);
    expect(report.defenses).toBeNull();
    expect(report.buildings).toBeNull();
    expect(report.research).toBeNull();
  });

  test('defense-level report (diff >= 4)', () => {
    // Attacker spy 8, defender spy 4, 1 probe -> diff = 8-4+0 = 4
    const report = svc.generateEspionageReport(8, 4, 1, planet, defenses, tech);
    expect(report.infoLevel).toBe(InfoLevel.Defenses);
    expect(report.resources).not.toBeNull();
    expect(report.fleet).not.toBeNull();
    expect(report.defenses).not.toBeNull();
    expect(report.defenses!.rocketLauncher).toBe(100);
    expect(report.defenses!.gaussCannon).toBe(5);
    expect(report.buildings).toBeNull();
    expect(report.research).toBeNull();
  });

  test('building-level report (diff >= 6)', () => {
    // Attacker spy 10, defender spy 4, 1 probe -> diff = 10-4+0 = 6
    const report = svc.generateEspionageReport(10, 4, 1, planet, defenses, tech);
    expect(report.infoLevel).toBe(InfoLevel.Buildings);
    expect(report.resources).not.toBeNull();
    expect(report.fleet).not.toBeNull();
    expect(report.defenses).not.toBeNull();
    expect(report.buildings).not.toBeNull();
    expect(report.buildings!.metalMine).toBe(15);
    expect(report.buildings!.shipyard).toBe(7);
    expect(report.research).toBeNull();
  });

  test('full research-level report (diff >= 8)', () => {
    // Attacker spy 12, defender spy 4, 1 probe -> diff = 12-4+0 = 8
    const report = svc.generateEspionageReport(12, 4, 1, planet, defenses, tech);
    expect(report.infoLevel).toBe(InfoLevel.Research);
    expect(report.resources).not.toBeNull();
    expect(report.fleet).not.toBeNull();
    expect(report.defenses).not.toBeNull();
    expect(report.buildings).not.toBeNull();
    expect(report.research).not.toBeNull();
    expect(report.research!.espionageTech).toBe(4);
    expect(report.research!.weaponTech).toBe(6);
  });

  test('probes can compensate for lower tech', () => {
    // Attacker spy 4, defender spy 4, 5 probes -> diff = 0 + (5-1)*2 = 8
    const report = svc.generateEspionageReport(4, 4, 5, planet, defenses, tech);
    expect(report.infoLevel).toBe(InfoLevel.Research);
    expect(report.research).not.toBeNull();
  });

  test('fleet section only shows non-zero ships', () => {
    const sparsePlanet = createTestPlanet({
      ships: {
        ...createEmptyShips(),
        lightFighter: 5,
        espionageProbe: 3,
      },
    });
    // diff = 10-0 = 10 (show everything)
    const report = svc.generateEspionageReport(10, 0, 1, sparsePlanet, defenses, tech);
    expect(report.fleet).not.toBeNull();
    expect(report.fleet!.lightFighter).toBe(5);
    expect(report.fleet!.espionageProbe).toBe(3);
    // Zero ships should not be in the partial
    expect(report.fleet!.cruiser).toBeUndefined();
    expect(report.fleet!.deathstar).toBeUndefined();
  });

  test('defense section only shows non-zero defenses', () => {
    const sparseDefenses: DefenseStructures = {
      rocketLauncher: 10,
      lightLaser: 0,
      heavyLaser: 0,
      gaussCannon: 0,
      ionCannon: 0,
      plasmaTurret: 0,
      smallShieldDome: 1,
      largeShieldDome: 0,
      antiBallisticMissile: 0,
      interplanetaryMissile: 0,
    };
    const report = svc.generateEspionageReport(10, 0, 1, planet, sparseDefenses, tech);
    expect(report.defenses).not.toBeNull();
    expect(report.defenses!.rocketLauncher).toBe(10);
    expect(report.defenses!.smallShieldDome).toBe(1);
    expect(report.defenses!.heavyLaser).toBeUndefined();
  });

  test('resources are always floor-rounded', () => {
    const fracPlanet = createTestPlanet({
      resources: { metal: 1234.567, crystal: 999.999, deuterium: 0.1 },
    });
    const report = svc.generateEspionageReport(0, 0, 1, fracPlanet, defenses, tech);
    expect(report.resources!.metal).toBe(1234);
    expect(report.resources!.crystal).toBe(999);
    expect(report.resources!.deuterium).toBe(0);
  });
});

// ============================================================================
// FULL REPORT METADATA
// ============================================================================

describe('Report Metadata', () => {
  const svc = new EspionageService();

  test('report has unique id', () => {
    const planet = createTestPlanet();
    const defenses = createTestDefenses();
    const tech = createTestTech();
    const r1 = svc.generateEspionageReport(5, 5, 1, planet, defenses, tech);
    const r2 = svc.generateEspionageReport(5, 5, 1, planet, defenses, tech);
    expect(r1.id).not.toBe(r2.id);
  });

  test('report has timestamp', () => {
    const planet = createTestPlanet();
    const defenses = createTestDefenses();
    const tech = createTestTech();
    const before = Date.now();
    const report = svc.generateEspionageReport(5, 5, 1, planet, defenses, tech);
    const after = Date.now();
    expect(report.timestamp).toBeGreaterThanOrEqual(before);
    expect(report.timestamp).toBeLessThanOrEqual(after);
  });

  test('report preserves target coordinate', () => {
    const planet = createTestPlanet({
      coordinate: { galaxy: 3, system: 250, position: 12 },
    });
    const report = svc.generateEspionageReport(
      5, 5, 1, planet, createTestDefenses(), createTestTech(),
    );
    expect(report.targetCoordinate).toEqual({ galaxy: 3, system: 250, position: 12 });
  });

  test('report includes probes sent count', () => {
    const report = svc.generateEspionageReport(
      5, 5, 7, createTestPlanet(), createTestDefenses(), createTestTech(),
    );
    expect(report.probesSent).toBe(7);
  });

  test('counter chance is populated', () => {
    const report = svc.generateEspionageReport(
      5, 5, 1, createTestPlanet(), createTestDefenses(), createTestTech(),
    );
    expect(report.counterChance).toBeGreaterThanOrEqual(0);
    expect(report.counterChance).toBeLessThanOrEqual(100);
  });
});

// ============================================================================
// MISSION VALIDATION
// ============================================================================

describe('Mission Validation', () => {
  const svc = new EspionageService();

  test('valid mission returns null', () => {
    const ships: Ships = { ...createEmptyShips(), espionageProbe: 10 };
    expect(svc.validateMission(5, ships)).toBeNull();
  });

  test('zero probes is invalid', () => {
    const ships: Ships = { ...createEmptyShips(), espionageProbe: 10 };
    expect(svc.validateMission(0, ships)).toContain('at least 1');
  });

  test('negative probes is invalid', () => {
    const ships: Ships = { ...createEmptyShips(), espionageProbe: 10 };
    expect(svc.validateMission(-1, ships)).toContain('at least 1');
  });

  test('more than 50 probes is invalid', () => {
    const ships: Ships = { ...createEmptyShips(), espionageProbe: 100 };
    expect(svc.validateMission(51, ships)).toContain('Maximum 50');
  });

  test('not enough probes is invalid', () => {
    const ships: Ships = { ...createEmptyShips(), espionageProbe: 3 };
    expect(svc.validateMission(5, ships)).toContain('Not enough');
  });

  test('hasEnoughProbes checks correctly', () => {
    const ships: Ships = { ...createEmptyShips(), espionageProbe: 5 };
    expect(svc.hasEnoughProbes(ships, 5)).toBe(true);
    expect(svc.hasEnoughProbes(ships, 6)).toBe(false);
    expect(svc.hasEnoughProbes(ships, 0)).toBe(false);
  });
});

// ============================================================================
// PROBE RECOMMENDATION
// ============================================================================

describe('Probe Recommendation', () => {
  const svc = new EspionageService();

  test('resources level needs 1 probe', () => {
    expect(svc.recommendProbeCount(5, 5, InfoLevel.Resources)).toBe(1);
  });

  test('fleet level with equal tech needs 2 probes', () => {
    // diff needed: 2; baseDiff = 0; probes = ceil((2-0)/2)+1 = 2
    expect(svc.recommendProbeCount(5, 5, InfoLevel.Fleet)).toBe(2);
  });

  test('research level with equal tech needs 5 probes', () => {
    // diff needed: 8; baseDiff = 0; probes = ceil((8-0)/2)+1 = 5
    expect(svc.recommendProbeCount(5, 5, InfoLevel.Research)).toBe(5);
  });

  test('high attacker tech needs fewer probes', () => {
    // baseDiff = 10-4 = 6, threshold 8, probes = ceil((8-6)/2)+1 = 2
    expect(svc.recommendProbeCount(10, 4, InfoLevel.Research)).toBe(2);
  });

  test('result is always at least 1', () => {
    expect(svc.recommendProbeCount(20, 0, InfoLevel.Research)).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================================
// TARGET SCORE
// ============================================================================

describe('Target Score', () => {
  const svc = new EspionageService();

  test('resources increase score', () => {
    const report1 = svc.generateEspionageReport(
      5, 5, 1,
      createTestPlanet({ resources: { metal: 100000, crystal: 0, deuterium: 0 } }),
      createTestDefenses(), createTestTech(),
    );
    const report2 = svc.generateEspionageReport(
      5, 5, 1,
      createTestPlanet({ resources: { metal: 500000, crystal: 0, deuterium: 0 } }),
      createTestDefenses(), createTestTech(),
    );
    const score1 = svc.calculateTargetScore(report1);
    const score2 = svc.calculateTargetScore(report2);
    expect(score2).toBeGreaterThan(score1);
  });

  test('crystal valued higher than metal', () => {
    const reportMetal = svc.generateEspionageReport(
      5, 5, 1,
      createTestPlanet({ resources: { metal: 100000, crystal: 0, deuterium: 0 } }),
      createTestDefenses(), createTestTech(),
    );
    const reportCrystal = svc.generateEspionageReport(
      5, 5, 1,
      createTestPlanet({ resources: { metal: 0, crystal: 100000, deuterium: 0 } }),
      createTestDefenses(), createTestTech(),
    );
    const scoreMetal = svc.calculateTargetScore(reportMetal);
    const scoreCrystal = svc.calculateTargetScore(reportCrystal);
    expect(scoreCrystal).toBeGreaterThan(scoreMetal);
  });

  test('deuterium valued highest', () => {
    const reportMetal = svc.generateEspionageReport(
      5, 5, 1,
      createTestPlanet({ resources: { metal: 100000, crystal: 0, deuterium: 0 } }),
      createTestDefenses(), createTestTech(),
    );
    const reportDeut = svc.generateEspionageReport(
      5, 5, 1,
      createTestPlanet({ resources: { metal: 0, crystal: 0, deuterium: 100000 } }),
      createTestDefenses(), createTestTech(),
    );
    const scoreMetal = svc.calculateTargetScore(reportMetal);
    const scoreDeut = svc.calculateTargetScore(reportDeut);
    expect(scoreDeut).toBeGreaterThan(scoreMetal);
  });

  test('score is always non-negative', () => {
    const report = svc.generateEspionageReport(
      5, 5, 1,
      createTestPlanet({ resources: { metal: 0, crystal: 0, deuterium: 0 } }),
      createTestDefenses(), createTestTech(),
    );
    expect(svc.calculateTargetScore(report)).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// SERIALIZATION ROUND-TRIP
// ============================================================================

describe('Serialization', () => {
  const svc = new EspionageService();

  test('serialize and deserialize produce equivalent report', () => {
    const planet = createTestPlanet();
    const defenses = createTestDefenses();
    const tech = createTestTech();

    // Full info report
    const original = svc.generateEspionageReport(12, 4, 1, planet, defenses, tech);
    const dbRow = svc.serializeForDb(original);
    const restored = svc.deserializeFromDb(dbRow);

    expect(restored.id).toBe(original.id);
    expect(restored.attackerId).toBe(original.attackerId);
    expect(restored.defenderId).toBe(original.defenderId);
    expect(restored.targetCoordinate).toEqual(original.targetCoordinate);
    expect(restored.infoLevel).toBe(original.infoLevel);
    expect(restored.counterChance).toBe(original.counterChance);
    expect(restored.probesLost).toBe(original.probesLost);
    expect(restored.probesSent).toBe(original.probesSent);
    expect(restored.resources).toEqual(original.resources);
    expect(restored.fleet).toEqual(original.fleet);
    expect(restored.defenses).toEqual(original.defenses);
    expect(restored.buildings).toEqual(original.buildings);
    expect(restored.research).toEqual(original.research);
  });

  test('serialize with null sections', () => {
    const planet = createTestPlanet();
    const defenses = createTestDefenses();
    const tech = createTestTech();

    // Resources-only report
    const original = svc.generateEspionageReport(0, 4, 1, planet, defenses, tech);
    const dbRow = svc.serializeForDb(original);

    expect(dbRow.resources_json).not.toBeNull();
    expect(dbRow.fleet_json).toBeNull();
    expect(dbRow.defenses_json).toBeNull();
    expect(dbRow.buildings_json).toBeNull();
    expect(dbRow.research_json).toBeNull();

    const restored = svc.deserializeFromDb(dbRow);
    expect(restored.fleet).toBeNull();
    expect(restored.defenses).toBeNull();
    expect(restored.buildings).toBeNull();
    expect(restored.research).toBeNull();
  });

  test('serialized created_at is unix seconds', () => {
    const planet = createTestPlanet();
    const original = svc.generateEspionageReport(
      5, 5, 1, planet, createTestDefenses(), createTestTech(),
    );
    const dbRow = svc.serializeForDb(original);
    // timestamp is ms, created_at should be seconds
    expect(dbRow.created_at).toBe(Math.floor(original.timestamp / 1000));
  });
});

// ============================================================================
// NOTIFICATION
// ============================================================================

describe('Notification', () => {
  const svc = new EspionageService();

  test('notification has correct fields', () => {
    const notif = svc.createNotification(
      'defender-1',
      { galaxy: 2, system: 50, position: 8 },
      'Attacker Player',
      3,
      true,
    );
    expect(notif.defenderId).toBe('defender-1');
    expect(notif.attackerCoordinate).toEqual({ galaxy: 2, system: 50, position: 8 });
    expect(notif.attackerName).toBe('Attacker Player');
    expect(notif.probesDetected).toBe(3);
    expect(notif.probesDestroyed).toBe(true);
    expect(notif.id).toBeDefined();
    expect(notif.timestamp).toBeDefined();
  });
});

// ============================================================================
// CONVENIENCE FUNCTION
// ============================================================================

describe('Convenience Functions', () => {
  test('generateEspionageReport function works', () => {
    const planet = createTestPlanet();
    const report = generateEspionageReport(
      8, 4, 1, planet, createTestDefenses(), createTestTech(),
    );
    expect(report.infoLevel).toBe(InfoLevel.Defenses);
    expect(report.resources).not.toBeNull();
    expect(report.fleet).not.toBeNull();
    expect(report.defenses).not.toBeNull();
  });
});
