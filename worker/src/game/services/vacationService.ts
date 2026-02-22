/**
 * vacationService.ts
 *
 * Vacation mode provides player protection while away.
 *
 * Features:
 *  - Minimum 2-day vacation period
 *  - Cannot be attacked while on vacation
 *  - Cannot send fleets, build, or research while on vacation
 *  - Production stops while on vacation
 *  - Fleet missions in progress complete but resources aren't added
 *
 * Requirements to enable vacation:
 *  - No active fleet missions (in_transit or arrived)
 *  - No active research
 *  - No active buildings being built
 */

// ============================================================================
// TYPES
// ============================================================================

export interface VacationInfo {
  isOnVacation: boolean;
  vacationStart: number | null;      // unix seconds
  vacationMinEnd: number | null;     // unix seconds minimum end time
  daysRemaining: number | null;
}

export interface VacationStatus {
  canEnable: boolean;
  canDisable: boolean;
  reason?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const MIN_VACATION_DAYS = 2;
const SECONDS_PER_DAY = 86400;
const MIN_VACATION_SECONDS = MIN_VACATION_DAYS * SECONDS_PER_DAY;

// ============================================================================
// VACATION SERVICE
// ============================================================================

/**
 * Enable vacation mode for a player.
 *
 * Requirements:
 *  - No fleet missions in transit or arrived
 *  - No active research
 *  - No buildings being built
 *
 * Sets vacation_start = now, vacation_min_end = now + 2 days
 */
export async function enableVacationMode(
  db: D1Database,
  playerId: string
): Promise<{ success: boolean; reason?: string }> {
  try {
    // Check for active fleet missions
    const activeFleets = await db
      .prepare(
        `SELECT COUNT(*) as count FROM fleet_missions
         WHERE player_id = ? AND mission_status IN ('in_transit', 'arrived')`
      )
      .bind(playerId)
      .first<{ count: number }>();

    if (activeFleets?.count && activeFleets.count > 0) {
      return { success: false, reason: 'Cannot enable vacation while fleet missions are active' };
    }

    // Check for active research
    const activeResearch = await db
      .prepare(
        `SELECT COUNT(*) as count FROM player_research_queue
         WHERE player_id = ? AND completed_at IS NULL`
      )
      .bind(playerId)
      .first<{ count: number }>();

    if (activeResearch?.count && activeResearch.count > 0) {
      return { success: false, reason: 'Cannot enable vacation while research is active' };
    }

    // Check for active builds
    const activeBuilds = await db
      .prepare(
        `SELECT COUNT(*) as count FROM planet_build_queue
         WHERE planet_id IN (SELECT id FROM planets WHERE player_id = ?)
         AND completed_at IS NULL`
      )
      .bind(playerId)
      .first<{ count: number }>();

    if (activeBuilds?.count && activeBuilds.count > 0) {
      return { success: false, reason: 'Cannot enable vacation while buildings are being built' };
    }

    // Enable vacation mode
    const now = Math.floor(Date.now() / 1000);
    const minEnd = now + MIN_VACATION_SECONDS;

    await db
      .prepare(
        `UPDATE players
         SET vacation_start = ?, vacation_min_end = ?
         WHERE id = ?`
      )
      .bind(now, minEnd, playerId)
      .run();

    return { success: true };
  } catch (error) {
    console.error('Error enabling vacation mode:', error);
    return { success: false, reason: 'Database error' };
  }
}

/**
 * Disable vacation mode for a player.
 *
 * Requirements:
 *  - Must be on vacation
 *  - Minimum period must have elapsed (2 days since start)
 */
export async function disableVacationMode(
  db: D1Database,
  playerId: string
): Promise<{ success: boolean; reason?: string }> {
  try {
    const player = await db
      .prepare(`SELECT vacation_start, vacation_min_end FROM players WHERE id = ?`)
      .bind(playerId)
      .first<{ vacation_start: number | null; vacation_min_end: number | null }>();

    if (!player) {
      return { success: false, reason: 'Player not found' };
    }

    if (!player.vacation_start) {
      return { success: false, reason: 'Player is not on vacation' };
    }

    const now = Math.floor(Date.now() / 1000);
    if (player.vacation_min_end && now < player.vacation_min_end) {
      const daysLeft = Math.ceil((player.vacation_min_end - now) / SECONDS_PER_DAY);
      return {
        success: false,
        reason: `Cannot disable vacation for ${daysLeft} more day(s)`,
      };
    }

    // Disable vacation mode
    await db
      .prepare(
        `UPDATE players
         SET vacation_start = NULL, vacation_min_end = NULL
         WHERE id = ?`
      )
      .bind(playerId)
      .run();

    return { success: true };
  } catch (error) {
    console.error('Error disabling vacation mode:', error);
    return { success: false, reason: 'Database error' };
  }
}

/**
 * Check if a player is currently on vacation.
 */
export async function isOnVacation(db: D1Database, playerId: string): Promise<boolean> {
  try {
    const player = await db
      .prepare(`SELECT vacation_start FROM players WHERE id = ?`)
      .bind(playerId)
      .first<{ vacation_start: number | null }>();

    return player?.vacation_start !== null && player?.vacation_start !== undefined;
  } catch (error) {
    console.error('Error checking vacation status:', error);
    return false;
  }
}

/**
 * Get detailed vacation information for a player.
 */
export async function getVacationInfo(db: D1Database, playerId: string): Promise<VacationInfo> {
  try {
    const player = await db
      .prepare(
        `SELECT vacation_start, vacation_min_end FROM players WHERE id = ?`
      )
      .bind(playerId)
      .first<{ vacation_start: number | null; vacation_min_end: number | null }>();

    if (!player || !player.vacation_start) {
      return {
        isOnVacation: false,
        vacationStart: null,
        vacationMinEnd: null,
        daysRemaining: null,
      };
    }

    const now = Math.floor(Date.now() / 1000);
    const daysRemaining = player.vacation_min_end
      ? Math.max(0, Math.ceil((player.vacation_min_end - now) / SECONDS_PER_DAY))
      : 0;

    return {
      isOnVacation: true,
      vacationStart: player.vacation_start,
      vacationMinEnd: player.vacation_min_end,
      daysRemaining,
    };
  } catch (error) {
    console.error('Error getting vacation info:', error);
    return {
      isOnVacation: false,
      vacationStart: null,
      vacationMinEnd: null,
      daysRemaining: null,
    };
  }
}

/**
 * Check if vacation can be enabled or disabled, and get reason if not.
 */
export async function checkVacationStatus(
  db: D1Database,
  playerId: string
): Promise<VacationStatus> {
  try {
    const player = await db
      .prepare(`SELECT vacation_start FROM players WHERE id = ?`)
      .bind(playerId)
      .first<{ vacation_start: number | null }>();

    if (!player) {
      return {
        canEnable: false,
        canDisable: false,
        reason: 'Player not found',
      };
    }

    const isVacation = player.vacation_start !== null && player.vacation_start !== undefined;

    // Check if can disable
    if (isVacation) {
      const vacationInfo = await getVacationInfo(db, playerId);
      const canDisable = !vacationInfo.daysRemaining || vacationInfo.daysRemaining <= 0;
      return {
        canEnable: false,
        canDisable,
        reason: !canDisable ? 'Minimum vacation period not elapsed' : undefined,
      };
    }

    // Check if can enable
    const activeFleets = await db
      .prepare(
        `SELECT COUNT(*) as count FROM fleet_missions
         WHERE player_id = ? AND mission_status IN ('in_transit', 'arrived')`
      )
      .bind(playerId)
      .first<{ count: number }>();

    if (activeFleets?.count && activeFleets.count > 0) {
      return {
        canEnable: false,
        canDisable: false,
        reason: 'Cannot enable vacation while fleet missions are active',
      };
    }

    const activeResearch = await db
      .prepare(
        `SELECT COUNT(*) as count FROM player_research_queue
         WHERE player_id = ? AND completed_at IS NULL`
      )
      .bind(playerId)
      .first<{ count: number }>();

    if (activeResearch?.count && activeResearch.count > 0) {
      return {
        canEnable: false,
        canDisable: false,
        reason: 'Cannot enable vacation while research is active',
      };
    }

    const activeBuilds = await db
      .prepare(
        `SELECT COUNT(*) as count FROM planet_build_queue
         WHERE planet_id IN (SELECT id FROM planets WHERE player_id = ?)
         AND completed_at IS NULL`
      )
      .bind(playerId)
      .first<{ count: number }>();

    if (activeBuilds?.count && activeBuilds.count > 0) {
      return {
        canEnable: false,
        canDisable: false,
        reason: 'Cannot enable vacation while buildings are being built',
      };
    }

    return {
      canEnable: true,
      canDisable: false,
    };
  } catch (error) {
    console.error('Error checking vacation status:', error);
    return {
      canEnable: false,
      canDisable: false,
      reason: 'Database error',
    };
  }
}
