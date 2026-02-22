import { Hono } from 'hono';
import { PlanetDO } from './durable-objects/PlanetDO';
import { runBuildOrderAgent, runAgentForAllPlanets } from './agents/buildOrderAgent';
import { generateAsset, GenerateAssetRequest } from './agents/assetGenerator';
import { Coordinate, Strategy, PlanetState } from './game/types';
import { GalaxyService } from './game/services/galaxyService';
import { fleetService } from './game/services/fleetService';
import { expeditionService, calculateFleetValue } from './game/services/expeditionService';
import { espionageService } from './game/services/espionageService';
import { createAlliance, dissolveAlliance, applyToAlliance, acceptApplication, rejectApplication, kickMember, leaveAlliance, promoteToOfficer, demoteToMember, getAllianceMembers, getPlayerAlliance, getAllianceById, searchAlliances, getAllianceApplications } from './game/services/allianceService';
import { getLeaderboard, getPlayerProfile } from './game/services/leaderboardService';
import { sendMessage, getInbox, getOutbox, getMessage, deleteMessage, getUnreadCount, markAllRead, sendSystemMessage } from './game/services/messageService';
import { getEmptyDefenses } from './game/defenses';
import { getEmptyTechLevels } from './game/services/researchService';
import { mintCompressedNFT, buildMetadata } from './solana/mint';
import type { MintRequest, NFTAsset, AssetType } from './solana/types';
import {
  ACHIEVEMENTS,
  checkAchievements,
  getPlayerAchievements,
  getPlayerStats as getAchievementPlayerStats,
} from './game/services/achievementService';
import {
  getPlayerStats,
  getTopPlayers,
} from './game/services/statsService';
import type { LeaderboardStat } from './game/services/statsService';
import {
  OFFICER_DEFINITIONS,
  OFFICER_TYPES,
  activateOfficer,
  deactivateOfficer,
  getActiveOfficers,
  getOfficerBonuses,
} from './game/services/officerService';
import type { OfficerType } from './game/types';
import { ColonizationService } from './game/services/colonizationService';
    const result = await svc.colonize({ playerId, fromPlanetId, galaxy, system, position });
    const result = await svc.colonizePlanet({ playerId, fromPlanetId, galaxy, system, position });
  return c.json(Object.values(OFFICER_DEFINITIONS));
    if (!OFFICER_TYPES.includes(officerType as OfficerType)) {
        { error: `Invalid officerType. Valid: ${OFFICER_TYPES.join(', ')}` },
    const officer = await activateOfficer(playerId, officerType as OfficerType, DB);
    const officers = await getActiveOfficers(playerId, DB);
    if (!OFFICER_TYPES.includes(officerType as OfficerType)) {
        { error: `Invalid officerType. Valid: ${OFFICER_TYPES.join(', ')}` },
    const deactivated = await deactivateOfficer(playerId, officerType as OfficerType, DB);
    const bonuses = await getOfficerBonuses(playerId, DB);
  getTutorialProgress,
  completeTutorialStep,
  claimReward as claimTutorialReward,
  skipTutorial,
  getNextStep,
  TUTORIAL_STEPS,
} from './game/services/tutorialService';

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
  R2: R2Bucket;
  AI: any; // Cloudflare Workers AI
  // Solana devnet configuration
  SOLANA_RPC_URL: string;
  SOLANA_NETWORK: string;
  MINT_AUTHORITY_KEY: string;
  MERKLE_TREE_ADDRESS: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// ============================================================================
// CORS MIDDLEWARE
// ============================================================================

app.use('*', async (c, next) => {
  c.header('Access-Control-Allow-Origin', '*');
  c.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Content-Type');
  if (c.req.method === 'OPTIONS') return c.text('', 204 as any);
  await next();
});

// ============================================================================
// HELPER: get Durable Object stub from planet ID
// ============================================================================

function getPlanetStub(PLANET_DO: DurableObjectNamespace, planetId: string) {
  const id = PLANET_DO.idFromName(planetId);
  return PLANET_DO.get(id);
}

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

app.get('/health', (c) => {
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
    const stub = getPlanetStub(PLANET_DO, planetId);
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
    const stub = getPlanetStub(PLANET_DO, planetId);
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
    const stub = getPlanetStub(PLANET_DO, planetId);
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
    const stub = getPlanetStub(PLANET_DO, planetId);
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
    const stub = getPlanetStub(PLANET_DO, planetId);
    const response = await stub.fetch(new Request('https://planet/queue/add', { method: 'POST', body: JSON.stringify(body) }));

    if (!response.ok) {
      return c.json({ error: await response.text() }, response.status as any);
    }

    const result = await response.json() as any;

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
    const stub = getPlanetStub(PLANET_DO, planetId);
    const response = await stub.fetch(new Request('https://planet/initialize', { method: 'POST', body: JSON.stringify(body) }));

    if (!response.ok) {
      return c.json({ error: await response.text() }, response.status as any);
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
    const planetStub = getPlanetStub(PLANET_DO, planetId);
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
 * POST /api/fleet/dispatch
 * Dispatch a fleet mission using the FleetService.
 * Body: { fromPlanetId, toCoord: {galaxy,system,position}, ships, missionType,
 *         resources?, speedPercent?, playerId? }
 */
app.post('/api/fleet/dispatch', async (c) => {
  const DB = c.env.DB;
  const PLANET_DO = c.env.PLANET_DO;

  try {
    const body = await c.req.json<{
      fromPlanetId: string;
      toCoord: Coordinate;
      ships: Record<string, number>;
      missionType: string;
      resources?: { metal: number; crystal: number; deuterium: number };
      speedPercent?: number;
      playerId?: string;
    }>();

    const { fromPlanetId, toCoord, ships, missionType, resources, speedPercent } = body;

    if (!fromPlanetId || !toCoord || !ships || !missionType) {
      return c.json({ error: 'fromPlanetId, toCoord, ships, and missionType are required' }, 400);
    }

    // Get the source planet state from the DO
    const planetStub = getPlanetStub(PLANET_DO, fromPlanetId);
    const stateRes = await planetStub.fetch(new Request('https://planet/state'));
    if (!stateRes.ok) {
      return c.json({ error: 'Could not retrieve source planet state' }, 404);
    }
    const planetState = (await stateRes.json()) as PlanetState;

    // Use the fleet service to dispatch
    const result = fleetService.dispatchFleet(
      {
        missionId: `fleet-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        playerId: body.playerId ?? planetState.playerId,
        fromPlanetId,
        toPlanetId: null,
        from: planetState.coordinate,
        to: toCoord,
        ships: ships as any,
        resources: resources ?? { metal: 0, crystal: 0, deuterium: 0 },
        missionType: missionType as any,
        speedPercent: speedPercent ?? 100,
      },
      planetState,
    );

    if (!result.mission) {
      return c.json({ error: result.reason ?? 'Fleet dispatch failed' }, 400);
    }

    // Persist updated planet state back to DO
    await planetStub.fetch(
      new Request('https://planet/setState', {
        method: 'POST',
        body: JSON.stringify(planetState),
      })
    );

    // Persist fleet mission to D1
    const m = result.mission;
    await DB.prepare(
      `INSERT INTO fleet_missions
         (id, player_id, mission_type, mission_status, time_departure, time_arrival,
          planet_id_from, galaxy_to, system_to, position_to, ships_json, resources_json, fuel_consumed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        m.id,
        m.playerId,
        m.missionType,
        m.missionStatus,
        m.timeDeparture,
        m.timeArrival,
        m.planetIdFrom,
        m.targetCoordinate.galaxy,
        m.targetCoordinate.system,
        m.targetCoordinate.position,
        JSON.stringify(m.ships),
        JSON.stringify(m.resources),
        m.fuelConsumed,
      )
      .run();

    return c.json({ mission: m }, 201);
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

/**
 * POST /api/fleet/send
 * Launch a fleet mission (legacy endpoint, delegates to /api/fleet/dispatch)
 * Body: { fromPlanetId, toCoord, ships, missionType, resources?, holdTime? }
 */
app.post('/api/fleet/send', async (c) => {
  const DB = c.env.DB;
  const PLANET_DO = c.env.PLANET_DO;

  try {
    const body = await c.req.json();
    const { fromPlanetId, toCoord, ships, missionType, resources, holdTime } = body;

    // TODO: Implement fleet launch logic
    // 1. Validate source planet exists and belongs to player
    // 2. Validate fleet exists at source
    // 3. Deduct ships from source planet
    // 4. Create fleet mission in DB
    // 5. Return mission details

    return c.json(
      {
        error: 'Fleet send not yet implemented — use POST /api/fleet/dispatch instead',
      },
      501
    );
  } catch (error) {
    return c.json({ error: String(error) }, 500);
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
// SHIPYARD ENDPOINTS
// ============================================================================

/**
 * POST /api/planet/:id/ships/build
 * Build ships at a planet's shipyard.
 * Body: { shipType: string, count: number }
 */
app.post('/api/planet/:id/ships/build', async (c) => {
  const planetId = c.req.param('id');
  const PLANET_DO = c.env.PLANET_DO;

  try {
    const body = await c.req.json();
    const stub = getPlanetStub(PLANET_DO, planetId);
    const response = await stub.fetch(
      new Request('https://planet/ships/build', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    );

    if (!response.ok) {
      return new Response(response.body, { status: response.status, headers: { 'Content-Type': 'application/json' } });
    }

    return c.json(await response.json());
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

/**
 * GET /api/planet/:id/ships/queue
 * Get current shipyard build queue for a planet.
 */
app.get('/api/planet/:id/ships/queue', async (c) => {
  const planetId = c.req.param('id');
  const PLANET_DO = c.env.PLANET_DO;

  try {
    const stub = getPlanetStub(PLANET_DO, planetId);
    const response = await stub.fetch(new Request('https://planet/ships/queue'));
    return c.json(await response.json());
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

/**
 * POST /api/planet/:id/ships/cancel
 * Cancel a queued ship build order.
 * Body: { orderIndex: number }
 */
app.post('/api/planet/:id/ships/cancel', async (c) => {
  const planetId = c.req.param('id');
  const PLANET_DO = c.env.PLANET_DO;

  try {
    const body = await c.req.json();
    const stub = getPlanetStub(PLANET_DO, planetId);
    const response = await stub.fetch(
      new Request('https://planet/ships/cancel', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    );

    if (!response.ok) {
      return new Response(response.body, { status: response.status, headers: { 'Content-Type': 'application/json' } });
    }

    return c.json(await response.json());
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

/**
 * GET /api/planet/:id/ships/available
 * List all ship types with costs, requirements, and whether they can be built.
 */
app.get('/api/planet/:id/ships/available', async (c) => {
  const planetId = c.req.param('id');
  const PLANET_DO = c.env.PLANET_DO;

  try {
    const stub = getPlanetStub(PLANET_DO, planetId);
    const response = await stub.fetch(new Request('https://planet/ships/available'));
    return c.json(await response.json());
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
// NFT ENDPOINTS (Solana devnet cNFTs)
// ============================================================================

/** Valid asset types for request validation */
const VALID_NFT_ASSET_TYPES: AssetType[] = [
  'ship_skin',
  'planet_theme',
  'booster',
  'rare_ship',
];

/**
 * POST /api/nft/mint
 * Mint a compressed NFT on Solana devnet.
 * Body: { playerId, assetType, name, imageUrl?, ownerPublicKey }
 */
app.post('/api/nft/mint', async (c) => {
  const DB = c.env.DB;

  try {
    const body = await c.req.json<MintRequest>();
    const { playerId, assetType, name, ownerPublicKey, imageUrl } = body;

    // Validate required fields
    if (!playerId || !assetType || !name || !ownerPublicKey) {
      return c.json(
        { error: 'playerId, assetType, name, and ownerPublicKey are required' },
        400 as any,
      );
    }

    // Validate asset type
    if (!VALID_NFT_ASSET_TYPES.includes(assetType)) {
      return c.json(
        { error: `Invalid assetType. Must be one of: ${VALID_NFT_ASSET_TYPES.join(', ')}` },
        400 as any,
      );
    }

    // Validate ownerPublicKey is a plausible base58 Solana address (32-44 chars)
    if (ownerPublicKey.length < 32 || ownerPublicKey.length > 44) {
      return c.json(
        { error: 'ownerPublicKey must be a valid Solana base58 address' },
        400 as any,
      );
    }

    // Build metadata
    const nftImageUrl = imageUrl || `https://r2.cosmic-protocol.dev/default/${assetType}.png`;
    const metadata = buildMetadata(name, assetType, nftImageUrl);

    // Mint the cNFT on Solana devnet
    const mintResult = await mintCompressedNFT(metadata, ownerPublicKey, {
      R2: c.env.R2,
      SOLANA_RPC_URL: c.env.SOLANA_RPC_URL,
      SOLANA_NETWORK: c.env.SOLANA_NETWORK,
      MINT_AUTHORITY_KEY: c.env.MINT_AUTHORITY_KEY,
      MERKLE_TREE_ADDRESS: c.env.MERKLE_TREE_ADDRESS,
    });

    // Generate unique asset ID
    const assetId = `nft-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    // Store in D1
    await DB.prepare(
      `INSERT INTO nft_assets (id, player_id, mint_address, asset_type, name, image_url, metadata_uri, solana_tx, network, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        assetId,
        playerId,
        mintResult.assetId,
        assetType,
        name,
        nftImageUrl,
        `https://r2.cosmic-protocol.dev/nft-metadata/${assetId}.json`,
        mintResult.signature,
        'devnet',
        Math.floor(Date.now() / 1000),
      )
      .run();

    const asset: NFTAsset = {
      id: assetId,
      playerId,
      mintAddress: mintResult.assetId,
      assetType,
      name,
      imageUrl: nftImageUrl,
      metadataUri: `https://r2.cosmic-protocol.dev/nft-metadata/${assetId}.json`,
      solanaTx: mintResult.signature,
      network: 'devnet',
      createdAt: Math.floor(Date.now() / 1000),
    };

    return c.json({ asset, signature: mintResult.signature, assetId: mintResult.assetId }, 201 as any);
  } catch (error) {
    console.error('NFT mint error:', error);
    return c.json({ error: String(error) }, 500 as any);
  }
});

/**
 * GET /api/nft/list
 * List NFT assets for a player.
 * Query: ?player_id=xxx
 */
app.get('/api/nft/list', async (c) => {
  const playerId = c.req.query('player_id');
  const DB = c.env.DB;

  if (!playerId) {
    return c.json({ error: 'player_id query param required' }, 400 as any);
  }

  try {
    const result = await DB.prepare(
      `SELECT id, player_id, mint_address, asset_type, name, image_url,
              metadata_uri, solana_tx, network, created_at
       FROM nft_assets
       WHERE player_id = ?
       ORDER BY created_at DESC
       LIMIT 100`,
    )
      .bind(playerId)
      .all();

    return c.json(result.results || []);
  } catch (error) {
    return c.json({ error: String(error) }, 500 as any);
  }
});

/**
 * GET /api/nft/:id
 * Get a single NFT asset by ID.
 */
app.get('/api/nft/:id', async (c) => {
  const nftId = c.req.param('id');
  const DB = c.env.DB;

  try {
    const asset = await DB.prepare(
      `SELECT id, player_id, mint_address, asset_type, name, image_url,
              metadata_uri, solana_tx, network, created_at
       FROM nft_assets
       WHERE id = ?`,
    )
      .bind(nftId)
      .first();

    if (!asset) {
      return c.json({ error: 'NFT asset not found' }, 404 as any);
    }

    return c.json(asset);
  } catch (error) {
    return c.json({ error: String(error) }, 500 as any);
  }
});

// ============================================================================
// ASSET GENERATION ENDPOINTS
// ============================================================================

/**
 * POST /api/assets/generate
 * Generate an AI-powered game asset image and metadata.
 * Body: { assetType, style?, rarity? }
 * Returns: { imageUrl, imageBase64, name, description, attributes }
 */
app.post('/api/assets/generate', async (c) => {
  const AI = c.env.AI;
  const R2 = c.env.R2;

  if (!R2) {
    return c.json({ error: 'R2 bucket not configured' }, 503);
  }

  try {
    const body = await c.req.json<GenerateAssetRequest>();

    const validAssetTypes = ['ship_skin', 'planet_theme', 'booster', 'rare_ship'];
    if (!body.assetType || !validAssetTypes.includes(body.assetType)) {
      return c.json(
        { error: `assetType must be one of: ${validAssetTypes.join(', ')}` },
        400
      );
    }

    const validStyles = ['cyberpunk', 'steampunk', 'alien', 'organic', 'crystal', 'futuristic'];
    if (body.style && !validStyles.includes(body.style)) {
      return c.json(
        { error: `style must be one of: ${validStyles.join(', ')}` },
        400
      );
    }

    const validRarities = ['common', 'uncommon', 'rare', 'legendary'];
    if (body.rarity && !validRarities.includes(body.rarity)) {
      return c.json(
        { error: `rarity must be one of: ${validRarities.join(', ')}` },
        400
      );
    }

    const asset = await generateAsset(
      {
        assetType: body.assetType,
        style: body.style,
        rarity: body.rarity,
      },
      { AI, R2 }
    );

    return c.json(asset, 201);
  } catch (error) {
    console.error('[/api/assets/generate] Error:', error);
    return c.json({ error: String(error) }, 500);
  }
});

/**
 * POST /api/nft/mint
 * Stub endpoint for NFT minting — actual minting happens client-side via Solana.
 * This records the minting intent and returns metadata for the Metaplex transaction.
 * Body: { walletAddress, assetImageUrl, assetName, assetDescription, attributes }
 */
app.post('/api/nft/mint', async (c) => {
  try {
    const body = await c.req.json<{
      walletAddress: string;
      assetImageUrl: string;
      assetName: string;
      assetDescription: string;
      attributes: Array<{ trait_type: string; value: string | number }>;
    }>();

    if (!body.walletAddress || !body.assetImageUrl || !body.assetName) {
      return c.json(
        { error: 'walletAddress, assetImageUrl, and assetName are required' },
        400
      );
    }

    // Build NFT metadata following Metaplex standard
    const mintId = `nft-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const metadata = {
      mintId,
      name: body.assetName,
      description: body.assetDescription,
      image: body.assetImageUrl,
      attributes: body.attributes,
      properties: {
        files: [{ uri: body.assetImageUrl, type: 'image/png' }],
        category: 'image',
        creators: [
          {
            address: body.walletAddress,
            share: 100,
          },
        ],
      },
      collection: {
        name: 'Cosmic Protocol',
        family: 'CosmicProtocol',
      },
    };

    return c.json({ mintId, metadata }, 201);
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

// ============================================================================
// ACHIEVEMENT ENDPOINTS
// ============================================================================

/**
 * GET /api/achievements
 * List all available achievements (static, no auth required).
 */
app.get('/api/achievements', (c) => {
  return c.json(ACHIEVEMENTS);
});

/**
 * GET /api/player/:id/achievements
 * List achievements unlocked by the player.
 */
app.get('/api/player/:id/achievements', async (c) => {
  const playerId = c.req.param('id');
  const DB = c.env.DB;

  try {
    const achievements = await getPlayerAchievements(playerId, DB);
    return c.json(achievements);
  } catch (error) {
    return c.json({ error: String(error) }, 500 as any);
  }
});

/**
 * POST /api/player/:id/check-achievements
 * Trigger achievement evaluation for a player.
 * Loads current stats, evaluates all achievements, unlocks newly earned ones.
 * Returns list of newly unlocked achievement IDs.
 */
app.post('/api/player/:id/check-achievements', async (c) => {
  const playerId = c.req.param('id');
  const DB = c.env.DB;

  try {
    const stats = await getAchievementPlayerStats(playerId, DB);
    const newlyUnlocked = await checkAchievements(playerId, stats, DB);
    return c.json({ newlyUnlocked, checkedAt: Math.floor(Date.now() / 1000) });
  } catch (error) {
    return c.json({ error: String(error) }, 500 as any);
  }
});

// ============================================================================
// STATS ENDPOINTS
// ============================================================================

/**
 * GET /api/player/:id/stats
 * Get full e-sport statistics for a player.
 */
app.get('/api/player/:id/stats', async (c) => {
  const playerId = c.req.param('id');
  const DB = c.env.DB;

  try {
    const stats = await getPlayerStats(playerId, DB);
    return c.json(stats);
  } catch (error) {
    return c.json({ error: String(error) }, 500 as any);
  }
});

/**
 * GET /api/stats/top
 * Leaderboard query.
 * Query params:
 *  - stat  : battles_won | ships_destroyed | resources_raided_metal | ...
 *  - limit : max rows (default 10, max 100)
 *
 * Example: GET /api/stats/top?stat=battles_won&limit=10
 */
app.get('/api/stats/top', async (c) => {
  const DB = c.env.DB;
  const stat = c.req.query('stat') as LeaderboardStat | undefined;
  const limitParam = c.req.query('limit');
  const limit = limitParam ? parseInt(limitParam, 10) : 10;

  const VALID_STATS: LeaderboardStat[] = [
    'battles_won',
    'ships_destroyed',
    'resources_raided_metal',
    'fleets_dispatched',
    'planets_colonized',
    'research_completed',
    'buildings_built',
    'trades_completed',
    'agent_decisions',
  ];

  if (!stat || !VALID_STATS.includes(stat)) {
    return c.json(
      { error: `stat query param required. Valid values: ${VALID_STATS.join(', ')}` },
      400 as any
    );
  }

  if (isNaN(limit) || limit < 1) {
    return c.json({ error: 'limit must be a positive integer' }, 400 as any);
  }

  try {
    const leaderboard = await getTopPlayers(stat, limit, DB);
    return c.json({ stat, leaderboard });
  } catch (error) {
    return c.json({ error: String(error) }, 500 as any);
  }
});

// ============================================================================
// ESPIONAGE ENDPOINTS
// ============================================================================


/**
 * POST /api/espionage/send
 * Send espionage probes to a target planet.
 * Body: { fromPlanetId, targetGalaxy, targetSystem, targetPosition, probeCount, playerId? }
 *
 * Process:
 * 1. Validate probe availability on source planet
 * 2. Locate target planet and gather defender info
 * 3. Generate espionage report with info tiers based on tech difference
 * 4. Process counter-espionage (probe destruction chance)
 * 5. Persist report to D1, update planet state
 */
app.post('/api/espionage/send', async (c) => {
  const DB = c.env.DB;
  const PLANET_DO = c.env.PLANET_DO;

  try {
    const body = await c.req.json<{
      fromPlanetId: string;
      targetGalaxy: number;
      targetSystem: number;
      targetPosition: number;
      probeCount: number;
      playerId?: string;
    }>();

    const { fromPlanetId, targetGalaxy, targetSystem, targetPosition, probeCount } = body;

    // Validate required fields
    if (!fromPlanetId || !targetGalaxy || !targetSystem || !targetPosition || !probeCount) {
      return c.json(
        { error: 'fromPlanetId, targetGalaxy, targetSystem, targetPosition, and probeCount are required' },
        400,
      );
    }

    // 1. Get attacker planet state
    const attackerStub = getPlanetStub(PLANET_DO, fromPlanetId);
    const attackerStateRes = await attackerStub.fetch(new Request('https://planet/state'));
    if (!attackerStateRes.ok) {
      return c.json({ error: 'Could not retrieve source planet state' }, 404);
    }
    const attackerPlanet = (await attackerStateRes.json()) as PlanetState;
    const attackerPlayerId = body.playerId ?? attackerPlanet.playerId;

    // 2. Validate mission
    const validationError = espionageService.validateMission(probeCount, attackerPlanet.ships);
    if (validationError) {
      return c.json({ error: validationError }, 400);
    }

    // 3. Locate target planet
    const targetPlanetRow = await DB.prepare(
      'SELECT id, player_id, name FROM planets WHERE galaxy = ? AND system = ? AND position = ?',
    )
      .bind(targetGalaxy, targetSystem, targetPosition)
      .first();

    if (!targetPlanetRow) {
      return c.json({ error: 'No planet found at target coordinates' }, 404);
    }

    const targetPlanetId = targetPlanetRow.id as string;
    const defenderPlayerId = targetPlanetRow.player_id as string;
    const defenderName = targetPlanetRow.name as string;

    // Cannot spy on yourself
    if (defenderPlayerId === attackerPlayerId) {
      return c.json({ error: 'Cannot spy on your own planet' }, 400);
    }

    // 4. Get target planet state
    const defenderStub = getPlanetStub(PLANET_DO, targetPlanetId);
    const defenderStateRes = await defenderStub.fetch(new Request('https://planet/state'));
    if (!defenderStateRes.ok) {
      return c.json({ error: 'Could not retrieve target planet state' }, 500);
    }
    const targetPlanet = (await defenderStateRes.json()) as PlanetState;

    // 5. Get attacker and defender tech levels (espionageTech)
    // For now, use default tech levels — in production these would come from player state
    const attackerTech = getEmptyTechLevels();
    const defenderTech = getEmptyTechLevels();

    // Try to load tech from D1 if available
    // (Uses a best-effort approach; missing data defaults to 0)
    const attackerTechRow = await DB.prepare(
      'SELECT espionage_tech FROM players WHERE id = ?',
    ).bind(attackerPlayerId).first();
    if (attackerTechRow && typeof attackerTechRow.espionage_tech === 'number') {
      attackerTech.espionageTech = attackerTechRow.espionage_tech;
    }
    const defenderTechRow = await DB.prepare(
      'SELECT espionage_tech FROM players WHERE id = ?',
    ).bind(defenderPlayerId).first();
    if (defenderTechRow && typeof defenderTechRow.espionage_tech === 'number') {
      defenderTech.espionageTech = defenderTechRow.espionage_tech;
    }

    // 6. Get target defenses (default to empty if not available)
    const targetDefenses = getEmptyDefenses();

    // 7. Generate espionage report
    const report = espionageService.generateReport({
      attackerId: attackerPlayerId,
      attackerName: attackerPlayerId,
      attackerSpyTech: attackerTech.espionageTech,
      attackerCoordinate: attackerPlanet.coordinate,
      probeCount,
      defenderId: defenderPlayerId,
      defenderName,
      defenderSpyTech: defenderTech.espionageTech,
      targetPlanet,
      targetDefenses,
      defenderTech,
    });

    // 8. Apply probe losses to attacker planet
    if (report.probesLost > 0) {
      attackerPlanet.ships = espionageService.applyProbeLoss(
        attackerPlanet.ships,
        report.probesLost,
      );

      // Persist updated ships back to DO
      await attackerStub.fetch(
        new Request('https://planet/setState', {
          method: 'POST',
          body: JSON.stringify(attackerPlanet),
        }),
      );
    }

    // 9. Persist report to D1
    const dbRow = espionageService.serializeForDb(report);
    await DB.prepare(
      `INSERT INTO espionage_reports
         (id, attacker_id, defender_id, target_galaxy, target_system, target_position,
          target_player_name, resources_json, fleet_json, defenses_json, buildings_json,
          research_json, counter_chance, probes_lost, probes_sent, info_level, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        dbRow.id,
        dbRow.attacker_id,
        dbRow.defender_id,
        dbRow.target_galaxy,
        dbRow.target_system,
        dbRow.target_position,
        dbRow.target_player_name,
        dbRow.resources_json,
        dbRow.fleet_json,
        dbRow.defenses_json,
        dbRow.buildings_json,
        dbRow.research_json,
        dbRow.counter_chance,
        dbRow.probes_lost,
        dbRow.probes_sent,
        dbRow.info_level,
        dbRow.created_at,
      )
      .run();

    return c.json({ report }, 201);
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

/**
 * GET /api/espionage/reports
 * List espionage reports for a player.
 * Query: ?player_id=xxx&limit=50
 */
app.get('/api/espionage/reports', async (c) => {
  const playerId = c.req.query('player_id');
  const DB = c.env.DB;

  if (!playerId) {
    return c.json({ error: 'player_id query param required' }, 400);
  }

  const limit = Math.min(parseInt(c.req.query('limit') ?? '50', 10) || 50, 100);

  try {
    const reports = await DB.prepare(
      `SELECT id, attacker_id, defender_id, target_galaxy, target_system, target_position,
              target_player_name, resources_json, fleet_json, defenses_json, buildings_json,
              research_json, counter_chance, probes_lost, probes_sent, info_level, created_at
       FROM espionage_reports
       WHERE attacker_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
    )
      .bind(playerId, limit)
      .all();

    const results = (reports.results || []).map((row: Record<string, unknown>) =>
      espionageService.deserializeFromDb(row),
    );

    return c.json(results);
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

/**
 * GET /api/espionage/reports/:id
 * Get a single espionage report by ID.
 */
app.get('/api/espionage/reports/:id', async (c) => {
  const reportId = c.req.param('id');
  const DB = c.env.DB;

  try {
    const row = await DB.prepare(
      `SELECT id, attacker_id, defender_id, target_galaxy, target_system, target_position,
              target_player_name, resources_json, fleet_json, defenses_json, buildings_json,
              research_json, counter_chance, probes_lost, probes_sent, info_level, created_at
       FROM espionage_reports
       WHERE id = ?`,
    )
      .bind(reportId)
      .first();

    if (!row) {
      return c.json({ error: 'Espionage report not found' }, 404);
    }

    const report = espionageService.deserializeFromDb(row as Record<string, unknown>);
    return c.json(report);
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

// ============================================================================

/**
 * POST /api/messages/send
 * Send a message to another player.
 * Body: { fromPlayerId, toPlayerId, subject, body }
 */
app.post('/api/messages/send', async (c) => {
  const DB = c.env.DB;

  try {
    const body = await c.req.json<{
      fromPlayerId: string;
      toPlayerId: string;
      subject: string;
      body: string;
    }>();

    if (!body.fromPlayerId || !body.toPlayerId || !body.subject || !body.body) {
      return c.json({ error: 'fromPlayerId, toPlayerId, subject, and body are required' }, 400);
    }

    const message = await sendMessage(
      body.fromPlayerId,
      body.toPlayerId,
      body.subject,
      body.body,
      'player',
      DB,
    );

    return c.json(message, 201);
  } catch (error) {
    const msg = String(error);
    // Return 400 for validation errors, 500 for unexpected errors
    if (msg.includes('not found') || msg.includes('Cannot send') || msg.includes('empty') || msg.includes('exceeds')) {
      return c.json({ error: msg }, 400);
    }
    return c.json({ error: msg }, 500);
  }
});

/**
 * GET /api/messages/inbox
 * Get paginated inbox for a player.
 * Query: ?player_id=xxx&page=1&limit=20
 */
app.get('/api/messages/inbox', async (c) => {
  const DB = c.env.DB;
  const playerId = c.req.query('player_id');

  if (!playerId) {
    return c.json({ error: 'player_id query param required' }, 400);
  }

  try {
    const page = parseInt(c.req.query('page') ?? '1', 10);
    const limit = parseInt(c.req.query('limit') ?? '20', 10);

    const result = await getInbox(playerId, page, limit, DB);
    return c.json(result);
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

/**
 * GET /api/messages/outbox
 * Get paginated sent messages for a player.
 * Query: ?player_id=xxx&page=1&limit=20
 */
app.get('/api/messages/outbox', async (c) => {
  const DB = c.env.DB;
  const playerId = c.req.query('player_id');

  if (!playerId) {
    return c.json({ error: 'player_id query param required' }, 400);
  }

  try {
    const page = parseInt(c.req.query('page') ?? '1', 10);
    const limit = parseInt(c.req.query('limit') ?? '20', 10);

    const result = await getOutbox(playerId, page, limit, DB);
    return c.json(result);
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

/**
 * GET /api/messages/unread-count
 * Get unread message count for a player.
 * Query: ?player_id=xxx
 */
app.get('/api/messages/unread-count', async (c) => {
  const DB = c.env.DB;
  const playerId = c.req.query('player_id');

  if (!playerId) {
    return c.json({ error: 'player_id query param required' }, 400);
  }

  try {
    const count = await getUnreadCount(playerId, DB);
    return c.json({ unreadCount: count });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

/**
 * POST /api/messages/mark-all-read
 * Mark all messages in a player's inbox as read.
 * Query: ?player_id=xxx
 */
app.post('/api/messages/mark-all-read', async (c) => {
  const DB = c.env.DB;
  const playerId = c.req.query('player_id');

  if (!playerId) {
    return c.json({ error: 'player_id query param required' }, 400);
  }

  try {
    const updated = await markAllRead(playerId, DB);
    return c.json({ updated });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

/**
 * GET /api/messages/:id
 * Get a single message and mark it as read (if recipient).
 * Query: ?player_id=xxx
 */
app.get('/api/messages/:id', async (c) => {
  const DB = c.env.DB;
  const messageId = c.req.param('id');
  const playerId = c.req.query('player_id');

  if (!playerId) {
    return c.json({ error: 'player_id query param required' }, 400);
  }

  try {
    const message = await getMessage(messageId, playerId, DB);

    if (!message) {
      return c.json({ error: 'Message not found' }, 404);
    }

    return c.json(message);
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

/**
 * DELETE /api/messages/:id
 * Soft-delete a message for the requesting player.
 * Query: ?player_id=xxx
 */
app.delete('/api/messages/:id', async (c) => {
  const DB = c.env.DB;
  const messageId = c.req.param('id');
  const playerId = c.req.query('player_id');

  if (!playerId) {
    return c.json({ error: 'player_id query param required' }, 400);
  }

  try {
    const deleted = await deleteMessage(messageId, playerId, DB);

    if (!deleted) {
      return c.json({ error: 'Message not found' }, 404);
    }

    return c.json({ deleted: true });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});


// ============================================================================
// EXPEDITION ENDPOINTS
// ============================================================================

/**
 * POST /api/fleet/expedition
 * Send a fleet on an expedition to position 16.
 *
 * Expeditions go to position 16 of the target system (special slot).
 * The fleet resolves a random event on arrival:
 *   - find_resources, find_ships, find_dark_matter
 *   - alien_contact, pirates (combat)
 *   - nothing, delayed, black_hole
 *
 * Body: { fromPlanetId, galaxy, system, ships, speedPercent?, playerId? }
 */
app.post('/api/fleet/expedition', async (c) => {
  const DB = c.env.DB;
  const PLANET_DO = c.env.PLANET_DO;

  try {
    const body = await c.req.json<{
      fromPlanetId: string;
      galaxy: number;
      system: number;
      ships: Record<string, number>;
      speedPercent?: number;
      playerId?: string;
    }>();

    const { fromPlanetId, galaxy, system, ships, speedPercent } = body;

    if (!fromPlanetId || !galaxy || !system || !ships) {
      return c.json(
        { error: 'fromPlanetId, galaxy, system, and ships are required' },
        400
      );
    }

    // Expedition always targets position 16
    const toCoord: Coordinate = { galaxy, system, position: 16 };

    // Get source planet state from Durable Object
    const planetStub = getPlanetStub(PLANET_DO, fromPlanetId);
    const stateRes = await planetStub.fetch(new Request('https://planet/state'));
    if (!stateRes.ok) {
      return c.json({ error: 'Source planet not found' }, 404);
    }
    const planetState = (await stateRes.json()) as PlanetState;

    // Preview fleet value before dispatch
    const fleetValuePreview = calculateFleetValue(ships as any);

    // Dispatch fleet as expedition mission
    const result = fleetService.dispatchFleet(
      {
        missionId: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        playerId: body.playerId ?? planetState.playerId,
        fromPlanetId,
        toPlanetId: null,
        from: planetState.coordinate,
        to: toCoord,
        ships: ships as any,
        resources: { metal: 0, crystal: 0, deuterium: 0 },
        missionType: 'expedition',
        speedPercent: speedPercent ?? 100,
      },
      planetState,
    );

    if (!result.mission) {
      return c.json({ error: result.reason ?? 'Expedition dispatch failed' }, 400);
    }

    // Persist updated planet state (ships deducted, fuel consumed)
    await planetStub.fetch(
      new Request('https://planet/setState', {
        method: 'POST',
        body: JSON.stringify(planetState),
      })
    );

    // Persist expedition mission to D1
    const m = result.mission;
    await DB.prepare(
      `INSERT INTO fleet_missions
         (id, player_id, mission_type, mission_status, time_departure, time_arrival,
          planet_id_from, galaxy_to, system_to, position_to, ships_json, resources_json, fuel_consumed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        m.id,
        m.playerId,
        m.missionType,
        m.missionStatus,
        m.timeDeparture,
        m.timeArrival,
        m.planetIdFrom,
        m.targetCoordinate.galaxy,
        m.targetCoordinate.system,
        m.targetCoordinate.position,
        JSON.stringify(m.ships),
        JSON.stringify(m.resources),
        m.fuelConsumed,
      )
      .run();

    return c.json({
      mission: m,
      expeditionTarget: toCoord,
      fleetValue: fleetValuePreview,
    }, 201);
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

/**
 * GET /api/expedition/result/:missionId
 * Get the result of a completed expedition mission.
 *
 * Returns mission details including loot, event type (stored in ships_json meta),
 * and mission status. The expedition event is resolved server-side on arrival.
 */
app.get('/api/expedition/result/:missionId', async (c) => {
  const missionId = c.req.param('missionId');
  const DB = c.env.DB;

  try {
    const mission = await DB.prepare(
      `SELECT id, player_id, mission_type, mission_status,
              time_departure, time_arrival,
              planet_id_from, galaxy_to, system_to, position_to,
              ships_json, resources_json, fuel_consumed
       FROM fleet_missions
       WHERE id = ? AND mission_type = 'expedition'`
    )
      .bind(missionId)
      .first();

    if (!mission) {
      return c.json({ error: 'Expedition mission not found' }, 404);
    }

    // Parse JSON fields
    const ships = mission.ships_json ? JSON.parse(mission.ships_json as string) : {};
    const resources = mission.resources_json ? JSON.parse(mission.resources_json as string) : {};

    // Compute fleet value for client display
    const fleetValue = calculateFleetValue(ships);

    return c.json({
      missionId: mission.id,
      playerId: mission.player_id,
      missionType: mission.mission_type,
      missionStatus: mission.mission_status,
      timeDeparture: mission.time_departure,
      timeArrival: mission.time_arrival,
      planetIdFrom: mission.planet_id_from,
      targetCoordinate: {
        galaxy: mission.galaxy_to,
        system: mission.system_to,
        position: mission.position_to,
      },
      ships,
      resources,
      fleetValue,
      fuelConsumed: mission.fuel_consumed,
    });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

/**
 * GET /api/expedition/history/:playerId
 * Get a player's expedition history (past and active).
 *
 * Query params:
 *   - limit (default 20, max 50)
 *   - status: filter by mission_status (dispatched|returning|completed)
 */
app.get('/api/expedition/history/:playerId', async (c) => {
  const playerId = c.req.param('playerId');
  const DB = c.env.DB;

  const limitParam = parseInt(c.req.query('limit') ?? '20', 10);
  const limit = Math.min(Math.max(1, limitParam), 50);
  const statusFilter = c.req.query('status');

  try {
    let query: string;
    let bindings: (string | number)[];

    if (statusFilter) {
      query = `SELECT id, mission_type, mission_status,
                      time_departure, time_arrival,
                      galaxy_to, system_to, position_to,
                      ships_json, resources_json, fuel_consumed
               FROM fleet_missions
               WHERE player_id = ? AND mission_type = 'expedition' AND mission_status = ?
               ORDER BY time_departure DESC
               LIMIT ?`;
      bindings = [playerId, statusFilter, limit];
    } else {
      query = `SELECT id, mission_type, mission_status,
                      time_departure, time_arrival,
                      galaxy_to, system_to, position_to,
                      ships_json, resources_json, fuel_consumed
               FROM fleet_missions
               WHERE player_id = ? AND mission_type = 'expedition'
               ORDER BY time_departure DESC
               LIMIT ?`;
      bindings = [playerId, limit];
    }

    const stmt = DB.prepare(query).bind(...bindings);
    const result = await stmt.all();

    const missions = (result.results || []).map((row: any) => ({
      missionId: row.id,
      missionStatus: row.mission_status,
      timeDeparture: row.time_departure,
      timeArrival: row.time_arrival,
      targetCoordinate: {
        galaxy: row.galaxy_to,
        system: row.system_to,
        position: row.position_to,
      },
      fleetValue: calculateFleetValue(
        row.ships_json ? JSON.parse(row.ships_json) : {}
      ),
      fuelConsumed: row.fuel_consumed,
    }));

    return c.json({
      playerId,
      total: missions.length,
      missions,
    });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

// ============================================================================
// TUTORIAL ENDPOINTS
// ============================================================================

/**
 * GET /api/tutorial/:playerId
 * Returns the full tutorial progress for a player, including all step definitions.
 */
app.get('/api/tutorial/:playerId', async (c) => {
  const playerId = c.req.param('playerId');
  const DB = c.env.DB;

  try {
    const progress = await getTutorialProgress(playerId, DB);
    const nextStep = progress.skipped || !progress.currentStepId
      ? null
      : TUTORIAL_STEPS.find((s) => s.id === progress.currentStepId) ?? null;

    return c.json({
      progress,
      allSteps: TUTORIAL_STEPS,
      nextStep,
      completionPercent: Math.round(
        (progress.completedSteps.length / TUTORIAL_STEPS.length) * 100
      ),
    });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

/**
 * POST /api/tutorial/:playerId/complete-step
 * Mark a tutorial step as completed.
 * Body: { stepId: string }
 */
app.post('/api/tutorial/:playerId/complete-step', async (c) => {
  const playerId = c.req.param('playerId');
  const DB = c.env.DB;

  try {
    const body = await c.req.json() as { stepId?: string };
    const stepId = body.stepId;

    if (!stepId) {
      return c.json({ error: 'stepId is required' }, 400);
    }

    const result = await completeTutorialStep(playerId, stepId, DB);

    if (!result.completed && result.error) {
      return c.json({ error: result.error }, 400);
    }

    return c.json(result);
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

/**
 * POST /api/tutorial/:playerId/skip
 * Skip the tutorial entirely. Experienced players can opt out.
 */
app.post('/api/tutorial/:playerId/skip', async (c) => {
  const playerId = c.req.param('playerId');
  const DB = c.env.DB;

  try {
    const result = await skipTutorial(playerId, DB);
    return c.json(result);
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

/**
 * POST /api/tutorial/:playerId/claim-reward
 * Claim the resource reward for a completed tutorial step.
 * Body: { stepId: string }
 */
app.post('/api/tutorial/:playerId/claim-reward', async (c) => {
  const playerId = c.req.param('playerId');
  const DB = c.env.DB;

  try {
    const body = await c.req.json() as { stepId?: string };
    const stepId = body.stepId;

    if (!stepId) {
      return c.json({ error: 'stepId is required' }, 400);
    }

    const result = await claimTutorialReward(playerId, stepId, DB);

    if (!result.claimed && result.error) {
      return c.json({ error: result.error }, 400);
    }

    return c.json(result);
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});


// ============================================================================
// OFFICERS ENDPOINTS

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
      // Get planet state using correct DO binding pattern
      const stub = getPlanetStub(PLANET_DO, planet.id);
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

// COLONIZATION ENDPOINTS
app.get('/api/planet/:id/state', async (c) => {
  const planetId = c.req.param('id');
  const PLANET_DO = c.env.PLANET_DO;

  try {
    const stub = getPlanetStub(PLANET_DO, planetId);
    const response = await stub.fetch(new Request('https://planet/state'));
    const state = await response.json();
    return c.json(state);
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});
app.get('/api/planet/:id/resources', async (c) => {
  const planetId = c.req.param('id');
  const PLANET_DO = c.env.PLANET_DO;

  try {
    const stub = getPlanetStub(PLANET_DO, planetId);
    const response = await stub.fetch(new Request('https://planet/resources'));
    const data = await response.json();
    return c.json(data);
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});
app.get('/api/planet/:id/buildings', async (c) => {
  const planetId = c.req.param('id');
  const PLANET_DO = c.env.PLANET_DO;

  try {
    const stub = getPlanetStub(PLANET_DO, planetId);
    const response = await stub.fetch(new Request('https://planet/buildings'));
    const buildings = await response.json();
    return c.json(buildings);
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});
app.get('/api/planet/:id/queue', async (c) => {
  const planetId = c.req.param('id');
  const PLANET_DO = c.env.PLANET_DO;

  try {
    const stub = getPlanetStub(PLANET_DO, planetId);
    const response = await stub.fetch(new Request('https://planet/queue/list'));
    const queue = await response.json();
    return c.json(queue);
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});
app.post('/api/planet/:id/queue', async (c) => {
  const planetId = c.req.param('id');
  const PLANET_DO = c.env.PLANET_DO;
  const DB = c.env.DB;

  try {
    const body = await c.req.json();
    const stub = getPlanetStub(PLANET_DO, planetId);
    const response = await stub.fetch(new Request('https://planet/queue/add', { method: 'POST', body: JSON.stringify(body) }));

    if (!response.ok) {
      return c.json({ error: await response.text() }, response.status as any);
    }

    const result = await response.json() as any;

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
app.post('/api/planet/:id/initialize', async (c) => {
  const planetId = c.req.param('id');
  const PLANET_DO = c.env.PLANET_DO;

  try {
    const body = await c.req.json();
    const stub = getPlanetStub(PLANET_DO, planetId);
    const response = await stub.fetch(new Request('https://planet/initialize', { method: 'POST', body: JSON.stringify(body) }));

    if (!response.ok) {
      return c.json({ error: await response.text() }, response.status as any);
    }

    return c.json(await response.json());
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});
app.post('/api/planet/:id/agent/run', async (c) => {
  const planetId = c.req.param('id');
  const PLANET_DO = c.env.PLANET_DO;
  const DB = c.env.DB;
  const AI = c.env.AI;

  try {
    // Get planet state
    const planetStub = getPlanetStub(PLANET_DO, planetId);
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
app.post('/api/planet/:id/ships/build', async (c) => {
  const planetId = c.req.param('id');
  const PLANET_DO = c.env.PLANET_DO;

  try {
    const body = await c.req.json();
    const stub = getPlanetStub(PLANET_DO, planetId);
    const response = await stub.fetch(
      new Request('https://planet/ships/build', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    );

    if (!response.ok) {
      return new Response(response.body, { status: response.status, headers: { 'Content-Type': 'application/json' } });
    }

    return c.json(await response.json());
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});
app.get('/api/planet/:id/ships/queue', async (c) => {
  const planetId = c.req.param('id');
  const PLANET_DO = c.env.PLANET_DO;

  try {
    const stub = getPlanetStub(PLANET_DO, planetId);
    const response = await stub.fetch(new Request('https://planet/ships/queue'));
    return c.json(await response.json());
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});
app.post('/api/planet/:id/ships/cancel', async (c) => {
  const planetId = c.req.param('id');
  const PLANET_DO = c.env.PLANET_DO;

  try {
    const body = await c.req.json();
    const stub = getPlanetStub(PLANET_DO, planetId);
    const response = await stub.fetch(
      new Request('https://planet/ships/cancel', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    );

    if (!response.ok) {
      return new Response(response.body, { status: response.status, headers: { 'Content-Type': 'application/json' } });
    }

    return c.json(await response.json());
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});
app.get('/api/planet/:id/ships/available', async (c) => {
  const planetId = c.req.param('id');
  const PLANET_DO = c.env.PLANET_DO;

  try {
    const stub = getPlanetStub(PLANET_DO, planetId);
    const response = await stub.fetch(new Request('https://planet/ships/available'));
    return c.json(await response.json());
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});
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
app.post('/api/colonize', async (c) => {
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
      return c.json(
        { error: 'playerId, fromPlanetId, galaxy, system, position are required' },
        400,
      );
    }

    const svc = new ColonizationService(DB, PLANET_DO);
    const result = await svc.colonizePlanet({ playerId, fromPlanetId, galaxy, system, position });

    if (!result.success) {
      return c.json({ error: result.error }, 400);
    }

    return c.json(result, 201);
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});
app.delete('/api/planet/:id/abandon', async (c) => {
  const DB = c.env.DB;
  const PLANET_DO = c.env.PLANET_DO;
  const planetId = c.req.param('id');
  const playerId = c.req.query('playerId');

  if (!playerId) {
    return c.json({ error: 'playerId query parameter is required' }, 400);
  }

  try {
    const svc = new ColonizationService(DB, PLANET_DO);
    const result = await svc.abandonPlanet(playerId, planetId);

    if (!result.success) {
      return c.json({ error: result.error }, 400);
    }

    return c.json(result);
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});
app.get('/api/planets/:playerId', async (c) => {
  const DB = c.env.DB;
  const PLANET_DO = c.env.PLANET_DO;
  const playerId = c.req.param('playerId');

  try {
    const svc = new ColonizationService(DB, PLANET_DO);
    const planets = await svc.getPlayerPlanets(playerId);
    return c.json({ planets });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

export default {
  async fetch(request: Request, env: Bindings): Promise<Response> {
    return app.fetch(request, env);
  },

  async scheduled(event: ScheduledEvent, env: Bindings): Promise<void> {
    await handleScheduled(event, env);
  },
};
