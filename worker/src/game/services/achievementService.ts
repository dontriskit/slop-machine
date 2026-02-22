/**
 * Achievement Service
 *
 * Defines all 30+ achievements for Cosmic Protocol and provides functions
 * to check, unlock, and query player achievements.
 *
 * Achievement categories:
 *  - combat:      Battle wins, ships destroyed, resources raided
 *  - economy:     Building levels, resource accumulation
 *  - exploration: Colonization, fleet missions, espionage
 *  - social:      Alliance, trades, messages
 *  - special:     Speed runs, AI cooperation, veteran play
 */

// ============================================================================
// TYPES
// ============================================================================

export interface Achievement {
  id: string;
  name: string;
  description: string;
  category: 'combat' | 'economy' | 'exploration' | 'social' | 'special';
  icon: string; // emoji
  requirement: AchievementRequirement;
  points: number;
}

export interface AchievementRequirement {
  type:
    | 'battle_wins'
    | 'ships_destroyed'
    | 'resources_raided'
    | 'buildings_built'
    | 'research_completed'
    | 'planets_colonized'
    | 'fleet_missions'
    | 'espionage_reports'
    | 'alliance_joined'
    | 'trades_completed'
    | 'deathstars_built'
    | 'first_battle'
    | 'first_colony'
    | 'first_research'
    | 'agent_decisions'
    | 'play_days';
  threshold: number;
}

export interface PlayerAchievement {
  achievementId: string;
  playerId: string;
  unlockedAt: number; // unix seconds
  progress: number;   // 0–100
}

// Row as stored in D1
interface PlayerAchievementRow {
  achievement_id: string;
  player_id: string;
  unlocked_at: number;
}

// ============================================================================
// ACHIEVEMENT DEFINITIONS
// ============================================================================

export const ACHIEVEMENTS: Achievement[] = [
  // --------------------------------------------------------------------------
  // COMBAT
  // --------------------------------------------------------------------------
  {
    id: 'first_blood',
    name: 'First Blood',
    description: 'Win your first battle.',
    category: 'combat',
    icon: '⚔️',
    requirement: { type: 'first_battle', threshold: 1 },
    points: 10,
  },
  {
    id: 'warrior',
    name: 'Warrior',
    description: 'Win 10 battles.',
    category: 'combat',
    icon: '🗡️',
    requirement: { type: 'battle_wins', threshold: 10 },
    points: 50,
  },
  {
    id: 'conqueror',
    name: 'Conqueror',
    description: 'Win 100 battles.',
    category: 'combat',
    icon: '🏆',
    requirement: { type: 'battle_wins', threshold: 100 },
    points: 200,
  },
  {
    id: 'warlord',
    name: 'Warlord',
    description: 'Win 500 battles.',
    category: 'combat',
    icon: '👑',
    requirement: { type: 'battle_wins', threshold: 500 },
    points: 500,
  },
  {
    id: 'destroyer',
    name: 'Destroyer',
    description: 'Destroy 1,000 enemy ships.',
    category: 'combat',
    icon: '💥',
    requirement: { type: 'ships_destroyed', threshold: 1000 },
    points: 100,
  },
  {
    id: 'ship_graveyard',
    name: 'Ship Graveyard',
    description: 'Destroy 10,000 enemy ships.',
    category: 'combat',
    icon: '☠️',
    requirement: { type: 'ships_destroyed', threshold: 10000 },
    points: 300,
  },
  {
    id: 'death_star_commander',
    name: 'Death Star Commander',
    description: 'Build a Death Star — the ultimate weapon.',
    category: 'combat',
    icon: '🌑',
    requirement: { type: 'deathstars_built', threshold: 1 },
    points: 500,
  },
  {
    id: 'raider',
    name: 'Raider',
    description: 'Raid 1,000,000 total resources from enemy planets.',
    category: 'combat',
    icon: '💰',
    requirement: { type: 'resources_raided', threshold: 1_000_000 },
    points: 150,
  },
  {
    id: 'plunderer',
    name: 'Plunderer',
    description: 'Raid 100,000,000 total resources from enemy planets.',
    category: 'combat',
    icon: '🏴‍☠️',
    requirement: { type: 'resources_raided', threshold: 100_000_000 },
    points: 400,
  },

  // --------------------------------------------------------------------------
  // ECONOMY
  // --------------------------------------------------------------------------
  {
    id: 'miner',
    name: 'Miner',
    description: 'Reach Metal Mine level 10.',
    category: 'economy',
    icon: '⛏️',
    requirement: { type: 'buildings_built', threshold: 10 },
    points: 20,
  },
  {
    id: 'industrialist',
    name: 'Industrialist',
    description: 'Build 50 buildings across all your planets.',
    category: 'economy',
    icon: '🏭',
    requirement: { type: 'buildings_built', threshold: 50 },
    points: 100,
  },
  {
    id: 'megacorp',
    name: 'Megacorp',
    description: 'Build 200 buildings across all your planets.',
    category: 'economy',
    icon: '🌆',
    requirement: { type: 'buildings_built', threshold: 200 },
    points: 300,
  },
  {
    id: 'energy_lord',
    name: 'Energy Lord',
    description: 'Complete 15 research technologies.',
    category: 'economy',
    icon: '⚡',
    requirement: { type: 'research_completed', threshold: 15 },
    points: 50,
  },
  {
    id: 'millionaire',
    name: 'Millionaire',
    description: 'Raid or produce 1,000,000 total resources.',
    category: 'economy',
    icon: '💎',
    requirement: { type: 'resources_raided', threshold: 1_000_000 },
    points: 100,
  },
  {
    id: 'billionaire',
    name: 'Billionaire',
    description: 'Accumulate 1,000,000,000 total resources (raided).',
    category: 'economy',
    icon: '💍',
    requirement: { type: 'resources_raided', threshold: 1_000_000_000 },
    points: 750,
  },
  {
    id: 'tech_pioneer',
    name: 'Tech Pioneer',
    description: 'Complete your first research.',
    category: 'economy',
    icon: '🔬',
    requirement: { type: 'first_research', threshold: 1 },
    points: 15,
  },
  {
    id: 'scientist',
    name: 'Scientist',
    description: 'Complete 5 research technologies.',
    category: 'economy',
    icon: '🧪',
    requirement: { type: 'research_completed', threshold: 5 },
    points: 40,
  },

  // --------------------------------------------------------------------------
  // EXPLORATION
  // --------------------------------------------------------------------------
  {
    id: 'first_colony',
    name: 'Explorer',
    description: 'Colonize your first planet.',
    category: 'exploration',
    icon: '🚀',
    requirement: { type: 'first_colony', threshold: 1 },
    points: 30,
  },
  {
    id: 'empire_builder',
    name: 'Empire Builder',
    description: 'Own 5 planets simultaneously.',
    category: 'exploration',
    icon: '🌍',
    requirement: { type: 'planets_colonized', threshold: 5 },
    points: 150,
  },
  {
    id: 'galaxy_lord',
    name: 'Galaxy Lord',
    description: 'Own 10 planets simultaneously.',
    category: 'exploration',
    icon: '🌌',
    requirement: { type: 'planets_colonized', threshold: 10 },
    points: 400,
  },
  {
    id: 'spy_master',
    name: 'Spy Master',
    description: 'Send 50 espionage probes.',
    category: 'exploration',
    icon: '🕵️',
    requirement: { type: 'espionage_reports', threshold: 50 },
    points: 50,
  },
  {
    id: 'intelligence_agency',
    name: 'Intelligence Agency',
    description: 'Send 500 espionage probes.',
    category: 'exploration',
    icon: '🛸',
    requirement: { type: 'espionage_reports', threshold: 500 },
    points: 150,
  },
  {
    id: 'navigator',
    name: 'Navigator',
    description: 'Complete 100 fleet missions.',
    category: 'exploration',
    icon: '🧭',
    requirement: { type: 'fleet_missions', threshold: 100 },
    points: 100,
  },
  {
    id: 'admiral',
    name: 'Admiral',
    description: 'Complete 1,000 fleet missions.',
    category: 'exploration',
    icon: '⚓',
    requirement: { type: 'fleet_missions', threshold: 1000 },
    points: 300,
  },

  // --------------------------------------------------------------------------
  // SOCIAL
  // --------------------------------------------------------------------------
  {
    id: 'team_player',
    name: 'Team Player',
    description: 'Join an alliance.',
    category: 'social',
    icon: '🤝',
    requirement: { type: 'alliance_joined', threshold: 1 },
    points: 20,
  },
  {
    id: 'trader',
    name: 'Trader',
    description: 'Complete 10 trades.',
    category: 'social',
    icon: '🛒',
    requirement: { type: 'trades_completed', threshold: 10 },
    points: 50,
  },
  {
    id: 'merchant',
    name: 'Merchant',
    description: 'Complete 100 trades.',
    category: 'social',
    icon: '💼',
    requirement: { type: 'trades_completed', threshold: 100 },
    points: 150,
  },

  // --------------------------------------------------------------------------
  // SPECIAL
  // --------------------------------------------------------------------------
  {
    id: 'speed_demon',
    name: 'Speed Demon',
    description: 'Build 10 buildings in a single hour.',
    category: 'special',
    icon: '⚡',
    requirement: { type: 'buildings_built', threshold: 10 },
    points: 100,
  },
  {
    id: 'ai_ally',
    name: 'AI Ally',
    description: 'Let the build agent make 50 decisions on your behalf.',
    category: 'special',
    icon: '🤖',
    requirement: { type: 'agent_decisions', threshold: 50 },
    points: 75,
  },
  {
    id: 'ai_overlord',
    name: 'AI Overlord',
    description: 'Let the build agent make 500 decisions on your behalf.',
    category: 'special',
    icon: '🧠',
    requirement: { type: 'agent_decisions', threshold: 500 },
    points: 200,
  },
  {
    id: 'veteran',
    name: 'Veteran',
    description: 'Play for 7 days.',
    category: 'special',
    icon: '🎖️',
    requirement: { type: 'play_days', threshold: 7 },
    points: 50,
  },
  {
    id: 'legend',
    name: 'Legend',
    description: 'Play for 30 days.',
    category: 'special',
    icon: '🌟',
    requirement: { type: 'play_days', threshold: 30 },
    points: 200,
  },
];

// ============================================================================
// ACHIEVEMENT MAP (for O(1) lookup)
// ============================================================================

export const ACHIEVEMENT_MAP: Record<string, Achievement> = Object.fromEntries(
  ACHIEVEMENTS.map((a) => [a.id, a])
);

// ============================================================================
// PLAYER STATS TYPE (sourced from player_stats table)
// ============================================================================

export interface AggregatedPlayerStats {
  battlesWon: number;
  battlesLost: number;
  battlesDraw: number;
  shipsDestroyed: number;
  shipsLost: number;
  resourcesRaided: number; // total metal + crystal + deuterium raided
  fleetsDispatched: number;
  espionageSent: number;
  buildingsBuilt: number;
  researchCompleted: number;
  planetsColonized: number;
  tradesCompleted: number;
  agentDecisions: number;
  playTimeDays: number;
  allianceJoined: boolean;
  deathstarsBuilt: number;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Resolve the current numeric progress value for a given achievement requirement
 * against the player's aggregated stats.
 */
function getStatValueForRequirement(
  req: AchievementRequirement,
  stats: AggregatedPlayerStats
): number {
  switch (req.type) {
    case 'battle_wins':
    case 'first_battle':
      return stats.battlesWon;
    case 'ships_destroyed':
      return stats.shipsDestroyed;
    case 'resources_raided':
      return stats.resourcesRaided;
    case 'buildings_built':
      return stats.buildingsBuilt;
    case 'research_completed':
    case 'first_research':
      return stats.researchCompleted;
    case 'planets_colonized':
    case 'first_colony':
      return stats.planetsColonized;
    case 'fleet_missions':
      return stats.fleetsDispatched;
    case 'espionage_reports':
      return stats.espionageSent;
    case 'alliance_joined':
      return stats.allianceJoined ? 1 : 0;
    case 'trades_completed':
      return stats.tradesCompleted;
    case 'deathstars_built':
      return stats.deathstarsBuilt;
    case 'agent_decisions':
      return stats.agentDecisions;
    case 'play_days':
      return stats.playTimeDays;
    default:
      return 0;
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Load and aggregate all player stats from D1 tables.
 *
 * Reads from: player_stats, battle_reports, planets, build_history
 *
 * @param playerId - The player ID to load stats for
 * @param db       - D1 database binding
 */
export async function getPlayerStats(
  playerId: string,
  db: D1Database
): Promise<AggregatedPlayerStats> {
  // Fetch core stats row
  const statsRow = await db
    .prepare('SELECT * FROM player_stats WHERE player_id = ?')
    .bind(playerId)
    .first() as Record<string, number> | null;

  // Compute play time from player created_at
  const playerRow = await db
    .prepare('SELECT created_at FROM players WHERE id = ?')
    .bind(playerId)
    .first() as { created_at: number } | null;

  const nowSec = Math.floor(Date.now() / 1000);
  const createdAt = playerRow?.created_at ?? nowSec;
  const playTimeDays = Math.floor((nowSec - createdAt) / 86400);

  // Check if player is in an alliance
  const allianceRow = await db
    .prepare('SELECT alliance_tag FROM players WHERE id = ? AND alliance_tag IS NOT NULL')
    .bind(playerId)
    .first();

  // Count deathstars built: sum deathstar column across all fleets for this player
  const deathstarRow = await db
    .prepare('SELECT COALESCE(SUM(deathstar), 0) AS total FROM fleets WHERE player_id = ?')
    .bind(playerId)
    .first() as { total: number } | null;

  return {
    battlesWon: (statsRow?.battles_won ?? 0) as number,
    battlesLost: (statsRow?.battles_lost ?? 0) as number,
    battlesDraw: (statsRow?.battles_draw ?? 0) as number,
    shipsDestroyed: (statsRow?.ships_destroyed ?? 0) as number,
    shipsLost: (statsRow?.ships_lost ?? 0) as number,
    resourcesRaided:
      ((statsRow?.resources_raided_metal ?? 0) as number) +
      ((statsRow?.resources_raided_crystal ?? 0) as number) +
      ((statsRow?.resources_raided_deut ?? 0) as number),
    fleetsDispatched: (statsRow?.fleets_dispatched ?? 0) as number,
    espionageSent: (statsRow?.espionage_sent ?? 0) as number,
    buildingsBuilt: (statsRow?.buildings_built ?? 0) as number,
    researchCompleted: (statsRow?.research_completed ?? 0) as number,
    planetsColonized: (statsRow?.planets_colonized ?? 0) as number,
    tradesCompleted: (statsRow?.trades_completed ?? 0) as number,
    agentDecisions: (statsRow?.agent_decisions ?? 0) as number,
    playTimeDays,
    allianceJoined: !!allianceRow,
    deathstarsBuilt: (deathstarRow?.total ?? 0) as number,
  };
}

/**
 * Get all achievements a player has unlocked.
 *
 * @param playerId - The player ID
 * @param db       - D1 database binding
 * @returns Array of PlayerAchievement with full Achievement metadata merged in
 */
export async function getPlayerAchievements(
  playerId: string,
  db: D1Database
): Promise<(PlayerAchievement & { achievement: Achievement })[]> {
  const rows = await db
    .prepare('SELECT achievement_id, player_id, unlocked_at FROM player_achievements WHERE player_id = ?')
    .bind(playerId)
    .all();

  return (rows.results as unknown as PlayerAchievementRow[]).map((row) => ({
    achievementId: row.achievement_id,
    playerId: row.player_id,
    unlockedAt: row.unlocked_at,
    progress: 100,
    achievement: ACHIEVEMENT_MAP[row.achievement_id],
  })).filter((pa) => pa.achievement !== undefined);
}

/**
 * Calculate the progress percentage (0–100) toward a specific achievement.
 *
 * @param achievementId - The achievement to check
 * @param stats         - Current aggregated player stats
 */
export function getAchievementProgress(
  achievementId: string,
  stats: AggregatedPlayerStats
): number {
  const achievement = ACHIEVEMENT_MAP[achievementId];
  if (!achievement) return 0;

  const current = getStatValueForRequirement(achievement.requirement, stats);
  const threshold = achievement.requirement.threshold;

  if (threshold <= 0) return 100;
  return Math.min(100, Math.floor((current / threshold) * 100));
}

/**
 * Unlock (award) an achievement for a player and log it.
 *
 * Inserts into player_achievements table. Silently ignores duplicate unlocks
 * (the PRIMARY KEY constraint will reject them without throwing for OR IGNORE).
 *
 * @param playerId      - The player to award the achievement to
 * @param achievementId - The achievement to unlock
 * @param db            - D1 database binding
 */
export async function awardAchievement(
  playerId: string,
  achievementId: string,
  db: D1Database
): Promise<boolean> {
  const achievement = ACHIEVEMENT_MAP[achievementId];
  if (!achievement) {
    console.warn(`[AchievementService] Unknown achievement: ${achievementId}`);
    return false;
  }

  try {
    const result = await db
      .prepare(
        `INSERT OR IGNORE INTO player_achievements (player_id, achievement_id, unlocked_at)
         VALUES (?, ?, ?)`
      )
      .bind(playerId, achievementId, Math.floor(Date.now() / 1000))
      .run();

    // meta.changes > 0 means a new row was inserted (not a duplicate)
    const wasNew = (result.meta?.changes ?? 0) > 0;

    if (wasNew) {
      console.log(
        `[AchievementService] Player ${playerId} unlocked "${achievement.name}" (+${achievement.points} pts)`
      );
    }

    return wasNew;
  } catch (err) {
    console.error(`[AchievementService] Failed to award achievement ${achievementId}:`, err);
    return false;
  }
}

/**
 * Check all achievements for a player and unlock any newly earned ones.
 *
 * This is the main entry point for achievement evaluation. Call it after any
 * event that could trigger an achievement (battle, build, colonize, etc.).
 *
 * @param playerId - The player to check
 * @param stats    - Current aggregated player stats (pre-loaded for efficiency)
 * @param db       - D1 database binding
 * @returns Array of newly unlocked achievement IDs
 */
export async function checkAchievements(
  playerId: string,
  stats: AggregatedPlayerStats,
  db: D1Database
): Promise<string[]> {
  // Load already-unlocked achievement IDs to skip them
  const alreadyUnlocked = await db
    .prepare('SELECT achievement_id FROM player_achievements WHERE player_id = ?')
    .bind(playerId)
    .all();

  const unlockedSet = new Set(
    (alreadyUnlocked.results as { achievement_id: string }[]).map((r) => r.achievement_id)
  );

  const newlyUnlocked: string[] = [];

  for (const achievement of ACHIEVEMENTS) {
    if (unlockedSet.has(achievement.id)) continue; // already awarded

    const currentValue = getStatValueForRequirement(achievement.requirement, stats);

    if (currentValue >= achievement.requirement.threshold) {
      const awarded = await awardAchievement(playerId, achievement.id, db);
      if (awarded) {
        newlyUnlocked.push(achievement.id);
      }
    }
  }

  return newlyUnlocked;
}

// ============================================================================
// CONVENIENCE CLASS WRAPPER
// ============================================================================

export class AchievementService {
  /** Return the full list of all achievements */
  getAllAchievements(): Achievement[] {
    return ACHIEVEMENTS;
  }

  /** Return achievement definition by ID */
  getAchievement(id: string): Achievement | undefined {
    return ACHIEVEMENT_MAP[id];
  }

  /** Load and aggregate player stats from D1 */
  async getPlayerStats(playerId: string, db: D1Database): Promise<AggregatedPlayerStats> {
    return getPlayerStats(playerId, db);
  }

  /** Get unlocked achievements for a player */
  async getPlayerAchievements(
    playerId: string,
    db: D1Database
  ): Promise<(PlayerAchievement & { achievement: Achievement })[]> {
    return getPlayerAchievements(playerId, db);
  }

  /** Get progress (0–100) toward a specific achievement */
  getAchievementProgress(achievementId: string, stats: AggregatedPlayerStats): number {
    return getAchievementProgress(achievementId, stats);
  }

  /** Award an achievement to a player */
  async awardAchievement(playerId: string, achievementId: string, db: D1Database): Promise<boolean> {
    return awardAchievement(playerId, achievementId, db);
  }

  /** Check all achievements and unlock any newly earned ones */
  async checkAchievements(
    playerId: string,
    stats: AggregatedPlayerStats,
    db: D1Database
  ): Promise<string[]> {
    return checkAchievements(playerId, stats, db);
  }

  /**
   * Calculate total achievement points for a player.
   * Sums the point values of all unlocked achievements.
   */
  async getTotalPoints(playerId: string, db: D1Database): Promise<number> {
    const unlocked = await getPlayerAchievements(playerId, db);
    return unlocked.reduce((sum, pa) => sum + (pa.achievement?.points ?? 0), 0);
  }
}

/** Singleton instance for global use */
export const achievementService = new AchievementService();
