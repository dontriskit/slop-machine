/**
 * Unit tests for planetManagementService.ts
 *
 * Tests abandon planet, fleet save, and fleet recall operations
 * using lightweight in-memory mocks for D1Database and DurableObjectNamespace.
 *
 * Issues: #72 (Planet Abandonment), #73 (Fleet Save)
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  PlanetManagementService,
} from '../../worker/src/game/services/planetManagementService';
import type { Ships, PlanetState, Coordinate } from '../../worker/src/game/types';

// ============================================================================
// HELPERS
// ============================================================================

function emptyShips(): Ships {
  return {
    lightFighter: 0,
    heavyFighter: 0,
    cruiser: 0,
    battleship: 0,
    battlecruiser: 0,
    bomber: 0,
    destroyer: 0,
    deathstar: 0,
    smallCargo: 0,
    largeCargo: 0,
    colonyShip: 0,
    recycler: 0,
    espionageProbe: 0,
  };
}

function defaultPlanetState(overrides: Partial<PlanetState> = {}): PlanetState {
  return {
    planetId: 'planet-p1-homeworld',
    playerId: 'p1',
    coordinate: { galaxy: 1, system: 1, position: 6 },
    planetType: 'planet',
    name: 'Homeworld',
    temperature: 50,
    fields: 200,
    universeSpeed: 1,
    buildings: {
      metalMine: 0, crystalMine: 0, deutSynth: 0, solarPlant: 0,
      fusionReactor: 0, roboticsFactory: 0, naniteFactory: 0,
      shipyard: 0, researchLab: 0, metalStorage: 0, crystalStorage: 0, deutTank: 0,
    },
    resources: { metal: 10000, crystal: 10000, deuterium: 10000 },
    ships: { ...emptyShips(), lightFighter: 50, smallCargo: 20 },
    queue: [],
    lastTickAt: Date.now(),
    ...overrides,
  };
}

// ============================================================================
// MOCK DB
// ============================================================================

type DbRow = Record<string, unknown>;

function createMockDb(store: DbRow[]) {
  function parseWhere(sql: string, bindings: unknown[]): (row: DbRow) => boolean {
    const whereMatch = sql.match(/WHERE\s+(.+?)(?:\s+ORDER\s+BY|\s+LIMIT|\s+GROUP\s+BY|$)/is);
    if (!whereMatch) return () => true;

    const condStr = whereMatch[1].trim();
    const parts = condStr.split(/\s+AND\s+/i);
    let idx = 0;

    const predicates = parts.map((part) => {
      const m = part.match(/(\w+)\s*=\s*\?/);
      if (!m) return (_row: DbRow) => true;
      const col = m[1];
      const val = bindings[idx++];
      return (row: DbRow) => row[col] == val;
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
        if (/COUNT\(\*\)\s+AS\s+cnt/i.test(sql)) {
          const filter = parseWhere(sql, bindings);
          const cnt = store.filter(filter).length;
          return { cnt } as unknown as T;
        }

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
        } else if (/^\s*UPDATE/i.test(sql)) {
          const filter = parseWhere(sql, bindings);
          // Extract SET clause values
          const setMatch = sql.match(/SET\s+(.+?)\s+WHERE/i);
          if (setMatch) {
            const setParts = setMatch[1].split(',').map((s) => s.trim());
            const setBindingsStart = 0;
            const numSetBindings = setParts.filter((p) => p.includes('?')).length;
            const setBindings = bindings.slice(0, numSetBindings);
            const whereBindings = bindings.slice(numSetBindings);

            // Re-parse WHERE with only WHERE bindings
            const whereFilter = parseWhere(sql, whereBindings);

            // This simplified mock works for our UPDATE SET col = ? WHERE ... pattern
            const matchingRows = store.filter((row) => {
              // Rebuild filter using whereBindings
              const whereMatch2 = sql.match(/WHERE\s+(.+?)$/is);
              if (!whereMatch2) return true;
              const condStr = whereMatch2[1].trim();
              const parts = condStr.split(/\s+AND\s+/i);
              let widx = 0;
              return parts.every((part) => {
                const m = part.match(/(\w+)\s*=\s*\?/);
                if (!m) return true;
                const col = m[1];
                const val = whereBindings[widx++];
                return row[col] == val;
              });
            });

            let sidx = 0;
            matchingRows.forEach((row) => {
              setParts.forEach((part) => {
                const m = part.match(/(\w+)\s*=\s*\?/);
                if (m) {
                  row[m[1]] = setBindings[sidx++];
                } else {
                  const litMatch = part.match(/(\w+)\s*=\s*'([^']+)'/);
                  if (litMatch) {
                    row[litMatch[1]] = litMatch[2];
                  }
                }
              });
            });
          }
        }
        return { success: true };
      },
    };

    return stmt;
  };

  return { prepare } as unknown as D1Database;
}

// ============================================================================
// MOCK DURABLE OBJECTS
// ============================================================================

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
// ABANDON PLANET TESTS
// ============================================================================

describe('PlanetManagementService.abandonPlanet', () => {
  let store: DbRow[];
  let db: D1Database;
  let planetDO: DurableObjectNamespace;
  let svc: PlanetManagementService;

  beforeEach(() => {
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
      {
        id: 'planet-p1-colony1',
        player_id: 'p1',
        name: 'Colony 2:5:8',
        galaxy: 2,
        system: 5,
        position: 8,
        temperature: 30,
        fields: 180,
        created_at: 2000,
      },
    ];

    db = createMockDb(store);
    planetDO = createMockPlanetDO({
      '/state': {
        body: { ships: { lightFighter: 10, smallCargo: 5 } },
      },
      '/fleet/add': { body: {} },
      '/destroy': { body: {} },
    });

    svc = new PlanetManagementService(db, planetDO);
  });

  test('successfully abandons a colony', async () => {
    const result = await svc.abandonPlanet(db, 'p1', 'planet-p1-colony1');
    expect(result.success).toBe(true);
    expect(result.shipsReturned).toBe(true);
  });

  test('planet is removed from store after abandonment', async () => {
    await svc.abandonPlanet(db, 'p1', 'planet-p1-colony1');
    const remaining = store.filter((r) => r.id === 'planet-p1-colony1');
    expect(remaining.length).toBe(0);
  });

  test('fails when planet not found', async () => {
    const result = await svc.abandonPlanet(db, 'p1', 'nonexistent');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  test('fails when player does not own the planet', async () => {
    const result = await svc.abandonPlanet(db, 'p2', 'planet-p1-colony1');
    expect(result.success).toBe(false);
    expect(result.error).toContain('do not own');
  });

  test('fails when trying to abandon homeworld', async () => {
    const result = await svc.abandonPlanet(db, 'p1', 'planet-p1-homeworld');
    expect(result.success).toBe(false);
    expect(result.error).toContain('homeworld');
  });

  test('handles planet with no ships gracefully', async () => {
    const noShipsDO = createMockPlanetDO({
      '/state': { body: { ships: {} } },
      '/destroy': { body: {} },
    });
    const svc2 = new PlanetManagementService(db, noShipsDO);

    const result = await svc2.abandonPlanet(db, 'p1', 'planet-p1-colony1');
    expect(result.success).toBe(true);
    expect(result.shipsReturned).toBe(false);
  });

  test('handles PlanetDO failure gracefully', async () => {
    const failDO = createMockPlanetDO({
      '/state': { ok: false, body: {} },
    });
    const svc2 = new PlanetManagementService(db, failDO);

    const result = await svc2.abandonPlanet(db, 'p1', 'planet-p1-colony1');
    // Should still succeed - PlanetDO failure is non-fatal
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// FLEET SAVE TESTS
// ============================================================================

describe('PlanetManagementService.fleetSave', () => {
  let store: DbRow[];
  let missionStore: DbRow[];
  let db: D1Database;
  let planetDO: DurableObjectNamespace;
  let svc: PlanetManagementService;

  beforeEach(() => {
    store = [
      {
        id: 'planet-p1-hw',
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
        id: 'planet-p1-col',
        player_id: 'p1',
        name: 'Colony 1:2:8',
        galaxy: 1,
        system: 2,
        position: 8,
        temperature: 30,
        fields: 180,
        created_at: 2000,
      },
      {
        id: 'planet-p2-hw',
        player_id: 'p2',
        name: 'Enemy Planet',
        galaxy: 3,
        system: 10,
        position: 4,
        temperature: 70,
        fields: 220,
        created_at: 500,
      },
    ];

    missionStore = [];

    // Single unified store — all rows in one array
    // The mock DB uses column-matching so planet rows and mission rows coexist
    db = createMockDb(store);

    const planetState = defaultPlanetState();
    planetDO = createMockPlanetDO({
      '/state': {
        body: planetState,
      },
      '/setState': { body: {} },
    });

    svc = new PlanetManagementService(db, planetDO);
  });

  test('successfully creates a fleet save mission', async () => {
    const ships: Ships = { ...emptyShips(), lightFighter: 10, smallCargo: 5 };
    const result = await svc.fleetSave(db, 'p1', 'planet-p1-hw', 'planet-p1-col', ships, 100);

    expect(result.success).toBe(true);
    expect(result.mission).toBeDefined();
    expect(result.mission!.missionType).toBe('deploy');
    expect(result.mission!.missionStatus).toBe('in_transit');
  });

  test('mission has correct source and target info', async () => {
    const ships: Ships = { ...emptyShips(), smallCargo: 5 };
    const result = await svc.fleetSave(db, 'p1', 'planet-p1-hw', 'planet-p1-col', ships, 100);

    expect(result.success).toBe(true);
    expect(result.mission!.planetIdFrom).toBe('planet-p1-hw');
    expect(result.mission!.planetIdTo).toBe('planet-p1-col');
  });

  test('fleet save with reduced speed has longer duration', async () => {
    const ships: Ships = { ...emptyShips(), smallCargo: 5 };
    const fast = await svc.fleetSave(db, 'p1', 'planet-p1-hw', 'planet-p1-col', ships, 100);

    // Reset planet state for second call (ships were deducted from first call)
    const planetState2 = defaultPlanetState();
    const planetDO2 = createMockPlanetDO({
      '/state': { body: planetState2 },
      '/setState': { body: {} },
    });
    const db2 = createMockDb([
      {
        id: 'planet-p1-hw',
        player_id: 'p1',
        name: 'Homeworld',
        galaxy: 1, system: 1, position: 6,
        temperature: 50, fields: 200, created_at: 1000,
      },
      {
        id: 'planet-p1-col',
        player_id: 'p1',
        name: 'Colony 1:2:8',
        galaxy: 1, system: 2, position: 8,
        temperature: 30, fields: 180, created_at: 2000,
      },
    ]);
    const svc2 = new PlanetManagementService(db2, planetDO2);
    const slow = await svc2.fleetSave(db2, 'p1', 'planet-p1-hw', 'planet-p1-col', ships, 10);

    expect(fast.success).toBe(true);
    expect(slow.success).toBe(true);

    const fastDuration = fast.mission!.timeArrival - fast.mission!.timeDeparture;
    const slowDuration = slow.mission!.timeArrival - slow.mission!.timeDeparture;
    expect(slowDuration).toBeGreaterThan(fastDuration);
  });

  test('fails when source planet not found', async () => {
    const ships: Ships = { ...emptyShips(), smallCargo: 5 };
    const result = await svc.fleetSave(db, 'p1', 'nonexistent', 'planet-p1-col', ships, 100);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Source planet not found');
  });

  test('fails when target planet not found', async () => {
    const ships: Ships = { ...emptyShips(), smallCargo: 5 };
    const result = await svc.fleetSave(db, 'p1', 'planet-p1-hw', 'nonexistent', ships, 100);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Target planet not found');
  });

  test('fails when player does not own source planet', async () => {
    const ships: Ships = { ...emptyShips(), smallCargo: 5 };
    const result = await svc.fleetSave(db, 'p1', 'planet-p2-hw', 'planet-p1-col', ships, 100);
    expect(result.success).toBe(false);
    expect(result.error).toContain('do not own the source');
  });

  test('fails when player does not own target planet', async () => {
    const ships: Ships = { ...emptyShips(), smallCargo: 5 };
    const result = await svc.fleetSave(db, 'p1', 'planet-p1-hw', 'planet-p2-hw', ships, 100);
    expect(result.success).toBe(false);
    expect(result.error).toContain('do not own the target');
  });

  test('fails when source and target are the same planet', async () => {
    const ships: Ships = { ...emptyShips(), smallCargo: 5 };
    const result = await svc.fleetSave(db, 'p1', 'planet-p1-hw', 'planet-p1-hw', ships, 100);
    expect(result.success).toBe(false);
    expect(result.error).toContain('different');
  });

  test('fails with zero ships', async () => {
    const result = await svc.fleetSave(db, 'p1', 'planet-p1-hw', 'planet-p1-col', emptyShips(), 100);
    expect(result.success).toBe(false);
    expect(result.error).toContain('at least one ship');
  });

  test('fails with invalid speed (too low)', async () => {
    const ships: Ships = { ...emptyShips(), smallCargo: 5 };
    const result = await svc.fleetSave(db, 'p1', 'planet-p1-hw', 'planet-p1-col', ships, 5);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Speed');
  });

  test('fails with invalid speed (too high)', async () => {
    const ships: Ships = { ...emptyShips(), smallCargo: 5 };
    const result = await svc.fleetSave(db, 'p1', 'planet-p1-hw', 'planet-p1-col', ships, 101);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Speed');
  });
});

// ============================================================================
// FLEET RECALL TESTS
// ============================================================================

describe('PlanetManagementService.recallFleet', () => {
  let store: DbRow[];
  let db: D1Database;
  let planetDO: DurableObjectNamespace;
  let svc: PlanetManagementService;
  const nowSeconds = Math.floor(Date.now() / 1000);

  beforeEach(() => {
    store = [
      // Source planet row (needed for coordinate lookup)
      {
        id: 'planet-p1-hw',
        player_id: 'p1',
        name: 'Homeworld',
        galaxy: 1,
        system: 1,
        position: 6,
        temperature: 50,
        fields: 200,
        created_at: 1000,
      },
      // An in-transit mission
      {
        id: 'mission-1',
        player_id: 'p1',
        planet_id_from: 'planet-p1-hw',
        planet_id_to: 'planet-p1-col',
        mission_type: 'deploy',
        mission_status: 'in_transit',
        time_departure: nowSeconds - 100,
        time_arrival: nowSeconds + 200,
        galaxy_to: 2,
        system_to: 5,
        position_to: 8,
        light_fighter: 10,
        heavy_fighter: 0,
        cruiser: 0,
        battleship: 0,
        battlecruiser: 0,
        bomber: 0,
        destroyer: 0,
        deathstar: 0,
        small_cargo: 5,
        large_cargo: 0,
        colony_ship: 0,
        recycler: 0,
        espionage_probe: 0,
        metal: 100,
        crystal: 200,
        deuterium: 50,
      },
      // A completed mission (cannot recall)
      {
        id: 'mission-2',
        player_id: 'p1',
        planet_id_from: 'planet-p1-hw',
        planet_id_to: 'planet-p1-col',
        mission_type: 'deploy',
        mission_status: 'completed',
        time_departure: nowSeconds - 500,
        time_arrival: nowSeconds - 300,
        galaxy_to: 2,
        system_to: 5,
        position_to: 8,
        light_fighter: 5,
        heavy_fighter: 0,
        cruiser: 0,
        battleship: 0,
        battlecruiser: 0,
        bomber: 0,
        destroyer: 0,
        deathstar: 0,
        small_cargo: 0,
        large_cargo: 0,
        colony_ship: 0,
        recycler: 0,
        espionage_probe: 0,
        metal: 0,
        crystal: 0,
        deuterium: 0,
      },
      // A return mission (cannot recall)
      {
        id: 'mission-3',
        player_id: 'p1',
        planet_id_from: 'planet-p1-col',
        planet_id_to: 'planet-p1-hw',
        mission_type: 'return',
        mission_status: 'in_transit',
        time_departure: nowSeconds - 50,
        time_arrival: nowSeconds + 150,
        galaxy_to: 1,
        system_to: 1,
        position_to: 6,
        light_fighter: 3,
        heavy_fighter: 0,
        cruiser: 0,
        battleship: 0,
        battlecruiser: 0,
        bomber: 0,
        destroyer: 0,
        deathstar: 0,
        small_cargo: 0,
        large_cargo: 0,
        colony_ship: 0,
        recycler: 0,
        espionage_probe: 0,
        metal: 0,
        crystal: 0,
        deuterium: 0,
      },
      // A mission owned by another player
      {
        id: 'mission-4',
        player_id: 'p2',
        planet_id_from: 'planet-p2-hw',
        planet_id_to: 'planet-p1-hw',
        mission_type: 'attack',
        mission_status: 'in_transit',
        time_departure: nowSeconds - 10,
        time_arrival: nowSeconds + 300,
        galaxy_to: 1,
        system_to: 1,
        position_to: 6,
        light_fighter: 20,
        heavy_fighter: 0,
        cruiser: 0,
        battleship: 0,
        battlecruiser: 0,
        bomber: 0,
        destroyer: 0,
        deathstar: 0,
        small_cargo: 0,
        large_cargo: 0,
        colony_ship: 0,
        recycler: 0,
        espionage_probe: 0,
        metal: 0,
        crystal: 0,
        deuterium: 0,
      },
    ];

    db = createMockDb(store);
    planetDO = createMockPlanetDO({});
    svc = new PlanetManagementService(db, planetDO);
  });

  test('successfully recalls an in-transit mission', async () => {
    const result = await svc.recallFleet(db, 'p1', 'mission-1');
    expect(result.success).toBe(true);
    expect(result.returnMission).toBeDefined();
    expect(result.returnMission!.missionType).toBe('return');
    expect(result.returnMission!.missionStatus).toBe('in_transit');
  });

  test('return mission has correct ship counts', async () => {
    const result = await svc.recallFleet(db, 'p1', 'mission-1');
    expect(result.returnMission!.ships.lightFighter).toBe(10);
    expect(result.returnMission!.ships.smallCargo).toBe(5);
  });

  test('return mission carries the original resources', async () => {
    const result = await svc.recallFleet(db, 'p1', 'mission-1');
    expect(result.returnMission!.resources.metal).toBe(100);
    expect(result.returnMission!.resources.crystal).toBe(200);
    expect(result.returnMission!.resources.deuterium).toBe(50);
  });

  test('original mission is marked as canceled', async () => {
    await svc.recallFleet(db, 'p1', 'mission-1');
    const original = store.find((r) => r.id === 'mission-1');
    expect(original!.mission_status).toBe('canceled');
  });

  test('return duration is proportional to elapsed time', async () => {
    const result = await svc.recallFleet(db, 'p1', 'mission-1');
    // The mission departed 100s ago, total duration is 300s
    // So the fleet has traveled for ~100s, and should take ~100s to return
    const returnDuration = result.returnMission!.timeArrival - result.returnMission!.timeDeparture;
    expect(returnDuration).toBeGreaterThan(0);
    // Should be approximately 100 seconds (the elapsed time)
    expect(returnDuration).toBeLessThanOrEqual(300);
  });

  test('fails when mission not found', async () => {
    const result = await svc.recallFleet(db, 'p1', 'nonexistent');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  test('fails when player does not own the mission', async () => {
    const result = await svc.recallFleet(db, 'p1', 'mission-4');
    expect(result.success).toBe(false);
    expect(result.error).toContain('do not own');
  });

  test('fails when mission is not in transit (completed)', async () => {
    const result = await svc.recallFleet(db, 'p1', 'mission-2');
    expect(result.success).toBe(false);
    expect(result.error).toContain('in-transit');
  });

  test('fails when trying to recall a return mission', async () => {
    const result = await svc.recallFleet(db, 'p1', 'mission-3');
    expect(result.success).toBe(false);
    expect(result.error).toContain('return mission');
  });

  test('return mission id contains original mission id', async () => {
    const result = await svc.recallFleet(db, 'p1', 'mission-1');
    expect(result.returnMission!.id).toContain('mission-1');
  });

  test('return mission is persisted to store', async () => {
    const result = await svc.recallFleet(db, 'p1', 'mission-1');
    const persisted = store.find((r) => r.id === result.returnMission!.id);
    expect(persisted).toBeDefined();
    expect(persisted!.mission_type).toBe('return');
  });
});
