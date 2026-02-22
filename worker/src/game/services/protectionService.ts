/**
 * protectionService.ts
 *
 * Implements gameplay protection rules:
 * 1. Newbie Protection: Players under 5000 points cannot be attacked by players 5x stronger
 * 2. Bash Rule: Max 6 attacks on the same target per 24 hours
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProtectionCheckResult {
  canAttack: boolean;
  reason?: string;
}

export interface AttackLog {
  id: string;
  attackerId: string;
  defenderId: string;
  timestamp: number; // unix seconds
}

// ---------------------------------------------------------------------------
// Helper: Get player score (economy + research + fleet)
// ---------------------------------------------------------------------------

async function getPlayerScore(playerId: string, db: D1Database): Promise<number> {
  // Economy score: sum of max building level × 1000 per planet
  const economyResult = await db
    .prepare(
      `SELECT COALESCE(SUM(max_level * 1000), 0) AS economy
       FROM (
         SELECT bh.planet_id, bh.building_id, MAX(bh.level) AS max_level
         FROM build_history bh
         JOIN planets p ON p.id = bh.planet_id
         WHERE p.player_id = ?
         GROUP BY bh.planet_id, bh.building_id
       )`
    )
    .bind(playerId)
    .first<{ economy: number }>();

  const economy = economyResult?.economy ?? 0;

  // Research score: sum of tech levels × 2000
  let research = 0;
  try {
    const researchResult = await db
      .prepare(
        `SELECT COALESCE(SUM(level * 2000), 0) AS research
         FROM player_research
         WHERE player_id = ?`
      )
      .bind(playerId)
      .first<{ research: number }>();

    research = researchResult?.research ?? 0;
  } catch {
    // Table may not exist
    research = 0;
  }

  // Fleet score: total ships × 500
  const fleetResult = await db
    .prepare(
      `SELECT COALESCE(
         SUM(
           light_fighter + heavy_fighter + cruiser + battleship +
           battlecruiser + bomber + destroyer + deathstar +
           small_cargo + large_cargo + colony_ship + recycler +
           espionage_probe
         ) * 500, 0
       ) AS fleet
       FROM fleets
       WHERE player_id = ?`
    )
    .bind(playerId)
    .first<{ fleet: number }>();

  const fleet = fleetResult?.fleet ?? 0;

  return economy + research + fleet;
}

// ---------------------------------------------------------------------------
// Newbie Protection
// ---------------------------------------------------------------------------

/**
 * Check if defender is protected from this attacker.
 * Newbie protection: defender under 5000 points AND attacker > 5x defender's score
 */
export async function isNewbieProtected(
  attackerScore: number,
  defenderScore: number
): Promise<boolean> {
  const NEWBIE_THRESHOLD = 5000;
  const STRENGTH_MULTIPLIER = 5;

  // Defender must be under threshold
  if (defenderScore >= NEWBIE_THRESHOLD) {
    return false;
  }

  // Attacker must be strong enough to break protection
  if (attackerScore > defenderScore * STRENGTH_MULTIPLIER) {
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Bash Rule (Max 6 attacks per 24h on same target)
// ---------------------------------------------------------------------------

/**
 * Count attacks on a target in the last 24 hours
 */
async function countRecentAttacks(
  db: D1Database,
  attackerId: string,
  defenderId: string,
  hours: number = 24
): Promise<number> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const cutoffSeconds = nowSeconds - hours * 3600;

  const result = await db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM attack_log
       WHERE attacker_id = ? AND defender_id = ? AND timestamp > ?`
    )
    .bind(attackerId, defenderId, cutoffSeconds)
    .first<{ count: number }>();

  return result?.count ?? 0;
}

/**
 * Check if attacker has exceeded bash limit on this defender
 */
export async function checkBashRule(
  db: D1Database,
  attackerId: string,
  defenderId: string
): Promise<ProtectionCheckResult> {
  const BASH_LIMIT = 6;
  const BASH_WINDOW_HOURS = 24;

  const recentAttacks = await countRecentAttacks(db, attackerId, defenderId, BASH_WINDOW_HOURS);

  if (recentAttacks >= BASH_LIMIT) {
    return {
      canAttack: false,
      reason: `Bash rule: Max ${BASH_LIMIT} attacks per ${BASH_WINDOW_HOURS}h on same target. You have ${recentAttacks} attacks on this player.`,
    };
  }

  return { canAttack: true };
}

// ---------------------------------------------------------------------------
// Attack logging
// ---------------------------------------------------------------------------

/**
 * Record an attack attempt for bash rule tracking
 */
export async function logAttack(
  db: D1Database,
  attackerId: string,
  defenderId: string
): Promise<void> {
  const id = `${attackerId}-${defenderId}-${Date.now()}`;
  const timestamp = Math.floor(Date.now() / 1000);

  await db
    .prepare(
      `INSERT INTO attack_log (id, attacker_id, defender_id, timestamp)
       VALUES (?, ?, ?, ?)`
    )
    .bind(id, attackerId, defenderId, timestamp)
    .run();
}

// ---------------------------------------------------------------------------
// Main protection check
// ---------------------------------------------------------------------------

/**
 * Comprehensive attack validation
 * Returns { canAttack: boolean, reason?: string }
 */
export async function canAttack(
  db: D1Database,
  attackerId: string,
  defenderId: string
): Promise<ProtectionCheckResult> {
  // Skip if same player (shouldn't happen, but just in case)
  if (attackerId === defenderId) {
    return {
      canAttack: false,
      reason: 'Cannot attack yourself',
    };
  }

  try {
    // Check bash rule first (faster DB query)
    const bashCheck = await checkBashRule(db, attackerId, defenderId);
    if (!bashCheck.canAttack) {
      return bashCheck;
    }

    // Check newbie protection
    const [attackerScore, defenderScore] = await Promise.all([
      getPlayerScore(attackerId, db),
      getPlayerScore(defenderId, db),
    ]);

    if (await isNewbieProtected(attackerScore, defenderScore)) {
      return {
        canAttack: false,
        reason: `Newbie protection: Defender has ${defenderScore} points (< 5000), and you have ${attackerScore} points (> ${defenderScore * 5}). Defend your planet!`,
      };
    }

    return { canAttack: true };
  } catch (error) {
    console.error('Error checking attack protection:', error);
    // Fail open: allow attack if protection check fails
    return { canAttack: true };
  }
}

// ---------------------------------------------------------------------------
// Export for services/index.ts
// ---------------------------------------------------------------------------

export const protectionService = {
  canAttack,
  checkBashRule,
  logAttack,
  isNewbieProtected,
  getPlayerScore,
};
