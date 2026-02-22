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
import { defenseService, buildDefense, cancelDefenseBuild, createEmptyDefenseQueue, processDefenseQueue, getDefenseBuildQueue, rebuildDefensesAfterBattle, launchMissileAttack } from './game/services/defenseService';
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
import { PlanetManagementService } from './game/services/planetManagementService';
import { defenseService, buildDefense, cancelDefenseBuild, createEmptyDefenseQueue, processDefenseQueue, getDefenseBuildQueue, rebuildDefensesAfterBattle, launchMissileAttack } from './game/services/defenseService';
import { createNotification, getNotifications, markRead as markNotifRead, markAllRead as markAllNotifsRead, deleteNotification, getUnreadCount as getNotifUnreadCount, getPreferences as getNotifPreferences, setPreferences as setNotifPreferences, getDefaultPreferences as getDefaultNotifPreferences } from './game/services/notificationService';
<<<<<<< HEAD
import { enableVacationMode, disableVacationMode, isOnVacation, getVacationInfo, checkVacationStatus } from './game/services/vacationService';
import { simulateBattlePreview, getBreakEvenFleet, compareFleetCompositions } from './game/services/battleSimulatorService';
=======
import { getDarkMatter, addDarkMatter, spendDarkMatter, getDarkMatterHistory, instantFinish, merchantTrade } from './game/services/darkMatterService';
>>>>>>> agent/wave3-7

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
import {
  DAILY_MISSIONS,
  getDailyMissions,
  checkMissionProgress,
  claimMissionReward,
  resetDailyMissions,
} from './game/services/dailyMissionService';

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
 * POST /api/player/:id/vacation/enable
 * Enable vacation mode for a player.
 * 
 * Requirements:
 *  - No active fleet missions
 *  - No active research
 *  - No active builds
 * 
 * Minimum vacation period: 2 days
 */
app.post('/api/player/:id/vacation/enable', async (c) => {
  const playerId = c.req.param('id');
  const DB = c.env.DB;

  if (!playerId) {
    return c.json({ error: 'playerId required' }, 400);
  }

  try {
    const result = await enableVacationMode(DB, playerId);
    if (!result.success) {
      return c.json({ error: result.reason || 'Failed to enable vacation mode' }, 400);
    }
    return c.json({ success: true, message: 'Vacation mode enabled. Minimum 2 days required.' });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

/**
 * POST /api/player/:id/vacation/disable
 * Disable vacation mode for a player.
 * 
 * Requirements:
 *  - Must be on vacation
 *  - Minimum 2 days must have passed
 */
app.post('/api/player/:id/vacation/disable', async (c) => {
  const playerId = c.req.param('id');
  const DB = c.env.DB;

  if (!playerId) {
    return c.json({ error: 'playerId required' }, 400);
  }

  try {
    const result = await disableVacationMode(DB, playerId);
    if (!result.success) {
      return c.json({ error: result.reason || 'Failed to disable vacation mode' }, 400);
    }
    return c.json({ success: true, message: 'Vacation mode disabled.' });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

/**
 * GET /api/player/:id/vacation
 * Get vacation status and information for a player.
 * 
 * Returns:
 *  - isOnVacation: boolean
 *  - vacationStart: unix seconds or null
 *  - vacationMinEnd: unix seconds or null
 *  - daysRemaining: number or null
 *  - canEnable: boolean
 *  - canDisable: boolean
 */
app.get('/api/player/:id/vacation', async (c) => {
  const playerId = c.req.param('id');
  const DB = c.env.DB;

  if (!playerId) {
    return c.json({ error: 'playerId required' }, 400);
  }

  try {
    const [vacationInfo, vacationStatus] = await Promise.all([
      getVacationInfo(DB, playerId),
      checkVacationStatus(DB, playerId),
    ]);

    return c.json({
      ...vacationInfo,
      ...vacationStatus,
    });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
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

    // Reset daily missions at midnight UTC
    try {
      const dmReset = await resetDailyMissions(DB);
      console.log(`[Cron] Daily missions reset for ${dmReset.reset} active players`);
    } catch (dmErr) {
      console.error("[Cron] Daily mission reset error:", dmErr);
    }
  } catch (error) {
    console.error('Cron handler error:', error);
  }
}

// ============================================================================
// DEFENSE ENDPOINTS
// ============================================================================

/**
 * POST /api/defense/build
 * Queue a defense build order
 * Body: { planetId, defenseType, count, shipyardLevel?, universeSpeed? }
 */
app.post('/api/defense/build', async (c) => {
  try {
    const body = await c.req.json() as any;
    const { planetId, defenseType, count, shipyardLevel = 5, universeSpeed = 1 } = body;

    if (!planetId || !defenseType || !count) {
      return c.json({ error: 'planetId, defenseType, and count are required' }, 400);
    }

    // Get planet resources and tech levels from DB
    const DB = c.env.DB;
    const planet = await DB.prepare('SELECT * FROM planets WHERE id = ?').bind(planetId).first() as any;
    if (!planet) {
      return c.json({ error: 'Planet not found' }, 404);
    }

    const resources = {
      metal: planet.metal ?? 0,
      crystal: planet.crystal ?? 0,
      deuterium: planet.deuterium ?? 0,
    };

    const tech = {
      laserTech: planet.laser_tech ?? 0,
      energyTech: planet.energy_tech ?? 0,
      weaponTech: planet.weapon_tech ?? 0,
      shieldingTech: planet.shielding_tech ?? 0,
      ionTech: planet.ion_tech ?? 0,
      plasmaTech: planet.plasma_tech ?? 0,
      impulseDrive: planet.impulse_drive ?? 0,
      missileSilo: planet.missile_silo ?? 0,
    };

    const currentDefenses = planet.defenses_json
      ? JSON.parse(planet.defenses_json)
      : { rocketLauncher: 0, lightLaser: 0, heavyLaser: 0, gaussCannon: 0, ionCannon: 0, plasmaTurret: 0, smallShieldDome: 0, largeShieldDome: 0, antiBallisticMissile: 0, interplanetaryMissile: 0 };

    const order = buildDefense(
      planetId,
      defenseType,
      count,
      tech,
      currentDefenses,
      resources,
      shipyardLevel,
      universeSpeed,
    );

    // Persist updated resources
    await DB.prepare(
      'UPDATE planets SET metal = ?, crystal = ?, deuterium = ? WHERE id = ?'
    ).bind(resources.metal, resources.crystal, resources.deuterium, planetId).run();

    // Store queue order in KV
    const KV = c.env.KV;
    const queueKey = `defense_queue:${planetId}`;
    const existingQueue = await KV.get(queueKey, 'json') as any ?? createEmptyDefenseQueue();
    existingQueue.orders.push(order);
    await KV.put(queueKey, JSON.stringify(existingQueue));

    return c.json({ success: true, order });
  } catch (error) {
    return c.json({ error: String(error) }, 400);
  }
});

/**
 * GET /api/defense/:planetId
 * Get current defenses on a planet
 */
app.get('/api/defense/:planetId', async (c) => {
  const planetId = c.req.param('planetId');
  const DB = c.env.DB;

  try {
    const planet = await DB.prepare('SELECT defenses_json FROM planets WHERE id = ?').bind(planetId).first() as any;
    if (!planet) {
      return c.json({ error: 'Planet not found' }, 404);
    }

    const defenses = planet.defenses_json ? JSON.parse(planet.defenses_json) : {
      rocketLauncher: 0, lightLaser: 0, heavyLaser: 0, gaussCannon: 0, ionCannon: 0,
      plasmaTurret: 0, smallShieldDome: 0, largeShieldDome: 0,
      antiBallisticMissile: 0, interplanetaryMissile: 0,
    };

    return c.json({ planetId, defenses });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

/**
 * GET /api/defense/queue/:planetId
 * Get the defense build queue for a planet
 */
app.get('/api/defense/queue/:planetId', async (c) => {
  const planetId = c.req.param('planetId');
  const KV = c.env.KV;

  try {
    const queueKey = `defense_queue:${planetId}`;
    const queue = await KV.get(queueKey, 'json') as any ?? createEmptyDefenseQueue();

    const status = getDefenseBuildQueue(queue, Date.now());
    return c.json({ planetId, ...status });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

/**
 * DELETE /api/defense/cancel/:queueId
 * Cancel a queued defense order and refund resources
 * Query: ?planetId=...
 */
app.delete('/api/defense/cancel/:queueId', async (c) => {
  const queueId = c.req.param('queueId');
  const planetId = c.req.query('planetId');

  if (!planetId) {
    return c.json({ error: 'planetId query parameter is required' }, 400);
  }

  const DB = c.env.DB;
  const KV = c.env.KV;

  try {
    const planet = await DB.prepare('SELECT * FROM planets WHERE id = ?').bind(planetId).first() as any;
    if (!planet) {
      return c.json({ error: 'Planet not found' }, 404);
    }

    const resources = {
      metal: planet.metal ?? 0,
      crystal: planet.crystal ?? 0,
      deuterium: planet.deuterium ?? 0,
    };

    const queueKey = `defense_queue:${planetId}`;
    const queue = await KV.get(queueKey, 'json') as any ?? createEmptyDefenseQueue();

    const cancelled = cancelDefenseBuild(queue, queueId, resources);
    if (!cancelled) {
      return c.json({ error: 'Queue item not found or already building' }, 404);
    }

    // Persist refund
    await DB.prepare(
      'UPDATE planets SET metal = ?, crystal = ?, deuterium = ? WHERE id = ?'
    ).bind(resources.metal, resources.crystal, resources.deuterium, planetId).run();

    await KV.put(queueKey, JSON.stringify(queue));

    return c.json({ success: true, cancelled, refunded: cancelled.totalCost });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

/**
 * POST /api/defense/missile-attack
 * Launch interplanetary missiles at a target planet
 * Body: { fromPlanetId, toPlanetId, missileCount, targetDefense? }
 */
app.post('/api/defense/missile-attack', async (c) => {
  try {
    const body = await c.req.json() as any;
    const { fromPlanetId, toPlanetId, missileCount, targetDefense } = body;

    if (!fromPlanetId || !toPlanetId || !missileCount) {
      return c.json({ error: 'fromPlanetId, toPlanetId, and missileCount are required' }, 400);
    }

    const DB = c.env.DB;

    // Get attacker's planet (check IPM supply and weaponTech)
    const attacker = await DB.prepare('SELECT * FROM planets WHERE id = ?').bind(fromPlanetId).first() as any;
    if (!attacker) {
      return c.json({ error: 'Attacker planet not found' }, 404);
    }

    const attackerDefenses = attacker.defenses_json ? JSON.parse(attacker.defenses_json) : { interplanetaryMissile: 0 };
    if ((attackerDefenses.interplanetaryMissile ?? 0) < missileCount) {
      return c.json({ error: `Not enough Interplanetary Missiles. Have: ${attackerDefenses.interplanetaryMissile ?? 0}, Need: ${missileCount}` }, 400);
    }

    // Get target planet defenses
    const target = await DB.prepare('SELECT * FROM planets WHERE id = ?').bind(toPlanetId).first() as any;
    if (!target) {
      return c.json({ error: 'Target planet not found' }, 404);
    }

    const targetDefenses = target.defenses_json ? JSON.parse(target.defenses_json) : {
      rocketLauncher: 0, lightLaser: 0, heavyLaser: 0, gaussCannon: 0, ionCannon: 0,
      plasmaTurret: 0, smallShieldDome: 0, largeShieldDome: 0,
      antiBallisticMissile: 0, interplanetaryMissile: 0,
    };

    const weaponTech = attacker.weapon_tech ?? 0;

    // Simulate attack
    const result = launchMissileAttack(targetDefenses, missileCount, weaponTech, targetDefense);

    // Deduct missiles from attacker
    attackerDefenses.interplanetaryMissile -= missileCount;
    await DB.prepare(
      'UPDATE planets SET defenses_json = ? WHERE id = ?'
    ).bind(JSON.stringify(attackerDefenses), fromPlanetId).run();

    // Update target defenses
    await DB.prepare(
      'UPDATE planets SET defenses_json = ? WHERE id = ?'
    ).bind(JSON.stringify(result.remainingDefenses), toPlanetId).run();

    return c.json({
      success: true,
      fromPlanetId,
      toPlanetId,
      missilesLaunched: missileCount,
      result,
    });
  } catch (error) {
    return c.json({ error: String(error) }, 400);
  }
});

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


// DEFENSE ENDPOINTS
app.post('/api/defense/build', async (c) => {
  try {
    const body = await c.req.json() as any;
    const { planetId, defenseType, count, shipyardLevel = 5, universeSpeed = 1 } = body;

    if (!planetId || !defenseType || !count) {
      return c.json({ error: 'planetId, defenseType, and count are required' }, 400);
    }

    // Get planet resources and tech levels from DB
    const DB = c.env.DB;
    const planet = await DB.prepare('SELECT * FROM planets WHERE id = ?').bind(planetId).first() as any;
    if (!planet) {
      return c.json({ error: 'Planet not found' }, 404);
    }

    const resources = {
      metal: planet.metal ?? 0,
      crystal: planet.crystal ?? 0,
      deuterium: planet.deuterium ?? 0,
    };

    const tech = {
      laserTech: planet.laser_tech ?? 0,
      energyTech: planet.energy_tech ?? 0,
      weaponTech: planet.weapon_tech ?? 0,
      shieldingTech: planet.shielding_tech ?? 0,
      ionTech: planet.ion_tech ?? 0,
      plasmaTech: planet.plasma_tech ?? 0,
      impulseDrive: planet.impulse_drive ?? 0,
      missileSilo: planet.missile_silo ?? 0,
    };

    const currentDefenses = planet.defenses_json
      ? JSON.parse(planet.defenses_json)
      : { rocketLauncher: 0, lightLaser: 0, heavyLaser: 0, gaussCannon: 0, ionCannon: 0, plasmaTurret: 0, smallShieldDome: 0, largeShieldDome: 0, antiBallisticMissile: 0, interplanetaryMissile: 0 };

    const order = buildDefense(
      planetId,
      defenseType,
      count,
      tech,
      currentDefenses,
      resources,
      shipyardLevel,
      universeSpeed,
    );

    // Persist updated resources
    await DB.prepare(
      'UPDATE planets SET metal = ?, crystal = ?, deuterium = ? WHERE id = ?'
    ).bind(resources.metal, resources.crystal, resources.deuterium, planetId).run();

    // Store queue order in KV
    const KV = c.env.KV;
    const queueKey = `defense_queue:${planetId}`;
    const existingQueue = await KV.get(queueKey, 'json') as any ?? createEmptyDefenseQueue();
    existingQueue.orders.push(order);
    await KV.put(queueKey, JSON.stringify(existingQueue));

    return c.json({ success: true, order });
  } catch (error) {
    return c.json({ error: String(error) }, 400);
  }
});
app.get('/api/defense/:planetId', async (c) => {
  const planetId = c.req.param('planetId');
  const DB = c.env.DB;

  try {
    const planet = await DB.prepare('SELECT defenses_json FROM planets WHERE id = ?').bind(planetId).first() as any;
    if (!planet) {
      return c.json({ error: 'Planet not found' }, 404);
    }

    const defenses = planet.defenses_json ? JSON.parse(planet.defenses_json) : {
      rocketLauncher: 0, lightLaser: 0, heavyLaser: 0, gaussCannon: 0, ionCannon: 0,
      plasmaTurret: 0, smallShieldDome: 0, largeShieldDome: 0,
      antiBallisticMissile: 0, interplanetaryMissile: 0,
    };

    return c.json({ planetId, defenses });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});
app.get('/api/defense/queue/:planetId', async (c) => {
  const planetId = c.req.param('planetId');
  const KV = c.env.KV;

  try {
    const queueKey = `defense_queue:${planetId}`;
    const queue = await KV.get(queueKey, 'json') as any ?? createEmptyDefenseQueue();

    const status = getDefenseBuildQueue(queue, Date.now());
    return c.json({ planetId, ...status });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});
app.delete('/api/defense/cancel/:queueId', async (c) => {
  const queueId = c.req.param('queueId');
  const planetId = c.req.query('planetId');

  if (!planetId) {
    return c.json({ error: 'planetId query parameter is required' }, 400);
  }

  const DB = c.env.DB;
  const KV = c.env.KV;

  try {
    const planet = await DB.prepare('SELECT * FROM planets WHERE id = ?').bind(planetId).first() as any;
    if (!planet) {
      return c.json({ error: 'Planet not found' }, 404);
    }

    const resources = {
      metal: planet.metal ?? 0,
      crystal: planet.crystal ?? 0,
      deuterium: planet.deuterium ?? 0,
    };

    const queueKey = `defense_queue:${planetId}`;
    const queue = await KV.get(queueKey, 'json') as any ?? createEmptyDefenseQueue();

    const cancelled = cancelDefenseBuild(queue, queueId, resources);
    if (!cancelled) {
      return c.json({ error: 'Queue item not found or already building' }, 404);
    }

    // Persist refund
    await DB.prepare(
      'UPDATE planets SET metal = ?, crystal = ?, deuterium = ? WHERE id = ?'
    ).bind(resources.metal, resources.crystal, resources.deuterium, planetId).run();

    await KV.put(queueKey, JSON.stringify(queue));

    return c.json({ success: true, cancelled, refunded: cancelled.totalCost });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});
app.post('/api/defense/missile-attack', async (c) => {
  try {
    const body = await c.req.json() as any;
    const { fromPlanetId, toPlanetId, missileCount, targetDefense } = body;

    if (!fromPlanetId || !toPlanetId || !missileCount) {
      return c.json({ error: 'fromPlanetId, toPlanetId, and missileCount are required' }, 400);
    }

    const DB = c.env.DB;

    // Get attacker's planet (check IPM supply and weaponTech)
    const attacker = await DB.prepare('SELECT * FROM planets WHERE id = ?').bind(fromPlanetId).first() as any;
    if (!attacker) {
      return c.json({ error: 'Attacker planet not found' }, 404);
    }

    const attackerDefenses = attacker.defenses_json ? JSON.parse(attacker.defenses_json) : { interplanetaryMissile: 0 };
    if ((attackerDefenses.interplanetaryMissile ?? 0) < missileCount) {
      return c.json({ error: `Not enough Interplanetary Missiles. Have: ${attackerDefenses.interplanetaryMissile ?? 0}, Need: ${missileCount}` }, 400);
    }

    // Get target planet defenses
    const target = await DB.prepare('SELECT * FROM planets WHERE id = ?').bind(toPlanetId).first() as any;
    if (!target) {
      return c.json({ error: 'Target planet not found' }, 404);
    }

    const targetDefenses = target.defenses_json ? JSON.parse(target.defenses_json) : {
      rocketLauncher: 0, lightLaser: 0, heavyLaser: 0, gaussCannon: 0, ionCannon: 0,
      plasmaTurret: 0, smallShieldDome: 0, largeShieldDome: 0,
      antiBallisticMissile: 0, interplanetaryMissile: 0,
    };

    const weaponTech = attacker.weapon_tech ?? 0;

    // Simulate attack
    const result = launchMissileAttack(targetDefenses, missileCount, weaponTech, targetDefense);

    // Deduct missiles from attacker
    attackerDefenses.interplanetaryMissile -= missileCount;
    await DB.prepare(
      'UPDATE planets SET defenses_json = ? WHERE id = ?'
    ).bind(JSON.stringify(attackerDefenses), fromPlanetId).run();

    // Update target defenses
    await DB.prepare(
      'UPDATE planets SET defenses_json = ? WHERE id = ?'
    ).bind(JSON.stringify(result.remainingDefenses), toPlanetId).run();

    return c.json({
      success: true,
      fromPlanetId,
      toPlanetId,
      missilesLaunched: missileCount,
      result,
    });


// TOURNAMENT ENDPOINTS
app.post('/api/tournament/create', async (c) => {
  try {
    const { DB } = c.env;
    const body = await c.req.json<{
      name: string;
      type: string;
      maxPlayers: number;
      seasonId?: string;
    }>();

    if (!body.name || !body.type || !body.maxPlayers) {
      return c.json({ error: 'name, type, and maxPlayers are required' }, 400);
    }

    const tournament = await createTournament(
      body.name,
      body.type as any,
      body.maxPlayers,
      body.seasonId || null,
      DB
    );

    return c.json({ tournament });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});
app.get('/api/tournament/:id', async (c) => {
  try {
    const { DB } = c.env;
    const tournamentId = c.req.param('id');

    const tournament = await getTournament(tournamentId, DB);
    if (!tournament) {
      return c.json({ error: 'Tournament not found' }, 404);
    }

    return c.json({ tournament });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});
app.post('/api/tournament/:id/join', async (c) => {
  try {
    const { DB } = c.env;
    const tournamentId = c.req.param('id');
    const body = await c.req.json<{ playerId: string }>();

    if (!body.playerId) {
      return c.json({ error: 'playerId is required' }, 400);
    }

    await joinTournament(tournamentId, body.playerId, DB);

    return c.json({ joined: true, tournamentId });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});
app.post('/api/tournament/:id/start', async (c) => {
  try {
    const { DB } = c.env;
    const tournamentId = c.req.param('id');

    const bracket = await generateBracket(tournamentId, DB);

    return c.json({ bracket });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});
app.get('/api/tournament/:id/bracket', async (c) => {
  try {
    const { DB } = c.env;
    const tournamentId = c.req.param('id');

    const bracket = await getBracket(tournamentId, DB);
    if (!bracket) {
      return c.json({ error: 'Bracket not found' }, 404);
    }

    const matches = await getTournamentMatches(tournamentId, undefined, DB);

    return c.json({ bracket, matches });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});
app.post('/api/tournament/:id/resolve-match', async (c) => {
  try {
    const { DB } = c.env;
    const body = await c.req.json<{ matchId: string; defenderId: string }>();

    if (!body.matchId || !body.defenderId) {
      return c.json({ error: 'matchId and defenderId are required' }, 400);
    }

    const match = await resolveMatch(body.matchId, body.defenderId, DB);

    return c.json({ match });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});
app.get('/api/seasons', async (c) => {
  try {
    const { DB } = c.env;

    const activeSeason = await getActiveSeason(DB);

    return c.json({ activeSeason });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});
app.post('/api/seasons/create', async (c) => {
  try {
    const { DB } = c.env;
    const body = await c.req.json<{
      seasonNumber: number;
      startDate: number;
      endDate: number;
    }>();

    if (!body.seasonNumber || !body.startDate || !body.endDate) {
      return c.json({ error: 'seasonNumber, startDate, and endDate are required' }, 400);
    }

    const season = await createSeason(body.seasonNumber, body.startDate, body.endDate, DB);

    return c.json({ season });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});
app.get('/api/leaderboard/tournament', async (c) => {
  try {
    const { DB } = c.env;
    const seasonId = c.req.query('seasonId');
    const tournamentId = c.req.query('tournamentId');
    const limit = parseInt(c.req.query('limit') || '100');

    if (tournamentId) {
      const standings = await getTournamentStandings(tournamentId, DB);
      return c.json({ leaderboard: standings });
    }

    if (seasonId) {
      const leaderboard = await getSeasonLeaderboard(seasonId, limit, DB);
      return c.json({ leaderboard });
    }

    // Default: get active season leaderboard
    const activeSeason = await getActiveSeason(DB);
    if (!activeSeason) {
      return c.json({ leaderboard: [] });
    }

    const leaderboard = await getSeasonLeaderboard(activeSeason.id, limit, DB);
    return c.json({ leaderboard });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});


// NOTIFICATION ENDPOINTS
app.get('/api/notifications/unread-count/:playerId', async (c) => {
  const DB = c.env.DB;
  const playerId = c.req.param('playerId');

  try {
    const count = await getNotifUnreadCount(playerId, DB);
    return c.json({ unreadCount: count });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});
app.get('/api/notifications/preferences/:playerId', async (c) => {
  const DB = c.env.DB;
  const playerId = c.req.param('playerId');

  try {
    const prefs = await getNotifPreferences(playerId, DB);
    return c.json(prefs ?? getDefaultNotifPreferences(playerId));
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});
app.put('/api/notifications/preferences/:playerId', async (c) => {
  const DB = c.env.DB;
  const playerId = c.req.param('playerId');

  try {
    const body = await c.req.json();
    const prefs = await setNotifPreferences(playerId, body, DB);
    return c.json(prefs);
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});
app.post('/api/notifications/mark-read', async (c) => {
  const DB = c.env.DB;

  try {
    const body = await c.req.json() as { notificationId: string; playerId: string };
    if (!body.notificationId || !body.playerId) {
      return c.json({ error: 'notificationId and playerId are required' }, 400);
    }
    const result = await markNotifRead(body.notificationId, body.playerId, DB);
    return c.json({ updated: result });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});
app.post('/api/notifications/mark-all-read', async (c) => {
  const DB = c.env.DB;

  try {
    const body = await c.req.json() as { playerId: string };
    if (!body.playerId) {
      return c.json({ error: 'playerId is required' }, 400);
    }
    const count = await markAllNotifsRead(body.playerId, DB);
    return c.json({ updated: count });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});
app.get('/api/notifications/:playerId', async (c) => {
  const DB = c.env.DB;
  const playerId = c.req.param('playerId');

  try {
    const type = c.req.query('type') || undefined;
    const priority = c.req.query('priority') || undefined;
    const unreadParam = c.req.query('unread');
    const page = parseInt(c.req.query('page') ?? '1', 10);
    const limit = parseInt(c.req.query('limit') ?? '20', 10);

    const unread = unreadParam === 'true' ? true : unreadParam === 'false' ? false : undefined;

    const result = await getNotifications(playerId, DB, {
      type: type as any,
      priority: priority as any,
      unread,
      page,
      limit,
    });
app.delete('/api/notifications/:id', async (c) => {
  const DB = c.env.DB;
  const notificationId = c.req.param('id');
  const playerId = c.req.query('player_id');

  if (!playerId) {
    return c.json({ error: 'player_id query param required' }, 400);
  }

  try {
    const deleted = await deleteNotification(notificationId, playerId, DB);
    if (!deleted) {
      return c.json({ error: 'Notification not found' }, 404);
    }
    return c.json({ deleted: true });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});
// ============================================================================
// PLANET MANAGEMENT: Abandon, Fleet Save, Fleet Recall (#72, #73)
// ============================================================================

/**
 * POST /api/planet/abandon
 * Abandon a colony — return fleet to homeworld, delete planet
 * Body: { playerId, planetId }
 */
app.post('/api/planet/abandon', async (c) => {
  const DB = c.env.DB;
  const PLANET_DO = c.env.PLANET_DO;

  try {
    const body = await c.req.json<{ playerId: string; planetId: string }>();
    const { playerId, planetId } = body;

    if (!playerId || !planetId) {
      return c.json({ error: 'playerId and planetId are required' }, 400);
    }

    const svc = new PlanetManagementService(DB, PLANET_DO);
    const result = await svc.abandonPlanet(DB, playerId, planetId);

    if (!result.success) {
      return c.json({ error: result.error }, 400);
    }

    return c.json(result);
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

/**
 * POST /api/fleet/save
 * Fleet Save — deploy fleet to own planet (no combat)
 * Body: { playerId, planetId, targetPlanetId, ships, speed? }
 */
app.post('/api/fleet/save', async (c) => {
  const DB = c.env.DB;
  const PLANET_DO = c.env.PLANET_DO;

  try {
    const body = await c.req.json<{
      playerId: string;
      planetId: string;
      targetPlanetId: string;
      ships: Record<string, number>;
      speed?: number;
    }>();
    const { playerId, planetId, targetPlanetId, ships, speed } = body;

    if (!playerId || !planetId || !targetPlanetId || !ships) {
      return c.json({ error: 'playerId, planetId, targetPlanetId, and ships are required' }, 400);
    }

    const svc = new PlanetManagementService(DB, PLANET_DO);
    const result = await svc.fleetSave(DB, playerId, planetId, targetPlanetId, ships as any, speed);

    if (!result.success) {
      return c.json({ error: result.error }, 400);
    }

    return c.json(result, 201);
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

/**
 * POST /api/fleet/recall
 * Recall an in-flight fleet — reverse direction
 * Body: { playerId, missionId }
 */
app.post('/api/fleet/recall', async (c) => {
  const DB = c.env.DB;
  const PLANET_DO = c.env.PLANET_DO;

  try {
    const body = await c.req.json<{ playerId: string; missionId: string }>();
    const { playerId, missionId } = body;

    if (!playerId || !missionId) {
      return c.json({ error: 'playerId and missionId are required' }, 400);
    }

    const svc = new PlanetManagementService(DB, PLANET_DO);
    const result = await svc.recallFleet(DB, playerId, missionId);

    if (!result.success) {
      return c.json({ error: result.error }, 400);
    }

    return c.json(result);
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});



// ============================================================================
<<<<<<< HEAD
// BATTLE SIMULATOR ENDPOINTS
// ============================================================================

/**
 * POST /api/battle/simulate
 * Run Monte Carlo battle simulation and return statistical outcomes.
 * Body: { attackerShips, defenderShips, defenderDefenses?, attackerTech?, defenderTech?, runs? }
 */
app.post('/api/battle/simulate', async (c) => {
  try {
    const body = await c.req.json();
    const { attackerShips, defenderShips, defenderDefenses, attackerTech, defenderTech, runs } = body;

    if (!attackerShips || !defenderShips) {
      return c.json({ error: 'attackerShips and defenderShips are required' }, 400);
    }

    const result = simulateBattlePreview(
      attackerShips,
      defenderShips,
      defenderDefenses || undefined,
      attackerTech || undefined,
      defenderTech || undefined,
      runs || 100,
    );

    return c.json(result);
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

/**
 * POST /api/battle/breakeven
 * Find minimum fleet needed for 50%+ win rate against a target.
 * Body: { targetFleet, targetDefenses?, targetTech?, attackerTech? }
 */
app.post('/api/battle/breakeven', async (c) => {
  try {
    const body = await c.req.json();
    const { targetFleet, targetDefenses, targetTech, attackerTech } = body;

    if (!targetFleet) {
      return c.json({ error: 'targetFleet is required' }, 400);
    }

    const result = getBreakEvenFleet(
      targetDefenses || undefined,
      targetFleet,
      targetTech || undefined,
      attackerTech || undefined,
    );

    return c.json(result);
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

/**
 * POST /api/battle/compare
 * Compare two fleet compositions head-to-head.
 * Body: { fleet1, fleet2, tech1?, tech2?, runs? }
 */
app.post('/api/battle/compare', async (c) => {
  try {
    const body = await c.req.json();
    const { fleet1, fleet2, tech1, tech2, runs } = body;

    if (!fleet1 || !fleet2) {
      return c.json({ error: 'fleet1 and fleet2 are required' }, 400);
    }

    const result = compareFleetCompositions(
      fleet1,
      fleet2,
      tech1 || undefined,
      tech2 || undefined,
      runs || 100,
    );

    return c.json(result);
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

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

    // Reset daily missions at midnight UTC
    try {
      const dmReset = await resetDailyMissions(DB);
      console.log(`[Cron] Daily missions reset for ${dmReset.reset} active players`);
    } catch (dmErr) {
      console.error("[Cron] Daily mission reset error:", dmErr);
    }
  } catch (error) {
    console.error('Cron handler error:', error);
  }
}

// ============================================================================
// DEFENSE ENDPOINTS
// ============================================================================

/**
 * POST /api/defense/build
 * Queue a defense build order
 * Body: { planetId, defenseType, count, shipyardLevel?, universeSpeed? }
 */
app.post('/api/defense/build', async (c) => {
  try {
    const body = await c.req.json() as any;
    const { planetId, defenseType, count, shipyardLevel = 5, universeSpeed = 1 } = body;

    if (!planetId || !defenseType || !count) {
      return c.json({ error: 'planetId, defenseType, and count are required' }, 400);
    }

    // Get planet resources and tech levels from DB
    const DB = c.env.DB;
    const planet = await DB.prepare('SELECT * FROM planets WHERE id = ?').bind(planetId).first() as any;
    if (!planet) {
      return c.json({ error: 'Planet not found' }, 404);
    }

    const resources = {
      metal: planet.metal ?? 0,
      crystal: planet.crystal ?? 0,
      deuterium: planet.deuterium ?? 0,
    };

    const tech = {
      laserTech: planet.laser_tech ?? 0,
      energyTech: planet.energy_tech ?? 0,
      weaponTech: planet.weapon_tech ?? 0,
      shieldingTech: planet.shielding_tech ?? 0,
      ionTech: planet.ion_tech ?? 0,
      plasmaTech: planet.plasma_tech ?? 0,
      impulseDrive: planet.impulse_drive ?? 0,
      missileSilo: planet.missile_silo ?? 0,
    };

    const currentDefenses = planet.defenses_json
      ? JSON.parse(planet.defenses_json)
      : { rocketLauncher: 0, lightLaser: 0, heavyLaser: 0, gaussCannon: 0, ionCannon: 0, plasmaTurret: 0, smallShieldDome: 0, largeShieldDome: 0, antiBallisticMissile: 0, interplanetaryMissile: 0 };

    const order = buildDefense(
      planetId,
      defenseType,
      count,
      tech,
      currentDefenses,
      resources,
      shipyardLevel,
      universeSpeed,
    );

    // Persist updated resources
    await DB.prepare(
      'UPDATE planets SET metal = ?, crystal = ?, deuterium = ? WHERE id = ?'
    ).bind(resources.metal, resources.crystal, resources.deuterium, planetId).run();

    // Store queue order in KV
    const KV = c.env.KV;
    const queueKey = `defense_queue:${planetId}`;
    const existingQueue = await KV.get(queueKey, 'json') as any ?? createEmptyDefenseQueue();
    existingQueue.orders.push(order);
    await KV.put(queueKey, JSON.stringify(existingQueue));

    return c.json({ success: true, order });
  } catch (error) {
    return c.json({ error: String(error) }, 400);
  }
});

// DAILY MISSIONS API
// ============================================================================

/**
 * GET /api/missions/daily/:playerId
 * Returns the player's 3 daily missions for today with progress.
 */
app.get('/api/missions/daily/:playerId', async (c) => {
  const DB = c.env.DB;
  const playerId = c.req.param('playerId');

  if (!playerId) {
    return c.json({ error: 'playerId required' }, 400);
  }

  try {
    const missions = await getDailyMissions(DB, playerId);
    return c.json({ playerId, dateKey: missions[0]?.dateKey, missions });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

app.post('/api/missions/daily/:playerId/check/:missionId', async (c) => {
  const DB = c.env.DB;
  const playerId = c.req.param('playerId');
  const missionId = c.req.param('missionId');

  try {
    const mission = await checkMissionProgress(DB, playerId, missionId);
    if (!mission) {
      return c.json({ error: 'Mission not found' }, 404);
    }
    return c.json({ mission });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

app.post('/api/missions/claim', async (c) => {
  const DB = c.env.DB;

  let body: { playerId?: string; missionId?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { playerId, missionId } = body;
  if (!playerId || !missionId) {
    return c.json({ error: 'playerId and missionId required' }, 400);
  }

  try {
    const result = await claimMissionReward(DB, playerId, missionId);
    if (!result) {
      return c.json({ error: 'Mission not found or not yet completed, or already claimed' }, 400);
    }
    return c.json({ claimed: true, reward: result.reward, mission: result.mission });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

app.post('/api/missions/reset', async (c) => {
  const DB = c.env.DB;

  try {
    const result = await resetDailyMissions(DB);
    return c.json({ ok: true, playersReset: result.reset });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

app.get('/api/missions/definitions', (c) => {
  return c.json({ missions: DAILY_MISSIONS });
});


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
=======
// DARK MATTER API
// ============================================================================

/**
 * GET /api/dm/:playerId
 * Get dark matter balance and transaction history
 */
app.get('/api/dm/:playerId', async (c) => {
  const DB = c.env.DB;
  const playerId = c.req.param('playerId');
  const limitStr = c.req.query('limit') || '50';

  try {
    const balance = await getDarkMatter(DB, playerId);
    const history = await getDarkMatterHistory(DB, playerId, parseInt(limitStr, 10));

    return c.json({
      balance,
      history,
    });
>>>>>>> agent/wave3-7
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

/**
<<<<<<< HEAD
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
=======
 * POST /api/dm/instant-finish
 * Spend dark matter to instantly complete a queue item
 * Body: { playerId, planetId, queueType, queueIndex }
 */
app.post('/api/dm/instant-finish', async (c) => {
>>>>>>> agent/wave3-7
  const DB = c.env.DB;

  try {
    const body = await c.req.json<{
<<<<<<< HEAD
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

// ============================================================================
// DEFENSE ENDPOINTS
// ============================================================================

/**
 * POST /api/defense/build
 * Queue a defense build order
 * Body: { planetId, defenseType, count, shipyardLevel?, universeSpeed? }
 */
app.post('/api/defense/build', async (c) => {
  try {
    const body = await c.req.json() as any;
    const { planetId, defenseType, count, shipyardLevel = 5, universeSpeed = 1 } = body;

    if (!planetId || !defenseType || !count) {
      return c.json({ error: 'planetId, defenseType, and count are required' }, 400);
    }

    // Get planet resources and tech levels from DB
    const DB = c.env.DB;
    const planet = await DB.prepare('SELECT * FROM planets WHERE id = ?').bind(planetId).first() as any;
    if (!planet) {
      return c.json({ error: 'Planet not found' }, 404);
    }

    const resources = {
      metal: planet.metal ?? 0,
      crystal: planet.crystal ?? 0,
      deuterium: planet.deuterium ?? 0,
    };

    const tech = {
      laserTech: planet.laser_tech ?? 0,
      energyTech: planet.energy_tech ?? 0,
      weaponTech: planet.weapon_tech ?? 0,
      shieldingTech: planet.shielding_tech ?? 0,
      ionTech: planet.ion_tech ?? 0,
      plasmaTech: planet.plasma_tech ?? 0,
      impulseDrive: planet.impulse_drive ?? 0,
      missileSilo: planet.missile_silo ?? 0,
    };

    const currentDefenses = planet.defenses_json
      ? JSON.parse(planet.defenses_json)
      : { rocketLauncher: 0, lightLaser: 0, heavyLaser: 0, gaussCannon: 0, ionCannon: 0, plasmaTurret: 0, smallShieldDome: 0, largeShieldDome: 0, antiBallisticMissile: 0, interplanetaryMissile: 0 };

    const order = buildDefense(
      planetId,
      defenseType,
      count,
      tech,
      currentDefenses,
      resources,
      shipyardLevel,
      universeSpeed,
    );

    // Persist updated resources
    await DB.prepare(
      'UPDATE planets SET metal = ?, crystal = ?, deuterium = ? WHERE id = ?'
    ).bind(resources.metal, resources.crystal, resources.deuterium, planetId).run();

    // Store queue order in KV
    const KV = c.env.KV;
    const queueKey = `defense_queue:${planetId}`;
    const existingQueue = await KV.get(queueKey, 'json') as any ?? createEmptyDefenseQueue();
    existingQueue.orders.push(order);
    await KV.put(queueKey, JSON.stringify(existingQueue));

    return c.json({ success: true, order });
  } catch (error) {
    return c.json({ error: String(error) }, 400);
  }
});

/**
 * GET /api/defense/:planetId
 * Get current defenses on a planet
 */
app.get('/api/defense/:planetId', async (c) => {
  const planetId = c.req.param('planetId');
  const DB = c.env.DB;

  try {
    const planet = await DB.prepare('SELECT defenses_json FROM planets WHERE id = ?').bind(planetId).first() as any;
    if (!planet) {
      return c.json({ error: 'Planet not found' }, 404);
    }

    const defenses = planet.defenses_json ? JSON.parse(planet.defenses_json) : {
      rocketLauncher: 0, lightLaser: 0, heavyLaser: 0, gaussCannon: 0, ionCannon: 0,
      plasmaTurret: 0, smallShieldDome: 0, largeShieldDome: 0,
      antiBallisticMissile: 0, interplanetaryMissile: 0,
    };

    return c.json({ planetId, defenses });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

/**
 * GET /api/defense/queue/:planetId
 * Get the defense build queue for a planet
 */
app.get('/api/defense/queue/:planetId', async (c) => {
  const planetId = c.req.param('planetId');
  const KV = c.env.KV;

  try {
    const queueKey = `defense_queue:${planetId}`;
    const queue = await KV.get(queueKey, 'json') as any ?? createEmptyDefenseQueue();

    const status = getDefenseBuildQueue(queue, Date.now());
    return c.json({ planetId, ...status });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

/**
 * DELETE /api/defense/cancel/:queueId
 * Cancel a queued defense order and refund resources
 * Query: ?planetId=...
 */
app.delete('/api/defense/cancel/:queueId', async (c) => {
  const queueId = c.req.param('queueId');
  const planetId = c.req.query('planetId');

  if (!planetId) {
    return c.json({ error: 'planetId query parameter is required' }, 400);
  }

  const DB = c.env.DB;
  const KV = c.env.KV;

  try {
    const planet = await DB.prepare('SELECT * FROM planets WHERE id = ?').bind(planetId).first() as any;
    if (!planet) {
      return c.json({ error: 'Planet not found' }, 404);
    }

    const resources = {
      metal: planet.metal ?? 0,
      crystal: planet.crystal ?? 0,
      deuterium: planet.deuterium ?? 0,
    };

    const queueKey = `defense_queue:${planetId}`;
    const queue = await KV.get(queueKey, 'json') as any ?? createEmptyDefenseQueue();

    const cancelled = cancelDefenseBuild(queue, queueId, resources);
    if (!cancelled) {
      return c.json({ error: 'Queue item not found or already building' }, 404);
    }

    // Persist refund
    await DB.prepare(
      'UPDATE planets SET metal = ?, crystal = ?, deuterium = ? WHERE id = ?'
    ).bind(resources.metal, resources.crystal, resources.deuterium, planetId).run();

    await KV.put(queueKey, JSON.stringify(queue));

    return c.json({ success: true, cancelled, refunded: cancelled.totalCost });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

/**
 * POST /api/defense/missile-attack
 * Launch interplanetary missiles at a target planet
 * Body: { fromPlanetId, toPlanetId, missileCount, targetDefense? }
 */
app.post('/api/defense/missile-attack', async (c) => {
  try {
    const body = await c.req.json() as any;
    const { fromPlanetId, toPlanetId, missileCount, targetDefense } = body;

    if (!fromPlanetId || !toPlanetId || !missileCount) {
      return c.json({ error: 'fromPlanetId, toPlanetId, and missileCount are required' }, 400);
    }

    const DB = c.env.DB;

    // Get attacker's planet (check IPM supply and weaponTech)
    const attacker = await DB.prepare('SELECT * FROM planets WHERE id = ?').bind(fromPlanetId).first() as any;
    if (!attacker) {
      return c.json({ error: 'Attacker planet not found' }, 404);
    }

    const attackerDefenses = attacker.defenses_json ? JSON.parse(attacker.defenses_json) : { interplanetaryMissile: 0 };
    if ((attackerDefenses.interplanetaryMissile ?? 0) < missileCount) {
      return c.json({ error: `Not enough Interplanetary Missiles. Have: ${attackerDefenses.interplanetaryMissile ?? 0}, Need: ${missileCount}` }, 400);
    }

    // Get target planet defenses
    const target = await DB.prepare('SELECT * FROM planets WHERE id = ?').bind(toPlanetId).first() as any;
    if (!target) {
      return c.json({ error: 'Target planet not found' }, 404);
    }

    const targetDefenses = target.defenses_json ? JSON.parse(target.defenses_json) : {
      rocketLauncher: 0, lightLaser: 0, heavyLaser: 0, gaussCannon: 0, ionCannon: 0,
      plasmaTurret: 0, smallShieldDome: 0, largeShieldDome: 0,
      antiBallisticMissile: 0, interplanetaryMissile: 0,
    };

    const weaponTech = attacker.weapon_tech ?? 0;

    // Simulate attack
    const result = launchMissileAttack(targetDefenses, missileCount, weaponTech, targetDefense);

    // Deduct missiles from attacker
    attackerDefenses.interplanetaryMissile -= missileCount;
    await DB.prepare(
      'UPDATE planets SET defenses_json = ? WHERE id = ?'
    ).bind(JSON.stringify(attackerDefenses), fromPlanetId).run();

    // Update target defenses
    await DB.prepare(
      'UPDATE planets SET defenses_json = ? WHERE id = ?'
    ).bind(JSON.stringify(result.remainingDefenses), toPlanetId).run();

    return c.json({
      success: true,
      fromPlanetId,
      toPlanetId,
      missilesLaunched: missileCount,
      result,
    });
  } catch (error) {
    return c.json({ error: String(error) }, 400);
  }
});

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


// DEFENSE ENDPOINTS
app.post('/api/defense/build', async (c) => {
  try {
    const body = await c.req.json() as any;
    const { planetId, defenseType, count, shipyardLevel = 5, universeSpeed = 1 } = body;

    if (!planetId || !defenseType || !count) {
      return c.json({ error: 'planetId, defenseType, and count are required' }, 400);
    }

    // Get planet resources and tech levels from DB
    const DB = c.env.DB;
    const planet = await DB.prepare('SELECT * FROM planets WHERE id = ?').bind(planetId).first() as any;
    if (!planet) {
      return c.json({ error: 'Planet not found' }, 404);
    }

    const resources = {
      metal: planet.metal ?? 0,
      crystal: planet.crystal ?? 0,
      deuterium: planet.deuterium ?? 0,
    };

    const tech = {
      laserTech: planet.laser_tech ?? 0,
      energyTech: planet.energy_tech ?? 0,
      weaponTech: planet.weapon_tech ?? 0,
      shieldingTech: planet.shielding_tech ?? 0,
      ionTech: planet.ion_tech ?? 0,
      plasmaTech: planet.plasma_tech ?? 0,
      impulseDrive: planet.impulse_drive ?? 0,
      missileSilo: planet.missile_silo ?? 0,
    };

    const currentDefenses = planet.defenses_json
      ? JSON.parse(planet.defenses_json)
      : { rocketLauncher: 0, lightLaser: 0, heavyLaser: 0, gaussCannon: 0, ionCannon: 0, plasmaTurret: 0, smallShieldDome: 0, largeShieldDome: 0, antiBallisticMissile: 0, interplanetaryMissile: 0 };

    const order = buildDefense(
      planetId,
      defenseType,
      count,
      tech,
      currentDefenses,
      resources,
      shipyardLevel,
      universeSpeed,
    );

    // Persist updated resources
    await DB.prepare(
      'UPDATE planets SET metal = ?, crystal = ?, deuterium = ? WHERE id = ?'
    ).bind(resources.metal, resources.crystal, resources.deuterium, planetId).run();

    // Store queue order in KV
    const KV = c.env.KV;
    const queueKey = `defense_queue:${planetId}`;
    const existingQueue = await KV.get(queueKey, 'json') as any ?? createEmptyDefenseQueue();
    existingQueue.orders.push(order);
    await KV.put(queueKey, JSON.stringify(existingQueue));

    return c.json({ success: true, order });
  } catch (error) {
    return c.json({ error: String(error) }, 400);
  }
});
app.get('/api/defense/:planetId', async (c) => {
  const planetId = c.req.param('planetId');
  const DB = c.env.DB;

  try {
    const planet = await DB.prepare('SELECT defenses_json FROM planets WHERE id = ?').bind(planetId).first() as any;
    if (!planet) {
      return c.json({ error: 'Planet not found' }, 404);
    }

    const defenses = planet.defenses_json ? JSON.parse(planet.defenses_json) : {
      rocketLauncher: 0, lightLaser: 0, heavyLaser: 0, gaussCannon: 0, ionCannon: 0,
      plasmaTurret: 0, smallShieldDome: 0, largeShieldDome: 0,
      antiBallisticMissile: 0, interplanetaryMissile: 0,
    };

    return c.json({ planetId, defenses });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});
app.get('/api/defense/queue/:planetId', async (c) => {
  const planetId = c.req.param('planetId');
  const KV = c.env.KV;

  try {
    const queueKey = `defense_queue:${planetId}`;
    const queue = await KV.get(queueKey, 'json') as any ?? createEmptyDefenseQueue();

    const status = getDefenseBuildQueue(queue, Date.now());
    return c.json({ planetId, ...status });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

app.get('/api/notifications/unread-count/:playerId', async (c) => {
  const DB = c.env.DB;
  const playerId = c.req.param('playerId');

  try {
    const count = await getNotifUnreadCount(playerId, DB);
    return c.json({ unreadCount: count });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});
app.get('/api/notifications/preferences/:playerId', async (c) => {
  const DB = c.env.DB;
  const playerId = c.req.param('playerId');

  try {
    const prefs = await getNotifPreferences(playerId, DB);
    return c.json(prefs ?? getDefaultNotifPreferences(playerId));
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});
app.put('/api/notifications/preferences/:playerId', async (c) => {
  const DB = c.env.DB;
  const playerId = c.req.param('playerId');

  try {
    const body = await c.req.json();
    const prefs = await setNotifPreferences(playerId, body, DB);
    return c.json(prefs);
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});
app.post('/api/notifications/mark-read', async (c) => {
  const DB = c.env.DB;

  try {
    const body = await c.req.json() as { notificationId: string; playerId: string };
    if (!body.notificationId || !body.playerId) {
      return c.json({ error: 'notificationId and playerId are required' }, 400);
    }
    const result = await markNotifRead(body.notificationId, body.playerId, DB);
    return c.json({ updated: result });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});
app.post('/api/notifications/mark-all-read', async (c) => {
  const DB = c.env.DB;

  try {
    const body = await c.req.json() as { playerId: string };
    if (!body.playerId) {
      return c.json({ error: 'playerId is required' }, 400);
    }
    const count = await markAllNotifsRead(body.playerId, DB);
    return c.json({ updated: count });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});
app.get('/api/notifications/:playerId', async (c) => {
  const DB = c.env.DB;
  const playerId = c.req.param('playerId');

  try {
    const type = c.req.query('type') || undefined;
    const priority = c.req.query('priority') || undefined;
    const unreadParam = c.req.query('unread');
    const page = parseInt(c.req.query('page') ?? '1', 10);
    const limit = parseInt(c.req.query('limit') ?? '20', 10);

    const unread = unreadParam === 'true' ? true : unreadParam === 'false' ? false : undefined;

    const result = await getNotifications(playerId, DB, {
      type: type as any,
      priority: priority as any,
      unread,
      page,
      limit,
    });
app.delete('/api/notifications/:id', async (c) => {
  const DB = c.env.DB;
  const notificationId = c.req.param('id');
  const playerId = c.req.query('player_id');

  if (!playerId) {
    return c.json({ error: 'player_id query param required' }, 400);
  }

  try {
    const deleted = await deleteNotification(notificationId, playerId, DB);
    if (!deleted) {
      return c.json({ error: 'Notification not found' }, 404);
    }
    return c.json({ deleted: true });
=======
      playerId: string;
      planetId: string;
      queueType: 'building' | 'research';
      queueIndex: number;
    }>();

    const { playerId, planetId, queueType, queueIndex } = body;

    if (!playerId || !planetId || !queueType || queueIndex === undefined) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    const balance = await instantFinish(DB, playerId, planetId, queueType, queueIndex);

    return c.json({
      success: true,
      balance,
    });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

/**
 * POST /api/dm/merchant
 * Trade resources using the NPC merchant
 * Body: { playerId, planetId, offerResource, offerAmount, wantResource }
 */
app.post('/api/dm/merchant', async (c) => {
  const DB = c.env.DB;

  try {
    const body = await c.req.json<{
      playerId: string;
      planetId: string;
      offerResource: 'metal' | 'crystal' | 'deuterium';
      offerAmount: number;
      wantResource: 'metal' | 'crystal' | 'deuterium';
    }>();

    const { playerId, planetId, offerResource, offerAmount, wantResource } = body;

    if (!playerId || !planetId || !offerResource || offerAmount === undefined || !wantResource) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    const result = await merchantTrade(
      DB,
      playerId,
      planetId,
      offerResource,
      offerAmount,
      wantResource
    );

    return c.json({
      success: true,
      trade: result,
    });
>>>>>>> agent/wave3-7
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

<<<<<<< HEAD

// ============================================================================
// PLAYER PUBLIC PROFILE ROUTES
// ============================================================================

/**
 * GET /api/player/:id/profile
 * Get a player's full public profile.
 */
app.get('/api/player/:id/profile', async (c) => {
  const DB = c.env.DB;
  const playerId = c.req.param('id');

  try {
    const profile = await getPlayerPublicProfile(DB, playerId);
    if (!profile) {
      return c.json({ error: 'Player not found' }, 404);
    }
    return c.json(profile);
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

/**
 * GET /api/player/:id/activity
 * Get a player's recent public activity.
 * Query: ?limit=20
 */
app.get('/api/player/:id/activity', async (c) => {
  const DB = c.env.DB;
  const playerId = c.req.param('id');
  const limit = parseInt(c.req.query('limit') ?? '20', 10);

  try {
    const activity = await getRecentActivity(DB, playerId, limit);
    return c.json({ playerId, activity });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

/**
 * GET /api/player/:id/battles
 * Get paginated battle history for a player.
 * Query: ?limit=20&offset=0
 */
app.get('/api/player/:id/battles', async (c) => {
  const DB = c.env.DB;
  const playerId = c.req.param('id');
  const limit = parseInt(c.req.query('limit') ?? '20', 10);
  const offset = parseInt(c.req.query('offset') ?? '0', 10);

  try {
    const history = await getBattleHistory(DB, playerId, limit, offset);
    return c.json(history);
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});


app.get('/api/hall-of-fame', async (c) => {
  const { DB } = c.env;
  try {
    const entries = await getHallOfFame(DB);
    return c.json({ hallOfFame: entries });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

app.get('/api/hall-of-fame/:category', async (c) => {
  const { DB } = c.env;
  const category = c.req.param('category') as HallOfFameCategory;
  const limit = parseInt(c.req.query('limit') || '10');

  if (!HALL_OF_FAME_CATEGORIES.includes(category)) {
    return c.json({ error: `Invalid category. Valid: ${HALL_OF_FAME_CATEGORIES.join(', ')}` }, 400);
  }

  try {
    const [entry, history] = await Promise.all([
      getHallOfFameCategory(DB, category),
      getRecordHistory(DB, category, limit),
    ]);
    return c.json({ entry, history });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

app.post('/api/hall-of-fame/check', async (c) => {
  const { DB } = c.env;
  try {
    const body = await c.req.json<{ playerId: string; event: CheckAndUpdateEvent }>();
    if (!body.playerId || !body.event) {
      return c.json({ error: 'playerId and event are required' }, 400);
    }
    const newRecords = await checkAndUpdateRecords(DB, body.playerId, body.event);
    return c.json({ newRecords, count: newRecords.length });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

app.get('/api/hall-of-fame/player/:playerId', async (c) => {
  const { DB } = c.env;
  const playerId = c.req.param('playerId');
  try {
    const records = await getPlayerHallOfFameRecords(DB, playerId);
    return c.json({ records });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});


=======
>>>>>>> agent/wave3-7
app.post('/api/dm/instant-finish', async (c) => {
  const DB = c.env.DB;

  try {
    const body = await c.req.json<{
      playerId: string;
      planetId: string;
      queueType: 'building' | 'research';
      queueIndex: number;
    }>();

    const { playerId, planetId, queueType, queueIndex } = body;

    if (!playerId || !planetId || !queueType || queueIndex === undefined) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    const balance = await instantFinish(DB, playerId, planetId, queueType, queueIndex);

    return c.json({
      success: true,
      balance,
    });


app.get('/api/events/active', async (c) => {
  const DB = c.env.DB;
  try {
    const events = await getActiveEvents(DB);
    const modifiers = await getActiveModifiers(DB);
    return c.json({ events, modifiers, count: events.length });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

app.get('/api/events/upcoming', async (c) => {
  const DB = c.env.DB;
  try {
    const limit = parseInt(c.req.query('limit') ?? '20', 10);
    const events = await getUpcomingEvents(DB, limit);
    return c.json({ events, count: events.length });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

app.get('/api/events/history', async (c) => {
  const DB = c.env.DB;
  try {
    const limit = parseInt(c.req.query('limit') ?? '50', 10);
    const offset = parseInt(c.req.query('offset') ?? '0', 10);
    const events = await getEventHistory(DB, limit, offset);
    return c.json({ events, count: events.length, limit, offset });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

app.get('/api/events/:id', async (c) => {
  const DB = c.env.DB;
  const id = c.req.param('id');
  try {
    const event = await getEventById(id, DB);
    if (!event) {
      return c.json({ error: 'Event not found' }, 404);
    }
    return c.json(event);
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

app.post('/api/events/create', async (c) => {
  const DB = c.env.DB;
  try {
    const body = await c.req.json() as {
      name: string;
      description?: string;
      type: string;
      startTime: number;
      endTime: number;
      createdBy?: string;
    };

    if (!body.name || !body.type || !body.startTime || !body.endTime) {
      return c.json({ error: 'name, type, startTime, and endTime are required' }, 400);
    }

    const event = await createEvent(
      {
        name: body.name,
        description: body.description,
        type: body.type as any,
        startTime: body.startTime,
        endTime: body.endTime,
        createdBy: body.createdBy ?? 'admin',
      },
      DB
    );

    return c.json(event, 201);
  } catch (error) {
    const msg = String(error);
    if (msg.includes('Invalid event type') || msg.includes('endTime must')) {
      return c.json({ error: msg }, 400);
    }
    return c.json({ error: msg }, 500);
  }
});

app.delete('/api/events/:id', async (c) => {
  const DB = c.env.DB;
  const id = c.req.param('id');
  try {
    const deleted = await deleteEvent(id, DB);
    if (!deleted) {
      return c.json({ error: 'Event not found' }, 404);
    }
    return c.json({ deleted: true });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

app.post('/api/events/schedule-weekend', async (c) => {
  const DB = c.env.DB;
  try {
    const body = await c.req.json() as { type?: string };
    const event = await scheduleWeekendEvent(body.type as any, DB);
    return c.json(event, 201);
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

app.get('/api/events/check/:type', async (c) => {
  const DB = c.env.DB;
  const type = c.req.param('type');
  try {
    const active = await isEventTypeActive(type as any, DB);
    return c.json({ type, active });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});


app.get('/api/jumpgate/status/:moonId', async (c) => {
  const DB = c.env.DB;
  const moonId = c.req.param('moonId');

  try {
    const status = await getJumpGateStatus(moonId, DB);
    return c.json(status);
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

app.post('/api/jumpgate/teleport', async (c) => {
  const DB = c.env.DB;

  try {
    const body = await c.req.json() as {
      playerId: string;
      sourceMoonId: string;
      destinationMoonId: string;
      ships: Record<string, number>;
    };

    if (!body.playerId || !body.sourceMoonId || !body.destinationMoonId || !body.ships) {
      return c.json(
        { error: 'playerId, sourceMoonId, destinationMoonId, and ships are required' },
        400
      );
    }

    const result = await teleportFleet(
      {
        playerId: body.playerId,
        sourceMoonId: body.sourceMoonId,
        destinationMoonId: body.destinationMoonId,
        ships: body.ships as any,
      },
      DB
    );

    if (!result.success) {
      return c.json({ error: result.error }, 400);
    }

    return c.json(result);
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

app.get('/api/jumpgate/logs/:playerId', async (c) => {
  const DB = c.env.DB;
  const playerId = c.req.param('playerId');
  const limit = parseInt(c.req.query('limit') ?? '20', 10);

  try {
    const logs = await getJumpGateLogs(playerId, DB, limit);
    return c.json({ logs });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});


app.post('/api/acs/create', async (c) => {
  const DB = c.env.DB;

  try {
    const body = await c.req.json() as {
      playerId: string;
      planetId: string;
      ships: Record<string, number>;
      targetGalaxy: number;
      targetSystem: number;
      targetPosition: number;
      travelTime: number;
    };

    if (!body.playerId || !body.planetId || !body.ships || !body.targetGalaxy || !body.targetSystem || !body.targetPosition) {
      return c.json({ error: 'playerId, planetId, ships, targetGalaxy, targetSystem, and targetPosition are required' }, 400);
    }

    if (typeof body.travelTime !== 'number' || body.travelTime <= 0) {
      return c.json({ error: 'travelTime must be a positive number (seconds)' }, 400);
    }

    const result = await createACSAttack(
      body.playerId,
      body.planetId,
      body.ships as any,
      body.targetGalaxy,
      body.targetSystem,
      body.targetPosition,
      body.travelTime,
      DB,
    );
    return c.json(result);
  } catch (error) {
    const msg = String(error);
    if (msg.includes('not found') || msg.includes('must be in')) {
      return c.json({ error: msg }, 400);
    }
    return c.json({ error: msg }, 500);
  }
});

app.post('/api/acs/join/:acsId', async (c) => {
  const DB = c.env.DB;
  const acsId = c.req.param('acsId');

  try {
    const body = await c.req.json() as {
      playerId: string;
      planetId: string;
      ships: Record<string, number>;
      travelTime: number;
    };

    if (!body.playerId || !body.planetId || !body.ships) {
      return c.json({ error: 'playerId, planetId, and ships are required' }, 400);
    }

    if (typeof body.travelTime !== 'number' || body.travelTime <= 0) {
      return c.json({ error: 'travelTime must be a positive number (seconds)' }, 400);
    }

    const participant = await joinACSAttack(
      acsId,
      body.playerId,
      body.planetId,
      body.ships as any,
      body.travelTime,
      DB,
    );
    return c.json(participant);
  } catch (error) {
    const msg = String(error);
    if (msg.includes('not found') || msg.includes('not in') || msg.includes('full') || msg.includes('already') || msg.includes('must be')) {
      return c.json({ error: msg }, 400);
    }
    return c.json({ error: msg }, 500);
  }
});

app.get('/api/acs/status/:acsId', async (c) => {
  const DB = c.env.DB;
  const acsId = c.req.param('acsId');

  try {
    const status = await getACSStatus(acsId, DB);
    return c.json(status);
  } catch (error) {
    const msg = String(error);
    if (msg.includes('not found')) {
      return c.json({ error: msg }, 404);
    }
    return c.json({ error: msg }, 500);
  }
});

app.post('/api/acs/launch/:acsId', async (c) => {
  const DB = c.env.DB;
  const acsId = c.req.param('acsId');

  try {
    const body = await c.req.json() as { playerId: string };

    if (!body.playerId) {
      return c.json({ error: 'playerId is required' }, 400);
    }

    const result = await launchACSAttack(acsId, body.playerId, DB);
    return c.json(result);
  } catch (error) {
    const msg = String(error);
    if (msg.includes('not found') || msg.includes('Only the initiator') || msg.includes('not in gathering')) {
      return c.json({ error: msg }, 400);
    }
    return c.json({ error: msg }, 500);
  }
});

app.post('/api/acs/cancel/:acsId', async (c) => {
  const DB = c.env.DB;
  const acsId = c.req.param('acsId');

  try {
    const body = await c.req.json() as { playerId: string };

    if (!body.playerId) {
      return c.json({ error: 'playerId is required' }, 400);
    }

    await cancelACSAttack(acsId, body.playerId, DB);
    return c.json({ canceled: true });
  } catch (error) {
    const msg = String(error);
    if (msg.includes('not found') || msg.includes('Only the initiator') || msg.includes('only be canceled')) {
      return c.json({ error: msg }, 400);
    }
    return c.json({ error: msg }, 500);
  }
});

app.post('/api/acs/withdraw/:acsId', async (c) => {
  const DB = c.env.DB;
  const acsId = c.req.param('acsId');

  try {
    const body = await c.req.json() as { playerId: string };

    if (!body.playerId) {
      return c.json({ error: 'playerId is required' }, 400);
    }

    await withdrawFromACS(acsId, body.playerId, DB);
    return c.json({ withdrawn: true });
  } catch (error) {
    const msg = String(error);
    if (msg.includes('not found') || msg.includes('cannot withdraw') || msg.includes('Initiator') || msg.includes('not a participant')) {
      return c.json({ error: msg }, 400);
    }
    return c.json({ error: msg }, 500);
  }
});

app.get('/api/acs/player/:playerId', async (c) => {
  const DB = c.env.DB;
  const playerId = c.req.param('playerId');

  try {
    const attacks = await getPlayerACSAttacks(playerId, DB);
    return c.json(attacks);
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});


app.get('/api/h2m/metrics/:playerId', async (c) => {
  const DB = c.env.DB;
  const playerId = c.req.param('playerId');

  try {
    const metrics = await getH2MMetrics(DB, playerId);
    return c.json(metrics);
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

app.get('/api/h2m/overrides/:playerId', async (c) => {
  const DB = c.env.DB;
  const playerId = c.req.param('playerId');
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');

  try {
    const result = await DB.prepare(
      `SELECT * FROM override_analysis
       WHERE player_id = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`
    )
      .bind(playerId, limit, offset)
      .all();

    const overrides = (result.results || []).map((r: any) => ({
      id: r.id,
      planetId: r.planet_id,
      playerId: r.player_id,
      agentBuildId: r.agent_build_id,
      agentBuildingId: r.agent_building_id,
      agentLevel: r.agent_level,
      agentReason: r.agent_reason,
      manualBuildId: r.manual_build_id,
      manualBuildingId: r.manual_building_id,
      manualLevel: r.manual_level,
      timeDelta: r.time_delta,
      classification: r.classification,
      detectedAt: r.created_at,
    }));

    const countResult = await DB.prepare(
      `SELECT COUNT(*) as cnt FROM override_analysis WHERE player_id = ?`
    ).bind(playerId).first();

    return c.json({
      overrides,
      total: (countResult?.cnt as number) || 0,
      limit,
      offset,
    });

app.get('/api/h2m/strategy/:planetId', async (c) => {
  const DB = c.env.DB;
  const planetId = c.req.param('planetId');

  try {
    const planet = await DB.prepare(
      'SELECT strategy_id FROM planets WHERE id = ?'
    ).bind(planetId).first();

    if (!planet || !planet.strategy_id) {
      return c.json({ strategy: null, message: 'No strategy assigned' });
    }

    const strategy = await DB.prepare(
      'SELECT * FROM build_strategies WHERE id = ?'
    ).bind(planet.strategy_id).first();

    if (!strategy) {
      return c.json({ strategy: null, message: 'Strategy not found' });
    }

    // Get strategy history for this planet
    const history = await DB.prepare(
      `SELECT * FROM strategy_history
       WHERE planet_id = ?
       ORDER BY created_at DESC
       LIMIT 10`
    ).bind(planetId).all();

    return c.json({
      strategy: {
        id: strategy.id,
        playerId: strategy.player_id,
        name: strategy.name,
        steps: JSON.parse((strategy.steps as string) || '[]'),
      },
      history: (history.results || []).map((h: any) => ({
        id: h.id,
        source: h.source,
        overrideCount: h.override_count,
        adoptionRate: h.adoption_rate,
        changesSummary: h.changes_summary,
        createdAt: h.created_at,
      })),
    });

app.post('/api/h2m/learn/:playerId', async (c) => {
  const DB = c.env.DB;
  const playerId = c.req.param('playerId');

  try {
    // Get player's agent-enabled planets
    const planetsResult = await DB.prepare(
      'SELECT id FROM planets WHERE player_id = ? AND agent_enabled = 1'
    ).bind(playerId).all();
    const planetIds = ((planetsResult.results || []) as any[]).map((p: any) => p.id);

    if (planetIds.length === 0) {
      return c.json({ error: 'No agent-enabled planets for this player' }, 400);
    }

    // Detect overrides for each planet (last 30 days)
    const since = Math.floor(Date.now() / 1000) - 30 * 24 * 3600;
    let totalOverrides = 0;

    for (const planetId of planetIds) {
      const overrides = await detectOverrides(DB, planetId, since);
      const stored = await storeOverrides(DB, overrides);
      totalOverrides += stored;
    }

    // Generate improved strategy
    const newStrategy = await generateImprovedStrategy(DB, playerId);
    let strategiesApplied = 0;

    for (const planetId of planetIds) {
      const result = await applyLearnedStrategy(DB, planetId, newStrategy);
      if (result.applied) strategiesApplied++;
    }

    return c.json({
      playerId,
      overridesDetected: totalOverrides,
      strategiesApplied,
      newStrategy,
    });

app.get('/api/h2m/report/:playerId', async (c) => {
  const DB = c.env.DB;
  const playerId = c.req.param('playerId');

  try {
    const report = await generateH2MReport(DB, playerId);
    return c.json(report);
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

app.get('/api/h2m/adoption-rate/:playerId', async (c) => {
  const DB = c.env.DB;
  const playerId = c.req.param('playerId');
  const windowDays = parseInt(c.req.query('days') || '7');

  try {
    const rate = await getAdoptionRate(DB, playerId, windowDays);
    return c.json(rate);
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});


app.get('/api/universe/settings', async (c) => {
  const DB = c.env.DB;

  try {
    const settings = await universeSettingsService.getUniverseSettings(DB);
    return c.json({ settings });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

app.put('/api/universe/settings', async (c) => {
  const DB = c.env.DB;

  try {
    const body = await c.req.json();
    // TODO: Add admin authorization check here
    const updated = await universeSettingsService.updateUniverseSettings(DB, body);
    return c.json({ settings: updated });
  } catch (error) {
    return c.json({ error: String(error) }, 400);
  }
});

app.post('/api/universe/settings/reset', async (c) => {
  const DB = c.env.DB;

  try {
    // TODO: Add admin authorization check here
    const settings = await universeSettingsService.resetUniverseSettings(DB);
    return c.json({ settings });
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

// ============================================================================
// DAILY MISSIONS API
// ============================================================================

/**
 * GET /api/missions/daily/:playerId
 * Returns the player's 3 daily missions for today with progress.
 */
app.get('/api/missions/daily/:playerId', async (c) => {
  const DB = c.env.DB;
  const playerId = c.req.param('playerId');

  if (!playerId) {
    return c.json({ error: 'playerId required' }, 400);
  }

  try {
    const missions = await getDailyMissions(DB, playerId);
    return c.json({ playerId, dateKey: missions[0]?.dateKey, missions });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

/**
 * POST /api/missions/daily/:playerId/check/:missionId
 * Re-check progress for a specific mission.
 */
app.post('/api/missions/daily/:playerId/check/:missionId', async (c) => {
  const DB = c.env.DB;
  const playerId = c.req.param('playerId');
  const missionId = c.req.param('missionId');

  try {
    const mission = await checkMissionProgress(DB, playerId, missionId);
    if (!mission) {
      return c.json({ error: 'Mission not found' }, 404);
    }
    return c.json({ mission });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

/**
 * POST /api/missions/claim
 * Claim the reward for a completed daily mission.
 * Body: { playerId: string, missionId: string }
 */
app.post('/api/missions/claim', async (c) => {
  const DB = c.env.DB;

  let body: { playerId?: string; missionId?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { playerId, missionId } = body;
  if (!playerId || !missionId) {
    return c.json({ error: 'playerId and missionId required' }, 400);
  }

  try {
    const result = await claimMissionReward(DB, playerId, missionId);
    if (!result) {
      return c.json({ error: 'Mission not found or not yet completed, or already claimed' }, 400);
    }
    return c.json({ claimed: true, reward: result.reward, mission: result.mission });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

/**
 * POST /api/missions/reset
 * Admin/cron endpoint: reset all daily missions (midnight UTC).
 * Body: { adminKey?: string }  — optional guard
 */
app.post('/api/missions/reset', async (c) => {
  const DB = c.env.DB;

  try {
    const result = await resetDailyMissions(DB);
    return c.json({ ok: true, playersReset: result.reset });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

/**
 * GET /api/missions/definitions
 * Returns all mission type definitions (static config).
 */
app.get('/api/missions/definitions', (c) => {
  return c.json({ missions: DAILY_MISSIONS });
});
