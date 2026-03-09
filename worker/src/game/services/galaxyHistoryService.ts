/**
 * Galaxy History Service
 *
 * Tracks significant galaxy events:
 *   - Attacks (battles resolved)
 *   - Colonizations (new planets claimed)
 *   - Debris fields (created or cleared)
 *
 * Provides read endpoints for system-level and galaxy-wide history.
 */

// ============================================================================
// TYPES
// ============================================================================

export type GalaxyEventType = 'attack' | 'colonization' | 'debris';

export interface GalaxyEvent {
  id: string;
  type: GalaxyEventType;
  galaxy: number;
  system: number;
  position: number;
  playerId: string | null;
  targetId: string | null;
  timestamp: number;      // unix seconds
  details: Record<string, unknown> | null;
}

export interface LogGalaxyEventParams {
  type: GalaxyEventType;
  galaxy: number;
  system: number;
  position: number;
  playerId?: string | null;
  targetId?: string | null;
  details?: Record<string, unknown> | null;
}

// ============================================================================
// SERVICE
// ============================================================================

export class GalaxyHistoryService {
  constructor(private db: D1Database) {}

  /**
   * Log a new galaxy event.
   */
  async logEvent(params: LogGalaxyEventParams): Promise<GalaxyEvent> {
    const id = `gevt-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`;
    const timestamp = Math.floor(Date.now() / 1000);

    await this.db
      .prepare(
        `INSERT INTO galaxy_events
           (id, type, galaxy, system, position, player_id, target_id, timestamp, details_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        params.type,
        params.galaxy,
        params.system,
        params.position,
        params.playerId ?? null,
        params.targetId ?? null,
        timestamp,
        params.details ? JSON.stringify(params.details) : null
      )
      .run();

    return {
      id,
      type: params.type,
      galaxy: params.galaxy,
      system: params.system,
      position: params.position,
      playerId: params.playerId ?? null,
      targetId: params.targetId ?? null,
      timestamp,
      details: params.details ?? null,
    };
  }

  /**
   * Get the last 50 events for a specific solar system.
   */
  async getSystemHistory(galaxy: number, system: number): Promise<GalaxyEvent[]> {
    const result = await this.db
      .prepare(
        `SELECT id, type, galaxy, system, position, player_id, target_id, timestamp, details_json
         FROM galaxy_events
         WHERE galaxy = ? AND system = ?
         ORDER BY timestamp DESC
         LIMIT 50`
      )
      .bind(galaxy, system)
      .all();

    return this.mapRows(result.results as unknown as GalaxyEventRow[]);
  }

  /**
   * Get the last 100 events across all galaxy.
   */
  async getRecentHistory(): Promise<GalaxyEvent[]> {
    const result = await this.db
      .prepare(
        `SELECT id, type, galaxy, system, position, player_id, target_id, timestamp, details_json
         FROM galaxy_events
         ORDER BY timestamp DESC
         LIMIT 100`
      )
      .all();

    return this.mapRows(result.results as unknown as GalaxyEventRow[]);
  }

  // --------------------------------------------------------------------------
  // PRIVATE
  // --------------------------------------------------------------------------

  private mapRows(rows: GalaxyEventRow[]): GalaxyEvent[] {
    return rows.map((row) => ({
      id: row.id,
      type: row.type as GalaxyEventType,
      galaxy: row.galaxy,
      system: row.system,
      position: row.position,
      playerId: row.player_id ?? null,
      targetId: row.target_id ?? null,
      timestamp: row.timestamp,
      details: row.details_json ? (JSON.parse(row.details_json) as Record<string, unknown>) : null,
    }));
  }
}

interface GalaxyEventRow {
  id: string;
  type: string;
  galaxy: number;
  system: number;
  position: number;
  player_id: string | null;
  target_id: string | null;
  timestamp: number;
  details_json: string | null;
}

/**
 * Singleton factory — pass db at call site (Cloudflare Workers pattern).
 */
export function createGalaxyHistoryService(db: D1Database): GalaxyHistoryService {
  return new GalaxyHistoryService(db);
}
