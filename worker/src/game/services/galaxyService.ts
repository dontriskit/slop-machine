import { Coordinate } from '../types';
import { UNIVERSE_CONFIG } from '../formulas';

// ============================================================================
// GALAXY SERVICE TYPES
// ============================================================================

export interface DebrisField {
  metal: number;
  crystal: number;
}

export interface SlotPlanet {
  planetId: string;
  name: string;
  playerName: string;
  playerId: string;
  allianceTag: string | null;
  hasMoon: boolean;
  debris: DebrisField | null;
  temperature: number;
  fields: number;
}

export interface SystemSlot {
  position: number;       // 1–15
  planet: SlotPlanet | null;
}

export interface SystemView {
  galaxy: number;
  system: number;
  slots: SystemSlot[];   // always exactly 15 entries
}

export interface GalaxySummaryEntry {
  system: number;
  occupiedSlots: number; // 0–15
}

export interface ColonizeRequest {
  playerId: string;
  fromPlanetId: string;
  galaxy: number;
  system: number;
  position: number;      // 1–15
}

export interface ColonizeResult {
  success: boolean;
  planetId?: string;
  error?: string;
}

// ============================================================================
// POSITION TABLES
// ============================================================================

/**
 * Temperature ranges per orbital position.
 * Each entry is [min, max] inclusive (°C).
 * Verified against OGameX and UniEngine reference implementations.
 */
const POSITION_TEMPERATURE: Record<number, [number, number]> = {
  1:  [220, 260],
  2:  [170, 210],
  3:  [120, 160],
  4:  [70,  110],
  5:  [60,  100],
  6:  [50,   90],
  7:  [40,   80],
  8:  [30,   70],
  9:  [20,   60],
  10: [10,   50],
  11: [-10,  30],
  12: [-50, -10],
  13: [-90, -50],
  14: [-130, -90],
  15: [-170, -130],
};

/**
 * Field (building slot) ranges per orbital position.
 * Positions 4–6 are the largest; 1 and 15 are the smallest.
 */
const POSITION_FIELDS: Record<number, [number, number]> = {
  1:  [96,  128],
  2:  [104, 138],
  3:  [143, 175],
  4:  [193, 253],
  5:  [193, 253],
  6:  [193, 253],
  7:  [163, 223],
  8:  [178, 238],
  9:  [163, 223],
  10: [148, 208],
  11: [133, 193],
  12: [118, 158],
  13: [103, 143],
  14: [88,  128],
  15: [81,  113],
};

// ============================================================================
// TEMPERATURE & FIELD HELPERS
// ============================================================================

/**
 * Generate a random temperature for the given orbital position.
 * Returns an integer in the canonical [min, max] range for that position.
 */
export function getTemperatureForPosition(position: number): number {
  const [min, max] = POSITION_TEMPERATURE[position] ?? [0, 40];
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Generate a random field count for the given orbital position.
 * Returns an integer in the canonical [min, max] range for that position.
 */
export function getFieldsForPosition(position: number): number {
  const [min, max] = POSITION_FIELDS[position] ?? [120, 180];
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Return [min, max] temperature range for a position (for display purposes).
 */
export function getTemperatureRange(position: number): [number, number] {
  return POSITION_TEMPERATURE[position] ?? [0, 40];
}

/**
 * Return [min, max] field range for a position (for display purposes).
 */
export function getFieldsRange(position: number): [number, number] {
  return POSITION_FIELDS[position] ?? [120, 180];
}

// ============================================================================
// GALAXY SERVICE
// ============================================================================

/**
 * GalaxyService
 *
 * Handles galaxy-map data queries: system views, galaxy summaries,
 * temperature/field generation, and colonization pre-checks.
 *
 * All persistence is delegated to D1 (passed in as constructor arg) and the
 * PlanetDO Durable Object namespace.  The service itself is stateless.
 */
export class GalaxyService {
  constructor(
    private db: D1Database,
    private planetDO: DurableObjectNamespace,
  ) {}

  // --------------------------------------------------------------------------
  // SYSTEM VIEW
  // --------------------------------------------------------------------------

  /**
   * getSystemView
   *
   * Returns a full 15-slot view of the given (galaxy, system).
   * Each slot either contains planet + player + moon/debris info, or is empty.
   *
   * SQL assumptions (adjust column names to match your actual schema):
   *   planets(id, name, player_id, galaxy, system, position, temperature, fields)
   *   players(id, name, alliance_tag)
   *   moons(planet_id)                    – one row per moon that exists
   *   debris_fields(galaxy, system, position, metal, crystal)
   */
  async getSystemView(galaxy: number, system: number): Promise<SystemView> {
    this.validateSystemCoord(galaxy, system);

    // Fetch all planets in this system in one query
    const planetsResult = await this.db
      .prepare(
        `SELECT
           p.id          AS planet_id,
           p.name        AS planet_name,
           p.position,
           p.temperature,
           p.fields,
           p.player_id,
           pl.name       AS player_name,
           pl.alliance_tag
         FROM planets p
         JOIN players pl ON pl.id = p.player_id
         WHERE p.galaxy = ? AND p.system = ?
         ORDER BY p.position ASC`
      )
      .bind(galaxy, system)
      .all();

    // Fetch moons in this system
    const moonsResult = await this.db
      .prepare(
        `SELECT m.planet_id
         FROM moons m
         JOIN planets p ON p.id = m.planet_id
         WHERE p.galaxy = ? AND p.system = ?`
      )
      .bind(galaxy, system)
      .all();

    // Fetch debris fields in this system
    const debrisResult = await this.db
      .prepare(
        `SELECT position, metal, crystal
         FROM debris_fields
         WHERE galaxy = ? AND system = ?`
      )
      .bind(galaxy, system)
      .all();

    // Build lookup maps
    const moonPlanetIds = new Set(
      (moonsResult.results as Array<{ planet_id: string }>).map((r) => r.planet_id)
    );

    const debrisByPosition = new Map<number, DebrisField>();
    for (const row of debrisResult.results as Array<{
      position: number;
      metal: number;
      crystal: number;
    }>) {
      debrisByPosition.set(row.position, { metal: row.metal, crystal: row.crystal });
    }

    const planetByPosition = new Map<number, SlotPlanet>();
    for (const row of planetsResult.results as Array<{
      planet_id: string;
      planet_name: string;
      position: number;
      temperature: number;
      fields: number;
      player_id: string;
      player_name: string;
      alliance_tag: string | null;
    }>) {
      planetByPosition.set(row.position, {
        planetId: row.planet_id,
        name: row.planet_name,
        playerName: row.player_name,
        playerId: row.player_id,
        allianceTag: row.alliance_tag,
        hasMoon: moonPlanetIds.has(row.planet_id),
        debris: debrisByPosition.get(row.position) ?? null,
        temperature: row.temperature,
        fields: row.fields,
      });
    }

    // Build the 15-slot array
    const slots: SystemSlot[] = [];
    for (let pos = 1; pos <= UNIVERSE_CONFIG.MAX_POSITION; pos++) {
      slots.push({
        position: pos,
        planet: planetByPosition.get(pos) ?? null,
      });
    }

    return { galaxy, system, slots };
  }

  // --------------------------------------------------------------------------
  // GALAXY SUMMARY
  // --------------------------------------------------------------------------

  /**
   * getGalaxySummary
   *
   * Returns the number of occupied planet slots per system for an entire galaxy.
   * Useful for rendering a heat-map overview of galaxy density.
   */
  async getGalaxySummary(galaxy: number): Promise<GalaxySummaryEntry[]> {
    this.validateGalaxy(galaxy);

    const result = await this.db
      .prepare(
        `SELECT system, COUNT(*) AS occupied_slots
         FROM planets
         WHERE galaxy = ?
         GROUP BY system
         ORDER BY system ASC`
      )
      .bind(galaxy)
      .all();

    const rows = result.results as Array<{ system: number; occupied_slots: number }>;

    // Return only systems that have at least 1 planet; callers can fill gaps
    return rows.map((r) => ({
      system: r.system,
      occupiedSlots: r.occupied_slots,
    }));
  }

  // --------------------------------------------------------------------------
  // COLONIZATION
  // --------------------------------------------------------------------------

  /**
   * colonize
   *
   * Attempts to colonize an empty position.
   *
   * Steps:
   *   1. Validate coordinate is in-range and position 1–15
   *   2. Check position is currently empty (no existing planet row)
   *   3. Verify the sending fleet (fromPlanetId) has a Colony Ship (checked
   *      via PlanetDO – this service only validates, it does not deduct ships;
   *      the caller / mission handler must do so after the DO processes arrival)
   *   4. Generate temperature + fields for the position
   *   5. Insert new planet row into D1
   *   6. Initialize PlanetDO with the new planet state
   *
   * Returns the new planet's id on success.
   */
  async colonize(req: ColonizeRequest): Promise<ColonizeResult> {
    const { playerId, fromPlanetId, galaxy, system, position } = req;

    // --- Validate coordinate ---
    if (
      galaxy < UNIVERSE_CONFIG.MIN_GALAXY ||
      galaxy > UNIVERSE_CONFIG.MAX_GALAXY ||
      system < UNIVERSE_CONFIG.MIN_SYSTEM ||
      system > UNIVERSE_CONFIG.MAX_SYSTEM ||
      position < UNIVERSE_CONFIG.MIN_POSITION ||
      position > UNIVERSE_CONFIG.MAX_POSITION
    ) {
      return { success: false, error: `Invalid coordinate ${galaxy}:${system}:${position}` };
    }

    // --- Check position is empty ---
    const existing = await this.db
      .prepare(`SELECT id FROM planets WHERE galaxy = ? AND system = ? AND position = ?`)
      .bind(galaxy, system, position)
      .first();

    if (existing) {
      return { success: false, error: `Position ${galaxy}:${system}:${position} is already occupied` };
    }

    // --- Check Colony Ship at source planet ---
    const colonyShipCheck = await this.checkColonyShip(fromPlanetId);
    if (!colonyShipCheck) {
      return { success: false, error: 'Colony Ship required to colonize' };
    }

    // --- Generate planet properties ---
    const temperature = getTemperatureForPosition(position);
    const fields = getFieldsForPosition(position);

    // --- Create planet row in D1 ---
    const planetId = `planet-${playerId}-${galaxy}-${system}-${position}-${Date.now()}`;
    const now = Math.floor(Date.now() / 1000);

    await this.db
      .prepare(
        `INSERT INTO planets
           (id, player_id, name, galaxy, system, position, temperature, fields, created_at)
         VALUES
           (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        planetId,
        playerId,
        `Colony ${galaxy}:${system}:${position}`,
        galaxy,
        system,
        position,
        temperature,
        fields,
        now
      )
      .run();

    // --- Initialize PlanetDO ---
    const coordinate: Coordinate = { galaxy, system, position };
    const doId = this.planetDO.idFromName(planetId);
    const stub = this.planetDO.get(doId);

    await stub.fetch(
      new Request('https://planet/initialize', {
        method: 'POST',
        body: JSON.stringify({
          planetId,
          playerId,
          coordinate,
          temperature,
          fields,
          name: `Colony ${galaxy}:${system}:${position}`,
          universeSpeed: 1,
        }),
      })
    );

    return { success: true, planetId };
  }

  // --------------------------------------------------------------------------
  // PRIVATE HELPERS
  // --------------------------------------------------------------------------

  /**
   * Check if the source planet has at least one Colony Ship via PlanetDO.
   */
  private async checkColonyShip(planetId: string): Promise<boolean> {
    try {
      const doId = this.planetDO.idFromName(planetId);
      const stub = this.planetDO.get(doId);
      const res = await stub.fetch(new Request('https://planet/state'));
      if (!res.ok) return false;
      const state = (await res.json()) as { fleet?: { colonyShip?: number } };
      return (state?.fleet?.colonyShip ?? 0) > 0;
    } catch {
      return false;
    }
  }

  private validateGalaxy(galaxy: number): void {
    if (galaxy < UNIVERSE_CONFIG.MIN_GALAXY || galaxy > UNIVERSE_CONFIG.MAX_GALAXY) {
      throw new Error(`Galaxy ${galaxy} out of range (1–${UNIVERSE_CONFIG.MAX_GALAXY})`);
    }
  }

  private validateSystemCoord(galaxy: number, system: number): void {
    this.validateGalaxy(galaxy);
    if (system < UNIVERSE_CONFIG.MIN_SYSTEM || system > UNIVERSE_CONFIG.MAX_SYSTEM) {
      throw new Error(`System ${system} out of range (1–${UNIVERSE_CONFIG.MAX_SYSTEM})`);
    }
  }
}
