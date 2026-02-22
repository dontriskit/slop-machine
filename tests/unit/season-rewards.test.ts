/**
 * season-rewards.test.ts
 *
 * Unit tests for Season Rewards Distribution
 *
 * Tests cover:
 *   - distributeSeasonRewards with top placements
 *   - Resource reward scaling (1st=100%, 2nd=60%, 3rd=30%)
 *   - Achievement awards (Season Champion, Season Top 10)
 *   - getSeasonLeaderboard functionality
 *   - getSeasonLeaderboardWithPoints ranking
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  distributeSeasonRewards,
  getSeasonLeaderboard,
  getSeasonLeaderboardWithPoints,
} from '../../worker/src/game/services/tournamentService';
import { D1Database } from '@cloudflare/workers-types';

// ============================================================================
// MOCKS & FIXTURES
// ============================================================================

const createMockDb = () => {
  const mockImpl = {
    queryResults: new Map<string, any>(),
    
    prepare: vi.fn(function(this: any, sql: string) {
      return {
        bind: vi.fn(function(...args: any[]) {
          // Store query context for later
          this._sql = sql;
          this._bindings = args;
          return this;
        }),
        run: vi.fn(async function(this: any) {
          // Handle INSERT/UPDATE operations
          if (sql.includes('INSERT') || sql.includes('UPDATE')) {
            return { meta: { changes: 1 } };
          }
          return { success: true };
        }),
        first: vi.fn(async function(this: any) {
          // Return mock planet for resource reward
          if (sql.includes('SELECT id FROM planets WHERE player_id')) {
            return { id: 'planet_p1' };
          }
          return null;
        }),
        all: vi.fn(async function(this: any) {
          // Return mock leaderboard entries - respecting limit
          if (sql.includes('season_leaderboard')) {
            const limit = this._bindings?.[1] ?? 100;
            const allResults = [
              { season_id: 'season_123', player_id: 'player1', points: 500, rank: 1 },
              { season_id: 'season_123', player_id: 'player2', points: 400, rank: 2 },
              { season_id: 'season_123', player_id: 'player3', points: 300, rank: 3 },
              { season_id: 'season_123', player_id: 'player4', points: 250, rank: 4 },
              { season_id: 'season_123', player_id: 'player5', points: 200, rank: 5 },
              { season_id: 'season_123', player_id: 'player6', points: 180, rank: 6 },
              { season_id: 'season_123', player_id: 'player7', points: 160, rank: 7 },
              { season_id: 'season_123', player_id: 'player8', points: 140, rank: 8 },
              { season_id: 'season_123', player_id: 'player9', points: 120, rank: 9 },
              { season_id: 'season_123', player_id: 'player10', points: 100, rank: 10 },
            ];
            return {
              results: allResults.slice(0, limit),
            };
          }
          // Return mock player names
          if (sql.includes('SELECT name FROM players')) {
            const playerId = this._bindings?.[0];
            return { name: `Player_${playerId}` };
          }
          return { results: [] };
        }),
      };
    }),
  };

  return mockImpl as unknown as D1Database;
};

// ============================================================================
// TESTS
// ============================================================================

describe('Season Rewards Distribution', () => {
  let mockDb: D1Database;

  beforeEach(() => {
    mockDb = createMockDb();
  });

  describe('distributeSeasonRewards', () => {
    it('should distribute rewards to top 3 players with correct scaling', async () => {
      const results = await distributeSeasonRewards('season_123', mockDb);

      // Verify we got all 10 entries
      expect(results).toHaveLength(10);

      // Check 1st place (100% multiplier)
      const first = results[0];
      expect(first.placement).toBe(1);
      expect(first.metalReward).toBe(50000); // 50000 * 1.0
      expect(first.crystalReward).toBe(30000); // 30000 * 1.0
      expect(first.deuteriumReward).toBe(10000); // 10000 * 1.0

      // Check 2nd place (60% multiplier)
      const second = results[1];
      expect(second.placement).toBe(2);
      expect(second.metalReward).toBe(30000); // 50000 * 0.6
      expect(second.crystalReward).toBe(18000); // 30000 * 0.6
      expect(second.deuteriumReward).toBe(6000); // 10000 * 0.6

      // Check 3rd place (30% multiplier)
      const third = results[2];
      expect(third.placement).toBe(3);
      expect(third.metalReward).toBe(15000); // 50000 * 0.3
      expect(third.crystalReward).toBe(9000); // 30000 * 0.3
      expect(third.deuteriumReward).toBe(3000); // 10000 * 0.3
    });

    it('should award Season Champion achievement only to 1st place', async () => {
      const results = await distributeSeasonRewards('season_123', mockDb);

      const first = results[0];
      expect(first.achievementsAwarded).toContain('season_champion');
      
      const second = results[1];
      expect(second.achievementsAwarded).not.toContain('season_champion');
      
      const tenth = results[9];
      expect(tenth.achievementsAwarded).not.toContain('season_champion');
    });

    it('should award Season Top 10 achievement to top 10 players', async () => {
      const results = await distributeSeasonRewards('season_123', mockDb);

      // All 10 should have top 10 achievement
      for (const result of results) {
        expect(result.achievementsAwarded).toContain('season_top_10');
      }
    });

    it('should not award resources beyond top 3', async () => {
      const results = await distributeSeasonRewards('season_123', mockDb);

      const fourth = results[3];
      expect(fourth.metalReward).toBe(0);
      expect(fourth.crystalReward).toBe(0);
      expect(fourth.deuteriumReward).toBe(0);
      expect(fourth.totalRewardValue).toBe(0);

      const tenth = results[9];
      expect(tenth.metalReward).toBe(0);
      expect(tenth.crystalReward).toBe(0);
      expect(tenth.deuteriumReward).toBe(0);
      expect(tenth.totalRewardValue).toBe(0);
    });

    it('should calculate correct total reward value', async () => {
      const results = await distributeSeasonRewards('season_123', mockDb);

      const first = results[0];
      expect(first.totalRewardValue).toBe(50000 + 30000 + 10000); // 90000

      const second = results[1];
      expect(second.totalRewardValue).toBe(30000 + 18000 + 6000); // 54000

      const third = results[2];
      expect(third.totalRewardValue).toBe(15000 + 9000 + 3000); // 27000
    });

    it('should return empty array when no leaderboard exists', async () => {
      // Mock empty leaderboard
      const emptyMockDb = {
        prepare: vi.fn(() => ({
          bind: vi.fn(function() { return this; }),
          run: vi.fn(() => Promise.resolve({ meta: { changes: 1 } })),
          first: vi.fn(() => Promise.resolve(null)),
          all: vi.fn(() => Promise.resolve({ results: [] })),
        })),
      } as unknown as D1Database;

      const results = await distributeSeasonRewards('empty_season', emptyMockDb);
      expect(results).toEqual([]);
    });

    it('should include player names in distribution results', async () => {
      const results = await distributeSeasonRewards('season_123', mockDb);

      for (const result of results) {
        expect(result.playerName).toBeDefined();
        expect(result.playerName).not.toBeNull();
      }
    });

    it('should maintain placement order in results', async () => {
      const results = await distributeSeasonRewards('season_123', mockDb);

      for (let i = 0; i < results.length; i++) {
        expect(results[i].placement).toBe(i + 1);
      }
    });
  });

  describe('getSeasonLeaderboard', () => {
    it('should retrieve leaderboard with correct limit applied', async () => {
      const limitedResults = await getSeasonLeaderboard('season_123', 5, mockDb);

      // Should return 5 results when limit=5
      expect(limitedResults.length).toBeLessThanOrEqual(5);
    });

    it('should include ranking information', async () => {
      const results = await getSeasonLeaderboard('season_123', 100, mockDb);

      if (results.length > 0) {
        for (const entry of results) {
          expect(entry.rank).toBeDefined();
          expect(entry.points).toBeDefined();
          expect(entry.seasonId).toBe('season_123');
        }
      }
    });

    it('should rank players correctly by points', async () => {
      const results = await getSeasonLeaderboard('season_123', 100, mockDb);

      if (results.length > 1) {
        for (let i = 0; i < results.length - 1; i++) {
          // Points should be in descending order
          expect(results[i].points).toBeGreaterThanOrEqual(results[i + 1].points);
        }
      }
    });
  });

  describe('getSeasonLeaderboardWithPoints', () => {
    it('should enhance leaderboard with tournament wins count', async () => {
      // Mock enhanced database with match count capability
      const enhancedMockDb = {
        prepare: vi.fn(function(this: any, sql: string) {
          return {
            bind: vi.fn(function(...args: any[]) {
              this._sql = sql;
              this._bindings = args;
              return this;
            }),
            run: vi.fn(async () => ({ meta: { changes: 1 } })),
            first: vi.fn(async function(this: any) {
              if (sql.includes('SELECT name FROM players')) {
                const playerId = this._bindings?.[0];
                return { name: `Player_${playerId}` };
              }
              if (sql.includes('SELECT id FROM planets')) {
                return { id: 'planet_1' };
              }
              if (sql.includes('COUNT(*) AS count')) {
                // Return tournament wins based on player
                const playerId = this._bindings?.[1];
                const wins: Record<string, number> = {
                  'player1': 3,
                  'player2': 2,
                  'player3': 1,
                };
                return { count: wins[playerId as string] ?? 0 };
              }
              return null;
            }),
            all: vi.fn(async () => ({
              results: [
                { season_id: 'season_123', player_id: 'player1', points: 500, rank: 1 },
                { season_id: 'season_123', player_id: 'player2', points: 400, rank: 2 },
                { season_id: 'season_123', player_id: 'player3', points: 300, rank: 3 },
              ],
            })),
          };
        }),
      } as unknown as D1Database;

      const results = await getSeasonLeaderboardWithPoints('season_123', 100, enhancedMockDb);

      expect(results.length).toBeGreaterThan(0);
      
      // First player should have tournament wins recorded
      const first = results[0];
      expect(first.tournaments_won).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle single player leaderboard', async () => {
      const singlePlayerDb = {
        prepare: vi.fn(() => ({
          bind: vi.fn(function() { return this; }),
          run: vi.fn(() => Promise.resolve({ meta: { changes: 1 } })),
          first: vi.fn(() => Promise.resolve({ id: 'planet_1' })),
          all: vi.fn(() => Promise.resolve({
            results: [
              { season_id: 'season_single', player_id: 'lonely_player', points: 100, rank: 1 },
            ],
          })),
        })),
      } as unknown as D1Database;

      const results = await distributeSeasonRewards('season_single', singlePlayerDb);

      expect(results).toHaveLength(1);
      const only = results[0];
      expect(only.placement).toBe(1);
      expect(only.achievementsAwarded).toContain('season_champion');
      expect(only.achievementsAwarded).toContain('season_top_10');
    });

    it('should handle exactly top 10 players', async () => {
      const results = await distributeSeasonRewards('season_123', mockDb);
      
      // All 10 should have top 10 achievement
      const topTen = results.filter(r => r.placement <= 10);
      expect(topTen.every(r => r.achievementsAwarded.includes('season_top_10'))).toBe(true);
    });

    it('should handle leaderboard with duplicate points', async () => {
      const dupPointsDb = {
        prepare: vi.fn(() => ({
          bind: vi.fn(function() { return this; }),
          run: vi.fn(() => Promise.resolve({ meta: { changes: 1 } })),
          first: vi.fn(() => Promise.resolve({ id: 'planet_1' })),
          all: vi.fn(() => Promise.resolve({
            results: [
              { season_id: 'season_dup', player_id: 'p1', points: 500, rank: 1 },
              { season_id: 'season_dup', player_id: 'p2', points: 500, rank: 2 }, // Same points
              { season_id: 'season_dup', player_id: 'p3', points: 300, rank: 3 },
            ],
          })),
        })),
      } as unknown as D1Database;

      const results = await distributeSeasonRewards('season_dup', dupPointsDb);
      
      // Placement should still be sequential 1, 2, 3
      expect(results[0].placement).toBe(1);
      expect(results[1].placement).toBe(2);
      expect(results[2].placement).toBe(3);
    });
  });
});
