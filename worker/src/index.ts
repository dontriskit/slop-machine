import { Hono } from 'hono';
import { PlanetDO } from './durable-objects/PlanetDO';
import { runBuildOrderAgent, runAgentForAllPlanets } from './agents/buildOrderAgent';
import { Coordinate, Strategy, PlanetState, Ships, Resources, FleetMissionType, FleetMission, SHIP_KEYS } from './game/types';
import { GalaxyService } from './game/services/galaxyService';
import { fleetService } from './game/services/fleetService';
import { camelToSnakeShip } from './game/types';

/**
 * Cosmic Protocol Worker
 *
 * Cloudflare Worker serving as backend for OGame clone.
 * Handles:
 * - RESTful API for game operations (planets, fleets, strategies)
 * - Durable Objects for per-planet state (resources, queue)
 * - Cron trigger for batch agent runs
 * - Workers AI integration for GLM-4.7-Flash decisions
 * - D1 for persistent storage
 */

type Bindings = {
  PLANET_DO: DurableObjectNamespace;
  DB: D1Database;
  KV: KVNamespace;
  AI: any; // Cloudflare Workers AI
};

const app = new Hono<{ Bindings: Bindings }>();

// ============================================================================
// HEALTH CHECK
// ============================================================================

app.get('/', (c) => {
  return c.json({
    status: 'ok',
    service: 'Cosmic Protocol Worker',
    version: '0.1.0',
  });
});

// ============================================================================
// PLANET ENDPOINTS
// ============================================================================

/**
 * GET /api/planet/:id/state
 * Get current planet state (resources, buildings, queue)
 */
app.get('/api/planet/:id/state', async (c) => {
  const planetId = c.req.param('id');
  const PLANET_DO = c.env.PLANET_DO;

  try {
    const doId = PLANET_DO.idFromName(planetId);
    const stub = PLANET_DO.get(doId);
    const response = await stub.fetch(new Request('https://planet/state'));
    const state = await response.json();
    return c.json(state);
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

/**
 * GET /api/planet/:id/resources
 * Get resources with current production rates
 */
app.get('/api/planet/:id/resources', async (c) => {
  const planetId = c.req.param('id');
  const PLANET_DO = c.env.PLANET_DO;

  try {
    const doId = PLANET_DO.idFromName(planetId);
    const stub = PLANET_DO.get(doId);
    const response = await stub.fetch(new Request('https://planet/resources'));
    const data = await response.json();
    return c.json(data);
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

/**
 * GET /api/planet/:id/buildings
 * Get building levels
 */
app.get('/api/planet/:id/buildings', async (c) => {
  const planetId = c.req.param('id');
  const PLANET_DO = c.env.PLANET_DO;

  try {
    const doId = PLANET_DO.idFromName(planetId);
    const stub = PLANET_DO.get(doId);
    const response = await stub.fetch(new Request('https://planet/buildings'));
    const buildings = await response.json();
    return c.json(buildings);
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

/**
 * GET /api/planet/:id/queue
 * Get build queue
 */
app.get('/api/planet/:id/queue', async (c) => {
  const planetId = c.req.param('id');
  const PLANET_DO = c.env.PLANET_DO;

  try {
    const doId = PLANET_DO.idFromName(planetId);
    const stub = PLANET_DO.get(doId);
    const response = await stub.fetch(new Request('https://planet/queue/list'));
    const queue = await response.json();
    return c.json(queue);
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

/**
 * POST /api/planet/:id/queue
 * Add building to queue
 * Body: { buildingId: number, targetLevel: number }
 */
app.post('/api/planet/:id/queue', async (c) => {
  const planetId = c.req.param('id');
  const PLANET_DO = c.env.PLANET_DO;
  const DB = c.env.DB;

  try {
    const body = await c.req.json();
    const doId = PLANET_DO.idFromName(planetId);
    const stub = PLANET_DO.get(doId);
    const response = await stub.fetch(new Request('https://planet/queue/add', { method: 'POST', body: JSON.stringify(body) }));

    if (!response.ok) {
      return c.json({ error: await response.text() }, response.status as 400 | 404 | 500);
    }

    const result = (await response.json()) as { queueItem?: { buildingId: number; targetLevel: number } };

    // Log to build_history
    if (result.queueItem) {
      await DB.prepare(
        `INSERT INTO build_history (id, planet_id, building_id, level, source, ai_reason, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          `${planetId}-${Date.now()}`,
          planetId,
          result.queueItem.buildingId,
          result.queueItem.targetLevel,
          'manual',
          'Manual build queue',
          Math.floor(Date.now() / 1000)
        )
        .run();
    }

    return c.json(result);
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

/**
 * POST /api/planet/:id/initialize
 * Initialize planet with starting state
 */
app.post('/api/planet/:id/initialize', async (c) => {
  const planetId = c.req.param('id');
  const PLANET_DO = c.env.PLANET_DO;

  try {
    const body = await c.req.json();
    const doId = PLANET_DO.idFromName(planetId);
    const stub = PLANET_DO.get(doId);
    const response = await stub.fetch(new Request('https://planet/initialize', { method: 'POST', body: JSON.stringify(body) }));

    if (!response.ok) {
      return c.json({ error: await response.text() }, response.status as 400 | 404 | 500);
    }

    return c.json(await response.json());
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

// ============================================================================
// STRATEGY ENDPOINTS
// ============================================================================

/**
 * GET /api/strategies
 * List all strategies for a player
 */
app.get('/api/strategies', async (c) => {
  const playerId = c.req.query('player_id');
  const DB = c.env.DB;

  if (!playerId) {
    return c.json({ error: 'player_id query param required' }, 400);
  }

  try {
    const strategies = await DB.prepare('SELECT id, name, steps FROM build_strategies WHERE player_id = ?').bind(playerId).all();

    return c.json(strategies.results || []);
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

/**
 * GET /api/strategies/:id
 * Get specific strategy
 */
app.get('/api/strategies/:id', async (c) => {
  const strategyId = c.req.param('id');
  const DB = c.env.DB;

  try {
    const strategy = await DB.prepare('SELECT id, player_id, name, steps FROM build_strategies WHERE id = ?').bind(strategyId).first();

    if (!strategy) {
      return c.json({ error: 'Strategy not found' }, 404);
    }

    return c.json({
      ...strategy,
      steps: JSON.parse((strategy.steps as string) || '[]'),
    });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

/**
 * POST /api/strategies
 * Create new strategy
 * Body: { playerId, name, steps: [{buildingId, targetLevel}] }
 */
app.post('/api/strategies', async (c) => {
  const DB = c.env.DB;

  try {
    const body = await c.req.json<{
      playerId: string;
      name: string;
      steps: Array<{ buildingId: number; targetLevel: number }>;
    }>();

    const id = `strat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    await DB.prepare(
      `INSERT INTO build_strategies (id, player_id, name, steps, created_at)
       VALUES (?, ?, ?, ?, ?)`
    )
      .bind(id, body.playerId, body.name, JSON.stringify(body.steps), Math.floor(Date.now() / 1000))
      .run();

    return c.json({ id, ...body }, 201);
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

// ============================================================================
// AGENT ENDPOINTS
// ============================================================================

/**
 * POST /api/planet/:id/agent/run
 * Trigger build order agent for a single planet (manual trigger)
 */
app.post('/api/planet/:id/agent/run', async (c) => {
  const planetId = c.req.param('id');
  const PLANET_DO = c.env.PLANET_DO;
  const DB = c.env.DB;
  const AI = c.env.AI;

  try {
    // Get planet state
    const planetDoId = PLANET_DO.idFromName(planetId);
    const planetStub = PLANET_DO.get(planetDoId);
    const stateRes = await planetStub.fetch(new Request('https://planet/state'));
    const planetState = (await stateRes.json()) as PlanetState;

    // Get planet's strategy
    const strategyResult = await DB.prepare('SELECT id, steps FROM build_strategies WHERE id = (SELECT strategy_id FROM planets WHERE id = ?)').bind(planetId).first();

    if (!strategyResult) {
      return c.json({ error: 'No strategy assigned to planet' }, 400);
    }

    const strategy: Strategy = {
      id: strategyResult.id as string,
      playerId: planetState.playerId,
      name: '',
      steps: JSON.parse((strategyResult.steps as string) || '[]'),
    };

    // Run agent
    const decision = await runBuildOrderAgent(planetState, strategy.steps, { AI });

    if (!decision) {
      return c.json({ error: 'Agent failed to make decision' }, 500);
    }

    return c.json({ decision });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

/**
 * POST /api/planet/:id/agent/enable
 * Enable automatic agent runs (sets agent_enabled flag)
 */
app.post('/api/planet/:id/agent/enable', async (c) => {
  const planetId = c.req.param('id');
  const DB = c.env.DB;

  try {
    await DB.prepare('UPDATE planets SET agent_enabled = 1 WHERE id = ?').bind(planetId).run();

    return c.json({ agent_enabled: true });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

/**
 * POST /api/planet/:id/agent/disable
 * Disable automatic agent runs
 */
app.post('/api/planet/:id/agent/disable', async (c) => {
  const planetId = c.req.param('id');
  const DB = c.env.DB;

  try {
    await DB.prepare('UPDATE planets SET agent_enabled = 0 WHERE id = ?').bind(planetId).run();

    return c.json({ agent_enabled: false });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

// ============================================================================
// FLEET ENDPOINTS
// ============================================================================

/**
 * POST /api/fleet/send
 * Launch a fleet mission.
 *
 * Body: {
 *   playerId: string,
 *   fromPlanetId: string,
 *   toPlanetId?: string | null,
 *   toCoord: { galaxy, system, position },
 *   ships: Ships,
 *   missionType: FleetMissionType,
 *   resources?: Resources,
 *   speedPercent?: number,
 *   fleetSpeed?: number,
 * }
 *
 * Flow:
 *   1. Fetch source planet state from the Durable Object
 *   2. Run fleet dispatch validation + deduction via fleetService
 *   3. Persist updated planet state back to the DO
 *   4. Store fleet mission record in D1
 *   5. Return the mission details
 */
app.post('/api/fleet/send', async (c) => {
  const DB = c.env.DB;
  const PLANET_DO = c.env.PLANET_DO;

  try {
    const body = await c.req.json<{
      playerId: string;
      fromPlanetId: string;
      toPlanetId?: string | null;
      toCoord: Coordinate;
      ships: Ships;
      missionType: FleetMissionType;
      resources?: Resources;
      speedPercent?: number;
      fleetSpeed?: number;
    }>();

    const {
      playerId,
      fromPlanetId,
      toPlanetId = null,
      toCoord,
      ships,
      missionType,
      resources = { metal: 0, crystal: 0, deuterium: 0 },
      speedPercent = 100,
      fleetSpeed = 1.0,
    } = body;

    if (!playerId || !fromPlanetId || !toCoord || !ships || !missionType) {
      return c.json(
        { error: 'Missing required fields: playerId, fromPlanetId, toCoord, ships, missionType' },
        400 as any,
      );
    }

    // 1. Fetch source planet state from Durable Object
    const stub = PLANET_DO.get(fromPlanetId as any);
    const stateRes = await stub.fetch(new Request('https://planet/state'));
    if (!stateRes.ok) {
      return c.json({ error: 'Failed to fetch planet state' }, 500 as any);
    }
    const planetState = (await stateRes.json()) as PlanetState;

    // 2. Build dispatch params and run fleet dispatch (validates + deducts)
    const missionId = `fleet-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const dispatchResult = fleetService.dispatchFleet(
      {
        missionId,
        playerId,
        fromPlanetId,
        toPlanetId,
        from: planetState.coordinate,
        to: toCoord,
        ships,
        resources,
        missionType,
        speedPercent,
        fleetSpeed,
      },
      planetState,
    );

    if (!dispatchResult.mission) {
      return c.json({ error: dispatchResult.reason || 'Dispatch failed' }, 400 as any);
    }

    const mission = dispatchResult.mission;

    // 3. Persist updated planet state (ships and resources deducted) back to DO
    await stub.fetch(
      new Request('https://planet/fleet-deduct', {
        method: 'POST',
        body: JSON.stringify({
          ships: planetState.ships,
          resources: planetState.resources,
        }),
      }),
    );

    // 4. Store fleet mission in D1
    await DB.prepare(
      `INSERT INTO fleet_missions (
        id, player_id, planet_id_from, planet_id_to,
        galaxy_to, system_to, position_to,
        mission_type, mission_status, time_departure, time_arrival,
        hold_time, metal, crystal, deuterium,
        light_fighter, heavy_fighter, cruiser, battleship,
        battlecruiser, bomber, destroyer, deathstar,
        small_cargo, large_cargo, colony_ship, recycler, espionage_probe
      ) VALUES (
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?
      )`,
    )
      .bind(
        mission.id,
        mission.playerId,
        mission.planetIdFrom,
        mission.planetIdTo,
        mission.targetCoordinate.galaxy,
        mission.targetCoordinate.system,
        mission.targetCoordinate.position,
        mission.missionType,
        mission.missionStatus,
        mission.timeDeparture,
        mission.timeArrival,
        mission.holdTime,
        mission.resources.metal,
        mission.resources.crystal,
        mission.resources.deuterium,
        mission.ships.lightFighter,
        mission.ships.heavyFighter,
        mission.ships.cruiser,
        mission.ships.battleship,
        mission.ships.battlecruiser,
        mission.ships.bomber,
        mission.ships.destroyer,
        mission.ships.deathstar,
        mission.ships.smallCargo,
        mission.ships.largeCargo,
        mission.ships.colonyShip,
        mission.ships.recycler,
        mission.ships.espionageProbe,
      )
      .run();

    return c.json({
      mission: {
        id: mission.id,
        missionType: mission.missionType,
        missionStatus: mission.missionStatus,
        from: mission.sourceCoordinate,
        to: mission.targetCoordinate,
        ships: mission.ships,
        resources: mission.resources,
        timeDeparture: mission.timeDeparture,
        timeArrival: mission.timeArrival,
        fuelConsumed: mission.fuelConsumed,
      },
    }, 201 as any);
  } catch (error) {
    return c.json({ error: String(error) }, 500 as any);
  }
});

/**
 * GET /api/fleet/missions
 * Get player's fleet missions
 */
app.get('/api/fleet/missions', async (c) => {
  const playerId = c.req.query('player_id');
  const DB = c.env.DB;

  if (!playerId) {
    return c.json({ error: 'player_id query param required' }, 400);
  }

  try {
    const missions = await DB.prepare(
      `SELECT id, mission_type, mission_status, time_departure, time_arrival,
              planet_id_from, galaxy_to, system_to, position_to
       FROM fleet_missions
       WHERE player_id = ?
       ORDER BY time_arrival DESC
       LIMIT 50`
    )
      .bind(playerId)
      .all();

    return c.json(missions.results || []);
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

/**
 * GET /api/fleet/missions/:id
 * Get fleet mission details
 */
app.get('/api/fleet/missions/:id', async (c) => {
  const missionId = c.req.param('id');
  const DB = c.env.DB;

  try {
    const mission = await DB.prepare(
      `SELECT * FROM fleet_missions WHERE id = ?`
    )
      .bind(missionId)
      .first();

    if (!mission) {
      return c.json({ error: 'Mission not found' }, 404);
    }

    return c.json(mission);
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

/**
 * POST /api/fleet/missions/:id/recall
 * Recall a fleet mission (return immediately)
 */
app.post('/api/fleet/missions/:id/recall', async (c) => {
  const missionId = c.req.param('id');
  const DB = c.env.DB;

  try {
    // TODO: Implement fleet recall logic
    // 1. Get mission
    // 2. Check if in transit
    // 3. Create return mission
    // 4. Update original mission status to canceled
    // 5. Return new mission

    return c.json(
      {
        error: 'Fleet recall not yet implemented',
      },
      501
    );
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

/**
 * POST /api/fleet/missions/:id/process-arrival
 * Process a fleet mission arrival. For attack missions this runs the battle
 * engine, calculates loot, logs a battle report to D1, and creates a return
 * mission. For other mission types (transport, deploy, harvest, etc.) it
 * delegates to fleetService.processFleetArrival.
 *
 * The caller must supply defender data for attack missions.
 *
 * Body (for attacks): {
 *   defenderData: { ships, defenses, resources, owner },
 * }
 */
app.post('/api/fleet/missions/:id/process-arrival', async (c) => {
  const missionId = c.req.param('id');
  const DB = c.env.DB;
  const PLANET_DO = c.env.PLANET_DO;

  try {
    // 1. Load the mission from D1
    const missionRow = await DB.prepare('SELECT * FROM fleet_missions WHERE id = ?')
      .bind(missionId)
      .first();

    if (!missionRow) {
      return c.json({ error: 'Mission not found' }, 404 as any);
    }

    // Reconstruct FleetMission from D1 row
    const mission: FleetMission = {
      id: missionRow.id as string,
      playerId: missionRow.player_id as string,
      planetIdFrom: missionRow.planet_id_from as string,
      planetIdTo: missionRow.planet_id_to as string | null,
      sourceCoordinate: {
        galaxy: 0, system: 0, position: 0, // We'd need these stored; use target for now
      },
      targetCoordinate: {
        galaxy: missionRow.galaxy_to as number,
        system: missionRow.system_to as number,
        position: missionRow.position_to as number,
      },
      missionType: missionRow.mission_type as FleetMissionType,
      missionStatus: missionRow.mission_status as any,
      timeDeparture: missionRow.time_departure as number,
      timeArrival: missionRow.time_arrival as number,
      holdTime: missionRow.hold_time as number,
      speedPercent: 100,
      resources: {
        metal: missionRow.metal as number,
        crystal: missionRow.crystal as number,
        deuterium: missionRow.deuterium as number,
      },
      loot: { metal: 0, crystal: 0, deuterium: 0 },
      ships: {
        lightFighter: missionRow.light_fighter as number,
        heavyFighter: missionRow.heavy_fighter as number,
        cruiser: missionRow.cruiser as number,
        battleship: missionRow.battleship as number,
        battlecruiser: missionRow.battlecruiser as number,
        bomber: missionRow.bomber as number,
        destroyer: missionRow.destroyer as number,
        deathstar: missionRow.deathstar as number,
        smallCargo: missionRow.small_cargo as number,
        largeCargo: missionRow.large_cargo as number,
        colonyShip: missionRow.colony_ship as number,
        recycler: missionRow.recycler as number,
        espionageProbe: missionRow.espionage_probe as number,
      },
      fuelConsumed: 0,
      createdAt: missionRow.created_at as number,
    };

    // 2. Parse request body for defender data (attacks)
    const body = await c.req.json<{ defenderData?: any }>().catch(() => ({}));

    // 3. Process arrival through fleet service
    const arrivalResult = fleetService.processFleetArrival(mission, {
      defenderData: body.defenderData,
    });

    // 4. Update mission status in D1
    await DB.prepare('UPDATE fleet_missions SET mission_status = ? WHERE id = ?')
      .bind(mission.missionStatus, missionId)
      .run();

    // 5. If there was a battle, log the battle report to D1
    if (arrivalResult.battle) {
      const br = arrivalResult.battle;
      await DB.prepare(
        `INSERT INTO battle_reports (
          id, attacker_id, defender_id, attacker_planet_id, defender_planet_id,
          mission_id, winner, rounds_fought,
          attacker_loss_metal, attacker_loss_crystal, attacker_loss_deuterium,
          defender_loss_metal, defender_loss_crystal, defender_loss_deuterium,
          loot_metal, loot_crystal, loot_deuterium,
          battle_data
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          br.id,
          br.attackerId,
          br.defenderId,
          mission.planetIdFrom,
          mission.planetIdTo,
          missionId,
          br.winner,
          br.rounds.length,
          br.attackerLosses.metal,
          br.attackerLosses.crystal,
          br.attackerLosses.deuterium,
          br.defenderLosses.metal,
          br.defenderLosses.crystal,
          br.defenderLosses.deuterium,
          br.loot.metal,
          br.loot.crystal,
          br.loot.deuterium,
          JSON.stringify(br),
        )
        .run();
    }

    // 6. If a return mission was created, store it in D1
    if (arrivalResult.returnMission) {
      const rm = arrivalResult.returnMission;
      await DB.prepare(
        `INSERT INTO fleet_missions (
          id, player_id, planet_id_from, planet_id_to,
          galaxy_to, system_to, position_to,
          mission_type, mission_status, time_departure, time_arrival,
          hold_time, metal, crystal, deuterium,
          light_fighter, heavy_fighter, cruiser, battleship,
          battlecruiser, bomber, destroyer, deathstar,
          small_cargo, large_cargo, colony_ship, recycler, espionage_probe
        ) VALUES (
          ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?, ?
        )`,
      )
        .bind(
          rm.id, rm.playerId, rm.planetIdFrom, rm.planetIdTo,
          rm.targetCoordinate.galaxy, rm.targetCoordinate.system, rm.targetCoordinate.position,
          rm.missionType, rm.missionStatus, rm.timeDeparture, rm.timeArrival,
          rm.holdTime, rm.resources.metal, rm.resources.crystal, rm.resources.deuterium,
          rm.ships.lightFighter, rm.ships.heavyFighter, rm.ships.cruiser, rm.ships.battleship,
          rm.ships.battlecruiser, rm.ships.bomber, rm.ships.destroyer, rm.ships.deathstar,
          rm.ships.smallCargo, rm.ships.largeCargo, rm.ships.colonyShip, rm.ships.recycler,
          rm.ships.espionageProbe,
        )
        .run();
    }

    return c.json({
      processed: true,
      missionId: arrivalResult.missionId,
      missionType: arrivalResult.missionType,
      success: arrivalResult.success,
      winner: arrivalResult.battle?.winner,
      loot: arrivalResult.loot,
      survivingShips: arrivalResult.survivingShips,
      returnMissionId: arrivalResult.returnMission?.id,
      battleReportId: arrivalResult.battle?.id,
    });
  } catch (error) {
    return c.json({ error: String(error) }, 500 as any);
  }
});

/**
 * GET /api/battle-reports
 * Get player's battle reports
 */
app.get('/api/battle-reports', async (c) => {
  const playerId = c.req.query('player_id');
  const DB = c.env.DB;

  if (!playerId) {
    return c.json({ error: 'player_id query param required' }, 400);
  }

  try {
    const reports = await DB.prepare(
      `SELECT id, attacker_id, defender_id, winner, rounds_fought,
              attacker_loss_metal, attacker_loss_crystal, attacker_loss_deuterium,
              defender_loss_metal, defender_loss_crystal, defender_loss_deuterium,
              loot_metal, loot_crystal, loot_deuterium, created_at
       FROM battle_reports
       WHERE attacker_id = ? OR defender_id = ?
       ORDER BY created_at DESC
       LIMIT 50`
    )
      .bind(playerId, playerId)
      .all();

    return c.json(reports.results || []);
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

/**
 * GET /api/battle-reports/:id
 * Get full battle report with detailed data
 */
app.get('/api/battle-reports/:id', async (c) => {
  const reportId = c.req.param('id');
  const DB = c.env.DB;

  try {
    const report = await DB.prepare(
      `SELECT * FROM battle_reports WHERE id = ?`
    )
      .bind(reportId)
      .first();

    if (!report) {
      return c.json({ error: 'Battle report not found' }, 404);
    }

    // Parse battle data JSON if present
    const result = { ...report };
    if (report.battle_data) {
      result.battle_data = JSON.parse(report.battle_data as string);
    }

    return c.json(result);
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

// ============================================================================
// GALAXY MAP ENDPOINTS
// ============================================================================

/**
 * GET /api/galaxy/:galaxy/:system
 * Returns a full 15-slot SystemView for the given (galaxy, system).
 */
app.get('/api/galaxy/:galaxy/:system', async (c) => {
  const DB = c.env.DB;
  const PLANET_DO = c.env.PLANET_DO;

  const galaxy = parseInt(c.req.param('galaxy'), 10);
  const system = parseInt(c.req.param('system'), 10);

  if (isNaN(galaxy) || isNaN(system)) {
    return c.json({ error: 'galaxy and system must be integers' }, 400);
  }

  try {
    const svc = new GalaxyService(DB, PLANET_DO);
    const view = await svc.getSystemView(galaxy, system);
    return c.json(view);
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

/**
 * GET /api/galaxy/:galaxy
 * Returns a summary of how many slots are occupied per system in the galaxy.
 */
app.get('/api/galaxy/:galaxy', async (c) => {
  const DB = c.env.DB;
  const PLANET_DO = c.env.PLANET_DO;

  const galaxy = parseInt(c.req.param('galaxy'), 10);

  if (isNaN(galaxy)) {
    return c.json({ error: 'galaxy must be an integer' }, 400);
  }

  try {
    const svc = new GalaxyService(DB, PLANET_DO);
    const summary = await svc.getGalaxySummary(galaxy);
    return c.json({ galaxy, systems: summary });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

/**
 * POST /api/galaxy/colonize
 * Colonize an empty position.
 * Body: { playerId, fromPlanetId, galaxy, system, position }
 */
app.post('/api/galaxy/colonize', async (c) => {
  const DB = c.env.DB;
  const PLANET_DO = c.env.PLANET_DO;

  try {
    const body = await c.req.json<{
      playerId: string;
      fromPlanetId: string;
      galaxy: number;
      system: number;
      position: number;
    }>();

    const { playerId, fromPlanetId, galaxy, system, position } = body;

    if (!playerId || !fromPlanetId || !galaxy || !system || !position) {
      return c.json({ error: 'playerId, fromPlanetId, galaxy, system, position are required' }, 400);
    }

    const svc = new GalaxyService(DB, PLANET_DO);
    const result = await svc.colonize({ playerId, fromPlanetId, galaxy, system, position });

    if (!result.success) {
      return c.json({ error: result.error }, 400);
    }

    return c.json(result, 201);
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

// ============================================================================
// CRON TRIGGER
// ============================================================================

/**
 * Scheduled handler - runs every minute
 * Fans out build order agent to all active planets
 */
async function handleScheduled(event: ScheduledEvent, env: Bindings): Promise<void> {
  const DB = env.DB;
  const PLANET_DO = env.PLANET_DO;
  const AI = env.AI;

  try {
    // Get all planets with agent enabled
    const planetsResult = await DB.prepare('SELECT id, strategy_id FROM planets WHERE agent_enabled = 1').all();

    const planets = planetsResult.results as Array<{ id: string; strategy_id: string }>;

    if (planets.length === 0) {
      console.log('No planets with agent enabled');
      return;
    }

    // Load planet states and strategies
    const planetStates: Map<string, PlanetState> = new Map();
    const strategies: Map<string, Strategy> = new Map();
    const planetDOs: Map<string, any> = new Map();

    for (const planet of planets) {
      // Get planet state
      const doId = PLANET_DO.idFromName(planet.id);
      const stub = PLANET_DO.get(doId);
      planetDOs.set(planet.id, stub);

      const stateRes = await stub.fetch(new Request('https://planet/state'));
      if (stateRes.ok) {
        const state = (await stateRes.json()) as PlanetState;
        planetStates.set(planet.id, state);
      }

      // Get strategy
      if (planet.strategy_id) {
        const stratResult = await DB.prepare(
          'SELECT id, player_id, name, steps FROM build_strategies WHERE id = ?'
        )
          .bind(planet.strategy_id)
          .first();

        if (stratResult) {
          strategies.set(planet.id, {
            id: stratResult.id as string,
            playerId: stratResult.player_id as string,
            name: stratResult.name as string,
            steps: JSON.parse((stratResult.steps as string) || '[]'),
          });
        }
      }
    }

    // Run agent for all planets in parallel
    const results = await runAgentForAllPlanets(
      Array.from(planetStates.values()),
      strategies,
      planetDOs,
      AI,
      DB
    );

    console.log(`[Cron] Agent run: ${results.succeeded}/${results.total} planets succeeded`);
  } catch (error) {
    console.error('Cron handler error:', error);
  }
}

// Export Durable Object
export { PlanetDO };

// Export handler for scheduled event (Cron)
export default {
  async fetch(request: Request, env: Bindings): Promise<Response> {
    return app.fetch(request, env);
  },

  async scheduled(event: ScheduledEvent, env: Bindings): Promise<void> {
    await handleScheduled(event, env);
  },
};
