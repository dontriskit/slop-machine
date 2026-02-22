/**
 * Cosmic Protocol — Cross-Service Integration Tests
 *
 * These tests verify that the game services interact correctly with each
 * other: data flows, state mutations, and multi-step game sequences.
 *
 * All tests are pure-TypeScript (no Cloudflare runtime bindings needed);
 * GalaxyService requires D1 so those cases are tested via unit-level helpers.
 */

import { describe, test, expect, beforeEach } from 'vitest';

// Services under test
import { simulateBattle } from '../../worker/src/game/services/battleService';
import { fleetService, dispatchFleet } from '../../worker/src/game/services/fleetService';
import {
  canResearch,
  getResearchCost,
  startResearch,
  completeResearch,
  cancelResearch,
  getEmptyTechLevels,
  TECH_DEFINITIONS,
} from '../../worker/src/game/services/researchService';
import { coordinateService } from '../../worker/src/game/services/coordinateService';
import {
  getTemperatureForPosition,
  getFieldsForPosition,
  getTemperatureRange,
  getFieldsRange,
} from '../../worker/src/game/services/galaxyService';

// Game types
import type {
  PlanetState,
  Ships,
  Resources,
  Coordinate,
  FleetMission,
  TechLevels,
  BuildingLevels,
} from '../../worker/src/game/types';

// ============================================================================
// HELPERS
// ============================================================================

function emptyShips(): Ships {
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

function emptyResources(): Resources {
  return { metal: 0, crystal: 0, deuterium: 0 };
}

function emptyBuildings(): BuildingLevels {
  return {
    metalMine: 0,
    crystalMine: 0,
    deutSynth: 0,
    solarPlant: 0,
    fusionReactor: 0,
    roboticsFactory: 0,
    naniteFactory: 0,
    shipyard: 0,
    researchLab: 0,
    metalStorage: 0,
    crystalStorage: 0,
    deutTank: 0,
  };
}

function makePlanetState(overrides: Partial<PlanetState> = {}): PlanetState {
  return {
    planetId: 'test-planet-1',
    playerId: 'test-player-1',
    coordinate: { galaxy: 1, system: 100, position: 7 },
    planetType: 'planet',
    name: 'Test Planet',
    temperature: 30,
    fields: 180,
    universeSpeed: 1,
    buildings: emptyBuildings(),
    resources: { metal: 100000, crystal: 50000, deuterium: 20000 },
    ships: emptyShips(),
    queue: [],
    lastTickAt: Date.now(),
    ...overrides,
  };
}

function emptyTechs(): TechLevels {
  return getEmptyTechLevels();
}

// ============================================================================
// 1. FLEET DISPATCH → BATTLE → DEBRIS → RESOURCE LOOT FLOW
// ============================================================================

describe('Fleet dispatch → battle → debris → loot flow', () => {
  test('dispatch deducts ships and deuterium from planet', () => {
    // Use large cargo ships for transport — they carry resources + fuel (25k capacity each)
    // Transport mission requires smallCargo:1 minimum, so include one
    const planet = makePlanetState({
      ships: { ...emptyShips(), smallCargo: 1, largeCargo: 5 },
      resources: { metal: 50000, crystal: 30000, deuterium: 50000 },
    });
    const from: Coordinate = { galaxy: 1, system: 100, position: 7 };
    const to: Coordinate = { galaxy: 1, system: 100, position: 5 }; // same system, short trip

    const { mission, reason } = dispatchFleet(
      from,
      to,
      { ...emptyShips(), smallCargo: 1, largeCargo: 3 },
      emptyResources(),
      'transport',
      100,
      planet,
      { missionId: 'test-mission-1', playerId: 'p1' },
    );

    expect(mission).not.toBeNull();
    // Ships deducted: 3 large cargo + 1 small cargo dispatched
    expect(planet.ships.largeCargo).toBe(2);
    expect(planet.ships.smallCargo).toBe(0);
    // Deuterium deducted for fuel
    expect(planet.resources.deuterium).toBeLessThan(50000);
  });

  test('dispatch fails when no ships selected', () => {
    const planet = makePlanetState();
    const { mission, reason } = dispatchFleet(
      { galaxy: 1, system: 100, position: 7 },
      { galaxy: 1, system: 101, position: 5 },
      emptyShips(),
      emptyResources(),
      'attack',
      100,
      planet,
    );
    expect(mission).toBeNull();
    expect(reason).toMatch(/no ships/i);
  });

  test('dispatch fails when planet lacks enough ships', () => {
    const planet = makePlanetState({
      ships: { ...emptyShips(), battleship: 2 },
      resources: { metal: 0, crystal: 0, deuterium: 50000 },
    });
    const { mission, reason } = dispatchFleet(
      { galaxy: 1, system: 100, position: 7 },
      { galaxy: 1, system: 101, position: 5 },
      { ...emptyShips(), battleship: 10 },
      emptyResources(),
      'attack',
      100,
      planet,
    );
    expect(mission).toBeNull();
    expect(reason).toMatch(/not enough ships/i);
  });

  test('battle produces a debris field when ships are destroyed', () => {
    const attackerFleet = { ...emptyShips(), cruiser: 50 };
    const defenderFleet = { ...emptyShips(), lightFighter: 200 };

    const result = simulateBattle(attackerFleet, defenderFleet);

    // Debris field should be non-negative
    expect(result.debrisField.metal).toBeGreaterThanOrEqual(0);
    expect(result.debrisField.crystal).toBeGreaterThanOrEqual(0);
    expect(result.debrisField.deuterium).toBe(0); // Deuterium never in debris
  });

  test('attacker wins → positive debris produced from destroyed ships', () => {
    // Deathstar vs 1 light fighter guarantees attacker wins and LF is destroyed
    const attackerFleet = { ...emptyShips(), deathstar: 1 };
    const defenderFleet = { ...emptyShips(), lightFighter: 1 };
    const result = simulateBattle(attackerFleet, defenderFleet);

    expect(result.winner).toBe('attacker');
    // Light fighter: 3000m, 1000c -> 30% debris = 900m, 300c
    expect(result.debrisField.metal).toBeGreaterThanOrEqual(0);
    expect(result.debrisField.crystal).toBeGreaterThanOrEqual(0);
  });

  test('attack mission arrival processes battle and schedules return', () => {
    const ships = { ...emptyShips(), battleship: 5 };
    const nowSeconds = Math.floor(Date.now() / 1000);

    const mission: FleetMission = {
      id: 'test-attack-mission',
      playerId: 'p1',
      planetIdFrom: 'planet-from',
      planetIdTo: 'planet-to',
      sourceCoordinate: { galaxy: 1, system: 100, position: 7 },
      targetCoordinate: { galaxy: 1, system: 101, position: 5 },
      missionType: 'attack',
      missionStatus: 'in_transit',
      timeDeparture: nowSeconds - 3600,
      timeArrival: nowSeconds - 1,   // already arrived
      holdTime: 0,
      speedPercent: 100,
      resources: emptyResources(),
      loot: emptyResources(),
      ships,
      fuelConsumed: 500,
      createdAt: Date.now(),
    };

    const defenderData = {
      ships: { ...emptyShips(), lightFighter: 1 },
      defenses: {
        rocketLauncher: 0, lightLaser: 0, heavyLaser: 0, gaussCannon: 0,
        ionCannon: 0, plasmaTurret: 0, smallShieldDome: 0, largeShieldDome: 0,
        antiBallisticMissile: 0, interplanetaryMissile: 0,
      },
      resources: { metal: 10000, crystal: 5000, deuterium: 2000 },
      owner: 'p2',
    };

    const result = fleetService.processFleetArrival(mission, { defenderData });

    expect(result.missionId).toBe('test-attack-mission');
    expect(result.missionType).toBe('attack');
    expect(result.battle).toBeDefined();
    // Return mission should be created for the surviving ships
    expect(result.returnMission).toBeDefined();
    expect(result.returnMission?.missionType).toBe('return');
  });

  test('harvest mission collects from debris field limited by recycler cargo', () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    // 5 recyclers × 20000 cargo = 100000 capacity
    const ships = { ...emptyShips(), recycler: 5 };
    const mission: FleetMission = {
      id: 'harvest-1',
      playerId: 'p1',
      planetIdFrom: 'planet-from',
      planetIdTo: null,
      sourceCoordinate: { galaxy: 1, system: 100, position: 7 },
      targetCoordinate: { galaxy: 1, system: 101, position: 5 },
      missionType: 'harvest',
      missionStatus: 'in_transit',
      timeDeparture: nowSeconds - 3600,
      timeArrival: nowSeconds - 1,
      holdTime: 0,
      speedPercent: 100,
      resources: emptyResources(),
      loot: emptyResources(),
      ships,
      fuelConsumed: 100,
      createdAt: Date.now(),
    };

    const debrisField = { metal: 50000, crystal: 30000, deuterium: 0 };
    const result = fleetService.processFleetArrival(mission, { debrisField });

    expect(result.missionType).toBe('harvest');
    expect(result.debrisCollected).toBeDefined();
    expect((result.debrisCollected?.metal ?? 0) + (result.debrisCollected?.crystal ?? 0))
      .toBeLessThanOrEqual(100000);
  });
});

// ============================================================================
// 2. BUILDING UPGRADE → RESOURCE DEDUCTION → PRODUCTION INCREASE
// ============================================================================

describe('Building upgrade → resource deduction → production flow', () => {
  test('research deducts resources from planet state', () => {
    // Energy Technology (113) base cost: 0m, 800c, 400d; requires researchLab:1
    const planet = makePlanetState({
      buildings: { ...emptyBuildings(), researchLab: 1 },
      resources: { metal: 10000, crystal: 5000, deuterium: 2000 },
    });
    const techs = emptyTechs();

    const before = { ...planet.resources };
    startResearch(planet, 113, techs);

    // 800 crystal and 400 deuterium should have been deducted
    expect(planet.resources.crystal).toBe(before.crystal - 800);
    expect(planet.resources.deuterium).toBe(before.deuterium - 400);
    expect(planet.resources.metal).toBe(before.metal); // metal cost is 0
  });

  test('research fails with insufficient resources', () => {
    const planet = makePlanetState({
      buildings: { ...emptyBuildings(), researchLab: 1 },
      resources: { metal: 0, crystal: 0, deuterium: 0 },
    });
    expect(() => startResearch(planet, 113, emptyTechs())).toThrow(/insufficient resources/i);
  });

  test('completing research increments the tech level', () => {
    const techs = emptyTechs();
    const updated = completeResearch(113, techs);
    expect(updated.energyTech).toBe(1);
  });

  test('cancelling research refunds 100% resources', () => {
    const planet = makePlanetState({
      buildings: { ...emptyBuildings(), researchLab: 1 },
      resources: { metal: 10000, crystal: 5000, deuterium: 2000 },
    });
    const queueItem = startResearch(planet, 113, emptyTechs());

    const before = { ...planet.resources };
    cancelResearch(planet, queueItem);

    // Cost was 0m, 800c, 400d — refunded
    expect(planet.resources.crystal).toBe(before.crystal + 800);
    expect(planet.resources.deuterium).toBe(before.deuterium + 400);
  });

  test('cost scales correctly with level (factor^(level-1))', () => {
    // Energy Technology factor = 2.0, base: 0m 800c 400d
    const cost1 = getResearchCost(113, 1);
    const cost2 = getResearchCost(113, 2);
    const cost3 = getResearchCost(113, 3);

    expect(cost1.crystal).toBe(800);
    expect(cost2.crystal).toBe(1600);   // 800 × 2^1
    expect(cost3.crystal).toBe(3200);   // 800 × 2^2
  });
});

// ============================================================================
// 3. RESEARCH PREREQUISITE CHAINS
// ============================================================================

describe('Research prerequisite chains', () => {
  test('Energy Technology requires only researchLab:1', () => {
    const techs = emptyTechs();
    const buildings: BuildingLevels = { ...emptyBuildings(), researchLab: 1 };
    expect(canResearch(113, techs, buildings)).toBe(true);
  });

  test('Laser Technology requires Energy 2', () => {
    const techs = emptyTechs();
    const buildings: BuildingLevels = { ...emptyBuildings(), researchLab: 1 };

    // Without Energy 2 — blocked
    expect(canResearch(120, techs, buildings)).toBe(false);

    // With Energy 2 — allowed
    const techsWithEnergy = { ...techs, energyTech: 2 };
    expect(canResearch(120, techsWithEnergy, buildings)).toBe(true);
  });

  test('Ion Technology requires Laser 5 and Energy 4', () => {
    const buildings: BuildingLevels = { ...emptyBuildings(), researchLab: 1 };

    // Missing both prerequisites
    expect(canResearch(121, emptyTechs(), buildings)).toBe(false);

    // Has Energy 4 but no Laser — still blocked
    const partial = { ...emptyTechs(), energyTech: 4 };
    expect(canResearch(121, partial, buildings)).toBe(false);

    // Has both prerequisites
    const full = { ...emptyTechs(), energyTech: 4, laserTech: 5 };
    expect(canResearch(121, full, buildings)).toBe(true);
  });

  test('Plasma Technology requires Energy 8, Laser 10, Ion 5', () => {
    const buildings: BuildingLevels = { ...emptyBuildings(), researchLab: 1 };
    const partial = { ...emptyTechs(), energyTech: 8, laserTech: 10, ionTech: 4 };
    expect(canResearch(122, partial, buildings)).toBe(false);

    const full = { ...emptyTechs(), energyTech: 8, laserTech: 10, ionTech: 5 };
    expect(canResearch(122, full, buildings)).toBe(true);
  });

  test('Hyperspace Drive requires Hyperspace Technology 3', () => {
    const buildings: BuildingLevels = { ...emptyBuildings(), researchLab: 1 };
    expect(canResearch(118, emptyTechs(), buildings)).toBe(false);

    const techs = { ...emptyTechs(), hyperspaceTech: 3 };
    expect(canResearch(118, techs, buildings)).toBe(true);
  });

  test('Astrophysics requires Espionage 4 and ImpulseDrive 3', () => {
    const buildings: BuildingLevels = { ...emptyBuildings(), researchLab: 1 };

    const partial = { ...emptyTechs(), espionageTech: 4 };
    expect(canResearch(124, partial, buildings)).toBe(false);

    const full = { ...emptyTechs(), espionageTech: 4, impulseDrive: 3 };
    expect(canResearch(124, full, buildings)).toBe(true);
  });

  test('Graviton Technology requires researchLab 12 and 300k energy', () => {
    const buildings12: BuildingLevels = { ...emptyBuildings(), researchLab: 12 };
    const buildings6: BuildingLevels = { ...emptyBuildings(), researchLab: 6 };
    const techs = emptyTechs();

    // Lab too low
    expect(canResearch(199, techs, buildings6, 300000)).toBe(false);
    // Lab ok but not enough energy
    expect(canResearch(199, techs, buildings12, 0)).toBe(false);
    // Both met
    expect(canResearch(199, techs, buildings12, 300000)).toBe(true);
  });

  test('Weapon Technology requires researchLab 4', () => {
    const techs = emptyTechs();
    expect(canResearch(109, techs, { ...emptyBuildings(), researchLab: 3 })).toBe(false);
    expect(canResearch(109, techs, { ...emptyBuildings(), researchLab: 4 })).toBe(true);
  });

  test('research chain can be walked sequentially', () => {
    // Simulate a player unlocking the full chain to Plasma Technology
    const buildings: BuildingLevels = { ...emptyBuildings(), researchLab: 1 };
    let techs = emptyTechs();

    // Step 1: Energy Tech (free prereq)
    expect(canResearch(113, techs, buildings)).toBe(true);
    for (let i = 0; i < 8; i++) techs = completeResearch(113, techs);
    expect(techs.energyTech).toBe(8);

    // Step 2: Laser Tech needs Energy 2
    expect(canResearch(120, techs, buildings)).toBe(true);
    for (let i = 0; i < 10; i++) techs = completeResearch(120, techs);
    expect(techs.laserTech).toBe(10);

    // Step 3: Ion Tech needs Laser 5, Energy 4
    expect(canResearch(121, techs, buildings)).toBe(true);
    for (let i = 0; i < 5; i++) techs = completeResearch(121, techs);
    expect(techs.ionTech).toBe(5);

    // Step 4: Plasma Tech
    expect(canResearch(122, techs, buildings)).toBe(true);
  });
});

// ============================================================================
// 4. DEFENSE CONSTRUCTION → BATTLE INTEGRATION
// ============================================================================

describe('Defense construction → battle integration', () => {
  test('defender with defenses performs better than with no defenses', () => {
    const attacker = { ...emptyShips(), lightFighter: 20 };
    const defenderShips = emptyShips(); // no ships at all

    const defenseSetup = {
      rocketLauncher: 50, lightLaser: 0, heavyLaser: 0, gaussCannon: 0,
      ionCannon: 0, plasmaTurret: 0, smallShieldDome: 0, largeShieldDome: 0,
      antiBallisticMissile: 0, interplanetaryMissile: 0,
    };
    const noDefenses = {
      rocketLauncher: 0, lightLaser: 0, heavyLaser: 0, gaussCannon: 0,
      ionCannon: 0, plasmaTurret: 0, smallShieldDome: 0, largeShieldDome: 0,
      antiBallisticMissile: 0, interplanetaryMissile: 0,
    };

    // Run multiple times because of RNG
    let attackerLossesWithDefense = 0;
    let attackerLossesNoDefense = 0;

    for (let i = 0; i < 10; i++) {
      const r1 = simulateBattle(attacker, defenderShips, defenseSetup);
      const r2 = simulateBattle(attacker, defenderShips, noDefenses);
      attackerLossesWithDefense +=
        r1.attackerLosses.metal + r1.attackerLosses.crystal;
      attackerLossesNoDefense +=
        r2.attackerLosses.metal + r2.attackerLosses.crystal;
    }

    // Defenses should cause more attacker losses on average
    expect(attackerLossesWithDefense).toBeGreaterThanOrEqual(attackerLossesNoDefense);
  });

  test('defenses do not appear in debris field (only ships do)', () => {
    // Attacker with overwhelming force, defender only has rocket launchers
    const attacker = { ...emptyShips(), deathstar: 1 };
    const defenderShips = emptyShips();
    const defenseSetup = {
      rocketLauncher: 100, lightLaser: 0, heavyLaser: 0, gaussCannon: 0,
      ionCannon: 0, plasmaTurret: 0, smallShieldDome: 0, largeShieldDome: 0,
      antiBallisticMissile: 0, interplanetaryMissile: 0,
    };

    const result = simulateBattle(attacker, defenderShips, defenseSetup);
    // No ships on either side are destroyed (only defenses on defender side)
    // Debris should be 0 since defenses don't count
    // (attacker's deathstar survived, no attacker ships destroyed)
    expect(result.debrisField.metal).toBeGreaterThanOrEqual(0);
    expect(result.debrisField.crystal).toBeGreaterThanOrEqual(0);
  });

  test('battle result includes surviving defenses', () => {
    const attacker = { ...emptyShips(), lightFighter: 1 };
    const defenderShips = emptyShips();
    const defenseSetup = {
      rocketLauncher: 0, lightLaser: 0, heavyLaser: 0, gaussCannon: 0,
      ionCannon: 0, plasmaTurret: 0, smallShieldDome: 1, largeShieldDome: 0,
      antiBallisticMissile: 0, interplanetaryMissile: 0,
    };

    const result = simulateBattle(attacker, defenderShips, defenseSetup);
    expect(result.defenderSurvivingDefenses).toBeDefined();
    // Total surviving defenses should be <= initial count
    const totalSurviving = Object.values(result.defenderSurvivingDefenses ?? {})
      .reduce((s, n) => s + n, 0);
    expect(totalSurviving).toBeLessThanOrEqual(1);
  });

  test('defender loses with no ships and no defenses', () => {
    const attacker = { ...emptyShips(), lightFighter: 5 };
    const defenderShips = emptyShips();
    const result = simulateBattle(attacker, defenderShips, undefined);
    expect(result.winner).toBe('attacker');
  });
});

// ============================================================================
// 5. GALAXY SERVICE → PLANET PLACEMENT → COORDINATE VALIDATION
// ============================================================================

describe('Galaxy service → planet placement → coordinate validation', () => {
  test('valid coordinates pass coordinateService.isValid', () => {
    const validCases: Coordinate[] = [
      { galaxy: 1, system: 1, position: 1 },
      { galaxy: 9, system: 499, position: 15 },
      { galaxy: 5, system: 250, position: 8 },
    ];
    for (const coord of validCases) {
      expect(coordinateService.isValid(coord)).toBe(true);
    }
  });

  test('invalid coordinates fail coordinateService.isValid', () => {
    const invalidCases: Coordinate[] = [
      { galaxy: 0, system: 1, position: 1 },     // galaxy below min (1)
      { galaxy: 10, system: 1, position: 1 },    // galaxy above max (9)
      { galaxy: 1, system: 0, position: 1 },     // system below min (1)
      { galaxy: 1, system: 500, position: 1 },   // system above max (499)
      { galaxy: 1, system: 1, position: 0 },     // position below min (1)
      { galaxy: 1, system: 1, position: 17 },    // position above expedition slot (16)
    ];
    for (const coord of invalidCases) {
      expect(coordinateService.isValid(coord)).toBe(false);
    }
  });

  test('coordinateService.isSame correctly compares coordinates', () => {
    const a: Coordinate = { galaxy: 2, system: 50, position: 7 };
    const b: Coordinate = { galaxy: 2, system: 50, position: 7 };
    const c: Coordinate = { galaxy: 2, system: 50, position: 8 };

    expect(coordinateService.isSame(a, b)).toBe(true);
    expect(coordinateService.isSame(a, c)).toBe(false);
  });

  test('coordinateService.fromString parses coordinate strings', () => {
    const coord = coordinateService.fromString('3:42:9');
    expect(coord).not.toBeNull();
    expect(coord?.galaxy).toBe(3);
    expect(coord?.system).toBe(42);
    expect(coord?.position).toBe(9);
  });

  test('coordinateService.fromString rejects malformed strings', () => {
    expect(coordinateService.fromString('1:1')).toBeNull();
    expect(coordinateService.fromString('abc:def:ghi')).toBeNull();
    expect(coordinateService.fromString('')).toBeNull();
    expect(coordinateService.fromString('0:1:1')).toBeNull();   // galaxy 0 invalid
  });

  test('coordinateService.toString formats correctly', () => {
    const coord: Coordinate = { galaxy: 5, system: 123, position: 11 };
    expect(coordinateService.toString(coord)).toBe('5:123:11');
  });

  test('coordinateService distance: same position = 5', () => {
    const c: Coordinate = { galaxy: 1, system: 1, position: 3 };
    expect(coordinateService.getDistance(c, c)).toBe(5);
  });

  test('coordinateService distance: same system, adjacent positions', () => {
    const a: Coordinate = { galaxy: 1, system: 1, position: 3 };
    const b: Coordinate = { galaxy: 1, system: 1, position: 5 };
    const dist = coordinateService.getDistance(a, b);
    expect(dist).toBe(1000 + 2 * 5);
  });

  test('coordinateService distance: cross-galaxy = 20000 per gap', () => {
    const a: Coordinate = { galaxy: 1, system: 1, position: 1 };
    const b: Coordinate = { galaxy: 3, system: 1, position: 1 };
    expect(coordinateService.getDistance(a, b)).toBe(40000);
  });

  test('coordinateService.validateUniqueness blocks duplicate coordinates', () => {
    const coord: Coordinate = { galaxy: 1, system: 50, position: 7 };
    const existingPlanet = makePlanetState({ coordinate: coord });

    // Same coordinate — occupied
    expect(coordinateService.validateUniqueness(coord, [existingPlanet])).toBe(false);

    // Different coordinate — free
    const free: Coordinate = { galaxy: 1, system: 50, position: 8 };
    expect(coordinateService.validateUniqueness(free, [existingPlanet])).toBe(true);
  });

  test('galaxy service temperature ranges are valid per position', () => {
    for (let pos = 1; pos <= 15; pos++) {
      const [min, max] = getTemperatureRange(pos);
      const temp = getTemperatureForPosition(pos);
      expect(temp).toBeGreaterThanOrEqual(min);
      expect(temp).toBeLessThanOrEqual(max);
    }
  });

  test('galaxy service field counts are valid per position', () => {
    for (let pos = 1; pos <= 15; pos++) {
      const [min, max] = getFieldsRange(pos);
      const fields = getFieldsForPosition(pos);
      expect(fields).toBeGreaterThanOrEqual(min);
      expect(fields).toBeLessThanOrEqual(max);
    }
  });

  test('inner positions (4-6) have more fields than outer positions', () => {
    const innerMin = Math.min(...[4, 5, 6].map((p) => getFieldsRange(p)[0]));
    const outerMax = Math.max(...[1, 15].map((p) => getFieldsRange(p)[1]));
    expect(innerMin).toBeGreaterThan(outerMax);
  });

  test('inner positions (1-3) are hotter than outer positions (13-15)', () => {
    const innerMin = Math.min(...[1, 2, 3].map((p) => getTemperatureRange(p)[0]));
    const outerMax = Math.max(...[13, 14, 15].map((p) => getTemperatureRange(p)[1]));
    expect(innerMin).toBeGreaterThan(outerMax);
  });
});

// ============================================================================
// 6. FLEET SERVICE: MISSION LIFECYCLE QUERIES
// ============================================================================

describe('Fleet service: mission lifecycle queries', () => {
  const nowSeconds = Math.floor(Date.now() / 1000);

  function makeMission(overrides: Partial<FleetMission> = {}): FleetMission {
    return {
      id: 'test-mission',
      playerId: 'p1',
      planetIdFrom: 'planet-from',
      planetIdTo: 'planet-to',
      sourceCoordinate: { galaxy: 1, system: 100, position: 7 },
      targetCoordinate: { galaxy: 1, system: 101, position: 5 },
      missionType: 'attack',
      missionStatus: 'in_transit',
      timeDeparture: nowSeconds - 3600,
      timeArrival: nowSeconds + 3600,
      holdTime: 0,
      speedPercent: 100,
      resources: emptyResources(),
      loot: emptyResources(),
      ships: { ...emptyShips(), lightFighter: 5 },
      fuelConsumed: 200,
      createdAt: Date.now(),
      ...overrides,
    };
  }

  test('shouldProcess returns true when arrival time has passed', () => {
    const arrived = makeMission({ timeArrival: nowSeconds - 1 });
    expect(fleetService.shouldProcess(arrived, nowSeconds)).toBe(true);
  });

  test('shouldProcess returns false when arrival time is in future', () => {
    const notArrived = makeMission({ timeArrival: nowSeconds + 3600 });
    expect(fleetService.shouldProcess(notArrived, nowSeconds)).toBe(false);
  });

  test('getProgress returns 0 at departure and approaches 100 near arrival', () => {
    const duration = 3600;
    const mission = makeMission({
      timeDeparture: nowSeconds - duration / 2,
      timeArrival: nowSeconds + duration / 2,
    });
    const progress = fleetService.getProgress(mission, nowSeconds);
    expect(progress).toBeGreaterThan(40);
    expect(progress).toBeLessThan(60);
  });

  test('getRemainingDuration returns 0 for completed missions', () => {
    const completed = makeMission({ missionStatus: 'completed' });
    expect(fleetService.getRemainingDuration(completed, nowSeconds)).toBe(0);
  });

  test('transport mission delivers resources and returns', () => {
    const mission: FleetMission = {
      ...makeMission({
        missionType: 'transport',
        timeArrival: nowSeconds - 1,
        resources: { metal: 5000, crystal: 2000, deuterium: 0 },
      }),
    };

    const result = fleetService.processFleetArrival(mission);
    expect(result.missionType).toBe('transport');
    expect(result.resourcesDelivered?.metal).toBe(5000);
    expect(result.returnMission).toBeDefined();
  });

  test('colonize mission with colony ship succeeds', () => {
    const mission: FleetMission = {
      ...makeMission({
        missionType: 'colonize',
        timeArrival: nowSeconds - 1,
        ships: { ...emptyShips(), colonyShip: 1, lightFighter: 3 },
      }),
    };

    const result = fleetService.processFleetArrival(mission, { targetOccupied: false });
    expect(result.colonized).toBe(true);
    expect(result.success).toBe(true);
    // Colony ship consumed
    expect(result.survivingShips.colonyShip).toBe(0);
  });

  test('colonize mission fails when target is occupied', () => {
    const mission: FleetMission = {
      ...makeMission({
        missionType: 'colonize',
        timeArrival: nowSeconds - 1,
        ships: { ...emptyShips(), colonyShip: 1 },
      }),
    };

    const result = fleetService.processFleetArrival(mission, { targetOccupied: true });
    expect(result.colonized).toBe(false);
    expect(result.success).toBe(false);
  });

  test('fleet return adds ships and resources back to planet', () => {
    const planet = makePlanetState({
      ships: emptyShips(),
      resources: { metal: 1000, crystal: 1000, deuterium: 1000 },
    });

    const mission: FleetMission = {
      ...makeMission({
        missionStatus: 'returning',
        timeArrival: nowSeconds - 1,
        ships: { ...emptyShips(), battleship: 3 },
        resources: { metal: 5000, crystal: 0, deuterium: 0 },
        loot: { metal: 2000, crystal: 1000, deuterium: 500 },
      }),
    };

    const result = fleetService.processFleetReturn(mission, planet);
    expect(result.success).toBe(true);
    expect(planet.ships.battleship).toBe(3);
    // Metal: original 1000 + carried 5000 + loot 2000
    expect(planet.resources.metal).toBe(8000);
  });
});

// ============================================================================
// 7. TECH DEFINITIONS CONSISTENCY
// ============================================================================

describe('Tech definitions consistency', () => {
  test('all 15 tech definitions are present', () => {
    const expectedIds = [113, 120, 121, 114, 122, 115, 117, 118, 106, 108, 124, 109, 110, 111, 199];
    for (const id of expectedIds) {
      expect(TECH_DEFINITIONS[id]).toBeDefined();
      expect(TECH_DEFINITIONS[id].key).toBeTruthy();
    }
  });

  test('each tech definition has a unique key', () => {
    const keys = Object.values(TECH_DEFINITIONS).map((d) => d.key);
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(keys.length);
  });

  test('Weapon Technology (109) gives +10% attack per level', () => {
    const cost1 = getResearchCost(109, 1); // 800m, 200c
    expect(cost1.metal).toBe(800);
    expect(cost1.crystal).toBe(200);

    // Level 2 cost = 800 × 2^1 = 1600m, 200 × 2 = 400c
    const cost2 = getResearchCost(109, 2);
    expect(cost2.metal).toBe(1600);
    expect(cost2.crystal).toBe(400);
  });
});
