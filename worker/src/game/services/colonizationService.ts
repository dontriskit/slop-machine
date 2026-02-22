/**
 * Colonization Service — Planet Colonization and Multi-Planet Management
 *
 * Handles the full lifecycle of planet colonization:
 *  - Validate colonization attempts (coordinate, empty slot, max planets)
 *  - Consume Colony Ship from the source planet
 *  - Generate new planet properties (fields, temperature) based on position
 *  - Create the planet row in D1 and initialize PlanetDO
 *  - Abandon planets (remove buildings/fleet, return fleet to homeworld)
 *  - List all player colonies
 *
 * Rules:
 *  - Max 9 planets per player (1 homeworld + 8 colonies)
 *  - Colony Ship is consumed on successful colonization
 *  - Cannot colonize your own or someone else's occupied slot
 *  - Abandoning removes the planet and all its buildings; fleet returns to homeworld
 *
 * References: OGameX + UniEngine canonical formulas.
 */

import { Coordinate } from '../types';
import { UNIVERSE_CONFIG } from '../formulas';
import { getTemperatureForPosition, getFieldsForPosition } from './galaxyService';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Maximum number of planets a player can own (homeworld + colonies). */
export const MAX_PLANETS = 9;

// ============================================================================
// TYPES
// ============================================================================

export interface ColonizationRequest {
  /** Player performing the colonization. */
  playerId: string;
  /** Planet that owns the Colony Ship being sent. */
  fromPlanetId: string;
  /** Target galaxy coordinate (1-9). */
  galaxy: number;
  /** Target system coordinate (1-499). */
  system: number;
  /** Target orbital position (1-15). */
  position: number;
}

export interface ColonizationResult {
  success: boolean;
  /** ID of the newly created colony, if successful. */
  planetId?: string;
  /** Human-readable error message, if failed. */
  error?: string;
}

export interface AbandonResult {
  success: boolean;
  /** Number of ships returned to homeworld fleet, if applicable. */
  shipsReturned?: boolean;
  error?: string;
}

export interface PlayerPlanet {
  id: string;
  name: string;
  galaxy: number;
  system: number;
  position: number;
  temperature: number;
  fields: number;
  isHomeworld: boolean;
  createdAt: number;
}

export interface PlanetProperties {
  /** Number of building fields for the new planet. */
  fields: number;
  /** Surface temperature in °C. */
  temperature: number;
}

// ============================================================================
// PURE HELPERS (exported for testing)
// ============================================================================

/**
 * generatePlanetProperties
 *
 * Derives fields and temperature for a new colony at the given orbital position.
 * Delegates to the canonical getFieldsForPosition / getTemperatureForPosition
 * helpers from galaxyService, which implement the full OGame position tables.
 *
 * The task specification calls for fields in [140, 320]; the position-based
 * ranges already produce values in that overall envelope while varying by slot.
 */
export function generatePlanetProperties(position: number): PlanetProperties {
  return {
    fields: getFieldsForPosition(position),
    temperature: getTemperatureForPosition(position),
  };
}

/**
 * validateCoordinate
 *
 * Returns an error string if the coordinate is out of range, otherwise null.
 */
export function validateCoordinate(
  galaxy: number,
  system: number,
  position: number,
): string | null {
  if (
    galaxy < UNIVERSE_CONFIG.MIN_GALAXY ||
    galaxy > UNIVERSE_CONFIG.MAX_GALAXY
  ) {
    return `Galaxy ${galaxy} out of range (${UNIVERSE_CONFIG.MIN_GALAXY}-${UNIVERSE_CONFIG.MAX_GALAXY})`;
  }
  if (
    system < UNIVERSE_CONFIG.MIN_SYSTEM ||
    system > UNIVERSE_CONFIG.MAX_SYSTEM
  ) {
    return `System ${system} out of range (${UNIVERSE_CONFIG.MIN_SYSTEM}-${UNIVERSE_CONFIG.MAX_SYSTEM})`;
  }
  if (
    position < UNIVERSE_CONFIG.MIN_POSITION ||
    position > UNIVERSE_CONFIG.MAX_POSITION
  ) {
    return `Position ${position} out of range (${UNIVERSE_CONFIG.MIN_POSITION}-${UNIVERSE_CONFIG.MAX_POSITION})`;
  }
  return null;
}

// ============================================================================
// COLONIZATION SERVICE
// ============================================================================

/**
 * ColonizationService
 *
 * Stateless service class — all persistence goes through D1 and PlanetDO.
 */
export class ColonizationService {
  constructor(
    private db: D1Database,
    private planetDO: DurableObjectNamespace,
  ) {}

  // --------------------------------------------------------------------------
  // colonizePlanet
  // --------------------------------------------------------------------------

  /**
   * colonizePlanet
   *
   * Attempt to create a new colony at the specified coordinate.
   *
   * Steps:
   *   1. Validate coordinate bounds.
   *   2. Check player has not reached MAX_PLANETS.
   *   3. Check slot is empty.
   *   4. Verify Colony Ship exists at source planet (via PlanetDO).
   *   5. Deduct Colony Ship from source planet (via PlanetDO).
   *   6. Generate planet properties.
   *   7. Insert planet row into D1.
   *   8. Initialize PlanetDO for the new planet.
   */
  async colonizePlanet(req: ColonizationRequest): Promise<ColonizationResult> {
    const { playerId, fromPlanetId, galaxy, system, position } = req;

    // 1. Validate coordinate
    const coordError = validateCoordinate(galaxy, system, position);
    if (coordError) {
      return { success: false, error: coordError };
    }

    // 2. Check max planets limit
    const planetCount = await this.getPlayerPlanetCount(playerId);
    if (planetCount >= MAX_PLANETS) {
      return {
        success: false,
        error: `Max planet limit reached (${MAX_PLANETS}). Abandon a colony first.`,
      };
    }

    // 3. Check slot is empty
    const existing = await this.db
      .prepare(
        `SELECT id FROM planets WHERE galaxy = ? AND system = ? AND position = ?`,
      )
      .bind(galaxy, system, position)
      .first<{ id: string }>();

    if (existing) {
      return {
        success: false,
        error: `Position ${galaxy}:${system}:${position} is already occupied.`,
      };
    }

    // 4. Verify Colony Ship at source planet
    const hasColonyShip = await this.checkColonyShip(fromPlanetId);
    if (!hasColonyShip) {
      return { success: false, error: 'Colony Ship required to colonize. Build one first.' };
    }

    // 5. Deduct Colony Ship from source planet
    const deducted = await this.consumeColonyShip(fromPlanetId);
    if (!deducted) {
      return { success: false, error: 'Failed to consume Colony Ship at source planet.' };
    }

    // 6. Generate planet properties
    const { fields, temperature } = generatePlanetProperties(position);

    // 7. Create planet row in D1
    const planetId = `planet-${playerId}-${galaxy}-${system}-${position}-${Date.now()}`;
    const now = Math.floor(Date.now() / 1000);
    const planetName = `Colony ${galaxy}:${system}:${position}`;

    await this.db
      .prepare(
        `INSERT INTO planets
           (id, player_id, name, galaxy, system, position, temperature, fields, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(planetId, playerId, planetName, galaxy, system, position, temperature, fields, now)
      .run();

    // 8. Initialize PlanetDO for the new planet
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
          name: planetName,
          universeSpeed: 1,
        }),
      }),
    );

    return { success: true, planetId };
  }

  // --------------------------------------------------------------------------
  // abandonPlanet
  // --------------------------------------------------------------------------

  /**
   * abandonPlanet
   *
   * Remove a colony from the universe.
   *
   * Steps:
   *   1. Verify player owns the planet.
   *   2. Verify it is not the homeworld (first planet, cannot abandon).
   *   3. Retrieve any fleet on the planet from PlanetDO.
   *   4. Find player homeworld to return ships to.
   *   5. Transfer fleet to homeworld via PlanetDO.
   *   6. Delete the planet row (buildings are implicit in PlanetDO state).
   *   7. Notify PlanetDO to destroy itself (best-effort).
   */
  async abandonPlanet(playerId: string, planetId: string): Promise<AbandonResult> {
    // 1. Verify ownership
    const planet = await this.db
      .prepare(`SELECT id, player_id, galaxy, system, position FROM planets WHERE id = ?`)
      .bind(planetId)
      .first<{ id: string; player_id: string; galaxy: number; system: number; position: number }>();

    if (!planet) {
      return { success: false, error: 'Planet not found.' };
    }
    if (planet.player_id !== playerId) {
      return { success: false, error: 'You do not own this planet.' };
    }

    // 2. Check not homeworld — homeworld is the player's oldest planet
    const homeworld = await this.getHomeworldId(playerId);
    if (homeworld === planetId) {
      return { success: false, error: 'Cannot abandon your homeworld.' };
    }

    // 3. Retrieve fleet from PlanetDO
    let shipsReturned = false;
    try {
      const doId = this.planetDO.idFromName(planetId);
      const stub = this.planetDO.get(doId);
      const stateRes = await stub.fetch(new Request('https://planet/state'));
      if (stateRes.ok) {
        const state = (await stateRes.json()) as { ships?: Record<string, number> };
        const ships = state?.ships ?? {};

        const hasAnyShips = Object.values(ships).some((count) => (count as number) > 0);

        // 4. Transfer fleet to homeworld if there are ships
        if (hasAnyShips && homeworld) {
          const hwDoId = this.planetDO.idFromName(homeworld);
          const hwStub = this.planetDO.get(hwDoId);

          await hwStub.fetch(
            new Request('https://planet/fleet/add', {
              method: 'POST',
              body: JSON.stringify({ ships }),
            }),
          );
          shipsReturned = true;
        }

        // 5. Destroy PlanetDO state (best-effort)
        await stub.fetch(new Request('https://planet/destroy', { method: 'POST' })).catch(() => {
          /* ignore */
        });
      }
    } catch (_err) {
      // Non-fatal: PlanetDO may not exist; continue with DB deletion
    }

    // 6. Delete planet row from D1
    await this.db.prepare(`DELETE FROM planets WHERE id = ?`).bind(planetId).run();

    return { success: true, shipsReturned };
  }

  // --------------------------------------------------------------------------
  // getPlayerPlanets
  // --------------------------------------------------------------------------

  /**
   * getPlayerPlanets
   *
   * Return all planets (homeworld + colonies) for the given player, ordered by
   * creation time so the homeworld is always first.
   */
  async getPlayerPlanets(playerId: string): Promise<PlayerPlanet[]> {
    const result = await this.db
      .prepare(
        `SELECT id, name, galaxy, system, position, temperature, fields, created_at
         FROM planets
         WHERE player_id = ?
         ORDER BY created_at ASC`,
      )
      .bind(playerId)
      .all<{
        id: string;
        name: string;
        galaxy: number;
        system: number;
        position: number;
        temperature: number;
        fields: number;
        created_at: number;
      }>();

    const rows = result.results ?? [];
    return rows.map((row, idx) => ({
      id: row.id,
      name: row.name,
      galaxy: row.galaxy,
      system: row.system,
      position: row.position,
      temperature: row.temperature,
      fields: row.fields,
      isHomeworld: idx === 0,
      createdAt: row.created_at,
    }));
  }

  // --------------------------------------------------------------------------
  // PRIVATE HELPERS
  // --------------------------------------------------------------------------

  /** Return the number of planets (including homeworld) the player owns. */
  private async getPlayerPlanetCount(playerId: string): Promise<number> {
    const row = await this.db
      .prepare(`SELECT COUNT(*) AS cnt FROM planets WHERE player_id = ?`)
      .bind(playerId)
      .first<{ cnt: number }>();
    return row?.cnt ?? 0;
  }

  /** Return the ID of the player's homeworld (oldest planet). */
  private async getHomeworldId(playerId: string): Promise<string | null> {
    const row = await this.db
      .prepare(`SELECT id FROM planets WHERE player_id = ? ORDER BY created_at ASC LIMIT 1`)
      .bind(playerId)
      .first<{ id: string }>();
    return row?.id ?? null;
  }

  /**
   * Check if the planet's PlanetDO has at least one Colony Ship.
   */
  private async checkColonyShip(planetId: string): Promise<boolean> {
    try {
      const doId = this.planetDO.idFromName(planetId);
      const stub = this.planetDO.get(doId);
      const res = await stub.fetch(new Request('https://planet/state'));
      if (!res.ok) return false;
      const state = (await res.json()) as {
        ships?: { colonyShip?: number };
      };
      return (state?.ships?.colonyShip ?? 0) > 0;
    } catch {
      return false;
    }
  }

  /**
   * Consume (deduct) one Colony Ship from the planet's PlanetDO.
   * Returns true if the deduction succeeded.
   */
  private async consumeColonyShip(planetId: string): Promise<boolean> {
    try {
      const doId = this.planetDO.idFromName(planetId);
      const stub = this.planetDO.get(doId);
      const res = await stub.fetch(
        new Request('https://planet/ships/deduct', {
          method: 'POST',
          body: JSON.stringify({ shipType: 'colonyShip', count: 1 }),
        }),
      );
      return res.ok;
    } catch {
      return false;
    }
  }
}

// ============================================================================
// SINGLETON CONVENIENCE EXPORT
// ============================================================================

/**
 * Factory helper: create a ColonizationService bound to CF runtime bindings.
 */
export function createColonizationService(
  db: D1Database,
  planetDO: DurableObjectNamespace,
): ColonizationService {
  return new ColonizationService(db, planetDO);
}
