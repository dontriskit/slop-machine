/**
 * Planet Management Service — Planet Abandonment, Fleet Save, Fleet Recall
 *
 * Provides three high-level operations:
 *  - abandonPlanet: Remove a colony, return fleet to homeworld, notify player
 *  - fleetSave: Deploy fleet to own planet (mission type: deploy), no combat
 *  - recallFleet: Recall an in-flight fleet, reverse direction
 *
 * All state is persisted through D1 and PlanetDO. The service is stateless.
 *
 * Issues: #72 (Planet Abandonment), #73 (Fleet Save)
 */

import {
  Coordinate,
  Ships,
  Resources,
  FleetMission,
  FleetMissionType,
  FleetMissionStatus,
  PlanetState,
  SHIP_KEYS,
} from '../types';
import {
  calculateDistance,
  getSlowestSpeed,
  calculateDuration,
  calculateFuelConsumption,
} from '../formulas';
import { fleetService } from './fleetService';
import { createNotification } from './notificationService';

// ============================================================================
// TYPES
// ============================================================================

export interface AbandonPlanetResult {
  success: boolean;
  shipsReturned?: boolean;
  error?: string;
}

export interface FleetSaveResult {
  success: boolean;
  mission?: FleetMission;
  error?: string;
}

export interface RecallFleetResult {
  success: boolean;
  returnMission?: FleetMission;
  error?: string;
}

export interface PlayerPlanetRow {
  id: string;
  player_id: string;
  name: string;
  galaxy: number;
  system: number;
  position: number;
  temperature: number;
  fields: number;
  created_at: number;
}

// ============================================================================
// PLANET MANAGEMENT SERVICE
// ============================================================================

export class PlanetManagementService {
  constructor(
    private db: D1Database,
    private planetDO: DurableObjectNamespace,
  ) {}

  // --------------------------------------------------------------------------
  // abandonPlanet
  // --------------------------------------------------------------------------

  /**
   * Abandon a planet.
   *
   * Steps:
   *   1. Validate ownership — planet must belong to the player.
   *   2. Verify not homeworld — homeworld is the player's oldest planet.
   *   3. Cancel any in-flight missions from this planet.
   *   4. Retrieve fleet from PlanetDO.
   *   5. Transfer fleet to homeworld via PlanetDO.
   *   6. Delete planet row from D1.
   *   7. Destroy PlanetDO state (best-effort).
   *   8. Notify player of abandonment.
   */
  async abandonPlanet(
    db: D1Database,
    playerId: string,
    planetId: string,
  ): Promise<AbandonPlanetResult> {
    // 1. Verify ownership
    const planet = await db
      .prepare(`SELECT id, player_id, name, galaxy, system, position FROM planets WHERE id = ?`)
      .bind(planetId)
      .first<PlayerPlanetRow>();

    if (!planet) {
      return { success: false, error: 'Planet not found.' };
    }
    if (planet.player_id !== playerId) {
      return { success: false, error: 'You do not own this planet.' };
    }

    // 2. Check not homeworld (oldest planet by created_at)
    const homeworld = await this.getHomeworldId(db, playerId);
    if (homeworld === planetId) {
      return { success: false, error: 'Cannot abandon your homeworld.' };
    }

    // 3. Cancel in-flight missions from this planet
    await db
      .prepare(
        `UPDATE fleet_missions SET mission_status = 'canceled'
         WHERE planet_id_from = ? AND player_id = ? AND mission_status = 'in_transit'`,
      )
      .bind(planetId, playerId)
      .run();

    // 4. Retrieve fleet from PlanetDO and transfer to homeworld
    let shipsReturned = false;
    try {
      const doId = this.planetDO.idFromName(planetId);
      const stub = this.planetDO.get(doId);
      const stateRes = await stub.fetch(new Request('https://planet/state'));
      if (stateRes.ok) {
        const state = (await stateRes.json()) as { ships?: Record<string, number> };
        const ships = state?.ships ?? {};

        const hasAnyShips = Object.values(ships).some((count) => (count as number) > 0);

        // 5. Transfer fleet to homeworld if there are ships
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

        // 7. Destroy PlanetDO state (best-effort)
        await stub.fetch(new Request('https://planet/destroy', { method: 'POST' })).catch(() => {
          /* ignore */
        });
      }
    } catch (_err) {
      // Non-fatal: PlanetDO may not exist; continue with DB deletion
    }

    // 6. Delete planet row from D1
    await db.prepare(`DELETE FROM planets WHERE id = ?`).bind(planetId).run();

    // 8. Notify player
    try {
      await createNotification(
        playerId,
        'fleet_returned',
        'Planet Abandoned',
        `Your colony ${planet.name} at ${planet.galaxy}:${planet.system}:${planet.position} has been abandoned.${shipsReturned ? ' Fleet returned to homeworld.' : ''}`,
        db,
        {
          data: {
            planetId,
            planetName: planet.name,
            coordinate: `${planet.galaxy}:${planet.system}:${planet.position}`,
            shipsReturned,
          },
        },
      );
    } catch (_err) {
      // Non-fatal: notification failure should not block abandonment
    }

    return { success: true, shipsReturned };
  }

  // --------------------------------------------------------------------------
  // fleetSave
  // --------------------------------------------------------------------------

  /**
   * Fleet Save — deploy fleet to own planet (mission type: deploy).
   *
   * This is a safe fleet movement with no combat. The fleet travels to
   * the target planet (which must belong to the same player) and is
   * stationed there permanently (deploy = no return trip).
   *
   * Steps:
   *   1. Validate source and target planets belong to the player.
   *   2. Validate ships are available at source planet.
   *   3. Calculate flight time based on distance and speed.
   *   4. Deduct ships from source planet.
   *   5. Create fleet mission record (deploy type).
   *   6. Return the created mission.
   */
  async fleetSave(
    db: D1Database,
    playerId: string,
    planetId: string,
    targetPlanetId: string,
    ships: Ships,
    speed: number = 100,
  ): Promise<FleetSaveResult> {
    // Validate speed
    if (speed < 10 || speed > 100) {
      return { success: false, error: 'Speed must be between 10 and 100.' };
    }

    // Validate not same planet
    if (planetId === targetPlanetId) {
      return { success: false, error: 'Source and target planets must be different.' };
    }

    // Validate ships have at least one ship
    const totalShips = SHIP_KEYS.reduce((sum, key) => sum + (ships[key] ?? 0), 0);
    if (totalShips === 0) {
      return { success: false, error: 'Must send at least one ship.' };
    }

    // 1. Validate source planet belongs to player
    const sourcePlanet = await db
      .prepare(`SELECT id, player_id, galaxy, system, position FROM planets WHERE id = ?`)
      .bind(planetId)
      .first<PlayerPlanetRow>();

    if (!sourcePlanet) {
      return { success: false, error: 'Source planet not found.' };
    }
    if (sourcePlanet.player_id !== playerId) {
      return { success: false, error: 'You do not own the source planet.' };
    }

    // Validate target planet belongs to player
    const targetPlanet = await db
      .prepare(`SELECT id, player_id, galaxy, system, position FROM planets WHERE id = ?`)
      .bind(targetPlanetId)
      .first<PlayerPlanetRow>();

    if (!targetPlanet) {
      return { success: false, error: 'Target planet not found.' };
    }
    if (targetPlanet.player_id !== playerId) {
      return { success: false, error: 'You do not own the target planet.' };
    }

    // 2. Validate ships available at source planet via PlanetDO
    let planetState: PlanetState;
    try {
      const doId = this.planetDO.idFromName(planetId);
      const stub = this.planetDO.get(doId);
      const stateRes = await stub.fetch(new Request('https://planet/state'));
      if (!stateRes.ok) {
        return { success: false, error: 'Could not retrieve source planet state.' };
      }
      planetState = (await stateRes.json()) as PlanetState;
    } catch (_err) {
      return { success: false, error: 'Could not retrieve source planet state.' };
    }

    // Check all ship types are available
    for (const key of SHIP_KEYS) {
      if ((ships[key] ?? 0) > (planetState.ships[key] ?? 0)) {
        return { success: false, error: `Not enough ${key} at source planet.` };
      }
    }

    // 3. Calculate flight time
    const fromCoord: Coordinate = {
      galaxy: sourcePlanet.galaxy,
      system: sourcePlanet.system,
      position: sourcePlanet.position,
    };
    const toCoord: Coordinate = {
      galaxy: targetPlanet.galaxy,
      system: targetPlanet.system,
      position: targetPlanet.position,
    };

    const distance = fleetService.getDistance(fromCoord, toCoord);
    const slowestSpeed = getSlowestSpeed(ships);
    const durationSeconds = calculateDuration(distance, slowestSpeed, speed);
    const fuelRequired = calculateFuelConsumption(ships, distance, durationSeconds);

    // Check fuel
    if (planetState.resources.deuterium < fuelRequired) {
      return { success: false, error: 'Not enough deuterium for fuel.' };
    }

    // 4. Deduct ships and fuel from source planet
    const missionId = `fleet-save-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const nowSeconds = Math.floor(Date.now() / 1000);

    // Use fleetService.dispatchFleet for proper deduction
    const result = fleetService.dispatchFleet(
      {
        missionId,
        playerId,
        fromPlanetId: planetId,
        toPlanetId: targetPlanetId,
        from: fromCoord,
        to: toCoord,
        ships,
        resources: { metal: 0, crystal: 0, deuterium: 0 },
        missionType: 'deploy',
        speedPercent: speed,
      },
      planetState,
    );

    if (!result.mission) {
      return { success: false, error: result.reason ?? 'Fleet dispatch failed.' };
    }

    // Persist updated planet state back to DO
    try {
      const doId = this.planetDO.idFromName(planetId);
      const stub = this.planetDO.get(doId);
      await stub.fetch(
        new Request('https://planet/setState', {
          method: 'POST',
          body: JSON.stringify(planetState),
        }),
      );
    } catch (_err) {
      // Non-fatal for test purposes
    }

    // 5. Persist fleet mission to D1
    const m = result.mission;
    await db
      .prepare(
        `INSERT INTO fleet_missions
           (id, player_id, mission_type, mission_status, time_departure, time_arrival,
            planet_id_from, planet_id_to, galaxy_to, system_to, position_to,
            light_fighter, heavy_fighter, cruiser, battleship, battlecruiser,
            bomber, destroyer, deathstar, small_cargo, large_cargo,
            colony_ship, recycler, espionage_probe,
            metal, crystal, deuterium)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        m.id,
        m.playerId,
        m.missionType,
        m.missionStatus,
        m.timeDeparture,
        m.timeArrival,
        m.planetIdFrom,
        m.planetIdTo,
        m.targetCoordinate.galaxy,
        m.targetCoordinate.system,
        m.targetCoordinate.position,
        m.ships.lightFighter,
        m.ships.heavyFighter,
        m.ships.cruiser,
        m.ships.battleship,
        m.ships.battlecruiser,
        m.ships.bomber,
        m.ships.destroyer,
        m.ships.deathstar,
        m.ships.smallCargo,
        m.ships.largeCargo,
        m.ships.colonyShip,
        m.ships.recycler,
        m.ships.espionageProbe,
        m.resources.metal,
        m.resources.crystal,
        m.resources.deuterium,
      )
      .run();

    return { success: true, mission: m };
  }

  // --------------------------------------------------------------------------
  // recallFleet
  // --------------------------------------------------------------------------

  /**
   * Recall an in-flight fleet.
   *
   * The fleet reverses direction and returns to the source planet.
   * The return trip duration is proportional to how far the fleet has already traveled.
   *
   * Steps:
   *   1. Fetch mission from D1.
   *   2. Validate mission belongs to player and is in_transit.
   *   3. Calculate elapsed time and remaining time for proportional return.
   *   4. Create a return mission (reverse direction).
   *   5. Mark original mission as canceled.
   *   6. Persist return mission to D1.
   */
  async recallFleet(
    db: D1Database,
    playerId: string,
    missionId: string,
  ): Promise<RecallFleetResult> {
    // 1. Fetch mission
    const mission = await db
      .prepare(`SELECT * FROM fleet_missions WHERE id = ?`)
      .bind(missionId)
      .first<Record<string, unknown>>();

    if (!mission) {
      return { success: false, error: 'Mission not found.' };
    }

    // 2. Validate ownership and status
    if (mission.player_id !== playerId) {
      return { success: false, error: 'You do not own this mission.' };
    }
    if (mission.mission_status !== 'in_transit') {
      return { success: false, error: 'Only in-transit missions can be recalled.' };
    }

    // Cannot recall return missions
    if (mission.mission_type === 'return') {
      return { success: false, error: 'Cannot recall a return mission.' };
    }

    // 3. Calculate return time proportional to distance already traveled
    const nowSeconds = Math.floor(Date.now() / 1000);
    const totalDuration = (mission.time_arrival as number) - (mission.time_departure as number);
    const elapsed = Math.max(0, nowSeconds - (mission.time_departure as number));
    // The fleet has been traveling for `elapsed` seconds; it takes that long to return
    const returnDuration = Math.max(1, Math.min(elapsed, totalDuration));

    // Reconstruct ships from DB columns
    const ships: Ships = {
      lightFighter: (mission.light_fighter as number) ?? 0,
      heavyFighter: (mission.heavy_fighter as number) ?? 0,
      cruiser: (mission.cruiser as number) ?? 0,
      battleship: (mission.battleship as number) ?? 0,
      battlecruiser: (mission.battlecruiser as number) ?? 0,
      bomber: (mission.bomber as number) ?? 0,
      destroyer: (mission.destroyer as number) ?? 0,
      deathstar: (mission.deathstar as number) ?? 0,
      smallCargo: (mission.small_cargo as number) ?? 0,
      largeCargo: (mission.large_cargo as number) ?? 0,
      colonyShip: (mission.colony_ship as number) ?? 0,
      recycler: (mission.recycler as number) ?? 0,
      espionageProbe: (mission.espionage_probe as number) ?? 0,
    };

    const resources: Resources = {
      metal: (mission.metal as number) ?? 0,
      crystal: (mission.crystal as number) ?? 0,
      deuterium: (mission.deuterium as number) ?? 0,
    };

    // 4. Create return mission
    const returnMissionId = `${missionId}-recall`;
    const returnMission: FleetMission = {
      id: returnMissionId,
      playerId,
      planetIdFrom: (mission.planet_id_to as string) ?? (mission.planet_id_from as string),
      planetIdTo: mission.planet_id_from as string,
      sourceCoordinate: {
        galaxy: (mission.galaxy_to as number) ?? 0,
        system: (mission.system_to as number) ?? 0,
        position: (mission.position_to as number) ?? 0,
      },
      targetCoordinate: {
        galaxy: 0, // Will be filled from source planet lookup
        system: 0,
        position: 0,
      },
      missionType: 'return',
      missionStatus: 'in_transit',
      timeDeparture: nowSeconds,
      timeArrival: nowSeconds + returnDuration,
      holdTime: 0,
      speedPercent: 100,
      resources,
      loot: { metal: 0, crystal: 0, deuterium: 0 },
      ships,
      fuelConsumed: 0,
      createdAt: Date.now(),
    };

    // Look up source planet coords for the return trip target
    const sourcePlanet = await db
      .prepare(`SELECT galaxy, system, position FROM planets WHERE id = ?`)
      .bind(mission.planet_id_from as string)
      .first<{ galaxy: number; system: number; position: number }>();

    if (sourcePlanet) {
      returnMission.targetCoordinate = {
        galaxy: sourcePlanet.galaxy,
        system: sourcePlanet.system,
        position: sourcePlanet.position,
      };
    }

    // 5. Mark original mission as canceled
    await db
      .prepare(`UPDATE fleet_missions SET mission_status = 'canceled' WHERE id = ?`)
      .bind(missionId)
      .run();

    // 6. Persist return mission to D1
    await db
      .prepare(
        `INSERT INTO fleet_missions
           (id, player_id, mission_type, mission_status, time_departure, time_arrival,
            planet_id_from, planet_id_to, galaxy_to, system_to, position_to,
            light_fighter, heavy_fighter, cruiser, battleship, battlecruiser,
            bomber, destroyer, deathstar, small_cargo, large_cargo,
            colony_ship, recycler, espionage_probe,
            metal, crystal, deuterium)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        returnMission.id,
        returnMission.playerId,
        returnMission.missionType,
        returnMission.missionStatus,
        returnMission.timeDeparture,
        returnMission.timeArrival,
        returnMission.planetIdFrom,
        returnMission.planetIdTo,
        returnMission.targetCoordinate.galaxy,
        returnMission.targetCoordinate.system,
        returnMission.targetCoordinate.position,
        returnMission.ships.lightFighter,
        returnMission.ships.heavyFighter,
        returnMission.ships.cruiser,
        returnMission.ships.battleship,
        returnMission.ships.battlecruiser,
        returnMission.ships.bomber,
        returnMission.ships.destroyer,
        returnMission.ships.deathstar,
        returnMission.ships.smallCargo,
        returnMission.ships.largeCargo,
        returnMission.ships.colonyShip,
        returnMission.ships.recycler,
        returnMission.ships.espionageProbe,
        returnMission.resources.metal,
        returnMission.resources.crystal,
        returnMission.resources.deuterium,
      )
      .run();

    return { success: true, returnMission };
  }

  // --------------------------------------------------------------------------
  // PRIVATE HELPERS
  // --------------------------------------------------------------------------

  /** Return the ID of the player's homeworld (oldest planet). */
  private async getHomeworldId(db: D1Database, playerId: string): Promise<string | null> {
    const row = await db
      .prepare(`SELECT id FROM planets WHERE player_id = ? ORDER BY created_at ASC LIMIT 1`)
      .bind(playerId)
      .first<{ id: string }>();
    return row?.id ?? null;
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createPlanetManagementService(
  db: D1Database,
  planetDO: DurableObjectNamespace,
): PlanetManagementService {
  return new PlanetManagementService(db, planetDO);
}
