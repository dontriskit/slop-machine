/**
 * eventService.ts
 *
 * Weekly Events System for Cosmic Protocol
 *
 * Manages timed game-wide events that apply global modifiers:
 *   - double_production  — 2x resource production
 *   - double_xp          — 2x research points
 *   - reduced_build_time — 50% faster construction
 *   - combat_weekend     — +25% attack power
 *   - harvest_bonus      — 2x debris collection
 *   - fleet_speed        — +50% fleet speed
 *
 * Data flow:
 *   1. Admin schedules event (POST /api/events/create)
 *   2. Cron / request handler calls getActiveEvents() each tick
 *   3. Formula helpers (applyEventModifiers) pick up active modifiers
 *   4. Events expire automatically when end_time passes
 */

// ============================================================================
// TYPES
// ============================================================================

export type EventType =
  | 'double_production'
  | 'double_xp'
  | 'reduced_build_time'
  | 'combat_weekend'
  | 'harvest_bonus'
  | 'fleet_speed';

export type ModifierType =
  | 'production_multiplier'
  | 'xp_multiplier'
  | 'build_time_multiplier'
  | 'attack_multiplier'
  | 'debris_multiplier'
  | 'fleet_speed_multiplier';

export interface GameEvent {
  id: string;
  name: string;
  description: string;
  type: EventType;
  modifierType: ModifierType;
  /** Multiplier value. E.g. 2.0 = double, 0.5 = half time, 1.25 = +25%. */
  modifierValue: number;
  startTime: number;  // unix seconds
  endTime: number;    // unix seconds
  createdAt: number;  // unix seconds
  createdBy: string;  // player_id or 'system'
}

/** DB row shape from game_events table */
interface GameEventRow {
  id: string;
  name: string;
  description: string;
  type: EventType;
  modifier_type: ModifierType;
  modifier_value: number;
  start_time: number;
  end_time: number;
  created_at: number;
  created_by: string;
}

export interface EventModifiers {
  productionMultiplier: number;     // 1.0 = no change
  xpMultiplier: number;
  buildTimeMultiplier: number;      // < 1.0 = faster
  attackMultiplier: number;
  debrisMultiplier: number;
  fleetSpeedMultiplier: number;
}

export interface CreateEventParams {
  name: string;
  description?: string;
  type: EventType;
  startTime: number;
  endTime: number;
  createdBy?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Default modifier values per event type (what gets written to DB) */
export const EVENT_TYPE_DEFAULTS: Record<EventType, { modifierType: ModifierType; modifierValue: number; description: string }> = {
  double_production: {
    modifierType: 'production_multiplier',
    modifierValue: 2.0,
    description: 'All resource mines produce at 2x speed.',
  },
  double_xp: {
    modifierType: 'xp_multiplier',
    modifierValue: 2.0,
    description: 'All research completes at 2x speed.',
  },
  reduced_build_time: {
    modifierType: 'build_time_multiplier',
    modifierValue: 0.5,
    description: 'Building and ship construction takes 50% less time.',
  },
  combat_weekend: {
    modifierType: 'attack_multiplier',
    modifierValue: 1.25,
    description: 'All fleets deal +25% attack damage in combat.',
  },
  harvest_bonus: {
    modifierType: 'debris_multiplier',
    modifierValue: 2.0,
    description: 'Recyclers collect 2x resources from debris fields.',
  },
  fleet_speed: {
    modifierType: 'fleet_speed_multiplier',
    modifierValue: 1.5,
    description: 'All fleet missions travel at +50% speed.',
  },
};

/** Neutral (no-op) modifiers when no events are active */
export const NEUTRAL_MODIFIERS: EventModifiers = {
  productionMultiplier: 1.0,
  xpMultiplier: 1.0,
  buildTimeMultiplier: 1.0,
  attackMultiplier: 1.0,
  debrisMultiplier: 1.0,
  fleetSpeedMultiplier: 1.0,
};

export const VALID_EVENT_TYPES: EventType[] = [
  'double_production',
  'double_xp',
  'reduced_build_time',
  'combat_weekend',
  'harvest_bonus',
  'fleet_speed',
];

// ============================================================================
// HELPERS
// ============================================================================

function generateEventId(): string {
  return `evt_${Math.random().toString(36).substr(2, 9)}_${Date.now().toString(36)}`;
}

function rowToEvent(row: GameEventRow): GameEvent {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type,
    modifierType: row.modifier_type,
    modifierValue: row.modifier_value,
    startTime: row.start_time,
    endTime: row.end_time,
    createdAt: row.created_at,
    createdBy: row.created_by,
  };
}

// ============================================================================
// CORE SERVICE FUNCTIONS
// ============================================================================

/**
 * Return all currently active events (start_time <= now <= end_time).
 */
export async function getActiveEvents(db: D1Database): Promise<GameEvent[]> {
  const now = Math.floor(Date.now() / 1000);

  const result = await db
    .prepare(
      `SELECT id, name, description, type, modifier_type, modifier_value,
              start_time, end_time, created_at, created_by
       FROM game_events
       WHERE start_time <= ? AND end_time >= ?
       ORDER BY start_time ASC`
    )
    .bind(now, now)
    .all<GameEventRow>();

  return (result.results ?? []).map(rowToEvent);
}

/**
 * Return upcoming events (start_time > now), ordered soonest first.
 *
 * @param limit - Max number of events to return (default 20)
 */
export async function getUpcomingEvents(db: D1Database, limit = 20): Promise<GameEvent[]> {
  const now = Math.floor(Date.now() / 1000);

  const result = await db
    .prepare(
      `SELECT id, name, description, type, modifier_type, modifier_value,
              start_time, end_time, created_at, created_by
       FROM game_events
       WHERE start_time > ?
       ORDER BY start_time ASC
       LIMIT ?`
    )
    .bind(now, limit)
    .all<GameEventRow>();

  return (result.results ?? []).map(rowToEvent);
}

/**
 * Return past events (end_time < now), newest-first.
 *
 * @param limit  - Max number of events to return (default 50)
 * @param offset - Pagination offset
 */
export async function getEventHistory(
  db: D1Database,
  limit = 50,
  offset = 0
): Promise<GameEvent[]> {
  const now = Math.floor(Date.now() / 1000);

  const result = await db
    .prepare(
      `SELECT id, name, description, type, modifier_type, modifier_value,
              start_time, end_time, created_at, created_by
       FROM game_events
       WHERE end_time < ?
       ORDER BY end_time DESC
       LIMIT ? OFFSET ?`
    )
    .bind(now, limit, offset)
    .all<GameEventRow>();

  return (result.results ?? []).map(rowToEvent);
}

/**
 * Fetch a single event by ID.
 */
export async function getEventById(id: string, db: D1Database): Promise<GameEvent | null> {
  const row = await db
    .prepare(
      `SELECT id, name, description, type, modifier_type, modifier_value,
              start_time, end_time, created_at, created_by
       FROM game_events WHERE id = ?`
    )
    .bind(id)
    .first<GameEventRow>();

  return row ? rowToEvent(row) : null;
}

/**
 * Schedule a new game event.
 *
 * The modifierType and modifierValue are derived from the event type unless
 * the caller explicitly overrides them.
 *
 * @throws Error if event type is invalid or time range is bad
 */
export async function createEvent(
  params: CreateEventParams,
  db: D1Database
): Promise<GameEvent> {
  const { name, type, startTime, endTime, createdBy = 'system' } = params;

  // Validate type
  if (!VALID_EVENT_TYPES.includes(type)) {
    throw new Error(`Invalid event type: "${type}". Valid types: ${VALID_EVENT_TYPES.join(', ')}`);
  }

  // Validate time range
  if (endTime <= startTime) {
    throw new Error('endTime must be after startTime');
  }
  if (endTime <= Math.floor(Date.now() / 1000)) {
    throw new Error('endTime must be in the future');
  }

  const defaults = EVENT_TYPE_DEFAULTS[type];
  const description = params.description ?? defaults.description;
  const modifierType = defaults.modifierType;
  const modifierValue = defaults.modifierValue;

  const id = generateEventId();
  const now = Math.floor(Date.now() / 1000);

  await db
    .prepare(
      `INSERT INTO game_events
         (id, name, description, type, modifier_type, modifier_value, start_time, end_time, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, name, description, type, modifierType, modifierValue, startTime, endTime, now, createdBy)
    .run();

  console.log(
    `[EventService] Created event "${name}" (${type}) from ${new Date(startTime * 1000).toISOString()} to ${new Date(endTime * 1000).toISOString()}`
  );

  return {
    id,
    name,
    description,
    type,
    modifierType,
    modifierValue,
    startTime,
    endTime,
    createdAt: now,
    createdBy,
  };
}

/**
 * Delete (cancel) an event before it ends.
 *
 * @returns true if an event was deleted, false if not found
 */
export async function deleteEvent(id: string, db: D1Database): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM game_events WHERE id = ?')
    .bind(id)
    .run();

  return (result.meta?.changes ?? 0) > 0;
}

// ============================================================================
// MODIFIER AGGREGATION
// ============================================================================

/**
 * Aggregate all currently-active event modifiers into a single EventModifiers
 * object. Multipliers stack multiplicatively.
 *
 * Example: two double_production events → 4x production.
 * In practice the scheduler should prevent overlapping events of the same type.
 */
export async function getActiveModifiers(db: D1Database): Promise<EventModifiers> {
  const activeEvents = await getActiveEvents(db);
  return computeModifiers(activeEvents);
}

/**
 * Pure function: compute aggregated modifiers from a list of events.
 * Useful for testing without hitting the DB.
 */
export function computeModifiers(events: GameEvent[]): EventModifiers {
  const mods: EventModifiers = { ...NEUTRAL_MODIFIERS };

  for (const event of events) {
    switch (event.modifierType) {
      case 'production_multiplier':
        mods.productionMultiplier *= event.modifierValue;
        break;
      case 'xp_multiplier':
        mods.xpMultiplier *= event.modifierValue;
        break;
      case 'build_time_multiplier':
        mods.buildTimeMultiplier *= event.modifierValue;
        break;
      case 'attack_multiplier':
        mods.attackMultiplier *= event.modifierValue;
        break;
      case 'debris_multiplier':
        mods.debrisMultiplier *= event.modifierValue;
        break;
      case 'fleet_speed_multiplier':
        mods.fleetSpeedMultiplier *= event.modifierValue;
        break;
    }
  }

  return mods;
}

// ============================================================================
// FORMULA HELPERS
// ============================================================================

/**
 * Apply the active event production multiplier to a raw production value.
 *
 * @param rawProduction - Base resources per hour from formula
 * @param modifiers     - Aggregated EventModifiers (call getActiveModifiers())
 * @returns Adjusted production rate
 */
export function applyProductionModifier(rawProduction: number, modifiers: EventModifiers): number {
  return rawProduction * modifiers.productionMultiplier;
}

/**
 * Apply the active event build-time multiplier to a construction time in seconds.
 *
 * @param buildTimeSeconds - Raw build time from formula
 * @param modifiers        - Aggregated EventModifiers
 * @returns Adjusted build time (always >= 1 second)
 */
export function applyBuildTimeModifier(buildTimeSeconds: number, modifiers: EventModifiers): number {
  return Math.max(1, Math.round(buildTimeSeconds * modifiers.buildTimeMultiplier));
}

/**
 * Apply the active event XP (research) multiplier to a research time.
 *
 * @param researchTimeSeconds - Raw research time from formula
 * @param modifiers           - Aggregated EventModifiers
 * @returns Adjusted research time (always >= 1 second)
 */
export function applyXpModifier(researchTimeSeconds: number, modifiers: EventModifiers): number {
  // Higher XP multiplier → faster research (inverse)
  return Math.max(1, Math.round(researchTimeSeconds / modifiers.xpMultiplier));
}

/**
 * Apply the combat attack multiplier to an attacker's weapon power.
 *
 * @param baseAttack - Attacker's base attack value
 * @param modifiers  - Aggregated EventModifiers
 */
export function applyAttackModifier(baseAttack: number, modifiers: EventModifiers): number {
  return baseAttack * modifiers.attackMultiplier;
}

/**
 * Apply the debris (harvest) multiplier to resources in a debris field.
 *
 * @param rawDebris - Raw debris value (metal + crystal)
 * @param modifiers - Aggregated EventModifiers
 */
export function applyDebrisModifier(rawDebris: number, modifiers: EventModifiers): number {
  return rawDebris * modifiers.debrisMultiplier;
}

/**
 * Apply the fleet speed multiplier to reduce flight time.
 *
 * @param baseFlightTimeSeconds - Base flight time from formula
 * @param modifiers             - Aggregated EventModifiers
 * @returns Adjusted flight time (always >= 1 second)
 */
export function applyFleetSpeedModifier(baseFlightTimeSeconds: number, modifiers: EventModifiers): number {
  return Math.max(1, Math.round(baseFlightTimeSeconds / modifiers.fleetSpeedMultiplier));
}

// ============================================================================
// PRESET SCHEDULE HELPERS
// ============================================================================

/**
 * Create a standard "double weekend" event starting on the next Saturday 00:00 UTC
 * and lasting 48 hours.
 *
 * @param type - Which event type to schedule (default: double_production)
 * @param db   - D1 database binding
 */
export async function scheduleWeekendEvent(
  type: EventType = 'double_production',
  db: D1Database
): Promise<GameEvent> {
  const now = new Date();
  // Find next Saturday (day 6)
  const dayOfWeek = now.getUTCDay(); // 0=Sun, 6=Sat
  const daysUntilSaturday = dayOfWeek === 6 ? 7 : (6 - dayOfWeek);

  const startDate = new Date(now);
  startDate.setUTCDate(now.getUTCDate() + daysUntilSaturday);
  startDate.setUTCHours(0, 0, 0, 0);

  const endDate = new Date(startDate.getTime() + 48 * 3600 * 1000); // +48h

  const defaults = EVENT_TYPE_DEFAULTS[type];
  const name = type === 'combat_weekend'
    ? 'Combat Weekend'
    : type === 'double_production'
    ? 'Double Production Weekend'
    : type === 'double_xp'
    ? 'Double XP Weekend'
    : type === 'reduced_build_time'
    ? 'Build Blitz Weekend'
    : type === 'harvest_bonus'
    ? 'Harvest Bonus Weekend'
    : 'Fleet Speed Weekend';

  return createEvent(
    {
      name,
      description: defaults.description,
      type,
      startTime: Math.floor(startDate.getTime() / 1000),
      endTime: Math.floor(endDate.getTime() / 1000),
      createdBy: 'system',
    },
    db
  );
}

/**
 * Check whether any event of a specific type is currently active.
 *
 * @param type - Event type to check
 * @param db   - D1 database binding
 */
export async function isEventTypeActive(type: EventType, db: D1Database): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);

  const row = await db
    .prepare(
      `SELECT id FROM game_events
       WHERE type = ? AND start_time <= ? AND end_time >= ?
       LIMIT 1`
    )
    .bind(type, now, now)
    .first();

  return row !== null;
}

// ============================================================================
// CLASS WRAPPER
// ============================================================================

export class EventService {
  /** Get all currently active events */
  async getActiveEvents(db: D1Database): Promise<GameEvent[]> {
    return getActiveEvents(db);
  }

  /** Get upcoming events */
  async getUpcomingEvents(db: D1Database, limit?: number): Promise<GameEvent[]> {
    return getUpcomingEvents(db, limit);
  }

  /** Get past events */
  async getEventHistory(db: D1Database, limit?: number, offset?: number): Promise<GameEvent[]> {
    return getEventHistory(db, limit, offset);
  }

  /** Get a single event by ID */
  async getEventById(id: string, db: D1Database): Promise<GameEvent | null> {
    return getEventById(id, db);
  }

  /** Create / schedule a new event */
  async createEvent(params: CreateEventParams, db: D1Database): Promise<GameEvent> {
    return createEvent(params, db);
  }

  /** Delete (cancel) an event */
  async deleteEvent(id: string, db: D1Database): Promise<boolean> {
    return deleteEvent(id, db);
  }

  /** Get the aggregated EventModifiers for all active events */
  async getActiveModifiers(db: D1Database): Promise<EventModifiers> {
    return getActiveModifiers(db);
  }

  /** Pure modifier computation (no DB) */
  computeModifiers(events: GameEvent[]): EventModifiers {
    return computeModifiers(events);
  }

  /** Check if a specific event type is active */
  async isEventTypeActive(type: EventType, db: D1Database): Promise<boolean> {
    return isEventTypeActive(type, db);
  }

  /** Schedule a weekend event for next Saturday (48h) */
  async scheduleWeekendEvent(type?: EventType, db?: D1Database): Promise<GameEvent> {
    if (!db) throw new Error('D1Database required');
    return scheduleWeekendEvent(type, db);
  }

  // Formula helpers exposed for convenience
  applyProductionModifier = applyProductionModifier;
  applyBuildTimeModifier = applyBuildTimeModifier;
  applyXpModifier = applyXpModifier;
  applyAttackModifier = applyAttackModifier;
  applyDebrisModifier = applyDebrisModifier;
  applyFleetSpeedModifier = applyFleetSpeedModifier;
}

/** Singleton instance */
export const eventService = new EventService();
