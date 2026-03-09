/**
 * Unit tests for GalaxyHistoryService
 *
 * Tests cover:
 *   - logEvent — inserts and returns correct shape
 *   - getSystemHistory — returns events filtered by galaxy/system, DESC order
 *   - getRecentHistory — returns events across all systems
 *   - details_json serialisation / deserialisation
 *   - Null player_id / target_id handling
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  GalaxyHistoryService,
  createGalaxyHistoryService,
  type GalaxyEvent,
  type GalaxyEventType,
} from '../../worker/src/game/services/galaxyHistoryService';

// ============================================================================
// MOCK D1 HELPERS
// ============================================================================

function makeMockDB(allRows: any[] = [], firstRow: any = null): any {
  const stmt = {
    bind: (..._args: any[]) => stmt,
    all: vi.fn().mockResolvedValue({ results: allRows }),
    first: vi.fn().mockResolvedValue(firstRow),
    run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
  };
  return {
    prepare: vi.fn().mockReturnValue(stmt),
    _stmt: stmt, // expose for assertion
  };
}

function makeRow(overrides: Partial<any> = {}): any {
  return {
    id: 'gevt-001',
    type: 'attack',
    galaxy: 1,
    system: 42,
    position: 7,
    player_id: 'player-a',
    target_id: 'player-b',
    timestamp: 1700000000,
    details_json: JSON.stringify({ winner: 'attacker', loot: { metal: 500 } }),
    ...overrides,
  };
}

// ============================================================================
// createGalaxyHistoryService factory
// ============================================================================

describe('createGalaxyHistoryService', () => {
  test('returns a GalaxyHistoryService instance', () => {
    const db = makeMockDB();
    const svc = createGalaxyHistoryService(db);
    expect(svc).toBeInstanceOf(GalaxyHistoryService);
  });
});

// ============================================================================
// logEvent
// ============================================================================

describe('logEvent', () => {
  test('returns a GalaxyEvent with correct fields', async () => {
    const db = makeMockDB();
    const svc = new GalaxyHistoryService(db);

    const event = await svc.logEvent({
      type: 'attack',
      galaxy: 2,
      system: 15,
      position: 5,
      playerId: 'player-x',
      targetId: 'player-y',
      details: { winner: 'attacker', rounds: 3 },
    });

    expect(event.type).toBe('attack');
    expect(event.galaxy).toBe(2);
    expect(event.system).toBe(15);
    expect(event.position).toBe(5);
    expect(event.playerId).toBe('player-x');
    expect(event.targetId).toBe('player-y');
    expect(event.details).toEqual({ winner: 'attacker', rounds: 3 });
    expect(event.id).toMatch(/^gevt-/);
    expect(typeof event.timestamp).toBe('number');
    expect(event.timestamp).toBeGreaterThan(0);
  });

  test('handles null playerId and targetId', async () => {
    const db = makeMockDB();
    const svc = new GalaxyHistoryService(db);

    const event = await svc.logEvent({
      type: 'debris',
      galaxy: 1,
      system: 10,
      position: 3,
    });

    expect(event.playerId).toBeNull();
    expect(event.targetId).toBeNull();
    expect(event.details).toBeNull();
  });

  test('calls db.prepare with INSERT statement', async () => {
    const db = makeMockDB();
    const svc = new GalaxyHistoryService(db);

    await svc.logEvent({ type: 'colonization', galaxy: 3, system: 100, position: 8 });

    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO galaxy_events'));
  });

  test('all three event types are accepted', async () => {
    const types: GalaxyEventType[] = ['attack', 'colonization', 'debris'];

    for (const type of types) {
      const db = makeMockDB();
      const svc = new GalaxyHistoryService(db);
      const event = await svc.logEvent({ type, galaxy: 1, system: 1, position: 1 });
      expect(event.type).toBe(type);
    }
  });
});

// ============================================================================
// getSystemHistory
// ============================================================================

describe('getSystemHistory', () => {
  test('returns empty array when no rows', async () => {
    const db = makeMockDB([]);
    const svc = new GalaxyHistoryService(db);
    const events = await svc.getSystemHistory(1, 1);
    expect(events).toEqual([]);
  });

  test('maps DB rows to GalaxyEvent shape', async () => {
    const row = makeRow();
    const db = makeMockDB([row]);
    const svc = new GalaxyHistoryService(db);

    const events = await svc.getSystemHistory(1, 42);
    expect(events).toHaveLength(1);

    const e = events[0];
    expect(e.id).toBe('gevt-001');
    expect(e.type).toBe('attack');
    expect(e.galaxy).toBe(1);
    expect(e.system).toBe(42);
    expect(e.position).toBe(7);
    expect(e.playerId).toBe('player-a');
    expect(e.targetId).toBe('player-b');
    expect(e.timestamp).toBe(1700000000);
    expect(e.details).toEqual({ winner: 'attacker', loot: { metal: 500 } });
  });

  test('handles null details_json', async () => {
    const row = makeRow({ details_json: null });
    const db = makeMockDB([row]);
    const svc = new GalaxyHistoryService(db);

    const events = await svc.getSystemHistory(1, 42);
    expect(events[0].details).toBeNull();
  });

  test('handles null player_id and target_id', async () => {
    const row = makeRow({ player_id: null, target_id: null });
    const db = makeMockDB([row]);
    const svc = new GalaxyHistoryService(db);

    const events = await svc.getSystemHistory(1, 42);
    expect(events[0].playerId).toBeNull();
    expect(events[0].targetId).toBeNull();
  });

  test('maps multiple rows', async () => {
    const rows = [
      makeRow({ id: 'gevt-001', type: 'attack' }),
      makeRow({ id: 'gevt-002', type: 'colonization' }),
      makeRow({ id: 'gevt-003', type: 'debris', details_json: null }),
    ];
    const db = makeMockDB(rows);
    const svc = new GalaxyHistoryService(db);

    const events = await svc.getSystemHistory(1, 42);
    expect(events).toHaveLength(3);
    expect(events[0].id).toBe('gevt-001');
    expect(events[1].id).toBe('gevt-002');
    expect(events[2].id).toBe('gevt-003');
  });

  test('queries with correct galaxy/system params', async () => {
    const db = makeMockDB([]);
    const svc = new GalaxyHistoryService(db);

    await svc.getSystemHistory(5, 200);

    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('WHERE galaxy = ? AND system = ?'));
  });

  test('includes LIMIT 50 in query', async () => {
    const db = makeMockDB([]);
    const svc = new GalaxyHistoryService(db);

    await svc.getSystemHistory(1, 1);

    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('LIMIT 50'));
  });
});

// ============================================================================
// getRecentHistory
// ============================================================================

describe('getRecentHistory', () => {
  test('returns empty array when no rows', async () => {
    const db = makeMockDB([]);
    const svc = new GalaxyHistoryService(db);
    const events = await svc.getRecentHistory();
    expect(events).toEqual([]);
  });

  test('returns mapped events from all systems', async () => {
    const rows = [
      makeRow({ id: 'gevt-a', galaxy: 1, system: 1 }),
      makeRow({ id: 'gevt-b', galaxy: 2, system: 50 }),
      makeRow({ id: 'gevt-c', galaxy: 3, system: 200 }),
    ];
    const db = makeMockDB(rows);
    const svc = new GalaxyHistoryService(db);

    const events = await svc.getRecentHistory();
    expect(events).toHaveLength(3);
    expect(events.map((e) => e.id)).toEqual(['gevt-a', 'gevt-b', 'gevt-c']);
  });

  test('includes LIMIT 100 in query', async () => {
    const db = makeMockDB([]);
    const svc = new GalaxyHistoryService(db);

    await svc.getRecentHistory();

    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('LIMIT 100'));
  });

  test('orders by timestamp DESC', async () => {
    const db = makeMockDB([]);
    const svc = new GalaxyHistoryService(db);

    await svc.getRecentHistory();

    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('ORDER BY timestamp DESC'));
  });

  test('does not filter by galaxy/system', async () => {
    const db = makeMockDB([]);
    const svc = new GalaxyHistoryService(db);

    await svc.getRecentHistory();

    const query: string = db.prepare.mock.calls[0][0];
    expect(query).not.toContain('WHERE');
  });
});

// ============================================================================
// details_json serialisation
// ============================================================================

describe('details_json serialisation', () => {
  test('complex details are preserved through JSON round-trip', async () => {
    const details = {
      winner: 'attacker',
      rounds: 4,
      loot: { metal: 10000, crystal: 5000, deuterium: 1000 },
      debrisField: { metal: 3000, crystal: 1500 },
    };

    const row = makeRow({ details_json: JSON.stringify(details) });
    const db = makeMockDB([row]);
    const svc = new GalaxyHistoryService(db);

    const events = await svc.getSystemHistory(1, 42);
    expect(events[0].details).toEqual(details);
  });

  test('colonization details are preserved', async () => {
    const details = { newPlanetId: 'planet-xyz', fields: 180, temperature: -50 };
    const row = makeRow({ type: 'colonization', details_json: JSON.stringify(details) });
    const db = makeMockDB([row]);
    const svc = new GalaxyHistoryService(db);

    const events = await svc.getSystemHistory(1, 42);
    expect(events[0].details).toEqual(details);
  });

  test('debris details are preserved', async () => {
    const details = { metal: 25000, crystal: 12000, action: 'created' };
    const row = makeRow({ type: 'debris', details_json: JSON.stringify(details) });
    const db = makeMockDB([row]);
    const svc = new GalaxyHistoryService(db);

    const events = await svc.getSystemHistory(1, 42);
    expect(events[0].details).toEqual(details);
  });
});
