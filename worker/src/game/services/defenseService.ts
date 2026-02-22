/**
 * Defense Service — Defense Build Queue & Battle Integration
 *
 * Handles all defense construction and management logic:
 *  - Defense build queue (similar to shipyard queue)
 *  - Prerequisites validation (tech + building requirements)
 *  - Build time calculations
 *  - Resource validation and deduction
 *  - Post-battle rebuild (70% chance per unit)
 *  - Interplanetary missile attacks
 *
 * Defense Types:
 *  Rocket Launcher, Light Laser, Heavy Laser, Gauss Cannon, Ion Cannon,
 *  Plasma Turret, Small Shield Dome, Large Shield Dome,
 *  Anti-Ballistic Missile, Interplanetary Missile
 *
 * Reference: OGameX + UniEngine canonical formulas.
 */

import { Resources } from '../types';
import {
  DefenseStructures,
  TechLevels,
  DEFENSE_COSTS,
  DEFENSE_SPECS,
  DEFENSE_REQUIREMENTS,
  canBuildDefense,
  getDefenseBuildTime,
  repairDefenses,
  calculateMissileAttack,
  getEmptyDefenses,
  getMissileSiloCapacity,
  getStoredMissileCount,
} from '../defenses';

// Re-export commonly needed things from defenses.ts
export {
  DefenseStructures,
  TechLevels,
  DEFENSE_COSTS,
  DEFENSE_SPECS,
  DEFENSE_REQUIREMENTS,
  canBuildDefense,
  getDefenseBuildTime,
  repairDefenses,
  calculateMissileAttack,
  getEmptyDefenses,
  getMissileSiloCapacity,
  getStoredMissileCount,
};

// ============================================================================
// TYPES
// ============================================================================

/** A single build order in the defense queue */
export interface DefenseBuildOrder {
  id: string;
  defenseType: keyof DefenseStructures;
  count: number;
  costPer: Resources;
  buildTimePer: number;   // seconds per unit
  totalCost: Resources;
  totalTime: number;      // total seconds for entire order
  queuedAt: number;       // unix ms when order was queued
}

/** Full state of the defense build queue */
export interface DefenseQueue {
  orders: DefenseBuildOrder[];
  currentOrder: DefenseBuildOrder | null;
  currentProgress: number;   // units completed in current order
  startedAt: number;         // unix ms when current order started building
}

/** Result of a rebuild operation after battle */
export interface RebuildResult {
  rebuilt: Partial<DefenseStructures>;
  destroyedCount: number;
  rebuiltCount: number;
}

/** Result of a missile attack */
export interface MissileAttackResult {
  interceptedMissiles: number;
  survivingMissiles: number;
  remainingDefenses: DefenseStructures;
  destroyedDefenses: Partial<DefenseStructures>;
  totalDamageDealt: number;
}

/** Defense info returned by getAvailableDefenses */
export interface DefenseInfo {
  defenseType: keyof DefenseStructures;
  name: string;
  cost: Resources;
  buildTime: number;      // seconds per unit at current levels
  canBuild: boolean;
  blockedReason?: string;
}

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Get the per-unit resource cost for a defense type.
 */
export function getDefenseCostPerUnit(defenseType: keyof DefenseStructures): Resources {
  return { ...DEFENSE_COSTS[defenseType] };
}

/**
 * Get detailed info for all defense types, including whether they can be built.
 *
 * @param techLevels       - Current technology / building levels
 * @param currentDefenses  - Existing defense counts
 * @param shipyardLevel    - Planet shipyard level (for build time calc)
 * @param universeSpeed    - Universe speed multiplier
 * @returns Array of DefenseInfo for all defense types
 */
export function getAllDefenseInfo(
  techLevels: TechLevels,
  currentDefenses: DefenseStructures,
  shipyardLevel: number,
  universeSpeed: number = 1,
): DefenseInfo[] {
  return (Object.keys(DEFENSE_COSTS) as (keyof DefenseStructures)[]).map((defenseType) => {
    const canBuild = canBuildDefense(defenseType, techLevels, currentDefenses, 1);
    return {
      defenseType,
      name: DEFENSE_SPECS[defenseType].name,
      cost: getDefenseCostPerUnit(defenseType),
      buildTime: getDefenseBuildTime(defenseType, 1, shipyardLevel, universeSpeed),
      canBuild,
    };
  });
}

/**
 * Generate a unique queue item ID.
 */
function generateQueueId(planetId: string, defenseType: string): string {
  return `${planetId}-${defenseType}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ============================================================================
// BUILD DEFENSE
// ============================================================================

/**
 * Queue a defense build order after validating resources and prerequisites.
 *
 * Validates:
 *  1. Defense type prerequisites are met (techs + silo capacity)
 *  2. Planet has sufficient resources for the full order
 *  3. Count is positive
 *
 * On success, deducts resources from planetResources (mutated in place) and
 * returns the DefenseBuildOrder to add to the queue.
 *
 * @param planetId        - Planet identifier (for queue ID generation)
 * @param defenseType     - Defense type to build
 * @param count           - Number of units to produce
 * @param techLevels      - Current technology / building levels
 * @param currentDefenses - Existing defense counts (used for prerequisites)
 * @param planetResources - Planet's current resources (mutated: cost deducted)
 * @param shipyardLevel   - Planet shipyard level
 * @param universeSpeed   - Universe speed multiplier
 * @returns DefenseBuildOrder on success
 * @throws Error if validation fails
 */
export function buildDefense(
  planetId: string,
  defenseType: keyof DefenseStructures,
  count: number,
  techLevels: TechLevels,
  currentDefenses: DefenseStructures,
  planetResources: Resources,
  shipyardLevel: number,
  universeSpeed: number = 1,
): DefenseBuildOrder {
  if (count <= 0) {
    throw new Error('Count must be a positive number');
  }

  // Check prerequisites
  if (!canBuildDefense(defenseType, techLevels, currentDefenses, count)) {
    const spec = DEFENSE_SPECS[defenseType];
    throw new Error(`Prerequisites not met for ${spec.name} (count: ${count})`);
  }

  // Calculate costs
  const costPer = DEFENSE_COSTS[defenseType];
  const totalCost: Resources = {
    metal: costPer.metal * count,
    crystal: costPer.crystal * count,
    deuterium: costPer.deuterium * count,
  };

  // Check resources
  if (
    planetResources.metal < totalCost.metal ||
    planetResources.crystal < totalCost.crystal ||
    planetResources.deuterium < totalCost.deuterium
  ) {
    const spec = DEFENSE_SPECS[defenseType];
    throw new Error(
      `Insufficient resources for ${count}x ${spec.name}. ` +
      `Need: ${totalCost.metal}m ${totalCost.crystal}c ${totalCost.deuterium}d. ` +
      `Have: ${planetResources.metal}m ${planetResources.crystal}c ${planetResources.deuterium}d`
    );
  }

  // Calculate build time
  const buildTimePer = getDefenseBuildTime(defenseType, count, shipyardLevel, universeSpeed) / count;
  const totalTime = getDefenseBuildTime(defenseType, count, shipyardLevel, universeSpeed);

  // Deduct resources
  planetResources.metal -= totalCost.metal;
  planetResources.crystal -= totalCost.crystal;
  planetResources.deuterium -= totalCost.deuterium;

  const order: DefenseBuildOrder = {
    id: generateQueueId(planetId, defenseType),
    defenseType,
    count,
    costPer: { ...costPer },
    buildTimePer: Math.max(Math.floor(buildTimePer), 1),
    totalCost,
    totalTime,
    queuedAt: Date.now(),
  };

  return order;
}

// ============================================================================
// QUEUE MANAGEMENT
// ============================================================================

/**
 * Create an empty defense queue.
 */
export function createEmptyDefenseQueue(): DefenseQueue {
  return {
    orders: [],
    currentOrder: null,
    currentProgress: 0,
    startedAt: 0,
  };
}

/**
 * Process the defense queue: check how many units have been completed
 * since startedAt, add completed defenses to inventory, and advance the queue.
 *
 * @param queue    - Current defense queue state
 * @param defenses - Planet's defense inventory (mutated: completed defenses added)
 * @param nowMs    - Current time in milliseconds
 * @returns Updated DefenseQueue state
 */
export function processDefenseQueue(
  queue: DefenseQueue,
  defenses: DefenseStructures,
  nowMs: number,
): DefenseQueue {
  if (!queue.currentOrder && queue.orders.length === 0) {
    return queue;
  }

  // If no current order, start the first one in the queue
  if (!queue.currentOrder && queue.orders.length > 0) {
    queue.currentOrder = queue.orders.shift()!;
    queue.currentProgress = 0;
    queue.startedAt = nowMs;
  }

  // Process current order
  while (queue.currentOrder) {
    const order = queue.currentOrder;
    const elapsedSec = (nowMs - queue.startedAt) / 1000;
    const unitsCompleted = Math.min(
      Math.floor(elapsedSec / order.buildTimePer),
      order.count - queue.currentProgress,
    );

    if (unitsCompleted > 0) {
      // Add completed defenses to inventory
      defenses[order.defenseType] += unitsCompleted;
      queue.currentProgress += unitsCompleted;

      // Advance startedAt to account for completed units
      queue.startedAt += unitsCompleted * order.buildTimePer * 1000;
    }

    // Check if current order is fully complete
    if (queue.currentProgress >= order.count) {
      // Move to next order
      if (queue.orders.length > 0) {
        queue.currentOrder = queue.orders.shift()!;
        queue.currentProgress = 0;
        // startedAt carries forward (remainder time from previous order)
      } else {
        queue.currentOrder = null;
        queue.currentProgress = 0;
        queue.startedAt = 0;
        break;
      }
    } else {
      // Current order still in progress
      break;
    }
  }

  return queue;
}

/**
 * Cancel a queued defense order by queue item ID.
 * Only orders that haven't started can be cancelled (items in orders array, not currentOrder).
 * Refunds 100% of the order's total cost.
 *
 * @param queue           - Current defense queue state
 * @param queueId         - ID of the queue item to cancel
 * @param planetResources - Planet's resources (mutated: refund added)
 * @returns The cancelled order, or null if not found
 */
export function cancelDefenseBuild(
  queue: DefenseQueue,
  queueId: string,
  planetResources: Resources,
): DefenseBuildOrder | null {
  const orderIndex = queue.orders.findIndex((o) => o.id === queueId);
  if (orderIndex < 0) {
    return null;
  }

  const cancelled = queue.orders.splice(orderIndex, 1)[0];

  // Refund resources
  planetResources.metal += cancelled.totalCost.metal;
  planetResources.crystal += cancelled.totalCost.crystal;
  planetResources.deuterium += cancelled.totalCost.deuterium;

  return cancelled;
}

/**
 * Get the defense queue (read-only view of current state).
 *
 * @param queue  - Current defense queue
 * @param nowMs  - Current time in milliseconds
 * @returns Queue state with remaining time info
 */
export function getDefenseBuildQueue(
  queue: DefenseQueue,
  nowMs: number,
): {
  currentOrder: DefenseBuildOrder | null;
  currentProgress: number;
  remainingTimeSeconds: number;
  pendingOrders: DefenseBuildOrder[];
  totalQueueTimeSeconds: number;
} {
  let remainingTimeSeconds = 0;
  let totalQueueTimeSeconds = 0;

  if (queue.currentOrder) {
    const elapsedSec = (nowMs - queue.startedAt) / 1000;
    const remainingInCurrent = queue.currentOrder.count - queue.currentProgress;
    const currentUnitRemaining = Math.max(queue.currentOrder.buildTimePer - (elapsedSec % queue.currentOrder.buildTimePer), 0);
    remainingTimeSeconds = currentUnitRemaining + (remainingInCurrent - 1) * queue.currentOrder.buildTimePer;
    totalQueueTimeSeconds += remainingTimeSeconds;
  }

  for (const order of queue.orders) {
    totalQueueTimeSeconds += order.totalTime;
  }

  return {
    currentOrder: queue.currentOrder,
    currentProgress: queue.currentProgress,
    remainingTimeSeconds: Math.max(Math.ceil(remainingTimeSeconds), 0),
    pendingOrders: [...queue.orders],
    totalQueueTimeSeconds: Math.max(Math.ceil(totalQueueTimeSeconds), 0),
  };
}

/**
 * Get time (unix ms) when the next defense unit will be completed.
 * Returns null if the queue is empty.
 */
export function getNextDefenseCompletionTime(queue: DefenseQueue): number | null {
  if (!queue.currentOrder) return null;
  const nextUnitIndex = queue.currentProgress;
  if (nextUnitIndex >= queue.currentOrder.count) return null;
  return queue.startedAt + queue.currentOrder.buildTimePer * 1000;
}

// ============================================================================
// POST-BATTLE REBUILD
// ============================================================================

/**
 * Rebuild defenses after a battle.
 * Each destroyed defense unit has a configurable chance (default 70%) to be restored.
 * Shield domes are always restored if the planet survived.
 *
 * @param defenses        - Current defense counts (mutated: restored units added)
 * @param destroyed       - Count of each defense type destroyed in battle
 * @param rebuildChance   - Probability of each unit being rebuilt (0.0 - 1.0, default 0.7)
 * @param planetSurvived  - Whether the defending planet survived (default true)
 * @returns RebuildResult with counts of destroyed, rebuilt
 */
export function rebuildDefensesAfterBattle(
  defenses: DefenseStructures,
  destroyed: Partial<DefenseStructures>,
  rebuildChance: number = 0.7,
  planetSurvived: boolean = true,
): RebuildResult {
  // Use the repairDefenses function from defenses.ts but allow custom rebuild chance
  // We re-implement here to support configurable rebuildChance
  const rebuilt: Partial<DefenseStructures> = {};
  const UNIQUE_DEFENSES = new Set(['smallShieldDome', 'largeShieldDome']);

  let destroyedCount = 0;
  let rebuiltCount = 0;

  for (const [key, count] of Object.entries(destroyed) as [keyof DefenseStructures, number][]) {
    if (!count || count <= 0) continue;
    destroyedCount += count;

    // Shield domes always restore if planet survived
    if (UNIQUE_DEFENSES.has(key) && planetSurvived) {
      rebuilt[key] = count;
      rebuiltCount += count;
      defenses[key] = (defenses[key] ?? 0) + count;
      continue;
    }

    // Each unit has an independent chance of being restored
    let restoredCount = 0;
    for (let i = 0; i < count; i++) {
      if (Math.random() < rebuildChance) {
        restoredCount++;
      }
    }

    if (restoredCount > 0) {
      rebuilt[key] = restoredCount;
      rebuiltCount += restoredCount;
      defenses[key] = (defenses[key] ?? 0) + restoredCount;
    }
  }

  return { rebuilt, destroyedCount, rebuiltCount };
}

// ============================================================================
// MISSILE ATTACK
// ============================================================================

/**
 * Launch interplanetary missiles at a target planet.
 * Returns the result of the attack including interceptions and destroyed defenses.
 *
 * @param targetDefenses   - Current defense counts on the target planet
 * @param incomingMissiles - Number of Interplanetary Missiles launched
 * @param weaponTech       - Attacker's weapon technology level
 * @param targetType       - Specific defense type to target first (optional)
 * @returns MissileAttackResult with details of the attack
 */
export function launchMissileAttack(
  targetDefenses: DefenseStructures,
  incomingMissiles: number,
  weaponTech: number,
  targetType?: keyof DefenseStructures,
): MissileAttackResult {
  if (incomingMissiles <= 0) {
    throw new Error('Must launch at least 1 missile');
  }

  const abmCount = targetDefenses.antiBallisticMissile;
  const intercepted = Math.min(abmCount, incomingMissiles);
  const survivingMissiles = incomingMissiles - intercepted;

  const damagePerMissile = 12000 * (1 + 0.1 * weaponTech);
  const totalDamageDealt = survivingMissiles * damagePerMissile;

  const remainingDefenses = calculateMissileAttack(
    incomingMissiles,
    abmCount,
    targetDefenses,
    weaponTech,
    targetType,
  );

  // Calculate what was destroyed
  const destroyedDefenses: Partial<DefenseStructures> = {};
  for (const key of Object.keys(targetDefenses) as (keyof DefenseStructures)[]) {
    const diff = targetDefenses[key] - remainingDefenses[key];
    if (diff > 0) {
      destroyedDefenses[key] = diff;
    }
  }

  return {
    interceptedMissiles: intercepted,
    survivingMissiles,
    remainingDefenses,
    destroyedDefenses,
    totalDamageDealt,
  };
}

// ============================================================================
// DEFENSE SERVICE CLASS (convenience wrapper)
// ============================================================================

export class DefenseService {
  /**
   * Queue a defense build order, validating prerequisites and resources.
   */
  buildDefense(
    planetId: string,
    defenseType: keyof DefenseStructures,
    count: number,
    techLevels: TechLevels,
    currentDefenses: DefenseStructures,
    planetResources: Resources,
    shipyardLevel: number,
    universeSpeed: number = 1,
  ): DefenseBuildOrder {
    return buildDefense(
      planetId,
      defenseType,
      count,
      techLevels,
      currentDefenses,
      planetResources,
      shipyardLevel,
      universeSpeed,
    );
  }

  /**
   * Get the current defenses on a planet (read-only snapshot).
   */
  getDefenses(defenses: DefenseStructures): DefenseStructures {
    return { ...defenses };
  }

  /**
   * Get the defense build queue with timing info.
   */
  getDefenseBuildQueue(
    queue: DefenseQueue,
    nowMs: number = Date.now(),
  ) {
    return getDefenseBuildQueue(queue, nowMs);
  }

  /**
   * Cancel a queued defense order by ID, refunding resources.
   */
  cancelDefenseBuild(
    queue: DefenseQueue,
    queueId: string,
    planetResources: Resources,
  ): DefenseBuildOrder | null {
    return cancelDefenseBuild(queue, queueId, planetResources);
  }

  /**
   * Process the defense queue: complete finished defenses, advance queue.
   */
  processQueue(
    queue: DefenseQueue,
    defenses: DefenseStructures,
    nowMs: number,
  ): DefenseQueue {
    return processDefenseQueue(queue, defenses, nowMs);
  }

  /**
   * Rebuild defenses after a battle with configurable rebuild chance.
   */
  rebuildDefensesAfterBattle(
    defenses: DefenseStructures,
    destroyed: Partial<DefenseStructures>,
    rebuildChance: number = 0.7,
    planetSurvived: boolean = true,
  ): RebuildResult {
    return rebuildDefensesAfterBattle(defenses, destroyed, rebuildChance, planetSurvived);
  }

  /**
   * Launch a missile attack against target defenses.
   */
  launchMissile(
    targetDefenses: DefenseStructures,
    missileCount: number,
    weaponTech: number,
    targetDefense?: keyof DefenseStructures,
  ): MissileAttackResult {
    return launchMissileAttack(targetDefenses, missileCount, weaponTech, targetDefense);
  }

  /**
   * Get all defense type info including buildability status.
   */
  getAllDefenseInfo(
    techLevels: TechLevels,
    currentDefenses: DefenseStructures,
    shipyardLevel: number,
    universeSpeed: number = 1,
  ): DefenseInfo[] {
    return getAllDefenseInfo(techLevels, currentDefenses, shipyardLevel, universeSpeed);
  }

  /**
   * Create an empty defense queue.
   */
  createEmptyQueue(): DefenseQueue {
    return createEmptyDefenseQueue();
  }

  /**
   * Get next defense completion time (unix ms), or null if queue empty.
   */
  getNextCompletionTime(queue: DefenseQueue): number | null {
    return getNextDefenseCompletionTime(queue);
  }
}

/**
 * Singleton instance
 */
export const defenseService = new DefenseService();
