/**
 * universeSettingsService.ts
 *
 * Manages configurable universe settings such as speed multipliers
 * and game rules. Settings are stored in a single-row universe_settings
 * table and can be updated by admins.
 *
 * Default settings:
 *   - speed: 1 (resource production multiplier)
 *   - fleetSpeed: 1 (fleet travel speed multiplier)
 *   - researchSpeed: 1 (research completion speed multiplier)
 *   - maxGalaxies: 9 (number of galaxies)
 *   - maxSystems: 499 (systems per galaxy)
 *   - maxPositions: 15 (positions per system)
 *   - debrisRate: 0.3 (debris generation from battles)
 *   - defenseRepairRate: 0.7 (defense repair speed after attack)
 *   - newbieProtectionPoints: 5000 (threshold for newbie protection)
 *   - bashRuleAttacks: 6 (max attacks per target per 24h)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UniverseSettings {
  speed: number; // Resource production multiplier (1x, 2x, 4x, etc.)
  fleetSpeed: number; // Fleet travel speed multiplier
  researchSpeed: number; // Research completion speed multiplier
  maxGalaxies: number; // Number of galaxies (typically 9)
  maxSystems: number; // Systems per galaxy (typically 499)
  maxPositions: number; // Positions per system (typically 15)
  debrisRate: number; // Debris generation rate (0.0 to 1.0)
  defenseRepairRate: number; // Defense repair speed (0.0 to 1.0)
  newbieProtectionPoints: number; // Threshold for newbie protection
  bashRuleAttacks: number; // Max attacks per target per 24 hours
}

export const DEFAULT_UNIVERSE_SETTINGS: UniverseSettings = {
  speed: 1,
  fleetSpeed: 1,
  researchSpeed: 1,
  maxGalaxies: 9,
  maxSystems: 499,
  maxPositions: 15,
  debrisRate: 0.3,
  defenseRepairRate: 0.7,
  newbieProtectionPoints: 5000,
  bashRuleAttacks: 6,
};

// ---------------------------------------------------------------------------
// Service implementation
// ---------------------------------------------------------------------------

/**
 * Retrieve current universe settings from database.
 * Returns default settings if table is empty or doesn't exist.
 */
export async function getUniverseSettings(db: D1Database): Promise<UniverseSettings> {
  try {
    const result = await db
      .prepare(`SELECT settings FROM universe_settings LIMIT 1`)
      .first<{ settings: string }>();

    if (!result) {
      return DEFAULT_UNIVERSE_SETTINGS;
    }

    // Parse JSON from settings column
    const parsed = JSON.parse(result.settings) as UniverseSettings;
    // Merge with defaults to ensure all fields present
    return {
      ...DEFAULT_UNIVERSE_SETTINGS,
      ...parsed,
    };
  } catch (error) {
    // If table doesn't exist or parse fails, return defaults
    console.warn('Failed to fetch universe settings, using defaults:', error);
    return DEFAULT_UNIVERSE_SETTINGS;
  }
}

/**
 * Update universe settings (admin-only).
 * Validates input and stores as JSON in database.
 */
export async function updateUniverseSettings(
  db: D1Database,
  settings: Partial<UniverseSettings>,
  adminId?: string
): Promise<UniverseSettings> {
  // Note: In production, verify adminId is admin. For now, allow updates.
  if (adminId) {
    console.log(`Admin ${adminId} updating universe settings`);
  }

  // Get current settings and merge
  const current = await getUniverseSettings(db);
  const updated = {
    ...current,
    ...settings,
  };

  // Validate ranges
  if (updated.speed <= 0 || updated.speed > 100) {
    throw new Error('Speed must be between 0 and 100');
  }
  if (updated.fleetSpeed <= 0 || updated.fleetSpeed > 100) {
    throw new Error('Fleet speed must be between 0 and 100');
  }
  if (updated.researchSpeed <= 0 || updated.researchSpeed > 100) {
    throw new Error('Research speed must be between 0 and 100');
  }
  if (updated.maxGalaxies < 1 || updated.maxGalaxies > 9) {
    throw new Error('Max galaxies must be between 1 and 9');
  }
  if (updated.maxSystems < 1 || updated.maxSystems > 499) {
    throw new Error('Max systems must be between 1 and 499');
  }
  if (updated.maxPositions < 1 || updated.maxPositions > 15) {
    throw new Error('Max positions must be between 1 and 15');
  }
  if (updated.debrisRate < 0 || updated.debrisRate > 1) {
    throw new Error('Debris rate must be between 0 and 1');
  }
  if (updated.defenseRepairRate < 0 || updated.defenseRepairRate > 1) {
    throw new Error('Defense repair rate must be between 0 and 1');
  }
  if (updated.newbieProtectionPoints < 0) {
    throw new Error('Newbie protection points must be non-negative');
  }
  if (updated.bashRuleAttacks < 0) {
    throw new Error('Bash rule attacks must be non-negative');
  }

  // Upsert: delete old row and insert new one (since we use a single row)
  await db.prepare(`DELETE FROM universe_settings`).run();
  await db
    .prepare(
      `INSERT INTO universe_settings (id, settings, updated_at)
       VALUES (?, ?, ?)`
    )
    .bind('singleton', JSON.stringify(updated), Math.floor(Date.now() / 1000))
    .run();

  return updated;
}

/**
 * Reset settings to defaults
 */
export async function resetUniverseSettings(db: D1Database): Promise<UniverseSettings> {
  await db.prepare(`DELETE FROM universe_settings`).run();
  await db
    .prepare(
      `INSERT INTO universe_settings (id, settings, updated_at)
       VALUES (?, ?, ?)`
    )
    .bind('singleton', JSON.stringify(DEFAULT_UNIVERSE_SETTINGS), Math.floor(Date.now() / 1000))
    .run();

  return DEFAULT_UNIVERSE_SETTINGS;
}

// ---------------------------------------------------------------------------
// Export for services/index.ts
// ---------------------------------------------------------------------------

export const universeSettingsService = {
  getUniverseSettings,
  updateUniverseSettings,
  resetUniverseSettings,
  DEFAULT_UNIVERSE_SETTINGS,
};
