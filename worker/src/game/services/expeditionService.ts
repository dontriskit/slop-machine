import { Ships, Resources, TechLevels, Coordinate } from '../types';
import { calculateCargoCapacity, SHIP_CARGO } from '../formulas';

/**
 * Expedition Service — Position 16 Random Event System
 *
 * Handles all aspects of expedition missions to position 16:
 *   - Event resolution with weighted RNG
 *   - NPC fleet generation (alien and pirate)
 *   - Loot table generation
 *   - Integration with battle and fleet systems
 *
 * Based on OGame expedition mechanics (random encounters at position 16).
 */

// ============================================================================
// TYPES
// ============================================================================

export type ExpeditionEventType =
  | 'find_resources'
  | 'find_ships'
  | 'find_dark_matter'
  | 'alien_contact'
  | 'pirates'
  | 'nothing'
  | 'delayed'
  | 'black_hole';

export interface ExpeditionEvent {
  type: ExpeditionEventType;
  weight: number; // percentage (0-100)
  description: string;
}

export interface ExpeditionResult {
  eventType: ExpeditionEventType;
  description: string;
  resourcesFound: Resources;
  shipsFound: Ships;
  darkMatterFound: number;
  delayMultiplier: number; // 1.0 for normal, 2.0 for delayed, 0 for black hole
  npcFleet?: Ships; // For alien_contact / pirates events
  battleOccurs: boolean; // true for alien_contact and pirates
}

export interface NPCFleetOptions {
  type: 'alien' | 'pirate';
  playerFleetValue: number;
  playerTechLevel?: number; // For scaling alien tech
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Expedition events with their probabilities.
 * Weights must sum to 100.
 */
export const EXPEDITION_EVENTS: ExpeditionEvent[] = [
  {
    type: 'find_resources',
    weight: 30,
    description: 'Found a cargo of valuable resources!',
  },
  {
    type: 'find_ships',
    weight: 10,
    description: 'Discovered an abandoned fleet!',
  },
  {
    type: 'find_dark_matter',
    weight: 5,
    description: 'Detected exotic dark matter particles!',
  },
  {
    type: 'alien_contact',
    weight: 10,
    description: 'Encountered an alien civilization!',
  },
  {
    type: 'pirates',
    weight: 10,
    description: 'Attacked by space pirates!',
  },
  {
    type: 'nothing',
    weight: 20,
    description: 'The expedition found nothing of value.',
  },
  {
    type: 'delayed',
    weight: 10,
    description: 'Fleet caught in temporal anomaly. Return time doubled!',
  },
  {
    type: 'black_hole',
    weight: 5,
    description: 'DISASTER: Fleet lost in black hole!',
  },
];

// Verify weights sum to 100
const totalWeight = EXPEDITION_EVENTS.reduce((sum, e) => sum + e.weight, 0);
if (totalWeight !== 100) {
  throw new Error(`Expedition event weights sum to ${totalWeight}, expected 100`);
}

/**
 * Ship composition templates for NPC fleets.
 * Maps ship type to percentage of fleet value.
 */
const NPC_ALIEN_COMPOSITION: Record<keyof Ships, number> = {
  lightFighter: 0.25,
  heavyFighter: 0.15,
  cruiser: 0.25,
  battleship: 0.15,
  battlecruiser: 0.1,
  bomber: 0.05,
  destroyer: 0.03,
  deathstar: 0.0,
  smallCargo: 0.01,
  largeCargo: 0.01,
  colonyShip: 0.0,
  recycler: 0.0,
  espionageProbe: 0.0,
};

/**
 * Pirate composition: aggressive, no cargo or utility ships.
 * All combat vessels, focused on firepower.
 */
const NPC_PIRATE_COMPOSITION: Record<keyof Ships, number> = {
  lightFighter: 0.4,
  heavyFighter: 0.3,
  cruiser: 0.2,
  battleship: 0.05,
  battlecruiser: 0.03,
  bomber: 0.02,
  destroyer: 0.0,
  deathstar: 0.0,
  smallCargo: 0.0,
  largeCargo: 0.0,
  colonyShip: 0.0,
  recycler: 0.0,
  espionageProbe: 0.0,
};

/**
 * Ship metal costs for fleet value calculation.
 * Used to scale NPC fleets proportionally to player fleet value.
 */
const SHIP_METAL_COST: Record<keyof Ships, number> = {
  lightFighter: 3000,
  heavyFighter: 6000,
  cruiser: 20000,
  battleship: 45000,
  battlecruiser: 30000,
  bomber: 50000,
  destroyer: 60000,
  deathstar: 5000000,
  smallCargo: 2000,
  largeCargo: 6000,
  colonyShip: 10000,
  recycler: 10000,
  espionageProbe: 0,
};

// ============================================================================
// SEEDED RANDOM NUMBER GENERATOR
// ============================================================================

/**
 * Deterministic random number generator using a simple LCG (Linear Congruential Generator).
 * Allows for reproducible expeditions with a seed.
 */
class SeededRandom {
  private seed: number;

  constructor(seed: number = Date.now()) {
    this.seed = seed >>> 0; // Convert to unsigned 32-bit int
  }

  /**
   * Generate a random number in [0, 1).
   */
  next(): number {
    // LCG parameters (same as glibc)
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }

  /**
   * Generate a random integer in [0, max).
   */
  nextInt(max: number): number {
    return Math.floor(this.next() * max);
  }

  /**
   * Generate a random integer in [min, max].
   */
  nextIntRange(min: number, max: number): number {
    return min + this.nextInt(max - min + 1);
  }

  /**
   * Pick a random element from an array.
   */
  pick<T>(arr: T[]): T {
    return arr[this.nextInt(arr.length)];
  }
}

// ============================================================================
// EXPEDITION RESOLUTION
// ============================================================================

/**
 * Resolve an expedition by selecting a random event.
 *
 * @param playerFleetValue  Total metal cost of player's fleet
 * @param playerTechLevel   Player's highest tech level (for alien scaling)
 * @param seed              Optional seed for deterministic RNG
 */
export function resolveExpedition(
  playerFleetValue: number,
  playerTechLevel: number = 0,
  seed?: number
): ExpeditionResult {
  const rng = new SeededRandom(seed);

  // Select event by weighted random
  const eventType = selectWeightedEvent(rng);
  const event = EXPEDITION_EVENTS.find((e) => e.type === eventType)!;

  // Create base result
  const result: ExpeditionResult = {
    eventType,
    description: event.description,
    resourcesFound: { metal: 0, crystal: 0, deuterium: 0 },
    shipsFound: getEmptyShips(),
    darkMatterFound: 0,
    delayMultiplier: 1.0,
    battleOccurs: false,
  };

  // Process event-specific logic
  switch (eventType) {
    case 'find_resources':
      result.resourcesFound = generateResourceLoot(playerFleetValue, rng);
      break;

    case 'find_ships':
      result.shipsFound = generateShipLoot(playerFleetValue, rng);
      break;

    case 'find_dark_matter':
      result.darkMatterFound = rng.nextIntRange(50, 200);
      break;

    case 'alien_contact':
      result.npcFleet = generateNPCFleet({
        type: 'alien',
        playerFleetValue,
        playerTechLevel,
      });
      result.battleOccurs = true;
      break;

    case 'pirates':
      result.npcFleet = generateNPCFleet({
        type: 'pirate',
        playerFleetValue,
      });
      result.battleOccurs = true;
      break;

    case 'nothing':
      // No loot, no events
      break;

    case 'delayed':
      result.delayMultiplier = 2.0; // Return time doubled
      break;

    case 'black_hole':
      result.delayMultiplier = 0; // Fleet destroyed (no return)
      break;
  }

  return result;
}

/**
 * Select a weighted random event from EXPEDITION_EVENTS.
 */
function selectWeightedEvent(rng: SeededRandom): ExpeditionEventType {
  let roll = rng.next() * 100; // Random value 0-100

  for (const event of EXPEDITION_EVENTS) {
    roll -= event.weight;
    if (roll < 0) {
      return event.type;
    }
  }

  // Fallback to last event (shouldn't happen)
  return EXPEDITION_EVENTS[EXPEDITION_EVENTS.length - 1].type;
}

// ============================================================================
// NPC FLEET GENERATION
// ============================================================================

/**
 * Generate an NPC fleet for alien or pirate encounters.
 *
 * Alien: 60% of player fleet value, balanced composition, uses tech bonuses
 * Pirate: 40% of player fleet value, aggressive (fighters/bombers), no tech bonuses
 */
export function generateNPCFleet(opts: NPCFleetOptions): Ships {
  const composition =
    opts.type === 'alien' ? NPC_ALIEN_COMPOSITION : NPC_PIRATE_COMPOSITION;
  const valueFraction = opts.type === 'alien' ? 0.6 : 0.4;
  const targetFleetValue = opts.playerFleetValue * valueFraction;

  const fleet = getEmptyShips();
  let currentValue = 0;

  // Distribute fleet value across ship types
  const entries = Object.entries(composition) as Array<[keyof Ships, number]>;

  for (const [shipType, proportion] of entries) {
    if (proportion <= 0) continue;

    const shipTargetValue = targetFleetValue * proportion;
    const metalCost = SHIP_METAL_COST[shipType];

    if (metalCost <= 0) continue; // Skip espionage probes (0 cost)

    const shipCount = Math.floor(shipTargetValue / metalCost);
    fleet[shipType] = shipCount;
    currentValue += shipCount * metalCost;
  }

  return fleet;
}

// ============================================================================
// LOOT GENERATION
// ============================================================================

/**
 * Generate resource loot based on fleet value.
 * Distribution: 40% metal, 30% crystal, 30% deuterium
 * Amount: 0.5x to 2.5x fleet value
 */
function generateResourceLoot(fleetValue: number, rng: SeededRandom): Resources {
  // Loot amount: 0.5x to 2.5x fleet value
  const lootMultiplier = 0.5 + rng.next() * 2.0;
  const totalLoot = Math.floor(fleetValue * lootMultiplier);

  // Distribute: 40% metal, 30% crystal, 30% deuterium
  const metal = Math.floor(totalLoot * 0.4);
  const crystal = Math.floor(totalLoot * 0.3);
  const deuterium = totalLoot - metal - crystal; // Remainder to deuterium

  return { metal, crystal, deuterium };
}

/**
 * Generate ship loot: 5-15% of player fleet composition.
 * Randomly selects ship types from a weighted pool.
 */
function generateShipLoot(playerFleetValue: number, rng: SeededRandom): Ships {
  const loot = getEmptyShips();

  // Loot is 5-15% of player fleet value
  const lootPercentage = 5 + rng.next() * 10; // 5-15%
  const lootValue = Math.floor((playerFleetValue * lootPercentage) / 100);

  if (lootValue === 0) return loot; // Not enough value for any ships

  // Distribute loot across common combat ships
  const lootableShips: Array<[keyof Ships, number]> = [
    ['lightFighter', SHIP_METAL_COST.lightFighter],
    ['heavyFighter', SHIP_METAL_COST.heavyFighter],
    ['cruiser', SHIP_METAL_COST.cruiser],
    ['smallCargo', SHIP_METAL_COST.smallCargo],
  ];

  let remaining = lootValue;

  for (const [shipType, cost] of lootableShips) {
    const maxShips = Math.floor(remaining / cost);
    if (maxShips > 0) {
      const shipsToAdd = rng.nextInt(maxShips + 1); // 0 to maxShips
      loot[shipType] = shipsToAdd;
      remaining -= shipsToAdd * cost;
    }
  }

  return loot;
}

/**
 * Calculate loot with cargo capacity constraints.
 * If loot exceeds survivors' cargo, apply proportional reduction.
 */
export function calculateExpeditionLoot(
  survivorShips: Ships,
  event: ExpeditionResult
): Resources {
  const cargoCapacity = calculateCargoCapacity(survivorShips);
  const totalLoot = event.resourcesFound.metal +
    event.resourcesFound.crystal +
    event.resourcesFound.deuterium;

  if (totalLoot <= cargoCapacity) {
    return { ...event.resourcesFound };
  }

  // Cargo exceeded: proportionally reduce loot
  const ratio = cargoCapacity / totalLoot;
  return {
    metal: Math.floor(event.resourcesFound.metal * ratio),
    crystal: Math.floor(event.resourcesFound.crystal * ratio),
    deuterium: Math.floor(event.resourcesFound.deuterium * ratio),
  };
}

// ============================================================================
// UTILITIES
// ============================================================================

/** Get empty ships object. */
function getEmptyShips(): Ships {
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

/** Calculate total metal cost of a fleet. */
export function calculateFleetValue(ships: Ships): number {
  let value = 0;
  for (const [shipType, count] of Object.entries(ships) as Array<
    [keyof Ships, number]
  >) {
    value += count * SHIP_METAL_COST[shipType];
  }
  return value;
}

// ============================================================================
// SINGLETON INSTANCE (optional)
// ============================================================================

export class ExpeditionService {
  /**
   * Run a complete expedition event resolution.
   */
  resolveExpedition(
    playerFleetValue: number,
    playerTechLevel: number = 0,
    seed?: number
  ): ExpeditionResult {
    return resolveExpedition(playerFleetValue, playerTechLevel, seed);
  }

  /**
   * Generate an NPC fleet for combat.
   */
  generateNPCFleet(opts: NPCFleetOptions): Ships {
    return generateNPCFleet(opts);
  }

  /**
   * Calculate actual loot with cargo constraints.
   */
  calculateExpeditionLoot(
    survivorShips: Ships,
    event: ExpeditionResult
  ): Resources {
    return calculateExpeditionLoot(survivorShips, event);
  }

  /**
   * Calculate fleet value.
   */
  calculateFleetValue(ships: Ships): number {
    return calculateFleetValue(ships);
  }
}

export const expeditionService = new ExpeditionService();
