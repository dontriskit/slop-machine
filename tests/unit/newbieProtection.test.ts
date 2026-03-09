/**
 * newbieProtection.test.ts
 *
 * Tests for Newbie Protection and Bash Rule (GH #148).
 * Delegates to protectionService which implements both features.
 */
import { describe, test, expect } from 'vitest';
import {
  isNewbieProtected,
  checkBashRule,
  logAttack,
  canAttack,
} from '../../worker/src/game/services/protectionService';

// ---------------------------------------------------------------------------
// Minimal D1 mock
// ---------------------------------------------------------------------------

interface Row {
  [key: string]: string | number | null;
}

function createMockDB(initialAttackLog: Row[] = []) {
  const tables: Map<string, Row[]> = new Map([
    ['attack_log', [...initialAttackLog]],
  ]);

  const mockDb = {
    prepare: (sql: string) => ({
      bind: (...params: any[]) => ({
        first: async (): Promise<any> => executeSql(sql, params, tables, 'first'),
        all: async (): Promise<any> => ({ results: executeSql(sql, params, tables, 'all') }),
        run: async (): Promise<any> => executeSql(sql, params, tables, 'run'),
      }),
    }),
  } as unknown as D1Database;

  return { mockDb, tables };
}

function executeSql(
  sql: string,
  params: any[],
  tables: Map<string, Row[]>,
  mode: 'first' | 'all' | 'run'
): any {
  if (sql.includes('INSERT INTO attack_log')) {
    const [id, attackerId, defenderId, timestamp] = params;
    const table = tables.get('attack_log')!;
    table.push({ id, attacker_id: attackerId, defender_id: defenderId, timestamp });
    return {};
  }

  if (sql.includes('SELECT COUNT(*) AS count') && sql.includes('attack_log')) {
    const table = tables.get('attack_log') ?? [];
    const [attackerId, defenderId, cutoff] = params;
    const count = table.filter(
      (r) => r.attacker_id === attackerId && r.defender_id === defenderId && (r.timestamp as number) > cutoff
    ).length;
    return mode === 'first' ? { count } : [{ count }];
  }

  // Score queries — return 0 for all (newbie scenario)
  if (sql.includes('build_history')) return { economy: 0 };
  if (sql.includes('player_research')) return { research: 0 };
  if (sql.includes('fleets') && sql.includes('500')) return { fleet: 0 };

  return null;
}

// ---------------------------------------------------------------------------
// Newbie Protection
// ---------------------------------------------------------------------------

describe('Newbie Protection (#148)', () => {
  test('defender < 5000 points, attacker > 5x: protected', async () => {
    expect(await isNewbieProtected(10001, 2000)).toBe(true);
  });

  test('defender < 5000 points, attacker exactly 5x: NOT protected', async () => {
    expect(await isNewbieProtected(10000, 2000)).toBe(false);
  });

  test('defender < 5000 points, attacker < 5x: NOT protected', async () => {
    expect(await isNewbieProtected(5000, 2000)).toBe(false);
  });

  test('defender >= 5000 points: NOT protected regardless of attacker strength', async () => {
    expect(await isNewbieProtected(999999, 5000)).toBe(false);
    expect(await isNewbieProtected(999999, 6000)).toBe(false);
  });

  test('both at 0 points: NOT protected (0 * 5 = 0, no ratio)', async () => {
    expect(await isNewbieProtected(0, 0)).toBe(false);
  });

  test('massive score gap still applies protection when under threshold', async () => {
    expect(await isNewbieProtected(1_000_000, 1)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Bash Rule
// ---------------------------------------------------------------------------

describe('Bash Rule — max 6 attacks per 24h (#148)', () => {
  test('allows attack when no prior attacks', async () => {
    const { mockDb } = createMockDB();
    const result = await checkBashRule(mockDb, 'a', 'b');
    expect(result.canAttack).toBe(true);
  });

  test('allows attack with 5 prior attacks in window', async () => {
    const now = Math.floor(Date.now() / 1000);
    const log = Array.from({ length: 5 }, (_, i) => ({
      id: `l${i}`,
      attacker_id: 'a',
      defender_id: 'b',
      timestamp: now,
    }));
    const { mockDb } = createMockDB(log);
    const result = await checkBashRule(mockDb, 'a', 'b');
    expect(result.canAttack).toBe(true);
  });

  test('blocks attack when exactly 6 attacks exist in window', async () => {
    const now = Math.floor(Date.now() / 1000);
    const log = Array.from({ length: 6 }, (_, i) => ({
      id: `l${i}`,
      attacker_id: 'a',
      defender_id: 'b',
      timestamp: now,
    }));
    const { mockDb } = createMockDB(log);
    const result = await checkBashRule(mockDb, 'a', 'b');
    expect(result.canAttack).toBe(false);
    expect(result.reason).toMatch(/Bash rule/);
  });

  test('ignores attacks outside the 24h window', async () => {
    const now = Math.floor(Date.now() / 1000);
    const old = now - 25 * 3600; // 25 hours ago
    const log = [
      // 1 old attack (outside window)
      { id: 'old', attacker_id: 'a', defender_id: 'b', timestamp: old },
      // 5 recent attacks — total in window = 5, still allowed
      ...Array.from({ length: 5 }, (_, i) => ({
        id: `r${i}`,
        attacker_id: 'a',
        defender_id: 'b',
        timestamp: now - 3600,
      })),
    ];
    const { mockDb } = createMockDB(log);
    const result = await checkBashRule(mockDb, 'a', 'b');
    expect(result.canAttack).toBe(true);
  });

  test('counts attacks only for the specific attacker-defender pair', async () => {
    const now = Math.floor(Date.now() / 1000);
    // 10 attacks from 'a' on 'other' — should not count against 'b'
    const log = Array.from({ length: 10 }, (_, i) => ({
      id: `x${i}`,
      attacker_id: 'a',
      defender_id: 'other',
      timestamp: now,
    }));
    const { mockDb } = createMockDB(log);
    const result = await checkBashRule(mockDb, 'a', 'b');
    expect(result.canAttack).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// logAttack
// ---------------------------------------------------------------------------

describe('logAttack', () => {
  test('inserts record into attack_log', async () => {
    const { mockDb, tables } = createMockDB();
    await logAttack(mockDb, 'a', 'b');
    const log = tables.get('attack_log')!;
    expect(log.length).toBe(1);
    expect(log[0].attacker_id).toBe('a');
    expect(log[0].defender_id).toBe('b');
  });

  test('generates unique ids for consecutive calls', async () => {
    const { mockDb, tables } = createMockDB();
    await logAttack(mockDb, 'a', 'b');
    await logAttack(mockDb, 'a', 'b');
    const log = tables.get('attack_log')!;
    expect(log.length).toBe(2);
    expect(log[0].id).not.toBe(log[1].id);
  });
});

// ---------------------------------------------------------------------------
// canAttack — integration
// ---------------------------------------------------------------------------

describe('canAttack integration', () => {
  test('blocks self-attack', async () => {
    const { mockDb } = createMockDB();
    const r = await canAttack(mockDb, 'x', 'x');
    expect(r.canAttack).toBe(false);
    expect(r.reason).toContain('yourself');
  });

  test('blocks when bash rule exceeded', async () => {
    const now = Math.floor(Date.now() / 1000);
    const log = Array.from({ length: 6 }, (_, i) => ({
      id: `l${i}`,
      attacker_id: 'a',
      defender_id: 'b',
      timestamp: now,
    }));
    const { mockDb } = createMockDB(log);
    const r = await canAttack(mockDb, 'a', 'b');
    expect(r.canAttack).toBe(false);
    expect(r.reason).toMatch(/Bash rule/);
  });

  test('allows attack when no restrictions apply', async () => {
    const { mockDb } = createMockDB();
    const r = await canAttack(mockDb, 'a', 'b');
    expect(r.canAttack).toBe(true);
  });

  test('fails open on DB error (does not block attack)', async () => {
    const broken = {
      prepare: () => { throw new Error('DB down'); },
    } as unknown as D1Database;
    const r = await canAttack(broken, 'a', 'b');
    expect(r.canAttack).toBe(true);
  });
});
