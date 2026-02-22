/**
 * Unit tests for protection service (newbie protection + bash rule)
 */
import { describe, test, expect, beforeEach } from 'vitest';
import {
  canAttack,
  checkBashRule,
  logAttack,
  isNewbieProtected,
} from '../../worker/src/game/services/protectionService';

// ============================================================================
// D1 MOCK
// ============================================================================

interface Row {
  [key: string]: string | number | null;
}

function createMockDB() {
  const tables: Map<string, Row[]> = new Map();

  // Seed players table
  tables.set('players', [
    { id: 'player1', name: 'Alice', alliance_tag: 'ALLY' },
    { id: 'player2', name: 'Bob', alliance_tag: 'ALLY' },
    { id: 'newbie', name: 'Newbie', alliance_tag: null },
    { id: 'veteran', name: 'Veteran', alliance_tag: 'ELITE' },
  ]);

  // Seed build_history table
  tables.set('build_history', []);

  // Seed player_research table
  tables.set('player_research', []);

  // Seed fleets table
  tables.set('fleets', []);

  // Seed attack_log table
  tables.set('attack_log', []);

  const mockDb = {
    prepare: (sql: string) => {
      return {
        bind: (...params: any[]) => {
          return {
            first: async () => {
              return executeSql(sql, params, tables, 'first');
            },
            all: async () => {
              return executeSql(sql, params, tables, 'all');
            },
            run: async () => {
              return executeSql(sql, params, tables, 'run');
            },
          };
        },
      };
    },
  } as any;

  return { mockDb, tables };
}

function executeSql(
  sql: string,
  params: any[],
  tables: Map<string, Row[]>,
  mode: 'first' | 'all' | 'run'
): any {
  // INSERT
  if (sql.includes('INSERT INTO')) {
    const tableMatch = sql.match(/INSERT INTO (\w+)/);
    const tableName = tableMatch?.[1];

    if (tableName === 'attack_log') {
      const [id, attackerId, defenderId, timestamp] = params;
      const table = tables.get('attack_log') || [];
      table.push({
        id,
        attacker_id: attackerId,
        defender_id: defenderId,
        timestamp,
      });
      tables.set('attack_log', table);
      return {};
    }
  }

  // SELECT COUNT(*) for attack_log
  if (sql.includes('SELECT COUNT(*) AS count') && sql.includes('attack_log')) {
    const table = tables.get('attack_log') || [];
    const [attackerId, defenderId, cutoff] = params;

    const count = table.filter(
      (row: any) =>
        row.attacker_id === attackerId &&
        row.defender_id === defenderId &&
        row.timestamp > cutoff
    ).length;

    if (mode === 'first') {
      return { count };
    }
  }

  // SELECT economy for build_history
  if (sql.includes('SELECT COALESCE(SUM(max_level * 1000)') && sql.includes('build_history')) {
    return { economy: 0 };
  }

  // SELECT research for player_research
  if (sql.includes('SELECT COALESCE(SUM(level * 2000)') && sql.includes('player_research')) {
    return { research: 0 };
  }

  // SELECT fleet score
  if (sql.includes('SUM(') && sql.includes('* 500') && sql.includes('fleets')) {
    return { fleet: 0 };
  }

  return null;
}

// ============================================================================
// TESTS
// ============================================================================

describe('protectionService', () => {
  // =========================================================================
  // Newbie Protection Tests
  // =========================================================================

  describe('isNewbieProtected', () => {
    test('protects newbies under 5000 points from 5x+ stronger attackers', async () => {
      const defenderScore = 2000; // Under 5000
      const attackerScore = 10001; // More than 5x stronger (5x = 10000)
      const protected_ = await isNewbieProtected(attackerScore, defenderScore);
      expect(protected_).toBe(true);
    });

    test('does not protect newbies from weaker or equal-strength attackers', async () => {
      const defenderScore = 2000;
      const attackerScore = 5000; // Exactly 2.5x, not 5x
      const protected_ = await isNewbieProtected(attackerScore, defenderScore);
      expect(protected_).toBe(false);
    });

    test('does not protect players with 5000+ points', async () => {
      const defenderScore = 5000; // At threshold
      const attackerScore = 50000; // Much stronger
      const protected_ = await isNewbieProtected(attackerScore, defenderScore);
      expect(protected_).toBe(false);
    });

    test('does not protect newbies from players not strong enough', async () => {
      const defenderScore = 2000;
      const attackerScore = 9999; // Just under 5x (5x = 10000)
      const protected_ = await isNewbieProtected(attackerScore, defenderScore);
      expect(protected_).toBe(false);
    });

    test('handles edge case of defender with 1 point', async () => {
      const defenderScore = 1;
      const attackerScore = 6; // More than 5x (5x = 5)
      const protected_ = await isNewbieProtected(attackerScore, defenderScore);
      expect(protected_).toBe(true);
    });

    test('handles edge case of both players at 0 points', async () => {
      const defenderScore = 0;
      const attackerScore = 0;
      const protected_ = await isNewbieProtected(attackerScore, defenderScore);
      expect(protected_).toBe(false); // 0 * 5 = 0, so not > 0
    });
  });

  // =========================================================================
  // Bash Rule Tests
  // =========================================================================

  describe('checkBashRule', () => {
    test('allows attack if no recent attacks', async () => {
      const { mockDb } = createMockDB();
      const result = await checkBashRule(mockDb, 'player1', 'player2');
      expect(result.canAttack).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    test('allows attack if less than 6 recent attacks', async () => {
      const { mockDb, tables } = createMockDB();

      // Add 3 attacks
      const attackLog = tables.get('attack_log') || [];
      for (let i = 0; i < 3; i++) {
        attackLog.push({
          id: `log-${i}`,
          attacker_id: 'player1',
          defender_id: 'player2',
          timestamp: Math.floor(Date.now() / 1000),
        });
      }
      tables.set('attack_log', attackLog);

      const result = await checkBashRule(mockDb, 'player1', 'player2');
      expect(result.canAttack).toBe(true);
    });

    test('blocks attack if exactly 6 recent attacks', async () => {
      const { mockDb, tables } = createMockDB();

      // Add 6 attacks
      const attackLog = tables.get('attack_log') || [];
      for (let i = 0; i < 6; i++) {
        attackLog.push({
          id: `log-${i}`,
          attacker_id: 'player1',
          defender_id: 'player2',
          timestamp: Math.floor(Date.now() / 1000),
        });
      }
      tables.set('attack_log', attackLog);

      const result = await checkBashRule(mockDb, 'player1', 'player2');
      expect(result.canAttack).toBe(false);
      expect(result.reason).toContain('Bash rule');
      expect(result.reason).toContain('6');
    });

    test('blocks attack if more than 6 recent attacks', async () => {
      const { mockDb, tables } = createMockDB();

      // Add 10 attacks
      const attackLog = tables.get('attack_log') || [];
      for (let i = 0; i < 10; i++) {
        attackLog.push({
          id: `log-${i}`,
          attacker_id: 'player1',
          defender_id: 'player2',
          timestamp: Math.floor(Date.now() / 1000),
        });
      }
      tables.set('attack_log', attackLog);

      const result = await checkBashRule(mockDb, 'player1', 'player2');
      expect(result.canAttack).toBe(false);
      expect(result.reason).toContain('Bash rule');
      expect(result.reason).toContain('attacks on this player');
    });

    test('counts attacks only for specific attacker-defender pair', async () => {
      const { mockDb, tables } = createMockDB();

      // Add 5 attacks from player1 to player2
      const attackLog = tables.get('attack_log') || [];
      for (let i = 0; i < 5; i++) {
        attackLog.push({
          id: `log-${i}`,
          attacker_id: 'player1',
          defender_id: 'player2',
          timestamp: Math.floor(Date.now() / 1000),
        });
      }

      // Add 10 attacks from player1 to another target
      for (let i = 5; i < 15; i++) {
        attackLog.push({
          id: `log-${i}`,
          attacker_id: 'player1',
          defender_id: 'other-target',
          timestamp: Math.floor(Date.now() / 1000),
        });
      }

      tables.set('attack_log', attackLog);

      // Should allow attack on player2 (only 5 attacks)
      const result = await checkBashRule(mockDb, 'player1', 'player2');
      expect(result.canAttack).toBe(true);
    });
  });

  // =========================================================================
  // Attack Logging Tests
  // =========================================================================

  describe('logAttack', () => {
    test('logs attack with attacker and defender IDs', async () => {
      const { mockDb, tables } = createMockDB();

      await logAttack(mockDb, 'player1', 'player2');

      const attackLog = tables.get('attack_log') || [];
      expect(attackLog.length).toBeGreaterThan(0);

      const logged = attackLog[0];
      expect(logged.attacker_id).toBe('player1');
      expect(logged.defender_id).toBe('player2');
    });

    test('includes timestamp for attack', async () => {
      const { mockDb, tables } = createMockDB();

      const beforeTime = Math.floor(Date.now() / 1000);
      await logAttack(mockDb, 'player1', 'player2');
      const afterTime = Math.floor(Date.now() / 1000);

      const attackLog = tables.get('attack_log') || [];
      const logged = attackLog[0];

      expect(logged.timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(logged.timestamp).toBeLessThanOrEqual(afterTime + 1);
    });

    test('creates unique ID for each logged attack', async () => {
      const { mockDb, tables } = createMockDB();

      await logAttack(mockDb, 'player1', 'player2');
      await logAttack(mockDb, 'player1', 'player2');

      const attackLog = tables.get('attack_log') || [];
      expect(attackLog.length).toBe(2);
      expect(attackLog[0].id).not.toBe(attackLog[1].id);
    });
  });

  // =========================================================================
  // Full canAttack Integration Tests
  // =========================================================================

  describe('canAttack', () => {
    test('rejects self-attacks', async () => {
      const { mockDb } = createMockDB();
      const result = await canAttack(mockDb, 'player1', 'player1');
      expect(result.canAttack).toBe(false);
      expect(result.reason).toContain('yourself');
    });

    test('blocks attack if bash rule violated', async () => {
      const { mockDb, tables } = createMockDB();

      // Add 6 attacks
      const attackLog = tables.get('attack_log') || [];
      for (let i = 0; i < 6; i++) {
        attackLog.push({
          id: `log-${i}`,
          attacker_id: 'player1',
          defender_id: 'player2',
          timestamp: Math.floor(Date.now() / 1000),
        });
      }
      tables.set('attack_log', attackLog);

      const result = await canAttack(mockDb, 'player1', 'player2');
      expect(result.canAttack).toBe(false);
      expect(result.reason).toContain('Bash rule');
    });

    test('allows attack if no protections apply', async () => {
      const { mockDb } = createMockDB();
      const result = await canAttack(mockDb, 'player1', 'player2');
      expect(result.canAttack).toBe(true);
    });

    test('fails gracefully on database errors', async () => {
      const mockDb = {
        prepare: () => {
          throw new Error('DB error');
        },
      } as any;

      const result = await canAttack(mockDb, 'player1', 'player2');
      // Should fail open and allow attack on error
      expect(result.canAttack).toBe(true);
    });
  });

  // =========================================================================
  // Edge Cases
  // =========================================================================

  describe('Edge cases', () => {
    test('newbie protection works with large score differences', async () => {
      const protected_ = await isNewbieProtected(1000000, 1);
      expect(protected_).toBe(true);
    });

    test('bash rule respects 24 hour window', async () => {
      const { mockDb, tables } = createMockDB();

      const nowSeconds = Math.floor(Date.now() / 1000);
      const old = nowSeconds - 25 * 3600; // 25 hours ago
      const recent = nowSeconds - 1 * 3600; // 1 hour ago

      const attackLog = tables.get('attack_log') || [];

      // Add old attack (outside 24h window)
      attackLog.push({
        id: 'old-log',
        attacker_id: 'player1',
        defender_id: 'player2',
        timestamp: old,
      });

      // Add 5 recent attacks
      for (let i = 0; i < 5; i++) {
        attackLog.push({
          id: `recent-log-${i}`,
          attacker_id: 'player1',
          defender_id: 'player2',
          timestamp: recent,
        });
      }

      tables.set('attack_log', attackLog);

      // Should count only 5 recent attacks, not 6
      const result = await checkBashRule(mockDb, 'player1', 'player2');
      expect(result.canAttack).toBe(true);
    });
  });
});
