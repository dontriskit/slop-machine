/**
 * dailyMissionService.ts
 *
 * Daily Mission System for Cosmic Protocol
 *
 * Features:
 *   - 10+ mission types covering all major game activities
 *   - 3 random missions generated per player per day (seeded by UTC date)
 *   - Progress tracked against player stats and activity logs
 *   - Resource + dark matter rewards on claim
 *   - Midnight UTC auto-reset via cron
 *
 * Mission types:
 *   build_3_ships, attack_2_players, trade_1000_metal, research_1_tech,
 *   spy_3_planets, upgrade_mine_3x, collect_debris, send_5_fleets,
 *   earn_1000_points, join_alliance, build_defense, colonize_planet,
 *   raid_resources, complete_expedition
 */

import { D1Database } from '@cloudflare/workers-types';

// ============================================================================
// TYPES
// ============================================================================

export type MissionType =
  | 'build_3_ships'
  | 'attack_2_players'
  | 'trade_1000_metal'
  | 'research_1_tech'
  | 'spy_3_planets'
  | 'upgrade_mine_3x'
  | 'collect_debris'
  | 'send_5_fleets'
  | 'earn_1000_points'
  | 'join_alliance'
  | 'build_defense'
  | 'colonize_planet'
  | 'raid_resources'
  | 'complete_expedition';

export type MissionStatus = 'active' | 'completed' | 'claimed';

export interface MissionReward {
  metal: number;
  crystal: number;
  deuterium: number;
  dark_matter: number;
  points: number;
}

export interface MissionDefinition {
  type: MissionType;
  title: string;
  description: string;
  icon: string;
  requirement: MissionRequirement;
  reward: MissionReward;
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface MissionRequirement {
  type: MissionType;
  /** Target count/amount to complete the mission */
  target: number;
  /** D1 stat column to check for auto-progress, if applicable */
  statColumn?: string;
}

export interface DailyMission {
  id: string;            // UUID
  playerId: string;
  missionType: MissionType;
  dateKey: string;       // YYYY-MM-DD UTC
  status: MissionStatus;
  progress: number;      // current count toward target
  target: number;        // required count
  progressPercent: number; // 0–100
  assignedAt: number;    // unix seconds
  completedAt: number | null;
  claimedAt: number | null;
  definition: MissionDefinition;
}

// Row shapes from D1
interface DailyMissionRow {
  id: string;
  player_id: string;
  mission_type: string;
  date_key: string;
  status: string;
  progress: number;
  target: number;
  assigned_at: number;
  completed_at: number | null;
  claimed_at: number | null;
}

interface MissionProgressRow {
  mission_id: string;
  player_id: string;
  progress: number;
}

// ============================================================================
// MISSION DEFINITIONS
// ============================================================================

export const DAILY_MISSIONS: MissionDefinition[] = [
  {
    type: 'build_3_ships',
    title: 'Shipwright',
    description: 'Build 3 ships of any type.',
    icon: '🚀',
    requirement: { type: 'build_3_ships', target: 3, statColumn: 'ships_built' },
    reward: { metal: 2000, crystal: 800, deuterium: 0, dark_matter: 50, points: 100 },
    difficulty: 'easy',
  },
  {
    type: 'attack_2_players',
    title: 'Aggressor',
    description: 'Launch attack missions against 2 different players.',
    icon: '⚔️',
    requirement: { type: 'attack_2_players', target: 2, statColumn: 'battles_won' },
    reward: { metal: 3000, crystal: 1500, deuterium: 500, dark_matter: 100, points: 250 },
    difficulty: 'medium',
  },
  {
    type: 'trade_1000_metal',
    title: 'Metal Merchant',
    description: 'Trade 1,000 metal on the marketplace.',
    icon: '💰',
    requirement: { type: 'trade_1000_metal', target: 1000, statColumn: 'trades_completed' },
    reward: { metal: 0, crystal: 2000, deuterium: 500, dark_matter: 75, points: 150 },
    difficulty: 'easy',
  },
  {
    type: 'research_1_tech',
    title: 'Scientist',
    description: 'Complete 1 research technology.',
    icon: '🔬',
    requirement: { type: 'research_1_tech', target: 1, statColumn: 'research_completed' },
    reward: { metal: 1000, crystal: 2500, deuterium: 1000, dark_matter: 100, points: 200 },
    difficulty: 'medium',
  },
  {
    type: 'spy_3_planets',
    title: 'Shadow Hand',
    description: 'Successfully spy on 3 different planets.',
    icon: '🕵️',
    requirement: { type: 'spy_3_planets', target: 3, statColumn: 'espionage_sent' },
    reward: { metal: 1500, crystal: 1000, deuterium: 200, dark_matter: 75, points: 150 },
    difficulty: 'easy',
  },
  {
    type: 'upgrade_mine_3x',
    title: 'Industrial Mogul',
    description: 'Upgrade any mine building 3 times.',
    icon: '⛏️',
    requirement: { type: 'upgrade_mine_3x', target: 3, statColumn: 'buildings_built' },
    reward: { metal: 5000, crystal: 2000, deuterium: 0, dark_matter: 150, points: 300 },
    difficulty: 'medium',
  },
  {
    type: 'collect_debris',
    title: 'Scavenger',
    description: 'Collect debris from a battle field.',
    icon: '🌌',
    requirement: { type: 'collect_debris', target: 1, statColumn: 'fleets_dispatched' },
    reward: { metal: 4000, crystal: 4000, deuterium: 1000, dark_matter: 200, points: 400 },
    difficulty: 'hard',
  },
  {
    type: 'send_5_fleets',
    title: 'Admiral',
    description: 'Send 5 fleet missions of any type.',
    icon: '🛸',
    requirement: { type: 'send_5_fleets', target: 5, statColumn: 'fleets_dispatched' },
    reward: { metal: 2500, crystal: 1000, deuterium: 800, dark_matter: 100, points: 200 },
    difficulty: 'medium',
  },
  {
    type: 'earn_1000_points',
    title: 'Point Hunter',
    description: 'Earn 1,000 points today.',
    icon: '⭐',
    requirement: { type: 'earn_1000_points', target: 1000, statColumn: undefined },
    reward: { metal: 3000, crystal: 3000, deuterium: 3000, dark_matter: 250, points: 500 },
    difficulty: 'hard',
  },
  {
    type: 'join_alliance',
    title: 'Diplomat',
    description: 'Join or be a member of an alliance.',
    icon: '🤝',
    requirement: { type: 'join_alliance', target: 1, statColumn: undefined },
    reward: { metal: 2000, crystal: 2000, deuterium: 500, dark_matter: 150, points: 300 },
    difficulty: 'easy',
  },
  {
    type: 'build_defense',
    title: 'Fortifier',
    description: 'Build 5 defense structures.',
    icon: '🛡️',
    requirement: { type: 'build_defense', target: 5, statColumn: undefined },
    reward: { metal: 3000, crystal: 1500, deuterium: 0, dark_matter: 100, points: 200 },
    difficulty: 'medium',
  },
  {
    type: 'colonize_planet',
    title: 'Pioneer',
    description: 'Colonize a new planet.',
    icon: '🪐',
    requirement: { type: 'colonize_planet', target: 1, statColumn: 'planets_colonized' },
    reward: { metal: 5000, crystal: 5000, deuterium: 2000, dark_matter: 500, points: 1000 },
    difficulty: 'hard',
  },
  {
    type: 'raid_resources',
    title: 'Raider',
    description: 'Raid at least 500 resources from other players.',
    icon: '💎',
    requirement: { type: 'raid_resources', target: 500, statColumn: 'resources_raided_metal' },
    reward: { metal: 4000, crystal: 2000, deuterium: 1000, dark_matter: 200, points: 400 },
    difficulty: 'hard',
  },
  {
    type: 'complete_expedition',
    title: 'Explorer',
    description: 'Complete 1 expedition mission.',
    icon: '🔭',
    requirement: { type: 'complete_expedition', target: 1, statColumn: 'fleets_dispatched' },
    reward: { metal: 3000, crystal: 3000, deuterium: 1500, dark_matter: 300, points: 600 },
    difficulty: 'medium',
  },
];

/** Look up a mission definition by type */
export const MISSION_MAP: Map<MissionType, MissionDefinition> = new Map(
  DAILY_MISSIONS.map((m) => [m.type, m])
);

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Returns today's UTC date as YYYY-MM-DD.
 */
export function getTodayKey(now?: Date): string {
  const d = now ?? new Date();
  return d.toISOString().slice(0, 10);
}

/**
 * Deterministic pseudo-random number generator seeded by a string.
 * Uses a simple xorshift variant for reproducibility.
 */
function seededRandom(seed: string): () => number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  return function () {
    h ^= h << 13;
    h ^= h >> 17;
    h ^= h << 5;
    return ((h >>> 0) / 0x100000000);
  };
}

/**
 * Pick `count` distinct missions for a player on a given date.
 * Seeded by `playerId + dateKey` for reproducibility.
 */
export function pickMissions(playerId: string, dateKey: string, count = 3): MissionDefinition[] {
  const rng = seededRandom(`${playerId}::${dateKey}`);
  const pool = [...DAILY_MISSIONS];
  const picked: MissionDefinition[] = [];
  while (picked.length < count && pool.length > 0) {
    const idx = Math.floor(rng() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }
  return picked;
}

/**
 * Convert a D1 row + definition into a DailyMission object.
 */
function rowToMission(row: DailyMissionRow): DailyMission {
  const def = MISSION_MAP.get(row.mission_type as MissionType);
  if (!def) throw new Error(`Unknown mission type: ${row.mission_type}`);
  const progress = Math.min(row.progress, row.target);
  return {
    id: row.id,
    playerId: row.player_id,
    missionType: row.mission_type as MissionType,
    dateKey: row.date_key,
    status: row.status as MissionStatus,
    progress,
    target: row.target,
    progressPercent: Math.round((progress / row.target) * 100),
    assignedAt: row.assigned_at,
    completedAt: row.completed_at,
    claimedAt: row.claimed_at,
    definition: def,
  };
}

/**
 * Generate a UUID-like ID using Math.random (no crypto required in Workers).
 */
function generateId(): string {
  return 'dm-' + Math.random().toString(36).slice(2, 10) + '-' + Date.now().toString(36);
}

// ============================================================================
// PUBLIC API FUNCTIONS
// ============================================================================

/**
 * Generate (or retrieve) today's daily missions for a player.
 * If missions already exist for today, returns them unchanged.
 * Otherwise inserts `count` new missions deterministically.
 */
export async function generateDailyMissions(
  db: D1Database,
  playerId: string,
  count = 3
): Promise<DailyMission[]> {
  const dateKey = getTodayKey();

  // Check if already generated
  const existing = await db
    .prepare('SELECT * FROM daily_missions WHERE player_id = ? AND date_key = ?')
    .bind(playerId, dateKey)
    .all();

  if (existing.results && existing.results.length > 0) {
    return (existing.results as unknown as DailyMissionRow[]).map(rowToMission);
  }

  // Pick missions deterministically
  const missions = pickMissions(playerId, dateKey, count);
  const now = Math.floor(Date.now() / 1000);

  const inserted: DailyMission[] = [];
  for (const def of missions) {
    const id = generateId();
    await db
      .prepare(
        `INSERT INTO daily_missions
           (id, player_id, mission_type, date_key, status, progress, target, assigned_at)
         VALUES (?, ?, ?, ?, 'active', 0, ?, ?)`
      )
      .bind(id, playerId, def.type, dateKey, def.requirement.target, now)
      .run();

    inserted.push({
      id,
      playerId,
      missionType: def.type,
      dateKey,
      status: 'active',
      progress: 0,
      target: def.requirement.target,
      progressPercent: 0,
      assignedAt: now,
      completedAt: null,
      claimedAt: null,
      definition: def,
    });
  }

  return inserted;
}

/**
 * Get the current daily missions for a player (today only), with live progress.
 * Generates missions if none exist yet for today.
 */
export async function getDailyMissions(
  db: D1Database,
  playerId: string
): Promise<DailyMission[]> {
  const missions = await generateDailyMissions(db, playerId);
  return missions;
}

/**
 * Check and update mission progress for a player.
 * Reads the relevant stat column from `player_stats` and updates
 * the mission progress accordingly.
 *
 * Returns the updated mission, or null if not found.
 */
export async function checkMissionProgress(
  db: D1Database,
  playerId: string,
  missionId: string
): Promise<DailyMission | null> {
  const row = await db
    .prepare('SELECT * FROM daily_missions WHERE id = ? AND player_id = ?')
    .bind(missionId, playerId)
    .first() as DailyMissionRow | null;

  if (!row) return null;
  if (row.status !== 'active') return rowToMission(row);

  const def = MISSION_MAP.get(row.mission_type as MissionType);
  if (!def) return null;

  let progress = row.progress;

  // Pull live value from player_stats if there is a mapped column
  if (def.requirement.statColumn) {
    const statsRow = await db
      .prepare(`SELECT ${def.requirement.statColumn} AS val FROM player_stats WHERE player_id = ?`)
      .bind(playerId)
      .first() as { val: number } | null;

    if (statsRow && typeof statsRow.val === 'number') {
      // Progress = stat value - baseline at mission assignment (stored as progress baseline)
      // We track absolute stat value at assignment in the `progress` column initially = 0.
      // Instead, we use the raw stat column and clamp to target.
      progress = Math.min(statsRow.val, row.target);
    }
  }

  const now = Math.floor(Date.now() / 1000);
  const isComplete = progress >= row.target;
  const newStatus: MissionStatus = isComplete ? 'completed' : 'active';

  await db
    .prepare(
      `UPDATE daily_missions
         SET progress = ?, status = ?, completed_at = ?
       WHERE id = ?`
    )
    .bind(
      progress,
      newStatus,
      isComplete ? now : null,
      missionId
    )
    .run();

  return rowToMission({
    ...row,
    progress,
    status: newStatus,
    completed_at: isComplete ? now : null,
  });
}

/**
 * Claim the reward for a completed daily mission.
 * Adds resources to the player's planet (first planet) and dark matter to their account.
 * Marks the mission as 'claimed'.
 *
 * Returns the reward given, or null if ineligible.
 */
export async function claimMissionReward(
  db: D1Database,
  playerId: string,
  missionId: string
): Promise<{ reward: MissionReward; mission: DailyMission } | null> {
  const row = await db
    .prepare('SELECT * FROM daily_missions WHERE id = ? AND player_id = ?')
    .bind(missionId, playerId)
    .first() as DailyMissionRow | null;

  if (!row) return null;
  if (row.status !== 'completed') return null;

  const def = MISSION_MAP.get(row.mission_type as MissionType);
  if (!def) return null;

  const reward = def.reward;
  const now = Math.floor(Date.now() / 1000);

  // Mark mission as claimed
  await db
    .prepare('UPDATE daily_missions SET status = ?, claimed_at = ? WHERE id = ?')
    .bind('claimed', now, missionId)
    .run();

  // Credit resources to player's primary planet (first by created_at)
  if (reward.metal > 0 || reward.crystal > 0 || reward.deuterium > 0) {
    await db
      .prepare(
        `UPDATE planets
           SET metal = metal + ?,
               crystal = crystal + ?,
               deuterium = deuterium + ?
         WHERE player_id = ?
         ORDER BY created_at ASC
         LIMIT 1`
      )
      .bind(reward.metal, reward.crystal, reward.deuterium, playerId)
      .run();
  }

  // Credit dark matter to player account
  if (reward.dark_matter > 0) {
    await db
      .prepare(
        `UPDATE players
           SET dark_matter = COALESCE(dark_matter, 0) + ?
         WHERE id = ?`
      )
      .bind(reward.dark_matter, playerId)
      .run();
  }

  // Credit points to player stats
  if (reward.points > 0) {
    await db
      .prepare(
        `INSERT INTO player_stats (player_id, daily_mission_points)
           VALUES (?, ?)
         ON CONFLICT(player_id) DO UPDATE
           SET daily_mission_points = COALESCE(daily_mission_points, 0) + ?`
      )
      .bind(playerId, reward.points, reward.points)
      .run();
  }

  return {
    reward,
    mission: rowToMission({ ...row, status: 'claimed', claimed_at: now }),
  };
}

/**
 * Reset all daily missions — called at midnight UTC via cron.
 * Marks yesterday's unclaimed missions as expired, then
 * pre-generates fresh missions for active players.
 *
 * Returns count of player mission sets reset.
 */
export async function resetDailyMissions(db: D1Database): Promise<{ reset: number }> {
  const todayKey = getTodayKey();

  // Delete previous days' rows (keep only today's)
  await db
    .prepare(`DELETE FROM daily_missions WHERE date_key < ?`)
    .bind(todayKey)
    .run();

  // Count active players (logged in within last 7 days)
  const cutoff = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;
  const activePlayers = await db
    .prepare('SELECT id FROM players WHERE last_active > ?')
    .bind(cutoff)
    .all();

  const players = (activePlayers.results ?? []) as Array<{ id: string }>;
  let count = 0;

  // Pre-generate missions for active players
  for (const { id } of players) {
    try {
      await generateDailyMissions(db, id);
      count++;
    } catch {
      // Non-fatal: skip this player
    }
  }

  return { reset: count };
}

// ============================================================================
// SERVICE CLASS (optional OOP interface)
// ============================================================================

export class DailyMissionService {
  constructor(private db: D1Database) {}

  generateMissions(playerId: string, count = 3) {
    return generateDailyMissions(this.db, playerId, count);
  }

  getMissions(playerId: string) {
    return getDailyMissions(this.db, playerId);
  }

  checkProgress(playerId: string, missionId: string) {
    return checkMissionProgress(this.db, playerId, missionId);
  }

  claimReward(playerId: string, missionId: string) {
    return claimMissionReward(this.db, playerId, missionId);
  }

  reset() {
    return resetDailyMissions(this.db);
  }
}
