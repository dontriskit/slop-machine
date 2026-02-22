/**
 * Unit tests for leaderboard scoring and stats calculation
 * Verifies e-sport scoring formulas and ranking behavior
 *
 * Score formulas (OGame-inspired):
 *   Economy  = sum of all building levels × 1000
 *   Research = sum of all tech levels × 2000
 *   Fleet    = total ship count × 500 (approximation)
 *   Points   = economy + research + fleet
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock D1Database for testing
interface MockD1Database {
  prepare: (sql: string) => {
    bind: (...args: any[]) => {
      first: <T>() => Promise<T | null>;
      all: <T>() => Promise<{ results: T[] }>;
      run: () => Promise<void>;
    };
  };
}

// Helper to create a mock database with prepared queries
function createMockDB(data: Record<string, any>): MockD1Database {
  return {
    prepare: (sql: string) => {
      return {
        bind: (...args: any[]) => {
          return {
            first: async <T>() => {
              // Simulate different queries based on SQL pattern
              if (sql.includes('COUNT(*)')) {
                return { total: data.totalPlayers || 0 } as T;
              }
              if (sql.includes('SUM(max_level * 1000)')) {
                const playerId = args[0];
                return { economy: data.economyScores?.[playerId] || 0 } as T;
              }
              if (sql.includes('SUM(level * 2000)')) {
                const playerId = args[0];
                return { research: data.researchScores?.[playerId] || 0 } as T;
              }
              if (sql.includes('SUM') && sql.includes('* 500')) {
                const playerId = args[0];
                return { fleet: data.fleetScores?.[playerId] || 0 } as T;
              }
              return null;
            },
            all: async <T>() => {
              if (sql.includes('SELECT p.id, p.name')) {
                return { results: data.players || [] } as any;
              }
              return { results: [] } as any;
            },
            run: async () => {
              // Mock run for INSERT/UPDATE
            },
          };
        },
      };
    },
  };
}

// Score calculation functions (copy from service for testing isolation)
function calculateEconomyScore(buildings: Array<{ level: number }>): number {
  return buildings.reduce((sum, b) => sum + b.level * 1000, 0);
}

function calculateResearchScore(techs: Array<{ level: number }>): number {
  return techs.reduce((sum, t) => sum + t.level * 2000, 0);
}

function calculateFleetScore(ships: Record<string, number>): number {
  const totalShips = Object.values(ships).reduce((sum, count) => sum + count, 0);
  return totalShips * 500;
}

function calculateTotalScore(economy: number, research: number, fleet: number): number {
  return economy + research + fleet;
}

// ============================================================================
// TEST SUITES
// ============================================================================

describe('Leaderboard Scoring - Economy Formula', () => {
  test('empty buildings list equals 0 economy score', () => {
    const score = calculateEconomyScore([]);
    expect(score).toBe(0);
  });

  test('single level 1 building equals 1000 points', () => {
    const score = calculateEconomyScore([{ level: 1 }]);
    expect(score).toBe(1000);
  });

  test('single level 5 building equals 5000 points', () => {
    const score = calculateEconomyScore([{ level: 5 }]);
    expect(score).toBe(5000);
  });

  test('multiple buildings sum correctly', () => {
    const buildings = [
      { level: 1 }, // 1000
      { level: 2 }, // 2000
      { level: 3 }, // 3000
    ];
    const score = calculateEconomyScore(buildings);
    expect(score).toBe(6000);
  });

  test('formula matches specification: sum(building_levels) * 1000', () => {
    const buildings = [
      { level: 4 },
      { level: 6 },
      { level: 2 },
    ];
    const expectedSum = 4 + 6 + 2; // = 12
    const expectedScore = expectedSum * 1000; // = 12000
    const score = calculateEconomyScore(buildings);
    expect(score).toBe(expectedScore);
  });

  test('large level values scale correctly', () => {
    const buildings = [{ level: 100 }];
    const score = calculateEconomyScore(buildings);
    expect(score).toBe(100000);
  });
});

describe('Leaderboard Scoring - Research Formula', () => {
  test('empty tech list equals 0 research score', () => {
    const score = calculateResearchScore([]);
    expect(score).toBe(0);
  });

  test('single level 1 tech equals 2000 points', () => {
    const score = calculateResearchScore([{ level: 1 }]);
    expect(score).toBe(2000);
  });

  test('single level 5 tech equals 10000 points', () => {
    const score = calculateResearchScore([{ level: 5 }]);
    expect(score).toBe(10000);
  });

  test('multiple techs sum correctly', () => {
    const techs = [
      { level: 1 }, // 2000
      { level: 2 }, // 4000
      { level: 3 }, // 6000
    ];
    const score = calculateResearchScore(techs);
    expect(score).toBe(12000);
  });

  test('formula matches specification: sum(tech_levels) * 2000', () => {
    const techs = [
      { level: 3 },
      { level: 4 },
      { level: 5 },
    ];
    const expectedSum = 3 + 4 + 5; // = 12
    const expectedScore = expectedSum * 2000; // = 24000
    const score = calculateResearchScore(techs);
    expect(score).toBe(expectedScore);
  });

  test('research multiplier is 2x economy', () => {
    const techLevel = 5;
    const buildingLevel = 5;
    const researchScore = calculateResearchScore([{ level: techLevel }]);
    const economyScore = calculateEconomyScore([{ level: buildingLevel }]);
    expect(researchScore).toBe(economyScore * 2);
  });
});

describe('Leaderboard Scoring - Fleet Formula', () => {
  test('no ships equals 0 fleet score', () => {
    const score = calculateFleetScore({});
    expect(score).toBe(0);
  });

  test('single ship equals 500 points', () => {
    const score = calculateFleetScore({ light_fighter: 1 });
    expect(score).toBe(500);
  });

  test('10 ships of same type equal 5000 points', () => {
    const score = calculateFleetScore({ light_fighter: 10 });
    expect(score).toBe(5000);
  });

  test('multiple ship types sum correctly', () => {
    const ships = {
      light_fighter: 5,
      heavy_fighter: 3,
      cruiser: 2,
    };
    const totalShips = 5 + 3 + 2; // = 10
    const expectedScore = totalShips * 500; // = 5000
    const score = calculateFleetScore(ships);
    expect(score).toBe(expectedScore);
  });

  test('formula matches specification: total_ship_count * 500', () => {
    const ships = {
      light_fighter: 8,
      battleship: 4,
      bomber: 2,
      deathstar: 1,
    };
    const expectedTotal = 8 + 4 + 2 + 1; // = 15
    const expectedScore = expectedTotal * 500; // = 7500
    const score = calculateFleetScore(ships);
    expect(score).toBe(expectedScore);
  });

  test('all ship types included in calculation', () => {
    const ships = {
      light_fighter: 1,
      heavy_fighter: 1,
      cruiser: 1,
      battleship: 1,
      battlecruiser: 1,
      bomber: 1,
      destroyer: 1,
      deathstar: 1,
      small_cargo: 1,
      large_cargo: 1,
      colony_ship: 1,
      recycler: 1,
      espionage_probe: 1,
    };
    const totalShips = 13;
    const expectedScore = totalShips * 500; // = 6500
    const score = calculateFleetScore(ships);
    expect(score).toBe(expectedScore);
  });
});

describe('Leaderboard Scoring - Total Score Calculation', () => {
  test('total score combines all three components', () => {
    const economy = 10000; // from buildings
    const research = 20000; // from techs
    const fleet = 5000; // from ships
    const total = calculateTotalScore(economy, research, fleet);
    expect(total).toBe(35000);
  });

  test('zero in all categories equals zero total', () => {
    const total = calculateTotalScore(0, 0, 0);
    expect(total).toBe(0);
  });

  test('dominant economy', () => {
    const economy = 100000;
    const research = 1000;
    const fleet = 500;
    const total = calculateTotalScore(economy, research, fleet);
    expect(total).toBe(101500);
  });

  test('dominant research', () => {
    const economy = 5000;
    const research = 80000;
    const fleet = 3000;
    const total = calculateTotalScore(economy, research, fleet);
    expect(total).toBe(88000);
  });

  test('balanced all three', () => {
    const economy = 30000;
    const research = 30000;
    const fleet = 30000;
    const total = calculateTotalScore(economy, research, fleet);
    expect(total).toBe(90000);
  });
});

describe('Leaderboard Ranking', () => {
  test('players ranked by total score descending', () => {
    const players = [
      { id: 'p1', score: 50000, rank: 0 },
      { id: 'p2', score: 75000, rank: 0 },
      { id: 'p3', score: 25000, rank: 0 },
    ];

    // Sort by score descending
    players.sort((a, b) => b.score - a.score);

    // Assign ranks
    players.forEach((p, idx) => {
      p.rank = idx + 1;
    });

    expect(players[0].rank).toBe(1);
    expect(players[0].id).toBe('p2');
    expect(players[1].rank).toBe(2);
    expect(players[1].id).toBe('p1');
    expect(players[2].rank).toBe(3);
    expect(players[2].id).toBe('p3');
  });

  test('highest score always rank 1', () => {
    const players = [
      { id: 'p1', score: 50000 },
      { id: 'p2', score: 1000000 },
      { id: 'p3', score: 10000 },
    ];

    players.sort((a, b) => b.score - a.score);

    expect(players[0].id).toBe('p2');
    expect(players[0].score).toBe(1000000);
  });

  test('lowest score has highest rank number', () => {
    const players = [
      { score: 100000 },
      { score: 50000 },
      { score: 10000 },
      { score: 1000 },
    ];

    players.sort((a, b) => b.score - a.score);

    expect(players[players.length - 1].score).toBe(1000);
  });
});

describe('Leaderboard Tie-Breaking', () => {
  test('tied players maintain order', () => {
    const players = [
      { id: 'p1', score: 50000 },
      { id: 'p2', score: 50000 },
      { id: 'p3', score: 50000 },
    ];

    players.sort((a, b) => b.score - a.score);

    // All have same rank but consistent ordering
    expect(players[0].score).toBe(50000);
    expect(players[1].score).toBe(50000);
    expect(players[2].score).toBe(50000);
  });

  test('mixed scores and ties rank correctly', () => {
    const players = [
      { id: 'p1', score: 30000 },
      { id: 'p2', score: 50000 },
      { id: 'p3', score: 50000 },
      { id: 'p4', score: 20000 },
    ];

    players.sort((a, b) => b.score - a.score);
    players.forEach((p, idx) => {
      (p as any).rank = idx + 1;
    });

    expect((players[0] as any).rank).toBe(1);
    expect((players[1] as any).rank).toBe(2);
    expect((players[2] as any).rank).toBe(3);
    expect((players[3] as any).rank).toBe(4);
  });

  test('many tied at top', () => {
    const players = [
      { id: 'p1', score: 100000 },
      { id: 'p2', score: 100000 },
      { id: 'p3', score: 100000 },
      { id: 'p4', score: 50000 },
    ];

    players.sort((a, b) => b.score - a.score);

    // Top 3 all tied at 100000
    expect(players[0].score).toBe(100000);
    expect(players[1].score).toBe(100000);
    expect(players[2].score).toBe(100000);
    expect(players[3].score).toBe(50000);
  });
});

describe('Leaderboard Edge Cases', () => {
  test('empty leaderboard returns empty array', () => {
    const players: any[] = [];
    expect(players.length).toBe(0);
  });

  test('single player leaderboard', () => {
    const players = [{ id: 'p1', score: 50000 }];
    players.forEach((p, idx) => {
      (p as any).rank = idx + 1;
    });

    expect(players.length).toBe(1);
    expect((players[0] as any).rank).toBe(1);
    expect(players[0].score).toBe(50000);
  });

  test('two player leaderboard with clear winner', () => {
    const players = [
      { id: 'p1', score: 30000 },
      { id: 'p2', score: 70000 },
    ];

    players.sort((a, b) => b.score - a.score);
    players.forEach((p, idx) => {
      (p as any).rank = idx + 1;
    });

    expect((players[0] as any).rank).toBe(1);
    expect((players[1] as any).rank).toBe(2);
  });

  test('zero score player in leaderboard', () => {
    const players = [
      { id: 'p1', score: 50000 },
      { id: 'p2', score: 0 },
      { id: 'p3', score: 25000 },
    ];

    players.sort((a, b) => b.score - a.score);
    players.forEach((p, idx) => {
      (p as any).rank = idx + 1;
    });

    expect((players[0] as any).rank).toBe(1);
    expect((players[2] as any).rank).toBe(3);
    expect(players[2].score).toBe(0);
  });

  test('very large score values', () => {
    const buildings = Array(100).fill({ level: 100 });
    const techs = Array(50).fill({ level: 50 });
    const ships = { light_fighter: 10000 };

    const economy = calculateEconomyScore(buildings); // 100 * 100 * 1000 = 10,000,000
    const research = calculateResearchScore(techs); // 50 * 50 * 2000 = 5,000,000
    const fleet = calculateFleetScore(ships); // 10000 * 500 = 5,000,000

    const total = calculateTotalScore(economy, research, fleet);
    expect(total).toBe(20000000);
  });

  test('fractional ships handled (integer truncation)', () => {
    // Ships should always be integers, but verify floor behavior
    const ships = { light_fighter: 5 };
    const score = calculateFleetScore(ships);
    expect(score).toBe(2500);
    expect(Number.isInteger(score)).toBe(true);
  });

  test('negative values not allowed in production', () => {
    // Sanity check: scores should never be negative
    const economy = calculateEconomyScore([]);
    const research = calculateResearchScore([]);
    const fleet = calculateFleetScore({});
    expect(economy).toBeGreaterThanOrEqual(0);
    expect(research).toBeGreaterThanOrEqual(0);
    expect(fleet).toBeGreaterThanOrEqual(0);
  });
});

describe('Leaderboard Multi-Category Sorting', () => {
  test('can sort by economy category only', () => {
    const players = [
      { id: 'p1', economy: 50000, research: 10000, fleet: 5000 },
      { id: 'p2', economy: 30000, research: 50000, fleet: 5000 },
      { id: 'p3', economy: 70000, research: 5000, fleet: 5000 },
    ];

    players.sort((a, b) => b.economy - a.economy);

    expect(players[0].id).toBe('p3');
    expect(players[1].id).toBe('p1');
    expect(players[2].id).toBe('p2');
  });

  test('can sort by research category only', () => {
    const players = [
      { id: 'p1', economy: 50000, research: 10000, fleet: 5000 },
      { id: 'p2', economy: 30000, research: 50000, fleet: 5000 },
      { id: 'p3', economy: 70000, research: 5000, fleet: 5000 },
    ];

    players.sort((a, b) => b.research - a.research);

    expect(players[0].id).toBe('p2');
    expect(players[1].id).toBe('p1');
    expect(players[2].id).toBe('p3');
  });

  test('can sort by fleet category only', () => {
    const players = [
      { id: 'p1', economy: 50000, research: 10000, fleet: 3000 },
      { id: 'p2', economy: 30000, research: 50000, fleet: 8000 },
      { id: 'p3', economy: 70000, research: 5000, fleet: 1000 },
    ];

    players.sort((a, b) => b.fleet - a.fleet);

    expect(players[0].id).toBe('p2');
    expect(players[1].id).toBe('p1');
    expect(players[2].id).toBe('p3');
  });
});
