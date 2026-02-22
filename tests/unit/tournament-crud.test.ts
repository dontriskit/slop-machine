/**
 * tournament-crud.test.ts
 *
 * Comprehensive CRUD and bracket validation tests for Tournament Service
 *
 * Tests cover:
 *   - Tournament creation with valid/invalid parameters
 *   - Player joining and duplicate join prevention
 *   - Tournament full state handling
 *   - Bracket generation for power-of-2 and non-power-of-2 players
 *   - Tournament retrieval by ID
 *   - Edge cases and validation
 */

import { describe, it, expect, beforeEach, vi, MockedFunction } from 'vitest';
import {
  createTournament,
  getTournament,
  joinTournament,
  generateBracket,
  getBracket,
  getTournamentMatches,
  Tournament,
  TournamentPlayer,
  Bracket,
} from '../../worker/src/game/services/tournamentService';
import { D1Database } from '@cloudflare/workers-types';

// ============================================================================
// MOCK DATABASE SETUP
// ============================================================================

interface MockDbState {
  tournaments: Map<string, any>;
  tournamentPlayers: Map<string, any[]>;
  brackets: Map<string, any>;
  matches: Map<string, any[]>;
}

let dbState: MockDbState = {
  tournaments: new Map(),
  tournamentPlayers: new Map(),
  brackets: new Map(),
  matches: new Map(),
};

const resetDbState = () => {
  dbState = {
    tournaments: new Map(),
    tournamentPlayers: new Map(),
    brackets: new Map(),
    matches: new Map(),
  };
};

/**
 * Create a mock D1Database that simulates real database behavior
 */
function createMockDb(): D1Database {
  const mockDb = {
    prepare: vi.fn(function(sql: string) {
      return {
        bind: vi.fn(function(...params: any[]) {
          return {
            run: vi.fn(async function() {
              // Simulate INSERT INTO tournaments
              if (sql.includes('INSERT INTO tournaments')) {
                const [id, name, type, maxPlayers, currentRound, totalRounds, status, seasonId, createdAt] = params;
                dbState.tournaments.set(id, {
                  id,
                  name,
                  type,
                  max_players: maxPlayers,
                  current_round: currentRound,
                  total_rounds: totalRounds,
                  status,
                  season_id: seasonId,
                  created_at: createdAt,
                  started_at: null,
                  completed_at: null,
                });
              }
              // Simulate INSERT INTO tournament_players
              else if (sql.includes('INSERT INTO tournament_players')) {
                const [tournamentId, playerId, joinedAt, seedRank, currentRound, isActive] = params;
                if (!dbState.tournamentPlayers.has(tournamentId)) {
                  dbState.tournamentPlayers.set(tournamentId, []);
                }
                dbState.tournamentPlayers.get(tournamentId)!.push({
                  tournament_id: tournamentId,
                  player_id: playerId,
                  joined_at: joinedAt,
                  seed_rank: seedRank,
                  current_round: currentRound,
                  is_active: isActive,
                });
              }
              // Simulate INSERT INTO brackets
              else if (sql.includes('INSERT INTO brackets')) {
                const [id, tournamentId, roundNumber, totalMatches, bracketData, createdAt] = params;
                dbState.brackets.set(id, {
                  id,
                  tournament_id: tournamentId,
                  round_number: roundNumber,
                  total_matches: totalMatches,
                  bracket_data: bracketData,
                  created_at: createdAt,
                });
              }
              // Simulate INSERT INTO matches
              else if (sql.includes('INSERT INTO matches')) {
                // Extract tournament_id from subquery or params
                let tournamentId = params[1]; // bracket_id or tournament_id
                if (dbState.brackets.has(tournamentId)) {
                  tournamentId = dbState.brackets.get(tournamentId)!.tournament_id;
                }
                if (!dbState.matches.has(tournamentId)) {
                  dbState.matches.set(tournamentId, []);
                }
                dbState.matches.get(tournamentId)!.push({
                  id: params[0],
                  tournament_id: tournamentId,
                  bracket_id: params[2],
                  player1_id: params[3],
                  player2_id: params[4],
                  status: params[5],
                  round: params[6],
                  scheduled_at: params[7],
                  winner_id: null,
                  loser_id: null,
                  completed_at: null,
                  battle_data: null,
                });
              }
              // Simulate UPDATE tournaments
              else if (sql.includes('UPDATE tournaments')) {
                const whereIdx = sql.indexOf('WHERE');
                if (sql.includes('status = ?')) {
                  const [status, startedAt, id] = params;
                  if (dbState.tournaments.has(id)) {
                    const t = dbState.tournaments.get(id)!;
                    t.status = status;
                    t.started_at = startedAt;
                  }
                }
              }
              return { success: true };
            }),
            first: vi.fn(async function() {
              // Simulate SELECT FROM tournaments WHERE id = ?
              if (sql.includes('SELECT') && sql.includes('FROM tournaments') && sql.includes('WHERE id = ?')) {
                const [id] = params;
                return dbState.tournaments.get(id) || null;
              }
              // Simulate SELECT COUNT FROM tournament_players
              if (sql.includes('COUNT(*)') && sql.includes('FROM tournament_players')) {
                const [tournamentId] = params;
                const count = dbState.tournamentPlayers.get(tournamentId)?.length || 0;
                return { count };
              }
              // Simulate SELECT FROM tournament_players (check existing)
              if (sql.includes('SELECT player_id FROM tournament_players')) {
                const [tournamentId, playerId] = params;
                const players = dbState.tournamentPlayers.get(tournamentId) || [];
                return players.find(p => p.player_id === playerId) || null;
              }
              // Simulate SELECT FROM brackets
              if (sql.includes('SELECT') && sql.includes('FROM brackets')) {
                const [tournamentId] = params;
                let bracket = null;
                for (const [, b] of dbState.brackets) {
                  if (b.tournament_id === tournamentId) {
                    bracket = b;
                  }
                }
                return bracket;
              }
              return null;
            }),
            all: vi.fn(async function() {
              // Simulate SELECT FROM tournament_players (for bracket generation)
              if (sql.includes('SELECT player_id, seed_rank FROM tournament_players')) {
                const [tournamentId] = params;
                const players = dbState.tournamentPlayers.get(tournamentId) || [];
                return {
                  results: players.map(p => ({
                    player_id: p.player_id,
                    seed_rank: p.seed_rank,
                  })),
                };
              }
              // Simulate SELECT FROM matches
              if (sql.includes('SELECT') && sql.includes('FROM matches')) {
                const [tournamentId] = params;
                return {
                  results: dbState.matches.get(tournamentId) || [],
                };
              }
              return { results: [] };
            }),
          };
        }),
      };
    }),
  } as unknown as D1Database;

  return mockDb;
}

// ============================================================================
// TESTS
// ============================================================================

describe('Tournament CRUD - Comprehensive Validation', () => {
  let mockDb: D1Database;

  beforeEach(() => {
    resetDbState();
    mockDb = createMockDb();
  });

  // =========================================================================
  // Test 1: Create tournament with valid parameters
  // =========================================================================
  it('should create a tournament with valid parameters', async () => {
    const result = await createTournament(
      'Spring Championship 2026',
      'arena_1v1',
      8,
      'season_123',
      mockDb
    );

    expect(result).toBeDefined();
    expect(result.name).toBe('Spring Championship 2026');
    expect(result.type).toBe('arena_1v1');
    expect(result.maxPlayers).toBe(8);
    expect(result.status).toBe('draft');
    expect(result.totalRounds).toBe(3); // log2(8) = 3
    expect(result.seasonId).toBe('season_123');
    expect(result.createdAt).toBeGreaterThan(0);
    expect(result.startedAt).toBeNull();
    expect(result.completedAt).toBeNull();
  });

  // =========================================================================
  // Test 2: Create tournament with missing name
  // =========================================================================
  it('should handle tournament creation with empty name', async () => {
    const result = await createTournament(
      '',
      'arena_1v1',
      4,
      null,
      mockDb
    );

    // Service allows empty names (database would enforce constraints)
    expect(result.name).toBe('');
    expect(result.status).toBe('draft');
  });

  // =========================================================================
  // Test 3: Create tournament with invalid type
  // =========================================================================
  it('should reject tournament with invalid type', async () => {
    await expect(
      createTournament('Bad Tournament', 'invalid_type' as any, 8, null, mockDb)
    ).rejects.toThrow('Invalid tournament type');
  });

  // =========================================================================
  // Test 4: Create tournament with non-power-of-2 players
  // =========================================================================
  it('should reject non-power-of-2 player counts', async () => {
    const invalidCounts = [3, 5, 6, 7, 9, 15, 17, 31, 33];

    for (const count of invalidCounts) {
      await expect(
        createTournament(`${count} Players`, 'arena_1v1', count, null, mockDb)
      ).rejects.toThrow('power of 2');
    }
  });

  // =========================================================================
  // Test 5: Create tournament with player counts outside allowed range
  // =========================================================================
  it('should reject player counts outside 2-64 range', async () => {
    // Too few
    await expect(
      createTournament('Too Few', 'arena_1v1', 1, null, mockDb)
    ).rejects.toThrow('power of 2');

    // Too many
    await expect(
      createTournament('Too Many', 'arena_1v1', 128, null, mockDb)
    ).rejects.toThrow('power of 2');
  });

  // =========================================================================
  // Test 6: Create tournament with valid power-of-2 sizes
  // =========================================================================
  it('should accept all valid power-of-2 sizes (2, 4, 8, 16, 32, 64)', async () => {
    const validSizes = [2, 4, 8, 16, 32, 64];

    for (const size of validSizes) {
      const result = await createTournament(
        `${size} Player Tournament`,
        'arena_1v1',
        size,
        null,
        mockDb
      );

      expect(result.maxPlayers).toBe(size);
      expect(result.totalRounds).toBe(Math.log2(size));
    }
  });

  // =========================================================================
  // Test 7: Verify correct round count calculation
  // =========================================================================
  it('should calculate correct number of rounds for each size', async () => {
    const cases = [
      { size: 2, expectedRounds: 1 },
      { size: 4, expectedRounds: 2 },
      { size: 8, expectedRounds: 3 },
      { size: 16, expectedRounds: 4 },
      { size: 32, expectedRounds: 5 },
      { size: 64, expectedRounds: 6 },
    ];

    for (const { size, expectedRounds } of cases) {
      const result = await createTournament(
        `${size} Player`,
        'arena_1v1',
        size,
        null,
        mockDb
      );

      expect(result.totalRounds).toBe(expectedRounds);
    }
  });

  // =========================================================================
  // Test 8: Join tournament that exists
  // =========================================================================
  it('should allow player to join existing tournament', async () => {
    // Create tournament
    await createTournament('Test Tournament', 'arena_1v1', 4, null, mockDb);
    const tournament = dbState.tournaments.get(
      Array.from(dbState.tournaments.keys())[0]
    );

    // Join tournament
    await joinTournament(tournament.id, 'player_1', mockDb);

    const players = dbState.tournamentPlayers.get(tournament.id) || [];
    expect(players).toHaveLength(1);
    expect(players[0].player_id).toBe('player_1');
    expect(players[0].seed_rank).toBe(1);
  });

  // =========================================================================
  // Test 9: Join tournament that is full
  // =========================================================================
  it('should reject joining full tournament', async () => {
    // Create tournament with maxPlayers = 2
    await createTournament('Full Tournament', 'arena_1v1', 2, null, mockDb);
    const tournament = dbState.tournaments.get(
      Array.from(dbState.tournaments.keys())[0]
    );

    // Fill tournament
    await joinTournament(tournament.id, 'player_1', mockDb);
    await joinTournament(tournament.id, 'player_2', mockDb);

    // Try to add third player
    await expect(
      joinTournament(tournament.id, 'player_3', mockDb)
    ).rejects.toThrow('full');
  });

  // =========================================================================
  // Test 10: Join tournament twice (duplicate join prevention)
  // =========================================================================
  it('should prevent player from joining tournament twice', async () => {
    // Create tournament
    await createTournament('Duplicate Join Test', 'arena_1v1', 4, null, mockDb);
    const tournament = dbState.tournaments.get(
      Array.from(dbState.tournaments.keys())[0]
    );

    // First join
    await joinTournament(tournament.id, 'player_1', mockDb);

    // Second join (should fail)
    await expect(
      joinTournament(tournament.id, 'player_1', mockDb)
    ).rejects.toThrow('already joined');
  });

  // =========================================================================
  // Test 11: Get tournament by ID
  // =========================================================================
  it('should retrieve tournament by ID', async () => {
    // Create tournament
    const created = await createTournament(
      'Retrieve Test',
      'arena_1v1',
      8,
      'season_x',
      mockDb
    );

    // Retrieve it
    const retrieved = await getTournament(created.id, mockDb);

    expect(retrieved).toBeDefined();
    expect(retrieved?.name).toBe('Retrieve Test');
    expect(retrieved?.type).toBe('arena_1v1');
    expect(retrieved?.maxPlayers).toBe(8);
    expect(retrieved?.status).toBe('draft');
  });

  // =========================================================================
  // Test 12: Get tournament that doesn't exist
  // =========================================================================
  it('should return null for non-existent tournament', async () => {
    const result = await getTournament('nonexistent_tournament_id', mockDb);
    expect(result).toBeNull();
  });

  // =========================================================================
  // Test 13: Generate bracket with power-of-2 players
  // =========================================================================
  it('should generate bracket for 4-player tournament', async () => {
    // Create tournament
    const tournament = await createTournament('Bracket Test', 'arena_1v1', 4, null, mockDb);

    // Add players
    await joinTournament(tournament.id, 'player_1', mockDb);
    await joinTournament(tournament.id, 'player_2', mockDb);
    await joinTournament(tournament.id, 'player_3', mockDb);
    await joinTournament(tournament.id, 'player_4', mockDb);

    // Generate bracket
    const bracket = await generateBracket(tournament.id, mockDb);

    expect(bracket).toBeDefined();
    expect(bracket.tournamentId).toBe(tournament.id);
    expect(bracket.roundNumber).toBe(1);
    expect(bracket.totalMatches).toBe(2); // 4 players = 2 matches in round 1
    expect(bracket.bracketData).toBeDefined();

    // Verify tournament status changed
    const updated = await getTournament(tournament.id, mockDb);
    expect(updated?.status).toBe('in_progress');
  });

  // =========================================================================
  // Test 14: Generate bracket with non-power-of-2 (byes handling)
  // =========================================================================
  it('should handle bracket generation when players < maxPlayers (with byes)', async () => {
    // Create 8-player tournament but only add 5 players
    const tournament = await createTournament('Bye Test', 'arena_1v1', 8, null, mockDb);

    // Add only 5 players (will be padded to 8)
    for (let i = 1; i <= 5; i++) {
      await joinTournament(tournament.id, `player_${i}`, mockDb);
    }

    // Generate bracket (should pad to 8)
    const bracket = await generateBracket(tournament.id, mockDb);

    expect(bracket).toBeDefined();
    expect(bracket.totalMatches).toBe(4); // 8 / 2
    expect(bracket.bracketData).toBeDefined();

    // Bracket structure should be an object (not JSON string in our mock)
    expect(typeof bracket.bracketData).toBe('object');
  });

  // =========================================================================
  // Test 15: Get bracket by tournament ID
  // =========================================================================
  it('should retrieve bracket after generation', async () => {
    // Create and populate tournament
    const tournament = await createTournament('Bracket Retrieval', 'arena_1v1', 2, null, mockDb);
    await joinTournament(tournament.id, 'player_a', mockDb);
    await joinTournament(tournament.id, 'player_b', mockDb);

    // Generate bracket
    const generated = await generateBracket(tournament.id, mockDb);

    // Retrieve bracket
    const retrieved = await getBracket(tournament.id, mockDb);

    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe(generated.id);
    expect(retrieved?.tournamentId).toBe(tournament.id);
  });

  // =========================================================================
  // Test 16: Get tournament matches
  // =========================================================================
  it('should retrieve all matches for tournament', async () => {
    // Create and populate tournament
    const tournament = await createTournament('Match Retrieval', 'arena_1v1', 4, null, mockDb);
    await joinTournament(tournament.id, 'player_1', mockDb);
    await joinTournament(tournament.id, 'player_2', mockDb);
    await joinTournament(tournament.id, 'player_3', mockDb);
    await joinTournament(tournament.id, 'player_4', mockDb);

    // Generate bracket (creates matches)
    await generateBracket(tournament.id, mockDb);

    // Get matches
    const matches = await getTournamentMatches(tournament.id, undefined, mockDb);

    expect(matches).toBeDefined();
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].tournamentId).toBe(tournament.id);
  });

  // =========================================================================
  // Test 17: Multiple tournaments in system
  // =========================================================================
  it('should handle multiple tournaments without collision', async () => {
    // Create 3 tournaments
    const t1 = await createTournament('Tournament 1', 'arena_1v1', 4, null, mockDb);
    const t2 = await createTournament('Tournament 2', 'alliance_war', 8, null, mockDb);
    const t3 = await createTournament('Tournament 3', 'speed_round', 16, null, mockDb);

    // Verify all exist
    const r1 = await getTournament(t1.id, mockDb);
    const r2 = await getTournament(t2.id, mockDb);
    const r3 = await getTournament(t3.id, mockDb);

    expect(r1?.name).toBe('Tournament 1');
    expect(r2?.name).toBe('Tournament 2');
    expect(r3?.name).toBe('Tournament 3');
    expect(r1?.type).not.toBe(r2?.type);
  });

  // =========================================================================
  // Test 18: Different tournament types
  // =========================================================================
  it('should support all tournament types', async () => {
    const types = ['arena_1v1', 'alliance_war', 'speed_round', 'koth'] as const;

    for (const type of types) {
      const result = await createTournament(
        `${type} Tournament`,
        type,
        4,
        null,
        mockDb
      );

      expect(result.type).toBe(type);
      expect(result.status).toBe('draft');
    }
  });

  // =========================================================================
  // Test 19: Season association
  // =========================================================================
  it('should associate tournament with season', async () => {
    const withSeason = await createTournament(
      'Seasonal',
      'arena_1v1',
      4,
      'season_spring_2026',
      mockDb
    );

    const retrieved = await getTournament(withSeason.id, mockDb);
    expect(retrieved?.seasonId).toBe('season_spring_2026');
  });

  // =========================================================================
  // Test 20: Timestamps are set correctly
  // =========================================================================
  it('should set correct timestamps on creation', async () => {
    const before = Math.floor(Date.now() / 1000);
    const tournament = await createTournament('Timestamp Test', 'arena_1v1', 4, null, mockDb);
    const after = Math.floor(Date.now() / 1000);

    expect(tournament.createdAt).toBeGreaterThanOrEqual(before);
    expect(tournament.createdAt).toBeLessThanOrEqual(after + 1);
    expect(tournament.startedAt).toBeNull();
    expect(tournament.completedAt).toBeNull();
  });
});
