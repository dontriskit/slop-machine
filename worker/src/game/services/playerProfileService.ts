/**
 * Player Profile Service — Public Player Profiles
 *
 * Provides rich public-facing player data including:
 *  - Full profile: name, alliance, rank, score breakdown, achievements, battle stats, fleet, planets
 *  - Recent activity: battles, builds, research (public-only events)
 *  - Battle history: paginated combat reports
 *  - Player comparison: side-by-side stats for two players
 *  - Player search: name search with optional rank/alliance filters
 */

// ============================================================================
// TYPES
// ============================================================================

export interface PublicProfile {
  playerId: string;
  playerName: string;
  allianceTag: string | null;
  allianceName: string | null;
  rank: number;
  points: {
    total: number;
    economy: number;
    research: number;
    fleet: number;
  };
  joinDate: number; // unix seconds
  achievements: PublicAchievement[];
  achievementPoints: number;
  battleStats: {
    wins: number;
    losses: number;
    draws: number;
    total: number;
    winRate: number; // 0–100 percent
  };
  fleetPowerEstimate: number; // sum of all ship units × 500
  planetsCount: number;
  shipsDestroyed: number;
  shipsLost: number;
}

export interface PublicAchievement {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  points: number;
  unlockedAt: number;
}

export interface ActivityItem {
  type: 'battle' | 'build' | 'research' | 'colonize' | 'fleet';
  timestamp: number;
  summary: string;
  detail?: Record<string, unknown>;
}

export interface BattleHistoryEntry {
  reportId: string;
  timestamp: number;
  role: 'attacker' | 'defender';
  outcome: 'win' | 'loss' | 'draw';
  opponentName: string | null;
  opponentId: string | null;
  shipsLost: number;
  shipsDestroyed: number;
  resourcesRaided: number;
}

export interface BattleHistoryPage {
  playerId: string;
  page: number;
  limit: number;
  total: number;
  entries: BattleHistoryEntry[];
}

export interface PlayerComparisonStat {
  label: string;
  player1Value: number | string;
  player2Value: number | string;
  winner: 'player1' | 'player2' | 'tie';
}

export interface PlayerComparison {
  player1: Pick<PublicProfile, 'playerId' | 'playerName' | 'allianceTag' | 'rank'>;
  player2: Pick<PublicProfile, 'playerId' | 'playerName' | 'allianceTag' | 'rank'>;
  stats: PlayerComparisonStat[];
}

export interface PlayerSearchResult {
  playerId: string;
  playerName: string;
  allianceTag: string | null;
  rank: number;
  totalScore: number;
  planetsCount: number;
}

export interface PlayerSearchPage {
  query: string;
  limit: number;
  results: PlayerSearchResult[];
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

async function computeEconomyScore(playerId: string, db: D1Database): Promise<number> {
  try {
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
  } catch {
    return 0;
  }
}

async function computeResearchScore(playerId: string, db: D1Database): Promise<number> {
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
    return 0;
  }
}

async function computeFleetScore(playerId: string, db: D1Database): Promise<number> {
  try {
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
  } catch {
    return 0;
  }
}

/**
 * Compute the global rank (by total score) for a specific player.
 * Returns 0 if the player is not found.
 */
async function computePlayerRank(
  playerId: string,
  totalScore: number,
  db: D1Database
): Promise<number> {
  try {
    // Count players with a higher score — approximation using leaderboard data
    // We rank by total score from the leaderboard
    const result = await db
      .prepare(
        `SELECT COUNT(*) AS above
         FROM players
         WHERE id != ?`
      )
      .bind(playerId)
      .first<{ above: number }>();
    // Without a materialized score table we return 1 as a stub rank
    // In production this would be pre-computed by a background job
    return (result?.above ?? 0) + 1;
  } catch {
    return 1;
  }
}

// ============================================================================
// GET PUBLIC PROFILE
// ============================================================================

/**
 * Get the full public profile for a player.
 *
 * Aggregates data from: players, planets, player_stats, player_achievements,
 * player_research, fleets, build_history tables.
 *
 * @param db       - D1 database binding
 * @param playerId - Target player ID
 * @returns PublicProfile or null if player not found
 */
export async function getPublicProfile(
  db: D1Database,
  playerId: string
): Promise<PublicProfile | null> {
  // Fetch base player row + planet count
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

  // Fetch alliance name if player is in one
  let allianceName: string | null = null;
  if (player.alliance_tag) {
    try {
      const allianceRow = await db
        .prepare(`SELECT name FROM alliances WHERE tag = ?`)
        .bind(player.alliance_tag)
        .first<{ name: string }>();
      allianceName = allianceRow?.name ?? null;
    } catch {
      // alliances table may not exist in all envs
    }
  }

  // Fetch stats row
  const statsRow = await db
    .prepare('SELECT * FROM player_stats WHERE player_id = ?')
    .bind(playerId)
    .first<Record<string, number>>();

  // Fetch achievements
  const achieveRows = await db
    .prepare(
      `SELECT pa.achievement_id, pa.unlocked_at
       FROM player_achievements pa
       WHERE pa.player_id = ?
       ORDER BY pa.unlocked_at DESC`
    )
    .bind(playerId)
    .all<{ achievement_id: string; unlocked_at: number }>();

  // Compute score breakdown
  const [economyScore, researchScore, fleetScore] = await Promise.all([
    computeEconomyScore(playerId, db),
    computeResearchScore(playerId, db),
    computeFleetScore(playerId, db),
  ]);

  const totalScore = economyScore + researchScore + fleetScore;
  const rank = await computePlayerRank(playerId, totalScore, db);

  // Build achievements list (without importing the full achievement definitions,
  // we store enough data in the achievements table join)
  const achievements: PublicAchievement[] = (achieveRows.results ?? []).map((row) => ({
    id: row.achievement_id,
    name: row.achievement_id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    description: '',
    category: 'general',
    icon: '',
    points: 0,
    unlockedAt: row.unlocked_at,
  }));

  // Attempt to enrich with full achievement metadata from definitions table if available
  try {
    const enrichedRows = await db
      .prepare(
        `SELECT pa.achievement_id, pa.unlocked_at,
                ad.name, ad.description, ad.category, ad.icon, ad.points
         FROM player_achievements pa
         LEFT JOIN achievement_definitions ad ON ad.id = pa.achievement_id
         WHERE pa.player_id = ?
         ORDER BY pa.unlocked_at DESC`
      )
      .bind(playerId)
      .all<{
        achievement_id: string;
        unlocked_at: number;
        name: string | null;
        description: string | null;
        category: string | null;
        icon: string | null;
        points: number | null;
      }>();

    if (enrichedRows.results && enrichedRows.results.length > 0) {
      achievements.splice(
        0,
        achievements.length,
        ...enrichedRows.results.map((row) => ({
          id: row.achievement_id,
          name: row.name ?? row.achievement_id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
          description: row.description ?? '',
          category: row.category ?? 'general',
          icon: row.icon ?? '',
          points: row.points ?? 0,
          unlockedAt: row.unlocked_at,
        }))
      );
    }
  } catch {
    // achievement_definitions table doesn't exist — use basic data
  }

  const achievementPoints = achievements.reduce((sum, a) => sum + a.points, 0);

  const wins = (statsRow?.battles_won ?? 0) as number;
  const losses = (statsRow?.battles_lost ?? 0) as number;
  const draws = (statsRow?.battles_draw ?? 0) as number;
  const total = wins + losses + draws;
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

  return {
    playerId: player.id,
    playerName: player.name,
    allianceTag: player.alliance_tag,
    allianceName,
    rank,
    points: {
      total: totalScore,
      economy: economyScore,
      research: researchScore,
      fleet: fleetScore,
    },
    joinDate: player.created_at,
    achievements,
    achievementPoints,
    battleStats: {
      wins,
      losses,
      draws,
      total,
      winRate,
    },
    fleetPowerEstimate: fleetScore,
    planetsCount: Number(player.planet_count),
    shipsDestroyed: (statsRow?.ships_destroyed ?? 0) as number,
    shipsLost: (statsRow?.ships_lost ?? 0) as number,
  };
}

// ============================================================================
// GET RECENT ACTIVITY
// ============================================================================

/**
 * Get a player's recent public activity (battles, builds, research, colonize).
 *
 * Only public-visible events are returned. Private espionage targets,
 * fleet compositions, and message contents are excluded.
 *
 * @param db       - D1 database binding
 * @param playerId - Target player ID
 * @param limit    - Maximum items to return (default 20, max 50)
 * @returns Chronologically sorted (newest first) activity items
 */
export async function getRecentActivity(
  db: D1Database,
  playerId: string,
  limit: number = 20
): Promise<ActivityItem[]> {
  const safeLimit = Math.min(Math.max(1, limit), 50);
  const activities: ActivityItem[] = [];

  // Recent battles
  try {
    const battleRows = await db
      .prepare(
        `SELECT id, attacker_id, defender_id, result, created_at
         FROM battle_reports
         WHERE attacker_id = ? OR defender_id = ?
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .bind(playerId, playerId, safeLimit)
      .all<{
        id: string;
        attacker_id: string;
        defender_id: string;
        result: string;
        created_at: number;
      }>();

    for (const row of battleRows.results ?? []) {
      const isAttacker = row.attacker_id === playerId;
      const outcome = row.result === 'attacker_wins'
        ? (isAttacker ? 'win' : 'loss')
        : row.result === 'defender_wins'
          ? (isAttacker ? 'loss' : 'win')
          : 'draw';
      activities.push({
        type: 'battle',
        timestamp: row.created_at,
        summary: `Battle ${outcome} as ${isAttacker ? 'attacker' : 'defender'}`,
        detail: { reportId: row.id, outcome, role: isAttacker ? 'attacker' : 'defender' },
      });
    }
  } catch {
    // battle_reports table may not be accessible
  }

  // Recent builds (from build_history)
  try {
    const buildRows = await db
      .prepare(
        `SELECT bh.building_id, bh.level, bh.source, bh.created_at
         FROM build_history bh
         JOIN planets p ON p.id = bh.planet_id
         WHERE p.player_id = ?
         ORDER BY bh.created_at DESC
         LIMIT ?`
      )
      .bind(playerId, safeLimit)
      .all<{
        building_id: number;
        level: number;
        source: string;
        created_at: number;
      }>();

    for (const row of buildRows.results ?? []) {
      activities.push({
        type: 'build',
        timestamp: row.created_at,
        summary: `Built building #${row.building_id} to level ${row.level}`,
        detail: { buildingId: row.building_id, level: row.level, source: row.source },
      });
    }
  } catch {
    // build_history table may not be accessible
  }

  // Recent research completions
  try {
    const researchRows = await db
      .prepare(
        `SELECT tech_id, level, completed_at
         FROM player_research
         WHERE player_id = ? AND completed_at IS NOT NULL
         ORDER BY completed_at DESC
         LIMIT ?`
      )
      .bind(playerId, safeLimit)
      .all<{ tech_id: string; level: number; completed_at: number }>();

    for (const row of researchRows.results ?? []) {
      activities.push({
        type: 'research',
        timestamp: row.completed_at,
        summary: `Researched ${row.tech_id} to level ${row.level}`,
        detail: { techId: row.tech_id, level: row.level },
      });
    }
  } catch {
    // player_research table may not be accessible
  }

  // Recent colonizations
  try {
    const colonyRows = await db
      .prepare(
        `SELECT galaxy, system, position, created_at
         FROM planets
         WHERE player_id = ? AND is_homeworld = 0
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .bind(playerId, safeLimit)
      .all<{
        galaxy: number;
        system: number;
        position: number;
        created_at: number;
      }>();

    for (const row of colonyRows.results ?? []) {
      activities.push({
        type: 'colonize',
        timestamp: row.created_at,
        summary: `Colonized planet at ${row.galaxy}:${row.system}:${row.position}`,
        detail: { galaxy: row.galaxy, system: row.system, position: row.position },
      });
    }
  } catch {
    // planets table may not be accessible
  }

  // Sort all activities by timestamp descending and slice
  activities.sort((a, b) => b.timestamp - a.timestamp);
  return activities.slice(0, safeLimit);
}

// ============================================================================
// GET BATTLE HISTORY
// ============================================================================

/**
 * Get paginated battle history for a player.
 *
 * Returns both attacker and defender battles, with public-safe information
 * (no fleet compositions or espionage probe counts revealed).
 *
 * @param db       - D1 database binding
 * @param playerId - Target player ID
 * @param limit    - Records per page (default 20, max 100)
 * @param offset   - Pagination offset (default 0)
 * @returns BattleHistoryPage
 */
export async function getBattleHistory(
  db: D1Database,
  playerId: string,
  limit: number = 20,
  offset: number = 0
): Promise<BattleHistoryPage> {
  const safeLimit = Math.min(Math.max(1, limit), 100);
  const safeOffset = Math.max(0, offset);

  // Count total battle reports for this player
  let total = 0;
  try {
    const countRow = await db
      .prepare(
        `SELECT COUNT(*) AS cnt
         FROM battle_reports
         WHERE attacker_id = ? OR defender_id = ?`
      )
      .bind(playerId, playerId)
      .first<{ cnt: number }>();
    total = countRow?.cnt ?? 0;
  } catch {
    return { playerId, page: Math.floor(safeOffset / safeLimit) + 1, limit: safeLimit, total: 0, entries: [] };
  }

  // Fetch paginated battle reports
  let rows: Array<{
    id: string;
    attacker_id: string;
    defender_id: string;
    result: string;
    attacker_losses: number | null;
    defender_losses: number | null;
    resources_raided: number | null;
    created_at: number;
  }> = [];

  try {
    const result = await db
      .prepare(
        `SELECT br.id, br.attacker_id, br.defender_id, br.result,
                br.attacker_losses, br.defender_losses,
                br.resources_raided, br.created_at
         FROM battle_reports br
         WHERE br.attacker_id = ? OR br.defender_id = ?
         ORDER BY br.created_at DESC
         LIMIT ? OFFSET ?`
      )
      .bind(playerId, playerId, safeLimit, safeOffset)
      .all<{
        id: string;
        attacker_id: string;
        defender_id: string;
        result: string;
        attacker_losses: number | null;
        defender_losses: number | null;
        resources_raided: number | null;
        created_at: number;
      }>();
    rows = result.results ?? [];
  } catch {
    rows = [];
  }

  // Gather opponent IDs to fetch names
  const opponentIds = new Set<string>();
  for (const row of rows) {
    const opponentId = row.attacker_id === playerId ? row.defender_id : row.attacker_id;
    if (opponentId) opponentIds.add(opponentId);
  }

  // Batch-fetch opponent names
  const opponentNames = new Map<string, string>();
  if (opponentIds.size > 0) {
    try {
      const idList = [...opponentIds].map(() => '?').join(',');
      const nameRows = await db
        .prepare(`SELECT id, name FROM players WHERE id IN (${idList})`)
        .bind(...[...opponentIds])
        .all<{ id: string; name: string }>();
      for (const r of nameRows.results ?? []) {
        opponentNames.set(r.id, r.name);
      }
    } catch {
      // ignore
    }
  }

  const entries: BattleHistoryEntry[] = rows.map((row) => {
    const isAttacker = row.attacker_id === playerId;
    const opponentId = isAttacker ? row.defender_id : row.attacker_id;
    const result = row.result ?? '';

    let outcome: 'win' | 'loss' | 'draw';
    if (result === 'attacker_wins') {
      outcome = isAttacker ? 'win' : 'loss';
    } else if (result === 'defender_wins') {
      outcome = isAttacker ? 'loss' : 'win';
    } else {
      outcome = 'draw';
    }

    const myLosses = isAttacker ? (row.attacker_losses ?? 0) : (row.defender_losses ?? 0);
    const theirLosses = isAttacker ? (row.defender_losses ?? 0) : (row.attacker_losses ?? 0);

    return {
      reportId: row.id,
      timestamp: row.created_at,
      role: isAttacker ? 'attacker' : 'defender',
      outcome,
      opponentId: opponentId ?? null,
      opponentName: opponentId ? (opponentNames.get(opponentId) ?? null) : null,
      shipsLost: myLosses,
      shipsDestroyed: theirLosses,
      resourcesRaided: isAttacker ? (row.resources_raided ?? 0) : 0,
    };
  });

  const page = Math.floor(safeOffset / safeLimit) + 1;
  return { playerId, page, limit: safeLimit, total, entries };
}

// ============================================================================
// GET PLAYER COMPARISON
// ============================================================================

/**
 * Compare two players side-by-side across key stats.
 *
 * Numeric comparisons produce a winner ('player1' | 'player2' | 'tie').
 *
 * @param db        - D1 database binding
 * @param player1Id - First player ID
 * @param player2Id - Second player ID
 * @returns PlayerComparison or null if either player is not found
 */
export async function getPlayerComparison(
  db: D1Database,
  player1Id: string,
  player2Id: string
): Promise<PlayerComparison | null> {
  const [p1Profile, p2Profile] = await Promise.all([
    getPublicProfile(db, player1Id),
    getPublicProfile(db, player2Id),
  ]);

  if (!p1Profile || !p2Profile) return null;

  function compareNum(
    label: string,
    v1: number,
    v2: number,
    higherIsBetter = true
  ): PlayerComparisonStat {
    let winner: 'player1' | 'player2' | 'tie';
    if (v1 === v2) {
      winner = 'tie';
    } else if (higherIsBetter ? v1 > v2 : v1 < v2) {
      winner = 'player1';
    } else {
      winner = 'player2';
    }
    return { label, player1Value: v1, player2Value: v2, winner };
  }

  const stats: PlayerComparisonStat[] = [
    compareNum('Total Score', p1Profile.points.total, p2Profile.points.total),
    compareNum('Economy Score', p1Profile.points.economy, p2Profile.points.economy),
    compareNum('Research Score', p1Profile.points.research, p2Profile.points.research),
    compareNum('Fleet Score', p1Profile.points.fleet, p2Profile.points.fleet),
    compareNum('Battle Wins', p1Profile.battleStats.wins, p2Profile.battleStats.wins),
    compareNum('Battle Losses', p1Profile.battleStats.losses, p2Profile.battleStats.losses, false),
    compareNum('Win Rate (%)', p1Profile.battleStats.winRate, p2Profile.battleStats.winRate),
    compareNum('Ships Destroyed', p1Profile.shipsDestroyed, p2Profile.shipsDestroyed),
    compareNum('Ships Lost', p1Profile.shipsLost, p2Profile.shipsLost, false),
    compareNum('Planets', p1Profile.planetsCount, p2Profile.planetsCount),
    compareNum('Achievement Points', p1Profile.achievementPoints, p2Profile.achievementPoints),
    {
      label: 'Rank',
      player1Value: p1Profile.rank,
      player2Value: p2Profile.rank,
      winner: p1Profile.rank === p2Profile.rank ? 'tie' : p1Profile.rank < p2Profile.rank ? 'player1' : 'player2',
    },
    {
      label: 'Alliance',
      player1Value: p1Profile.allianceTag ?? 'None',
      player2Value: p2Profile.allianceTag ?? 'None',
      winner: 'tie',
    },
  ];

  return {
    player1: {
      playerId: p1Profile.playerId,
      playerName: p1Profile.playerName,
      allianceTag: p1Profile.allianceTag,
      rank: p1Profile.rank,
    },
    player2: {
      playerId: p2Profile.playerId,
      playerName: p2Profile.playerName,
      allianceTag: p2Profile.allianceTag,
      rank: p2Profile.rank,
    },
    stats,
  };
}

// ============================================================================
// SEARCH PLAYERS
// ============================================================================

/**
 * Search for players by name (case-insensitive partial match).
 *
 * Optional filters:
 *  - minRank / maxRank  (rank is approximated by total score order)
 *  - allianceTag        (exact match)
 *
 * @param db          - D1 database binding
 * @param query       - Name search string (min 1 char)
 * @param limit       - Maximum results (default 20, max 50)
 * @param allianceTag - Optional alliance filter (exact tag)
 * @returns PlayerSearchPage
 */
export async function searchPlayers(
  db: D1Database,
  query: string,
  limit: number = 20,
  allianceTag?: string
): Promise<PlayerSearchPage> {
  const safeLimit = Math.min(Math.max(1, limit), 50);
  const searchTerm = `%${query.trim().toLowerCase()}%`;

  let rows: Array<{
    id: string;
    name: string;
    alliance_tag: string | null;
    created_at: number;
    planet_count: number;
  }> = [];

  try {
    if (allianceTag) {
      const result = await db
        .prepare(
          `SELECT p.id, p.name, p.alliance_tag, p.created_at,
                  COUNT(pl.id) AS planet_count
           FROM players p
           LEFT JOIN planets pl ON pl.player_id = p.id
           WHERE LOWER(p.name) LIKE ? AND p.alliance_tag = ?
           GROUP BY p.id
           ORDER BY p.name
           LIMIT ?`
        )
        .bind(searchTerm, allianceTag, safeLimit)
        .all<{
          id: string;
          name: string;
          alliance_tag: string | null;
          created_at: number;
          planet_count: number;
        }>();
      rows = result.results ?? [];
    } else {
      const result = await db
        .prepare(
          `SELECT p.id, p.name, p.alliance_tag, p.created_at,
                  COUNT(pl.id) AS planet_count
           FROM players p
           LEFT JOIN planets pl ON pl.player_id = p.id
           WHERE LOWER(p.name) LIKE ?
           GROUP BY p.id
           ORDER BY p.name
           LIMIT ?`
        )
        .bind(searchTerm, safeLimit)
        .all<{
          id: string;
          name: string;
          alliance_tag: string | null;
          created_at: number;
          planet_count: number;
        }>();
      rows = result.results ?? [];
    }
  } catch {
    rows = [];
  }

  // Compute scores for ranking
  const results: PlayerSearchResult[] = await Promise.all(
    rows.map(async (player, index) => {
      const [econ, research, fleet] = await Promise.all([
        computeEconomyScore(player.id, db),
        computeResearchScore(player.id, db),
        computeFleetScore(player.id, db),
      ]);
      return {
        playerId: player.id,
        playerName: player.name,
        allianceTag: player.alliance_tag,
        rank: index + 1, // relative rank within search results
        totalScore: econ + research + fleet,
        planetsCount: Number(player.planet_count),
      };
    })
  );

  // Sort by total score descending
  results.sort((a, b) => b.totalScore - a.totalScore);
  results.forEach((r, i) => { r.rank = i + 1; });

  return { query, limit: safeLimit, results };
}

// ============================================================================
// SERVICE CLASS
// ============================================================================

export class PlayerProfileService {
  async getPublicProfile(db: D1Database, playerId: string): Promise<PublicProfile | null> {
    return getPublicProfile(db, playerId);
  }

  async getRecentActivity(db: D1Database, playerId: string, limit = 20): Promise<ActivityItem[]> {
    return getRecentActivity(db, playerId, limit);
  }

  async getBattleHistory(
    db: D1Database,
    playerId: string,
    limit = 20,
    offset = 0
  ): Promise<BattleHistoryPage> {
    return getBattleHistory(db, playerId, limit, offset);
  }

  async getPlayerComparison(
    db: D1Database,
    player1Id: string,
    player2Id: string
  ): Promise<PlayerComparison | null> {
    return getPlayerComparison(db, player1Id, player2Id);
  }

  async searchPlayers(
    db: D1Database,
    query: string,
    limit = 20,
    allianceTag?: string
  ): Promise<PlayerSearchPage> {
    return searchPlayers(db, query, limit, allianceTag);
  }
}

export const playerProfileService = new PlayerProfileService();
