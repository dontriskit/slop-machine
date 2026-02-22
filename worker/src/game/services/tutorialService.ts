/**
 * Tutorial Service
 *
 * Guides new players through their first 30 minutes in Cosmic Protocol.
 * Implements step-by-step onboarding with rewards and progress tracking.
 *
 * Tutorial flow (per GAMEPLAY.md 30-min game plan):
 *   1. build_metal_mine      — Build your first Metal Mine
 *   2. upgrade_metal_mine    — Upgrade Metal Mine to level 2
 *   3. build_solar           — Build a Solar Plant for energy
 *   4. build_crystal         — Build a Crystal Mine
 *   5. enable_ai_agent       — Enable the AI build agent
 *   6. build_research_lab    — Build a Research Lab
 *   7. first_research        — Complete first research (Espionage Tech or Computer Tech)
 *   8. build_shipyard        — Build a Shipyard
 *   9. first_ship            — Build your first ship (Espionage Probe)
 *  10. open_galaxy_map       — Open the Galaxy Map
 *  11. first_espionage       — Send your first espionage probe
 */

// ============================================================================
// TYPES
// ============================================================================

export interface TutorialReward {
  metal: number;
  crystal: number;
  deuterium: number;
  dark_matter: number;
}

export interface TutorialStep {
  id: string;
  order: number;
  title: string;
  description: string;
  hint: string;
  requirement: TutorialRequirement;
  reward: TutorialReward;
}

export interface TutorialRequirement {
  type:
    | 'build_building'
    | 'upgrade_building'
    | 'enable_agent'
    | 'complete_research'
    | 'build_ship'
    | 'open_galaxy_map'
    | 'send_espionage';
  buildingId?: string;
  minLevel?: number;
  shipType?: string;
  count?: number;
}

export interface TutorialProgress {
  playerId: string;
  completedSteps: string[];       // step IDs that are done
  claimedSteps: string[];         // step IDs whose rewards have been claimed
  currentStepId: string | null;   // next step to complete (null = tutorial done/skipped)
  skipped: boolean;
  startedAt: number;              // unix seconds
  completedAt: number | null;     // unix seconds, null if not finished
}

export interface TutorialStepResult {
  stepId: string;
  completed: boolean;
  reward: TutorialReward | null;
  nextStepId: string | null;
  tutorialComplete: boolean;
  error?: string;
}

// Row shapes from D1
interface TutorialProgressRow {
  player_id: string;
  completed_steps: string;  // JSON array of step IDs
  claimed_steps: string;    // JSON array of step IDs
  current_step_id: string | null;
  skipped: number;          // 0 or 1 (SQLite boolean)
  started_at: number;
  completed_at: number | null;
}

// ============================================================================
// TUTORIAL STEP DEFINITIONS
// ============================================================================

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'build_metal_mine',
    order: 1,
    title: 'Build Your First Metal Mine',
    description: 'Metal is your primary resource. Build a Metal Mine to start production.',
    hint: 'Go to your planet view and click on an empty building slot to construct a Metal Mine.',
    requirement: { type: 'build_building', buildingId: 'metal_mine', minLevel: 1 },
    reward: { metal: 500, crystal: 200, deuterium: 0, dark_matter: 0 },
  },
  {
    id: 'upgrade_metal_mine',
    order: 2,
    title: 'Upgrade Your Metal Mine',
    description: 'Higher level mines produce more resources per hour. Upgrade to level 2.',
    hint: 'Click on your Metal Mine and select "Upgrade" to increase its level.',
    requirement: { type: 'upgrade_building', buildingId: 'metal_mine', minLevel: 2 },
    reward: { metal: 800, crystal: 300, deuterium: 0, dark_matter: 0 },
  },
  {
    id: 'build_solar',
    order: 3,
    title: 'Build a Solar Plant',
    description: 'Buildings consume energy. Build a Solar Plant to power your mines.',
    hint: 'Without enough energy, your production rate will be reduced. Solar Plants provide free, clean energy.',
    requirement: { type: 'build_building', buildingId: 'solar_plant', minLevel: 1 },
    reward: { metal: 600, crystal: 400, deuterium: 0, dark_matter: 0 },
  },
  {
    id: 'build_crystal',
    order: 4,
    title: 'Build a Crystal Mine',
    description: 'Crystal is needed for research, ships, and advanced buildings.',
    hint: 'Crystal Mine works just like Metal Mine but produces crystal — essential for advanced tech.',
    requirement: { type: 'build_building', buildingId: 'crystal_mine', minLevel: 1 },
    reward: { metal: 400, crystal: 600, deuterium: 0, dark_matter: 0 },
  },
  {
    id: 'enable_ai_agent',
    order: 5,
    title: 'Enable the AI Build Agent',
    description: 'Let the AI agent manage your build queue automatically. It learns optimal strategies.',
    hint: 'Enable the AI Agent from your planet panel. The agent will suggest and queue buildings based on your strategy.',
    requirement: { type: 'enable_agent' },
    reward: { metal: 0, crystal: 0, deuterium: 0, dark_matter: 50 },
  },
  {
    id: 'build_research_lab',
    order: 6,
    title: 'Build a Research Lab',
    description: 'Research unlocks new technologies, ships, and capabilities.',
    hint: 'The Research Lab is required before you can start any research project.',
    requirement: { type: 'build_building', buildingId: 'research_lab', minLevel: 1 },
    reward: { metal: 500, crystal: 500, deuterium: 100, dark_matter: 0 },
  },
  {
    id: 'first_research',
    order: 7,
    title: 'Complete Your First Research',
    description: 'Start researching Espionage Technology to begin gathering intelligence on enemies.',
    hint: 'Open your Research Lab and choose Espionage Technology or Computer Technology to research.',
    requirement: { type: 'complete_research', count: 1 },
    reward: { metal: 300, crystal: 300, deuterium: 200, dark_matter: 0 },
  },
  {
    id: 'build_shipyard',
    order: 8,
    title: 'Build a Shipyard',
    description: 'The Shipyard lets you construct your fleet — the backbone of your empire.',
    hint: 'You will need at least Shipyard level 1 to build any ships.',
    requirement: { type: 'build_building', buildingId: 'shipyard', minLevel: 1 },
    reward: { metal: 800, crystal: 400, deuterium: 200, dark_matter: 0 },
  },
  {
    id: 'first_ship',
    order: 9,
    title: 'Build Your First Ship',
    description: 'Build an Espionage Probe to scout enemy planets without risking combat.',
    hint: 'Open your Shipyard and queue an Espionage Probe. They are fast, cheap, and essential for intelligence.',
    requirement: { type: 'build_ship', count: 1 },
    reward: { metal: 500, crystal: 500, deuterium: 500, dark_matter: 0 },
  },
  {
    id: 'open_galaxy_map',
    order: 10,
    title: 'Open the Galaxy Map',
    description: 'Explore the galaxy to find other players, resources, and targets.',
    hint: 'Press G or click the Galaxy Map button to view the universe. You can see all planets in each system.',
    requirement: { type: 'open_galaxy_map' },
    reward: { metal: 200, crystal: 200, deuterium: 200, dark_matter: 25 },
  },
  {
    id: 'first_espionage',
    order: 11,
    title: 'Send Your First Espionage Probe',
    description: 'Spy on a nearby planet to gather intelligence before planning an attack or trade.',
    hint: 'From the Galaxy Map, click on a planet and select "Spy" to send your espionage probe.',
    requirement: { type: 'send_espionage', count: 1 },
    reward: { metal: 1000, crystal: 500, deuterium: 500, dark_matter: 100 },
  },
];

// ============================================================================
// STEP MAP (O(1) lookup by ID)
// ============================================================================

export const TUTORIAL_STEP_MAP: Record<string, TutorialStep> = Object.fromEntries(
  TUTORIAL_STEPS.map((s) => [s.id, s])
);

// Ordered step IDs for sequential lookup
const STEP_ORDER: string[] = TUTORIAL_STEPS.sort((a, b) => a.order - b.order).map((s) => s.id);

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Parse a D1 row into a TutorialProgress object.
 */
function rowToProgress(row: TutorialProgressRow): TutorialProgress {
  return {
    playerId: row.player_id,
    completedSteps: JSON.parse(row.completed_steps || '[]'),
    claimedSteps: JSON.parse(row.claimed_steps || '[]'),
    currentStepId: row.current_step_id,
    skipped: row.skipped === 1,
    startedAt: row.started_at,
    completedAt: row.completed_at ?? null,
  };
}

/**
 * Determine the next uncompleted step ID given a list of completed step IDs.
 * Returns null if all steps are done.
 */
function findNextStep(completedSteps: string[]): string | null {
  const completedSet = new Set(completedSteps);
  for (const stepId of STEP_ORDER) {
    if (!completedSet.has(stepId)) {
      return stepId;
    }
  }
  return null; // all done
}

/**
 * Create a default progress row for a new player.
 */
function makeDefaultProgress(playerId: string): TutorialProgress {
  return {
    playerId,
    completedSteps: [],
    claimedSteps: [],
    currentStepId: STEP_ORDER[0] ?? null,
    skipped: false,
    startedAt: Math.floor(Date.now() / 1000),
    completedAt: null,
  };
}

// ============================================================================
// PUBLIC API — Pure / testable functions
// ============================================================================

/**
 * Get the full tutorial progress for a player.
 * If no record exists yet, creates an initial record in D1 and returns defaults.
 *
 * @param playerId - Player to query
 * @param db       - D1 database binding
 */
export async function getTutorialProgress(
  playerId: string,
  db: D1Database
): Promise<TutorialProgress> {
  const row = await db
    .prepare('SELECT * FROM tutorial_progress WHERE player_id = ?')
    .bind(playerId)
    .first() as TutorialProgressRow | null;

  if (row) {
    return rowToProgress(row);
  }

  // First access — create an initial record
  const defaults = makeDefaultProgress(playerId);
  await db
    .prepare(
      `INSERT OR IGNORE INTO tutorial_progress
         (player_id, completed_steps, claimed_steps, current_step_id, skipped, started_at, completed_at)
       VALUES (?, ?, ?, ?, 0, ?, NULL)`
    )
    .bind(
      playerId,
      JSON.stringify(defaults.completedSteps),
      JSON.stringify(defaults.claimedSteps),
      defaults.currentStepId,
      defaults.startedAt
    )
    .run();

  return defaults;
}

/**
 * Mark a tutorial step as completed for a player.
 * Also advances the current_step_id pointer.
 * Does NOT auto-distribute the reward — call claimReward separately.
 *
 * @param playerId - Player completing the step
 * @param stepId   - ID of the step being completed
 * @param db       - D1 database binding
 */
export async function completeTutorialStep(
  playerId: string,
  stepId: string,
  db: D1Database
): Promise<TutorialStepResult> {
  const step = TUTORIAL_STEP_MAP[stepId];
  if (!step) {
    return { stepId, completed: false, reward: null, nextStepId: null, tutorialComplete: false, error: `Unknown step: ${stepId}` };
  }

  const progress = await getTutorialProgress(playerId, db);

  if (progress.skipped) {
    return { stepId, completed: false, reward: null, nextStepId: null, tutorialComplete: false, error: 'Tutorial has been skipped' };
  }

  if (progress.completedSteps.includes(stepId)) {
    // Already done — idempotent, return current state
    const nextStepId = findNextStep(progress.completedSteps);
    return {
      stepId,
      completed: true,
      reward: null,
      nextStepId,
      tutorialComplete: nextStepId === null,
    };
  }

  const updatedCompleted = [...progress.completedSteps, stepId];
  const nextStepId = findNextStep(updatedCompleted);
  const now = Math.floor(Date.now() / 1000);
  const tutorialComplete = nextStepId === null;
  const completedAt = tutorialComplete ? now : null;

  await db
    .prepare(
      `UPDATE tutorial_progress
       SET completed_steps = ?, current_step_id = ?, completed_at = ?
       WHERE player_id = ?`
    )
    .bind(
      JSON.stringify(updatedCompleted),
      nextStepId,
      completedAt,
      playerId
    )
    .run();

  // Log to tutorial_step_log
  await db
    .prepare(
      `INSERT OR IGNORE INTO tutorial_step_log (player_id, step_id, completed_at)
       VALUES (?, ?, ?)`
    )
    .bind(playerId, stepId, now)
    .run();

  return {
    stepId,
    completed: true,
    reward: step.reward,
    nextStepId,
    tutorialComplete,
  };
}

/**
 * Claim the reward for a completed tutorial step.
 * Transfers resources to the player's planet (first planet found for this player).
 * Idempotent — claiming the same step twice is a no-op.
 *
 * @param playerId - Player claiming the reward
 * @param stepId   - Step whose reward to claim
 * @param db       - D1 database binding
 */
export async function claimReward(
  playerId: string,
  stepId: string,
  db: D1Database
): Promise<{ claimed: boolean; reward: TutorialReward | null; error?: string }> {
  const step = TUTORIAL_STEP_MAP[stepId];
  if (!step) {
    return { claimed: false, reward: null, error: `Unknown step: ${stepId}` };
  }

  const progress = await getTutorialProgress(playerId, db);

  if (!progress.completedSteps.includes(stepId)) {
    return { claimed: false, reward: null, error: 'Step not yet completed' };
  }

  if (progress.claimedSteps.includes(stepId)) {
    return { claimed: false, reward: step.reward, error: 'Reward already claimed' };
  }

  // Credit resources to the player's home planet
  const planetRow = await db
    .prepare('SELECT id FROM planets WHERE player_id = ? ORDER BY created_at ASC LIMIT 1')
    .bind(playerId)
    .first() as { id: string } | null;

  if (planetRow) {
    await db
      .prepare(
        `UPDATE planets
         SET metal    = metal    + ?,
             crystal  = crystal  + ?,
             deuterium = deuterium + ?
         WHERE id = ?`
      )
      .bind(step.reward.metal, step.reward.crystal, step.reward.deuterium, planetRow.id)
      .run();
  }

  // Credit dark_matter to the player row if any
  if (step.reward.dark_matter > 0) {
    await db
      .prepare('UPDATE players SET dark_matter = dark_matter + ? WHERE id = ?')
      .bind(step.reward.dark_matter, playerId)
      .run();
  }

  // Mark reward as claimed
  const updatedClaimed = [...progress.claimedSteps, stepId];
  await db
    .prepare('UPDATE tutorial_progress SET claimed_steps = ? WHERE player_id = ?')
    .bind(JSON.stringify(updatedClaimed), playerId)
    .run();

  return { claimed: true, reward: step.reward };
}

/**
 * Skip the tutorial entirely.
 * Sets skipped = true and clears current_step_id.
 *
 * @param playerId - Player skipping the tutorial
 * @param db       - D1 database binding
 */
export async function skipTutorial(
  playerId: string,
  db: D1Database
): Promise<{ skipped: boolean }> {
  await db
    .prepare(
      `INSERT INTO tutorial_progress
         (player_id, completed_steps, claimed_steps, current_step_id, skipped, started_at, completed_at)
       VALUES (?, '[]', '[]', NULL, 1, ?, NULL)
       ON CONFLICT(player_id) DO UPDATE SET skipped = 1, current_step_id = NULL`
    )
    .bind(playerId, Math.floor(Date.now() / 1000))
    .run();

  return { skipped: true };
}

/**
 * Get the next step a player should complete.
 * Returns null if the tutorial is complete or skipped.
 *
 * @param playerId - Player to query
 * @param db       - D1 database binding
 */
export async function getNextStep(
  playerId: string,
  db: D1Database
): Promise<TutorialStep | null> {
  const progress = await getTutorialProgress(playerId, db);

  if (progress.skipped || progress.currentStepId === null) {
    return null;
  }

  return TUTORIAL_STEP_MAP[progress.currentStepId] ?? null;
}

// ============================================================================
// PURE HELPER — exported for tests (no D1 dependency)
// ============================================================================

/**
 * Calculate what percentage of the tutorial is complete.
 */
export function getTutorialCompletionPercent(completedSteps: string[]): number {
  if (TUTORIAL_STEPS.length === 0) return 100;
  return Math.round((completedSteps.length / TUTORIAL_STEPS.length) * 100);
}

/**
 * Check if a given step ID is valid.
 */
export function isValidStepId(stepId: string): boolean {
  return stepId in TUTORIAL_STEP_MAP;
}

// ============================================================================
// CLASS WRAPPER
// ============================================================================

export class TutorialService {
  /** Return all tutorial steps in order */
  getAllSteps(): TutorialStep[] {
    return TUTORIAL_STEPS;
  }

  /** Return a single step definition */
  getStep(stepId: string): TutorialStep | undefined {
    return TUTORIAL_STEP_MAP[stepId];
  }

  /** Get or initialize tutorial progress for a player */
  async getTutorialProgress(playerId: string, db: D1Database): Promise<TutorialProgress> {
    return getTutorialProgress(playerId, db);
  }

  /** Mark a step as completed */
  async completeTutorialStep(
    playerId: string,
    stepId: string,
    db: D1Database
  ): Promise<TutorialStepResult> {
    return completeTutorialStep(playerId, stepId, db);
  }

  /** Claim the resource reward for a completed step */
  async claimReward(
    playerId: string,
    stepId: string,
    db: D1Database
  ): Promise<{ claimed: boolean; reward: TutorialReward | null; error?: string }> {
    return claimReward(playerId, stepId, db);
  }

  /** Skip the tutorial */
  async skipTutorial(playerId: string, db: D1Database): Promise<{ skipped: boolean }> {
    return skipTutorial(playerId, db);
  }

  /** Get the next uncompleted step */
  async getNextStep(playerId: string, db: D1Database): Promise<TutorialStep | null> {
    return getNextStep(playerId, db);
  }

  /** Calculate tutorial completion percentage (0–100) */
  getCompletionPercent(completedSteps: string[]): number {
    return getTutorialCompletionPercent(completedSteps);
  }
}

/** Singleton instance */
export const tutorialService = new TutorialService();
