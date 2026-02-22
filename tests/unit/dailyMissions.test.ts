/**
 * Unit tests for Daily Mission Service
 *
 * Tests cover:
 *  - DAILY_MISSIONS config (10+ types, schema integrity)
 *  - pickMissions: count, determinism, uniqueness
 *  - getTodayKey: UTC date format
 *  - generateDailyMissions: creates rows, returns on second call
 *  - getDailyMissions: delegates to generate, returns missions
 *  - checkMissionProgress: stat-based progress update
 *  - claimMissionReward: resource/DM credit, status update
 *  - resetDailyMissions: deletes old rows, re-generates for active players
 *  - Edge cases: unknown mission, already claimed, no stat column
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  DAILY_MISSIONS,
  MISSION_MAP,
  getTodayKey,
  pickMissions,
  generateDailyMissions,
  getDailyMissions,
  checkMissionProgress,
  claimMissionReward,
  resetDailyMissions,
  DailyMissionService,
  type DailyMission,
  type MissionDefinition,
} from '../../worker/src/game/services/dailyMissionService';

// ============================================================================
// D1 Mock helpers
// ============================================================================

interface MockDbOpts {
  missionRows?: Record<string, unknown>[];
  statsRow?: Record<string, unknown> | null;
  missionRow?: Record<string, unknown> | null;
  playerRows?: Record<string, unknown>[];
  allEmpty?: boolean;
}

function makeDb(opts: MockDbOpts = {}): D1Database {
  const {
    missionRows = [],
    statsRow = null,
    missionRow = null,
    playerRows = [],
    allEmpty = false,
  } = opts;

  return {
    prepare: vi.fn().mockImplementation((sql: string) => {
      const stmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockImplementation(async () => {
          if (allEmpty) return null;
          if (sql.includes('player_stats') || sql.includes('espionage_sent') || sql.includes('research_completed') || sql.includes('battles_won') || sql.includes('fleets_dispatched') || sql.includes('buildings_built') || sql.includes('planets_colonized') || sql.includes('resources_raided') || sql.includes('ships_built') || sql.includes('trades_completed')) {
            return statsRow;
          }
          return missionRow;
        }),
        all: vi.fn().mockImplementation(async () => {
          if (allEmpty) return { results: [] };
          if (sql.includes('daily_missions') && sql.includes('SELECT')) {
            return { results: missionRows };
          }
          if (sql.includes('players')) {
            return { results: playerRows };
          }
          return { results: [] };
        }),
        run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
      };
      return stmt;
    }),
  } as unknown as D1Database;
}

// ============================================================================
// 1. DAILY_MISSIONS config integrity
// ============================================================================

describe('DAILY_MISSIONS config', () => {
  test('has 10+ mission definitions', () => {
    expect(DAILY_MISSIONS.length).toBeGreaterThanOrEqual(10);
  });

  test('every mission has required fields', () => {
    for (const m of DAILY_MISSIONS) {
      expect(m.type).toBeTruthy();
      expect(m.title).toBeTruthy();
      expect(m.description).toBeTruthy();
      expect(m.icon).toBeTruthy();
      expect(m.requirement.target).toBeGreaterThan(0);
      expect(m.reward).toBeDefined();
      expect(['easy', 'medium', 'hard']).toContain(m.difficulty);
    }
  });

  test('all mission types are unique', () => {
    const types = DAILY_MISSIONS.map((m) => m.type);
    const unique = new Set(types);
    expect(unique.size).toBe(types.length);
  });

  test('MISSION_MAP has same size as DAILY_MISSIONS', () => {
    expect(MISSION_MAP.size).toBe(DAILY_MISSIONS.length);
  });

  test('all reward values are non-negative', () => {
    for (const m of DAILY_MISSIONS) {
      expect(m.reward.metal).toBeGreaterThanOrEqual(0);
      expect(m.reward.crystal).toBeGreaterThanOrEqual(0);
      expect(m.reward.deuterium).toBeGreaterThanOrEqual(0);
      expect(m.reward.dark_matter).toBeGreaterThanOrEqual(0);
      expect(m.reward.points).toBeGreaterThanOrEqual(0);
    }
  });

  test('includes specific expected mission types', () => {
    const types = new Set(DAILY_MISSIONS.map((m) => m.type));
    expect(types.has('build_3_ships')).toBe(true);
    expect(types.has('attack_2_players')).toBe(true);
    expect(types.has('trade_1000_metal')).toBe(true);
    expect(types.has('research_1_tech')).toBe(true);
    expect(types.has('spy_3_planets')).toBe(true);
    expect(types.has('upgrade_mine_3x')).toBe(true);
    expect(types.has('collect_debris')).toBe(true);
    expect(types.has('send_5_fleets')).toBe(true);
    expect(types.has('earn_1000_points')).toBe(true);
    expect(types.has('join_alliance')).toBe(true);
  });
});

// ============================================================================
// 2. getTodayKey
// ============================================================================

describe('getTodayKey', () => {
  test('returns YYYY-MM-DD format', () => {
    const key = getTodayKey();
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('respects passed date', () => {
    const d = new Date('2026-02-22T10:00:00Z');
    expect(getTodayKey(d)).toBe('2026-02-22');
  });

  test('is based on UTC, not local time', () => {
    const d = new Date('2026-02-22T23:59:00Z');
    expect(getTodayKey(d)).toBe('2026-02-22');
  });
});

// ============================================================================
// 3. pickMissions
// ============================================================================

describe('pickMissions', () => {
  test('returns exactly count missions', () => {
    const picked = pickMissions('player-1', '2026-02-22', 3);
    expect(picked).toHaveLength(3);
  });

  test('returns unique mission types', () => {
    const picked = pickMissions('player-1', '2026-02-22', 3);
    const types = picked.map((m) => m.type);
    expect(new Set(types).size).toBe(3);
  });

  test('is deterministic for same player+date', () => {
    const a = pickMissions('abc', '2026-02-22', 3).map((m) => m.type);
    const b = pickMissions('abc', '2026-02-22', 3).map((m) => m.type);
    expect(a).toEqual(b);
  });

  test('differs between players on same day', () => {
    const a = pickMissions('player-A', '2026-02-22', 3).map((m) => m.type);
    const b = pickMissions('player-B', '2026-02-22', 3).map((m) => m.type);
    // Not guaranteed to differ, but with 14 missions it is extremely unlikely to be equal
    // Use a larger sample to be safe
    const a5 = pickMissions('player-A', '2026-02-22', 5).map((m) => m.type);
    const b5 = pickMissions('player-B', '2026-02-22', 5).map((m) => m.type);
    expect(a5.join(',')).not.toBe(b5.join(','));
  });

  test('differs between dates for same player', () => {
    const a = pickMissions('player-X', '2026-02-22', 3).map((m) => m.type);
    const b = pickMissions('player-X', '2026-02-23', 3).map((m) => m.type);
    expect(a.join(',')).not.toBe(b.join(','));
  });

  test('allows count=1', () => {
    const picked = pickMissions('solo', '2026-01-01', 1);
    expect(picked).toHaveLength(1);
  });
});

// ============================================================================
// 4. generateDailyMissions
// ============================================================================

describe('generateDailyMissions', () => {
  test('generates 3 missions when none exist', async () => {
    const db = makeDb({ missionRows: [], allEmpty: false });
    // Override all() for daily_missions to return empty
    const missions = await generateDailyMissions(db, 'player-1', 3);
    expect(missions).toHaveLength(3);
  });

  test('returns existing rows without inserting new ones', async () => {
    const today = getTodayKey();
    const fakeRows = [
      { id: 'dm-1', player_id: 'player-1', mission_type: 'build_3_ships', date_key: today, status: 'active', progress: 1, target: 3, assigned_at: 1000, completed_at: null, claimed_at: null },
      { id: 'dm-2', player_id: 'player-1', mission_type: 'spy_3_planets', date_key: today, status: 'active', progress: 0, target: 3, assigned_at: 1000, completed_at: null, claimed_at: null },
      { id: 'dm-3', player_id: 'player-1', mission_type: 'research_1_tech', date_key: today, status: 'completed', progress: 1, target: 1, assigned_at: 1000, completed_at: 2000, claimed_at: null },
    ];
    const db = makeDb({ missionRows: fakeRows });
    const missions = await generateDailyMissions(db, 'player-1', 3);
    expect(missions).toHaveLength(3);
    expect(missions[0].missionType).toBe('build_3_ships');
  });

  test('each generated mission has expected fields', async () => {
    const db = makeDb({ missionRows: [] });
    const missions = await generateDailyMissions(db, 'player-99', 3);
    for (const m of missions) {
      expect(m.playerId).toBe('player-99');
      expect(m.status).toBe('active');
      expect(m.progress).toBe(0);
      expect(m.target).toBeGreaterThan(0);
      expect(m.definition).toBeDefined();
    }
  });
});

// ============================================================================
// 5. checkMissionProgress
// ============================================================================

describe('checkMissionProgress', () => {
  test('returns null for unknown mission', async () => {
    const db = makeDb({ missionRow: null });
    const result = await checkMissionProgress(db, 'player-1', 'nonexistent-id');
    expect(result).toBeNull();
  });

  test('returns mission unchanged if already claimed', async () => {
    const today = getTodayKey();
    const claimedRow = {
      id: 'dm-claimed', player_id: 'player-1', mission_type: 'build_3_ships',
      date_key: today, status: 'claimed', progress: 3, target: 3,
      assigned_at: 100, completed_at: 200, claimed_at: 300,
    };
    const db = makeDb({ missionRow: claimedRow });
    const result = await checkMissionProgress(db, 'player-1', 'dm-claimed');
    expect(result).not.toBeNull();
    expect(result!.status).toBe('claimed');
  });

  test('updates progress from stat column', async () => {
    const today = getTodayKey();
    const activeRow = {
      id: 'dm-active', player_id: 'player-1', mission_type: 'spy_3_planets',
      date_key: today, status: 'active', progress: 0, target: 3,
      assigned_at: 100, completed_at: null, claimed_at: null,
    };
    const db = makeDb({ missionRow: activeRow, statsRow: { val: 2 } });
    const result = await checkMissionProgress(db, 'player-1', 'dm-active');
    expect(result).not.toBeNull();
    expect(result!.progress).toBe(2);
    expect(result!.status).toBe('active');
  });

  test('marks mission completed when progress meets target', async () => {
    const today = getTodayKey();
    const activeRow = {
      id: 'dm-done', player_id: 'player-1', mission_type: 'research_1_tech',
      date_key: today, status: 'active', progress: 0, target: 1,
      assigned_at: 100, completed_at: null, claimed_at: null,
    };
    const db = makeDb({ missionRow: activeRow, statsRow: { val: 5 } });
    const result = await checkMissionProgress(db, 'player-1', 'dm-done');
    expect(result).not.toBeNull();
    expect(result!.status).toBe('completed');
    expect(result!.progress).toBe(1); // clamped to target
  });
});

// ============================================================================
// 6. claimMissionReward
// ============================================================================

describe('claimMissionReward', () => {
  test('returns null when mission not found', async () => {
    const db = makeDb({ missionRow: null });
    const result = await claimMissionReward(db, 'player-1', 'bad-id');
    expect(result).toBeNull();
  });

  test('returns null if mission is still active (not completed)', async () => {
    const today = getTodayKey();
    const activeRow = {
      id: 'dm-active', player_id: 'player-1', mission_type: 'build_3_ships',
      date_key: today, status: 'active', progress: 1, target: 3,
      assigned_at: 100, completed_at: null, claimed_at: null,
    };
    const db = makeDb({ missionRow: activeRow });
    const result = await claimMissionReward(db, 'player-1', 'dm-active');
    expect(result).toBeNull();
  });

  test('returns reward when mission is completed', async () => {
    const today = getTodayKey();
    const completedRow = {
      id: 'dm-comp', player_id: 'player-1', mission_type: 'research_1_tech',
      date_key: today, status: 'completed', progress: 1, target: 1,
      assigned_at: 100, completed_at: 200, claimed_at: null,
    };
    const db = makeDb({ missionRow: completedRow });
    const result = await claimMissionReward(db, 'player-1', 'dm-comp');
    expect(result).not.toBeNull();
    expect(result!.reward).toBeDefined();
    expect(result!.reward.dark_matter).toBeGreaterThan(0);
    expect(result!.mission.status).toBe('claimed');
  });

  test('already claimed missions return null', async () => {
    const today = getTodayKey();
    const claimedRow = {
      id: 'dm-already', player_id: 'player-1', mission_type: 'build_3_ships',
      date_key: today, status: 'claimed', progress: 3, target: 3,
      assigned_at: 100, completed_at: 200, claimed_at: 300,
    };
    const db = makeDb({ missionRow: claimedRow });
    const result = await claimMissionReward(db, 'player-1', 'dm-already');
    expect(result).toBeNull();
  });
});

// ============================================================================
// 7. resetDailyMissions
// ============================================================================

describe('resetDailyMissions', () => {
  test('returns reset count of 0 when no active players', async () => {
    const db = makeDb({ playerRows: [] });
    const result = await resetDailyMissions(db);
    expect(result.reset).toBe(0);
  });

  test('returns reset count matching active players', async () => {
    const db = makeDb({
      playerRows: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }],
      missionRows: [], // no existing missions → generate new ones
    });
    const result = await resetDailyMissions(db);
    expect(result.reset).toBe(3);
  });
});

// ============================================================================
// 8. DailyMissionService class
// ============================================================================

describe('DailyMissionService class', () => {
  test('can be instantiated and has all methods', () => {
    const db = makeDb();
    const svc = new DailyMissionService(db);
    expect(typeof svc.generateMissions).toBe('function');
    expect(typeof svc.getMissions).toBe('function');
    expect(typeof svc.checkProgress).toBe('function');
    expect(typeof svc.claimReward).toBe('function');
    expect(typeof svc.reset).toBe('function');
  });

  test('getMissions delegates to getDailyMissions', async () => {
    const db = makeDb({ missionRows: [] });
    const svc = new DailyMissionService(db);
    const missions = await svc.getMissions('player-class-test');
    expect(Array.isArray(missions)).toBe(true);
    expect(missions.length).toBe(3);
  });
});

// ============================================================================
// 9. progressPercent calculation
// ============================================================================

describe('progressPercent', () => {
  test('is 0 at start', async () => {
    const db = makeDb({ missionRows: [] });
    const missions = await generateDailyMissions(db, 'pct-player', 3);
    for (const m of missions) {
      expect(m.progressPercent).toBe(0);
    }
  });

  test('is 100 when progress equals target', async () => {
    const today = getTodayKey();
    const rows = [
      { id: 'dm-full', player_id: 'p1', mission_type: 'build_3_ships', date_key: today, status: 'completed', progress: 3, target: 3, assigned_at: 1, completed_at: 2, claimed_at: null },
    ];
    const db = makeDb({ missionRows: rows });
    const missions = await generateDailyMissions(db, 'p1', 3);
    const full = missions.find((m) => m.id === 'dm-full');
    expect(full?.progressPercent).toBe(100);
  });
});
