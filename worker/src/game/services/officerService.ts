/**
 * Officer Service
 *
 * OGame-style officers that provide passive bonuses while active.
 * Each officer costs dark matter and lasts for a configurable duration.
 *
 * Officer types:
 *  - Commander:  +1 build queue slot, fleet shortcuts
 *  - Admiral:    +1 fleet slot, fleet recall
 *  - Engineer:   -50% defense repair time, +10% energy production
 *  - Geologist:  +10% mine production (metal, crystal, deuterium)
 *  - Technocrat: +2 espionage levels, +25% research speed
 *
 * All bonus calculations are pure functions that integrate with existing
 * production, research, fleet, and battle formulas.
 */

import type {
  OfficerType,
  OfficerDefinition,
  OfficerBonuses,
  ActiveOfficer,
} from '../types';

// ============================================================================
// OFFICER DEFINITIONS
// ============================================================================

export const OFFICER_DEFINITIONS: Record<OfficerType, OfficerDefinition> = {
  commander: {
    type: 'commander',
    name: 'Commander',
    description: '+1 build queue slot, fleet shortcuts enabled.',
    cost: 3000,
    durationDays: 7,
    bonuses: {
      buildQueueSlots: 1,
      fleetShortcuts: true,
    },
  },
  admiral: {
    type: 'admiral',
    name: 'Admiral',
    description: '+1 fleet slot, fleet recall enabled.',
    cost: 3000,
    durationDays: 7,
    bonuses: {
      fleetSlots: 1,
      fleetRecall: true,
    },
  },
  engineer: {
    type: 'engineer',
    name: 'Engineer',
    description: '-50% defense repair time, +10% energy production.',
    cost: 3000,
    durationDays: 7,
    bonuses: {
      defenseRepairFactor: 0.5,
      energyProductionBonus: 0.10,
    },
  },
  geologist: {
    type: 'geologist',
    name: 'Geologist',
    description: '+10% mine production (metal, crystal, deuterium).',
    cost: 3000,
    durationDays: 7,
    bonuses: {
      mineProductionBonus: 0.10,
    },
  },
  technocrat: {
    type: 'technocrat',
    name: 'Technocrat',
    description: '+2 espionage tech levels, +25% research speed.',
    cost: 3000,
    durationDays: 7,
    bonuses: {
      espionageLevelBonus: 2,
      researchSpeedBonus: 0.25,
    },
  },
};

export const OFFICER_TYPES: OfficerType[] = [
  'commander',
  'admiral',
  'engineer',
  'geologist',
  'technocrat',
];

// ============================================================================
// PURE FUNCTIONS (no D1 dependency — testable & composable)
// ============================================================================

/**
 * Check if an officer is currently active based on timestamps.
 */
export function isOfficerActive(officer: ActiveOfficer, nowSeconds?: number): boolean {
  const now = nowSeconds ?? Math.floor(Date.now() / 1000);
  return officer.expiresAt > now;
}

/**
 * Get the definition for an officer type.
 */
export function getOfficerDefinition(type: OfficerType): OfficerDefinition {
  return OFFICER_DEFINITIONS[type];
}

/**
 * Calculate the expiry timestamp for a newly activated officer.
 */
export function calculateExpiry(activatedAt: number, durationDays: number): number {
  return activatedAt + durationDays * 86400;
}

/**
 * Merge bonuses from multiple active officers into a single OfficerBonuses object.
 * Numeric bonuses are summed; boolean bonuses are OR-ed.
 */
export function mergeOfficerBonuses(officers: ActiveOfficer[], nowSeconds?: number): OfficerBonuses {
  const now = nowSeconds ?? Math.floor(Date.now() / 1000);
  const merged: OfficerBonuses = {};

  for (const officer of officers) {
    if (!isOfficerActive(officer, now)) continue;
    const def = OFFICER_DEFINITIONS[officer.officerType];
    if (!def) continue;
    const b = def.bonuses;

    // Numeric bonuses: sum
    if (b.buildQueueSlots !== undefined) {
      merged.buildQueueSlots = (merged.buildQueueSlots ?? 0) + b.buildQueueSlots;
    }
    if (b.fleetSlots !== undefined) {
      merged.fleetSlots = (merged.fleetSlots ?? 0) + b.fleetSlots;
    }
    if (b.defenseRepairFactor !== undefined) {
      // Take the best (lowest) repair factor
      merged.defenseRepairFactor = Math.min(
        merged.defenseRepairFactor ?? 1.0,
        b.defenseRepairFactor
      );
    }
    if (b.energyProductionBonus !== undefined) {
      merged.energyProductionBonus = (merged.energyProductionBonus ?? 0) + b.energyProductionBonus;
    }
    if (b.mineProductionBonus !== undefined) {
      merged.mineProductionBonus = (merged.mineProductionBonus ?? 0) + b.mineProductionBonus;
    }
    if (b.espionageLevelBonus !== undefined) {
      merged.espionageLevelBonus = (merged.espionageLevelBonus ?? 0) + b.espionageLevelBonus;
    }
    if (b.researchSpeedBonus !== undefined) {
      merged.researchSpeedBonus = (merged.researchSpeedBonus ?? 0) + b.researchSpeedBonus;
    }

    // Boolean bonuses: OR
    if (b.fleetShortcuts) merged.fleetShortcuts = true;
    if (b.fleetRecall) merged.fleetRecall = true;
  }

  return merged;
}

// ============================================================================
// BONUS APPLICATION HELPERS (pure functions for integration with formulas)
// ============================================================================

/**
 * Apply mine production bonus to base production.
 * Returns the new production value.
 *
 * @param baseProduction - Base production per hour (from calculateProduction)
 * @param bonuses - Merged officer bonuses
 * @returns Adjusted production value
 */
export function applyMineProductionBonus(baseProduction: number, bonuses: OfficerBonuses): number {
  const bonus = bonuses.mineProductionBonus ?? 0;
  return Math.floor(baseProduction * (1 + bonus));
}

/**
 * Apply energy production bonus.
 *
 * @param baseEnergy - Base energy production
 * @param bonuses - Merged officer bonuses
 * @returns Adjusted energy value
 */
export function applyEnergyProductionBonus(baseEnergy: number, bonuses: OfficerBonuses): number {
  const bonus = bonuses.energyProductionBonus ?? 0;
  return Math.floor(baseEnergy * (1 + bonus));
}

/**
 * Apply research speed bonus. Returns the adjusted research time in seconds.
 * A researchSpeedBonus of 0.25 means +25% speed, i.e. time / 1.25.
 *
 * @param baseTimeSeconds - Base research time in seconds
 * @param bonuses - Merged officer bonuses
 * @returns Adjusted research time in seconds (minimum 1)
 */
export function applyResearchSpeedBonus(baseTimeSeconds: number, bonuses: OfficerBonuses): number {
  const bonus = bonuses.researchSpeedBonus ?? 0;
  if (bonus <= 0) return baseTimeSeconds;
  return Math.max(1, Math.floor(baseTimeSeconds / (1 + bonus)));
}

/**
 * Get effective espionage tech level with officer bonus.
 *
 * @param baseTechLevel - Player's espionage tech level
 * @param bonuses - Merged officer bonuses
 * @returns Effective espionage tech level
 */
export function getEffectiveEspionageLevel(baseTechLevel: number, bonuses: OfficerBonuses): number {
  return baseTechLevel + (bonuses.espionageLevelBonus ?? 0);
}

/**
 * Apply defense repair factor. Returns adjusted repair time.
 *
 * @param baseRepairTime - Base defense repair time in seconds
 * @param bonuses - Merged officer bonuses
 * @returns Adjusted repair time (minimum 1)
 */
export function applyDefenseRepairBonus(baseRepairTime: number, bonuses: OfficerBonuses): number {
  const factor = bonuses.defenseRepairFactor ?? 1.0;
  return Math.max(1, Math.floor(baseRepairTime * factor));
}

/**
 * Get total build queue slots (base + officer bonus).
 *
 * @param baseSlots - Default build queue slots (usually 1)
 * @param bonuses - Merged officer bonuses
 * @returns Total build queue slots
 */
export function getTotalBuildQueueSlots(baseSlots: number, bonuses: OfficerBonuses): number {
  return baseSlots + (bonuses.buildQueueSlots ?? 0);
}

/**
 * Get total fleet slots (base from computer tech + officer bonus).
 *
 * @param baseSlots - Fleet slots from computer tech (computerTech + 1)
 * @param bonuses - Merged officer bonuses
 * @returns Total fleet slots
 */
export function getTotalFleetSlots(baseSlots: number, bonuses: OfficerBonuses): number {
  return baseSlots + (bonuses.fleetSlots ?? 0);
}

/**
 * Check if fleet recall is enabled by officer bonuses.
 */
export function hasFleetRecall(bonuses: OfficerBonuses): boolean {
  return bonuses.fleetRecall === true;
}

/**
 * Check if fleet shortcuts are enabled by officer bonuses.
 */
export function hasFleetShortcuts(bonuses: OfficerBonuses): boolean {
  return bonuses.fleetShortcuts === true;
}

// ============================================================================
// D1 DATABASE FUNCTIONS
// ============================================================================

interface OfficerRow {
  id: string;
  player_id: string;
  officer_type: string;
  activated_at: number;
  expires_at: number;
}

function rowToActiveOfficer(row: OfficerRow): ActiveOfficer {
  return {
    id: row.id,
    playerId: row.player_id,
    officerType: row.officer_type as OfficerType,
    activatedAt: row.activated_at,
    expiresAt: row.expires_at,
  };
}

/**
 * Activate an officer for a player.
 * If the officer type is already active, extends the duration from the current expiry.
 *
 * @param playerId - Player who activates the officer
 * @param officerType - Type of officer to activate
 * @param db - D1 database binding
 * @returns The activated officer record
 */
export async function activateOfficer(
  playerId: string,
  officerType: OfficerType,
  db: D1Database
): Promise<ActiveOfficer> {
  const def = OFFICER_DEFINITIONS[officerType];
  if (!def) {
    throw new Error(`Unknown officer type: ${officerType}`);
  }

  const nowSec = Math.floor(Date.now() / 1000);

  // Check if officer is already active
  const existing = await db
    .prepare(
      'SELECT * FROM officers WHERE player_id = ? AND officer_type = ? AND expires_at > ?'
    )
    .bind(playerId, officerType, nowSec)
    .first() as OfficerRow | null;

  if (existing) {
    // Extend duration from current expiry
    const newExpiry = existing.expires_at + def.durationDays * 86400;
    await db
      .prepare('UPDATE officers SET expires_at = ? WHERE id = ?')
      .bind(newExpiry, existing.id)
      .run();

    return {
      ...rowToActiveOfficer(existing),
      expiresAt: newExpiry,
    };
  }

  // Create new activation
  const id = crypto.randomUUID();
  const expiresAt = calculateExpiry(nowSec, def.durationDays);

  await db
    .prepare(
      'INSERT INTO officers (id, player_id, officer_type, activated_at, expires_at) VALUES (?, ?, ?, ?, ?)'
    )
    .bind(id, playerId, officerType, nowSec, expiresAt)
    .run();

  return {
    id,
    playerId,
    officerType,
    activatedAt: nowSec,
    expiresAt,
  };
}

/**
 * Deactivate (expire) an officer for a player immediately.
 *
 * @param playerId - Player who deactivates the officer
 * @param officerType - Type of officer to deactivate
 * @param db - D1 database binding
 * @returns true if an officer was deactivated, false if none was active
 */
export async function deactivateOfficer(
  playerId: string,
  officerType: OfficerType,
  db: D1Database
): Promise<boolean> {
  const nowSec = Math.floor(Date.now() / 1000);

  const result = await db
    .prepare(
      'UPDATE officers SET expires_at = ? WHERE player_id = ? AND officer_type = ? AND expires_at > ?'
    )
    .bind(nowSec, playerId, officerType, nowSec)
    .run();

  return (result.meta?.changes ?? 0) > 0;
}

/**
 * Get all currently active officers for a player.
 *
 * @param playerId - Player ID
 * @param db - D1 database binding
 * @returns Array of active officers
 */
export async function getActiveOfficers(
  playerId: string,
  db: D1Database
): Promise<ActiveOfficer[]> {
  const nowSec = Math.floor(Date.now() / 1000);

  const rows = await db
    .prepare(
      'SELECT * FROM officers WHERE player_id = ? AND expires_at > ? ORDER BY officer_type'
    )
    .bind(playerId, nowSec)
    .all();

  return (rows.results as unknown as OfficerRow[]).map(rowToActiveOfficer);
}

/**
 * Get the merged bonuses from all active officers for a player.
 * This is the main integration point — call this and pass bonuses to formula helpers.
 *
 * @param playerId - Player ID
 * @param db - D1 database binding
 * @returns Merged officer bonuses
 */
export async function getOfficerBonuses(
  playerId: string,
  db: D1Database
): Promise<OfficerBonuses> {
  const officers = await getActiveOfficers(playerId, db);
  return mergeOfficerBonuses(officers);
}

/**
 * Check if a player has a specific officer active.
 *
 * @param playerId - Player ID
 * @param officerType - Officer type to check
 * @param db - D1 database binding
 * @returns true if the officer is active
 */
export async function hasOfficer(
  playerId: string,
  officerType: OfficerType,
  db: D1Database
): Promise<boolean> {
  const nowSec = Math.floor(Date.now() / 1000);

  const row = await db
    .prepare(
      'SELECT 1 FROM officers WHERE player_id = ? AND officer_type = ? AND expires_at > ? LIMIT 1'
    )
    .bind(playerId, officerType, nowSec)
    .first();

  return row !== null;
}

/**
 * Get all officer activations for a player (including expired).
 * Useful for history display.
 *
 * @param playerId - Player ID
 * @param db - D1 database binding
 * @returns Array of all officer records
 */
export async function getOfficerHistory(
  playerId: string,
  db: D1Database
): Promise<ActiveOfficer[]> {
  const rows = await db
    .prepare(
      'SELECT * FROM officers WHERE player_id = ? ORDER BY activated_at DESC'
    )
    .bind(playerId)
    .all();

  return (rows.results as unknown as OfficerRow[]).map(rowToActiveOfficer);
}

// ============================================================================
// CONVENIENCE CLASS WRAPPER
// ============================================================================

export class OfficerService {
  /** Get all officer definitions */
  getDefinitions(): OfficerDefinition[] {
    return Object.values(OFFICER_DEFINITIONS);
  }

  /** Get definition for a specific officer type */
  getDefinition(type: OfficerType): OfficerDefinition {
    return getOfficerDefinition(type);
  }

  /** Activate an officer for a player */
  async activate(playerId: string, officerType: OfficerType, db: D1Database): Promise<ActiveOfficer> {
    return activateOfficer(playerId, officerType, db);
  }

  /** Deactivate an officer for a player */
  async deactivate(playerId: string, officerType: OfficerType, db: D1Database): Promise<boolean> {
    return deactivateOfficer(playerId, officerType, db);
  }

  /** Get all active officers for a player */
  async getActive(playerId: string, db: D1Database): Promise<ActiveOfficer[]> {
    return getActiveOfficers(playerId, db);
  }

  /** Get merged bonuses for a player */
  async getBonuses(playerId: string, db: D1Database): Promise<OfficerBonuses> {
    return getOfficerBonuses(playerId, db);
  }

  /** Check if player has a specific officer */
  async has(playerId: string, officerType: OfficerType, db: D1Database): Promise<boolean> {
    return hasOfficer(playerId, officerType, db);
  }

  /** Get officer activation history */
  async getHistory(playerId: string, db: D1Database): Promise<ActiveOfficer[]> {
    return getOfficerHistory(playerId, db);
  }

  // --- Pure bonus application helpers ---

  applyMineProductionBonus(base: number, bonuses: OfficerBonuses): number {
    return applyMineProductionBonus(base, bonuses);
  }

  applyEnergyProductionBonus(base: number, bonuses: OfficerBonuses): number {
    return applyEnergyProductionBonus(base, bonuses);
  }

  applyResearchSpeedBonus(baseTime: number, bonuses: OfficerBonuses): number {
    return applyResearchSpeedBonus(baseTime, bonuses);
  }

  getEffectiveEspionageLevel(baseLevel: number, bonuses: OfficerBonuses): number {
    return getEffectiveEspionageLevel(baseLevel, bonuses);
  }

  applyDefenseRepairBonus(baseTime: number, bonuses: OfficerBonuses): number {
    return applyDefenseRepairBonus(baseTime, bonuses);
  }

  getTotalBuildQueueSlots(baseSlots: number, bonuses: OfficerBonuses): number {
    return getTotalBuildQueueSlots(baseSlots, bonuses);
  }

  getTotalFleetSlots(baseSlots: number, bonuses: OfficerBonuses): number {
    return getTotalFleetSlots(baseSlots, bonuses);
  }

  hasFleetRecall(bonuses: OfficerBonuses): boolean {
    return hasFleetRecall(bonuses);
  }

  hasFleetShortcuts(bonuses: OfficerBonuses): boolean {
    return hasFleetShortcuts(bonuses);
  }
}

/** Singleton instance for global use */
export const officerService = new OfficerService();
