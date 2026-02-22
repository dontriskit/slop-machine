/**
 * Unit tests for the Shipyard Service
 * Tests ship requirements, costs, build times, resource deduction, and queue mechanics.
 */
import { describe, test, expect } from 'vitest';
import {
  canBuildShip,
  getShipCost,
  getShipBuildTime,
  getShipRequirements,
  getAvailableShips,
  getAllShipInfo,
  buildShips,
  processShipyardQueue,
  cancelShipOrder,
  createEmptyQueue,
  getNextCompletionTime,
  getTotalQueueTime,
  SHIP_COSTS,
  SHIP_REQUIREMENTS,
  SHIP_NAMES,
  ShipyardQueue,
} from '../../worker/src/game/services/shipyardService';
import { BuildingLevels, TechLevels, Resources, Ships } from '../../worker/src/game/types';

// ============================================================================
// HELPERS
// ============================================================================

function makeBuildings(overrides: Partial<BuildingLevels> = {}): BuildingLevels {
  return {
    metalMine: 1,
    crystalMine: 1,
    deutSynth: 0,
    solarPlant: 1,
    fusionReactor: 0,
    roboticsFactory: 0,
    naniteFactory: 0,
    shipyard: 0,
    researchLab: 0,
    metalStorage: 1,
    crystalStorage: 1,
    deutTank: 1,
    ...overrides,
  };
}

function makeTechLevels(overrides: Partial<TechLevels> = {}): TechLevels {
  return {
    energyTech: 0,
    laserTech: 0,
    ionTech: 0,
    hyperspaceTech: 0,
    plasmaTech: 0,
    combustionDrive: 0,
    impulseDrive: 0,
    hyperspaceDrive: 0,
    espionageTech: 0,
    computerTech: 0,
    astrophysics: 0,
    weaponTech: 0,
    shieldingTech: 0,
    armorTech: 0,
    gravitonTech: 0,
    ...overrides,
  };
}

function makeResources(metal: number = 0, crystal: number = 0, deuterium: number = 0): Resources {
  return { metal, crystal, deuterium };
}

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

// ============================================================================
// SHIP REQUIREMENTS
// ============================================================================

describe('Ship Requirements', () => {
  test('light fighter requires shipyard 1 + combustion drive 1', () => {
    const req = getShipRequirements('lightFighter');
    expect(req.shipyard).toBe(1);
    expect(req.techs.combustionDrive).toBe(1);
  });

  test('deathstar requires shipyard 12 + hyperspace tech 6 + hyperspace drive 7 + graviton 1', () => {
    const req = getShipRequirements('deathstar');
    expect(req.shipyard).toBe(12);
    expect(req.techs.hyperspaceTech).toBe(6);
    expect(req.techs.hyperspaceDrive).toBe(7);
    expect(req.techs.gravitonTech).toBe(1);
  });

  test('espionage probe requires shipyard 3 + combustion drive 3 + espionage tech 2', () => {
    const req = getShipRequirements('espionageProbe');
    expect(req.shipyard).toBe(3);
    expect(req.techs.combustionDrive).toBe(3);
    expect(req.techs.espionageTech).toBe(2);
  });

  test('every ship type has defined requirements', () => {
    const shipTypes: (keyof Ships)[] = [
      'lightFighter', 'heavyFighter', 'cruiser', 'battleship',
      'battlecruiser', 'bomber', 'destroyer', 'deathstar',
      'smallCargo', 'largeCargo', 'colonyShip', 'recycler', 'espionageProbe',
    ];

    for (const shipType of shipTypes) {
      const req = getShipRequirements(shipType);
      expect(req).toBeDefined();
      expect(req.shipyard).toBeGreaterThanOrEqual(1);
    }
  });
});

// ============================================================================
// CAN BUILD SHIP
// ============================================================================

describe('canBuildShip', () => {
  test('cannot build light fighter without shipyard', () => {
    const buildings = makeBuildings({ shipyard: 0 });
    const techs = makeTechLevels({ combustionDrive: 1 });
    expect(canBuildShip('lightFighter', buildings, techs)).toBe(false);
  });

  test('can build light fighter with shipyard 1 and combustion drive 1', () => {
    const buildings = makeBuildings({ shipyard: 1 });
    const techs = makeTechLevels({ combustionDrive: 1 });
    expect(canBuildShip('lightFighter', buildings, techs)).toBe(true);
  });

  test('cannot build cruiser without ion tech 2', () => {
    const buildings = makeBuildings({ shipyard: 5 });
    const techs = makeTechLevels({ impulseDrive: 4, ionTech: 1 });
    expect(canBuildShip('cruiser', buildings, techs)).toBe(false);
  });

  test('can build cruiser with shipyard 5 + impulse drive 4 + ion tech 2', () => {
    const buildings = makeBuildings({ shipyard: 5 });
    const techs = makeTechLevels({ impulseDrive: 4, ionTech: 2 });
    expect(canBuildShip('cruiser', buildings, techs)).toBe(true);
  });

  test('cannot build deathstar without graviton tech', () => {
    const buildings = makeBuildings({ shipyard: 12 });
    const techs = makeTechLevels({ hyperspaceTech: 6, hyperspaceDrive: 7, gravitonTech: 0 });
    expect(canBuildShip('deathstar', buildings, techs)).toBe(false);
  });

  test('can build deathstar with all requirements met', () => {
    const buildings = makeBuildings({ shipyard: 12 });
    const techs = makeTechLevels({ hyperspaceTech: 6, hyperspaceDrive: 7, gravitonTech: 1 });
    expect(canBuildShip('deathstar', buildings, techs)).toBe(true);
  });

  test('higher than required levels still allows building', () => {
    const buildings = makeBuildings({ shipyard: 10 });
    const techs = makeTechLevels({ combustionDrive: 5 });
    expect(canBuildShip('lightFighter', buildings, techs)).toBe(true);
  });

  test('recycler requires combustion drive 6 + shielding tech 2', () => {
    const buildings = makeBuildings({ shipyard: 4 });
    const techs = makeTechLevels({ combustionDrive: 6, shieldingTech: 2 });
    expect(canBuildShip('recycler', buildings, techs)).toBe(true);

    const techsMissingShield = makeTechLevels({ combustionDrive: 6, shieldingTech: 1 });
    expect(canBuildShip('recycler', buildings, techsMissingShield)).toBe(false);
  });
});

// ============================================================================
// SHIP COSTS
// ============================================================================

describe('Ship Costs', () => {
  test('light fighter costs 3000 metal, 1000 crystal, 0 deuterium', () => {
    const cost = getShipCost('lightFighter');
    expect(cost.metal).toBe(3000);
    expect(cost.crystal).toBe(1000);
    expect(cost.deuterium).toBe(0);
  });

  test('deathstar costs 5M metal, 4M crystal, 1M deuterium', () => {
    const cost = getShipCost('deathstar');
    expect(cost.metal).toBe(5000000);
    expect(cost.crystal).toBe(4000000);
    expect(cost.deuterium).toBe(1000000);
  });

  test('espionage probe costs 0 metal, 1000 crystal, 0 deuterium', () => {
    const cost = getShipCost('espionageProbe');
    expect(cost.metal).toBe(0);
    expect(cost.crystal).toBe(1000);
    expect(cost.deuterium).toBe(0);
  });

  test('costs match SHIP_COSTS constant', () => {
    for (const shipType of Object.keys(SHIP_COSTS) as (keyof Ships)[]) {
      const cost = getShipCost(shipType);
      expect(cost).toEqual(SHIP_COSTS[shipType]);
    }
  });

  test('getShipCost returns a copy (not a reference)', () => {
    const cost = getShipCost('lightFighter');
    cost.metal = 999999;
    const cost2 = getShipCost('lightFighter');
    expect(cost2.metal).toBe(3000);
  });
});

// ============================================================================
// BUILD TIME FORMULA
// ============================================================================

describe('Build Time', () => {
  test('build time = (metal + crystal) / (2500 * (1 + shipyard) * speed * 2^nanite)', () => {
    // Light fighter: metal=3000, crystal=1000 => (4000) / (2500 * (1+1) * 1 * 1) = 4000/5000 = 0.8 => floor = 1 (min)
    const time = getShipBuildTime('lightFighter', 1, 0, 1);
    const expected = Math.max(Math.floor(4000 / (2500 * 2 * 1 * 1)), 1);
    expect(time).toBe(expected);
  });

  test('higher shipyard level decreases build time', () => {
    const timeLow = getShipBuildTime('cruiser', 5, 0, 1);
    const timeHigh = getShipBuildTime('cruiser', 10, 0, 1);
    expect(timeHigh).toBeLessThanOrEqual(timeLow);
  });

  test('nanite factory halves build time per level', () => {
    const timeNoNanite = getShipBuildTime('battleship', 7, 0, 1);
    const timeNanite1 = getShipBuildTime('battleship', 7, 1, 1);
    const timeNanite2 = getShipBuildTime('battleship', 7, 2, 1);

    // Each nanite level should roughly halve the time
    expect(timeNanite1).toBeLessThanOrEqual(Math.ceil(timeNoNanite / 2));
    expect(timeNanite2).toBeLessThanOrEqual(Math.ceil(timeNanite1 / 2));
  });

  test('universe speed multiplier reduces build time', () => {
    const time1x = getShipBuildTime('cruiser', 5, 0, 1);
    const time2x = getShipBuildTime('cruiser', 5, 0, 2);
    expect(time2x).toBeLessThanOrEqual(Math.ceil(time1x / 2));
  });

  test('minimum build time is 1 second', () => {
    const time = getShipBuildTime('espionageProbe', 20, 5, 100);
    expect(time).toBeGreaterThanOrEqual(1);
  });

  test('deathstar has very long build time', () => {
    // Deathstar: 5M + 4M = 9M / (2500 * (1+7) * 1 * 1) = 9000000 / 20000 = 450 seconds
    const time = getShipBuildTime('deathstar', 7, 0, 1);
    expect(time).toBeGreaterThan(400);
  });
});

// ============================================================================
// RESOURCE DEDUCTION (buildShips)
// ============================================================================

describe('buildShips', () => {
  test('deducts resources on successful build', () => {
    const buildings = makeBuildings({ shipyard: 1 });
    const techs = makeTechLevels({ combustionDrive: 1 });
    const resources = makeResources(10000, 5000, 0);

    const order = buildShips('lightFighter', 2, buildings, techs, resources, 1);

    expect(order.shipType).toBe('lightFighter');
    expect(order.count).toBe(2);
    expect(order.totalCost.metal).toBe(6000);
    expect(order.totalCost.crystal).toBe(2000);
    expect(resources.metal).toBe(4000);  // 10000 - 6000
    expect(resources.crystal).toBe(3000); // 5000 - 2000
  });

  test('throws on insufficient resources', () => {
    const buildings = makeBuildings({ shipyard: 1 });
    const techs = makeTechLevels({ combustionDrive: 1 });
    const resources = makeResources(1000, 500, 0);

    expect(() => buildShips('lightFighter', 1, buildings, techs, resources, 1)).toThrow(
      /Insufficient resources/,
    );
  });

  test('throws on missing prerequisites', () => {
    const buildings = makeBuildings({ shipyard: 0 });
    const techs = makeTechLevels();
    const resources = makeResources(100000, 100000, 100000);

    expect(() => buildShips('lightFighter', 1, buildings, techs, resources, 1)).toThrow(
      /Prerequisites not met/,
    );
  });

  test('throws on zero or negative count', () => {
    const buildings = makeBuildings({ shipyard: 1 });
    const techs = makeTechLevels({ combustionDrive: 1 });
    const resources = makeResources(100000, 100000, 0);

    expect(() => buildShips('lightFighter', 0, buildings, techs, resources, 1)).toThrow(
      /Count must be a positive/,
    );
    expect(() => buildShips('lightFighter', -1, buildings, techs, resources, 1)).toThrow(
      /Count must be a positive/,
    );
  });

  test('does not deduct resources on failure', () => {
    const buildings = makeBuildings({ shipyard: 0 });
    const techs = makeTechLevels();
    const resources = makeResources(100000, 100000, 100000);
    const originalMetal = resources.metal;

    try {
      buildShips('lightFighter', 1, buildings, techs, resources, 1);
    } catch {
      // Expected
    }

    expect(resources.metal).toBe(originalMetal);
  });

  test('build order has correct per-unit cost and time', () => {
    const buildings = makeBuildings({ shipyard: 5 });
    const techs = makeTechLevels({ impulseDrive: 4, ionTech: 2 });
    const resources = makeResources(500000, 500000, 500000);

    const order = buildShips('cruiser', 5, buildings, techs, resources, 1);

    expect(order.costPer.metal).toBe(20000);
    expect(order.costPer.crystal).toBe(7000);
    expect(order.costPer.deuterium).toBe(2000);
    expect(order.totalCost.metal).toBe(100000);
    expect(order.totalCost.crystal).toBe(35000);
    expect(order.totalCost.deuterium).toBe(10000);
    expect(order.totalTime).toBe(order.buildTimePer * 5);
  });
});

// ============================================================================
// QUEUE MECHANICS
// ============================================================================

describe('Queue Mechanics', () => {
  test('processShipyardQueue completes units when time passes', () => {
    const ships = emptyShips();
    const queue: ShipyardQueue = {
      orders: [],
      currentOrder: {
        shipType: 'lightFighter',
        count: 3,
        costPer: { metal: 3000, crystal: 1000, deuterium: 0 },
        buildTimePer: 10,  // 10 seconds per unit
        totalCost: { metal: 9000, crystal: 3000, deuterium: 0 },
        totalTime: 30,
      },
      currentProgress: 0,
      startedAt: 1000000,  // started at T=1000000ms
    };

    // After 25 seconds, 2 units should be complete
    processShipyardQueue(queue, ships, 1000000 + 25000);

    expect(ships.lightFighter).toBe(2);
    expect(queue.currentProgress).toBe(2);
    expect(queue.currentOrder).not.toBeNull();
  });

  test('processShipyardQueue finishes order and moves to next', () => {
    const ships = emptyShips();
    const nextOrder = {
      shipType: 'heavyFighter' as keyof Ships,
      count: 2,
      costPer: { metal: 6000, crystal: 4000, deuterium: 0 },
      buildTimePer: 20,
      totalCost: { metal: 12000, crystal: 8000, deuterium: 0 },
      totalTime: 40,
    };
    const queue: ShipyardQueue = {
      orders: [nextOrder],
      currentOrder: {
        shipType: 'lightFighter',
        count: 1,
        costPer: { metal: 3000, crystal: 1000, deuterium: 0 },
        buildTimePer: 10,
        totalCost: { metal: 3000, crystal: 1000, deuterium: 0 },
        totalTime: 10,
      },
      currentProgress: 0,
      startedAt: 1000000,
    };

    // After 15 seconds: first order done (10s), second order 5s in
    processShipyardQueue(queue, ships, 1000000 + 15000);

    expect(ships.lightFighter).toBe(1);
    expect(queue.currentOrder?.shipType).toBe('heavyFighter');
    expect(queue.orders.length).toBe(0);
  });

  test('processShipyardQueue with empty queue is a no-op', () => {
    const ships = emptyShips();
    const queue = createEmptyQueue();

    processShipyardQueue(queue, ships, Date.now());

    expect(ships.lightFighter).toBe(0);
    expect(queue.currentOrder).toBeNull();
  });

  test('cancelShipOrder refunds resources and removes from queue', () => {
    const resources = makeResources(0, 0, 0);
    const order = {
      shipType: 'cruiser' as keyof Ships,
      count: 5,
      costPer: { metal: 20000, crystal: 7000, deuterium: 2000 },
      buildTimePer: 10,
      totalCost: { metal: 100000, crystal: 35000, deuterium: 10000 },
      totalTime: 50,
    };
    const queue: ShipyardQueue = {
      orders: [order],
      currentOrder: null,
      currentProgress: 0,
      startedAt: 0,
    };

    const cancelled = cancelShipOrder(queue, 0, resources);

    expect(cancelled).not.toBeNull();
    expect(cancelled!.shipType).toBe('cruiser');
    expect(resources.metal).toBe(100000);
    expect(resources.crystal).toBe(35000);
    expect(resources.deuterium).toBe(10000);
    expect(queue.orders.length).toBe(0);
  });

  test('cancelShipOrder returns null for invalid index', () => {
    const resources = makeResources(0, 0, 0);
    const queue = createEmptyQueue();

    expect(cancelShipOrder(queue, 0, resources)).toBeNull();
    expect(cancelShipOrder(queue, -1, resources)).toBeNull();
    expect(cancelShipOrder(queue, 5, resources)).toBeNull();
  });

  test('getNextCompletionTime returns correct time', () => {
    const queue: ShipyardQueue = {
      orders: [],
      currentOrder: {
        shipType: 'lightFighter',
        count: 3,
        costPer: { metal: 3000, crystal: 1000, deuterium: 0 },
        buildTimePer: 10,
        totalCost: { metal: 9000, crystal: 3000, deuterium: 0 },
        totalTime: 30,
      },
      currentProgress: 0,
      startedAt: 1000000,
    };

    const nextTime = getNextCompletionTime(queue);
    expect(nextTime).toBe(1000000 + 10000); // 10 seconds after start
  });

  test('getNextCompletionTime returns null for empty queue', () => {
    const queue = createEmptyQueue();
    expect(getNextCompletionTime(queue)).toBeNull();
  });

  test('getTotalQueueTime calculates remaining time', () => {
    const nowMs = 1000000;
    const queue: ShipyardQueue = {
      orders: [{
        shipType: 'heavyFighter',
        count: 2,
        costPer: { metal: 6000, crystal: 4000, deuterium: 0 },
        buildTimePer: 20,
        totalCost: { metal: 12000, crystal: 8000, deuterium: 0 },
        totalTime: 40,
      }],
      currentOrder: {
        shipType: 'lightFighter',
        count: 3,
        costPer: { metal: 3000, crystal: 1000, deuterium: 0 },
        buildTimePer: 10,
        totalCost: { metal: 9000, crystal: 3000, deuterium: 0 },
        totalTime: 30,
      },
      currentProgress: 1,  // 1 unit done
      startedAt: nowMs - 5000,  // 5 seconds into the second unit
    };

    const remaining = getTotalQueueTime(queue, nowMs);
    // Current order: 2 remaining units. Current unit has 5s remaining, next unit is 10s = 15s
    // Queued order: 40s total
    // Total: 15 + 40 = 55s
    expect(remaining).toBe(55);
  });
});

// ============================================================================
// AVAILABLE SHIPS
// ============================================================================

describe('getAvailableShips', () => {
  test('no ships available with shipyard 0', () => {
    const buildings = makeBuildings({ shipyard: 0 });
    const techs = makeTechLevels();
    const available = getAvailableShips(buildings, techs);
    expect(available.length).toBe(0);
  });

  test('light fighter available with shipyard 1 + combustion drive 1', () => {
    const buildings = makeBuildings({ shipyard: 1 });
    const techs = makeTechLevels({ combustionDrive: 1 });
    const available = getAvailableShips(buildings, techs);
    expect(available).toContain('lightFighter');
  });

  test('high-level shipyard + all techs unlocks most ships', () => {
    const buildings = makeBuildings({ shipyard: 12 });
    const techs = makeTechLevels({
      combustionDrive: 6,
      impulseDrive: 6,
      hyperspaceDrive: 7,
      hyperspaceTech: 6,
      ionTech: 2,
      laserTech: 12,
      plasmaTech: 5,
      armorTech: 2,
      shieldingTech: 2,
      espionageTech: 2,
      gravitonTech: 1,
    });
    const available = getAvailableShips(buildings, techs);
    expect(available.length).toBe(13); // All 13 ship types
  });

  test('getAllShipInfo returns info for all ship types', () => {
    const buildings = makeBuildings({ shipyard: 5 });
    const techs = makeTechLevels({ combustionDrive: 2, impulseDrive: 4, ionTech: 2 });
    const info = getAllShipInfo(buildings, techs);

    expect(info.length).toBe(13);

    // Check that some are buildable and some are not
    const buildable = info.filter(s => s.canBuild);
    const notBuildable = info.filter(s => !s.canBuild);
    expect(buildable.length).toBeGreaterThan(0);
    expect(notBuildable.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// SHIP NAMES
// ============================================================================

describe('Ship Names', () => {
  test('all ship types have display names', () => {
    const shipTypes: (keyof Ships)[] = [
      'lightFighter', 'heavyFighter', 'cruiser', 'battleship',
      'battlecruiser', 'bomber', 'destroyer', 'deathstar',
      'smallCargo', 'largeCargo', 'colonyShip', 'recycler', 'espionageProbe',
    ];

    for (const shipType of shipTypes) {
      expect(SHIP_NAMES[shipType]).toBeDefined();
      expect(SHIP_NAMES[shipType].length).toBeGreaterThan(0);
    }
  });
});
