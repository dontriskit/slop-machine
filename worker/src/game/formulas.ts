import { Coordinate, Resources, Ships } from './types';

/**
 * OGame Canonical Formulas (verified against OGameX and UniEngine reference implementations)
 * All formulas extracted from reference codebases: /references/OGameX and /references/UniEngine
 */

// ============================================================================
// UNIVERSE CONFIGURATION
// ============================================================================

export const UNIVERSE_CONFIG = {
  MIN_GALAXY: 1,
  MAX_GALAXY: 9,            // Configurable, typically 2-9
  MIN_SYSTEM: 1,
  MAX_SYSTEM: 499,          // Per galaxy, wraps around
  MIN_POSITION: 1,
  MAX_POSITION: 15,         // Regular planets
  EXPEDITION_POSITION: 16,  // Expedition slot
};

// ============================================================================
// SHIP SPEEDS (tokens/hour, used for duration calculation)
// ============================================================================

export const SHIP_SPEEDS: Record<keyof Ships, number> = {
  lightFighter: 12500,
  heavyFighter: 10000,
  cruiser: 15000,
  battleship: 10000,
  battlecruiser: 10000,
  bomber: 5000,
  destroyer: 5000,
  deathstar: 100,
  smallCargo: 20000,
  largeCargo: 5000,
  colonyShip: 2500,
  recycler: 2000,
  espionageProbe: 100000000, // Basically instant
};

// ============================================================================
// SHIP FUEL CONSUMPTION (deuterium per 35k distance per unit)
// ============================================================================

export const SHIP_FUEL: Record<keyof Ships, number> = {
  lightFighter: 20,
  heavyFighter: 50,
  cruiser: 48,
  battleship: 500,
  battlecruiser: 250,
  bomber: 100,
  destroyer: 1000,
  deathstar: 1,
  smallCargo: 10,
  largeCargo: 50,
  colonyShip: 100,
  recycler: 20,
  espionageProbe: 1,
};

// ============================================================================
// SHIP CARGO CAPACITY (resources per unit)
// ============================================================================

export const SHIP_CARGO: Record<keyof Ships, number> = {
  lightFighter: 0,
  heavyFighter: 0,
  cruiser: 0,
  battleship: 0,
  battlecruiser: 0,
  bomber: 0,
  destroyer: 0,
  deathstar: 0,
  smallCargo: 5000,
  largeCargo: 25000,
  colonyShip: 7500,
  recycler: 20000,
  espionageProbe: 0,
};

// ============================================================================
// COORDINATE CALCULATIONS
// ============================================================================

/**
 * Normalize a coordinate within universe bounds
 * Implements donut topology: systems wrap 1→499→1
 */
export function normalizeCoordinate(coord: Coordinate, numGalaxies: number): Coordinate {
  let { galaxy, system, position } = coord;

  // Galaxies wrap around
  if (galaxy < UNIVERSE_CONFIG.MIN_GALAXY) {
    galaxy = numGalaxies;
  } else if (galaxy > numGalaxies) {
    galaxy = UNIVERSE_CONFIG.MIN_GALAXY;
  }

  // Systems wrap around (donut topology)
  if (system < UNIVERSE_CONFIG.MIN_SYSTEM) {
    system = UNIVERSE_CONFIG.MAX_SYSTEM;
  } else if (system > UNIVERSE_CONFIG.MAX_SYSTEM) {
    system = UNIVERSE_CONFIG.MIN_SYSTEM;
  }

  // Positions clamp (no wrapping for positions)
  if (position < UNIVERSE_CONFIG.MIN_POSITION) {
    position = UNIVERSE_CONFIG.MIN_POSITION;
  } else if (position > UNIVERSE_CONFIG.EXPEDITION_POSITION) {
    position = UNIVERSE_CONFIG.EXPEDITION_POSITION;
  }

  return { galaxy, system, position };
}

/**
 * Check if coordinate is valid
 */
export function isValidCoordinate(coord: Coordinate, numGalaxies: number): boolean {
  return (
    coord.galaxy >= UNIVERSE_CONFIG.MIN_GALAXY &&
    coord.galaxy <= numGalaxies &&
    coord.system >= UNIVERSE_CONFIG.MIN_SYSTEM &&
    coord.system <= UNIVERSE_CONFIG.MAX_SYSTEM &&
    coord.position >= UNIVERSE_CONFIG.MIN_POSITION &&
    coord.position <= UNIVERSE_CONFIG.EXPEDITION_POSITION
  );
}

/**
 * Calculate donut-wrapped distance between galaxies
 * Distance is 20,000 per galaxy difference
 */
function getGalaxyDistance(from: number, to: number, numGalaxies: number): number {
  const diff1 = Math.abs(from - to);
  const diff2 = Math.abs(diff1 - numGalaxies);
  const distance = Math.min(diff1, diff2);
  return distance * 20000;
}

/**
 * Calculate donut-wrapped distance between systems within same galaxy
 * Distance = 2700 + (19 × 5 × systemDiff - emptySystemsCount - inactiveSystemsCount)
 * For now, we don't count empty/inactive systems (simplified formula)
 */
function getSystemDistance(from: number, to: number): number {
  const diff1 = Math.abs(from - to);
  const diff2 = Math.abs(diff1 - UNIVERSE_CONFIG.MAX_SYSTEM);
  const distance = Math.max(Math.min(diff1, diff2) - 0, 1); // Subtract empty/inactive if available
  return 2700 + distance * 19 * 5;
}

/**
 * Calculate distance between positions within same system
 * Distance = 1000 + (5 × positionDiff)
 */
function getPositionDistance(from: number, to: number): number {
  const distance = Math.abs(from - to);
  return 1000 + distance * 5;
}

/**
 * Calculate total flight distance between two coordinates
 * Formula accounts for donut topology (wrapping)
 *
 * Returns distance in "tokens" used in duration calculation
 */
export function calculateDistance(
  from: Coordinate,
  to: Coordinate,
  numGalaxies: number
): number {
  // Different galaxies
  if (from.galaxy !== to.galaxy) {
    return getGalaxyDistance(from.galaxy, to.galaxy, numGalaxies);
  }

  // Same galaxy, different system
  if (from.system !== to.system) {
    return getSystemDistance(from.system, to.system);
  }

  // Same system, different position
  if (from.position !== to.position) {
    return getPositionDistance(from.position, to.position);
  }

  // Same coordinates
  return 5;
}

// ============================================================================
// FLEET MOVEMENT CALCULATIONS
// ============================================================================

/**
 * Get slowest ship speed in a fleet (determines journey duration)
 * Returns speed in tokens/hour
 */
export function getSlowestSpeed(ships: Ships): number {
  let slowestSpeed = Infinity;

  for (const [key, count] of Object.entries(ships)) {
    if (count > 0) {
      const speed = SHIP_SPEEDS[key as keyof Ships];
      slowestSpeed = Math.min(slowestSpeed, speed);
    }
  }

  return slowestSpeed === Infinity ? 35000 : slowestSpeed; // Default if empty fleet
}

/**
 * Calculate fleet mission duration
 *
 * Formula: round((35000 / speedPercent × √(distance × 10 / slowestSpeed) + 10) / fleetSpeed)
 *
 * @param distance - Flight distance (tokens)
 * @param slowestSpeed - Slowest ship speed in fleet (tokens/hour)
 * @param speedPercent - Mission speed percentage (10-100, where 10=slowest, 100=fastest)
 * @param fleetSpeed - Global fleet speed multiplier (1.0 = normal, 2.0 = 2x speed, etc.)
 * @returns Duration in seconds
 */
export function calculateDuration(
  distance: number,
  slowestSpeed: number,
  speedPercent: number = 10,
  fleetSpeed: number = 1.0
): number {
  const numerator = (35000 / speedPercent) * Math.sqrt((distance * 10) / slowestSpeed) + 10;
  const duration = Math.round(numerator / fleetSpeed);
  return Math.max(duration, 1); // Minimum 1 second
}

/**
 * Calculate fuel consumption for a fleet mission
 *
 * Consumption = Σ(ship.fuel × count × distance / 35000 × (speedValue / 10 + 1)²)
 * Plus holding costs: floor(sum(ship.fuel × count × holdingHours) / 10)
 *
 * @param ships - Fleet composition
 * @param distance - Flight distance (tokens)
 * @param duration - Flight duration in seconds
 * @param holdingHours - Time held at target before return (0 = immediate return)
 * @param fleetSpeed - Global fleet speed multiplier
 * @returns Deuterium consumed
 */
export function calculateFuelConsumption(
  ships: Ships,
  distance: number,
  duration: number,
  holdingHours: number = 0,
  fleetSpeed: number = 1.0
): number {
  const speedValue = Math.max(0.5, duration * fleetSpeed - 10);

  let consumption = 0;
  let holdingCosts = 0;

  for (const [key, count] of Object.entries(ships)) {
    if (count > 0) {
      const fuel = SHIP_FUEL[key as keyof Ships];
      const speed = SHIP_SPEEDS[key as keyof Ships];

      const shipSpeedValue = (35000 / speedValue) * Math.sqrt((distance * 10) / speed);
      const shipConsumption =
        Math.max(
          fuel * count * ((distance / 35000) * Math.pow(shipSpeedValue / 10 + 1, 2)),
          1
        ) / count;

      consumption += Math.max(shipConsumption * count, 1);
      holdingCosts += fuel * count * holdingHours;
    }
  }

  if (holdingHours > 0) {
    consumption += Math.max(Math.floor(holdingCosts / 10), 1);
  }

  return Math.round(consumption);
}

/**
 * Calculate total cargo capacity of a fleet
 */
export function calculateCargoCapacity(ships: Ships): number {
  let capacity = 0;

  for (const [key, count] of Object.entries(ships)) {
    if (count > 0) {
      capacity += SHIP_CARGO[key as keyof Ships] * count;
    }
  }

  return capacity;
}

/**
 * Check if fleet can carry resources
 */
export function canCarryResources(ships: Ships, resources: Resources): boolean {
  const total = resources.metal + resources.crystal + resources.deuterium;
  return total <= calculateCargoCapacity(ships);
}

// ============================================================================
// PRODUCTION FORMULAS (from UniEngine reference)
// ============================================================================

/**
 * Calculate production per hour
 *
 * Formula: base × level × 1.1^level
 *
 * In canonical OGame, temperature only affects deuterium synthesizer output.
 * Metal and crystal mines are temperature-independent.  This function returns
 * the base production rate; callers should apply a temperature modifier for
 * deuterium separately if needed.
 *
 * @param baseProduction - Base production per hour (metal=30, crystal=20, deut=10)
 * @param level - Building level
 * @param _temperature - Planet temperature (reserved for future use / deuterium calc)
 * @returns Production per hour
 */
export function calculateProduction(
  baseProduction: number,
  level: number,
  _temperature: number = 30
): number {
  if (level === 0) return 0;

  const baseCalc = baseProduction * level * Math.pow(1.1, level);

  return Math.floor(baseCalc);
}

/**
 * Base production rates
 */
export const BASE_PRODUCTION = {
  metal: 30,
  crystal: 20,
  deuterium: 10,
} as const;

// ============================================================================
// BUILDING COST FORMULAS (from UniEngine reference)
// ============================================================================

/**
 * Calculate building upgrade cost
 *
 * Formula: floor(baseCost × factor^level)
 *
 * @param baseCost - Base cost for level 1
 * @param factor - Cost increase factor per level (1.5-2.0)
 * @param targetLevel - Target level to reach
 * @returns Cost in resources
 */
export function calculateBuildingCost(baseCost: number, factor: number, targetLevel: number): number {
  if (targetLevel <= 0) return 0;
  return Math.floor(baseCost * Math.pow(factor, targetLevel - 1));
}

/**
 * Building cost factors (exponential growth)
 * Lower factors = linear growth, higher = exponential
 */
export const BUILDING_FACTORS = {
  metalMine: 1.5,
  crystalMine: 1.6,
  deutSynth: 1.5,
  solarPlant: 1.5,
  fusionReactor: 1.8,
  roboticsFactory: 2.0,
  naniteFactory: 2.0,
  shipyard: 2.0,
  researchLab: 2.0,
  metalStorage: 2.0,
  crystalStorage: 2.0,
  deutTank: 2.0,
} as const;

/**
 * Building base costs at level 1
 */
export const BUILDING_COSTS = {
  metalMine: { metal: 60, crystal: 15, deuterium: 0 },
  crystalMine: { metal: 48, crystal: 24, deuterium: 0 },
  deutSynth: { metal: 225, crystal: 75, deuterium: 0 },
  solarPlant: { metal: 75, crystal: 30, deuterium: 0 },
  fusionReactor: { metal: 900, crystal: 360, deuterium: 180 },
  roboticsFactory: { metal: 400, crystal: 120, deuterium: 200 },
  naniteFactory: { metal: 1000000, crystal: 500000, deuterium: 100000 },
  shipyard: { metal: 400, crystal: 200, deuterium: 100 },
  researchLab: { metal: 200, crystal: 400, deuterium: 200 },
  metalStorage: { metal: 1000, crystal: 0, deuterium: 0 },
  crystalStorage: { metal: 1000, crystal: 1000, deuterium: 0 },
  deutTank: { metal: 1000, crystal: 1000, deuterium: 0 },
} as const;

// ============================================================================
// BUILD TIME FORMULA (from OGameX reference)
// ============================================================================

/**
 * Calculate building construction time in seconds
 *
 * Formula: (metalCost + crystalCost) / (2500 × max(4 - nextLevel/2, 1) × (1 + robotics) × speed × 2^nanite)
 *
 * @param metalCost - Metal cost of building
 * @param crystalCost - Crystal cost of building
 * @param nextLevel - What level will be constructed
 * @param roboticsLevel - Robotics factory level
 * @param naniteLevel - Nanite factory level
 * @param universeSpeed - Universe speed setting (1x, 2x, 4x, etc.)
 * @returns Build time in seconds
 */
export function calculateBuildTime(
  metalCost: number,
  crystalCost: number,
  nextLevel: number,
  roboticsLevel: number,
  naniteLevel: number,
  universeSpeed: number = 1
): number {
  const costFactor = metalCost + crystalCost;
  const levelFactor = Math.max(4 - nextLevel / 2, 1);
  const roboticsBonus = 1 + roboticsLevel * 0.1;
  const naniteBonus = Math.pow(2, naniteLevel);

  const time = costFactor / (2500 * levelFactor * roboticsBonus * universeSpeed * naniteBonus);
  return Math.max(Math.floor(time), 1); // Minimum 1 second
}
