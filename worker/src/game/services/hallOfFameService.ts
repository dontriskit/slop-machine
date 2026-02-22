/**
 * hallOfFameService.ts
 *
 * Hall of Fame: tracks all-time records across key categories.
 *
 * Categories:
 *   biggest_battle          - most ships involved in a single battle
 *   most_resources_raided   - single-raid resources collected
 *   fastest_research        - shortest time (seconds) to complete any research tech
 *   largest_fleet           - most ships in a single fleet dispatch
 *   most_planets            - most planets owned simultaneously
 *   highest_score           - peak total score
 *   most_battles_won        - cumulative battle wins
 *   longest_alliance        - alliance age in seconds at dissolution or current
 *   richest_player          - cumulative resources raided
 *   most_debris_collected   - total debris collected
 */

// ============================================================================
// TYPES
// ============================================================================

export type HallOfFameCategory =
  | 'biggest_battle'
  | 'most_resources_raided'
  | 'fastest_research'
  | 'largest_fleet'
  | 'most_planets'
  | 'highest_score'
  | 'most_battles_won'
  | 'longest_alliance'
  | 'richest_player'
  | 'most_debris_collected';

export const HALL_OF_FAME_CATEGORIES: HallOfFameCategory[] = [
  'biggest_battle',
  'most_resources_raided',
  'fastest_research',
  'largest_fleet',
  'most_planets',
  'highest_score',
  'most_battles_won',
  'longest_alliance',
  'richest_player',
  'most_debris_collected',
];

/** Higher value = better, except for fastest_research where lower = better */
export const CATEGORY_LOWER_IS_BETTER: Set<HallOfFameCategory> = new Set([
  'fastest_research',
]);

export interface HallOfFameRecord {
  id: string;
  category: HallOfFameCategory;
  playerId: string;
  playerName: string;
  value: number;
  metadata: Record<string, unknown>;
  achievedAt: number; // unix seconds
  isActive: boolean;  // current record holder
}

export interface HallOfFameEntry {
  category: HallOfFameCategory;
  label: string;
  description: string;
  unit: string;
  currentRecord: HallOfFameRecord | null;
}

export interface CheckAndUpdateEvent {
  type:
    | 'battle_completed'
    | 'resources_raided'
    | 'research_completed'
    | 'fleet_dispatched'
    | 'planet_colonized'
    | 'score_updated'
    | 'battle_won'
    | 'alliance_dissolved'
    | 'debris_collected';
  value: number;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// CATEGORY METADATA
// ============================================================================

interface CategoryMeta {
  label: string;
  description: string;
  unit: string;
}

export const CATEGORY_META: Record<HallOfFameCategory, CategoryMeta> = {
  biggest_battle: {
    label: 'Biggest Battle',
    description: 'Most ships involved in a single battle',
    unit: 'ships',
  },
  most_resources_raided: {
    label: 'Most Resources Raided',
    description: 'Most resources collected in a single raid',
    unit: 'resources',
  },
  fastest_research: {
    label: 'Fastest Research',
    description: 'Shortest time to complete a research technology',
    unit: 'seconds',
  },
  largest_fleet: {
    label: 'Largest Fleet',
    description: 'Most ships dispatched in a single fleet mission',
    unit: 'ships',
  },
  most_planets: {
    label: 'Most Planets',
    description: 'Maximum number of planets owned simultaneously',
    unit: 'planets',
  },
  highest_score: {
    label: 'Highest Score',
    description: 'Peak total score ever achieved',
    unit: 'points',
  },
  most_battles_won: {
    label: 'Most Battles Won',
    description: 'Cumulative battle victories',
    unit: 'battles',
  },
  longest_alliance: {
    label: 'Longest Alliance',
    description: 'Alliance that lasted the longest',
    unit: 'seconds',
  },
  richest_player: {
    label: 'Richest Player',
    description: 'Most cumulative resources raided across all time',
    unit: 'resources',
  },
  most_debris_collected: {
    label: 'Most Debris Collected',
    description: 'Most total debris collected',
    unit: 'resources',
  },
};

// ============================================================================
// HELPERS
// ============================================================================

function generateId(): string {
  return `hof_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Determine whether newValue beats the existing record for a category.
 * For fastest_research, lower is better.
 */
function beatsRecord(
  category: HallOfFameCategory,
  newValue: number,
  existingValue: number | null
): boolean {
  if (existingValue === null) return true;
  if (CATEGORY_LOWER_IS_BETTER.has(category)) {
    return newValue < existingValue;
  }
  return newValue > existingValue;
}

// ============================================================================
// DATABASE OPERATIONS
// ============================================================================

/** Row shape as stored in D1 */
interface HallOfFameRow {
  id: string;
  category: string;
  player_id: string;
  player_name: string;
  value: number;
  metadata: string;
  achieved_at: number;
  is_active: number; // 0 | 1
}

function rowToRecord(row: HallOfFameRow): HallOfFameRecord {
  let meta: Record<string, unknown> = {};
  try {
    meta = JSON.parse(row.metadata || '{}');
  } catch {
    // ignore parse errors
  }
  return {
    id: row.id,
    category: row.category as HallOfFameCategory,
    playerId: row.player_id,
    playerName: row.player_name,
    value: row.value,
    metadata: meta,
    achievedAt: row.achieved_at,
    isActive: row.is_active === 1,
  };
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Submit a potential new record for a category.
 *
 * If the value beats the current record:
 *   1. Mark the old record as inactive.
 *   2. Insert the new record as active.
 *
 * Returns the new record if it broke the old one, null otherwise.
 *
 * @param db         - D1 database binding
 * @param category   - The Hall of Fame category
 * @param playerId   - Player attempting the record
 * @param value      - The numeric value (ships, resources, seconds, etc.)
 * @param metadata   - Extra context (e.g. battle report ID, tech name)
 */
export async function submitRecord(
  db: D1Database,
  category: HallOfFameCategory,
  playerId: string,
  value: number,
  metadata: Record<string, unknown> = {}
): Promise<HallOfFameRecord | null> {
  // Resolve player name
  const playerRow = await db
    .prepare('SELECT name FROM players WHERE id = ?')
    .bind(playerId)
    .first<{ name: string }>();

  const playerName = playerRow?.name ?? 'Unknown Player';

  // Fetch current active record for this category
  const currentRow = await db
    .prepare(
      'SELECT * FROM hall_of_fame WHERE category = ? AND is_active = 1 ORDER BY achieved_at DESC LIMIT 1'
    )
    .bind(category)
    .first<HallOfFameRow>();

  const currentValue = currentRow ? currentRow.value : null;

  if (!beatsRecord(category, value, currentValue)) {
    return null; // not a new record
  }

  // Deactivate old record
  if (currentRow) {
    await db
      .prepare('UPDATE hall_of_fame SET is_active = 0 WHERE category = ? AND is_active = 1')
      .bind(category)
      .run();
  }

  // Insert new record
  const newId = generateId();
  const now = Math.floor(Date.now() / 1000);

  await db
    .prepare(
      `INSERT INTO hall_of_fame (id, category, player_id, player_name, value, metadata, achieved_at, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
    )
    .bind(newId, category, playerId, playerName, value, JSON.stringify(metadata), now)
    .run();

  return {
    id: newId,
    category,
    playerId,
    playerName,
    value,
    metadata,
    achievedAt: now,
    isActive: true,
  };
}

/**
 * Get the full Hall of Fame: one entry per category showing the current record holder.
 *
 * @param db - D1 database binding
 */
export async function getHallOfFame(db: D1Database): Promise<HallOfFameEntry[]> {
  // Fetch all active records in one query
  const result = await db
    .prepare('SELECT * FROM hall_of_fame WHERE is_active = 1')
    .all<HallOfFameRow>();

  const activeByCategory = new Map<string, HallOfFameRow>();
  for (const row of result.results ?? []) {
    activeByCategory.set(row.category, row);
  }

  return HALL_OF_FAME_CATEGORIES.map((category) => {
    const row = activeByCategory.get(category);
    const meta = CATEGORY_META[category];
    return {
      category,
      label: meta.label,
      description: meta.description,
      unit: meta.unit,
      currentRecord: row ? rowToRecord(row) : null,
    };
  });
}

/**
 * Get a single Hall of Fame category entry with current record.
 *
 * @param db       - D1 database binding
 * @param category - The category to fetch
 */
export async function getHallOfFameCategory(
  db: D1Database,
  category: HallOfFameCategory
): Promise<HallOfFameEntry | null> {
  if (!HALL_OF_FAME_CATEGORIES.includes(category)) {
    return null;
  }

  const row = await db
    .prepare('SELECT * FROM hall_of_fame WHERE category = ? AND is_active = 1 ORDER BY achieved_at DESC LIMIT 1')
    .bind(category)
    .first<HallOfFameRow>();

  const meta = CATEGORY_META[category];
  return {
    category,
    label: meta.label,
    description: meta.description,
    unit: meta.unit,
    currentRecord: row ? rowToRecord(row) : null,
  };
}

/**
 * Get the history of previous record holders for a category (most recent first).
 *
 * @param db       - D1 database binding
 * @param category - The category to fetch history for
 * @param limit    - Max number of historical records to return (default 10)
 */
export async function getRecordHistory(
  db: D1Database,
  category: HallOfFameCategory,
  limit = 10
): Promise<HallOfFameRecord[]> {
  const safeLimit = Math.min(100, Math.max(1, limit));

  const result = await db
    .prepare(
      `SELECT * FROM hall_of_fame
       WHERE category = ?
       ORDER BY achieved_at DESC
       LIMIT ?`
    )
    .bind(category, safeLimit)
    .all<HallOfFameRow>();

  return (result.results ?? []).map(rowToRecord);
}

/**
 * Auto-check if a game event produces any new records and persist them.
 *
 * Call this after battles, builds, research completions, etc.
 *
 * @param db       - D1 database binding
 * @param playerId - The player associated with the event
 * @param event    - The event type and value
 * @returns Array of newly set records
 */
export async function checkAndUpdateRecords(
  db: D1Database,
  playerId: string,
  event: CheckAndUpdateEvent
): Promise<HallOfFameRecord[]> {
  const newRecords: HallOfFameRecord[] = [];
  const meta = event.metadata ?? {};

  const trySubmit = async (
    category: HallOfFameCategory,
    value: number,
    extraMeta?: Record<string, unknown>
  ) => {
    const record = await submitRecord(db, category, playerId, value, {
      ...meta,
      ...extraMeta,
    });
    if (record) newRecords.push(record);
  };

  switch (event.type) {
    case 'battle_completed':
      // value = total ships involved (attacker + defender)
      await trySubmit('biggest_battle', event.value);
      break;

    case 'resources_raided':
      // value = resources taken in this single raid
      await trySubmit('most_resources_raided', event.value);
      // Also update richest_player using cumulative raided stat
      await updateRichestPlayer(db, playerId, newRecords);
      break;

    case 'research_completed':
      // value = seconds taken to complete the research
      await trySubmit('fastest_research', event.value);
      break;

    case 'fleet_dispatched':
      // value = total ships in this fleet
      await trySubmit('largest_fleet', event.value);
      break;

    case 'planet_colonized':
      // value = current planet count for this player
      await trySubmit('most_planets', event.value);
      break;

    case 'score_updated':
      // value = current score
      await trySubmit('highest_score', event.value);
      break;

    case 'battle_won':
      // value = cumulative battle wins
      await trySubmit('most_battles_won', event.value);
      break;

    case 'alliance_dissolved':
      // value = alliance age in seconds
      await trySubmit('longest_alliance', event.value);
      break;

    case 'debris_collected':
      // value = total debris ever collected by this player
      await trySubmit('most_debris_collected', event.value);
      break;
  }

  return newRecords;
}

/**
 * Internal: look up cumulative resources_raided for a player and check richest_player record.
 */
async function updateRichestPlayer(
  db: D1Database,
  playerId: string,
  newRecords: HallOfFameRecord[]
): Promise<void> {
  try {
    const statsRow = await db
      .prepare(
        `SELECT
           COALESCE(resources_raided_metal, 0) + COALESCE(resources_raided_crystal, 0) + COALESCE(resources_raided_deut, 0) AS total_raided
         FROM player_stats WHERE player_id = ?`
      )
      .bind(playerId)
      .first<{ total_raided: number }>();

    if (statsRow && statsRow.total_raided > 0) {
      const record = await submitRecord(db, 'richest_player', playerId, statsRow.total_raided, {
        source: 'cumulative_raided',
      });
      if (record) newRecords.push(record);
    }
  } catch {
    // player_stats table may not have data yet — skip silently
  }
}

/**
 * Get records held by a specific player (active records only).
 *
 * @param db       - D1 database binding
 * @param playerId - Player ID to check
 */
export async function getPlayerRecords(
  db: D1Database,
  playerId: string
): Promise<HallOfFameRecord[]> {
  const result = await db
    .prepare('SELECT * FROM hall_of_fame WHERE player_id = ? AND is_active = 1 ORDER BY achieved_at DESC')
    .bind(playerId)
    .all<HallOfFameRow>();

  return (result.results ?? []).map(rowToRecord);
}

// ============================================================================
// CONVENIENCE CLASS WRAPPER
// ============================================================================

export class HallOfFameService {
  async submitRecord(
    db: D1Database,
    category: HallOfFameCategory,
    playerId: string,
    value: number,
    metadata?: Record<string, unknown>
  ): Promise<HallOfFameRecord | null> {
    return submitRecord(db, category, playerId, value, metadata);
  }

  async getHallOfFame(db: D1Database): Promise<HallOfFameEntry[]> {
    return getHallOfFame(db);
  }

  async getHallOfFameCategory(
    db: D1Database,
    category: HallOfFameCategory
  ): Promise<HallOfFameEntry | null> {
    return getHallOfFameCategory(db, category);
  }

  async getRecordHistory(
    db: D1Database,
    category: HallOfFameCategory,
    limit?: number
  ): Promise<HallOfFameRecord[]> {
    return getRecordHistory(db, category, limit);
  }

  async checkAndUpdateRecords(
    db: D1Database,
    playerId: string,
    event: CheckAndUpdateEvent
  ): Promise<HallOfFameRecord[]> {
    return checkAndUpdateRecords(db, playerId, event);
  }

  async getPlayerRecords(db: D1Database, playerId: string): Promise<HallOfFameRecord[]> {
    return getPlayerRecords(db, playerId);
  }
}

/** Singleton instance */
export const hallOfFameService = new HallOfFameService();
