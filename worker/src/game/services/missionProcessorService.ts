import { Ships, Resources, FleetMission, SHIP_KEYS, camelToSnakeShip } from '../types';
import { fleetService, FleetArrivalResult } from './fleetService';

/**
 * Mission Processor Service
 * 
 * Processes fleet missions that have arrived at their destination or are returning.
 * Called by the cron handler every minute.
 *
 * Flow:
 * 1. Query fleet_missions WHERE time_arrival <= now AND mission_status = 'in_transit'
 * 2. For each: call fleetService.processFleetArrival()
 * 3. Handle side effects (battle reports, loot, debris, planet creation)
 * 4. Query fleet_missions WHERE time_arrival <= now AND mission_status = 'returning'
 * 5. For each returning: add fleet + cargo to origin planet, mark completed
 */

export interface MissionProcessingResult {
  arrivals: number;
  returns: number;
  errors: string[];
}

/**
 * Helper: build Ships object from a D1 row with snake_case column names
 */
function shipsFromRow(row: Record<string, unknown>): Ships {
  return {
    lightFighter: (row.light_fighter as number) ?? 0,
    heavyFighter: (row.heavy_fighter as number) ?? 0,
    cruiser: (row.cruiser as number) ?? 0,
    battleship: (row.battleship as number) ?? 0,
    battlecruiser: (row.battlecruiser as number) ?? 0,
    bomber: (row.bomber as number) ?? 0,
    destroyer: (row.destroyer as number) ?? 0,
    deathstar: (row.deathstar as number) ?? 0,
    smallCargo: (row.small_cargo as number) ?? 0,
    largeCargo: (row.large_cargo as number) ?? 0,
    colonyShip: (row.colony_ship as number) ?? 0,
    recycler: (row.recycler as number) ?? 0,
    espionageProbe: (row.espionage_probe as number) ?? 0,
  };
}

/**
 * Convert FleetMission to D1 update params for ship columns
 */
function shipUpdateCols(ships: Ships): Record<string, number> {
  const result: Record<string, number> = {};
  for (const key of SHIP_KEYS) {
    result[camelToSnakeShip(key)] = ships[key];
  }
  return result;
}

/**
 * Process all arrived and returning fleet missions.
 *
 * @param DB       - D1 database binding
 * @param PLANET_DO - Durable Object namespace for planet state
 * @returns Summary of processing results
 */
export async function processFleetMissions(
  DB: D1Database,
  PLANET_DO: DurableObjectNamespace,
): Promise<MissionProcessingResult> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const result: MissionProcessingResult = { arrivals: 0, returns: 0, errors: [] };

  // =========================================================================
  // STEP 1: Process arrived missions (in_transit -> arrived/returning/completed)
  // =========================================================================
  try {
    const arrivedRows = await DB.prepare(
      `SELECT * FROM fleet_missions
       WHERE time_arrival <= ? AND mission_status = 'in_transit'
       ORDER BY time_arrival ASC
       LIMIT 50`,
    )
      .bind(nowSeconds)
      .all();

    for (const row of arrivedRows.results || []) {
      try {
        await processArrival(row as Record<string, unknown>, DB, PLANET_DO, nowSeconds);
        result.arrivals++;
      } catch (err) {
        result.errors.push(`Arrival ${row.id}: ${String(err)}`);
      }
    }
  } catch (err) {
    result.errors.push(`Arrival query error: ${String(err)}`);
  }

  // =========================================================================
  // STEP 2: Process returning missions (returning -> completed)
  // =========================================================================
  try {
    const returningRows = await DB.prepare(
      `SELECT * FROM fleet_missions
       WHERE time_arrival <= ? AND mission_status = 'returning'
       ORDER BY time_arrival ASC
       LIMIT 50`,
    )
      .bind(nowSeconds)
      .all();

    for (const row of returningRows.results || []) {
      try {
        await processReturn(row as Record<string, unknown>, DB, PLANET_DO);
        result.returns++;
      } catch (err) {
        result.errors.push(`Return ${row.id}: ${String(err)}`);
      }
    }
  } catch (err) {
    result.errors.push(`Return query error: ${String(err)}`);
  }

  return result;
}

/**
 * Process a single arrived mission based on its type.
 */
async function processArrival(
  row: Record<string, unknown>,
  DB: D1Database,
  PLANET_DO: DurableObjectNamespace,
  nowSeconds: number,
): Promise<void> {
  const missionId = row.id as string;
  const missionType = row.mission_type as string;
  const playerId = row.player_id as string;
  const planetIdFrom = row.planet_id_from as string;
  const planetIdTo = row.planet_id_to as string | null;
  const ships = shipsFromRow(row);
  const resources: Resources = {
    metal: (row.metal as number) ?? 0,
    crystal: (row.crystal as number) ?? 0,
    deuterium: (row.deuterium as number) ?? 0,
  };

  switch (missionType) {
    case 'attack':
      await processAttackArrival(missionId, playerId, planetIdFrom, planetIdTo, ships, resources, row, DB, PLANET_DO, nowSeconds);
      break;

    case 'transport':
      await processTransportArrival(missionId, playerId, planetIdFrom, planetIdTo, ships, resources, DB, PLANET_DO, nowSeconds);
      break;

    case 'espionage':
      await processEspionageArrival(missionId, playerId, planetIdFrom, ships, DB, PLANET_DO, nowSeconds);
      break;

    case 'colonize':
      await processColonizeArrival(missionId, playerId, planetIdFrom, ships, resources, row, DB, PLANET_DO, nowSeconds);
      break;

    case 'harvest':
      await processHarvestArrival(missionId, playerId, planetIdFrom, ships, resources, row, DB, PLANET_DO, nowSeconds);
      break;

    case 'deploy':
      await processDeployArrival(missionId, planetIdTo, ships, resources, DB, PLANET_DO);
      break;

    case 'expedition':
      await processExpeditionArrival(missionId, playerId, planetIdFrom, ships, resources, DB, PLANET_DO, nowSeconds);
      break;

    default:
      // Unknown mission type - just mark as completed
      await DB.prepare(
        `UPDATE fleet_missions SET mission_status = 'completed' WHERE id = ?`,
      ).bind(missionId).run();
  }
}

/**
 * ATTACK: Run battle, loot defender, create debris, schedule return
 */
async function processAttackArrival(
  missionId: string,
  playerId: string,
  planetIdFrom: string,
  planetIdTo: string | null,
  ships: Ships,
  resources: Resources,
  row: Record<string, unknown>,
  DB: D1Database,
  PLANET_DO: DurableObjectNamespace,
  nowSeconds: number,
): Promise<void> {
  if (!planetIdTo) {
    // No target planet - return empty
    await scheduleReturn(missionId, planetIdFrom, ships, resources, DB, nowSeconds);
    return;
  }

  // Get defender planet state from DO
  const defStub = getStub(PLANET_DO, planetIdTo);
  const defStateRes = await defStub.fetch(new Request('https://planet/state'));
  if (!defStateRes.ok) {
    await scheduleReturn(missionId, planetIdFrom, ships, resources, DB, nowSeconds);
    return;
  }

  const defState = await defStateRes.json() as any;

  // Build FleetMission for fleetService
  const mission = rowToFleetMission(row);

  const arrivalResult = fleetService.processFleetArrival(mission, {
    defenderData: {
      ships: defState.ships || emptyShips(),
      resources: defState.resources || { metal: 0, crystal: 0, deuterium: 0 },
    },
  });

  const survivingShips = arrivalResult.survivingShips || emptyShips();
  const loot = arrivalResult.loot || { metal: 0, crystal: 0, deuterium: 0 };

  // Store battle report if available
  if (arrivalResult.battle) {
    const battle = arrivalResult.battle;
    const reportId = `br-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    
    // Find defender player_id
    const defPlanet = await DB.prepare('SELECT player_id FROM planets WHERE id = ?').bind(planetIdTo).first() as any;
    const defenderId = defPlanet?.player_id || 'unknown';

    await DB.prepare(
      `INSERT INTO battle_reports (id, attacker_id, defender_id, attacker_planet_id, defender_planet_id,
        mission_id, winner, rounds_fought,
        attacker_loss_metal, attacker_loss_crystal, attacker_loss_deuterium,
        defender_loss_metal, defender_loss_crystal, defender_loss_deuterium,
        loot_metal, loot_crystal, loot_deuterium, battle_data, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      reportId, playerId, defenderId, planetIdFrom, planetIdTo,
      missionId, battle.winner, battle.rounds.length,
      battle.attackerLosses.metal, battle.attackerLosses.crystal, battle.attackerLosses.deuterium,
      battle.defenderLosses.metal, battle.defenderLosses.crystal, battle.defenderLosses.deuterium,
      loot.metal, loot.crystal, loot.deuterium,
      JSON.stringify(battle), nowSeconds,
    ).run();

    // Also log to battle_replays for spectator mode
    try {
      const replayId = `replay-${reportId}`;
      const g = row.galaxy_to as number || defState.coordinate?.galaxy || 1;
      const s = row.system_to as number || defState.coordinate?.system || 1;
      const p = row.position_to as number || defState.coordinate?.position || 1;
      // Fetch player names for readable spectator list
      const attackerRow = await DB.prepare('SELECT username FROM players WHERE id = ?').bind(playerId).first() as any;
      const defenderRow = await DB.prepare('SELECT username FROM players WHERE id = ?').bind(defenderId).first() as any;
      const attackerName = attackerRow?.username || 'Unknown';
      const defenderName = defenderRow?.username || 'Unknown';
      await DB.prepare(
        `INSERT INTO battle_replays (id, attacker_id, defender_id, planet_id,
           winner, galaxy, system, position, attacker_name, defender_name,
           battle_data_json, is_public, timestamp)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      ).bind(
        replayId, playerId, defenderId, planetIdTo,
        battle.winner, g, s, p, attackerName, defenderName,
        JSON.stringify(battle), nowSeconds,
      ).run();
    } catch (_replayErr) {
      // Non-critical — spectator logging failure must not break battle resolution
    }

    // Update debris field
    if (battle.debrisField.metal > 0 || battle.debrisField.crystal > 0) {
      const g = row.galaxy_to as number || defState.coordinate?.galaxy || 1;
      const s = row.system_to as number || defState.coordinate?.system || 1;
      const p = row.position_to as number || defState.coordinate?.position || 1;

      await DB.prepare(
        `INSERT INTO debris_fields (galaxy, system, position, metal, crystal, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(galaxy, system, position) DO UPDATE SET
           metal = metal + excluded.metal,
           crystal = crystal + excluded.crystal,
           updated_at = excluded.updated_at`,
      ).bind(g, s, p, battle.debrisField.metal, battle.debrisField.crystal, nowSeconds).run();
    }

    // Deduct looted resources from defender planet
    if (loot.metal > 0 || loot.crystal > 0 || loot.deuterium > 0) {
      // Update defender DO state - deduct looted resources
      const deductBody = {
        ships: defState.ships, // defender keeps surviving ships (already handled by battle)
        resources: {
          metal: Math.max(0, (defState.resources?.metal || 0) - loot.metal),
          crystal: Math.max(0, (defState.resources?.crystal || 0) - loot.crystal),
          deuterium: Math.max(0, (defState.resources?.deuterium || 0) - loot.deuterium),
        },
      };
      await defStub.fetch(new Request('https://planet/fleet-deduct', {
        method: 'POST',
        body: JSON.stringify(deductBody),
      }));
    }
  }

  // Return with surviving ships + carried resources + loot
  const returnResources: Resources = {
    metal: resources.metal + loot.metal,
    crystal: resources.crystal + loot.crystal,
    deuterium: resources.deuterium + loot.deuterium,
  };

  await scheduleReturn(missionId, planetIdFrom, survivingShips, returnResources, DB, nowSeconds);
}

/**
 * TRANSPORT: deliver resources to target, return empty
 */
async function processTransportArrival(
  missionId: string,
  playerId: string,
  planetIdFrom: string,
  planetIdTo: string | null,
  ships: Ships,
  resources: Resources,
  DB: D1Database,
  PLANET_DO: DurableObjectNamespace,
  nowSeconds: number,
): Promise<void> {
  // Deliver resources to target planet
  if (planetIdTo && (resources.metal > 0 || resources.crystal > 0 || resources.deuterium > 0)) {
    const targetStub = getStub(PLANET_DO, planetIdTo);
    await targetStub.fetch(new Request('https://planet/ships/add', {
      method: 'POST',
      body: JSON.stringify({ ships: emptyShips(), resources }),
    }));
  }

  // Return with ships, no resources
  await scheduleReturn(missionId, planetIdFrom, ships, { metal: 0, crystal: 0, deuterium: 0 }, DB, nowSeconds);
}

/**
 * ESPIONAGE: generate report and return
 */
async function processEspionageArrival(
  missionId: string,
  playerId: string,
  planetIdFrom: string,
  ships: Ships,
  DB: D1Database,
  PLANET_DO: DurableObjectNamespace,
  nowSeconds: number,
): Promise<void> {
  // Espionage probes generate a report then return
  // Report generation is simplified here - full implementation is in espionageService
  await scheduleReturn(missionId, planetIdFrom, ships, { metal: 0, crystal: 0, deuterium: 0 }, DB, nowSeconds);
}

/**
 * COLONIZE: create new planet at target coordinates
 */
async function processColonizeArrival(
  missionId: string,
  playerId: string,
  planetIdFrom: string,
  ships: Ships,
  resources: Resources,
  row: Record<string, unknown>,
  DB: D1Database,
  PLANET_DO: DurableObjectNamespace,
  nowSeconds: number,
): Promise<void> {
  const galaxy = (row.galaxy_to as number) ?? 1;
  const system = (row.system_to as number) ?? 1;
  const position = (row.position_to as number) ?? 1;

  // Check if position is already occupied
  const existing = await DB.prepare(
    'SELECT id FROM planets WHERE galaxy = ? AND system = ? AND position = ?',
  ).bind(galaxy, system, position).first();

  if (existing) {
    // Position occupied - return with ships (minus colony ship consumed)
    const returnShips = { ...ships, colonyShip: Math.max(0, ships.colonyShip - 1) };
    await scheduleReturn(missionId, planetIdFrom, returnShips, resources, DB, nowSeconds);
    return;
  }

  // Colony ship is consumed
  if (ships.colonyShip < 1) {
    await scheduleReturn(missionId, planetIdFrom, ships, resources, DB, nowSeconds);
    return;
  }

  // Create new planet
  const newPlanetId = `planet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const temperature = Math.floor(Math.random() * 80) - 40 + 30; // Range: -10 to 70

  await DB.prepare(
    `INSERT INTO planets (id, player_id, name, galaxy, system, position, planet_type, temperature, fields, universe_speed, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    newPlanetId, playerId, 'Colony', galaxy, system, position, 'planet', temperature, 163, 1, nowSeconds,
  ).run();

  // Initialize planet DO
  const newStub = getStub(PLANET_DO, newPlanetId);
  await newStub.fetch(new Request('https://planet/initialize', {
    method: 'POST',
    body: JSON.stringify({
      planetId: newPlanetId,
      playerId,
      coordinate: { galaxy, system, position },
      temperature,
      universeSpeed: 1,
      resources: { metal: 500, crystal: 500, deuterium: 0 },
    }),
  }));

  // Remaining ships (minus colony ship) stay at new planet or return
  const remainingShips = { ...ships, colonyShip: ships.colonyShip - 1 };
  const hasShipsToReturn = Object.values(remainingShips).some(v => v > 0);

  if (hasShipsToReturn) {
    await scheduleReturn(missionId, planetIdFrom, remainingShips, resources, DB, nowSeconds);
  } else {
    await DB.prepare(
      `UPDATE fleet_missions SET mission_status = 'completed' WHERE id = ?`,
    ).bind(missionId).run();
  }
}

/**
 * HARVEST: collect debris field resources, return
 */
async function processHarvestArrival(
  missionId: string,
  playerId: string,
  planetIdFrom: string,
  ships: Ships,
  resources: Resources,
  row: Record<string, unknown>,
  DB: D1Database,
  PLANET_DO: DurableObjectNamespace,
  nowSeconds: number,
): Promise<void> {
  const galaxy = (row.galaxy_to as number) ?? 1;
  const system = (row.system_to as number) ?? 1;
  const position = (row.position_to as number) ?? 1;

  // Get debris field
  const debris = await DB.prepare(
    'SELECT metal, crystal FROM debris_fields WHERE galaxy = ? AND system = ? AND position = ?',
  ).bind(galaxy, system, position).first() as any;

  let collected: Resources = { metal: 0, crystal: 0, deuterium: 0 };

  if (debris) {
    // Recycler capacity: 20,000 per recycler
    const capacity = ships.recycler * 20000;
    const totalDebris = (debris.metal || 0) + (debris.crystal || 0);

    if (totalDebris <= capacity) {
      collected = { metal: debris.metal || 0, crystal: debris.crystal || 0, deuterium: 0 };
    } else {
      const ratio = capacity / totalDebris;
      collected = {
        metal: Math.floor((debris.metal || 0) * ratio),
        crystal: Math.floor((debris.crystal || 0) * ratio),
        deuterium: 0,
      };
    }

    // Deduct from debris field
    await DB.prepare(
      `UPDATE debris_fields SET metal = metal - ?, crystal = crystal - ?, updated_at = ?
       WHERE galaxy = ? AND system = ? AND position = ?`,
    ).bind(collected.metal, collected.crystal, nowSeconds, galaxy, system, position).run();
  }

  // Return with carried resources + collected debris
  const returnResources: Resources = {
    metal: resources.metal + collected.metal,
    crystal: resources.crystal + collected.crystal,
    deuterium: resources.deuterium + collected.deuterium,
  };

  await scheduleReturn(missionId, planetIdFrom, ships, returnResources, DB, nowSeconds);
}

/**
 * DEPLOY: station fleet permanently at target (no return)
 */
async function processDeployArrival(
  missionId: string,
  planetIdTo: string | null,
  ships: Ships,
  resources: Resources,
  DB: D1Database,
  PLANET_DO: DurableObjectNamespace,
): Promise<void> {
  if (planetIdTo) {
    // Add ships and resources to target planet
    const targetStub = getStub(PLANET_DO, planetIdTo);
    await targetStub.fetch(new Request('https://planet/ships/add', {
      method: 'POST',
      body: JSON.stringify({ ships, resources }),
    }));
  }

  // No return trip for deploy
  await DB.prepare(
    `UPDATE fleet_missions SET mission_status = 'completed' WHERE id = ?`,
  ).bind(missionId).run();
}

/**
 * EXPEDITION: random event, then return
 */
async function processExpeditionArrival(
  missionId: string,
  playerId: string,
  planetIdFrom: string,
  ships: Ships,
  resources: Resources,
  DB: D1Database,
  PLANET_DO: DurableObjectNamespace,
  nowSeconds: number,
): Promise<void> {
  // Random expedition outcome: resources, nothing, pirates, etc.
  const roll = Math.random();
  let bonus: Resources = { metal: 0, crystal: 0, deuterium: 0 };

  if (roll < 0.4) {
    // 40% chance: find resources
    const baseAmount = 5000 + Math.floor(Math.random() * 15000);
    const resourceType = Math.random();
    if (resourceType < 0.4) {
      bonus.metal = baseAmount;
    } else if (resourceType < 0.7) {
      bonus.crystal = Math.floor(baseAmount * 0.7);
    } else {
      bonus.deuterium = Math.floor(baseAmount * 0.3);
    }
  }
  // 20% chance: find nothing (already zero)
  // 20% chance: pirates (lose some ships - simplified: no loss here)
  // 20% chance: alien encounter (also simplified: no loss)

  const returnResources: Resources = {
    metal: resources.metal + bonus.metal,
    crystal: resources.crystal + bonus.crystal,
    deuterium: resources.deuterium + bonus.deuterium,
  };

  await scheduleReturn(missionId, planetIdFrom, ships, returnResources, DB, nowSeconds);
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Schedule a return trip for a fleet mission.
 * Updates the original mission to 'returning' and creates/updates the return data.
 */
async function scheduleReturn(
  missionId: string,
  planetIdFrom: string,
  ships: Ships,
  resources: Resources,
  DB: D1Database,
  nowSeconds: number,
): Promise<void> {
  // Calculate return duration (same as outbound for simplicity)
  const mission = await DB.prepare('SELECT * FROM fleet_missions WHERE id = ?').bind(missionId).first() as any;
  if (!mission) return;

  const outboundDuration = mission.time_arrival - mission.time_departure;
  const returnArrival = nowSeconds + Math.max(outboundDuration, 1);

  // Update the mission to returning status with return arrival time and updated ship/resource counts
  await DB.prepare(
    `UPDATE fleet_missions SET
       mission_status = 'returning',
       time_departure = ?,
       time_arrival = ?,
       metal = ?,
       crystal = ?,
       deuterium = ?,
       light_fighter = ?,
       heavy_fighter = ?,
       cruiser = ?,
       battleship = ?,
       battlecruiser = ?,
       bomber = ?,
       destroyer = ?,
       deathstar = ?,
       small_cargo = ?,
       large_cargo = ?,
       colony_ship = ?,
       recycler = ?,
       espionage_probe = ?
     WHERE id = ?`,
  ).bind(
    nowSeconds, returnArrival,
    resources.metal, resources.crystal, resources.deuterium,
    ships.lightFighter, ships.heavyFighter, ships.cruiser,
    ships.battleship, ships.battlecruiser, ships.bomber,
    ships.destroyer, ships.deathstar, ships.smallCargo,
    ships.largeCargo, ships.colonyShip, ships.recycler,
    ships.espionageProbe,
    missionId,
  ).run();
}

/**
 * Process a returning fleet: add ships + resources to origin planet, mark completed
 */
async function processReturn(
  row: Record<string, unknown>,
  DB: D1Database,
  PLANET_DO: DurableObjectNamespace,
): Promise<void> {
  const missionId = row.id as string;
  const planetIdFrom = row.planet_id_from as string;
  const ships = shipsFromRow(row);
  const resources: Resources = {
    metal: (row.metal as number) ?? 0,
    crystal: (row.crystal as number) ?? 0,
    deuterium: (row.deuterium as number) ?? 0,
  };

  // Add ships and resources back to origin planet
  const stub = getStub(PLANET_DO, planetIdFrom);
  await stub.fetch(new Request('https://planet/ships/add', {
    method: 'POST',
    body: JSON.stringify({ ships, resources }),
  }));

  // Mark mission completed
  await DB.prepare(
    `UPDATE fleet_missions SET mission_status = 'completed' WHERE id = ?`,
  ).bind(missionId).run();
}

/**
 * Get a DO stub from planet ID
 */
function getStub(PLANET_DO: DurableObjectNamespace, planetId: string) {
  const id = PLANET_DO.idFromName(planetId);
  return PLANET_DO.get(id);
}

/**
 * Create empty Ships object
 */
function emptyShips(): Ships {
  return {
    lightFighter: 0, heavyFighter: 0, cruiser: 0,
    battleship: 0, battlecruiser: 0, bomber: 0,
    destroyer: 0, deathstar: 0, smallCargo: 0,
    largeCargo: 0, colonyShip: 0, recycler: 0,
    espionageProbe: 0,
  };
}

/**
 * Convert a D1 row to a FleetMission object (used by fleetService.processFleetArrival)
 */
function rowToFleetMission(row: Record<string, unknown>): FleetMission {
  return {
    id: row.id as string,
    playerId: row.player_id as string,
    planetIdFrom: row.planet_id_from as string,
    planetIdTo: (row.planet_id_to as string) || null,
    sourceCoordinate: {
      galaxy: 1, system: 1, position: 1, // Simplified - not stored in DB row
    },
    targetCoordinate: {
      galaxy: (row.galaxy_to as number) ?? 1,
      system: (row.system_to as number) ?? 1,
      position: (row.position_to as number) ?? 1,
    },
    missionType: row.mission_type as any,
    missionStatus: row.mission_status as any,
    timeDeparture: row.time_departure as number,
    timeArrival: row.time_arrival as number,
    holdTime: (row.hold_time as number) ?? 0,
    speedPercent: 100,
    resources: {
      metal: (row.metal as number) ?? 0,
      crystal: (row.crystal as number) ?? 0,
      deuterium: (row.deuterium as number) ?? 0,
    },
    loot: { metal: 0, crystal: 0, deuterium: 0 },
    ships: shipsFromRow(row),
    fuelConsumed: 0,
    createdAt: (row.created_at as number) ?? Date.now(),
  };
}
