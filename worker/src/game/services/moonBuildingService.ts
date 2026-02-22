/**
 * Moon Building Service — Lunar Base, Sensor Phalanx, Jump Gate
 *
 * Implements the 3 special buildings exclusive to moons.
 *
 * 1. Lunar Base (ID 41)
 *    - Each level adds +3 building fields to the moon
 *    - Unlocked from the start
 *    - Cost: low-medium (building resource costs scale normally)
 *
 * 2. Sensor Phalanx (ID 42)
 *    - Scans fleet movements at target planet
 *    - Detection range = level^2 systems (L1=1, L2=4, L3=9, L4=16, etc)
 *    - Scan duration: 24 hours per scan
 *    - Shows incoming and outgoing fleets to scanned player
 *    - Max 1 active scan per moon (new scan overwrites old)
 *    - Cost: high metal + crystal (espionage tech)
 *
 * 3. Jump Gate (ID 43)
 *    - Instant fleet transfer between player's own moons
 *    - 1-hour cooldown between jumps
 *    - Max range: 10 galaxies (any of your moons across universe)
 *    - Operating cost: negligible (state-based, no fuel)
 *    - Cost: high crystal + deuterium (advanced tech)
 */

import { MoonBuildingType } from '../types';

export interface MoonBuildingSpec {
  type: MoonBuildingType;
  baseMetal: number;
  baseCrystal: number;
  baseDeuterium: number;
  factor: number;           // Cost multiplier: next_cost = cost * factor^(level-1)
  buildTime: number;        // Base build time in seconds
}

export interface MoonBuildingCost {
  metal: number;
  crystal: number;
  deuterium: number;
  buildTime: number;        // Seconds
}

export interface MoonBuildings {
  lunarBase: number;
  sensorPhalanx: number;
  jumpGate: number;
}

// ============================================================================
// MOON BUILDING SPECIFICATIONS
// ============================================================================

const MOON_BUILDING_SPECS: Record<MoonBuildingType, MoonBuildingSpec> = {
  lunarBase: {
    type: 'lunarBase',
    baseMetal: 5000,
    baseCrystal: 2500,
    baseDeuterium: 0,
    factor: 2.0,           // Costs double each level
    buildTime: 3600,       // 1 hour base
  },
  sensorPhalanx: {
    type: 'sensorPhalanx',
    baseMetal: 10000,
    baseCrystal: 15000,
    baseDeuterium: 5000,
    factor: 1.8,
    buildTime: 14400,      // 4 hours base
  },
  jumpGate: {
    type: 'jumpGate',
    baseMetal: 20000,
    baseCrystal: 25000,
    baseDeuterium: 15000,
    factor: 2.1,
    buildTime: 28800,      // 8 hours base
  },
};

// ============================================================================
// COST & TIME CALCULATIONS
// ============================================================================

/**
 * Calculate cost to build a moon building to a given level
 *
 * Formula: baseCost × factor^(targetLevel - 1)
 * where factor is building-specific (1.8-2.1)
 */
export function calculateMoonBuildingCost(
  type: MoonBuildingType,
  targetLevel: number
): MoonBuildingCost {
  if (targetLevel < 1) {
    throw new Error(`Invalid target level: ${targetLevel}`);
  }

  const spec = MOON_BUILDING_SPECS[type];
  const factor = Math.pow(spec.factor, targetLevel - 1);

  return {
    metal: Math.floor(spec.baseMetal * factor),
    crystal: Math.floor(spec.baseCrystal * factor),
    deuterium: Math.floor(spec.baseDeuterium * factor),
    buildTime: spec.buildTime,
  };
}

/**
 * Calculate build time for a moon building based on costs and bonuses
 *
 * Formula: (metalCost + crystalCost) / (2500 × robotics_mod × nanite_mod × speed)
 * For now, assume 1x multipliers and speed=1
 */
export function calculateMoonBuildingBuildTime(
  type: MoonBuildingType,
  targetLevel: number,
  roboticsLevel: number = 0,
  naniteLevel: number = 0
): number {
  const cost = calculateMoonBuildingCost(type, targetLevel);

  // Robotics Factory: 2% per level
  const roboticsMod = 1 + roboticsLevel * 0.02;

  // Nanite Factory: 1% per level (stacks multiplicatively)
  const naniteMod = 1 + naniteLevel * 0.01;

  // Base formula: (metal + crystal) / 2500
  const baseTime = (cost.metal + cost.crystal) / 2500;
  const withModifiers = baseTime / (roboticsMod * naniteMod);

  return Math.ceil(withModifiers);
}

// ============================================================================
// FIELD CALCULATION
// ============================================================================

/**
 * Calculate total building fields available on moon
 *
 * Moon base fields: 3000-9000 (from creation)
 * Lunar Base bonus: +3 fields per level
 * Total available = base_fields + (lunar_base_level × 3)
 */
export function calculateMoonAvailableFields(
  baseMoonFields: number,
  lunarBaseLevel: number
): number {
  return baseMoonFields + lunarBaseLevel * 3;
}

// ============================================================================
// SENSOR PHALANX LOGIC
// ============================================================================

export interface SensorPhalanxScan {
  moonId: string;
  targetGalaxy: number;
  targetSystem: number;
  targetPosition: number;
  targetPlayerId: string;
  level: number;
  range: number;          // level^2
  detectedAt: number;     // Unix timestamp
  expiresAt: number;      // Unix timestamp (detectedAt + 24 hours)
}

/**
 * Calculate sensor phalanx detection range in systems
 *
 * Formula: range = level²
 * - Level 1: 1 system (immediate)
 * - Level 2: 4 systems (2×2 square)
 * - Level 3: 9 systems (3×3 square)
 * - Level 5: 25 systems (5×5 square)
 */
export function calculatePhalanxRange(level: number): number {
  return level * level;
}

/**
 * Check if target is within phalanx detection range
 *
 * Phalanx at [galaxy, system] can detect target at [t_galaxy, t_system] if:
 * - Same galaxy
 * - Distance in systems ≤ range (Euclidean distance ignored for simplicity)
 * - Within level² radius
 */
export function isPhalanxInRange(
  phalanxGalaxy: number,
  phalanxSystem: number,
  targetGalaxy: number,
  targetSystem: number,
  level: number
): boolean {
  // Different galaxy = out of range
  if (phalanxGalaxy !== targetGalaxy) {
    return false;
  }

  const range = calculatePhalanxRange(level);
  const distance = Math.abs(phalanxSystem - targetSystem);

  return distance <= range;
}

// ============================================================================
// JUMP GATE LOGIC
// ============================================================================

export interface JumpGateTransfer {
  moonIdFrom: string;
  moonIdTo: string;
  fleetId: string;
  transferredAt: number;    // Unix timestamp
  nextJumpAvailable: number; // Unix timestamp (transferredAt + 1 hour)
}

/**
 * Check if jump gate can perform a transfer
 *
 * Rules:
 * - Destination moon must be owned by same player
 * - At least 1 level in jump gate
 * - Must respect 1-hour cooldown
 */
export function validateJumpGateTransfer(
  sourceMoonLevel: number,
  lastJumpTime: number | null,
  currentTime: number
): { valid: boolean; reason?: string } {
  if (sourceMoonLevel < 1) {
    return { valid: false, reason: 'Jump Gate level 0 (not built)' };
  }

  if (lastJumpTime !== null) {
    const cooldownEnd = lastJumpTime + 3600; // 1 hour = 3600 seconds
    if (currentTime < cooldownEnd) {
      const remainingSeconds = Math.ceil(cooldownEnd - currentTime);
      return {
        valid: false,
        reason: `Jump Gate on cooldown for ${remainingSeconds}s more`,
      };
    }
  }

  return { valid: true };
}

// ============================================================================
// FIELD OCCUPANCY & VALIDATION
// ============================================================================

export interface MoonBuildingOccupancy {
  type: MoonBuildingType;
  level: number;
  occupiedFields: number;  // Buildings always occupy 1 field (simplified)
}

/**
 * Validate if moon has enough free fields to build
 *
 * Each building occupies 1 field (simplified OGame model)
 */
export function validateMoonBuildingSpace(
  availableFields: number,
  existingBuildings: MoonBuildingOccupancy[]
): { valid: boolean; usedFields: number; freeFields: number } {
  const usedFields = existingBuildings.length; // 1 field per building
  const freeFields = availableFields - usedFields;

  return {
    valid: freeFields > 0,
    usedFields,
    freeFields,
  };
}

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

/**
 * Get all moon building costs and requirements for a moon at given levels
 */
export function getMoonBuildingSummary(
  buildings: MoonBuildingLevels,
  baseMoonFields: number,
  roboticsLevel: number = 0,
  naniteLevel: number = 0
): {
  lunarBase: { level: number; cost: MoonBuildingCost; buildTime: number };
  sensorPhalanx: {
    level: number;
    cost: MoonBuildingCost;
    buildTime: number;
    range: number;
  };
  jumpGate: { level: number; cost: MoonBuildingCost; buildTime: number };
  availableFields: number;
} {
  return {
    lunarBase: {
      level: buildings.lunarBase,
      cost: calculateMoonBuildingCost('lunarBase', buildings.lunarBase + 1),
      buildTime: calculateMoonBuildingBuildTime('lunarBase', buildings.lunarBase + 1, roboticsLevel, naniteLevel),
    },
    sensorPhalanx: {
      level: buildings.sensorPhalanx,
      cost: calculateMoonBuildingCost('sensorPhalanx', buildings.sensorPhalanx + 1),
      buildTime: calculateMoonBuildingBuildTime('sensorPhalanx', buildings.sensorPhalanx + 1, roboticsLevel, naniteLevel),
      range: calculatePhalanxRange(buildings.sensorPhalanx),
    },
    jumpGate: {
      level: buildings.jumpGate,
      cost: calculateMoonBuildingCost('jumpGate', buildings.jumpGate + 1),
      buildTime: calculateMoonBuildingBuildTime('jumpGate', buildings.jumpGate + 1, roboticsLevel, naniteLevel),
    },
    availableFields: calculateMoonAvailableFields(baseMoonFields, buildings.lunarBase),
  };
}
