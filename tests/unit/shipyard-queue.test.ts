/**
 * Unit tests for Shipyard Queue and Prerequisite Tests
 * Tests build queue ordering, prerequisite checks, resource deduction, and queue cancellation.
 */
import { describe, test, expect } from 'vitest';
import {
  canBuildShip,
  buildShips,
  processShipyardQueue,
  cancelShipOrder,
  createEmptyQueue,
  getNextCompletionTime,
  getTotalQueueTime,
  SHIP_COSTS,
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
// TEST 1: Build ship without prerequisites (should fail)
// ============================================================================

describe('Test 1: Build ship without prerequisites', () => {
  test('cannot build light fighter without shipyard', () => {
    const buildings = makeBuildings({ shipyard: 0 });
    const techs = makeTechLevels({ combustionDrive: 5 });
    const resources = makeResources(100000, 100000, 100000);

    expect(() => buildShips('lightFighter', 1, buildings, techs, resources, 1)).toThrow(
      /Prerequisites not met/,
    );
  });

  test('cannot build light fighter without combustion drive', () => {
    const buildings = makeBuildings({ shipyard: 1 });
    const techs = makeTechLevels({ combustionDrive: 0 });
    const resources = makeResources(100000, 100000, 100000);

    expect(() => buildShips('lightFighter', 1, buildings, techs, resources, 1)).toThrow(
      /Prerequisites not met/,
    );
  });

  test('cannot build cruiser without impulse drive 4', () => {
    const buildings = makeBuildings({ shipyard: 5 });
    const techs = makeTechLevels({ impulseDrive: 3, ionTech: 2 });
    const resources = makeResources(1000000, 1000000, 1000000);

    expect(() => buildShips('cruiser', 1, buildings, techs, resources, 1)).toThrow(
      /Prerequisites not met/,
    );
  });

  test('cannot build deathstar without graviton tech', () => {
    const buildings = makeBuildings({ shipyard: 12 });
    const techs = makeTechLevels({
      hyperspaceTech: 6,
      hyperspaceDrive: 7,
      gravitonTech: 0,
    });
    const resources = makeResources(10000000, 10000000, 10000000);

    expect(() => buildShips('deathstar', 1, buildings, techs, resources, 1)).toThrow(
      /Prerequisites not met/,
    );
  });

  test('cannot build espionage probe without espionage tech 2', () => {
    const buildings = makeBuildings({ shipyard: 3 });
    const techs = makeTechLevels({ combustionDrive: 3, espionageTech: 1 });
    const resources = makeResources(100000, 100000, 100000);

    expect(() => buildShips('espionageProbe', 1, buildings, techs, resources, 1)).toThrow(
      /Prerequisites not met/,
    );
  });

  test('resources not deducted when prerequisites fail', () => {
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
});

// ============================================================================
// TEST 2: Build ship without resources (should fail)
// ============================================================================

describe('Test 2: Build ship without resources', () => {
  test('cannot build light fighter with insufficient metal', () => {
    const buildings = makeBuildings({ shipyard: 1 });
    const techs = makeTechLevels({ combustionDrive: 1 });
    const resources = makeResources(2000, 5000, 0); // Need 3000 metal, have 2000

    expect(() => buildShips('lightFighter', 1, buildings, techs, resources, 1)).toThrow(
      /Insufficient resources/,
    );
  });

  test('cannot build light fighter with insufficient crystal', () => {
    const buildings = makeBuildings({ shipyard: 1 });
    const techs = makeTechLevels({ combustionDrive: 1 });
    const resources = makeResources(5000, 500, 0); // Need 1000 crystal, have 500

    expect(() => buildShips('lightFighter', 1, buildings, techs, resources, 1)).toThrow(
      /Insufficient resources/,
    );
  });

  test('cannot build cruiser with insufficient deuterium', () => {
    const buildings = makeBuildings({ shipyard: 5 });
    const techs = makeTechLevels({ impulseDrive: 4, ionTech: 2 });
    // Cruiser costs: 20000 metal, 7000 crystal, 2000 deuterium
    const resources = makeResources(50000, 50000, 1000); // Insufficient deuterium

    expect(() => buildShips('cruiser', 1, buildings, techs, resources, 1)).toThrow(
      /Insufficient resources/,
    );
  });

  test('cannot build multiple ships without enough resources', () => {
    const buildings = makeBuildings({ shipyard: 1 });
    const techs = makeTechLevels({ combustionDrive: 1 });
    // Light fighter costs: 3000 metal, 1000 crystal per unit
    // For 5 units: 15000 metal, 5000 crystal
    const resources = makeResources(12000, 10000, 0); // Insufficient metal

    expect(() => buildShips('lightFighter', 5, buildings, techs, resources, 1)).toThrow(
      /Insufficient resources/,
    );
  });

  test('resources not deducted when build fails due to insufficient resources', () => {
    const buildings = makeBuildings({ shipyard: 1 });
    const techs = makeTechLevels({ combustionDrive: 1 });
    const resources = makeResources(2000, 5000, 0);
    const originalMetal = resources.metal;
    const originalCrystal = resources.crystal;

    try {
      buildShips('lightFighter', 1, buildings, techs, resources, 1);
    } catch {
      // Expected
    }

    expect(resources.metal).toBe(originalMetal);
    expect(resources.crystal).toBe(originalCrystal);
  });
});

// ============================================================================
// TEST 3: Queue multiple ships
// ============================================================================

describe('Test 3: Queue multiple ships', () => {
  test('can queue multiple orders sequentially', () => {
    const buildings = makeBuildings({ shipyard: 5 });
    const techs = makeTechLevels({ impulseDrive: 4, ionTech: 2 });
    const resources = makeResources(500000, 500000, 500000);
    const queue = createEmptyQueue();

    // Build first order: 5 cruisers
    const order1 = buildShips('cruiser', 5, buildings, techs, resources, 1);
    queue.orders.push(order1);

    // Build second order: 3 cruisers
    const order2 = buildShips('cruiser', 3, buildings, techs, resources, 1);
    queue.orders.push(order2);

    expect(queue.orders.length).toBe(2);
    expect(queue.orders[0].count).toBe(5);
    expect(queue.orders[1].count).toBe(3);
  });

  test('queue preserves order of ships', () => {
    const buildings = makeBuildings({ shipyard: 5 });
    const techs = makeTechLevels({ combustionDrive: 2, impulseDrive: 4, ionTech: 2 });
    const resources = makeResources(500000, 500000, 500000);
    const queue = createEmptyQueue();

    // Queue: light fighter, cruiser, small cargo
    const order1 = buildShips('lightFighter', 2, buildings, techs, resources, 1);
    const order2 = buildShips('cruiser', 1, buildings, techs, resources, 1);
    const order3 = buildShips('smallCargo', 3, buildings, techs, resources, 1);

    queue.orders.push(order1);
    queue.orders.push(order2);
    queue.orders.push(order3);

    expect(queue.orders[0].shipType).toBe('lightFighter');
    expect(queue.orders[1].shipType).toBe('cruiser');
    expect(queue.orders[2].shipType).toBe('smallCargo');
  });

  test('queue processes in FIFO order', () => {
    const ships = emptyShips();
    const queue: ShipyardQueue = {
      orders: [
        {
          shipType: 'heavyFighter',
          count: 1,
          costPer: { metal: 6000, crystal: 4000, deuterium: 0 },
          buildTimePer: 20,
          totalCost: { metal: 6000, crystal: 4000, deuterium: 0 },
          totalTime: 20,
        },
      ],
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

    // After 15 seconds: light fighter done, heavy fighter starts
    processShipyardQueue(queue, ships, 1000000 + 15000);

    expect(ships.lightFighter).toBe(1);
    expect(queue.currentOrder?.shipType).toBe('heavyFighter');
    expect(queue.orders.length).toBe(0);
  });

  test('total queue time includes all orders', () => {
    const nowMs = 1000000;
    const queue: ShipyardQueue = {
      orders: [
        {
          shipType: 'heavyFighter',
          count: 2,
          costPer: { metal: 6000, crystal: 4000, deuterium: 0 },
          buildTimePer: 20,
          totalCost: { metal: 12000, crystal: 8000, deuterium: 0 },
          totalTime: 40,
        },
        {
          shipType: 'cruiser',
          count: 1,
          costPer: { metal: 20000, crystal: 7000, deuterium: 2000 },
          buildTimePer: 30,
          totalCost: { metal: 20000, crystal: 7000, deuterium: 2000 },
          totalTime: 30,
        },
      ],
      currentOrder: {
        shipType: 'lightFighter',
        count: 1,
        costPer: { metal: 3000, crystal: 1000, deuterium: 0 },
        buildTimePer: 10,
        totalCost: { metal: 3000, crystal: 1000, deuterium: 0 },
        totalTime: 10,
      },
      currentProgress: 0,
      startedAt: nowMs,
    };

    const totalTime = getTotalQueueTime(queue, nowMs);
    // Current: 10s, Queued: 40 + 30 = 70s, Total: 80s
    expect(totalTime).toBe(80);
  });
});

// ============================================================================
// TEST 4: Cancel queued ship (resource refund)
// ============================================================================

describe('Test 4: Cancel queued ship with resource refund', () => {
  test('cancel returns 100% of resources', () => {
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

    cancelShipOrder(queue, 0, resources);

    expect(resources.metal).toBe(100000);
    expect(resources.crystal).toBe(35000);
    expect(resources.deuterium).toBe(10000);
  });

  test('cancel removes order from queue', () => {
    const resources = makeResources(0, 0, 0);
    const queue: ShipyardQueue = {
      orders: [
        {
          shipType: 'lightFighter',
          count: 5,
          costPer: { metal: 3000, crystal: 1000, deuterium: 0 },
          buildTimePer: 10,
          totalCost: { metal: 15000, crystal: 5000, deuterium: 0 },
          totalTime: 50,
        },
        {
          shipType: 'cruiser',
          count: 2,
          costPer: { metal: 20000, crystal: 7000, deuterium: 2000 },
          buildTimePer: 20,
          totalCost: { metal: 40000, crystal: 14000, deuterium: 4000 },
          totalTime: 40,
        },
      ],
      currentOrder: null,
      currentProgress: 0,
      startedAt: 0,
    };

    cancelShipOrder(queue, 0, resources);

    expect(queue.orders.length).toBe(1);
    expect(queue.orders[0].shipType).toBe('cruiser');
  });

  test('can cancel second queued order', () => {
    const resources = makeResources(0, 0, 0);
    const queue: ShipyardQueue = {
      orders: [
        {
          shipType: 'lightFighter',
          count: 1,
          costPer: { metal: 3000, crystal: 1000, deuterium: 0 },
          buildTimePer: 10,
          totalCost: { metal: 3000, crystal: 1000, deuterium: 0 },
          totalTime: 10,
        },
        {
          shipType: 'cruiser',
          count: 1,
          costPer: { metal: 20000, crystal: 7000, deuterium: 2000 },
          buildTimePer: 20,
          totalCost: { metal: 20000, crystal: 7000, deuterium: 2000 },
          totalTime: 20,
        },
      ],
      currentOrder: null,
      currentProgress: 0,
      startedAt: 0,
    };

    cancelShipOrder(queue, 1, resources);

    expect(resources.metal).toBe(20000);
    expect(resources.crystal).toBe(7000);
    expect(queue.orders.length).toBe(1);
    expect(queue.orders[0].shipType).toBe('lightFighter');
  });

  test('cannot cancel current order (returns null)', () => {
    const resources = makeResources(0, 0, 0);
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
      currentProgress: 1,
      startedAt: 1000000,
    };

    const result = cancelShipOrder(queue, 0, resources);
    expect(result).toBeNull();
    expect(resources.metal).toBe(0); // No refund
  });

  test('cancel invalid index returns null', () => {
    const resources = makeResources(0, 0, 0);
    const queue = createEmptyQueue();

    expect(cancelShipOrder(queue, 0, resources)).toBeNull();
    expect(cancelShipOrder(queue, -1, resources)).toBeNull();
    expect(cancelShipOrder(queue, 100, resources)).toBeNull();
  });
});

// ============================================================================
// TEST 5: Build time calculation accuracy
// ============================================================================

describe('Test 5: Build time calculation accuracy', () => {
  test('light fighter build time is correct', () => {
    const buildings = makeBuildings({ shipyard: 1 });
    const techs = makeTechLevels({ combustionDrive: 1 });
    const resources = makeResources(100000, 100000, 0);

    const order = buildShips('lightFighter', 1, buildings, techs, resources, 1);

    // Formula: (3000 + 1000) / (2500 * (1 + 1) * 1 * 1) = 4000 / 5000 = 0.8 => floor = 1
    expect(order.buildTimePer).toBe(1);
    expect(order.totalTime).toBe(1);
  });

  test('cruiser build time scales with count', () => {
    const buildings = makeBuildings({ shipyard: 5 });
    const techs = makeTechLevels({ impulseDrive: 4, ionTech: 2 });
    const resources = makeResources(1000000, 1000000, 1000000);

    const order = buildShips('cruiser', 5, buildings, techs, resources, 1);

    expect(order.totalTime).toBe(order.buildTimePer * 5);
  });

  test('higher shipyard level results in shorter build time', () => {
    const buildings5 = makeBuildings({ shipyard: 5 });
    const buildings10 = makeBuildings({ shipyard: 10 });
    const techs = makeTechLevels({ impulseDrive: 4, ionTech: 2 });
    const resources5 = makeResources(1000000, 1000000, 1000000);
    const resources10 = makeResources(1000000, 1000000, 1000000);

    const order5 = buildShips('cruiser', 1, buildings5, techs, resources5, 1);
    const order10 = buildShips('cruiser', 1, buildings10, techs, resources10, 1);

    // Higher shipyard = shorter build time
    expect(order10.buildTimePer).toBeLessThanOrEqual(order5.buildTimePer);
  });

  test('deathstar build time with correct prerequisites', () => {
    const buildings = makeBuildings({ shipyard: 12 });
    const techs = makeTechLevels({ hyperspaceTech: 6, hyperspaceDrive: 7, gravitonTech: 1 });
    const resources = makeResources(10000000, 10000000, 10000000);

    const order = buildShips('deathstar', 1, buildings, techs, resources, 1);

    // Deathstar: (5000000 + 4000000) / (2500 * 13 * 1 * 1) = 9000000 / 32500 = 276.92 = 276
    expect(order.buildTimePer).toBeGreaterThan(200);
  });

  test('next completion time is accurate', () => {
    const startTime = 1000000;
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
      startedAt: startTime,
    };

    const nextTime = getNextCompletionTime(queue);
    expect(nextTime).toBe(startTime + 10 * 1000); // 10 seconds in milliseconds
  });
});

// ============================================================================
// TEST 6: All 13 ship types have correct costs
// ============================================================================

describe('Test 6: All 13 ship types have correct costs', () => {
  test('light fighter costs correct', () => {
    const cost = SHIP_COSTS['lightFighter'];
    expect(cost.metal).toBe(3000);
    expect(cost.crystal).toBe(1000);
    expect(cost.deuterium).toBe(0);
  });

  test('heavy fighter costs correct', () => {
    const cost = SHIP_COSTS['heavyFighter'];
    expect(cost.metal).toBe(6000);
    expect(cost.crystal).toBe(4000);
    expect(cost.deuterium).toBe(0);
  });

  test('cruiser costs correct', () => {
    const cost = SHIP_COSTS['cruiser'];
    expect(cost.metal).toBe(20000);
    expect(cost.crystal).toBe(7000);
    expect(cost.deuterium).toBe(2000);
  });

  test('battleship costs correct', () => {
    const cost = SHIP_COSTS['battleship'];
    expect(cost.metal).toBe(45000);
    expect(cost.crystal).toBe(15000);
    expect(cost.deuterium).toBe(0);
  });

  test('battlecruiser costs correct', () => {
    const cost = SHIP_COSTS['battlecruiser'];
    expect(cost.metal).toBe(30000);
    expect(cost.crystal).toBe(40000);
    expect(cost.deuterium).toBe(15000);
  });

  test('bomber costs correct', () => {
    const cost = SHIP_COSTS['bomber'];
    expect(cost.metal).toBe(50000);
    expect(cost.crystal).toBe(25000);
    expect(cost.deuterium).toBe(15000);
  });

  test('destroyer costs correct', () => {
    const cost = SHIP_COSTS['destroyer'];
    expect(cost.metal).toBe(60000);
    expect(cost.crystal).toBe(50000);
    expect(cost.deuterium).toBe(15000);
  });

  test('deathstar costs correct', () => {
    const cost = SHIP_COSTS['deathstar'];
    expect(cost.metal).toBe(5000000);
    expect(cost.crystal).toBe(4000000);
    expect(cost.deuterium).toBe(1000000);
  });

  test('small cargo costs correct', () => {
    const cost = SHIP_COSTS['smallCargo'];
    expect(cost.metal).toBe(2000);
    expect(cost.crystal).toBe(2000);
    expect(cost.deuterium).toBe(0);
  });

  test('large cargo costs correct', () => {
    const cost = SHIP_COSTS['largeCargo'];
    expect(cost.metal).toBe(6000);
    expect(cost.crystal).toBe(6000);
    expect(cost.deuterium).toBe(0);
  });

  test('colony ship costs correct', () => {
    const cost = SHIP_COSTS['colonyShip'];
    expect(cost.metal).toBe(10000);
    expect(cost.crystal).toBe(20000);
    expect(cost.deuterium).toBe(10000);
  });

  test('recycler costs correct', () => {
    const cost = SHIP_COSTS['recycler'];
    expect(cost.metal).toBe(10000);
    expect(cost.crystal).toBe(6000);
    expect(cost.deuterium).toBe(2000);
  });

  test('espionage probe costs correct', () => {
    const cost = SHIP_COSTS['espionageProbe'];
    expect(cost.metal).toBe(0);
    expect(cost.crystal).toBe(1000);
    expect(cost.deuterium).toBe(0);
  });

  test('all 13 ship types defined in SHIP_COSTS', () => {
    const expectedShips: (keyof Ships)[] = [
      'lightFighter', 'heavyFighter', 'cruiser', 'battleship',
      'battlecruiser', 'bomber', 'destroyer', 'deathstar',
      'smallCargo', 'largeCargo', 'colonyShip', 'recycler', 'espionageProbe',
    ];

    for (const shipType of expectedShips) {
      expect(SHIP_COSTS[shipType]).toBeDefined();
      expect(SHIP_NAMES[shipType]).toBeDefined();
    }
  });
});

// ============================================================================
// TEST 7: Shipyard level requirement checks
// ============================================================================

describe('Test 7: Shipyard level requirement checks', () => {
  test('light fighter requires shipyard 1', () => {
    const buildings0 = makeBuildings({ shipyard: 0 });
    const buildings1 = makeBuildings({ shipyard: 1 });
    const techs = makeTechLevels({ combustionDrive: 1 });

    expect(canBuildShip('lightFighter', buildings0, techs)).toBe(false);
    expect(canBuildShip('lightFighter', buildings1, techs)).toBe(true);
  });

  test('heavy fighter requires shipyard 3', () => {
    const buildings2 = makeBuildings({ shipyard: 2 });
    const buildings3 = makeBuildings({ shipyard: 3 });
    const techs = makeTechLevels({ armorTech: 2, impulseDrive: 2 });

    expect(canBuildShip('heavyFighter', buildings2, techs)).toBe(false);
    expect(canBuildShip('heavyFighter', buildings3, techs)).toBe(true);
  });

  test('cruiser requires shipyard 5', () => {
    const buildings4 = makeBuildings({ shipyard: 4 });
    const buildings5 = makeBuildings({ shipyard: 5 });
    const techs = makeTechLevels({ impulseDrive: 4, ionTech: 2 });

    expect(canBuildShip('cruiser', buildings4, techs)).toBe(false);
    expect(canBuildShip('cruiser', buildings5, techs)).toBe(true);
  });

  test('battleship requires shipyard 7', () => {
    const buildings6 = makeBuildings({ shipyard: 6 });
    const buildings7 = makeBuildings({ shipyard: 7 });
    const techs = makeTechLevels({ hyperspaceDrive: 4 });

    expect(canBuildShip('battleship', buildings6, techs)).toBe(false);
    expect(canBuildShip('battleship', buildings7, techs)).toBe(true);
  });

  test('destroyer requires shipyard 9', () => {
    const buildings8 = makeBuildings({ shipyard: 8 });
    const buildings9 = makeBuildings({ shipyard: 9 });
    const techs = makeTechLevels({ hyperspaceTech: 5, hyperspaceDrive: 6 });

    expect(canBuildShip('destroyer', buildings8, techs)).toBe(false);
    expect(canBuildShip('destroyer', buildings9, techs)).toBe(true);
  });

  test('deathstar requires shipyard 12', () => {
    const buildings11 = makeBuildings({ shipyard: 11 });
    const buildings12 = makeBuildings({ shipyard: 12 });
    const techs = makeTechLevels({ hyperspaceTech: 6, hyperspaceDrive: 7, gravitonTech: 1 });

    expect(canBuildShip('deathstar', buildings11, techs)).toBe(false);
    expect(canBuildShip('deathstar', buildings12, techs)).toBe(true);
  });

  test('higher shipyard level allows building', () => {
    const buildings = makeBuildings({ shipyard: 20 });
    const techs = makeTechLevels({ combustionDrive: 1 });

    expect(canBuildShip('lightFighter', buildings, techs)).toBe(true);
  });
});

// ============================================================================
// BONUS: Additional edge case test (8 tests total)
// ============================================================================

describe('Test 8: Resource deduction precision', () => {
  test('deducts exact amount for single ship', () => {
    const buildings = makeBuildings({ shipyard: 1 });
    const techs = makeTechLevels({ combustionDrive: 1 });
    const resources = makeResources(10000, 5000, 0);

    buildShips('lightFighter', 1, buildings, techs, resources, 1);

    expect(resources.metal).toBe(7000); // 10000 - 3000
    expect(resources.crystal).toBe(4000); // 5000 - 1000
  });

  test('deducts exact amount for multiple ships', () => {
    const buildings = makeBuildings({ shipyard: 5 });
    const techs = makeTechLevels({ impulseDrive: 4, ionTech: 2 });
    const resources = makeResources(500000, 500000, 500000);

    buildShips('cruiser', 10, buildings, techs, resources, 1);

    expect(resources.metal).toBe(300000); // 500000 - (20000 * 10)
    expect(resources.crystal).toBe(430000); // 500000 - (7000 * 10)
    expect(resources.deuterium).toBe(480000); // 500000 - (2000 * 10)
  });

  test('cannot build if exactly one resource is short', () => {
    const buildings = makeBuildings({ shipyard: 1 });
    const techs = makeTechLevels({ combustionDrive: 1 });
    const resources = makeResources(2999, 5000, 0); // Missing 1 metal

    expect(() => buildShips('lightFighter', 1, buildings, techs, resources, 1)).toThrow(
      /Insufficient resources/,
    );
  });

  test('multiple cancellations accumulate refunds', () => {
    const resources = makeResources(0, 0, 0);
    const queue: ShipyardQueue = {
      orders: [
        {
          shipType: 'lightFighter',
          count: 1,
          costPer: { metal: 3000, crystal: 1000, deuterium: 0 },
          buildTimePer: 10,
          totalCost: { metal: 3000, crystal: 1000, deuterium: 0 },
          totalTime: 10,
        },
        {
          shipType: 'heavyFighter',
          count: 1,
          costPer: { metal: 6000, crystal: 4000, deuterium: 0 },
          buildTimePer: 20,
          totalCost: { metal: 6000, crystal: 4000, deuterium: 0 },
          totalTime: 20,
        },
      ],
      currentOrder: null,
      currentProgress: 0,
      startedAt: 0,
    };

    cancelShipOrder(queue, 0, resources);
    cancelShipOrder(queue, 0, resources);

    expect(resources.metal).toBe(9000); // 3000 + 6000
    expect(resources.crystal).toBe(5000); // 1000 + 4000
  });
});
