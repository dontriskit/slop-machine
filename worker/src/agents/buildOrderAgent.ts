import type { PlanetState, StrategyStep, AgentDecision } from '../game';
import { BUILDING_NAME, BUILDING_ID } from '../game/types';
import { BUILDING_FACTORS, BUILDING_COSTS } from '../game/formulas';

interface CloudflareEnv {
  AI: Ai;
  KV?: KVNamespace;
  R2?: R2Bucket;
}

/**
 * Single-loop build order agent powered by GLM-4.7-Flash
 *
 * Given a planet state and strategy (build order), the agent:
 * 1. Reads current planet state (resources, buildings, queue)
 * 2. Prompts GLM-4.7-Flash with structured context
 * 3. Gets back a single decision: build [buildingId] or wait
 * 4. Returns decision (caller executes the build)
 *
 * This is NOT multi-turn; it's a single inference loop per planet per cron tick.
 */
export async function runBuildOrderAgent(
  state: PlanetState,
  strategy: StrategyStep[],
  env: CloudflareEnv
): Promise<AgentDecision | null> {
  try {
    // Build prompt for GLM-4.7-Flash
    const prompt = buildAgentPrompt(state, strategy);

    // Call Workers AI with GLM-4.7-Flash model
    // Model ID: @cf/thudm/glm-4-0520 (GLM-4.7-Flash)
    const response = await env.AI.run('@cf/thudm/glm-4-0520', {
      messages: [
        {
          role: 'system',
          content: `You are an OGame build order agent. Analyze the planet state and strategy, then decide the next build action.
Respond ONLY with a JSON object (no markdown, no explanation):
{"action":"build"|"wait","buildingId":<number>|null,"reason":"<string>"}`,
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    // Parse response
    const responseText = String(response.response || response.text || '');

    // Extract JSON from response (handle markdown code blocks)
    let jsonStr = responseText;
    if (jsonStr.includes('```json')) {
      jsonStr = jsonStr.split('```json')[1]?.split('```')[0] || jsonStr;
    } else if (jsonStr.includes('```')) {
      jsonStr = jsonStr.split('```')[1]?.split('```')[0] || jsonStr;
    }

    const decision = JSON.parse(jsonStr.trim()) as AgentDecision;

    // Validate decision
    if (!decision.action || !decision.reason) {
      return {
        action: 'wait',
        reason: 'Agent response validation failed',
      };
    }

    return decision;
  } catch (error) {
    console.error('Build order agent error:', error);
    return {
      action: 'wait',
      reason: `Agent error: ${error}`,
    };
  }
}

/**
 * Build the prompt for GLM-4.7-Flash
 */
function buildAgentPrompt(state: PlanetState, strategy: StrategyStep[]): string {
  // Current strategy progress
  const nextSteps = strategy.slice(0, 5); // Show next 5 steps

  // Format buildings status
  const buildingsStatus = Object.entries(state.buildings)
    .map(([key, level]) => {
      const buildingId = BUILDING_ID[key as keyof typeof BUILDING_ID];
      const name = BUILDING_NAME[buildingId] || key;
      return `  ${name}: Level ${level}`;
    })
    .join('\n');

  // Resource status
  const resourcesStatus = `  Metal: ${state.resources.metal}
  Crystal: ${state.resources.crystal}
  Deuterium: ${state.resources.deuterium}`;

  // Queue status
  const queueStatus =
    state.queue.length === 0
      ? 'Queue is empty'
      : `Queue has ${state.queue.length} items, head completes in ${Math.ceil(
          (state.queue[0]!.timeEnd - Date.now()) / 1000
        )}s`;

  // Strategy steps
  const strategyText =
    nextSteps.length === 0
      ? 'No more strategy steps'
      : nextSteps
          .map((step) => {
            const name = BUILDING_NAME[step.buildingId] || `Building ${step.buildingId}`;
            const currentLevel = state.buildings[
              Object.keys(state.buildings).find(
                (k) =>
                  BUILDING_ID[k as keyof typeof BUILDING_ID] ===
                  step.buildingId
              ) as keyof typeof state.buildings
            ] || 0;
            return `  ${name}: Level ${currentLevel} → ${step.targetLevel}`;
          })
          .join('\n');

  // Analyze which buildings are currently buildable
  const buildableInfo = generateBuildableInfo(state);

  return `Planet: ${state.planetId}
Temperature: ${state.temperature}°C
Universe Speed: ${state.universeSpeed}x

=== Current Resources ===
${resourcesStatus}

=== Buildings ===
${buildingsStatus}

=== Build Queue ===
${queueStatus}

=== Strategy (Next Steps) ===
${strategyText}

=== Buildable Buildings ===
${buildableInfo}

=== Decision Required ===
The queue is ${state.queue.length === 0 ? 'empty' : `full with ${state.queue.length} items`}.
Choose the NEXT building to add to the queue, or wait if not enough resources.

Prefer buildings that advance the strategy. Always check resource availability.
If queue is full, wait. If no strategy steps, focus on production buildings (mines, plants).`;
}

/**
 * Generate buildable info for the prompt
 * Shows which buildings can be built right now with current resources
 */
function generateBuildableInfo(state: PlanetState): string {
  const buildable: string[] = [];

  Object.entries(state.buildings).forEach(([key, level]) => {
    const buildingId = BUILDING_ID[key as keyof typeof BUILDING_ID];
    const name = BUILDING_NAME[buildingId] || key;

    // Skip if queue is full (max 3 free or 10 pro, for now assume 3)
    if (state.queue.length >= 3) {
      return;
    }

    // Get base cost from BUILDING_COSTS
    const buildingKey = Object.keys(BUILDING_ID).find(
      (k) => BUILDING_ID[k as keyof typeof BUILDING_ID] === buildingId
    ) as keyof typeof BUILDING_ID;

    if (!buildingKey) return;

    const baseCost = BUILDING_COSTS[buildingKey];
    if (!baseCost) return;

    const factor = BUILDING_FACTORS[buildingKey] || 1.5;
    const nextLevel = level + 1;

    const costMetal = Math.floor(baseCost.metal * Math.pow(factor, nextLevel - 1));
    const costCrystal = Math.floor(baseCost.crystal * Math.pow(factor, nextLevel - 1));
    const costDeuterium = Math.floor(baseCost.deuterium * Math.pow(factor, nextLevel - 1));

    // Check if affordable
    const canBuild =
      state.resources.metal >= costMetal &&
      state.resources.crystal >= costCrystal &&
      state.resources.deuterium >= costDeuterium;

    const status = canBuild ? '✓ BUILDABLE' : '✗ Not enough resources';
    const costStr =
      costDeuterium === 0
        ? `${costMetal}m/${costCrystal}c`
        : `${costMetal}m/${costCrystal}c/${costDeuterium}d`;

    buildable.push(`  ${name} (L${level}→${nextLevel}): ${costStr} ${status}`);
  });

  return buildable.length > 0 ? buildable.join('\n') : '  No buildings currently buildable';
}

// ============================================================================
// BATCH AGENT EXECUTION (for Cron)
// ============================================================================

export interface RunAgentAllPlanetsResult {
  total: number;
  succeeded: number;
  failed: number;
}

/**
 * Run build order agent for all planets in parallel
 * Called from Cron trigger every minute
 */
export async function runAgentForAllPlanets(
  planetStates: PlanetState[],
  strategies: Map<string, any>,
  planetDOs: Map<string, any>,
  ai: Ai,
  db: D1Database
): Promise<RunAgentAllPlanetsResult> {
  const results = await Promise.allSettled(
    planetStates.map((state) =>
      runSingleAgentWithExecution(state, strategies.get(state.planetId), planetDOs.get(state.planetId), ai, db)
    )
  );

  const succeeded = results.filter((r) => r.status === 'fulfilled' && r.value).length;
  const failed = results.filter((r) => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value)).length;

  return {
    total: planetStates.length,
    succeeded,
    failed,
  };
}

/**
 * Run agent for a single planet and execute the decision
 */
async function runSingleAgentWithExecution(
  state: PlanetState,
  strategy: any,
  planetDO: any,
  ai: Ai,
  db: D1Database
): Promise<boolean> {
  try {
    const decision = await runBuildOrderAgent(state, strategy?.steps || [], { AI: ai });

    if (!decision || decision.action !== 'build' || !decision.buildingId) {
      return false;
    }

    // Execute the build
    const response = await planetDO.fetch(
      new Request('https://planet/queue/add', {
        method: 'POST',
        body: JSON.stringify({
          buildingId: decision.buildingId,
          targetLevel: (state.buildings[
            Object.keys(state.buildings).find(
              (k) => BUILDING_ID[k as keyof typeof BUILDING_ID] === decision.buildingId
            ) as keyof typeof state.buildings
          ] || 0) + 1,
        }),
      })
    );

    if (!response.ok) {
      return false;
    }

    // Log the decision
    await db.prepare(
      `INSERT INTO build_history (id, planet_id, building_id, level, source, ai_reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        `${state.planetId}-${Date.now()}`,
        state.planetId,
        decision.buildingId,
        (state.buildings[
          Object.keys(state.buildings).find(
            (k) => BUILDING_ID[k as keyof typeof BUILDING_ID] === decision.buildingId
          ) as keyof typeof state.buildings
        ] || 0) + 1,
        'agent',
        decision.reason,
        Math.floor(Date.now() / 1000)
      )
      .run();

    return true;
  } catch (error) {
    console.error(`Agent execution error for planet ${state.planetId}:`, error);
    return false;
  }
}

// Legacy export for compatibility
export type { AgentDecision };
