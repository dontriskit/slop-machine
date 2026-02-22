/**
 * Unit tests for Achievement and Stats services
 *
 * Tests cover:
 *  - Achievement progress calculation
 *  - Achievement unlocking logic (pure functions, no D1 needed)
 *  - Stat event routing
 *  - Leaderboard parameter validation
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  ACHIEVEMENTS,
  ACHIEVEMENT_MAP,
  getAchievementProgress,
  type AggregatedPlayerStats,
} from '../../worker/src/game/services/achievementService';

// ============================================================================
// HELPERS
// ============================================================================

function makeStats(overrides: Partial<AggregatedPlayerStats> = {}): AggregatedPlayerStats {
  return {
    battlesWon: 0,
    battlesLost: 0,
    battlesDraw: 0,
    shipsDestroyed: 0,
    shipsLost: 0,
    resourcesRaided: 0,
    fleetsDispatched: 0,
    espionageSent: 0,
    buildingsBuilt: 0,
    researchCompleted: 0,
    planetsColonized: 0,
    tradesCompleted: 0,
    agentDecisions: 0,
    playTimeDays: 0,
    allianceJoined: false,
    deathstarsBuilt: 0,
    ...overrides,
  };
}

// ============================================================================
// ACHIEVEMENT DEFINITIONS
// ============================================================================

describe('Achievement definitions', () => {
  test('ACHIEVEMENTS array is non-empty', () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThan(0);
  });

  test('has at least 30 achievements', () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(30);
  });

  test('every achievement has a unique id', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  test('every achievement has valid category', () => {
    const validCategories = ['combat', 'economy', 'exploration', 'social', 'special'];
    for (const a of ACHIEVEMENTS) {
      expect(validCategories).toContain(a.category);
    }
  });

  test('every achievement has positive points', () => {
    for (const a of ACHIEVEMENTS) {
      expect(a.points).toBeGreaterThan(0);
    }
  });

  test('every achievement has non-empty name and description', () => {
    for (const a of ACHIEVEMENTS) {
      expect(a.name.trim().length).toBeGreaterThan(0);
      expect(a.description.trim().length).toBeGreaterThan(0);
    }
  });

  test('every achievement has a positive threshold', () => {
    for (const a of ACHIEVEMENTS) {
      expect(a.requirement.threshold).toBeGreaterThan(0);
    }
  });

  test('ACHIEVEMENT_MAP contains same entries as ACHIEVEMENTS', () => {
    for (const a of ACHIEVEMENTS) {
      expect(ACHIEVEMENT_MAP[a.id]).toBeDefined();
      expect(ACHIEVEMENT_MAP[a.id].name).toBe(a.name);
    }
  });

  test('specific achievements exist', () => {
    expect(ACHIEVEMENT_MAP['first_blood']).toBeDefined();
    expect(ACHIEVEMENT_MAP['warrior']).toBeDefined();
    expect(ACHIEVEMENT_MAP['conqueror']).toBeDefined();
    expect(ACHIEVEMENT_MAP['death_star_commander']).toBeDefined();
    expect(ACHIEVEMENT_MAP['raider']).toBeDefined();
    expect(ACHIEVEMENT_MAP['first_colony']).toBeDefined();
    expect(ACHIEVEMENT_MAP['empire_builder']).toBeDefined();
    expect(ACHIEVEMENT_MAP['spy_master']).toBeDefined();
    expect(ACHIEVEMENT_MAP['navigator']).toBeDefined();
    expect(ACHIEVEMENT_MAP['team_player']).toBeDefined();
    expect(ACHIEVEMENT_MAP['trader']).toBeDefined();
    expect(ACHIEVEMENT_MAP['ai_ally']).toBeDefined();
    expect(ACHIEVEMENT_MAP['veteran']).toBeDefined();
  });

  test('first_blood is combat category with 10 points', () => {
    const a = ACHIEVEMENT_MAP['first_blood'];
    expect(a.category).toBe('combat');
    expect(a.points).toBe(10);
    expect(a.requirement.type).toBe('first_battle');
    expect(a.requirement.threshold).toBe(1);
  });

  test('death_star_commander is 500 points', () => {
    const a = ACHIEVEMENT_MAP['death_star_commander'];
    expect(a.points).toBe(500);
    expect(a.requirement.type).toBe('deathstars_built');
  });

  test('veteran requires 7 play days', () => {
    const a = ACHIEVEMENT_MAP['veteran'];
    expect(a.requirement.type).toBe('play_days');
    expect(a.requirement.threshold).toBe(7);
    expect(a.category).toBe('special');
  });
});

// ============================================================================
// PROGRESS CALCULATION
// ============================================================================

describe('getAchievementProgress', () => {
  test('returns 0 for unknown achievement', () => {
    const progress = getAchievementProgress('nonexistent_achievement', makeStats());
    expect(progress).toBe(0);
  });

  test('returns 0 when stat is 0', () => {
    const progress = getAchievementProgress('warrior', makeStats({ battlesWon: 0 }));
    expect(progress).toBe(0);
  });

  test('returns 50 when halfway to threshold', () => {
    // warrior requires 10 battles won
    const progress = getAchievementProgress('warrior', makeStats({ battlesWon: 5 }));
    expect(progress).toBe(50);
  });

  test('returns 100 when threshold exactly met', () => {
    const progress = getAchievementProgress('warrior', makeStats({ battlesWon: 10 }));
    expect(progress).toBe(100);
  });

  test('caps at 100 when threshold exceeded', () => {
    const progress = getAchievementProgress('warrior', makeStats({ battlesWon: 999 }));
    expect(progress).toBe(100);
  });

  test('first_blood progress with 0 wins', () => {
    const progress = getAchievementProgress('first_blood', makeStats({ battlesWon: 0 }));
    expect(progress).toBe(0);
  });

  test('first_blood progress with 1 win', () => {
    const progress = getAchievementProgress('first_blood', makeStats({ battlesWon: 1 }));
    expect(progress).toBe(100);
  });

  test('conqueror progress at 50 wins is 50%', () => {
    // conqueror requires 100 battles won
    const progress = getAchievementProgress('conqueror', makeStats({ battlesWon: 50 }));
    expect(progress).toBe(50);
  });

  test('raider progress tracks resourcesRaided', () => {
    // raider requires 1_000_000 resources raided
    const progress = getAchievementProgress('raider', makeStats({ resourcesRaided: 500_000 }));
    expect(progress).toBe(50);
  });

  test('spy_master progress tracks espionageSent', () => {
    // spy_master requires 50 espionage probes
    const progress = getAchievementProgress('spy_master', makeStats({ espionageSent: 25 }));
    expect(progress).toBe(50);
  });

  test('navigator progress tracks fleetsDispatched', () => {
    // navigator requires 100 fleet missions
    const progress = getAchievementProgress('navigator', makeStats({ fleetsDispatched: 100 }));
    expect(progress).toBe(100);
  });

  test('team_player progress with alliance', () => {
    const noAlliance = getAchievementProgress('team_player', makeStats({ allianceJoined: false }));
    const withAlliance = getAchievementProgress('team_player', makeStats({ allianceJoined: true }));
    expect(noAlliance).toBe(0);
    expect(withAlliance).toBe(100);
  });

  test('death_star_commander tracks deathstarsBuilt', () => {
    const none = getAchievementProgress('death_star_commander', makeStats({ deathstarsBuilt: 0 }));
    const one = getAchievementProgress('death_star_commander', makeStats({ deathstarsBuilt: 1 }));
    expect(none).toBe(0);
    expect(one).toBe(100);
  });

  test('veteran tracks playTimeDays', () => {
    const progress3 = getAchievementProgress('veteran', makeStats({ playTimeDays: 3 }));
    // 3/7 = 0.428... -> floor(42.8) = 42
    expect(progress3).toBe(42);

    const progress7 = getAchievementProgress('veteran', makeStats({ playTimeDays: 7 }));
    expect(progress7).toBe(100);
  });

  test('ai_ally tracks agentDecisions', () => {
    const progress = getAchievementProgress('ai_ally', makeStats({ agentDecisions: 25 }));
    expect(progress).toBe(50);
  });

  test('tech_pioneer tracks researchCompleted', () => {
    const none = getAchievementProgress('tech_pioneer', makeStats({ researchCompleted: 0 }));
    const one = getAchievementProgress('tech_pioneer', makeStats({ researchCompleted: 1 }));
    expect(none).toBe(0);
    expect(one).toBe(100);
  });

  test('first_colony tracks planetsColonized', () => {
    const none = getAchievementProgress('first_colony', makeStats({ planetsColonized: 0 }));
    const one = getAchievementProgress('first_colony', makeStats({ planetsColonized: 1 }));
    expect(none).toBe(0);
    expect(one).toBe(100);
  });

  test('empire_builder at 3/5 planets is 60%', () => {
    const progress = getAchievementProgress('empire_builder', makeStats({ planetsColonized: 3 }));
    expect(progress).toBe(60);
  });
});

// ============================================================================
// ACHIEVEMENT UNLOCKING LOGIC (pure, no D1)
// ============================================================================

describe('Achievement threshold logic', () => {
  test('player with 100 battles won satisfies conqueror and warrior', () => {
    const stats = makeStats({ battlesWon: 100 });

    const warriorProg = getAchievementProgress('warrior', stats);
    const conquerorProg = getAchievementProgress('conqueror', stats);

    expect(warriorProg).toBe(100);
    expect(conquerorProg).toBe(100);
  });

  test('player with 10 battles satisfies warrior but not conqueror', () => {
    const stats = makeStats({ battlesWon: 10 });

    const warriorProg = getAchievementProgress('warrior', stats);
    const conquerorProg = getAchievementProgress('conqueror', stats);

    expect(warriorProg).toBe(100);
    expect(conquerorProg).toBe(10);
  });

  test('all achievements with threshold 1 unlock with a value of 1', () => {
    const stats = makeStats({
      battlesWon: 1,
      researchCompleted: 1,
      planetsColonized: 1,
      allianceJoined: true,
      deathstarsBuilt: 1,
    });

    const thresholdOneAchievements = ACHIEVEMENTS.filter(
      (a) => a.requirement.threshold === 1
    );

    for (const achievement of thresholdOneAchievements) {
      const progress = getAchievementProgress(achievement.id, stats);
      expect(progress).toBe(100);
    }
  });

  test('progress is always 0–100 inclusive', () => {
    const extremeStats = makeStats({
      battlesWon: 999999,
      shipsDestroyed: 999999,
      resourcesRaided: 999999999,
      fleetsDispatched: 999999,
      espionageSent: 999999,
      buildingsBuilt: 999999,
      researchCompleted: 999999,
      planetsColonized: 999999,
      tradesCompleted: 999999,
      agentDecisions: 999999,
      playTimeDays: 999,
      allianceJoined: true,
      deathstarsBuilt: 99,
    });

    for (const achievement of ACHIEVEMENTS) {
      const progress = getAchievementProgress(achievement.id, extremeStats);
      expect(progress).toBeGreaterThanOrEqual(0);
      expect(progress).toBeLessThanOrEqual(100);
    }
  });
});

// ============================================================================
// CATEGORY COUNTS
// ============================================================================

describe('Achievement categories', () => {
  test('has achievements in every category', () => {
    const categories = new Set(ACHIEVEMENTS.map((a) => a.category));
    expect(categories.has('combat')).toBe(true);
    expect(categories.has('economy')).toBe(true);
    expect(categories.has('exploration')).toBe(true);
    expect(categories.has('social')).toBe(true);
    expect(categories.has('special')).toBe(true);
  });

  test('combat category has at least 5 achievements', () => {
    const combatAchievements = ACHIEVEMENTS.filter((a) => a.category === 'combat');
    expect(combatAchievements.length).toBeGreaterThanOrEqual(5);
  });

  test('exploration category has at least 4 achievements', () => {
    const explorationAchievements = ACHIEVEMENTS.filter((a) => a.category === 'exploration');
    expect(explorationAchievements.length).toBeGreaterThanOrEqual(4);
  });

  test('special category has at least 3 achievements', () => {
    const specialAchievements = ACHIEVEMENTS.filter((a) => a.category === 'special');
    expect(specialAchievements.length).toBeGreaterThanOrEqual(3);
  });
});

// ============================================================================
// STAT TRACKING (pure logic tests, no D1)
// ============================================================================

describe('Stat event routing', () => {
  // We test the stat→achievement mapping by verifying that the stat counters
  // used by progress calculation map to the correct achievement requirements.

  test('battlesWon drives battle_wins and first_battle achievements', () => {
    const stats1 = makeStats({ battlesWon: 1 });
    expect(getAchievementProgress('first_blood', stats1)).toBe(100);
    expect(getAchievementProgress('warrior', stats1)).toBe(10);

    const stats10 = makeStats({ battlesWon: 10 });
    expect(getAchievementProgress('warrior', stats10)).toBe(100);
  });

  test('shipsDestroyed drives ships_destroyed achievement', () => {
    const stats = makeStats({ shipsDestroyed: 500 });
    expect(getAchievementProgress('destroyer', stats)).toBe(50);

    const statsFull = makeStats({ shipsDestroyed: 1000 });
    expect(getAchievementProgress('destroyer', statsFull)).toBe(100);
  });

  test('resourcesRaided drives resources_raided achievements', () => {
    const stats = makeStats({ resourcesRaided: 1_000_000 });
    expect(getAchievementProgress('raider', stats)).toBe(100);
  });

  test('planetsColonized drives colonization achievements', () => {
    const stats = makeStats({ planetsColonized: 1 });
    expect(getAchievementProgress('first_colony', stats)).toBe(100);
    expect(getAchievementProgress('empire_builder', stats)).toBe(20);
  });

  test('agentDecisions drives ai achievements', () => {
    const stats = makeStats({ agentDecisions: 50 });
    expect(getAchievementProgress('ai_ally', stats)).toBe(100);
    expect(getAchievementProgress('ai_overlord', stats)).toBe(10);
  });

  test('tradesCompleted drives trader achievements', () => {
    const stats = makeStats({ tradesCompleted: 10 });
    expect(getAchievementProgress('trader', stats)).toBe(100);
    expect(getAchievementProgress('merchant', stats)).toBe(10);
  });
});

// ============================================================================
// POINT VALUES
// ============================================================================

describe('Achievement point values', () => {
  test('first_blood has 10 points', () => {
    expect(ACHIEVEMENT_MAP['first_blood'].points).toBe(10);
  });

  test('warrior has 50 points', () => {
    expect(ACHIEVEMENT_MAP['warrior'].points).toBe(50);
  });

  test('conqueror has 200 points', () => {
    expect(ACHIEVEMENT_MAP['conqueror'].points).toBe(200);
  });

  test('death_star_commander has 500 points', () => {
    expect(ACHIEVEMENT_MAP['death_star_commander'].points).toBe(500);
  });

  test('raider has 150 points', () => {
    expect(ACHIEVEMENT_MAP['raider'].points).toBe(150);
  });

  test('ai_ally has 75 points', () => {
    expect(ACHIEVEMENT_MAP['ai_ally'].points).toBe(75);
  });

  test('team_player has 20 points', () => {
    expect(ACHIEVEMENT_MAP['team_player'].points).toBe(20);
  });

  test('veteran has 50 points', () => {
    expect(ACHIEVEMENT_MAP['veteran'].points).toBe(50);
  });

  test('harder achievements have more points than easier ones', () => {
    // conqueror (100 wins, 200pts) > warrior (10 wins, 50pts)
    expect(ACHIEVEMENT_MAP['conqueror'].points).toBeGreaterThan(ACHIEVEMENT_MAP['warrior'].points);
    // warlord (500 wins) > conqueror (100 wins)
    expect(ACHIEVEMENT_MAP['warlord'].points).toBeGreaterThan(ACHIEVEMENT_MAP['conqueror'].points);
  });
});
