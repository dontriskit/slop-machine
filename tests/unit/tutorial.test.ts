/**
 * Unit tests for Tutorial Service
 *
 * Tests cover:
 *  - TUTORIAL_STEPS config array integrity
 *  - Pure helper functions (no D1 dependency)
 *  - getTutorialProgress (with mocked D1)
 *  - completeTutorialStep logic
 *  - claimReward logic
 *  - skipTutorial logic
 *  - getNextStep logic
 *  - Edge cases: duplicate completion, unknown steps, all steps done
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  TUTORIAL_STEPS,
  TUTORIAL_STEP_MAP,
  getTutorialCompletionPercent,
  isValidStepId,
  getTutorialProgress,
  completeTutorialStep,
  claimReward,
  skipTutorial,
  getNextStep,
  TutorialService,
  tutorialService,
  type TutorialProgress,
  type TutorialStep,
} from '../../worker/src/game/services/tutorialService';

// ============================================================================
// HELPERS — D1 mock factory
// ============================================================================

/**
 * Build a minimal D1Database mock.
 * `rows` is the data returned by `.first()` calls.
 * `.all()` returns `{ results: [] }` by default.
 * `.run()` always succeeds.
 */
function makeDb(opts: {
  progressRow?: Record<string, unknown> | null;
  planetRow?: Record<string, unknown> | null;
  playerRow?: Record<string, unknown> | null;
} = {}): D1Database {
  const {
    progressRow = null,
    planetRow = null,
    playerRow = null,
  } = opts;

  const stmt = {
    bind: vi.fn().mockReturnThis(),
    first: vi.fn().mockImplementation(async () => {
      // Return the right row depending on the bound SQL (simplistic heuristic)
      return progressRow;
    }),
    all: vi.fn().mockResolvedValue({ results: [] }),
    run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
  };

  return {
    prepare: vi.fn().mockReturnValue(stmt),
  } as unknown as D1Database;
}

/**
 * Build a mock that returns different rows for different table queries.
 */
function makeSmartDb(opts: {
  progressRow?: Record<string, unknown> | null;
  planetRow?: Record<string, unknown> | null;
  playerRow?: Record<string, unknown> | null;
} = {}): D1Database {
  const { progressRow = null, planetRow = null, playerRow = null } = opts;

  return {
    prepare: vi.fn().mockImplementation((sql: string) => {
      let resolvedFirst: () => Promise<unknown>;

      if (sql.includes('tutorial_progress')) {
        resolvedFirst = async () => progressRow;
      } else if (sql.includes('planets') && sql.includes('ORDER')) {
        resolvedFirst = async () => planetRow;
      } else if (sql.includes('players')) {
        resolvedFirst = async () => playerRow;
      } else {
        resolvedFirst = async () => null;
      }

      return {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockImplementation(resolvedFirst),
        all: vi.fn().mockResolvedValue({ results: [] }),
        run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
      };
    }),
  } as unknown as D1Database;
}

function makeProgressRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    player_id: 'player-1',
    completed_steps: '[]',
    claimed_steps: '[]',
    current_step_id: 'build_metal_mine',
    skipped: 0,
    started_at: 1700000000,
    completed_at: null,
    ...overrides,
  };
}

// ============================================================================
// TUTORIAL STEP DEFINITIONS
// ============================================================================

describe('TUTORIAL_STEPS config', () => {
  test('array is non-empty', () => {
    expect(TUTORIAL_STEPS.length).toBeGreaterThan(0);
  });

  test('has exactly 11 steps', () => {
    expect(TUTORIAL_STEPS.length).toBe(11);
  });

  test('every step has a unique id', () => {
    const ids = TUTORIAL_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('order values are 1-based and sequential', () => {
    const sorted = [...TUTORIAL_STEPS].sort((a, b) => a.order - b.order);
    sorted.forEach((step, idx) => {
      expect(step.order).toBe(idx + 1);
    });
  });

  test('every step has a non-empty title, description, and hint', () => {
    for (const step of TUTORIAL_STEPS) {
      expect(step.title.trim().length).toBeGreaterThan(0);
      expect(step.description.trim().length).toBeGreaterThan(0);
      expect(step.hint.trim().length).toBeGreaterThan(0);
    }
  });

  test('every step has a reward with non-negative values', () => {
    for (const step of TUTORIAL_STEPS) {
      expect(step.reward.metal).toBeGreaterThanOrEqual(0);
      expect(step.reward.crystal).toBeGreaterThanOrEqual(0);
      expect(step.reward.deuterium).toBeGreaterThanOrEqual(0);
      expect(step.reward.dark_matter).toBeGreaterThanOrEqual(0);
    }
  });

  test('every step has a requirement with a valid type', () => {
    const validTypes = [
      'build_building',
      'upgrade_building',
      'enable_agent',
      'complete_research',
      'build_ship',
      'open_galaxy_map',
      'send_espionage',
    ];
    for (const step of TUTORIAL_STEPS) {
      expect(validTypes).toContain(step.requirement.type);
    }
  });

  test('TUTORIAL_STEP_MAP contains all steps', () => {
    for (const step of TUTORIAL_STEPS) {
      expect(TUTORIAL_STEP_MAP[step.id]).toBeDefined();
      expect(TUTORIAL_STEP_MAP[step.id].id).toBe(step.id);
    }
  });

  test('first step is build_metal_mine', () => {
    const first = TUTORIAL_STEPS.find((s) => s.order === 1);
    expect(first?.id).toBe('build_metal_mine');
  });

  test('last step is first_espionage', () => {
    const last = TUTORIAL_STEPS.find((s) => s.order === 11);
    expect(last?.id).toBe('first_espionage');
  });

  test('enable_ai_agent step gives dark_matter reward', () => {
    const step = TUTORIAL_STEP_MAP['enable_ai_agent'];
    expect(step).toBeDefined();
    expect(step.reward.dark_matter).toBeGreaterThan(0);
  });
});

// ============================================================================
// PURE HELPERS
// ============================================================================

describe('getTutorialCompletionPercent', () => {
  test('returns 0 when no steps completed', () => {
    expect(getTutorialCompletionPercent([])).toBe(0);
  });

  test('returns 100 when all steps completed', () => {
    const allIds = TUTORIAL_STEPS.map((s) => s.id);
    expect(getTutorialCompletionPercent(allIds)).toBe(100);
  });

  test('returns ~50 when roughly half steps completed', () => {
    const half = TUTORIAL_STEPS.slice(0, 5).map((s) => s.id); // 5 of 11 ≈ 45%
    const pct = getTutorialCompletionPercent(half);
    expect(pct).toBeGreaterThan(40);
    expect(pct).toBeLessThan(60);
  });

  test('returns a number between 0 and 100', () => {
    const pct = getTutorialCompletionPercent(['build_metal_mine', 'upgrade_metal_mine']);
    expect(pct).toBeGreaterThanOrEqual(0);
    expect(pct).toBeLessThanOrEqual(100);
  });
});

describe('isValidStepId', () => {
  test('returns true for all known step IDs', () => {
    for (const step of TUTORIAL_STEPS) {
      expect(isValidStepId(step.id)).toBe(true);
    }
  });

  test('returns false for unknown step IDs', () => {
    expect(isValidStepId('nonexistent_step')).toBe(false);
    expect(isValidStepId('')).toBe(false);
    expect(isValidStepId('BUILD_METAL_MINE')).toBe(false); // case-sensitive
  });
});

// ============================================================================
// getTutorialProgress
// ============================================================================

describe('getTutorialProgress', () => {
  test('returns existing progress when record found', async () => {
    const row = makeProgressRow({
      completed_steps: '["build_metal_mine"]',
      current_step_id: 'upgrade_metal_mine',
    });
    const db = makeSmartDb({ progressRow: row });

    const progress = await getTutorialProgress('player-1', db);

    expect(progress.playerId).toBe('player-1');
    expect(progress.completedSteps).toEqual(['build_metal_mine']);
    expect(progress.currentStepId).toBe('upgrade_metal_mine');
    expect(progress.skipped).toBe(false);
  });

  test('initializes default progress when no record exists', async () => {
    const db = makeSmartDb({ progressRow: null });

    const progress = await getTutorialProgress('new-player', db);

    expect(progress.playerId).toBe('new-player');
    expect(progress.completedSteps).toEqual([]);
    expect(progress.claimedSteps).toEqual([]);
    expect(progress.currentStepId).toBe('build_metal_mine');
    expect(progress.skipped).toBe(false);
    expect(progress.completedAt).toBeNull();
  });

  test('marks as skipped when skipped = 1 in DB', async () => {
    const row = makeProgressRow({ skipped: 1, current_step_id: null });
    const db = makeSmartDb({ progressRow: row });

    const progress = await getTutorialProgress('player-1', db);

    expect(progress.skipped).toBe(true);
    expect(progress.currentStepId).toBeNull();
  });
});

// ============================================================================
// completeTutorialStep
// ============================================================================

describe('completeTutorialStep', () => {
  test('returns error for unknown step ID', async () => {
    const db = makeSmartDb({ progressRow: makeProgressRow() });

    const result = await completeTutorialStep('player-1', 'fake_step', db);

    expect(result.completed).toBe(false);
    expect(result.error).toContain('Unknown step');
  });

  test('returns error if tutorial is skipped', async () => {
    const db = makeSmartDb({
      progressRow: makeProgressRow({ skipped: 1, current_step_id: null }),
    });

    const result = await completeTutorialStep('player-1', 'build_metal_mine', db);

    expect(result.completed).toBe(false);
    expect(result.error).toContain('skipped');
  });

  test('successfully marks a step as completed', async () => {
    const db = makeSmartDb({ progressRow: makeProgressRow() });

    const result = await completeTutorialStep('player-1', 'build_metal_mine', db);

    expect(result.completed).toBe(true);
    expect(result.stepId).toBe('build_metal_mine');
    expect(result.nextStepId).toBe('upgrade_metal_mine');
    expect(result.tutorialComplete).toBe(false);
    expect(result.reward).not.toBeNull();
    expect(result.reward?.metal).toBeGreaterThan(0);
  });

  test('is idempotent — completing same step twice returns completed=true', async () => {
    const row = makeProgressRow({
      completed_steps: '["build_metal_mine"]',
      current_step_id: 'upgrade_metal_mine',
    });
    const db = makeSmartDb({ progressRow: row });

    const result = await completeTutorialStep('player-1', 'build_metal_mine', db);

    expect(result.completed).toBe(true);
    expect(result.reward).toBeNull(); // no reward returned for duplicate
  });

  test('marks tutorial as complete when last step is completed', async () => {
    const allButLast = TUTORIAL_STEPS
      .filter((s) => s.id !== 'first_espionage')
      .map((s) => s.id);

    const row = makeProgressRow({
      completed_steps: JSON.stringify(allButLast),
      current_step_id: 'first_espionage',
    });
    const db = makeSmartDb({ progressRow: row });

    const result = await completeTutorialStep('player-1', 'first_espionage', db);

    expect(result.completed).toBe(true);
    expect(result.nextStepId).toBeNull();
    expect(result.tutorialComplete).toBe(true);
  });

  test('reward is not null on fresh step completion', async () => {
    const db = makeSmartDb({ progressRow: makeProgressRow() });

    const result = await completeTutorialStep('player-1', 'build_metal_mine', db);

    expect(result.reward).not.toBeNull();
    const step = TUTORIAL_STEP_MAP['build_metal_mine'];
    expect(result.reward?.metal).toBe(step.reward.metal);
    expect(result.reward?.crystal).toBe(step.reward.crystal);
  });
});

// ============================================================================
// claimReward
// ============================================================================

describe('claimReward', () => {
  test('returns error for unknown step ID', async () => {
    const db = makeSmartDb({ progressRow: makeProgressRow() });

    const result = await claimReward('player-1', 'bad_step', db);

    expect(result.claimed).toBe(false);
    expect(result.error).toContain('Unknown step');
  });

  test('returns error if step not yet completed', async () => {
    const db = makeSmartDb({ progressRow: makeProgressRow() });

    const result = await claimReward('player-1', 'build_metal_mine', db);

    expect(result.claimed).toBe(false);
    expect(result.error).toContain('not yet completed');
  });

  test('returns error if reward already claimed', async () => {
    const row = makeProgressRow({
      completed_steps: '["build_metal_mine"]',
      claimed_steps: '["build_metal_mine"]',
    });
    const db = makeSmartDb({ progressRow: row });

    const result = await claimReward('player-1', 'build_metal_mine', db);

    expect(result.claimed).toBe(false);
    expect(result.error).toContain('already claimed');
  });

  test('successfully claims reward when step is completed and unclaimed', async () => {
    const row = makeProgressRow({
      completed_steps: '["build_metal_mine"]',
      claimed_steps: '[]',
    });
    const db = makeSmartDb({
      progressRow: row,
      planetRow: { id: 'planet-1' },
    });

    const result = await claimReward('player-1', 'build_metal_mine', db);

    expect(result.claimed).toBe(true);
    expect(result.reward).not.toBeNull();
    expect(result.reward?.metal).toBe(TUTORIAL_STEP_MAP['build_metal_mine'].reward.metal);
  });

  test('credits dark_matter when step has dark_matter reward', async () => {
    const row = makeProgressRow({
      completed_steps: '["enable_ai_agent"]',
      claimed_steps: '[]',
    });
    const db = makeSmartDb({
      progressRow: row,
      planetRow: { id: 'planet-1' },
    });

    const result = await claimReward('player-1', 'enable_ai_agent', db);

    expect(result.claimed).toBe(true);
    expect(result.reward?.dark_matter).toBeGreaterThan(0);
  });
});

// ============================================================================
// skipTutorial
// ============================================================================

describe('skipTutorial', () => {
  test('returns { skipped: true } on success', async () => {
    const db = makeSmartDb({ progressRow: null });

    const result = await skipTutorial('player-1', db);

    expect(result.skipped).toBe(true);
  });

  test('calls db.prepare with INSERT or UPDATE statement', async () => {
    const db = makeSmartDb({ progressRow: null });

    await skipTutorial('player-1', db);

    expect(db.prepare).toHaveBeenCalled();
  });
});

// ============================================================================
// getNextStep
// ============================================================================

describe('getNextStep', () => {
  test('returns the first step for a new player', async () => {
    const db = makeSmartDb({ progressRow: null });

    const step = await getNextStep('new-player', db);

    expect(step).not.toBeNull();
    expect(step?.id).toBe('build_metal_mine');
  });

  test('returns null when tutorial is skipped', async () => {
    const db = makeSmartDb({
      progressRow: makeProgressRow({ skipped: 1, current_step_id: null }),
    });

    const step = await getNextStep('player-1', db);

    expect(step).toBeNull();
  });

  test('returns null when all steps are completed', async () => {
    const allIds = TUTORIAL_STEPS.map((s) => s.id);
    const db = makeSmartDb({
      progressRow: makeProgressRow({
        completed_steps: JSON.stringify(allIds),
        current_step_id: null,
      }),
    });

    const step = await getNextStep('player-1', db);

    expect(step).toBeNull();
  });

  test('returns correct next step when some are completed', async () => {
    const db = makeSmartDb({
      progressRow: makeProgressRow({
        completed_steps: '["build_metal_mine", "upgrade_metal_mine"]',
        current_step_id: 'build_solar',
      }),
    });

    const step = await getNextStep('player-1', db);

    expect(step?.id).toBe('build_solar');
  });
});

// ============================================================================
// TutorialService class
// ============================================================================

describe('TutorialService class', () => {
  test('tutorialService singleton is an instance of TutorialService', () => {
    expect(tutorialService).toBeInstanceOf(TutorialService);
  });

  test('getAllSteps returns all 11 steps', () => {
    const steps = tutorialService.getAllSteps();
    expect(steps.length).toBe(11);
  });

  test('getStep returns correct step by ID', () => {
    const step = tutorialService.getStep('first_ship');
    expect(step).toBeDefined();
    expect(step?.id).toBe('first_ship');
    expect(step?.requirement.type).toBe('build_ship');
  });

  test('getStep returns undefined for unknown ID', () => {
    const step = tutorialService.getStep('does_not_exist');
    expect(step).toBeUndefined();
  });

  test('getCompletionPercent delegates correctly', () => {
    expect(tutorialService.getCompletionPercent([])).toBe(0);
    const allIds = TUTORIAL_STEPS.map((s) => s.id);
    expect(tutorialService.getCompletionPercent(allIds)).toBe(100);
  });
});

// ============================================================================
// Integration-style: full tutorial flow
// ============================================================================

describe('Full tutorial flow simulation', () => {
  test('completing all steps in order yields 100% completion', () => {
    const allIds = TUTORIAL_STEPS.map((s) => s.id);
    const pct = getTutorialCompletionPercent(allIds);
    expect(pct).toBe(100);
  });

  test('each step in TUTORIAL_STEPS has a unique reward combination or positive total', () => {
    for (const step of TUTORIAL_STEPS) {
      const total =
        step.reward.metal +
        step.reward.crystal +
        step.reward.deuterium +
        step.reward.dark_matter;
      expect(total).toBeGreaterThan(0);
    }
  });

  test('step order is consistent between TUTORIAL_STEPS and TUTORIAL_STEP_MAP', () => {
    for (const step of TUTORIAL_STEPS) {
      const fromMap = TUTORIAL_STEP_MAP[step.id];
      expect(fromMap.order).toBe(step.order);
      expect(fromMap.title).toBe(step.title);
    }
  });
});
