/**
 * Unit tests for leaderboardService.ts
 * Tests getLeaderboard and getPlayerProfile functions
 */
import { describe, it, expect } from 'vitest';
import {
  getLeaderboard,
  getPlayerProfile,
  type LeaderboardType,
} from '../../worker/src/game/services/leaderboardService';

// ============================================================================
// MOCK D1 DATABASE
// ============================================================================

interface Row {
  [key: string]: string | number | null;
}

function createMockDB(opts: {
  players?: Row[];
  planets?: Row[];
  buildHistory?: Row[];
  playerResearch?: Row[];
  fleets?: Row[];
} = {}) {
  const {
    players = [],
    planets = [],
    buildHistory = [],
    playerResearch = [],
    fleets = [],
  } = opts;

  const mockDB = {
    prepare(sql: string) {
      const trimmed = sql.trim().replace(/\s+/g, ' ');

      // Handle queries called without .bind() directly
      const directResult = {
        async first<T>(): Promise<T | null> {
          if (/SELECT COUNT\(\*\) AS total FROM players/i.test(trimmed)) {
            return { total: players.length } as unknown as T;
          }
          return null;
        },
        bind(...binds: any[]) { return directResult; },
        async all<T>(): Promise<{ results: T[] }> { return { results: [] }; },
        async run(): Promise<void> {},
      };

      return {
        // Support calling .first() directly without .bind() for COUNT queries
        async first<T>(): Promise<T | null> {
          if (/SELECT COUNT\(\*\) AS total FROM players/i.test(trimmed)) {
            return { total: players.length } as unknown as T;
          }
          return null;
        },
        bind(...binds: any[]) {
          return {
            async first<T>(): Promise<T | null> {
              // COUNT(*) total players
              if (/SELECT COUNT\(\*\) AS total FROM players/i.test(trimmed)) {
                return { total: players.length } as unknown as T;
              }

              // Economy score subquery
              if (/SUM\(max_level \* 1000\)/i.test(trimmed)) {
                const playerId = binds[0] as string;
                const playerPlanetIds = new Set(
                  planets.filter((p) => p.player_id === playerId).map((p) => p.id)
                );
                // Sum max level per (planet_id, building_id)
                const grouped: Record<string, number> = {};
                for (const row of buildHistory) {
                  if (!playerPlanetIds.has(row.planet_id as string)) continue;
                  const key = `${row.planet_id}-${row.building_id}`;
                  grouped[key] = Math.max(grouped[key] ?? 0, row.level as number);
                }
                const economy = Object.values(grouped).reduce((s, l) => s + l * 1000, 0);
                return { economy } as unknown as T;
              }

              // Research score
              if (/SUM\(level \* 2000\)/i.test(trimmed)) {
                const playerId = binds[0] as string;
                const research = playerResearch
                  .filter((r) => r.player_id === playerId)
                  .reduce((s, r) => s + (r.level as number) * 2000, 0);
                return { research } as unknown as T;
              }

              // Fleet score
              if (/SUM\(.*\) \* 500/i.test(trimmed) || /\* 500, 0\) AS fleet/i.test(trimmed)) {
                const playerId = binds[0] as string;
                const fleet =
                  fleets
                    .filter((f) => f.player_id === playerId)
                    .reduce((s, f) => {
                      const shipCols = [
                        'light_fighter', 'heavy_fighter', 'cruiser', 'battleship',
                        'battlecruiser', 'bomber', 'destroyer', 'deathstar',
                        'small_cargo', 'large_cargo', 'colony_ship', 'recycler',
                        'espionage_probe',
                      ];
                      return s + shipCols.reduce((ss, col) => ss + ((f[col] as number) ?? 0), 0);
                    }, 0) * 500;
                return { fleet } as unknown as T;
              }

              // Player profile query (JOIN planets WHERE p.id = ?)
              if (
                /FROM players p LEFT JOIN planets pl ON pl\.player_id = p\.id WHERE p\.id = \?/i.test(trimmed)
              ) {
                const playerId = binds[0] as string;
                const player = players.find((p) => p.id === playerId);
                if (!player) return null;
                const planetCount = planets.filter((p) => p.player_id === playerId).length;
                return { ...player, planet_count: planetCount } as unknown as T;
              }

              return null;
            },

            async all<T>(): Promise<{ results: T[] }> {
              // Players list for leaderboard
              if (/SELECT p\.id, p\.name, p\.alliance_tag/i.test(trimmed)) {
                const limit = binds[0] as number;
                const mapped = players.slice(0, limit).map((p) => ({
                  ...p,
                  planet_count: planets.filter((pl) => pl.player_id === p.id).length,
                }));
                return { results: mapped as unknown as T[] };
              }

              // Build history for profile (recent activity)
              if (/FROM build_history bh JOIN planets p ON/i.test(trimmed)) {
                const playerId = binds[0] as string;
                const playerPlanetIds = new Set(
                  planets.filter((p) => p.player_id === playerId).map((p) => p.id)
                );
                let rows = buildHistory
                  .filter((bh) => playerPlanetIds.has(bh.planet_id as string))
                  .sort((a, b) => (b.created_at as number) - (a.created_at as number))
                  .slice(0, 5);
                return { results: rows as unknown as T[] };
              }

              return { results: [] };
            },

            async run(): Promise<void> {},
          };
        },
      };
    },
  } as unknown as D1Database;

  return mockDB;
}

// ============================================================================
// Test fixtures
// ============================================================================

const NOW = Math.floor(Date.now() / 1000);
const WEEK_AGO = NOW - 7 * 86400;

const PLAYERS: Row[] = [
  { id: 'p1', name: 'Alpha', alliance_tag: 'WAR', created_at: WEEK_AGO },
  { id: 'p2', name: 'Beta', alliance_tag: null, created_at: NOW - 3 * 86400 },
  { id: 'p3', name: 'Gamma', alliance_tag: 'WAR', created_at: NOW - 1 * 86400 },
];

const PLANETS: Row[] = [
  { id: 'pl1', player_id: 'p1', is_homeworld: 1, created_at: WEEK_AGO },
  { id: 'pl2', player_id: 'p1', is_homeworld: 0, created_at: NOW - 3 * 86400 },
  { id: 'pl3', player_id: 'p2', is_homeworld: 1, created_at: NOW - 3 * 86400 },
];

const BUILD_HISTORY: Row[] = [
  { planet_id: 'pl1', building_id: 1, level: 5, source: 'manual', ai_reason: null, created_at: NOW - 86400 },
  { planet_id: 'pl1', building_id: 2, level: 3, source: 'agent', ai_reason: 'optimize', created_at: NOW - 2 * 86400 },
  { planet_id: 'pl2', building_id: 1, level: 2, source: 'manual', ai_reason: null, created_at: NOW - 3 * 86400 },
];

const PLAYER_RESEARCH: Row[] = [
  { player_id: 'p1', tech_id: 1, level: 5 },
  { player_id: 'p1', tech_id: 2, level: 3 },
  { player_id: 'p2', tech_id: 1, level: 1 },
];

const FLEETS: Row[] = [
  { player_id: 'p1', light_fighter: 10, heavy_fighter: 0, cruiser: 5, battleship: 0,
    battlecruiser: 0, bomber: 0, destroyer: 0, deathstar: 0,
    small_cargo: 2, large_cargo: 0, colony_ship: 0, recycler: 0, espionage_probe: 3 },
];

// ============================================================================
// getLeaderboard
// ============================================================================

describe('getLeaderboard', () => {
  it('returns correct type field', async () => {
    const db = createMockDB({ players: PLAYERS, planets: PLANETS });
    const result = await getLeaderboard('points', 1, 10, db);
    expect(result.type).toBe('points');
  });

  it('returns total player count', async () => {
    const db = createMockDB({ players: PLAYERS, planets: PLANETS });
    const result = await getLeaderboard('points', 1, 10, db);
    expect(result.total).toBe(3);
  });

  it('returns empty entries for no players', async () => {
    const db = createMockDB({ players: [] });
    const result = await getLeaderboard('points', 1, 10, db);
    expect(result.entries).toHaveLength(0);
  });

  it('assigns ranks starting at 1', async () => {
    const db = createMockDB({
      players: PLAYERS,
      planets: PLANETS,
      buildHistory: BUILD_HISTORY,
      playerResearch: PLAYER_RESEARCH,
      fleets: FLEETS,
    });
    const result = await getLeaderboard('points', 1, 10, db);
    expect(result.entries[0].rank).toBe(1);
  });

  it('sorts by economyScore when type=economy', async () => {
    const db = createMockDB({
      players: PLAYERS,
      planets: PLANETS,
      buildHistory: BUILD_HISTORY,
    });
    const result = await getLeaderboard('economy', 1, 10, db);
    // p1 has more build history → higher economy score
    if (result.entries.length >= 2) {
      expect(result.entries[0].economyScore).toBeGreaterThanOrEqual(result.entries[1].economyScore);
    }
  });

  it('sorts by researchScore when type=research', async () => {
    const db = createMockDB({
      players: PLAYERS,
      planets: PLANETS,
      playerResearch: PLAYER_RESEARCH,
    });
    const result = await getLeaderboard('research', 1, 10, db);
    if (result.entries.length >= 2) {
      expect(result.entries[0].researchScore).toBeGreaterThanOrEqual(result.entries[1].researchScore);
    }
  });

  it('sorts by fleetScore when type=fleet', async () => {
    const db = createMockDB({
      players: PLAYERS,
      planets: PLANETS,
      fleets: FLEETS,
    });
    const result = await getLeaderboard('fleet', 1, 10, db);
    if (result.entries.length >= 2) {
      expect(result.entries[0].fleetScore).toBeGreaterThanOrEqual(result.entries[1].fleetScore);
    }
  });

  it('clamps page to minimum 1', async () => {
    const db = createMockDB({ players: PLAYERS, planets: PLANETS });
    const result = await getLeaderboard('points', -99, 10, db);
    expect(result.page).toBe(1);
  });

  it('clamps limit to maximum 100', async () => {
    const db = createMockDB({ players: PLAYERS, planets: PLANETS });
    const result = await getLeaderboard('points', 1, 9999, db);
    expect(result.limit).toBeLessThanOrEqual(100);
  });

  it('clamps limit to minimum 1', async () => {
    const db = createMockDB({ players: PLAYERS, planets: PLANETS });
    const result = await getLeaderboard('points', 1, 0, db);
    expect(result.limit).toBe(1);
  });

  it('each entry has all required fields', async () => {
    const db = createMockDB({
      players: PLAYERS,
      planets: PLANETS,
      buildHistory: BUILD_HISTORY,
    });
    const result = await getLeaderboard('points', 1, 10, db);
    for (const entry of result.entries) {
      expect(entry).toHaveProperty('rank');
      expect(entry).toHaveProperty('playerId');
      expect(entry).toHaveProperty('playerName');
      expect(entry).toHaveProperty('score');
      expect(entry).toHaveProperty('economyScore');
      expect(entry).toHaveProperty('researchScore');
      expect(entry).toHaveProperty('fleetScore');
      expect(entry).toHaveProperty('planetCount');
    }
  });

  it('score = economyScore + researchScore + fleetScore', async () => {
    const db = createMockDB({
      players: PLAYERS,
      planets: PLANETS,
      buildHistory: BUILD_HISTORY,
      playerResearch: PLAYER_RESEARCH,
      fleets: FLEETS,
    });
    const result = await getLeaderboard('points', 1, 10, db);
    for (const entry of result.entries) {
      expect(entry.score).toBe(entry.economyScore + entry.researchScore + entry.fleetScore);
    }
  });

  it('includes allianceTag (null or string)', async () => {
    const db = createMockDB({ players: PLAYERS, planets: PLANETS });
    const result = await getLeaderboard('points', 1, 10, db);
    for (const entry of result.entries) {
      expect(['string', 'object'].includes(typeof entry.allianceTag)).toBe(true);
    }
  });
});

// ============================================================================
// getPlayerProfile
// ============================================================================

describe('getPlayerProfile', () => {
  it('returns null for nonexistent player', async () => {
    const db = createMockDB({ players: PLAYERS, planets: PLANETS });
    const result = await getPlayerProfile('nonexistent', db);
    expect(result).toBeNull();
  });

  it('returns profile for existing player', async () => {
    const db = createMockDB({
      players: PLAYERS,
      planets: PLANETS,
      buildHistory: BUILD_HISTORY,
      playerResearch: PLAYER_RESEARCH,
      fleets: FLEETS,
    });
    const result = await getPlayerProfile('p1', db);
    expect(result).not.toBeNull();
    expect(result!.playerId).toBe('p1');
    expect(result!.playerName).toBe('Alpha');
  });

  it('includes correct planet count', async () => {
    const db = createMockDB({
      players: PLAYERS,
      planets: PLANETS,
      buildHistory: BUILD_HISTORY,
    });
    const result = await getPlayerProfile('p1', db);
    expect(result!.planetCount).toBe(2); // p1 has 2 planets
  });

  it('includes alliance tag', async () => {
    const db = createMockDB({
      players: PLAYERS,
      planets: PLANETS,
      buildHistory: BUILD_HISTORY,
    });
    const result = await getPlayerProfile('p1', db);
    expect(result!.allianceTag).toBe('WAR');
  });

  it('returns null allianceTag for player without alliance', async () => {
    const db = createMockDB({
      players: PLAYERS,
      planets: PLANETS,
      buildHistory: BUILD_HISTORY,
    });
    const result = await getPlayerProfile('p2', db);
    expect(result!.allianceTag).toBeNull();
  });

  it('totalScore = economy + research + fleet', async () => {
    const db = createMockDB({
      players: PLAYERS,
      planets: PLANETS,
      buildHistory: BUILD_HISTORY,
      playerResearch: PLAYER_RESEARCH,
      fleets: FLEETS,
    });
    const result = await getPlayerProfile('p1', db);
    expect(result!.totalScore).toBe(result!.economyScore + result!.researchScore + result!.fleetScore);
  });

  it('includes joinedAt timestamp', async () => {
    const db = createMockDB({
      players: PLAYERS,
      planets: PLANETS,
      buildHistory: BUILD_HISTORY,
    });
    const result = await getPlayerProfile('p1', db);
    expect(result!.joinedAt).toBe(WEEK_AGO);
  });

  it('recentActivity is an array', async () => {
    const db = createMockDB({
      players: PLAYERS,
      planets: PLANETS,
      buildHistory: BUILD_HISTORY,
    });
    const result = await getPlayerProfile('p1', db);
    expect(Array.isArray(result!.recentActivity)).toBe(true);
  });

  it('recentActivity limited to 5 entries', async () => {
    const manyBuilds: Row[] = Array.from({ length: 10 }, (_, i) => ({
      planet_id: 'pl1',
      building_id: i + 1,
      level: i + 1,
      source: 'manual',
      ai_reason: null,
      created_at: NOW - i * 3600,
    }));
    const db = createMockDB({
      players: PLAYERS,
      planets: PLANETS,
      buildHistory: manyBuilds,
    });
    const result = await getPlayerProfile('p1', db);
    expect(result!.recentActivity.length).toBeLessThanOrEqual(5);
  });

  it('recentActivity items have required fields', async () => {
    const db = createMockDB({
      players: PLAYERS,
      planets: PLANETS,
      buildHistory: BUILD_HISTORY,
    });
    const result = await getPlayerProfile('p1', db);
    for (const item of result!.recentActivity) {
      expect(item).toHaveProperty('buildingId');
      expect(item).toHaveProperty('level');
      expect(item).toHaveProperty('source');
      expect(item).toHaveProperty('createdAt');
    }
  });
});
