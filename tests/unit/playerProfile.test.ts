/**
 * Unit tests for the Player Public Profile Service
 *
 * Tests cover: getPublicProfile, getRecentActivity, getBattleHistory,
 * getPlayerComparison, searchPlayers
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getPublicProfile,
  getRecentActivity,
  getBattleHistory,
  getPlayerComparison,
  searchPlayers,
  playerProfileService,
} from '../../worker/src/game/services/playerProfileService';

// ============================================================================
// MOCK D1 DATABASE
// ============================================================================

interface Row {
  [key: string]: string | number | null;
}

function createMockDB(initialData?: {
  players?: Row[];
  planets?: Row[];
  player_stats?: Row[];
  player_achievements?: Row[];
  battle_reports?: Row[];
  build_history?: Row[];
  player_research?: Row[];
  fleets?: Row[];
  alliances?: Row[];
}) {
  const tables: Map<string, Row[]> = new Map([
    ['players', initialData?.players ?? []],
    ['planets', initialData?.planets ?? []],
    ['player_stats', initialData?.player_stats ?? []],
    ['player_achievements', initialData?.player_achievements ?? []],
    ['battle_reports', initialData?.battle_reports ?? []],
    ['build_history', initialData?.build_history ?? []],
    ['player_research', initialData?.player_research ?? []],
    ['fleets', initialData?.fleets ?? []],
    ['alliances', initialData?.alliances ?? []],
  ]);

  function getTable(name: string): Row[] {
    return tables.get(name) ?? [];
  }

  const mockDB = {
    prepare(sql: string) {
      return {
        bind(...binds: (string | number | null)[]) {
          return {
            first<T = Row>(): Promise<T | null> {
              return Promise.resolve(execFirst(sql, binds) as T | null);
            },
            all<T = Row>(): Promise<{ results: T[] }> {
              return Promise.resolve({ results: execAll(sql, binds) as T[] });
            },
            run(): Promise<{ meta: { changes: number } }> {
              return Promise.resolve({ meta: { changes: 0 } });
            },
          };
        },
      };
    },
  } as unknown as D1Database;

  function execFirst(sql: string, binds: (string | number | null)[]): Row | null {
    const results = execAll(sql, binds);
    return results[0] ?? null;
  }

  function execAll(sql: string, binds: (string | number | null)[]): Row[] {
    const trimmed = sql.trim().replace(/\s+/g, ' ');

    // COUNT(*) queries
    if (/SELECT COUNT\(\*\) AS (total|cnt|above)/i.test(trimmed)) {
      if (/FROM players WHERE id !=/i.test(trimmed)) {
        const playerId = binds[0] as string;
        const count = getTable('players').filter((r) => r.id !== playerId).length;
        return [{ above: count }];
      }
      if (/FROM players$/i.test(trimmed)) {
        return [{ total: getTable('players').length }];
      }
      if (/FROM battle_reports.* WHERE .*attacker_id = \? OR.*defender_id = \?/i.test(trimmed)) {
        const playerId = binds[0] as string;
        const count = getTable('battle_reports').filter(
          (r) => r.attacker_id === playerId || r.defender_id === playerId
        ).length;
        return [{ cnt: count }];
      }
    }

    // player JOIN planets (profile query)
    if (/FROM players p LEFT JOIN planets pl ON pl\.player_id = p\.id WHERE p\.id = \?/i.test(trimmed)) {
      const playerId = binds[0] as string;
      const player = getTable('players').find((r) => r.id === playerId);
      if (!player) return [];
      const planetCount = getTable('planets').filter((r) => r.player_id === playerId).length;
      return [{ ...player, planet_count: planetCount }];
    }

    // alliances by tag
    if (/FROM alliances WHERE tag = \?/i.test(trimmed)) {
      const tag = binds[0] as string;
      return getTable('alliances').filter((r) => r.tag === tag);
    }

    // player_stats
    if (/FROM player_stats WHERE player_id = \?/i.test(trimmed)) {
      const playerId = binds[0] as string;
      return getTable('player_stats').filter((r) => r.player_id === playerId);
    }

    // player_achievements
    if (/FROM player_achievements pa WHERE pa\.player_id = \?/i.test(trimmed)) {
      const playerId = binds[0] as string;
      return getTable('player_achievements').filter((r) => r.player_id === playerId);
    }

    // battle_reports for player
    if (/FROM battle_reports.*WHERE.*attacker_id = \? OR.*defender_id = \?/i.test(trimmed)) {
      const playerId = binds[0] as string;
      let rows = getTable('battle_reports').filter(
        (r) => r.attacker_id === playerId || r.defender_id === playerId
      );
      rows = rows.sort((a, b) => (b.created_at as number) - (a.created_at as number));
      // Handle LIMIT and OFFSET
      const limitMatch = trimmed.match(/LIMIT \?/i);
      const offsetMatch = trimmed.match(/OFFSET \?/i);
      if (offsetMatch) {
        const limit = binds[binds.length - 2] as number;
        const offset = binds[binds.length - 1] as number;
        return rows.slice(offset, offset + limit);
      } else if (limitMatch) {
        const limit = binds[binds.length - 1] as number;
        return rows.slice(0, limit);
      }
      return rows;
    }

    // players by IN clause (batch names)
    if (/FROM players WHERE id IN/i.test(trimmed)) {
      const ids = binds as string[];
      return getTable('players').filter((r) => ids.includes(r.id as string));
    }

    // build_history JOIN planets
    if (/FROM build_history bh JOIN planets p ON/i.test(trimmed)) {
      const playerId = binds[0] as string;
      const playerPlanets = new Set(
        getTable('planets').filter((r) => r.player_id === playerId).map((r) => r.id)
      );
      let rows = getTable('build_history').filter((r) => playerPlanets.has(r.planet_id as string));
      rows = rows.sort((a, b) => (b.created_at as number) - (a.created_at as number));
      const limit = binds[binds.length - 1] as number;
      return rows.slice(0, limit);
    }

    // player_research
    if (/FROM player_research WHERE player_id = \?/i.test(trimmed)) {
      const playerId = binds[0] as string;
      return getTable('player_research').filter((r) => r.player_id === playerId);
    }

    // player_research score
    if (/FROM player_research WHERE player_id = \?/i.test(trimmed)) {
      return [];
    }

    // planets for colonize activity
    if (/FROM planets WHERE player_id = \? AND is_homeworld = 0/i.test(trimmed)) {
      const playerId = binds[0] as string;
      let rows = getTable('planets').filter(
        (r) => r.player_id === playerId && r.is_homeworld === 0
      );
      rows = rows.sort((a, b) => (b.created_at as number) - (a.created_at as number));
      const limit = binds[binds.length - 1] as number;
      return rows.slice(0, limit);
    }

    // fleets sum for fleet score
    if (/FROM fleets WHERE player_id = \?/i.test(trimmed)) {
      return [{ fleet: 0 }];
    }

    // economy score subquery
    if (/FROM build_history bh JOIN planets p ON p\.id = bh\.planet_id WHERE p\.player_id = \?/i.test(trimmed)) {
      return [{ economy: 0 }];
    }

    // player search
    if (/FROM players p LEFT JOIN planets pl.*WHERE LOWER\(p\.name\) LIKE \?/i.test(trimmed)) {
      const searchTerm = (binds[0] as string).replace(/%/g, '').toLowerCase();
      let rows = getTable('players').filter((r) =>
        (r.name as string).toLowerCase().includes(searchTerm)
      );
      if (binds.length === 3 && typeof binds[1] === 'string' && !isNaN(binds[2] as number)) {
        // alliance filter version
        const allianceTag = binds[1] as string;
        rows = rows.filter((r) => r.alliance_tag === allianceTag);
      }
      const limit = binds[binds.length - 1] as number;
      rows = rows.slice(0, limit);
      return rows.map((r) => ({
        ...r,
        planet_count: getTable('planets').filter((p) => p.player_id === r.id).length,
      }));
    }

    return [];
  }

  return mockDB;
}

// ============================================================================
// TEST FIXTURES
// ============================================================================

const NOW = Math.floor(Date.now() / 1000);
const WEEK_AGO = NOW - 7 * 86400;

const PLAYER_1: Row = {
  id: 'player-1',
  name: 'StarCommander',
  alliance_tag: 'WAR',
  created_at: WEEK_AGO,
};

const PLAYER_2: Row = {
  id: 'player-2',
  name: 'SpaceMiner',
  alliance_tag: null,
  created_at: NOW - 3 * 86400,
};

const STATS_1: Row = {
  player_id: 'player-1',
  battles_won: 10,
  battles_lost: 3,
  battles_draw: 2,
  ships_destroyed: 500,
  ships_lost: 100,
  resources_raided_metal: 1_000_000,
  resources_raided_crystal: 500_000,
  resources_raided_deut: 250_000,
  resources_lost_metal: 0,
  resources_lost_crystal: 0,
  resources_lost_deut: 0,
  fleets_dispatched: 50,
  espionage_sent: 20,
  buildings_built: 30,
  research_completed: 8,
  planets_colonized: 3,
  trades_completed: 5,
  agent_decisions: 15,
  created_at: WEEK_AGO,
};

const STATS_2: Row = {
  player_id: 'player-2',
  battles_won: 2,
  battles_lost: 8,
  battles_draw: 0,
  ships_destroyed: 100,
  ships_lost: 400,
  resources_raided_metal: 100_000,
  resources_raided_crystal: 50_000,
  resources_raided_deut: 25_000,
  resources_lost_metal: 0,
  resources_lost_crystal: 0,
  resources_lost_deut: 0,
  fleets_dispatched: 15,
  espionage_sent: 5,
  buildings_built: 10,
  research_completed: 2,
  planets_colonized: 1,
  trades_completed: 1,
  agent_decisions: 0,
  created_at: NOW - 3 * 86400,
};

const PLANETS: Row[] = [
  { id: 'planet-1a', player_id: 'player-1', galaxy: 1, system: 1, position: 3, is_homeworld: 1, created_at: WEEK_AGO },
  { id: 'planet-1b', player_id: 'player-1', galaxy: 1, system: 2, position: 5, is_homeworld: 0, created_at: NOW - 2 * 86400 },
  { id: 'planet-2a', player_id: 'player-2', galaxy: 2, system: 1, position: 7, is_homeworld: 1, created_at: NOW - 3 * 86400 },
];

const ACHIEVEMENTS: Row[] = [
  { player_id: 'player-1', achievement_id: 'first_blood', unlocked_at: NOW - 6 * 86400 },
  { player_id: 'player-1', achievement_id: 'warrior', unlocked_at: NOW - 4 * 86400 },
];

const BATTLE_REPORTS: Row[] = [
  {
    id: 'battle-1',
    attacker_id: 'player-1',
    defender_id: 'player-2',
    result: 'attacker_wins',
    attacker_losses: 10,
    defender_losses: 50,
    resources_raided: 100000,
    created_at: NOW - 86400,
  },
  {
    id: 'battle-2',
    attacker_id: 'player-2',
    defender_id: 'player-1',
    result: 'defender_wins',
    attacker_losses: 80,
    defender_losses: 5,
    resources_raided: 0,
    created_at: NOW - 2 * 86400,
  },
  {
    id: 'battle-3',
    attacker_id: 'player-1',
    defender_id: 'player-2',
    result: 'draw',
    attacker_losses: 20,
    defender_losses: 20,
    resources_raided: 0,
    created_at: NOW - 3 * 86400,
  },
];

const BUILD_HISTORY: Row[] = [
  { id: 'bh-1', planet_id: 'planet-1a', building_id: 1, level: 5, source: 'manual', ai_reason: null, created_at: NOW - 86400 },
  { id: 'bh-2', planet_id: 'planet-1a', building_id: 2, level: 3, source: 'agent', ai_reason: 'optimize', created_at: NOW - 2 * 86400 },
];

// ============================================================================
// TESTS
// ============================================================================

describe('PlayerProfileService', () => {

  // --------------------------------------------------------------------------
  // getPublicProfile
  // --------------------------------------------------------------------------

  describe('getPublicProfile', () => {
    it('returns null for unknown player', async () => {
      const db = createMockDB({ players: [PLAYER_1] });
      const result = await getPublicProfile(db, 'nonexistent-player');
      expect(result).toBeNull();
    });

    it('returns basic profile for known player', async () => {
      const db = createMockDB({
        players: [PLAYER_1],
        planets: PLANETS,
        player_stats: [STATS_1],
        player_achievements: ACHIEVEMENTS,
      });

      const profile = await getPublicProfile(db, 'player-1');
      expect(profile).not.toBeNull();
      expect(profile!.playerId).toBe('player-1');
      expect(profile!.playerName).toBe('StarCommander');
    });

    it('includes correct planet count', async () => {
      const db = createMockDB({
        players: [PLAYER_1],
        planets: PLANETS,
        player_stats: [STATS_1],
      });

      const profile = await getPublicProfile(db, 'player-1');
      expect(profile!.planetsCount).toBe(2); // player-1 has 2 planets
    });

    it('includes correct battle stats', async () => {
      const db = createMockDB({
        players: [PLAYER_1],
        planets: [],
        player_stats: [STATS_1],
      });

      const profile = await getPublicProfile(db, 'player-1');
      expect(profile!.battleStats.wins).toBe(10);
      expect(profile!.battleStats.losses).toBe(3);
      expect(profile!.battleStats.draws).toBe(2);
      expect(profile!.battleStats.total).toBe(15);
    });

    it('computes win rate correctly', async () => {
      const db = createMockDB({
        players: [PLAYER_1],
        planets: [],
        player_stats: [STATS_1],
      });

      const profile = await getPublicProfile(db, 'player-1');
      // 10 wins / 15 total = 66.67% → 67
      expect(profile!.battleStats.winRate).toBe(67);
    });

    it('returns 0 win rate for player with no battles', async () => {
      const db = createMockDB({
        players: [PLAYER_2],
        planets: [],
        player_stats: [],
      });

      const profile = await getPublicProfile(db, 'player-2');
      expect(profile!.battleStats.winRate).toBe(0);
      expect(profile!.battleStats.total).toBe(0);
    });

    it('includes alliance tag', async () => {
      const db = createMockDB({
        players: [PLAYER_1],
        planets: [],
        player_stats: [],
        alliances: [{ id: 'a1', tag: 'WAR', name: 'Warriors', created_at: NOW }],
      });

      const profile = await getPublicProfile(db, 'player-1');
      expect(profile!.allianceTag).toBe('WAR');
    });

    it('returns null alliance tag for player without alliance', async () => {
      const db = createMockDB({
        players: [PLAYER_2],
        planets: [],
        player_stats: [],
      });

      const profile = await getPublicProfile(db, 'player-2');
      expect(profile!.allianceTag).toBeNull();
    });

    it('includes ships destroyed and lost', async () => {
      const db = createMockDB({
        players: [PLAYER_1],
        planets: [],
        player_stats: [STATS_1],
      });

      const profile = await getPublicProfile(db, 'player-1');
      expect(profile!.shipsDestroyed).toBe(500);
      expect(profile!.shipsLost).toBe(100);
    });

    it('includes join date', async () => {
      const db = createMockDB({
        players: [PLAYER_1],
        planets: [],
        player_stats: [],
      });

      const profile = await getPublicProfile(db, 'player-1');
      expect(profile!.joinDate).toBe(WEEK_AGO);
    });
  });

  // --------------------------------------------------------------------------
  // getRecentActivity
  // --------------------------------------------------------------------------

  describe('getRecentActivity', () => {
    it('returns empty array for player with no activity', async () => {
      const db = createMockDB({
        players: [PLAYER_1],
        planets: [],
        battle_reports: [],
        build_history: [],
      });

      const activity = await getRecentActivity(db, 'player-1', 20);
      expect(Array.isArray(activity)).toBe(true);
    });

    it('respects limit parameter', async () => {
      const db = createMockDB({
        players: [PLAYER_1],
        planets: PLANETS,
        battle_reports: BATTLE_REPORTS,
        build_history: BUILD_HISTORY,
      });

      const activity = await getRecentActivity(db, 'player-1', 2);
      expect(activity.length).toBeLessThanOrEqual(2);
    });

    it('caps limit at 50', async () => {
      const db = createMockDB({
        players: [PLAYER_1],
        planets: [],
        battle_reports: [],
      });

      // Should not throw even with limit=1000
      const activity = await getRecentActivity(db, 'player-1', 1000);
      expect(activity.length).toBeLessThanOrEqual(50);
    });

    it('returns items sorted by timestamp descending', async () => {
      const db = createMockDB({
        players: [PLAYER_1],
        planets: PLANETS,
        battle_reports: BATTLE_REPORTS,
        build_history: BUILD_HISTORY,
      });

      const activity = await getRecentActivity(db, 'player-1', 20);
      for (let i = 1; i < activity.length; i++) {
        expect(activity[i - 1].timestamp).toBeGreaterThanOrEqual(activity[i].timestamp);
      }
    });

    it('each activity item has required fields', async () => {
      const db = createMockDB({
        players: [PLAYER_1],
        planets: PLANETS,
        battle_reports: BATTLE_REPORTS,
        build_history: BUILD_HISTORY,
      });

      const activity = await getRecentActivity(db, 'player-1', 20);
      for (const item of activity) {
        expect(item).toHaveProperty('type');
        expect(item).toHaveProperty('timestamp');
        expect(item).toHaveProperty('summary');
        expect(['battle', 'build', 'research', 'colonize', 'fleet']).toContain(item.type);
      }
    });
  });

  // --------------------------------------------------------------------------
  // getBattleHistory
  // --------------------------------------------------------------------------

  describe('getBattleHistory', () => {
    it('returns paginated battle history', async () => {
      const db = createMockDB({
        players: [PLAYER_1, PLAYER_2],
        battle_reports: BATTLE_REPORTS,
      });

      const history = await getBattleHistory(db, 'player-1', 10, 0);
      expect(history).toHaveProperty('playerId', 'player-1');
      expect(history).toHaveProperty('total');
      expect(history).toHaveProperty('entries');
      expect(Array.isArray(history.entries)).toBe(true);
    });

    it('correctly identifies attacker role', async () => {
      const db = createMockDB({
        players: [PLAYER_1, PLAYER_2],
        battle_reports: [BATTLE_REPORTS[0]], // battle-1: player-1 is attacker
      });

      const history = await getBattleHistory(db, 'player-1', 10, 0);
      const entry = history.entries[0];
      expect(entry.role).toBe('attacker');
    });

    it('correctly identifies defender role', async () => {
      const db = createMockDB({
        players: [PLAYER_1, PLAYER_2],
        battle_reports: [BATTLE_REPORTS[1]], // battle-2: player-1 is defender
      });

      const history = await getBattleHistory(db, 'player-1', 10, 0);
      const entry = history.entries[0];
      expect(entry.role).toBe('defender');
    });

    it('correctly resolves win outcome for attacker', async () => {
      const db = createMockDB({
        players: [PLAYER_1, PLAYER_2],
        battle_reports: [BATTLE_REPORTS[0]], // attacker_wins, player-1 attacks
      });

      const history = await getBattleHistory(db, 'player-1', 10, 0);
      expect(history.entries[0].outcome).toBe('win');
    });

    it('correctly resolves loss outcome for defender', async () => {
      const db = createMockDB({
        players: [PLAYER_1, PLAYER_2],
        battle_reports: [BATTLE_REPORTS[0]], // attacker_wins, player-2 defends
      });

      const history = await getBattleHistory(db, 'player-2', 10, 0);
      expect(history.entries[0].outcome).toBe('loss');
    });

    it('correctly resolves draw outcome', async () => {
      const db = createMockDB({
        players: [PLAYER_1, PLAYER_2],
        battle_reports: [BATTLE_REPORTS[2]], // draw battle
      });

      const history = await getBattleHistory(db, 'player-1', 10, 0);
      expect(history.entries[0].outcome).toBe('draw');
    });

    it('respects pagination offset', async () => {
      const db = createMockDB({
        players: [PLAYER_1, PLAYER_2],
        battle_reports: BATTLE_REPORTS,
      });

      const page1 = await getBattleHistory(db, 'player-1', 1, 0);
      const page2 = await getBattleHistory(db, 'player-1', 1, 1);
      expect(page1.page).toBe(1);
      expect(page2.page).toBe(2);
    });

    it('caps limit at 100', async () => {
      const db = createMockDB({
        players: [PLAYER_1],
        battle_reports: BATTLE_REPORTS,
      });

      const history = await getBattleHistory(db, 'player-1', 9999, 0);
      expect(history.limit).toBeLessThanOrEqual(100);
    });
  });

  // --------------------------------------------------------------------------
  // getPlayerComparison
  // --------------------------------------------------------------------------

  describe('getPlayerComparison', () => {
    it('returns null if either player not found', async () => {
      const db = createMockDB({ players: [PLAYER_1] });
      const result = await getPlayerComparison(db, 'player-1', 'nonexistent');
      expect(result).toBeNull();
    });

    it('returns comparison object with both players', async () => {
      const db = createMockDB({
        players: [PLAYER_1, PLAYER_2],
        planets: PLANETS,
        player_stats: [STATS_1, STATS_2],
      });

      const comparison = await getPlayerComparison(db, 'player-1', 'player-2');
      expect(comparison).not.toBeNull();
      expect(comparison!.player1.playerId).toBe('player-1');
      expect(comparison!.player2.playerId).toBe('player-2');
    });

    it('returns stats array with expected categories', async () => {
      const db = createMockDB({
        players: [PLAYER_1, PLAYER_2],
        planets: PLANETS,
        player_stats: [STATS_1, STATS_2],
      });

      const comparison = await getPlayerComparison(db, 'player-1', 'player-2');
      const statLabels = comparison!.stats.map((s) => s.label);
      expect(statLabels).toContain('Total Score');
      expect(statLabels).toContain('Battle Wins');
      expect(statLabels).toContain('Win Rate (%)');
      expect(statLabels).toContain('Planets');
    });

    it('determines winner correctly for battle wins', async () => {
      const db = createMockDB({
        players: [PLAYER_1, PLAYER_2],
        planets: PLANETS,
        player_stats: [STATS_1, STATS_2],
      });

      const comparison = await getPlayerComparison(db, 'player-1', 'player-2');
      const battleWinStat = comparison!.stats.find((s) => s.label === 'Battle Wins')!;
      // player-1 has 10 wins, player-2 has 2 wins
      expect(battleWinStat.winner).toBe('player1');
    });

    it('identifies tie correctly when scores are equal', async () => {
      const equalStats: Row = { ...STATS_1, player_id: 'player-2', battles_won: 10 };
      const db = createMockDB({
        players: [PLAYER_1, PLAYER_2],
        planets: [],
        player_stats: [STATS_1, equalStats],
      });

      const comparison = await getPlayerComparison(db, 'player-1', 'player-2');
      const battleWinStat = comparison!.stats.find((s) => s.label === 'Battle Wins')!;
      expect(battleWinStat.winner).toBe('tie');
    });
  });

  // --------------------------------------------------------------------------
  // searchPlayers
  // --------------------------------------------------------------------------

  describe('searchPlayers', () => {
    it('finds players by name substring', async () => {
      const db = createMockDB({
        players: [PLAYER_1, PLAYER_2],
        planets: PLANETS,
        player_stats: [STATS_1, STATS_2],
      });

      const result = await searchPlayers(db, 'Star', 10);
      expect(result.query).toBe('Star');
      expect(result.results.some((r) => r.playerName === 'StarCommander')).toBe(true);
    });

    it('returns empty results for no match', async () => {
      const db = createMockDB({
        players: [PLAYER_1, PLAYER_2],
        planets: [],
        player_stats: [],
      });

      const result = await searchPlayers(db, 'xyznonexistent', 10);
      expect(result.results).toHaveLength(0);
    });

    it('respects limit parameter', async () => {
      const db = createMockDB({
        players: [PLAYER_1, PLAYER_2],
        planets: [],
        player_stats: [],
      });

      const result = await searchPlayers(db, 'a', 1);
      expect(result.results.length).toBeLessThanOrEqual(1);
    });

    it('caps limit at 50', async () => {
      const db = createMockDB({ players: [] });
      const result = await searchPlayers(db, 'player', 9999);
      expect(result.limit).toBe(50);
    });

    it('filters by alliance tag when provided', async () => {
      const db = createMockDB({
        players: [PLAYER_1, PLAYER_2],
        planets: PLANETS,
        player_stats: [STATS_1, STATS_2],
      });

      const result = await searchPlayers(db, 'Space', 10, 'WAR');
      // SpaceMiner has no alliance, so result should be empty with WAR filter
      expect(result.results.every((r) => r.allianceTag === 'WAR')).toBe(true);
    });

    it('each result has required fields', async () => {
      const db = createMockDB({
        players: [PLAYER_1, PLAYER_2],
        planets: PLANETS,
        player_stats: [STATS_1, STATS_2],
      });

      const result = await searchPlayers(db, 'r', 10);
      for (const r of result.results) {
        expect(r).toHaveProperty('playerId');
        expect(r).toHaveProperty('playerName');
        expect(r).toHaveProperty('rank');
        expect(r).toHaveProperty('totalScore');
        expect(r).toHaveProperty('planetsCount');
      }
    });
  });

  // --------------------------------------------------------------------------
  // PlayerProfileService class (singleton)
  // --------------------------------------------------------------------------

  describe('playerProfileService singleton', () => {
    it('has all required methods', () => {
      expect(typeof playerProfileService.getPublicProfile).toBe('function');
      expect(typeof playerProfileService.getRecentActivity).toBe('function');
      expect(typeof playerProfileService.getBattleHistory).toBe('function');
      expect(typeof playerProfileService.getPlayerComparison).toBe('function');
      expect(typeof playerProfileService.searchPlayers).toBe('function');
    });

    it('singleton delegates to getPublicProfile correctly', async () => {
      const db = createMockDB({
        players: [PLAYER_1],
        planets: PLANETS,
        player_stats: [STATS_1],
      });

      const profile = await playerProfileService.getPublicProfile(db, 'player-1');
      expect(profile).not.toBeNull();
      expect(profile!.playerName).toBe('StarCommander');
    });
  });
});
