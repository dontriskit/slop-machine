import { Hono } from 'hono';
import { PlanetDO } from './durable-objects/PlanetDO';
import { runBuildOrderAgent, runAgentForAllPlanets } from './agents/buildOrderAgent';
import { Coordinate, Strategy, PlanetState } from './game/types';
import { GalaxyService } from './game/services/galaxyService';
import { fleetService } from './game/services/fleetService';
import {
  sendMessage,
  getInbox,
  getOutbox,
  getMessage,
  deleteMessage,
  getUnreadCount,
  markAllRead,
} from './game/services/messageService';

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
// CORS MIDDLEWARE
// ============================================================================

app.use('*', async (c, next) => {
  c.header('Access-Control-Allow-Origin', '*');
  c.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Content-Type');
  if (c.req.method === 'OPTIONS') return c.text('', 204);
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
      return c.json({ error: await response.text() }, response.status);
    }

    const result = await response.json();

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
      return c.json({ error: await response.text() }, response.status);
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
    const decision = await runBuildOrderAgent(planetState, strategy, AI, {
      planetId,
      playerId: planetState.playerId,
      coordinate: planetState.coordinate,
      timestamp: Date.now(),
    });

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
// MESSAGE ENDPOINTS
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
export default {
  async fetch(request: Request, env: Bindings): Promise<Response> {
    return app.fetch(request, env);
  },

  async scheduled(event: ScheduledEvent, env: Bindings): Promise<void> {
    await handleScheduled(event, env);
  },
};
