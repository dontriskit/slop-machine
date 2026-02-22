import { Ships, Resources, BuildingLevels, TechLevels } from '../types';

/**
 * Shipyard Service — Ship Construction System
 *
 * Handles all ship construction logic:
 *  - Ship requirements (shipyard level + tech prerequisites)
 *  - Ship costs (sourced from SHIP_SPECS in battleService)
 *  - Build time calculations (batch production through shipyard)
 *  - Queue management (build orders with per-unit tracking)
 *  - Resource validation and deduction
 *
 * Build time formula (per unit):
 *   (metal + crystal) / (2500 * (1 + shipyardLevel) * universeSpeed * 2^naniteLevel)
 *
 * Reference: OGameX + UniEngine canonical formulas.
 */

// ============================================================================
// TYPES
// ============================================================================

/** A single build order in the shipyard queue */
export interface ShipBuildOrder {
  shipType: keyof Ships;
  count: number;
  costPer: Resources;
  buildTimePer: number;  // seconds per unit
  totalCost: Resources;
  totalTime: number;     // total seconds for entire order
}

/** Full state of the shipyard queue */
export interface ShipyardQueue {
  orders: ShipBuildOrder[];
  currentOrder: ShipBuildOrder | null;
  currentProgress: number;  // units completed in current order
  startedAt: number;        // unix ms when current order started building
}

/** Requirement specification for a single ship type */
export interface ShipRequirement {
  shipyard: number;
  techs: Partial<Record<keyof TechLevels, number>>;
}

/** Ship info returned by getAvailableShips */
export interface ShipInfo {
  shipType: keyof Ships;
  name: string;
  cost: Resources;
  buildTime: number;       // seconds per unit at current levels
  requirements: ShipRequirement;
  canBuild: boolean;
}

// ============================================================================
// SHIP COSTS (sourced from battleService SHIP_SPECS)
// ============================================================================

/**
 * Per-unit resource cost for each ship type.
 * Values match SHIP_SPECS in battleService.ts.
 */
export const SHIP_COSTS: Record<keyof Ships, Resources> = {
  lightFighter:   { metal: 3000,    crystal: 1000,    deuterium: 0 },
  heavyFighter:   { metal: 6000,    crystal: 4000,    deuterium: 0 },
  cruiser:        { metal: 20000,   crystal: 7000,    deuterium: 2000 },
  battleship:     { metal: 45000,   crystal: 15000,   deuterium: 0 },
  battlecruiser:  { metal: 30000,   crystal: 40000,   deuterium: 15000 },
  bomber:         { metal: 50000,   crystal: 25000,   deuterium: 15000 },
  destroyer:      { metal: 60000,   crystal: 50000,   deuterium: 15000 },
  deathstar:      { metal: 5000000, crystal: 4000000, deuterium: 1000000 },
  smallCargo:     { metal: 2000,    crystal: 2000,    deuterium: 0 },
  largeCargo:     { metal: 6000,    crystal: 6000,    deuterium: 0 },
  colonyShip:     { metal: 10000,   crystal: 20000,   deuterium: 10000 },
  recycler:       { metal: 10000,   crystal: 6000,    deuterium: 2000 },
  espionageProbe: { metal: 0,       crystal: 1000,    deuterium: 0 },
};

// ============================================================================
// SHIP DISPLAY NAMES
// ============================================================================

export const SHIP_NAMES: Record<keyof Ships, string> = {
  lightFighter:   'Light Fighter',
  heavyFighter:   'Heavy Fighter',
  cruiser:        'Cruiser',
  battleship:     'Battleship',
  battlecruiser:  'Battlecruiser',
  bomber:         'Bomber',
  destroyer:      'Destroyer',
  deathstar:      'Deathstar',
  smallCargo:     'Small Cargo',
  largeCargo:     'Large Cargo',
  colonyShip:     'Colony Ship',
  recycler:       'Recycler',
  espionageProbe: 'Espionage Probe',
};

// ============================================================================
// SHIP REQUIREMENTS (canonical OGame tech tree)
// ============================================================================

/**
 * Shipyard level + technology prerequisites for each ship type.
 *
 * | Ship            | Shipyard | Other Requirements                               |
 * |-----------------|----------|-------------------------------------------------|
 * | Small Cargo     | 2        | Combustion Drive 2                              |
 * | Large Cargo     | 4        | Combustion Drive 6                              |
 * | Light Fighter   | 1        | Combustion Drive 1                              |
 * | Heavy Fighter   | 3        | Armour Tech 2, Impulse Drive 2                  |
 * | Cruiser         | 5        | Impulse Drive 4, Ion Tech 2                     |
 * | Battleship      | 7        | Hyperspace Drive 4                              |
 * | Battlecruiser   | 8        | Hyperspace Tech 5, Laser Tech 12               |
 * | Bomber          | 8        | Impulse Drive 6, Plasma Tech 5                  |
 * | Destroyer       | 9        | Hyperspace Tech 5, Hyperspace Drive 6           |
 * | Deathstar       | 12       | Hyperspace Tech 6, Hyperspace Drive 7, Graviton 1|
 * | Colony Ship     | 4        | Impulse Drive 3                                 |
 * | Recycler        | 4        | Combustion Drive 6, Shielding Tech 2            |
 * | Espionage Probe | 3        | Combustion Drive 3, Espionage Tech 2            |
 * | Solar Satellite | 1        | --                                               |
 */
export const SHIP_REQUIREMENTS: Record<keyof Ships, ShipRequirement> = {
  lightFighter: {
    shipyard: 1,
    techs: { combustionDrive: 1 },
  },
  heavyFighter: {
    shipyard: 3,
    techs: { armorTech: 2, impulseDrive: 2 },
  },
  cruiser: {
    shipyard: 5,
    techs: { impulseDrive: 4, ionTech: 2 },
  },
  battleship: {
    shipyard: 7,
    techs: { hyperspaceDrive: 4 },
  },
  battlecruiser: {
    shipyard: 8,
    techs: { hyperspaceTech: 5, laserTech: 12 },
  },
  bomber: {
    shipyard: 8,
    techs: { impulseDrive: 6, plasmaTech: 5 },
  },
  destroyer: {
    shipyard: 9,
    techs: { hyperspaceTech: 5, hyperspaceDrive: 6 },
  },
  deathstar: {
    shipyard: 12,
    techs: { hyperspaceTech: 6, hyperspaceDrive: 7, gravitonTech: 1 },
  },
  smallCargo: {
    shipyard: 2,
    techs: { combustionDrive: 2 },
  },
  largeCargo: {
    shipyard: 4,
    techs: { combustionDrive: 6 },
  },
  colonyShip: {
    shipyard: 4,
    techs: { impulseDrive: 3 },
  },
  recycler: {
    shipyard: 4,
    techs: { combustionDrive: 6, shieldingTech: 2 },
  },
  espionageProbe: {
    shipyard: 3,
    techs: { combustionDrive: 3, espionageTech: 2 },
  },
};

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Check whether a ship type can be built given current building and tech levels.
 *
 * @param shipType       - Key of the ship to build
 * @param buildingLevels - Current building levels on the planet
 * @param techLevels     - Player's current technology levels
 * @returns true if all prerequisites are met
 */
export function canBuildShip(
  shipType: keyof Ships,
  buildingLevels: BuildingLevels,
  techLevels: TechLevels,
): boolean {
  const req = SHIP_REQUIREMENTS[shipType];
  if (!req) return false;

  // Check shipyard level
  if ((buildingLevels.shipyard ?? 0) < req.shipyard) {
    return false;
  }

  // Check tech prerequisites
  for (const [techKey, requiredLevel] of Object.entries(req.techs)) {
    const currentLevel = techLevels[techKey as keyof TechLevels] ?? 0;
    if (currentLevel < (requiredLevel as number)) {
      return false;
    }
  }

  return true;
}

/**
 * Get the per-unit resource cost for a ship type.
 *
 * @param shipType - Key of the ship
 * @returns Resources cost per unit
 */
export function getShipCost(shipType: keyof Ships): Resources {
  return { ...SHIP_COSTS[shipType] };
}

/**
 * Get the requirements for a ship type.
 *
 * @param shipType - Key of the ship
 * @returns ShipRequirement with shipyard level and tech prerequisites
 */
export function getShipRequirements(shipType: keyof Ships): ShipRequirement {
  return SHIP_REQUIREMENTS[shipType];
}

/**
 * Calculate the build time in seconds for a single unit of a ship type.
 *
 * Formula: (metal + crystal) / (2500 * (1 + shipyardLevel) * universeSpeed * 2^naniteLevel)
 *
 * @param shipType       - Key of the ship to build
 * @param shipyardLevel  - Current shipyard level on the planet
 * @param naniteLevel    - Current nanite factory level on the planet
 * @param universeSpeed  - Universe speed multiplier (default 1)
 * @returns Build time per unit in seconds (minimum 1)
 */
export function getShipBuildTime(
  shipType: keyof Ships,
  shipyardLevel: number,
  naniteLevel: number,
  universeSpeed: number = 1,
): number {
  const cost = SHIP_COSTS[shipType];
  const numerator = cost.metal + cost.crystal;
  const denominator = 2500 * (1 + shipyardLevel) * universeSpeed * Math.pow(2, naniteLevel);

  return Math.max(Math.floor(numerator / denominator), 1);
}

/**
 * Get all ships that the player can currently build.
 *
 * @param buildingLevels - Current building levels on the planet
 * @param techLevels     - Player's current technology levels
 * @returns Array of ship type keys that are available for construction
 */
export function getAvailableShips(
  buildingLevels: BuildingLevels,
  techLevels: TechLevels,
): (keyof Ships)[] {
  const available: (keyof Ships)[] = [];

  for (const shipType of Object.keys(SHIP_REQUIREMENTS) as (keyof Ships)[]) {
    if (canBuildShip(shipType, buildingLevels, techLevels)) {
      available.push(shipType);
    }
  }

  return available;
}

/**
 * Get detailed info for all ship types, including whether they can be built.
 *
 * @param buildingLevels - Current building levels on the planet
 * @param techLevels     - Player's current technology levels
 * @param naniteLevel    - Nanite factory level (for build time calc)
 * @param universeSpeed  - Universe speed multiplier
 * @returns Array of ShipInfo objects for all ship types
 */
export function getAllShipInfo(
  buildingLevels: BuildingLevels,
  techLevels: TechLevels,
  naniteLevel: number = 0,
  universeSpeed: number = 1,
): ShipInfo[] {
  const shipyardLevel = buildingLevels.shipyard ?? 0;

  return (Object.keys(SHIP_REQUIREMENTS) as (keyof Ships)[]).map((shipType) => ({
    shipType,
    name: SHIP_NAMES[shipType],
    cost: getShipCost(shipType),
    buildTime: getShipBuildTime(shipType, shipyardLevel, naniteLevel, universeSpeed),
    requirements: SHIP_REQUIREMENTS[shipType],
    canBuild: canBuildShip(shipType, buildingLevels, techLevels),
  }));
}

// ============================================================================
// BUILD ORDER MANAGEMENT
// ============================================================================

/**
 * Create a ship build order after validating resources and prerequisites.
 *
 * Validates:
 *  1. Ship type prerequisites are met (shipyard + techs)
 *  2. Planet has sufficient resources for the full order
 *  3. Count is positive
 *
 * On success, deducts resources from planetResources (mutated in place) and
 * returns the ShipBuildOrder to add to the queue.
 *
 * @param shipType       - Ship type to build
 * @param count          - Number of units to produce
 * @param buildingLevels - Current building levels on the planet
 * @param techLevels     - Player's current technology levels
 * @param planetResources - Planet's current resources (mutated: cost deducted on success)
 * @param universeSpeed  - Universe speed multiplier
 * @returns ShipBuildOrder on success
 * @throws Error if validation fails
 */
export function buildShips(
  shipType: keyof Ships,
  count: number,
  buildingLevels: BuildingLevels,
  techLevels: TechLevels,
  planetResources: Resources,
  universeSpeed: number = 1,
): ShipBuildOrder {
  if (count <= 0) {
    throw new Error('Count must be a positive number');
  }

  // Check prerequisites
  if (!canBuildShip(shipType, buildingLevels, techLevels)) {
    throw new Error(`Prerequisites not met for ${SHIP_NAMES[shipType]}`);
  }

  // Calculate costs
  const costPer = SHIP_COSTS[shipType];
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
    throw new Error(
      `Insufficient resources for ${count}x ${SHIP_NAMES[shipType]}. ` +
      `Need: ${totalCost.metal}m ${totalCost.crystal}c ${totalCost.deuterium}d. ` +
      `Have: ${planetResources.metal}m ${planetResources.crystal}c ${planetResources.deuterium}d`
    );
  }

  // Calculate build time
  const shipyardLevel = buildingLevels.shipyard ?? 0;
  const naniteLevel = buildingLevels.naniteFactory ?? 0;
  const buildTimePer = getShipBuildTime(shipType, shipyardLevel, naniteLevel, universeSpeed);
  const totalTime = buildTimePer * count;

  // Deduct resources
  planetResources.metal -= totalCost.metal;
  planetResources.crystal -= totalCost.crystal;
  planetResources.deuterium -= totalCost.deuterium;

  return {
    shipType,
    count,
    costPer: { ...costPer },
    buildTimePer,
    totalCost,
    totalTime,
  };
}

// ============================================================================
// QUEUE PROCESSING
// ============================================================================

/**
 * Process the shipyard queue: check how many units have been completed
 * since startedAt, add completed ships to inventory, and advance the queue.
 *
 * @param queue   - Current shipyard queue state
 * @param ships   - Planet's ship inventory (mutated: completed ships added)
 * @param nowMs   - Current time in milliseconds
 * @returns Updated ShipyardQueue state
 */
export function processShipyardQueue(
  queue: ShipyardQueue,
  ships: Ships,
  nowMs: number,
): ShipyardQueue {
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
      // Add completed ships to inventory
      ships[order.shipType] += unitsCompleted;
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
 * Get the time (unix ms) when the next ship unit will be completed.
 * Returns null if the queue is empty.
 *
 * @param queue - Current shipyard queue state
 * @returns Unix ms timestamp of next completion, or null
 */
export function getNextCompletionTime(queue: ShipyardQueue): number | null {
  if (!queue.currentOrder) return null;

  const nextUnitIndex = queue.currentProgress;
  if (nextUnitIndex >= queue.currentOrder.count) return null;

  return queue.startedAt + queue.currentOrder.buildTimePer * 1000;
}

/**
 * Cancel a queued order by index. Only orders that haven't started building
 * can be cancelled (i.e., orders in the queue, not the currentOrder).
 *
 * Refunds 100% of the order's total cost.
 *
 * @param queue           - Current shipyard queue state
 * @param orderIndex      - Index into queue.orders to cancel
 * @param planetResources - Planet's resources (mutated: refund added)
 * @returns The cancelled order, or null if index is invalid
 */
export function cancelShipOrder(
  queue: ShipyardQueue,
  orderIndex: number,
  planetResources: Resources,
): ShipBuildOrder | null {
  if (orderIndex < 0 || orderIndex >= queue.orders.length) {
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
 * Create an empty shipyard queue.
 */
export function createEmptyQueue(): ShipyardQueue {
  return {
    orders: [],
    currentOrder: null,
    currentProgress: 0,
    startedAt: 0,
  };
}

/**
 * Get total remaining build time across all orders in the queue (seconds).
 *
 * @param queue - Current shipyard queue state
 * @param nowMs - Current time in milliseconds
 * @returns Remaining seconds until entire queue is complete
 */
export function getTotalQueueTime(queue: ShipyardQueue, nowMs: number): number {
  let totalSeconds = 0;

  // Current order remaining time
  if (queue.currentOrder) {
    const remainingUnits = queue.currentOrder.count - queue.currentProgress;
    const elapsedSec = (nowMs - queue.startedAt) / 1000;
    const currentUnitRemaining = Math.max(queue.currentOrder.buildTimePer - elapsedSec, 0);
    totalSeconds += currentUnitRemaining + (remainingUnits - 1) * queue.currentOrder.buildTimePer;
  }

  // Queued orders
  for (const order of queue.orders) {
    totalSeconds += order.totalTime;
  }

  return Math.max(Math.ceil(totalSeconds), 0);
}

// ============================================================================
// SHIPYARD SERVICE CLASS (convenience wrapper)
// ============================================================================

export class ShipyardService {
  /**
   * Check if a ship type can be built
   */
  canBuildShip(
    shipType: keyof Ships,
    buildingLevels: BuildingLevels,
    techLevels: TechLevels,
  ): boolean {
    return canBuildShip(shipType, buildingLevels, techLevels);
  }

  /**
   * Get per-unit cost for a ship type
   */
  getShipCost(shipType: keyof Ships): Resources {
    return getShipCost(shipType);
  }

  /**
   * Get build time per unit in seconds
   */
  getShipBuildTime(
    shipType: keyof Ships,
    shipyardLevel: number,
    naniteLevel: number,
    universeSpeed: number = 1,
  ): number {
    return getShipBuildTime(shipType, shipyardLevel, naniteLevel, universeSpeed);
  }

  /**
   * Get requirements for a ship type
   */
  getShipRequirements(shipType: keyof Ships): ShipRequirement {
    return getShipRequirements(shipType);
  }

  /**
   * Get all buildable ship types
   */
  getAvailableShips(
    buildingLevels: BuildingLevels,
    techLevels: TechLevels,
  ): (keyof Ships)[] {
    return getAvailableShips(buildingLevels, techLevels);
  }

  /**
   * Get detailed info for all ship types
   */
  getAllShipInfo(
    buildingLevels: BuildingLevels,
    techLevels: TechLevels,
    naniteLevel: number = 0,
    universeSpeed: number = 1,
  ): ShipInfo[] {
    return getAllShipInfo(buildingLevels, techLevels, naniteLevel, universeSpeed);
  }

  /**
   * Build ships: validate, deduct resources, return build order
   */
  buildShips(
    shipType: keyof Ships,
    count: number,
    buildingLevels: BuildingLevels,
    techLevels: TechLevels,
    planetResources: Resources,
    universeSpeed: number = 1,
  ): ShipBuildOrder {
    return buildShips(shipType, count, buildingLevels, techLevels, planetResources, universeSpeed);
  }

  /**
   * Process queue: complete finished ships, advance queue
   */
  processQueue(
    queue: ShipyardQueue,
    ships: Ships,
    nowMs: number,
  ): ShipyardQueue {
    return processShipyardQueue(queue, ships, nowMs);
  }

  /**
   * Cancel a queued order and refund resources
   */
  cancelOrder(
    queue: ShipyardQueue,
    orderIndex: number,
    planetResources: Resources,
  ): ShipBuildOrder | null {
    return cancelShipOrder(queue, orderIndex, planetResources);
  }

  /**
   * Get next ship completion time
   */
  getNextCompletionTime(queue: ShipyardQueue): number | null {
    return getNextCompletionTime(queue);
  }

  /**
   * Get total remaining queue time in seconds
   */
  getTotalQueueTime(queue: ShipyardQueue, nowMs: number): number {
    return getTotalQueueTime(queue, nowMs);
  }

  /**
   * Create an empty shipyard queue
   */
  createEmptyQueue(): ShipyardQueue {
    return createEmptyQueue();
  }
}

/**
 * Singleton instance
 */
export const shipyardService = new ShipyardService();
