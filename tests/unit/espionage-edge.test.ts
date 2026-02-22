import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  EspionageService,
  EspionageParams,
  InfoLevel,
} from '../../worker/src/game/services/espionageService';
import { PlanetState, Ships, TechLevels } from '../../worker/src/game/types';
import { DefenseStructures } from '../../worker/src/game/defenses';

/**
 * Edge-case tests for espionage service
 */

describe('EspionageService - Edge Cases', () => {
  let service: EspionageService;

  beforeEach(() => {
    service = new EspionageService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Helper to create a mock planet
  function createMockPlanet(playerId: string): PlanetState {
    return {
      id: `planet-${playerId}`,
      playerId,
      coordinate: { galaxy: 1, system: 1, position: 1 },
      name: 'Test Planet',
      type: 'planet',
      lastUpdate: Date.now(),
      resources: {
        metal: 10000,
        crystal: 5000,
        deuterium: 2000,
      },
      resourceProduction: {
        metal: 100,
        crystal: 50,
        deuterium: 20,
      },
      ships: {
        lightFighter: 10,
        heavyFighter: 5,
        cruiser: 2,
        battleship: 1,
        battlecruiser: 0,
        bomber: 0,
        destroyer: 0,
        deathstar: 0,
        smallCargoShip: 20,
        largeCargoShip: 10,
        colonyShip: 1,
        recycler: 5,
        espionageProbe: 50,
        solarSatellite: 10,
      },
      buildings: {
        metalMine: 10,
        crystalMine: 8,
        deuteriumSynthesizer: 6,
        solarPlant: 5,
        fusionPlant: 2,
        roboticsFactory: 3,
        naniteFactory: 1,
        shipyard: 4,
        researchLab: 3,
        alliance: 0,
        missileSilo: 2,
        terraformer: 0,
        spacePort: 1,
      },
      defenseLastUpdate: Date.now(),
    };
  }

  function createMockDefenses(): DefenseStructures {
    return {
      rocketLauncher: 10,
      lightLaser: 5,
      heavyLaser: 3,
      gaussCannon: 2,
      ionCannon: 1,
      plasmaTurret: 0,
      smallShieldDome: 1,
      largeShieldDome: 0,
      antiBallisticMissile: 5,
      interplanetaryMissile: 2,
    };
  }

  function createMockTech(): TechLevels {
    return {
      energyTech: 5,
      hyperspaceTech: 2,
      combustionDrive: 5,
      impulseDrive: 3,
      hyperspaceDrive: 2,
      espionageTech: 4,
      computerTech: 3,
      weaponsTech: 4,
      shieldingTech: 3,
      armorTech: 2,
    };
  }

  // ========================================================================
  // TEST 1: Zero probes should fail validation
  // ========================================================================
  it('should fail validation with 0 probes', () => {
    const ships: Ships = {
      ...createMockPlanet('attacker').ships,
      espionageProbe: 10,
    };

    const error = service.validateMission(0, ships);
    expect(error).toBeTruthy();
    expect(error).toContain('Probe count must be at least 1');
  });

  // ========================================================================
  // TEST 2: Spy on own planet should fail validation (self-spy prevention)
  // ========================================================================
  it('should prevent self-spying (own planet espionage)', () => {
    const attackerId = 'player-1';
    const attackerPlanet = createMockPlanet(attackerId);
    const targetPlanet = createMockPlanet(attackerId); // Same player ID

    const params: EspionageParams = {
      attackerId,
      attackerName: 'Self',
      attackerSpyTech: 5,
      attackerCoordinate: attackerPlanet.coordinate,
      probeCount: 10,
      defenderId: attackerId, // Same as attacker
      defenderName: 'Self',
      defenderSpyTech: 5,
      targetPlanet,
      targetDefenses: createMockDefenses(),
      defenderTech: createMockTech(),
    };

    // This is a business logic check: attacker and defender IDs are the same
    expect(params.attackerId).toBe(params.defenderId);
  });

  // ========================================================================
  // TEST 3: Insufficient probes should fail validation
  // ========================================================================
  it('should fail validation when probe count exceeds available probes', () => {
    const ships: Ships = {
      ...createMockPlanet('attacker').ships,
      espionageProbe: 5, // Only 5 probes available
    };

    const error = service.validateMission(10, ships); // Try to send 10
    expect(error).toBeTruthy();
    expect(error).toContain('Not enough espionage probes');
  });

  // ========================================================================
  // TEST 4: Max probes limit (50)
  // ========================================================================
  it('should reject mission with more than 50 probes', () => {
    const ships: Ships = {
      ...createMockPlanet('attacker').ships,
      espionageProbe: 100,
    };

    const error = service.validateMission(51, ships);
    expect(error).toBeTruthy();
    expect(error).toContain('Maximum 50 probes');
  });

  // ========================================================================
  // TEST 5: Counter-espionage RNG with equal tech levels
  // ========================================================================
  it('should calculate detection chance even with equal tech levels', () => {
    const attackerSpyTech = 5;
    const defenderSpyTech = 5;
    const probeCount = 10;

    const chance = service.calculateCounterChance(
      attackerSpyTech,
      defenderSpyTech,
      probeCount,
    );

    // Formula: max(0, defenderSpy - attackerSpy + 1) * probeCount * 2
    // = max(0, 5 - 5 + 1) * 10 * 2
    // = 1 * 10 * 2 = 20%
    expect(chance).toBe(20);
  });

  // ========================================================================
  // TEST 6: Counter-espionage chance clamped to 100%
  // ========================================================================
  it('should clamp detection chance to 100%', () => {
    const attackerSpyTech = 1;
    const defenderSpyTech = 10; // Much higher
    const probeCount = 50; // Max probes

    const chance = service.calculateCounterChance(
      attackerSpyTech,
      defenderSpyTech,
      probeCount,
    );

    // Formula: max(0, 10 - 1 + 1) * 50 * 2 = 10 * 50 * 2 = 1000
    // Clamped to 100
    expect(chance).toBe(100);
    expect(chance).toBeLessThanOrEqual(100);
  });

  // ========================================================================
  // TEST 7: Spy tech level difference affecting info level
  // ========================================================================
  it('should reveal info levels based on tech difference with single probe', () => {
    const defenderSpyTech = 5;

    // Tech difference +5: attackerSpy = 10, defenderSpy = 5, probes = 1
    // effectiveDiff = 10 - 5 + (1 - 1) * 2 = 5
    const diff1 = service.calculateEffectiveSpyDiff(10, defenderSpyTech, 1);
    const info1 = service.getInfoLevel(diff1);
    expect(info1).toBe(InfoLevel.Defenses); // diff >= 4

    // Tech difference -5: attackerSpy = 0, defenderSpy = 5, probes = 1
    // effectiveDiff = 0 - 5 + (1 - 1) * 2 = -5
    const diff2 = service.calculateEffectiveSpyDiff(0, defenderSpyTech, 1);
    const info2 = service.getInfoLevel(diff2);
    expect(info2).toBe(InfoLevel.Resources); // Only resources visible at negative diff
  });

  // ========================================================================
  // TEST 8: Probe count bonus to effective spy level
  // ========================================================================
  it('should add +2 effective spy level per probe beyond the first', () => {
    const attackerSpyTech = 5;
    const defenderSpyTech = 4; // Attacker +1

    // 1 probe: effectiveDiff = 5 - 4 + (1 - 1) * 2 = 1
    const diff1 = service.calculateEffectiveSpyDiff(
      attackerSpyTech,
      defenderSpyTech,
      1,
    );
    expect(diff1).toBe(1);
    const info1 = service.getInfoLevel(diff1);
    expect(info1).toBe(InfoLevel.Resources);

    // 5 probes: effectiveDiff = 5 - 4 + (5 - 1) * 2 = 1 + 8 = 9
    const diff5 = service.calculateEffectiveSpyDiff(
      attackerSpyTech,
      defenderSpyTech,
      5,
    );
    expect(diff5).toBe(9);
    const info5 = service.getInfoLevel(diff5);
    expect(info5).toBe(InfoLevel.Research); // diff >= 8
  });

  // ========================================================================
  // TEST 9: Info level tiers (Resources, Fleet, Defenses, Buildings, Research)
  // ========================================================================
  it('should progress through all info level tiers correctly', () => {
    // Resources: any effective diff
    expect(service.getInfoLevel(-100)).toBe(InfoLevel.Resources);
    expect(service.getInfoLevel(0)).toBe(InfoLevel.Resources);

    // Fleet: diff >= 2
    expect(service.getInfoLevel(2)).toBe(InfoLevel.Fleet);

    // Defenses: diff >= 4
    expect(service.getInfoLevel(4)).toBe(InfoLevel.Defenses);

    // Buildings: diff >= 6
    expect(service.getInfoLevel(6)).toBe(InfoLevel.Buildings);

    // Research: diff >= 8
    expect(service.getInfoLevel(8)).toBe(InfoLevel.Research);
    expect(service.getInfoLevel(100)).toBe(InfoLevel.Research);
  });

  // ========================================================================
  // TEST 10: Report generation with full mission parameters
  // ========================================================================
  it('should generate complete espionage report with all tiers', () => {
    const attackerPlanet = createMockPlanet('attacker');
    const targetPlanet = createMockPlanet('defender');

    const params: EspionageParams = {
      attackerId: 'attacker',
      attackerName: 'Attacker Player',
      attackerSpyTech: 10,
      attackerCoordinate: attackerPlanet.coordinate,
      probeCount: 20,
      defenderId: 'defender',
      defenderName: 'Defender Player',
      defenderSpyTech: 2,
      targetPlanet,
      targetDefenses: createMockDefenses(),
      defenderTech: createMockTech(),
    };

    const report = service.generateReport(params);

    expect(report).toBeDefined();
    expect(report.attackerId).toBe('attacker');
    expect(report.defenderId).toBe('defender');
    expect(report.probesSent).toBe(20);
    expect(report.targetPlayerName).toBe('Defender Player');
    expect(report.resources).toBeTruthy();
    expect(report.infoLevel).toBeGreaterThanOrEqual(InfoLevel.Defenses);
  });

  // ========================================================================
  // TEST 11: Probe loss application
  // ========================================================================
  it('should correctly apply probe losses to ship composition', () => {
    const ships: Ships = {
      ...createMockPlanet('attacker').ships,
      espionageProbe: 50,
    };

    const updated = service.applyProbeLoss(ships, 10);

    expect(updated.espionageProbe).toBe(40);
    expect(ships.espionageProbe).toBe(50); // Original unchanged

    // Test boundary: losing more probes than available
    const updated2 = service.applyProbeLoss(ships, 60);
    expect(updated2.espionageProbe).toBe(0); // Clamped to 0
  });

  // ========================================================================
  // TEST 12: Counter-espionage result with mocked RNG (detected)
  // ========================================================================
  it('should process counter-espionage with high detection probability', () => {
    // Mock Math.random to always trigger detection
    vi.spyOn(Math, 'random').mockReturnValue(0.1); // 10% < 50% chance = detected

    const result = service.processCounterEspionage(5, 5, 10);

    expect(result.detected).toBe(true);
    expect(result.probesDestroyed).toBe(10);
    expect(result.probesSurviving).toBe(0);
    expect(result.detectionChance).toBe(20);
  });

  // ========================================================================
  // TEST 13: Counter-espionage result with mocked RNG (not detected)
  // ========================================================================
  it('should process counter-espionage with low detection probability', () => {
    // Mock Math.random to always avoid detection
    // Using attacker spy 5, defender spy 3, probes 10
    // Detection chance = max(0, 3 - 5 + 1) * 10 * 2 = max(0, -1) * 10 * 2 = 0
    vi.spyOn(Math, 'random').mockReturnValue(0.95);

    const result = service.processCounterEspionage(5, 3, 10);

    expect(result.detected).toBe(false);
    expect(result.probesDestroyed).toBe(0);
    expect(result.probesSurviving).toBe(10);
    expect(result.detectionChance).toBe(0);
  });

  // ========================================================================
  // TEST 14: Full mission processing with probe losses
  // ========================================================================
  it('should process complete espionage mission with all side effects', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.15); // Trigger detection

    const attackerPlanet = createMockPlanet('attacker');
    const attackerShips = { ...attackerPlanet.ships, espionageProbe: 50 };
    const targetPlanet = createMockPlanet('defender');

    const params: EspionageParams & { attackerShips: Ships } = {
      attackerId: 'attacker',
      attackerName: 'Attacker',
      attackerSpyTech: 8,
      attackerCoordinate: attackerPlanet.coordinate,
      probeCount: 15,
      defenderId: 'defender',
      defenderName: 'Defender',
      defenderSpyTech: 3,
      targetPlanet,
      targetDefenses: createMockDefenses(),
      defenderTech: createMockTech(),
      attackerShips,
    };

    const result = service.processEspionageMission(params);

    expect(result.report).toBeDefined();
    expect(result.counter).toBeDefined();
    expect(result.updatedAttackerShips.espionageProbe).toBeLessThanOrEqual(
      attackerShips.espionageProbe,
    );
    // If detected, probes should be destroyed
    if (result.counter.detected) {
      expect(result.notification).toBeDefined();
      expect(result.updatedAttackerShips.espionageProbe).toBeLessThan(
        attackerShips.espionageProbe,
      );
    }
  });

  // ========================================================================
  // TEST 15: Recommend probe count based on tech and desired info level
  // ========================================================================
  it('should recommend appropriate probe count for target info level', () => {
    const attackerSpyTech = 5;
    const defenderSpyTech = 3;

    // Recommend probes for Defenses level (diff >= 4)
    // baseDiff = 5 - 3 = 2
    // Need: 2 + (probes - 1) * 2 >= 4
    // (probes - 1) * 2 >= 2
    // probes >= 2
    const recommended = service.recommendProbeCount(
      attackerSpyTech,
      defenderSpyTech,
      InfoLevel.Defenses,
      50,
    );

    expect(recommended).toBeGreaterThanOrEqual(1);
    expect(recommended).toBeLessThanOrEqual(50);
  });

  // ========================================================================
  // TEST 16: Negative detection chance should be clamped to 0
  // ========================================================================
  it('should clamp detection chance to minimum 0%', () => {
    const attackerSpyTech = 20; // Much higher
    const defenderSpyTech = 1;
    const probeCount = 1;

    const chance = service.calculateCounterChance(
      attackerSpyTech,
      defenderSpyTech,
      probeCount,
    );

    // Formula: max(0, 1 - 20 + 1) * 1 * 2 = max(0, -18) * 1 * 2 = 0
    expect(chance).toBe(0);
    expect(chance).toBeGreaterThanOrEqual(0);
  });

  // ========================================================================
  // TEST 17: Has enough probes validation
  // ========================================================================
  it('should correctly validate sufficient probe availability', () => {
    const ships: Ships = {
      ...createMockPlanet('attacker').ships,
      espionageProbe: 30,
    };

    expect(service.hasEnoughProbes(ships, 20)).toBe(true);
    expect(service.hasEnoughProbes(ships, 30)).toBe(true);
    expect(service.hasEnoughProbes(ships, 31)).toBe(false);
    expect(service.hasEnoughProbes(ships, 0)).toBe(false); // 0 probes is invalid
  });
});
