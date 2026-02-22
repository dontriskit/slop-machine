import { Hono } from 'hono';
import { checkBuildingPrerequisites, BUILDING_ID_TO_KEY } from '../game/prerequisites';
import { canBuildShip, SHIP_REQUIREMENTS } from '../game/services/shipyardService';
import { processFleetMissions } from '../game/services/missionProcessorService';
import type { TechLevels, BuildingLevels } from '../game/types';

/**
 * MVP Routes — P0 blockers that make the game actually playable
 *
 * 1. Player Registration  POST /api/players/register
 * 2. Player Login         POST /api/players/login
 * 3. Building Prerequisites (validation middleware for existing /api/planet/:id/queue)
 */

type Bindings = {
  PLANET_DO: DurableObjectNamespace;
  DB: D1Database;
  KV: KVNamespace;
  R2: R2Bucket;
  AI: any;
  SOLANA_RPC_URL: string;
  SOLANA_NETWORK: string;
  MINT_AUTHORITY_KEY: string;
  MERKLE_TREE_ADDRESS: string;
};

const mvpRoutes = new Hono<{ Bindings: Bindings }>();

// ============================================================================
// HELPER: get Durable Object stub from planet ID
// ============================================================================

function getPlanetStub(PLANET_DO: DurableObjectNamespace, planetId: string) {
  const id = PLANET_DO.idFromName(planetId);
  return PLANET_DO.get(id);
}

// ============================================================================
// PLAYER REGISTRATION
// ============================================================================

/**
 * POST /api/players/register
 * Register a new player account and assign a homeworld planet.
 *
 * Body: { name: string }
 * Returns: { player_id, planet_id, coordinates: { galaxy, system, position } }
 *
 * Algorithm:
 *   1. Validate unique name
 *   2. Generate UUID for player_id and planet_id
 *   3. Find empty planet slot (check planets table for unused coords in galaxy 1)
 *   4. INSERT into players + planets
 *   5. Call PlanetDO to initialize starting state (500 metal, 500 crystal, 0 deut)
 *   6. Create initial fleet record with zero ships
 */
mvpRoutes.post('/api/players/register', async (c) => {
  const DB = c.env.DB;
  const PLANET_DO = c.env.PLANET_DO;

  let body: { name?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const name = body.name?.trim();
  if (!name || name.length < 2 || name.length > 30) {
    return c.json({ error: 'Name must be 2-30 characters' }, 400);
  }

  // Check name is alphanumeric + spaces/underscores
  if (!/^[a-zA-Z0-9_ ]+$/.test(name)) {
    return c.json({ error: 'Name can only contain letters, numbers, spaces, and underscores' }, 400);
  }

  try {
    // Check if name already exists
    const existing = await DB.prepare(
      'SELECT id FROM players WHERE name = ?',
    ).bind(name).first();

    if (existing) {
      return c.json({ error: 'Player name already taken' }, 409);
    }

    // Generate IDs
    const playerId = `player-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const planetId = `planet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Find empty planet slot in galaxy 1
    // Get all occupied positions in galaxy 1
    const occupiedResult = await DB.prepare(
      `SELECT galaxy, system, position FROM planets WHERE galaxy = 1`,
    ).all();

    const occupied = new Set<string>();
    for (const row of occupiedResult.results || []) {
      occupied.add(`${row.galaxy}:${row.system}:${row.position}`);
    }

    // Find an empty slot: prefer middle positions (4-12), random system
    let coords: { galaxy: number; system: number; position: number } | null = null;

    // Attempt 1: middle positions (4-12)
    for (let attempt = 0; attempt < 200; attempt++) {
      const system = Math.floor(Math.random() * 499) + 1;
      const position = Math.floor(Math.random() * 9) + 4; // 4-12
      const key = `1:${system}:${position}`;
      if (!occupied.has(key)) {
        coords = { galaxy: 1, system, position };
        break;
      }
    }

    // Attempt 2: any position (1-15)
    if (!coords) {
      for (let attempt = 0; attempt < 200; attempt++) {
        const system = Math.floor(Math.random() * 499) + 1;
        const position = Math.floor(Math.random() * 15) + 1; // 1-15
        const key = `1:${system}:${position}`;
        if (!occupied.has(key)) {
          coords = { galaxy: 1, system, position };
          break;
        }
      }
    }

    if (!coords) {
      return c.json({ error: 'No available planet slots in galaxy 1' }, 503);
    }

    const nowSeconds = Math.floor(Date.now() / 1000);

    // Insert player
    await DB.prepare(
      'INSERT INTO players (id, name, created_at) VALUES (?, ?, ?)',
    ).bind(playerId, name, nowSeconds).run();

    // Insert planet
    const temperature = 20 + Math.floor(Math.random() * 40); // 20-60
    await DB.prepare(
      `INSERT INTO planets (id, player_id, name, galaxy, system, position, planet_type, temperature, fields, universe_speed, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      planetId, playerId, 'Homeworld',
      coords.galaxy, coords.system, coords.position,
      'planet', temperature, 163, 1, nowSeconds,
    ).run();

    // Create initial fleet record (all zeros)
    const fleetId = `fleet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await DB.prepare(
      `INSERT INTO fleets (id, planet_id, player_id, updated_at) VALUES (?, ?, ?, ?)`,
    ).bind(fleetId, planetId, playerId, nowSeconds).run();

    // Initialize PlanetDO with starting resources
    const stub = getPlanetStub(PLANET_DO, planetId);
    await stub.fetch(new Request('https://planet/initialize', {
      method: 'POST',
      body: JSON.stringify({
        planetId,
        playerId,
        coordinate: coords,
        temperature,
        universeSpeed: 1,
        resources: { metal: 500, crystal: 500, deuterium: 0 },
      }),
    }));

    return c.json({
      player_id: playerId,
      planet_id: planetId,
      coordinates: coords,
    }, 201);
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

// ============================================================================
// PLAYER LOGIN
// ============================================================================

/**
 * POST /api/players/login
 * Look up player by name, return player_id and list of planets.
 *
 * Body: { name: string }
 * Returns: { player_id, planets: [{ id, name, galaxy, system, position }] }
 */
mvpRoutes.post('/api/players/login', async (c) => {
  const DB = c.env.DB;

  let body: { name?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const name = body.name?.trim();
  if (!name) {
    return c.json({ error: 'Name is required' }, 400);
  }

  try {
    // Look up player by name
    const player = await DB.prepare(
      'SELECT id, name, created_at FROM players WHERE name = ?',
    ).bind(name).first() as any;

    if (!player) {
      return c.json({ error: 'Player not found' }, 404);
    }

    // Get all planets for this player
    const planetsResult = await DB.prepare(
      `SELECT id, name, galaxy, system, position, planet_type, temperature, fields
       FROM planets WHERE player_id = ? ORDER BY created_at ASC`,
    ).bind(player.id).all();

    const planets = (planetsResult.results || []).map((row: any) => ({
      id: row.id,
      name: row.name,
      galaxy: row.galaxy,
      system: row.system,
      position: row.position,
      planet_type: row.planet_type,
      temperature: row.temperature,
      fields: row.fields,
    }));

    return c.json({
      player_id: player.id,
      name: player.name,
      planets,
    });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

// ============================================================================
// BUILDING QUEUE WITH PREREQUISITE VALIDATION
// ============================================================================

/**
 * POST /api/planet/:id/queue/validated
 * Add building to queue WITH prerequisite checking.
 * This is the MVP version of /api/planet/:id/queue that also validates prerequisites.
 *
 * Body: { buildingId: number, targetLevel: number }
 */
mvpRoutes.post('/api/planet/:id/queue/validated', async (c) => {
  const planetId = c.req.param('id');
  const PLANET_DO = c.env.PLANET_DO;
  const DB = c.env.DB;

  let body: { buildingId?: number; targetLevel?: number };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { buildingId, targetLevel } = body;
  if (buildingId === undefined || targetLevel === undefined) {
    return c.json({ error: 'buildingId and targetLevel are required' }, 400);
  }

  // Validate building ID
  const buildingKey = BUILDING_ID_TO_KEY[buildingId];
  if (!buildingKey) {
    return c.json({ error: `Unknown building ID: ${buildingId}` }, 400);
  }

  try {
    // Get current planet state (buildings)
    const stub = getPlanetStub(PLANET_DO, planetId);
    const stateRes = await stub.fetch(new Request('https://planet/state'));
    if (!stateRes.ok) {
      return c.json({ error: 'Could not get planet state' }, 500);
    }
    const state = await stateRes.json() as any;

    // Get tech levels (stored in DO state or default to zero)
    const techLevels: TechLevels = state.techLevels || {
      energyTech: 0, laserTech: 0, ionTech: 0, hyperspaceTech: 0,
      plasmaTech: 0, combustionDrive: 0, impulseDrive: 0, hyperspaceDrive: 0,
      espionageTech: 0, computerTech: 0, astrophysics: 0,
      weaponTech: 0, shieldingTech: 0, armorTech: 0, gravitonTech: 0,
    };

    // Check prerequisites
    const prereqCheck = checkBuildingPrerequisites(buildingKey, state.buildings, techLevels);
    if (!prereqCheck.met) {
      return c.json({
        error: 'Prerequisites not met',
        missing: prereqCheck.missing,
      }, 400);
    }

    // Delegate to PlanetDO queue/add handler
    const response = await stub.fetch(new Request('https://planet/queue/add', {
      method: 'POST',
      body: JSON.stringify({ buildingId, targetLevel }),
    }));

    if (!response.ok) {
      const errText = await response.text();
      return c.json({ error: errText }, response.status as any);
    }

    const result = await response.json() as any;

    // Log to build_history
    if (result.queueItem) {
      await DB.prepare(
        `INSERT INTO build_history (id, planet_id, building_id, level, source, ai_reason, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          `${planetId}-${Date.now()}`,
          planetId,
          result.queueItem.buildingId,
          result.queueItem.targetLevel,
          'manual',
          'Manual build queue (validated)',
          Math.floor(Date.now() / 1000),
        )
        .run();
    }

    return c.json(result);
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

// ============================================================================
// SHIP BUILD WITH PREREQUISITE VALIDATION
// ============================================================================

/**
 * POST /api/planet/:id/ships/build/validated
 * Build ships with full prerequisite validation.
 * Checks shipyard level >= 1 + tech prerequisites per ship type.
 *
 * Body: { shipType: string, count: number }
 */
mvpRoutes.post('/api/planet/:id/ships/build/validated', async (c) => {
  const planetId = c.req.param('id');
  const PLANET_DO = c.env.PLANET_DO;

  let body: { shipType?: string; count?: number };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { shipType, count } = body;
  if (!shipType || !count || count <= 0) {
    return c.json({ error: 'shipType and count (> 0) are required' }, 400);
  }

  try {
    // Get planet state
    const stub = getPlanetStub(PLANET_DO, planetId);
    const stateRes = await stub.fetch(new Request('https://planet/state'));
    if (!stateRes.ok) {
      return c.json({ error: 'Could not get planet state' }, 500);
    }
    const state = await stateRes.json() as any;
    const buildings: BuildingLevels = state.buildings;
    const techLevels: TechLevels = state.techLevels || {
      energyTech: 0, laserTech: 0, ionTech: 0, hyperspaceTech: 0,
      plasmaTech: 0, combustionDrive: 0, impulseDrive: 0, hyperspaceDrive: 0,
      espionageTech: 0, computerTech: 0, astrophysics: 0,
      weaponTech: 0, shieldingTech: 0, armorTech: 0, gravitonTech: 0,
    };

    // Check shipyard level >= 1
    if ((buildings.shipyard ?? 0) < 1) {
      return c.json({ error: 'Shipyard level >= 1 required to build ships' }, 400);
    }

    // Check ship prerequisites
    const req = SHIP_REQUIREMENTS[shipType as keyof typeof SHIP_REQUIREMENTS];
    if (!req) {
      return c.json({ error: `Unknown ship type: ${shipType}` }, 400);
    }

    if ((buildings.shipyard ?? 0) < req.shipyard) {
      return c.json({
        error: `Shipyard level ${req.shipyard} required for ${shipType} (current: ${buildings.shipyard ?? 0})`,
      }, 400);
    }

    // Check tech prerequisites
    const missingTechs: string[] = [];
    for (const [techKey, reqLevel] of Object.entries(req.techs)) {
      const currentLevel = techLevels[techKey as keyof TechLevels] ?? 0;
      if (currentLevel < (reqLevel as number)) {
        missingTechs.push(`${techKey} level ${reqLevel} required (current: ${currentLevel})`);
      }
    }

    if (missingTechs.length > 0) {
      return c.json({
        error: 'Tech prerequisites not met',
        missing: missingTechs,
      }, 400);
    }

    // Delegate to PlanetDO
    const response = await stub.fetch(
      new Request('https://planet/ships/build', {
        method: 'POST',
        body: JSON.stringify({ shipType, count }),
      }),
    );

    if (!response.ok) {
      return new Response(response.body, {
        status: response.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return c.json(await response.json());
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

// ============================================================================
// DEFENSE BUILD WITH PREREQUISITE VALIDATION
// ============================================================================

/**
 * POST /api/planet/:id/defense/build/validated
 * Build defense units with shipyard level check.
 * Requires shipyard level >= 1.
 *
 * Body: { defenseType: string, count: number }
 */
mvpRoutes.post('/api/planet/:id/defense/build/validated', async (c) => {
  const planetId = c.req.param('id');
  const PLANET_DO = c.env.PLANET_DO;

  let body: { defenseType?: string; count?: number };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { defenseType, count } = body;
  if (!defenseType || !count || count <= 0) {
    return c.json({ error: 'defenseType and count (> 0) are required' }, 400);
  }

  try {
    // Get planet state to check shipyard level
    const stub = getPlanetStub(PLANET_DO, planetId);
    const stateRes = await stub.fetch(new Request('https://planet/state'));
    if (!stateRes.ok) {
      return c.json({ error: 'Could not get planet state' }, 500);
    }
    const state = await stateRes.json() as any;

    if ((state.buildings?.shipyard ?? 0) < 1) {
      return c.json({ error: 'Shipyard level >= 1 required to build defenses' }, 400);
    }

    // For the actual defense build, delegate to the existing defense build endpoint
    // by returning a validation-passed response, then the caller can use the normal build flow
    return c.json({
      validated: true,
      shipyardLevel: state.buildings.shipyard,
      defenseType,
      count,
    });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

export { mvpRoutes, processFleetMissions };
