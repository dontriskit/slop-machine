/**
 * Unit tests for statsService.ts
 * Tests updateStats, getPlayerStats, getTopPlayers, StatsService class
 */
import { describe, it, expect } from 'vitest';
import {
  updateStats,
  getPlayerStats,
  getTopPlayers,
  statsService,
  type PlayerStats,
  type LeaderboardEntry,
} from '../../worker/src/game/services/statsService';

// ============================================================================
// MOCK D1 DATABASE
// ============================================================================

interface Row {
  [key: string]: string | number | null;
}

function createMockDB(opts: {
  statsRows?: Row[];
  playerRows?: Row[];
  leaderboardRows?: Row[];
} = {}) {
  const { statsRows = [], playerRows = [], leaderboardRows = [] } = opts;

  const insertedStats: Row[] = [...statsRows];
  const updates: Array<{ sql: string; args: any[] }> = [];

  const mockDB = {
    _updates: updates,
    prepare(sql: string) {
      const trimmed = sql.trim().replace(/\s+/g, ' ');
      return {
        bind(...binds: any[]) {
          return {
            async first<T>(): Promise<T | null> {
              // Player stats row
              if (/FROM player_stats WHERE player_id = \?/i.test(trimmed)) {
                const playerId = binds[0] as string;
                return (insertedStats.find((r) => r.player_id === playerId) ?? null) as T | null;
              }
              // Player created_at row
              if (/FROM players WHERE id = \?/i.test(trimmed)) {
                const playerId = binds[0] as string;
                return (playerRows.find((r) => r.id === playerId) ?? null) as T | null;
              }
              return null;
            },
            async all<T>(): Promise<{ results: T[] }> {
              // Leaderboard join query
              if (/FROM player_stats ps JOIN players p ON/i.test(trimmed)) {
                return { results: leaderboardRows as T[] };
              }
              return { results: [] };
            },
            async run(): Promise<void> {
              updates.push({ sql: trimmed, args: binds });
            },
          };
        },
      };
    },
  } as unknown as D1Database & { _updates: typeof updates };

  return mockDB;
}

// ============================================================================
// updateStats — simple counter events
// ============================================================================

describe('updateStats — simple events', () => {
  it('battle_win increments battles_won', async () => {
    const db = createMockDB();
    await updateStats('p1', 'battle_win', {}, db as unknown as D1Database);
    const dbAny = db as any;
    const updateCalls = dbAny._updates.filter((u: any) => u.sql.includes('battles_won'));
    expect(updateCalls.length).toBeGreaterThan(0);
  });

  it('battle_loss increments battles_lost', async () => {
    const db = createMockDB();
    await updateStats('p1', 'battle_loss', {}, db as unknown as D1Database);
    const updateCalls = (db as any)._updates.filter((u: any) => u.sql.includes('battles_lost'));
    expect(updateCalls.length).toBeGreaterThan(0);
  });

  it('battle_draw increments battles_draw', async () => {
    const db = createMockDB();
    await updateStats('p1', 'battle_draw', {}, db as unknown as D1Database);
    const updateCalls = (db as any)._updates.filter((u: any) => u.sql.includes('battles_draw'));
    expect(updateCalls.length).toBeGreaterThan(0);
  });

  it('fleet_dispatched increments fleets_dispatched', async () => {
    const db = createMockDB();
    await updateStats('p1', 'fleet_dispatched', {}, db as unknown as D1Database);
    const updateCalls = (db as any)._updates.filter((u: any) => u.sql.includes('fleets_dispatched'));
    expect(updateCalls.length).toBeGreaterThan(0);
  });

  it('research_completed increments research_completed', async () => {
    const db = createMockDB();
    await updateStats('p1', 'research_completed', {}, db as unknown as D1Database);
    const updateCalls = (db as any)._updates.filter((u: any) => u.sql.includes('research_completed'));
    expect(updateCalls.length).toBeGreaterThan(0);
  });

  it('planet_colonized increments planets_colonized', async () => {
    const db = createMockDB();
    await updateStats('p1', 'planet_colonized', {}, db as unknown as D1Database);
    const updateCalls = (db as any)._updates.filter((u: any) => u.sql.includes('planets_colonized'));
    expect(updateCalls.length).toBeGreaterThan(0);
  });

  it('trade_completed increments trades_completed', async () => {
    const db = createMockDB();
    await updateStats('p1', 'trade_completed', {}, db as unknown as D1Database);
    const updateCalls = (db as any)._updates.filter((u: any) => u.sql.includes('trades_completed'));
    expect(updateCalls.length).toBeGreaterThan(0);
  });

  it('agent_decision increments agent_decisions', async () => {
    const db = createMockDB();
    await updateStats('p1', 'agent_decision', {}, db as unknown as D1Database);
    const updateCalls = (db as any)._updates.filter((u: any) => u.sql.includes('agent_decisions'));
    expect(updateCalls.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// updateStats — count-based events
// ============================================================================

describe('updateStats — count events', () => {
  it('ships_destroyed passes correct count', async () => {
    const db = createMockDB();
    await updateStats('p1', 'ships_destroyed', { count: 42 }, db as unknown as D1Database);
    const updateCalls = (db as any)._updates.filter((u: any) => u.sql.includes('ships_destroyed'));
    expect(updateCalls.length).toBeGreaterThan(0);
    const deltaArg = updateCalls[0].args[0];
    expect(deltaArg).toBe(42);
  });

  it('ships_lost passes correct count', async () => {
    const db = createMockDB();
    await updateStats('p1', 'ships_lost', { count: 10 }, db as unknown as D1Database);
    const updateCalls = (db as any)._updates.filter((u: any) => u.sql.includes('ships_lost'));
    expect(updateCalls.length).toBeGreaterThan(0);
    expect(updateCalls[0].args[0]).toBe(10);
  });

  it('ships_destroyed with count=0 skips update (delta filter)', async () => {
    const db = createMockDB();
    await updateStats('p1', 'ships_destroyed', { count: 0 }, db as unknown as D1Database);
    const updateCalls = (db as any)._updates.filter((u: any) => u.sql.includes('ships_destroyed'));
    expect(updateCalls.length).toBe(0);
  });

  it('espionage_sent uses count field', async () => {
    const db = createMockDB();
    await updateStats('p1', 'espionage_sent', { count: 5 }, db as unknown as D1Database);
    const updateCalls = (db as any)._updates.filter((u: any) => u.sql.includes('espionage_sent'));
    expect(updateCalls[0].args[0]).toBe(5);
  });

  it('espionage_sent defaults to 1 when count omitted', async () => {
    const db = createMockDB();
    await updateStats('p1', 'espionage_sent', {}, db as unknown as D1Database);
    const updateCalls = (db as any)._updates.filter((u: any) => u.sql.includes('espionage_sent'));
    expect(updateCalls[0].args[0]).toBe(1);
  });

  it('building_built defaults to 1 when count omitted', async () => {
    const db = createMockDB();
    await updateStats('p1', 'building_built', {}, db as unknown as D1Database);
    const updateCalls = (db as any)._updates.filter((u: any) => u.sql.includes('buildings_built'));
    expect(updateCalls[0].args[0]).toBe(1);
  });
});

// ============================================================================
// updateStats — resources events
// ============================================================================

describe('updateStats — resource events', () => {
  it('resources_raided creates 3 column updates', async () => {
    const db = createMockDB();
    await updateStats(
      'p1',
      'resources_raided',
      { metal: 100, crystal: 200, deuterium: 50 },
      db as unknown as D1Database
    );
    const updateCalls = (db as any)._updates.filter(
      (u: any) => u.sql.includes('resources_raided')
    );
    expect(updateCalls.length).toBe(3);
  });

  it('resources_lost creates 3 column updates', async () => {
    const db = createMockDB();
    await updateStats(
      'p1',
      'resources_lost',
      { metal: 1000, crystal: 500, deuterium: 250 },
      db as unknown as D1Database
    );
    const updateCalls = (db as any)._updates.filter(
      (u: any) => u.sql.includes('resources_lost')
    );
    expect(updateCalls.length).toBe(3);
  });

  it('resources_raided with 0 metal skips metal update', async () => {
    const db = createMockDB();
    await updateStats(
      'p1',
      'resources_raided',
      { metal: 0, crystal: 100, deuterium: 50 },
      db as unknown as D1Database
    );
    const metalCalls = (db as any)._updates.filter((u: any) =>
      u.sql.includes('resources_raided_metal')
    );
    expect(metalCalls.length).toBe(0);
  });
});

// ============================================================================
// getPlayerStats
// ============================================================================

describe('getPlayerStats', () => {
  const NOW = Math.floor(Date.now() / 1000);

  it('returns zeroed stats when no row exists', async () => {
    const db = createMockDB();
    const stats = await getPlayerStats('p-missing', db as unknown as D1Database);
    expect(stats.playerId).toBe('p-missing');
    expect(stats.battlesWon).toBe(0);
    expect(stats.shipsDestroyed).toBe(0);
    expect(stats.resourcesRaided.metal).toBe(0);
    expect(stats.playTimeDays).toBeGreaterThanOrEqual(0);
  });

  it('maps all DB columns to PlayerStats fields', async () => {
    const statsRow: Row = {
      player_id: 'p1',
      battles_won: 10,
      battles_lost: 3,
      battles_draw: 1,
      ships_destroyed: 500,
      ships_lost: 100,
      resources_raided_metal: 1_000_000,
      resources_raided_crystal: 500_000,
      resources_raided_deut: 250_000,
      resources_lost_metal: 10_000,
      resources_lost_crystal: 5_000,
      resources_lost_deut: 2_000,
      fleets_dispatched: 50,
      espionage_sent: 20,
      buildings_built: 30,
      research_completed: 8,
      planets_colonized: 3,
      trades_completed: 5,
      agent_decisions: 15,
      created_at: NOW - 7 * 86400,
    };
    const playerRow: Row = { id: 'p1', created_at: NOW - 7 * 86400 };
    const db = createMockDB({ statsRows: [statsRow], playerRows: [playerRow] });

    const stats = await getPlayerStats('p1', db as unknown as D1Database);
    expect(stats.battlesWon).toBe(10);
    expect(stats.battlesLost).toBe(3);
    expect(stats.battlesDraw).toBe(1);
    expect(stats.shipsDestroyed).toBe(500);
    expect(stats.shipsLost).toBe(100);
    expect(stats.resourcesRaided.metal).toBe(1_000_000);
    expect(stats.resourcesRaided.crystal).toBe(500_000);
    expect(stats.resourcesRaided.deuterium).toBe(250_000);
    expect(stats.resourcesLost.metal).toBe(10_000);
    expect(stats.fleetsDispatched).toBe(50);
    expect(stats.espionageReportsSent).toBe(20);
    expect(stats.buildingsBuilt).toBe(30);
    expect(stats.researchCompleted).toBe(8);
    expect(stats.planetsColonized).toBe(3);
    expect(stats.tradesCompleted).toBe(5);
    expect(stats.agentDecisions).toBe(15);
    expect(stats.playTimeDays).toBe(7);
  });

  it('computes playTimeDays from player created_at', async () => {
    const statsRow: Row = { player_id: 'p2', created_at: NOW - 30 * 86400 };
    const playerRow: Row = { id: 'p2', created_at: NOW - 30 * 86400 };
    const db = createMockDB({ statsRows: [statsRow], playerRows: [playerRow] });

    const stats = await getPlayerStats('p2', db as unknown as D1Database);
    expect(stats.playTimeDays).toBe(30);
  });
});

// ============================================================================
// getTopPlayers
// ============================================================================

describe('getTopPlayers', () => {
  it('returns ranked list from DB rows', async () => {
    const leaderboardRows: Row[] = [
      { player_id: 'p1', player_name: 'Alpha', value: 100 },
      { player_id: 'p2', player_name: 'Beta', value: 80 },
    ];
    const db = createMockDB({ leaderboardRows });
    const entries = await getTopPlayers('battles_won', 10, db as unknown as D1Database);
    expect(entries.length).toBe(2);
    expect(entries[0].playerId).toBe('p1');
    expect(entries[0].rank).toBe(1);
    expect(entries[1].rank).toBe(2);
  });

  it('throws for unknown stat', async () => {
    const db = createMockDB();
    await expect(
      getTopPlayers('nonexistent_stat' as any, 10, db as unknown as D1Database)
    ).rejects.toThrow('Unknown leaderboard stat');
  });

  it('clamps limit to maximum 100', async () => {
    const db = createMockDB({ leaderboardRows: [] });
    // Should not throw; limit is clamped internally
    const entries = await getTopPlayers('battles_won', 999, db as unknown as D1Database);
    expect(Array.isArray(entries)).toBe(true);
  });

  it('clamps limit to minimum 1', async () => {
    const db = createMockDB({ leaderboardRows: [] });
    const entries = await getTopPlayers('battles_won', -5, db as unknown as D1Database);
    expect(Array.isArray(entries)).toBe(true);
  });

  it('works for all valid LeaderboardStat keys', async () => {
    const validStats = [
      'battles_won',
      'ships_destroyed',
      'resources_raided_metal',
      'fleets_dispatched',
      'planets_colonized',
      'research_completed',
      'buildings_built',
      'trades_completed',
      'agent_decisions',
    ] as const;
    const db = createMockDB({ leaderboardRows: [] });
    for (const stat of validStats) {
      const entries = await getTopPlayers(stat, 5, db as unknown as D1Database);
      expect(Array.isArray(entries)).toBe(true);
    }
  });

  it('maps player_name correctly to playerName field', async () => {
    const db = createMockDB({
      leaderboardRows: [{ player_id: 'p1', player_name: 'StarLord', value: 99 }],
    });
    const entries = await getTopPlayers('battles_won', 1, db as unknown as D1Database);
    expect(entries[0].playerName).toBe('StarLord');
    expect(entries[0].value).toBe(99);
  });
});

// ============================================================================
// StatsService class wrapper
// ============================================================================

describe('StatsService class', () => {
  it('updateStats delegates correctly', async () => {
    const db = createMockDB();
    await statsService.updateStats('p1', 'battle_win', {}, db as unknown as D1Database);
    const calls = (db as any)._updates.filter((u: any) => u.sql.includes('battles_won'));
    expect(calls.length).toBeGreaterThan(0);
  });

  it('getPlayerStats delegates correctly', async () => {
    const db = createMockDB();
    const stats = await statsService.getPlayerStats('nobody', db as unknown as D1Database);
    expect(stats.playerId).toBe('nobody');
  });

  it('getTopPlayers delegates correctly', async () => {
    const db = createMockDB({ leaderboardRows: [] });
    const entries = await statsService.getTopPlayers('battles_won', 5, db as unknown as D1Database);
    expect(Array.isArray(entries)).toBe(true);
  });

  it('resetStats sends UPDATE with all zero columns', async () => {
    const db = createMockDB();
    await statsService.resetStats('p1', db as unknown as D1Database);
    const calls = (db as any)._updates.filter((u: any) =>
      u.sql.includes('battles_won = 0')
    );
    expect(calls.length).toBeGreaterThan(0);
  });
});
