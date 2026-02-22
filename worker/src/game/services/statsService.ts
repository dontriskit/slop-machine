/**
 * Stats Service — E-sport Statistics Tracking
 *
 * Provides counters and leaderboard queries for player performance metrics.
 * Every significant game event increments the relevant stat counters in D1.
 *
 * Stat categories:
 *  - Combat:     battles won/lost/draw, ships destroyed/lost
 *  - Economy:    resources raided/lost, buildings built, research completed
 *  - Exploration: fleets dispatched, espionage, planets colonized
 *  - Social:     trades completed
 *  - AI:         agent decisions
 *
 * All counters are stored in the `player_stats` D1 table with INTEGER columns
 * that are incremented atomically via UPDATE ... SET col = col + delta.
 */

// ============================================================================
// TYPES
// ============================================================================

/** Full e-sport stats for a single player */
export interface PlayerStats {
  playerId: string;
  battlesWon: number;
  battlesLost: number;
  battlesDraw: number;
  shipsDestroyed: number;
  shipsLost: number;
  resourcesRaided: {
    metal: number;
    crystal: number;
    deuterium: number;
  };
  resourcesLost: {
    metal: number;
    crystal: number;
    deuterium: number;
  };
  fleetsDispatched: number;
  espionageReportsSent: number;
  buildingsBuilt: number;
  researchCompleted: number;
  planetsColonized: number;
  tradesCompleted: number;
  agentDecisions: number;
  playTimeDays: number;
  createdAt: number; // unix seconds
}

/** Leaderboard entry for a single player */
export interface LeaderboardEntry {
  playerId: string;
  playerName: string;
  value: number;
  rank: number;
}

// ============================================================================
// VALID STAT COLUMNS
// ============================================================================

/** Valid column names in the player_stats table that can be incremented */
export type StatColumn =
  | 'battles_won'
  | 'battles_lost'
  | 'battles_draw'
  | 'ships_destroyed'
  | 'ships_lost'
  | 'resources_raided_metal'
  | 'resources_raided_crystal'
  | 'resources_raided_deut'
  | 'resources_lost_metal'
  | 'resources_lost_crystal'
  | 'resources_lost_deut'
  | 'fleets_dispatched'
  | 'espionage_sent'
  | 'buildings_built'
  | 'research_completed'
  | 'planets_colonized'
  | 'trades_completed'
  | 'agent_decisions';

/** Stat event types for the updateStats API */
export type StatEvent =
  | 'battle_win'
  | 'battle_loss'
  | 'battle_draw'
  | 'ships_destroyed'
  | 'ships_lost'
  | 'resources_raided'
  | 'resources_lost'
  | 'fleet_dispatched'
  | 'espionage_sent'
  | 'building_built'
  | 'research_completed'
  | 'planet_colonized'
  | 'trade_completed'
  | 'agent_decision';

/** Payload shapes for each event type */
export interface StatEventData {
  battle_win: Record<string, never>;
  battle_loss: Record<string, never>;
  battle_draw: Record<string, never>;
  ships_destroyed: { count: number };
  ships_lost: { count: number };
  resources_raided: { metal: number; crystal: number; deuterium: number };
  resources_lost: { metal: number; crystal: number; deuterium: number };
  fleet_dispatched: Record<string, never>;
  espionage_sent: { count?: number };
  building_built: { count?: number };
  research_completed: Record<string, never>;
  planet_colonized: Record<string, never>;
  trade_completed: Record<string, never>;
  agent_decision: Record<string, never>;
}

/** Leaderboard stat keys exposed via the API */
export type LeaderboardStat =
  | 'battles_won'
  | 'ships_destroyed'
  | 'resources_raided_metal'
  | 'fleets_dispatched'
  | 'planets_colonized'
  | 'research_completed'
  | 'buildings_built'
  | 'trades_completed'
  | 'agent_decisions';

// ============================================================================
// ENSURE STATS ROW EXISTS
// ============================================================================

/**
 * Ensure a player_stats row exists for the given player.
 * Uses INSERT OR IGNORE so it is safe to call before every updateStats.
 */
async function ensureStatsRow(playerId: string, db: D1Database): Promise<void> {
  await db
    .prepare(
      `INSERT OR IGNORE INTO player_stats (player_id, created_at)
       VALUES (?, ?)`
    )
    .bind(playerId, Math.floor(Date.now() / 1000))
    .run();
}

// ============================================================================
// UPDATE STATS
// ============================================================================

/**
 * Increment stat counters for a player based on a game event.
 *
 * Creates the player_stats row on first call (INSERT OR IGNORE).
 * All increments are atomic single-column UPDATEs.
 *
 * @param playerId - The player whose stats to update
 * @param event    - The event type (determines which columns to increment)
 * @param data     - Event-specific payload
 * @param db       - D1 database binding
 */
export async function updateStats<E extends StatEvent>(
  playerId: string,
  event: E,
  data: StatEventData[E],
  db: D1Database
): Promise<void> {
  await ensureStatsRow(playerId, db);

  const updates: Array<{ column: StatColumn; delta: number }> = [];

  switch (event) {
    case 'battle_win':
      updates.push({ column: 'battles_won', delta: 1 });
      break;

    case 'battle_loss':
      updates.push({ column: 'battles_lost', delta: 1 });
      break;

    case 'battle_draw':
      updates.push({ column: 'battles_draw', delta: 1 });
      break;

    case 'ships_destroyed': {
      const d = data as StatEventData['ships_destroyed'];
      updates.push({ column: 'ships_destroyed', delta: d.count });
      break;
    }

    case 'ships_lost': {
      const d = data as StatEventData['ships_lost'];
      updates.push({ column: 'ships_lost', delta: d.count });
      break;
    }

    case 'resources_raided': {
      const d = data as StatEventData['resources_raided'];
      updates.push({ column: 'resources_raided_metal', delta: d.metal });
      updates.push({ column: 'resources_raided_crystal', delta: d.crystal });
      updates.push({ column: 'resources_raided_deut', delta: d.deuterium });
      break;
    }

    case 'resources_lost': {
      const d = data as StatEventData['resources_lost'];
      updates.push({ column: 'resources_lost_metal', delta: d.metal });
      updates.push({ column: 'resources_lost_crystal', delta: d.crystal });
      updates.push({ column: 'resources_lost_deut', delta: d.deuterium });
      break;
    }

    case 'fleet_dispatched':
      updates.push({ column: 'fleets_dispatched', delta: 1 });
      break;

    case 'espionage_sent': {
      const d = data as StatEventData['espionage_sent'];
      updates.push({ column: 'espionage_sent', delta: d.count ?? 1 });
      break;
    }

    case 'building_built': {
      const d = data as StatEventData['building_built'];
      updates.push({ column: 'buildings_built', delta: d.count ?? 1 });
      break;
    }

    case 'research_completed':
      updates.push({ column: 'research_completed', delta: 1 });
      break;

    case 'planet_colonized':
      updates.push({ column: 'planets_colonized', delta: 1 });
      break;

    case 'trade_completed':
      updates.push({ column: 'trades_completed', delta: 1 });
      break;

    case 'agent_decision':
      updates.push({ column: 'agent_decisions', delta: 1 });
      break;

    default:
      console.warn(`[StatsService] Unknown event type: ${event}`);
      return;
  }

  // Execute all increments
  await Promise.all(
    updates
      .filter((u) => u.delta > 0)
      .map((u) =>
        db
          .prepare(`UPDATE player_stats SET ${u.column} = ${u.column} + ? WHERE player_id = ?`)
          .bind(u.delta, playerId)
          .run()
      )
  );
}

// ============================================================================
// GET PLAYER STATS
// ============================================================================

/**
 * Retrieve the full stats record for a player.
 *
 * Also computes play_time_days from the players table.
 *
 * @param playerId - The player to fetch stats for
 * @param db       - D1 database binding
 * @returns PlayerStats, or a zeroed-out record if no row exists yet
 */
export async function getPlayerStats(
  playerId: string,
  db: D1Database
): Promise<PlayerStats> {
  const [statsRow, playerRow] = await Promise.all([
    db
      .prepare('SELECT * FROM player_stats WHERE player_id = ?')
      .bind(playerId)
      .first() as Promise<Record<string, number> | null>,
    db
      .prepare('SELECT created_at FROM players WHERE id = ?')
      .bind(playerId)
      .first() as Promise<{ created_at: number } | null>,
  ]);

  const nowSec = Math.floor(Date.now() / 1000);
  const createdAt = playerRow?.created_at ?? nowSec;
  const playTimeDays = Math.floor((nowSec - createdAt) / 86400);

  return {
    playerId,
    battlesWon: (statsRow?.battles_won ?? 0) as number,
    battlesLost: (statsRow?.battles_lost ?? 0) as number,
    battlesDraw: (statsRow?.battles_draw ?? 0) as number,
    shipsDestroyed: (statsRow?.ships_destroyed ?? 0) as number,
    shipsLost: (statsRow?.ships_lost ?? 0) as number,
    resourcesRaided: {
      metal: (statsRow?.resources_raided_metal ?? 0) as number,
      crystal: (statsRow?.resources_raided_crystal ?? 0) as number,
      deuterium: (statsRow?.resources_raided_deut ?? 0) as number,
    },
    resourcesLost: {
      metal: (statsRow?.resources_lost_metal ?? 0) as number,
      crystal: (statsRow?.resources_lost_crystal ?? 0) as number,
      deuterium: (statsRow?.resources_lost_deut ?? 0) as number,
    },
    fleetsDispatched: (statsRow?.fleets_dispatched ?? 0) as number,
    espionageReportsSent: (statsRow?.espionage_sent ?? 0) as number,
    buildingsBuilt: (statsRow?.buildings_built ?? 0) as number,
    researchCompleted: (statsRow?.research_completed ?? 0) as number,
    planetsColonized: (statsRow?.planets_colonized ?? 0) as number,
    tradesCompleted: (statsRow?.trades_completed ?? 0) as number,
    agentDecisions: (statsRow?.agent_decisions ?? 0) as number,
    playTimeDays,
    createdAt: (statsRow?.created_at ?? nowSec) as number,
  };
}

// ============================================================================
// LEADERBOARD
// ============================================================================

/** Valid column names that map to stat display labels */
const LEADERBOARD_COLUMN_MAP: Record<LeaderboardStat, StatColumn> = {
  battles_won: 'battles_won',
  ships_destroyed: 'ships_destroyed',
  resources_raided_metal: 'resources_raided_metal',
  fleets_dispatched: 'fleets_dispatched',
  planets_colonized: 'planets_colonized',
  research_completed: 'research_completed',
  buildings_built: 'buildings_built',
  trades_completed: 'trades_completed',
  agent_decisions: 'agent_decisions',
};

/**
 * Get top players for a given leaderboard stat.
 *
 * Joins player_stats with players to include the player name.
 * Returns results in descending order of the stat value.
 *
 * @param stat  - The stat column to rank by
 * @param limit - Maximum number of results (default 10, max 100)
 * @param db    - D1 database binding
 * @returns Ranked list of LeaderboardEntry
 */
export async function getTopPlayers(
  stat: LeaderboardStat,
  limit: number = 10,
  db: D1Database
): Promise<LeaderboardEntry[]> {
  const column = LEADERBOARD_COLUMN_MAP[stat];
  if (!column) {
    throw new Error(`Unknown leaderboard stat: ${stat}`);
  }

  const safeLimit = Math.min(Math.max(1, limit), 100);

  const rows = await db
    .prepare(
      `SELECT ps.player_id, p.name AS player_name, ps.${column} AS value
       FROM player_stats ps
       JOIN players p ON p.id = ps.player_id
       WHERE ps.${column} > 0
       ORDER BY ps.${column} DESC
       LIMIT ?`
    )
    .bind(safeLimit)
    .all();

  return (rows.results as Array<{ player_id: string; player_name: string; value: number }>).map(
    (row, index) => ({
      playerId: row.player_id,
      playerName: row.player_name,
      value: row.value,
      rank: index + 1,
    })
  );
}

// ============================================================================
// CONVENIENCE CLASS WRAPPER
// ============================================================================

export class StatsService {
  /** Increment stats for a game event */
  async updateStats<E extends StatEvent>(
    playerId: string,
    event: E,
    data: StatEventData[E],
    db: D1Database
  ): Promise<void> {
    return updateStats(playerId, event, data, db);
  }

  /** Get full stats for a player */
  async getPlayerStats(playerId: string, db: D1Database): Promise<PlayerStats> {
    return getPlayerStats(playerId, db);
  }

  /** Get leaderboard for a specific stat */
  async getTopPlayers(
    stat: LeaderboardStat,
    limit: number = 10,
    db: D1Database
  ): Promise<LeaderboardEntry[]> {
    return getTopPlayers(stat, limit, db);
  }

  /**
   * Reset all stats for a player (useful in tests or admin operations).
   * Does NOT delete the row — resets all counters to 0.
   */
  async resetStats(playerId: string, db: D1Database): Promise<void> {
    await db
      .prepare(
        `UPDATE player_stats SET
           battles_won = 0, battles_lost = 0, battles_draw = 0,
           ships_destroyed = 0, ships_lost = 0,
           resources_raided_metal = 0, resources_raided_crystal = 0, resources_raided_deut = 0,
           resources_lost_metal = 0, resources_lost_crystal = 0, resources_lost_deut = 0,
           fleets_dispatched = 0, espionage_sent = 0, buildings_built = 0,
           research_completed = 0, planets_colonized = 0, trades_completed = 0,
           agent_decisions = 0
         WHERE player_id = ?`
      )
      .bind(playerId)
      .run();
  }
}

/** Singleton instance for global use */
export const statsService = new StatsService();
