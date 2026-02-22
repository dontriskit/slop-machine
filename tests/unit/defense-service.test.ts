/**
 * Unit tests for the Defense Service
 * Tests defense prerequisites, costs, build times, resource deduction,
 * queue mechanics, post-battle rebuild, and missile attacks.
 */
import { describe, test, expect, beforeEach } from 'vitest';
import {
  buildDefense,
  cancelDefenseBuild,
  createEmptyDefenseQueue,
  processDefenseQueue,
  getDefenseBuildQueue,
  getNextDefenseCompletionTime,
  rebuildDefensesAfterBattle,
  launchMissileAttack,
  getAllDefenseInfo,
  defenseService,
  DefenseQueue,
  DefenseBuildOrder,
} from '../../worker/src/game/services/defenseService';
import {
  DefenseStructures,
  TechLevels,
  DEFENSE_COSTS,
  DEFENSE_SPECS,
  canBuildDefense,
  getDefenseBuildTime,
  getEmptyDefenses,
  getMissileSiloCapacity,
  getStoredMissileCount,
} from '../../worker/src/game/defenses';
import { Resources } from '../../worker/src/game/types';

// ============================================================================
// HELPERS
// ============================================================================

function makeTechLevels(overrides: Partial<TechLevels> = {}): TechLevels {
  return {
    laserTech: 0,
    energyTech: 0,
    weaponTech: 0,
    shieldingTech: 0,
    ionTech: 0,
    plasmaTech: 0,
    impulseDrive: 0,
    missileSilo: 0,
    ...overrides,
  };
}

function makeResources(metal = 0, crystal = 0, deuterium = 0): Resources {
  return { metal, crystal, deuterium };
}

function makeDefenses(overrides: Partial<DefenseStructures> = {}): DefenseStructures {
  return {
    ...getEmptyDefenses(),
    ...overrides,
  };
}

// ============================================================================
// DEFENSE PREREQUISITES
// ============================================================================

describe('Defense Prerequisites', () => {
  test('rocket launcher has no tech prerequisites', () => {
    const tech = makeTechLevels();
    const defenses = makeDefenses();
    expect(canBuildDefense('rocketLauncher', tech, defenses, 1)).toBe(true);
  });

  test('light laser requires laserTech 3', () => {
    const defenses = makeDefenses();
    expect(canBuildDefense('lightLaser', makeTechLevels({ laserTech: 2 }), defenses, 1)).toBe(false);
    expect(canBuildDefense('lightLaser', makeTechLevels({ laserTech: 3 }), defenses, 1)).toBe(true);
  });

  test('heavy laser requires laserTech 6 + energyTech 3', () => {
    const defenses = makeDefenses();
    expect(canBuildDefense('heavyLaser', makeTechLevels({ laserTech: 6, energyTech: 2 }), defenses, 1)).toBe(false);
    expect(canBuildDefense('heavyLaser', makeTechLevels({ laserTech: 5, energyTech: 3 }), defenses, 1)).toBe(false);
    expect(canBuildDefense('heavyLaser', makeTechLevels({ laserTech: 6, energyTech: 3 }), defenses, 1)).toBe(true);
  });

  test('gauss cannon requires weaponTech 3 + shieldingTech 1 + energyTech 6', () => {
    const defenses = makeDefenses();
    const partial = makeTechLevels({ weaponTech: 3, shieldingTech: 1, energyTech: 5 });
    expect(canBuildDefense('gaussCannon', partial, defenses, 1)).toBe(false);
    const full = makeTechLevels({ weaponTech: 3, shieldingTech: 1, energyTech: 6 });
    expect(canBuildDefense('gaussCannon', full, defenses, 1)).toBe(true);
  });

  test('ion cannon requires ionTech 4', () => {
    const defenses = makeDefenses();
    expect(canBuildDefense('ionCannon', makeTechLevels({ ionTech: 3 }), defenses, 1)).toBe(false);
    expect(canBuildDefense('ionCannon', makeTechLevels({ ionTech: 4 }), defenses, 1)).toBe(true);
  });

  test('plasma turret requires plasmaTech 7', () => {
    const defenses = makeDefenses();
    expect(canBuildDefense('plasmaTurret', makeTechLevels({ plasmaTech: 6 }), defenses, 1)).toBe(false);
    expect(canBuildDefense('plasmaTurret', makeTechLevels({ plasmaTech: 7 }), defenses, 1)).toBe(true);
  });

  test('small shield dome requires shieldingTech 2', () => {
    const defenses = makeDefenses();
    expect(canBuildDefense('smallShieldDome', makeTechLevels({ shieldingTech: 1 }), defenses, 1)).toBe(false);
    expect(canBuildDefense('smallShieldDome', makeTechLevels({ shieldingTech: 2 }), defenses, 1)).toBe(true);
  });

  test('large shield dome requires shieldingTech 6', () => {
    const defenses = makeDefenses();
    expect(canBuildDefense('largeShieldDome', makeTechLevels({ shieldingTech: 5 }), defenses, 1)).toBe(false);
    expect(canBuildDefense('largeShieldDome', makeTechLevels({ shieldingTech: 6 }), defenses, 1)).toBe(true);
  });

  test('ABM requires missileSilo 2', () => {
    const defenses = makeDefenses();
    expect(canBuildDefense('antiBallisticMissile', makeTechLevels({ missileSilo: 1 }), defenses, 1)).toBe(false);
    expect(canBuildDefense('antiBallisticMissile', makeTechLevels({ missileSilo: 2 }), defenses, 1)).toBe(true);
  });

  test('IPM requires missileSilo 4 + impulseDrive 1', () => {
    const defenses = makeDefenses();
    expect(canBuildDefense('interplanetaryMissile', makeTechLevels({ missileSilo: 4 }), defenses, 1)).toBe(false);
    expect(canBuildDefense('interplanetaryMissile', makeTechLevels({ missileSilo: 4, impulseDrive: 1 }), defenses, 1)).toBe(true);
  });

  test('cannot build count 0 or negative', () => {
    const tech = makeTechLevels();
    const defenses = makeDefenses();
    expect(canBuildDefense('rocketLauncher', tech, defenses, 0)).toBe(false);
    expect(canBuildDefense('rocketLauncher', tech, defenses, -1)).toBe(false);
  });

  test('shield dome is unique — cannot build second small shield dome', () => {
    const tech = makeTechLevels({ shieldingTech: 2 });
    const defenses = makeDefenses({ smallShieldDome: 1 });
    expect(canBuildDefense('smallShieldDome', tech, defenses, 1)).toBe(false);
  });

  test('shield dome is unique — cannot build 2 at once', () => {
    const tech = makeTechLevels({ shieldingTech: 2 });
    const defenses = makeDefenses();
    expect(canBuildDefense('smallShieldDome', tech, defenses, 2)).toBe(false);
  });

  test('missile silo capacity respected for ABM', () => {
    const tech = makeTechLevels({ missileSilo: 2 }); // capacity = 20
    const defenses = makeDefenses({ antiBallisticMissile: 19, interplanetaryMissile: 0 });
    expect(canBuildDefense('antiBallisticMissile', tech, defenses, 1)).toBe(true);
    expect(canBuildDefense('antiBallisticMissile', tech, defenses, 2)).toBe(false);
  });
});

// ============================================================================
// DEFENSE COSTS
// ============================================================================

describe('Defense Costs', () => {
  test('rocket launcher costs 2000 metal, 0 crystal, 0 deuterium', () => {
    const cost = DEFENSE_COSTS['rocketLauncher'];
    expect(cost.metal).toBe(2000);
    expect(cost.crystal).toBe(0);
    expect(cost.deuterium).toBe(0);
  });

  test('plasma turret costs 50000 metal, 50000 crystal, 30000 deuterium', () => {
    const cost = DEFENSE_COSTS['plasmaTurret'];
    expect(cost.metal).toBe(50000);
    expect(cost.crystal).toBe(50000);
    expect(cost.deuterium).toBe(30000);
  });

  test('interplanetary missile costs 12500 metal, 2500 crystal, 10000 deuterium', () => {
    const cost = DEFENSE_COSTS['interplanetaryMissile'];
    expect(cost.metal).toBe(12500);
    expect(cost.crystal).toBe(2500);
    expect(cost.deuterium).toBe(10000);
  });
});

// ============================================================================
// BUILD TIME
// ============================================================================

describe('Defense Build Time', () => {
  // gaussCannon costs 20000m+15000c = 35000 total — high enough to avoid minimum-1s
  test('build time scales with count (gaussCannon, shipyard 1)', () => {
    const time1 = getDefenseBuildTime('gaussCannon', 1, 1, 1);   // 7s
    const time10 = getDefenseBuildTime('gaussCannon', 10, 1, 1); // 70s
    expect(time10).toBe(time1 * 10);
  });

  test('build time decreases with higher shipyard level (plasmaTurret)', () => {
    // plasmaTurret: 100000 metal + crystal — solidly above minimum at any reasonable shipyard
    const timeLow = getDefenseBuildTime('plasmaTurret', 1, 1, 1);  // 20s
    const timeHigh = getDefenseBuildTime('plasmaTurret', 1, 5, 1); // 6s
    expect(timeHigh).toBeLessThan(timeLow);
  });

  test('build time decreases with higher universe speed (plasmaTurret)', () => {
    const time1x = getDefenseBuildTime('plasmaTurret', 1, 1, 1);
    const time4x = getDefenseBuildTime('plasmaTurret', 1, 1, 4);
    expect(time4x).toBeLessThan(time1x);
  });

  test('build time minimum is 1 second', () => {
    const time = getDefenseBuildTime('rocketLauncher', 1, 100, 100);
    expect(time).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================================
// BUILD DEFENSE FUNCTION
// ============================================================================

describe('buildDefense', () => {
  test('successfully creates a build order', () => {
    const tech = makeTechLevels();
    const defenses = makeDefenses();
    const resources = makeResources(10000, 0, 0);

    const order = buildDefense('planet1', 'rocketLauncher', 5, tech, defenses, resources, 5);

    expect(order.defenseType).toBe('rocketLauncher');
    expect(order.count).toBe(5);
    expect(order.totalCost.metal).toBe(10000); // 2000 * 5
    expect(order.totalCost.crystal).toBe(0);
    expect(order.id).toBeTruthy();
    expect(order.queuedAt).toBeGreaterThan(0);
  });

  test('deducts resources from planet', () => {
    const tech = makeTechLevels();
    const defenses = makeDefenses();
    const resources = makeResources(20000, 0, 0);

    buildDefense('planet1', 'rocketLauncher', 5, tech, defenses, resources, 5);

    expect(resources.metal).toBe(10000); // 20000 - 10000
  });

  test('throws if count is 0', () => {
    const tech = makeTechLevels();
    const defenses = makeDefenses();
    const resources = makeResources(100000, 100000, 100000);

    expect(() => buildDefense('planet1', 'rocketLauncher', 0, tech, defenses, resources, 5)).toThrow();
  });

  test('throws if prerequisites not met', () => {
    const tech = makeTechLevels({ laserTech: 0 }); // need 3 for light laser
    const defenses = makeDefenses();
    const resources = makeResources(100000, 100000, 100000);

    expect(() => buildDefense('planet1', 'lightLaser', 1, tech, defenses, resources, 5)).toThrow();
  });

  test('throws if insufficient resources', () => {
    const tech = makeTechLevels();
    const defenses = makeDefenses();
    const resources = makeResources(1000, 0, 0); // need 2000

    expect(() => buildDefense('planet1', 'rocketLauncher', 1, tech, defenses, resources, 5)).toThrow(/Insufficient resources/);
  });

  test('build order includes correct build times (gaussCannon at low shipyard)', () => {
    // gaussCannon at shipyard=1: ~7s per unit, so 10 units = 70s total
    const tech = makeTechLevels({ weaponTech: 3, shieldingTech: 1, energyTech: 6 });
    const defenses = makeDefenses();
    const resources = makeResources(1000000, 1000000, 100000);

    const order = buildDefense('planet1', 'gaussCannon', 10, tech, defenses, resources, 1);

    expect(order.buildTimePer).toBeGreaterThan(0);
    // totalTime is computed via getDefenseBuildTime(type, count, ...) which for batch is count * per-unit
    expect(order.totalTime).toBeGreaterThan(order.buildTimePer);
  });
});

// ============================================================================
// QUEUE MANAGEMENT
// ============================================================================

describe('Defense Queue Management', () => {
  test('createEmptyDefenseQueue returns empty queue', () => {
    const queue = createEmptyDefenseQueue();
    expect(queue.orders).toHaveLength(0);
    expect(queue.currentOrder).toBeNull();
    expect(queue.currentProgress).toBe(0);
    expect(queue.startedAt).toBe(0);
  });

  test('processDefenseQueue adds completed defenses to inventory', () => {
    const queue = createEmptyDefenseQueue();
    const defenses = makeDefenses();
    const tech = makeTechLevels();
    const resources = makeResources(100000, 0, 0);

    // Queue 3 rocket launchers with 1 second per unit build time
    const order = buildDefense('planet1', 'rocketLauncher', 3, tech, defenses, resources, 100);
    order.buildTimePer = 1; // 1 second per unit
    order.totalTime = 3;

    // Pre-set queue in "building" state starting 10 seconds ago
    const startTime = Date.now() - 10000;
    queue.currentOrder = order;
    queue.currentProgress = 0;
    queue.startedAt = startTime;

    // Process now — 10 seconds elapsed, all 3 units should be done
    const updatedQueue = processDefenseQueue(queue, defenses, Date.now());

    expect(defenses.rocketLauncher).toBe(3);
    expect(updatedQueue.currentOrder).toBeNull();
  });

  test('processDefenseQueue handles partial completion', () => {
    const queue = createEmptyDefenseQueue();
    const defenses = makeDefenses();
    const tech = makeTechLevels();
    const resources = makeResources(100000, 0, 0);

    const order = buildDefense('planet1', 'rocketLauncher', 10, tech, defenses, resources, 100);
    order.buildTimePer = 10; // 10 seconds per unit

    // Pre-set queue in "building" state starting 35 seconds ago → 3 units done
    const startTime = Date.now() - 35000;
    queue.currentOrder = order;
    queue.currentProgress = 0;
    queue.startedAt = startTime;

    processDefenseQueue(queue, defenses, Date.now());

    expect(defenses.rocketLauncher).toBe(3);
  });

  test('processDefenseQueue advances to next order', () => {
    const queue = createEmptyDefenseQueue();
    const defenses = makeDefenses();
    const tech = makeTechLevels();
    const resources = makeResources(100000, 100000, 100000);

    const order1 = buildDefense('planet1', 'rocketLauncher', 2, tech, defenses, resources, 100);
    order1.buildTimePer = 1;
    order1.totalTime = 2;
    const order2 = buildDefense('planet1', 'rocketLauncher', 3, tech, defenses, resources, 100);
    order2.buildTimePer = 1;
    order2.totalTime = 3;

    // Pre-set queue with order1 active, order2 pending, started 10s ago
    const startTime = Date.now() - 10000;
    queue.currentOrder = order1;
    queue.currentProgress = 0;
    queue.startedAt = startTime;
    queue.orders.push(order2);

    processDefenseQueue(queue, defenses, Date.now()); // 10s elapsed → all 5 done

    expect(defenses.rocketLauncher).toBe(5);
  });

  test('cancelDefenseBuild removes order and refunds resources', () => {
    const queue = createEmptyDefenseQueue();
    const defenses = makeDefenses();
    const tech = makeTechLevels();
    const resources = makeResources(100000, 0, 0);

    const order = buildDefense('planet1', 'rocketLauncher', 5, tech, defenses, resources, 5);
    queue.orders.push(order);

    const resourcesBefore = resources.metal; // already deducted
    const cancelled = cancelDefenseBuild(queue, order.id, resources);

    expect(cancelled).not.toBeNull();
    expect(cancelled!.defenseType).toBe('rocketLauncher');
    expect(resources.metal).toBe(resourcesBefore + 10000); // 2000 * 5 refunded
    expect(queue.orders).toHaveLength(0);
  });

  test('cancelDefenseBuild returns null for unknown id', () => {
    const queue = createEmptyDefenseQueue();
    const resources = makeResources(10000, 0, 0);

    const result = cancelDefenseBuild(queue, 'non-existent-id', resources);
    expect(result).toBeNull();
  });

  test('getDefenseBuildQueue returns queue status', () => {
    const queue = createEmptyDefenseQueue();
    const defenses = makeDefenses();
    const tech = makeTechLevels();
    const resources = makeResources(100000, 0, 0);

    const order = buildDefense('planet1', 'rocketLauncher', 5, tech, defenses, resources, 5);
    order.buildTimePer = 60; // 1 minute each
    queue.orders.push(order);

    const nowMs = Date.now();
    processDefenseQueue(queue, defenses, nowMs); // start queue
    const status = getDefenseBuildQueue(queue, nowMs);

    expect(status.currentOrder).not.toBeNull();
    expect(status.currentOrder!.defenseType).toBe('rocketLauncher');
    expect(status.pendingOrders).toHaveLength(0);
    expect(status.totalQueueTimeSeconds).toBeGreaterThan(0);
  });

  test('getNextDefenseCompletionTime returns null for empty queue', () => {
    const queue = createEmptyDefenseQueue();
    expect(getNextDefenseCompletionTime(queue)).toBeNull();
  });
});

// ============================================================================
// POST-BATTLE REBUILD
// ============================================================================

describe('rebuildDefensesAfterBattle', () => {
  test('returns rebuild result with counts', () => {
    const defenses = makeDefenses();
    const destroyed: Partial<DefenseStructures> = {
      rocketLauncher: 10,
    };

    // Use Math.random deterministically by running many times
    const result = rebuildDefensesAfterBattle(defenses, destroyed, 1.0); // 100% rebuild
    expect(result.destroyedCount).toBe(10);
    expect(result.rebuiltCount).toBe(10);
    expect(result.rebuilt.rocketLauncher).toBe(10);
    expect(defenses.rocketLauncher).toBe(10);
  });

  test('0% rebuild chance restores nothing', () => {
    const defenses = makeDefenses();
    const destroyed: Partial<DefenseStructures> = {
      rocketLauncher: 20,
    };

    const result = rebuildDefensesAfterBattle(defenses, destroyed, 0.0);
    expect(result.rebuiltCount).toBe(0);
    expect(defenses.rocketLauncher).toBe(0);
  });

  test('shield domes always restored if planet survived', () => {
    const defenses = makeDefenses();
    const destroyed: Partial<DefenseStructures> = {
      smallShieldDome: 1,
      largeShieldDome: 1,
    };

    const result = rebuildDefensesAfterBattle(defenses, destroyed, 0.0, true);
    expect(result.rebuilt.smallShieldDome).toBe(1);
    expect(result.rebuilt.largeShieldDome).toBe(1);
    expect(defenses.smallShieldDome).toBe(1);
    expect(defenses.largeShieldDome).toBe(1);
  });

  test('shield domes not restored if planet did not survive', () => {
    const defenses = makeDefenses();
    const destroyed: Partial<DefenseStructures> = {
      smallShieldDome: 1,
    };

    const result = rebuildDefensesAfterBattle(defenses, destroyed, 0.0, false);
    expect(result.rebuilt.smallShieldDome).toBeUndefined();
    expect(defenses.smallShieldDome).toBe(0);
  });

  test('default rebuild chance is 70%', () => {
    // With 1000 units and 70% chance, should be in range [600-800]
    const defenses = makeDefenses();
    const destroyed: Partial<DefenseStructures> = {
      rocketLauncher: 1000,
    };

    const result = rebuildDefensesAfterBattle(defenses, destroyed);
    expect(result.destroyedCount).toBe(1000);
    expect(result.rebuiltCount).toBeGreaterThan(500);
    expect(result.rebuiltCount).toBeLessThan(900);
  });

  test('handles empty destroyed object', () => {
    const defenses = makeDefenses();
    const result = rebuildDefensesAfterBattle(defenses, {});
    expect(result.destroyedCount).toBe(0);
    expect(result.rebuiltCount).toBe(0);
  });
});

// ============================================================================
// MISSILE ATTACKS
// ============================================================================

describe('launchMissileAttack', () => {
  test('ABMs intercept incoming IPMs 1:1', () => {
    const defenses = makeDefenses({
      antiBallisticMissile: 5,
      rocketLauncher: 10,
    });

    const result = launchMissileAttack(defenses, 3, 0);

    expect(result.interceptedMissiles).toBe(3);
    expect(result.survivingMissiles).toBe(0);
    // No damage, no launchers destroyed
    expect(result.remainingDefenses.rocketLauncher).toBe(10);
  });

  test('surviving missiles deal damage', () => {
    const defenses = makeDefenses({
      antiBallisticMissile: 2,
      rocketLauncher: 100,
    });

    const result = launchMissileAttack(defenses, 10, 0); // 8 survive

    expect(result.survivingMissiles).toBe(8);
    expect(result.totalDamageDealt).toBe(8 * 12000);
    // Some rocket launchers should be destroyed
    expect(result.remainingDefenses.rocketLauncher).toBeLessThan(100);
  });

  test('weapon tech increases damage per missile', () => {
    const defenses1 = makeDefenses({ rocketLauncher: 1000 });
    const defenses10 = makeDefenses({ rocketLauncher: 1000 });

    const result0 = launchMissileAttack(defenses1, 10, 0);
    const result10 = launchMissileAttack(defenses10, 10, 10);

    // Higher weapon tech = more damage = more defenses destroyed
    const destroyed0 = 1000 - result0.remainingDefenses.rocketLauncher;
    const destroyed10 = 1000 - result10.remainingDefenses.rocketLauncher;
    expect(destroyed10).toBeGreaterThanOrEqual(destroyed0);
  });

  test('targeted defense takes damage first', () => {
    const defenses = makeDefenses({
      gaussCannon: 100,
      rocketLauncher: 100,
    });

    const result = launchMissileAttack(defenses, 5, 0, 'gaussCannon');

    // Gauss cannon should take damage before rocket launchers
    expect(result.destroyedDefenses.gaussCannon).toBeDefined();
    // If gauss cannons took damage, rocket launchers should be intact or have less damage
    const rocketDamage = result.destroyedDefenses.rocketLauncher ?? 0;
    const gaussDamage = result.destroyedDefenses.gaussCannon ?? 0;
    // At least some gauss cannons destroyed (targeted first)
    expect(gaussDamage + rocketDamage).toBeGreaterThan(0);
  });

  test('throws if launching 0 missiles', () => {
    const defenses = makeDefenses();
    expect(() => launchMissileAttack(defenses, 0, 0)).toThrow();
  });

  test('returns destroyed defenses diff', () => {
    const defenses = makeDefenses({
      rocketLauncher: 50,
    });

    const result = launchMissileAttack(defenses, 20, 0);

    for (const [key, count] of Object.entries(result.destroyedDefenses)) {
      expect(count).toBeGreaterThan(0);
    }
  });
});

// ============================================================================
// MISSILE SILO HELPERS
// ============================================================================

describe('Missile Silo Helpers', () => {
  test('getMissileSiloCapacity returns 10 per level', () => {
    expect(getMissileSiloCapacity(1)).toBe(10);
    expect(getMissileSiloCapacity(5)).toBe(50);
    expect(getMissileSiloCapacity(10)).toBe(100);
  });

  test('getStoredMissileCount sums ABM and IPM', () => {
    const defenses = makeDefenses({ antiBallisticMissile: 7, interplanetaryMissile: 3 });
    expect(getStoredMissileCount(defenses)).toBe(10);
  });
});

// ============================================================================
// ALL DEFENSE INFO
// ============================================================================

describe('getAllDefenseInfo', () => {
  test('returns info for all defense types', () => {
    const tech = makeTechLevels();
    const defenses = makeDefenses();
    const info = getAllDefenseInfo(tech, defenses, 5);

    expect(info.length).toBe(10); // 10 defense types
    expect(info.every((i) => i.name && i.defenseType)).toBe(true);
  });

  test('marks unavailable defenses correctly', () => {
    const tech = makeTechLevels(); // no techs
    const defenses = makeDefenses();
    const info = getAllDefenseInfo(tech, defenses, 5);

    const rocketLauncher = info.find((i) => i.defenseType === 'rocketLauncher');
    const plasmaTurret = info.find((i) => i.defenseType === 'plasmaTurret');

    expect(rocketLauncher?.canBuild).toBe(true);
    expect(plasmaTurret?.canBuild).toBe(false); // needs plasmaTech 7
  });

  test('includes cost and build time', () => {
    const tech = makeTechLevels();
    const defenses = makeDefenses();
    const info = getAllDefenseInfo(tech, defenses, 5);

    for (const item of info) {
      expect(item.cost).toBeDefined();
      expect(item.buildTime).toBeGreaterThan(0);
    }
  });
});

// ============================================================================
// DEFENSE SERVICE CLASS
// ============================================================================

describe('DefenseService (class)', () => {
  test('singleton instance exists', () => {
    expect(defenseService).toBeDefined();
  });

  test('createEmptyQueue returns empty queue', () => {
    const queue = defenseService.createEmptyQueue();
    expect(queue.orders).toHaveLength(0);
    expect(queue.currentOrder).toBeNull();
  });

  test('buildDefense validates and creates order', () => {
    const tech = makeTechLevels();
    const defenses = makeDefenses();
    const resources = makeResources(100000, 0, 0);

    const order = defenseService.buildDefense(
      'planet1', 'rocketLauncher', 5,
      tech, defenses, resources, 5
    );

    expect(order.defenseType).toBe('rocketLauncher');
    expect(order.count).toBe(5);
  });

  test('getDefenses returns a copy of defenses', () => {
    const defenses = makeDefenses({ rocketLauncher: 5 });
    const snapshot = defenseService.getDefenses(defenses);

    expect(snapshot.rocketLauncher).toBe(5);
    // Mutating snapshot should not affect original
    snapshot.rocketLauncher = 99;
    expect(defenses.rocketLauncher).toBe(5);
  });

  test('rebuildDefensesAfterBattle works via service', () => {
    const defenses = makeDefenses();
    const destroyed = { rocketLauncher: 10 };
    const result = defenseService.rebuildDefensesAfterBattle(defenses, destroyed, 1.0);
    expect(result.rebuiltCount).toBe(10);
  });

  test('launchMissile works via service', () => {
    const defenses = makeDefenses({ rocketLauncher: 50 });
    const result = defenseService.launchMissile(defenses, 5, 0);
    expect(result.survivingMissiles).toBe(5);
  });

  test('cancelDefenseBuild via service', () => {
    const queue = defenseService.createEmptyQueue();
    const defenses = makeDefenses();
    const tech = makeTechLevels();
    const resources = makeResources(100000, 0, 0);

    const order = defenseService.buildDefense('p1', 'rocketLauncher', 3, tech, defenses, resources, 5);
    queue.orders.push(order);

    const cancelled = defenseService.cancelDefenseBuild(queue, order.id, resources);
    expect(cancelled).not.toBeNull();
    expect(queue.orders).toHaveLength(0);
  });
});
