/**
 * Unit tests for colonizationService.ts
 *
 * Tests pure helper functions and the ColonizationService class using
 * lightweight in-memory mocks for D1Database and DurableObjectNamespace.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  generatePlanetProperties,
  validateCoordinate,
  ColonizationService,
  MAX_PLANETS,
} from '../../worker/src/game/services/colonizationService';

// ============================================================================
// PURE HELPER TESTS
// ============================================================================

describe('generatePlanetProperties', () => {
  test('returns fields and temperature', () => {
    const props = generatePlanetProperties(7);
    expect(props).toHaveProperty('fields');
    expect(props).toHaveProperty('temperature');
  });

  test('fields are positive integers', () => {
    for (let pos = 1; pos <= 15; pos++) {
      const { fields } = generatePlanetProperties(pos);
      expect(fields).toBeGreaterThan(0);
      expect(Number.isInteger(fields)).toBe(true);
    }
  });

  test('temperature is an integer', () => {
    for (let pos = 1; pos <= 15; pos++) {
      const { temperature } = generatePlanetProperties(pos);
      expect(Number.isInteger(temperature)).toBe(true);
    }
  });

  test('inner positions (1-3) are hot', () => {
    for (let pos = 1; pos <= 3; pos++) {
      const { temperature } = generatePlanetProperties(pos);
      expect(temperature).toBeGreaterThanOrEqual(120);
    }
  });

  test('outer positions (13-15) are cold', () => {
    for (let pos = 13; pos <= 15; pos++) {
      const { temperature } = generatePlanetProperties(pos);
      expect(temperature).toBeLessThan(0);
    }
  });

  test('mid positions (4-6) have more fields than inner positions (1-3)', () => {
    // Run multiple trials since values are random — check average
    let midTotal = 0;
    let innerTotal = 0;
    const trials = 20;
    for (let t = 0; t < trials; t++) {
      midTotal += generatePlanetProperties(5).fields;
      innerTotal += generatePlanetProperties(1).fields;
    }
    expect(midTotal / trials).toBeGreaterThan(innerTotal / trials);
  });
});

describe('validateCoordinate', () => {
  test('valid coordinate returns null', () => {
    expect(validateCoordinate(1, 1, 1)).toBeNull();
    expect(validateCoordinate(9, 499, 15)).toBeNull();
    expect(validateCoordinate(3, 250, 8)).toBeNull();
  });

  test('galaxy < 1 is invalid', () => {
    const err = validateCoordinate(0, 1, 1);
    expect(err).not.toBeNull();
    expect(err).toContain('Galaxy');
  });

  test('galaxy > 9 is invalid', () => {
    const err = validateCoordinate(10, 1, 1);
    expect(err).not.toBeNull();
  });

  test('system < 1 is invalid', () => {
    const err = validateCoordinate(1, 0, 1);
    expect(err).not.toBeNull();
    expect(err).toContain('System');
  });

  test('system > 499 is invalid', () => {
    const err = validateCoordinate(1, 500, 1);
    expect(err).not.toBeNull();
  });

  test('position < 1 is invalid', () => {
    const err = validateCoordinate(1, 1, 0);
    expect(err).not.toBeNull();
    expect(err).toContain('Position');
  });

  test('position > 15 is invalid', () => {
    const err = validateCoordinate(1, 1, 16);
    expect(err).not.toBeNull();
  });
});

describe('MAX_PLANETS', () => {
  test('MAX_PLANETS equals 9', () => {
    expect(MAX_PLANETS).toBe(9);
  });
});

// ============================================================================
// MOCK HELPERS
// ============================================================================

type DbRow = Record<string, unknown>;

/**
 * Robust in-memory D1Database mock.
 *
 * Each call to `prepare(sql)` captures the SQL.
 * Calls to `bind(...args)` capture bindings.
 * `.first()`, `.all()`, `.run()` execute against the in-memory store.
 *
 * WHERE parsing: handles "col = ?" chains joined by AND.
 * The bindings array is consumed in order of conditions found.
 */
function createMockDb(store: DbRow[]) {
  function parseWhere(sql: string, bindings: unknown[]): (row: DbRow) => boolean {
    const whereMatch = sql.match(/WHERE\s+(.+?)(?:\s+ORDER\s+BY|\s+LIMIT|$)/is);
    if (!whereMatch) return () => true;

    // Split by AND
    const condStr = whereMatch[1].trim();
    const parts = condStr.split(/\s+AND\s+/i);
    let idx = 0;

    const predicates = parts.map((part) => {
      const m = part.match(/(\w+)\s*=\s*\?/);
      if (!m) return (_row: DbRow) => true;
      const col = m[1];
      const val = bindings[idx++];
      return (row: DbRow) => {
        // Use loose equality to handle number/string mismatches
        // eslint-disable-next-line eqeqeq
        return row[col] == val;
      };
    });

    return (row: DbRow) => predicates.every((p) => p(row));
  }

  function parseOrderBy(sql: string): string | null {
    const m = sql.match(/ORDER\s+BY\s+(\w+)/i);
    return m ? m[1] : null;
  }

  const prepare = (sql: string) => {
    const bindings: unknown[] = [];

    const stmt = {
      bind: (...args: unknown[]) => {
        bindings.push(...args);
        return stmt;
      },

      first: async <T = DbRow>(): Promise<T | null> => {
        // COUNT query
        if (/COUNT\(\*\)\s+AS\s+cnt/i.test(sql)) {
          const filter = parseWhere(sql, bindings);
          const cnt = store.filter(filter).length;
          return { cnt } as unknown as T;
        }

        const filter = parseWhere(sql, bindings);
        let rows = store.filter(filter);

        // Apply ORDER BY (sort ascending by column)
        const orderCol = parseOrderBy(sql);
        if (orderCol) {
          rows = [...rows].sort((a, b) => {
            const av = a[orderCol] as number;
            const bv = b[orderCol] as number;
            return av < bv ? -1 : av > bv ? 1 : 0;
          });
        }

        return (rows[0] as T) ?? null;
      },

      all: async <T = DbRow>() => {
        const filter = parseWhere(sql, bindings);
        let rows = store.filter(filter);

        const orderCol = parseOrderBy(sql);
        if (orderCol) {
          rows = [...rows].sort((a, b) => {
            const av = a[orderCol] as number;
            const bv = b[orderCol] as number;
            return av < bv ? -1 : av > bv ? 1 : 0;
          });
        }

        return { results: rows as T[] };
      },

      run: async () => {
        if (/^\s*INSERT/i.test(sql)) {
          // Extract column names from "INSERT INTO tbl (col1, col2, ...) VALUES"
          const colMatch = sql.match(/\(([^)]+)\)\s*VALUES/i);
          const cols = colMatch
            ? colMatch[1].split(',').map((c) => c.trim())
            : [];
          const row: DbRow = {};
          cols.forEach((col, i) => {
            row[col] = bindings[i];
          });
          store.push(row);
        } else if (/^\s*DELETE/i.test(sql)) {
          const filter = parseWhere(sql, bindings);
          const toRemove = store.filter(filter);
          toRemove.forEach((r) => {
            const idx = store.indexOf(r);
            if (idx !== -1) store.splice(idx, 1);
          });
        }
        return { success: true };
      },
    };

    return stmt;
  };

  return { prepare } as unknown as D1Database;
}

/**
 * Create a mock DurableObjectNamespace.
 *
 * `doResponses` maps URL paths to response bodies.
 * If a path is not listed, a generic 200 {} is returned.
 * `ok: false` in a response entry causes a 500 status.
 */
function createMockPlanetDO(
  doResponses: Record<string, { ok?: boolean; body?: unknown }> = {},
) {
  const stub = {
    fetch: async (req: Request) => {
      const url = new URL(req.url);
      const path = url.pathname;
      const response = doResponses[path];
      if (!response) {
        return new Response(JSON.stringify({}), { status: 200 });
      }
      return new Response(JSON.stringify(response.body ?? {}), {
        status: response.ok === false ? 500 : 200,
      });
    },
  };

  const ns = {
    idFromName: (_name: string) => ({ toString: () => _name }),
    get: (_id: unknown) => stub,
  };

  return ns as unknown as DurableObjectNamespace;
}

// ============================================================================
// ColonizationService — colonizePlanet
// ============================================================================

describe('ColonizationService.colonizePlanet', () => {
  let store: DbRow[];
  let db: D1Database;
  let planetDO: DurableObjectNamespace;
  let svc: ColonizationService;

  beforeEach(() => {
    // Pre-populate with homeworld so player has 1 planet
    store = [
      {
        id: 'planet-p1-homeworld',
        player_id: 'p1',
        name: 'Homeworld',
        galaxy: 1,
        system: 1,
        position: 6,
        temperature: 50,
        fields: 200,
        created_at: 1000,
      },
    ];
    db = createMockDb(store);

    planetDO = createMockPlanetDO({
      '/state': {
        body: { ships: { colonyShip: 1 } },
      },
      '/ships/deduct': { body: { ok: true } },
      '/initialize': { body: {} },
      '/fleet/add': { body: {} },
    });

    svc = new ColonizationService(db, planetDO);
  });

  test('successfully colonizes an empty slot', async () => {
    const result = await svc.colonizePlanet({
      playerId: 'p1',
      fromPlanetId: 'planet-p1-homeworld',
      galaxy: 2,
      system: 10,
      position: 8,
    });

    expect(result.success).toBe(true);
    expect(result.planetId).toBeDefined();
    expect(typeof result.planetId).toBe('string');
  });

  test('fails with invalid galaxy coordinate', async () => {
    const result = await svc.colonizePlanet({
      playerId: 'p1',
      fromPlanetId: 'planet-p1-homeworld',
      galaxy: 0, // invalid
      system: 10,
      position: 8,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Galaxy');
  });

  test('fails with invalid position (> 15)', async () => {
    const result = await svc.colonizePlanet({
      playerId: 'p1',
      fromPlanetId: 'planet-p1-homeworld',
      galaxy: 1,
      system: 10,
      position: 16,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Position');
  });

  test('fails when slot is already occupied', async () => {
    // Occupy the target slot
    store.push({
      id: 'planet-other',
      player_id: 'p2',
      name: 'Enemy Planet',
      galaxy: 3,
      system: 50,
      position: 7,
      temperature: 30,
      fields: 150,
      created_at: 999,
    });
    // Re-create service with updated store reference
    svc = new ColonizationService(createMockDb(store), planetDO);

    const result = await svc.colonizePlanet({
      playerId: 'p1',
      fromPlanetId: 'planet-p1-homeworld',
      galaxy: 3,
      system: 50,
      position: 7,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('already occupied');
  });

  test('fails when no Colony Ship at source planet', async () => {
    const doNoShip = createMockPlanetDO({
      '/state': { body: { ships: { colonyShip: 0 } } },
    });
    const svcNoShip = new ColonizationService(db, doNoShip);

    const result = await svcNoShip.colonizePlanet({
      playerId: 'p1',
      fromPlanetId: 'planet-p1-homeworld',
      galaxy: 2,
      system: 20,
      position: 5,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Colony Ship');
  });

  test('fails when player already owns MAX_PLANETS', async () => {
    // Fill up to MAX_PLANETS by adding MAX_PLANETS-1 more (store already has homeworld)
    for (let i = 1; i < MAX_PLANETS; i++) {
      store.push({
        id: `planet-p1-col${i}`,
        player_id: 'p1',
        name: `Colony ${i}`,
        galaxy: 2,
        system: i,
        position: 8,
        temperature: 30,
        fields: 160,
        created_at: 1000 + i,
      });
    }
    // Re-create svc with updated store
    svc = new ColonizationService(createMockDb(store), planetDO);

    const result = await svc.colonizePlanet({
      playerId: 'p1',
      fromPlanetId: 'planet-p1-homeworld',
      galaxy: 9,
      system: 499,
      position: 1,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Max planet limit');
  });

  test('new planet is inserted into D1 store', async () => {
    const prevCount = store.length;

    await svc.colonizePlanet({
      playerId: 'p1',
      fromPlanetId: 'planet-p1-homeworld',
      galaxy: 4,
      system: 100,
      position: 9,
    });

    expect(store.length).toBe(prevCount + 1);
    const newPlanet = store[store.length - 1];
    expect(newPlanet.player_id).toBe('p1');
    expect(Number(newPlanet.galaxy)).toBe(4);
    expect(Number(newPlanet.system)).toBe(100);
    expect(Number(newPlanet.position)).toBe(9);
  });
});

// ============================================================================
// ColonizationService — abandonPlanet
// ============================================================================

describe('ColonizationService.abandonPlanet', () => {
  let store: DbRow[];
  let svc: ColonizationService;
  let planetDO: DurableObjectNamespace;

  beforeEach(() => {
    store = [
      {
        id: 'hw-p1',
        player_id: 'p1',
        name: 'Homeworld',
        galaxy: 1,
        system: 1,
        position: 6,
        temperature: 50,
        fields: 200,
        created_at: 1000,
      },
      {
        id: 'col-p1',
        player_id: 'p1',
        name: 'Colony 1',
        galaxy: 2,
        system: 10,
        position: 8,
        temperature: 30,
        fields: 180,
        created_at: 2000,
      },
    ];

    planetDO = createMockPlanetDO({
      '/state': { body: { ships: { lightFighter: 5, colonyShip: 0 } } },
      '/fleet/add': { body: {} },
      '/destroy': { body: {} },
    });

    svc = new ColonizationService(createMockDb(store), planetDO);
  });

  test('successfully abandons a colony', async () => {
    const result = await svc.abandonPlanet('p1', 'col-p1');
    expect(result.success).toBe(true);
    expect(store.find((r) => r.id === 'col-p1')).toBeUndefined();
  });

  test('homeworld remains after abandoning colony', async () => {
    await svc.abandonPlanet('p1', 'col-p1');
    expect(store.find((r) => r.id === 'hw-p1')).toBeDefined();
  });

  test('cannot abandon homeworld', async () => {
    const result = await svc.abandonPlanet('p1', 'hw-p1');
    expect(result.success).toBe(false);
    expect(result.error).toContain('homeworld');
  });

  test('fails when planet does not exist', async () => {
    const result = await svc.abandonPlanet('p1', 'nonexistent');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  test('fails when player does not own planet (ownership mismatch)', async () => {
    // p2 tries to abandon p1's colony — first we verify the planet exists but belongs to p1
    const result = await svc.abandonPlanet('p2', 'col-p1');
    expect(result.success).toBe(false);
    // Acceptable to get either 'not found' or 'do not own'
    expect(result.error).toBeDefined();
  });
});

// ============================================================================
// ColonizationService — getPlayerPlanets
// ============================================================================

describe('ColonizationService.getPlayerPlanets', () => {
  let store: DbRow[];
  let svc: ColonizationService;

  beforeEach(() => {
    store = [
      {
        id: 'hw-p1',
        player_id: 'p1',
        name: 'Homeworld',
        galaxy: 1,
        system: 1,
        position: 6,
        temperature: 50,
        fields: 200,
        created_at: 1000,
      },
      {
        id: 'col-p1-a',
        player_id: 'p1',
        name: 'Colony A',
        galaxy: 2,
        system: 10,
        position: 8,
        temperature: 30,
        fields: 180,
        created_at: 2000,
      },
      {
        id: 'col-p1-b',
        player_id: 'p1',
        name: 'Colony B',
        galaxy: 3,
        system: 20,
        position: 4,
        temperature: 80,
        fields: 220,
        created_at: 3000,
      },
      // Unrelated player
      {
        id: 'hw-p2',
        player_id: 'p2',
        name: 'P2 Homeworld',
        galaxy: 1,
        system: 5,
        position: 6,
        temperature: 50,
        fields: 200,
        created_at: 1500,
      },
    ];

    svc = new ColonizationService(createMockDb(store), createMockPlanetDO());
  });

  test('returns all planets for the player', async () => {
    const planets = await svc.getPlayerPlanets('p1');
    expect(planets.length).toBe(3);
  });

  test('does not include other players planets', async () => {
    const planets = await svc.getPlayerPlanets('p1');
    expect(planets.every((p) => p.id !== 'hw-p2')).toBe(true);
  });

  test('first planet is marked as homeworld', async () => {
    const planets = await svc.getPlayerPlanets('p1');
    expect(planets[0].isHomeworld).toBe(true);
  });

  test('subsequent planets are not marked as homeworld', async () => {
    const planets = await svc.getPlayerPlanets('p1');
    for (let i = 1; i < planets.length; i++) {
      expect(planets[i].isHomeworld).toBe(false);
    }
  });

  test('returns empty array for unknown player', async () => {
    const planets = await svc.getPlayerPlanets('nobody');
    expect(planets).toEqual([]);
  });

  test('planet objects have correct shape', async () => {
    const planets = await svc.getPlayerPlanets('p1');
    const planet = planets[0];
    expect(planet).toHaveProperty('id');
    expect(planet).toHaveProperty('name');
    expect(planet).toHaveProperty('galaxy');
    expect(planet).toHaveProperty('system');
    expect(planet).toHaveProperty('position');
    expect(planet).toHaveProperty('temperature');
    expect(planet).toHaveProperty('fields');
    expect(planet).toHaveProperty('isHomeworld');
    expect(planet).toHaveProperty('createdAt');
  });

  test('returns only p2 planet for p2', async () => {
    const planets = await svc.getPlayerPlanets('p2');
    expect(planets.length).toBe(1);
    expect(planets[0].id).toBe('hw-p2');
    expect(planets[0].isHomeworld).toBe(true);
  });
});
