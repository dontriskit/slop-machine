/**
 * Jump Gate Teleportation Service
 *
 * Provides instant moon-to-moon fleet transfers via Jump Gate buildings.
 *
 * Key mechanics:
 * - Only works between two moons that both have Jump Gate (level >= 1)
 * - Player must own both moons
 * - 1-hour cooldown between uses per moon (configurable)
 * - No deuterium cost (instant teleport)
 * - Fleet appears instantly at destination moon
 * - Logs all teleportation events for auditing
 */

import { Ships, SHIP_KEYS } from '../types';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Default cooldown between jumps in seconds (1 hour) */
export const JUMP_GATE_COOLDOWN_SECONDS = 3600;

// ============================================================================
// TYPES
// ============================================================================

export interface JumpGateStatus {
  moonId: string;
  jumpGateLevel: number;
  available: boolean;
  lastJumpAt: number | null;      // Unix timestamp of last jump, null if never used
  nextJumpAvailableAt: number | null; // Unix timestamp when next jump is available
  cooldownRemaining: number;      // Seconds until next jump (0 if available)
}

export interface TeleportRequest {
  playerId: string;
  sourceMoonId: string;
  destinationMoonId: string;
  ships: Ships;
}

export interface TeleportResult {
  success: boolean;
  logId?: string;
  error?: string;
  shipsTransferred?: Ships;
  sourceMoonId?: string;
  destinationMoonId?: string;
  teleportedAt?: number;
}

export interface JumpGateLog {
  id: string;
  playerId: string;
  sourceMoonId: string;
  destinationMoonId: string;
  shipsJson: string;
  teleportedAt: number;
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate that ships object has at least one ship to transfer.
 */
export function hasShipsToTransfer(ships: Ships): boolean {
  return SHIP_KEYS.some((key) => ships[key] > 0);
}

/**
 * Validate that requested ships do not exceed available fleet.
 * Returns the first ship type that exceeds availability, or null if all valid.
 */
export function validateFleetAvailability(
  requested: Ships,
  available: Ships
): { valid: boolean; insufficientShip?: string } {
  for (const key of SHIP_KEYS) {
    if (requested[key] > available[key]) {
      return { valid: false, insufficientShip: key };
    }
  }
  return { valid: true };
}

/**
 * Check if a jump gate is off cooldown and ready to use.
 */
export function isJumpGateReady(
  lastJumpAt: number | null,
  currentTime: number,
  cooldownSeconds: number = JUMP_GATE_COOLDOWN_SECONDS
): boolean {
  if (lastJumpAt === null) return true;
  return currentTime >= lastJumpAt + cooldownSeconds;
}

/**
 * Calculate remaining cooldown in seconds.
 */
export function getCooldownRemaining(
  lastJumpAt: number | null,
  currentTime: number,
  cooldownSeconds: number = JUMP_GATE_COOLDOWN_SECONDS
): number {
  if (lastJumpAt === null) return 0;
  const remaining = (lastJumpAt + cooldownSeconds) - currentTime;
  return Math.max(0, Math.ceil(remaining));
}

// ============================================================================
// DATABASE OPERATIONS
// ============================================================================

/**
 * Get the jump gate status for a moon.
 *
 * Queries moon_buildings for jump gate level and jump_gate_logs for last jump time.
 */
export async function getJumpGateStatus(
  moonId: string,
  db: D1Database,
  currentTime?: number
): Promise<JumpGateStatus> {
  const now = currentTime ?? Math.floor(Date.now() / 1000);

  // Get jump gate level from moon — we check a moon_buildings table or
  // the moon itself. Since moon buildings are stored externally, we query
  // the moon_buildings concept. In OGameX, moon building levels are stored
  // per-moon. We'll query a lightweight approach: check if any record exists.
  // For simplicity, we store jump_gate_level on the moons table or a separate store.
  // We'll use the jump_gate_logs table + a direct query approach.

  // Check moon exists
  const moon = await db
    .prepare('SELECT id FROM moons WHERE id = ? LIMIT 1')
    .bind(moonId)
    .first<{ id: string }>();

  if (!moon) {
    return {
      moonId,
      jumpGateLevel: 0,
      available: false,
      lastJumpAt: null,
      nextJumpAvailableAt: null,
      cooldownRemaining: 0,
    };
  }

  // Get jump gate level (stored in moon_building_levels or as a column)
  // We use a moon_building_levels table pattern similar to what moonBuildingService expects
  const buildingRow = await db
    .prepare('SELECT jump_gate FROM moon_building_levels WHERE moon_id = ? LIMIT 1')
    .bind(moonId)
    .first<{ jump_gate: number }>()
    .catch(() => null);

  const jumpGateLevel = buildingRow?.jump_gate ?? 0;

  // Get last jump time
  const lastLog = await db
    .prepare(
      'SELECT teleported_at FROM jump_gate_logs WHERE source_moon_id = ? OR destination_moon_id = ? ORDER BY teleported_at DESC LIMIT 1'
    )
    .bind(moonId, moonId)
    .first<{ teleported_at: number }>()
    .catch(() => null);

  const lastJumpAt = lastLog?.teleported_at ?? null;
  const cooldownRemaining = getCooldownRemaining(lastJumpAt, now);
  const available = jumpGateLevel >= 1 && cooldownRemaining === 0;
  const nextJumpAvailableAt = lastJumpAt !== null
    ? lastJumpAt + JUMP_GATE_COOLDOWN_SECONDS
    : null;

  return {
    moonId,
    jumpGateLevel,
    available,
    lastJumpAt,
    nextJumpAvailableAt: available ? null : nextJumpAvailableAt,
    cooldownRemaining,
  };
}

/**
 * Perform a jump gate teleportation between two moons.
 *
 * Validates:
 * 1. Both moons exist
 * 2. Player owns both moons
 * 3. Both moons have Jump Gate level >= 1
 * 4. Source moon's jump gate is off cooldown
 * 5. Destination moon's jump gate is off cooldown
 * 6. Requested ships are available at source moon
 *
 * Then:
 * - Deducts ships from source moon fleet
 * - Adds ships to destination moon fleet
 * - Logs the teleportation event
 */
export async function teleportFleet(
  request: TeleportRequest,
  db: D1Database,
  currentTime?: number
): Promise<TeleportResult> {
  const now = currentTime ?? Math.floor(Date.now() / 1000);
  const { playerId, sourceMoonId, destinationMoonId, ships } = request;

  // ----- Validate source and destination are different -----
  if (sourceMoonId === destinationMoonId) {
    return { success: false, error: 'Source and destination moon must be different' };
  }

  // ----- Validate ships to transfer -----
  if (!hasShipsToTransfer(ships)) {
    return { success: false, error: 'No ships selected for transfer' };
  }

  // ----- Validate both moons exist and are owned by player -----
  const sourceMoon = await db
    .prepare(
      `SELECT m.id, m.planet_id, p.player_id
       FROM moons m
       JOIN planets p ON m.planet_id = p.id
       WHERE m.id = ? LIMIT 1`
    )
    .bind(sourceMoonId)
    .first<{ id: string; planet_id: string; player_id: string }>();

  if (!sourceMoon) {
    return { success: false, error: 'Source moon not found' };
  }
  if (sourceMoon.player_id !== playerId) {
    return { success: false, error: 'You do not own the source moon' };
  }

  const destMoon = await db
    .prepare(
      `SELECT m.id, m.planet_id, p.player_id
       FROM moons m
       JOIN planets p ON m.planet_id = p.id
       WHERE m.id = ? LIMIT 1`
    )
    .bind(destinationMoonId)
    .first<{ id: string; planet_id: string; player_id: string }>();

  if (!destMoon) {
    return { success: false, error: 'Destination moon not found' };
  }
  if (destMoon.player_id !== playerId) {
    return { success: false, error: 'You do not own the destination moon' };
  }

  // ----- Check jump gate levels -----
  const sourceBuilding = await db
    .prepare('SELECT jump_gate FROM moon_building_levels WHERE moon_id = ? LIMIT 1')
    .bind(sourceMoonId)
    .first<{ jump_gate: number }>()
    .catch(() => null);

  const sourceJumpGateLevel = sourceBuilding?.jump_gate ?? 0;
  if (sourceJumpGateLevel < 1) {
    return { success: false, error: 'Source moon does not have a Jump Gate' };
  }

  const destBuilding = await db
    .prepare('SELECT jump_gate FROM moon_building_levels WHERE moon_id = ? LIMIT 1')
    .bind(destinationMoonId)
    .first<{ jump_gate: number }>()
    .catch(() => null);

  const destJumpGateLevel = destBuilding?.jump_gate ?? 0;
  if (destJumpGateLevel < 1) {
    return { success: false, error: 'Destination moon does not have a Jump Gate' };
  }

  // ----- Check cooldowns on BOTH gates -----
  const sourceLastLog = await db
    .prepare(
      'SELECT teleported_at FROM jump_gate_logs WHERE source_moon_id = ? OR destination_moon_id = ? ORDER BY teleported_at DESC LIMIT 1'
    )
    .bind(sourceMoonId, sourceMoonId)
    .first<{ teleported_at: number }>()
    .catch(() => null);

  const sourceLastJump = sourceLastLog?.teleported_at ?? null;
  if (!isJumpGateReady(sourceLastJump, now)) {
    const remaining = getCooldownRemaining(sourceLastJump, now);
    return {
      success: false,
      error: `Source moon Jump Gate is on cooldown (${remaining}s remaining)`,
    };
  }

  const destLastLog = await db
    .prepare(
      'SELECT teleported_at FROM jump_gate_logs WHERE source_moon_id = ? OR destination_moon_id = ? ORDER BY teleported_at DESC LIMIT 1'
    )
    .bind(destinationMoonId, destinationMoonId)
    .first<{ teleported_at: number }>()
    .catch(() => null);

  const destLastJump = destLastLog?.teleported_at ?? null;
  if (!isJumpGateReady(destLastJump, now)) {
    const remaining = getCooldownRemaining(destLastJump, now);
    return {
      success: false,
      error: `Destination moon Jump Gate is on cooldown (${remaining}s remaining)`,
    };
  }

  // ----- Check fleet availability at source moon -----
  const sourceFleet = await db
    .prepare('SELECT * FROM fleets WHERE planet_id = ? AND player_id = ? LIMIT 1')
    .bind(sourceMoonId, playerId)
    .first<any>();

  if (!sourceFleet) {
    return { success: false, error: 'No fleet stationed at source moon' };
  }

  const availableShips: Ships = {
    lightFighter: sourceFleet.light_fighter ?? 0,
    heavyFighter: sourceFleet.heavy_fighter ?? 0,
    cruiser: sourceFleet.cruiser ?? 0,
    battleship: sourceFleet.battleship ?? 0,
    battlecruiser: sourceFleet.battlecruiser ?? 0,
    bomber: sourceFleet.bomber ?? 0,
    destroyer: sourceFleet.destroyer ?? 0,
    deathstar: sourceFleet.deathstar ?? 0,
    smallCargo: sourceFleet.small_cargo ?? 0,
    largeCargo: sourceFleet.large_cargo ?? 0,
    colonyShip: sourceFleet.colony_ship ?? 0,
    recycler: sourceFleet.recycler ?? 0,
    espionageProbe: sourceFleet.espionage_probe ?? 0,
    solarSatellite: sourceFleet.solar_satellite ?? 0,
  };

  const fleetCheck = validateFleetAvailability(ships, availableShips);
  if (!fleetCheck.valid) {
    return {
      success: false,
      error: `Insufficient ${fleetCheck.insufficientShip} at source moon`,
    };
  }

  // ----- Execute teleportation -----
  const logId = `jg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  try {
    // Deduct ships from source fleet
    await db
      .prepare(
        `UPDATE fleets SET
          light_fighter = light_fighter - ?,
          heavy_fighter = heavy_fighter - ?,
          cruiser = cruiser - ?,
          battleship = battleship - ?,
          battlecruiser = battlecruiser - ?,
          bomber = bomber - ?,
          destroyer = destroyer - ?,
          deathstar = deathstar - ?,
          small_cargo = small_cargo - ?,
          large_cargo = large_cargo - ?,
          colony_ship = colony_ship - ?,
          recycler = recycler - ?,
          espionage_probe = espionage_probe - ?,
          updated_at = ?
        WHERE planet_id = ? AND player_id = ?`
      )
      .bind(
        ships.lightFighter,
        ships.heavyFighter,
        ships.cruiser,
        ships.battleship,
        ships.battlecruiser,
        ships.bomber,
        ships.destroyer,
        ships.deathstar,
        ships.smallCargo,
        ships.largeCargo,
        ships.colonyShip,
        ships.recycler,
        ships.espionageProbe,
        now,
        sourceMoonId,
        playerId
      )
      .run();

    // Add ships to destination fleet (upsert)
    const destFleet = await db
      .prepare('SELECT id FROM fleets WHERE planet_id = ? AND player_id = ? LIMIT 1')
      .bind(destinationMoonId, playerId)
      .first<{ id: string }>();

    if (destFleet) {
      // Update existing fleet
      await db
        .prepare(
          `UPDATE fleets SET
            light_fighter = light_fighter + ?,
            heavy_fighter = heavy_fighter + ?,
            cruiser = cruiser + ?,
            battleship = battleship + ?,
            battlecruiser = battlecruiser + ?,
            bomber = bomber + ?,
            destroyer = destroyer + ?,
            deathstar = deathstar + ?,
            small_cargo = small_cargo + ?,
            large_cargo = large_cargo + ?,
            colony_ship = colony_ship + ?,
            recycler = recycler + ?,
            espionage_probe = espionage_probe + ?,
            updated_at = ?
          WHERE planet_id = ? AND player_id = ?`
        )
        .bind(
          ships.lightFighter,
          ships.heavyFighter,
          ships.cruiser,
          ships.battleship,
          ships.battlecruiser,
          ships.bomber,
          ships.destroyer,
          ships.deathstar,
          ships.smallCargo,
          ships.largeCargo,
          ships.colonyShip,
          ships.recycler,
          ships.espionageProbe,
          now,
          destinationMoonId,
          playerId
        )
        .run();
    } else {
      // Insert new fleet record at destination
      const fleetId = `fleet_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      await db
        .prepare(
          `INSERT INTO fleets (id, planet_id, player_id,
            light_fighter, heavy_fighter, cruiser, battleship, battlecruiser,
            bomber, destroyer, deathstar, small_cargo, large_cargo,
            colony_ship, recycler, espionage_probe, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          fleetId,
          destinationMoonId,
          playerId,
          ships.lightFighter,
          ships.heavyFighter,
          ships.cruiser,
          ships.battleship,
          ships.battlecruiser,
          ships.bomber,
          ships.destroyer,
          ships.deathstar,
          ships.smallCargo,
          ships.largeCargo,
          ships.colonyShip,
          ships.recycler,
          ships.espionageProbe,
          now
        )
        .run();
    }

    // Log the teleportation event
    const shipsJson = JSON.stringify(ships);
    await db
      .prepare(
        `INSERT INTO jump_gate_logs (id, player_id, source_moon_id, destination_moon_id, ships_json, teleported_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(logId, playerId, sourceMoonId, destinationMoonId, shipsJson, now)
      .run();

    return {
      success: true,
      logId,
      shipsTransferred: ships,
      sourceMoonId,
      destinationMoonId,
      teleportedAt: now,
    };
  } catch (error) {
    console.error('[JumpGate] Teleportation failed:', error);
    return {
      success: false,
      error: `Teleportation failed: ${String(error)}`,
    };
  }
}

/**
 * Get jump gate teleportation history for a player.
 */
export async function getJumpGateLogs(
  playerId: string,
  db: D1Database,
  limit: number = 20
): Promise<JumpGateLog[]> {
  try {
    const results = await db
      .prepare(
        `SELECT id, player_id, source_moon_id, destination_moon_id, ships_json, teleported_at
         FROM jump_gate_logs
         WHERE player_id = ?
         ORDER BY teleported_at DESC
         LIMIT ?`
      )
      .bind(playerId, limit)
      .all<any>();

    return (results.results ?? []).map((row) => ({
      id: row.id,
      playerId: row.player_id,
      sourceMoonId: row.source_moon_id,
      destinationMoonId: row.destination_moon_id,
      shipsJson: row.ships_json,
      teleportedAt: row.teleported_at,
    }));
  } catch (error) {
    console.error('[JumpGate] Error fetching logs:', error);
    return [];
  }
}

// ============================================================================
// SERVICE SINGLETON
// ============================================================================

export const jumpGateService = {
  getStatus: getJumpGateStatus,
  teleport: teleportFleet,
  getLogs: getJumpGateLogs,
  isReady: isJumpGateReady,
  getCooldownRemaining,
  hasShipsToTransfer,
  validateFleetAvailability,
  COOLDOWN_SECONDS: JUMP_GATE_COOLDOWN_SECONDS,
};
