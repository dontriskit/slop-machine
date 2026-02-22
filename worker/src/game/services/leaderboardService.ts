/**
 * leaderboardService.ts
 *
 * Computes player leaderboard rankings from D1 data.
 *
 * Score formulas (OGame-inspired):
 *   Economy  = sum of all building levels × 1000
 *   Research = sum of all tech levels × 2000
 *   Fleet    = total ship count × avg ship cost / 1000  (approx via fleet_missions)
 *   Points   = economy + research + fleet
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LeaderboardEntry {
  rank: number;
  playerId: string;
  playerName: string;
  allianceTag: string | null;
  score: number;
  economyScore: number;
  researchScore: number;
  fleetScore: number;
  planetCount: number;
}

export interface LeaderboardPage {
  type: 'points' | 'fleet' | 'research' | 'economy';
  page: number;
  limit: number;
  total: number;
  entries: LeaderboardEntry[];
}

export type LeaderboardType = 'points' | 'fleet' | 'research' | 'economy';

// ---------------------------------------------------------------------------
// Score helpers
// ---------------------------------------------------------------------------

/**
 * Buildings stored in Durable Objects, not D1.  We approximate economy score
 * from the build_history table: each completed build action at level N
 * contributes N × 1000 points.  Duplicate (planet, building, level) entries
 * are de-duplicated by taking the max level seen per building per planet.
 */
async function getEconomyScore(playerId: string, db: D1Database): Promise<number> {
  // Sum of max level × 1000 per (planet_id, building_id) for this player's planets
  const result = await db
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

  return result?.economy ?? 0;
}

/**
 * Research score: sum of tech levels × 2000.
 * Uses the research table if it exists; falls back to 0 gracefully.
 */
async function getResearchScore(playerId: string, db: D1Database): Promise<number> {
  try {
    const result = await db
      .prepare(
        `SELECT COALESCE(SUM(level * 2000), 0) AS research
         FROM player_research
         WHERE player_id = ?`
      )
      .bind(playerId)
      .first<{ research: number }>();

    return result?.research ?? 0;
  } catch {
    // Table may not exist yet
    return 0;
  }
}

/**
 * Fleet score: number of ships currently docked × 500 (rough approximation).
 * Uses the fleets table where ship columns are quantities.
 */
async function getFleetScore(playerId: string, db: D1Database): Promise<number> {
  const result = await db
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

  return result?.fleet ?? 0;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getLeaderboard(
  type: LeaderboardType,
  page: number,
  limit: number,
  db: D1Database
): Promise<LeaderboardPage> {
  const safePage = Math.max(1, page);
  const safeLimit = Math.min(100, Math.max(1, limit));
  const offset = (safePage - 1) * safeLimit;

  // Count total players
  const countResult = await db
    .prepare(`SELECT COUNT(*) AS total FROM players`)
    .first<{ total: number }>();
  const total = countResult?.total ?? 0;

  // Fetch all players (we'll score them in JS; for large servers this would
  // need a materialized view / background job, but for Cosmic Protocol this
  // is fine)
  const playersResult = await db
    .prepare(
      `SELECT p.id, p.name, p.alliance_tag,
              COUNT(pl.id) AS planet_count
       FROM players p
       LEFT JOIN planets pl ON pl.player_id = p.id
       GROUP BY p.id
       ORDER BY p.name
       LIMIT ? OFFSET ?`
    )
    .bind(safeLimit * 10, 0) // over-fetch so we can sort by score
    .all<{
      id: string;
      name: string;
      alliance_tag: string | null;
      planet_count: number;
    }>();

  const players = playersResult.results ?? [];

  // Compute scores in parallel (batch of players)
  const scored = await Promise.all(
    players.map(async (player) => {
      const [econ, research, fleet] = await Promise.all([
        getEconomyScore(player.id, db),
        getResearchScore(player.id, db),
        getFleetScore(player.id, db),
      ]);

      return {
        playerId: player.id,
        playerName: player.name,
        allianceTag: player.alliance_tag,
        planetCount: Number(player.planet_count),
        economyScore: econ,
        researchScore: research,
        fleetScore: fleet,
        score: econ + research + fleet,
      };
    })
  );

  // Sort by the requested dimension
  scored.sort((a, b) => {
    switch (type) {
      case 'economy':
        return b.economyScore - a.economyScore;
      case 'research':
        return b.researchScore - a.researchScore;
      case 'fleet':
        return b.fleetScore - a.fleetScore;
      default:
        return b.score - a.score;
    }
  });

  // Slice page
  const page_entries = scored.slice(offset, offset + safeLimit);

  // Assign ranks based on global position
  const entries: LeaderboardEntry[] = page_entries.map((entry, idx) => ({
    rank: offset + idx + 1,
    ...entry,
  }));

  return {
    type,
    page: safePage,
    limit: safeLimit,
    total,
    entries,
  };
}

export async function getPlayerProfile(
  playerId: string,
  db: D1Database
): Promise<{
  playerId: string;
  playerName: string;
  allianceTag: string | null;
  planetCount: number;
  joinedAt: number;
  economyScore: number;
  researchScore: number;
  fleetScore: number;
  totalScore: number;
  recentActivity: Array<{
    buildingId: number;
    level: number;
    source: string;
    reason: string | null;
    createdAt: number;
  }>;
} | null> {
  const player = await db
    .prepare(
      `SELECT p.id, p.name, p.alliance_tag, p.created_at,
              COUNT(pl.id) AS planet_count
       FROM players p
       LEFT JOIN planets pl ON pl.player_id = p.id
       WHERE p.id = ?
       GROUP BY p.id`
    )
    .bind(playerId)
    .first<{
      id: string;
      name: string;
      alliance_tag: string | null;
      created_at: number;
      planet_count: number;
    }>();

  if (!player) return null;

  // Recent build history (last 5)
  const historyResult = await db
    .prepare(
      `SELECT bh.building_id, bh.level, bh.source, bh.ai_reason, bh.created_at
       FROM build_history bh
       JOIN planets p ON p.id = bh.planet_id
       WHERE p.player_id = ?
       ORDER BY bh.created_at DESC
       LIMIT 5`
    )
    .bind(playerId)
    .all<{
      building_id: number;
      level: number;
      source: string;
      ai_reason: string | null;
      created_at: number;
    }>();

  const [econ, research, fleet] = await Promise.all([
    getEconomyScore(playerId, db),
    getResearchScore(playerId, db),
    getFleetScore(playerId, db),
  ]);

  return {
    playerId: player.id,
    playerName: player.name,
    allianceTag: player.alliance_tag,
    planetCount: Number(player.planet_count),
    joinedAt: player.created_at,
    economyScore: econ,
    researchScore: research,
    fleetScore: fleet,
    totalScore: econ + research + fleet,
    recentActivity: (historyResult.results ?? []).map((r) => ({
      buildingId: r.building_id,
      level: r.level,
      source: r.source,
      reason: r.ai_reason,
      createdAt: r.created_at,
    })),
  };
}
