/**
 * H2M (Human-to-Machine) Protocol
 *
 * The core differentiator of Cosmic Protocol. Every build decision is logged
 * with its source ('agent' or 'manual'). When a human overrides an AI agent
 * decision, that creates training data for improving the AI.
 *
 * Pipeline:
 * 1. Override Detection — find manual builds that follow agent builds
 * 2. Classification — categorize why the human overrode the agent
 * 3. Pattern Analysis — aggregate overrides into player strategy profiles
 * 4. Strategy Learning — generate improved build orders from patterns
 * 5. Metrics & Reporting — track AI improvement over time
 */

import {
  Override,
  OverrideClassification,
  PlayerStrategyProfile,
  H2MMetrics,
  H2MReport,
  StrategyStep,
  BUILDING_ID,
  BUILDING_NAME,
} from '../game/types';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Maximum time window (seconds) between agent and manual build to count as override */
export const OVERRIDE_WINDOW_SECONDS = 600; // 10 minutes

/** Building IDs grouped by category for classification */
export const DEFENSE_BUILDINGS: number[] = []; // defenses are separate, but shipyard counts
export const PRODUCTION_BUILDINGS = [
  BUILDING_ID.metalMine,
  BUILDING_ID.crystalMine,
  BUILDING_ID.deutSynth,
  BUILDING_ID.solarPlant,
  BUILDING_ID.fusionReactor,
];
export const STORAGE_BUILDINGS = [
  BUILDING_ID.metalStorage,
  BUILDING_ID.crystalStorage,
  BUILDING_ID.deutTank,
];
export const TECH_BUILDINGS = [
  BUILDING_ID.researchLab,
];
export const FLEET_BUILDINGS = [
  BUILDING_ID.shipyard,
];
export const INFRASTRUCTURE_BUILDINGS = [
  BUILDING_ID.roboticsFactory,
  BUILDING_ID.naniteFactory,
];

// ============================================================================
// OVERRIDE DETECTION
// ============================================================================

interface BuildHistoryRow {
  id: string;
  planet_id: string;
  building_id: number;
  level: number;
  source: string;
  ai_reason: string | null;
  created_at: number;
}

/**
 * Detect manual builds that happened shortly after agent builds on a planet.
 * A manual build within OVERRIDE_WINDOW_SECONDS of an agent build means the
 * human rejected the AI's decision and chose something different.
 */
export async function detectOverrides(
  db: D1Database,
  planetId: string,
  sinceTimestamp: number
): Promise<Override[]> {
  // Get all builds for this planet since the given timestamp, ordered by time
  const result = await db
    .prepare(
      `SELECT id, planet_id, building_id, level, source, ai_reason, created_at
       FROM build_history
       WHERE planet_id = ? AND created_at >= ?
       ORDER BY created_at ASC`
    )
    .bind(planetId, sinceTimestamp)
    .all();

  const builds = (result.results || []) as unknown as BuildHistoryRow[];

  // Get the player_id for this planet
  const planetRow = await db
    .prepare('SELECT player_id FROM planets WHERE id = ?')
    .bind(planetId)
    .first();
  const playerId = (planetRow?.player_id as string) || 'unknown';

  const overrides: Override[] = [];

  // For each agent build, check if a manual build follows within the window
  for (let i = 0; i < builds.length; i++) {
    const agentBuild = builds[i]!;
    if (agentBuild.source !== 'agent') continue;

    // Look ahead for the next manual build within the time window
    for (let j = i + 1; j < builds.length; j++) {
      const manualBuild = builds[j]!;

      const timeDelta = manualBuild.created_at - agentBuild.created_at;

      // If beyond the window, stop looking
      if (timeDelta > OVERRIDE_WINDOW_SECONDS) break;

      // If another agent build comes first, this agent build was not overridden
      if (manualBuild.source === 'agent') break;

      // Found a manual build within the window — this is an override
      if (manualBuild.source === 'manual') {
        const classification = classifyOverride(
          {
            agentBuildingId: agentBuild.building_id,
            manualBuildingId: manualBuild.building_id,
          },
          null // planetState not needed for basic classification
        );

        overrides.push({
          id: `ovr-${agentBuild.id}-${manualBuild.id}`,
          planetId,
          playerId,
          agentBuildId: agentBuild.id,
          agentBuildingId: agentBuild.building_id,
          agentLevel: agentBuild.level,
          agentReason: agentBuild.ai_reason,
          manualBuildId: manualBuild.id,
          manualBuildingId: manualBuild.building_id,
          manualLevel: manualBuild.level,
          timeDelta,
          classification,
          detectedAt: Math.floor(Date.now() / 1000),
        });

        break; // Only count the first manual build as the override
      }
    }
  }

  return overrides;
}

/**
 * Classify why a human overrode an agent decision.
 * Uses heuristics based on building categories.
 */
export function classifyOverride(
  override: { agentBuildingId: number; manualBuildingId: number },
  _planetState: unknown
): OverrideClassification {
  const { agentBuildingId, manualBuildingId } = override;

  // Same building = correction (different level or timing preference)
  if (agentBuildingId === manualBuildingId) {
    return 'correction';
  }

  // Agent suggested production, human chose shipyard = fleet focus
  if (
    PRODUCTION_BUILDINGS.includes(agentBuildingId) &&
    FLEET_BUILDINGS.includes(manualBuildingId)
  ) {
    return 'fleet_focus';
  }

  // Agent suggested anything, human chose research lab = tech rush
  if (TECH_BUILDINGS.includes(manualBuildingId)) {
    return 'tech_rush';
  }

  // Agent suggested anything, human chose shipyard = fleet focus
  if (FLEET_BUILDINGS.includes(manualBuildingId)) {
    return 'fleet_focus';
  }

  // Agent suggested production, human chose different production = resource priority
  if (
    PRODUCTION_BUILDINGS.includes(agentBuildingId) &&
    PRODUCTION_BUILDINGS.includes(manualBuildingId)
  ) {
    return 'resource_priority';
  }

  // Agent suggested anything, human chose storage = resource priority
  if (STORAGE_BUILDINGS.includes(manualBuildingId)) {
    return 'resource_priority';
  }

  // Agent suggested tech/fleet/infra, human chose production = resource priority
  if (
    !PRODUCTION_BUILDINGS.includes(agentBuildingId) &&
    PRODUCTION_BUILDINGS.includes(manualBuildingId)
  ) {
    return 'resource_priority';
  }

  // Agent suggested production/storage, human chose infrastructure = strategy shift
  if (
    (PRODUCTION_BUILDINGS.includes(agentBuildingId) || STORAGE_BUILDINGS.includes(agentBuildingId)) &&
    INFRASTRUCTURE_BUILDINGS.includes(manualBuildingId)
  ) {
    return 'strategy_shift';
  }

  // Default: strategy shift (human changed strategic direction)
  return 'strategy_shift';
}

// ============================================================================
// PATTERN ANALYSIS
// ============================================================================

/**
 * Aggregate all overrides into a player strategy profile.
 */
export async function analyzePlayerPatterns(
  db: D1Database,
  playerId: string
): Promise<PlayerStrategyProfile> {
  // Get all overrides for this player
  const overridesResult = await db
    .prepare(
      `SELECT classification, manual_building_id, agent_building_id, created_at
       FROM override_analysis
       WHERE player_id = ?
       ORDER BY created_at ASC`
    )
    .bind(playerId)
    .all();

  const overrides = (overridesResult.results || []) as unknown as Array<{
    classification: OverrideClassification;
    manual_building_id: number;
    agent_building_id: number;
    created_at: number;
  }>;

  // Get total decisions
  const totalResult = await db
    .prepare(
      `SELECT COUNT(*) as cnt FROM build_history
       WHERE planet_id IN (SELECT id FROM planets WHERE player_id = ?)`
    )
    .bind(playerId)
    .first();
  const totalDecisions = (totalResult?.cnt as number) || 0;

  // Classification breakdown
  const classificationBreakdown: Record<OverrideClassification, number> = {
    strategy_shift: 0,
    resource_priority: 0,
    defense_emergency: 0,
    tech_rush: 0,
    fleet_focus: 0,
    correction: 0,
  };

  const preferredMap = new Map<number, number>();
  const rejectedMap = new Map<number, number>();

  for (const o of overrides) {
    classificationBreakdown[o.classification] =
      (classificationBreakdown[o.classification] || 0) + 1;
    preferredMap.set(o.manual_building_id, (preferredMap.get(o.manual_building_id) || 0) + 1);
    rejectedMap.set(o.agent_building_id, (rejectedMap.get(o.agent_building_id) || 0) + 1);
  }

  const preferredBuildings = Array.from(preferredMap.entries())
    .map(([buildingId, count]) => ({ buildingId, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const rejectedBuildings = Array.from(rejectedMap.entries())
    .map(([buildingId, count]) => ({ buildingId, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Calculate trend: compare override rate in first half vs second half
  const totalOverrides = overrides.length;
  const overrideRate = totalDecisions > 0 ? totalOverrides / totalDecisions : 0;

  let overrideTrend: 'improving' | 'stable' | 'worsening' = 'stable';
  if (overrides.length >= 4) {
    const mid = Math.floor(overrides.length / 2);
    const firstHalfCount = mid;
    const secondHalfCount = overrides.length - mid;

    // Get total decisions in each half's time range
    const midTimestamp = overrides[mid]!.created_at;
    const firstHalfDecisions = await db
      .prepare(
        `SELECT COUNT(*) as cnt FROM build_history
         WHERE planet_id IN (SELECT id FROM planets WHERE player_id = ?)
         AND created_at < ?`
      )
      .bind(playerId, midTimestamp)
      .first();
    const secondHalfDecisions = await db
      .prepare(
        `SELECT COUNT(*) as cnt FROM build_history
         WHERE planet_id IN (SELECT id FROM planets WHERE player_id = ?)
         AND created_at >= ?`
      )
      .bind(playerId, midTimestamp)
      .first();

    const firstRate =
      ((firstHalfDecisions?.cnt as number) || 1) > 0
        ? firstHalfCount / ((firstHalfDecisions?.cnt as number) || 1)
        : 0;
    const secondRate =
      ((secondHalfDecisions?.cnt as number) || 1) > 0
        ? secondHalfCount / ((secondHalfDecisions?.cnt as number) || 1)
        : 0;

    if (secondRate < firstRate * 0.8) {
      overrideTrend = 'improving';
    } else if (secondRate > firstRate * 1.2) {
      overrideTrend = 'worsening';
    }
  }

  return {
    playerId,
    totalDecisions,
    totalOverrides,
    overrideRate,
    classificationBreakdown,
    preferredBuildings,
    rejectedBuildings,
    overrideTrend,
    updatedAt: Math.floor(Date.now() / 1000),
  };
}

/**
 * Get override rate for a specific planet.
 */
export async function getOverrideRate(
  db: D1Database,
  planetId: string
): Promise<number> {
  const agentResult = await db
    .prepare(
      `SELECT COUNT(*) as cnt FROM build_history
       WHERE planet_id = ? AND source = 'agent'`
    )
    .bind(planetId)
    .first();

  const overrideResult = await db
    .prepare(
      `SELECT COUNT(*) as cnt FROM override_analysis
       WHERE planet_id = ?`
    )
    .bind(planetId)
    .first();

  const agentCount = (agentResult?.cnt as number) || 0;
  const overrideCount = (overrideResult?.cnt as number) || 0;

  return agentCount > 0 ? overrideCount / agentCount : 0;
}

/**
 * Get most common override types for a player.
 */
export async function getTopOverrideReasons(
  db: D1Database,
  playerId: string,
  limit: number = 5
): Promise<Array<{ classification: OverrideClassification; count: number }>> {
  const result = await db
    .prepare(
      `SELECT classification, COUNT(*) as cnt
       FROM override_analysis
       WHERE player_id = ?
       GROUP BY classification
       ORDER BY cnt DESC
       LIMIT ?`
    )
    .bind(playerId, limit)
    .all();

  return ((result.results || []) as unknown as Array<{ classification: OverrideClassification; cnt: number }>).map(
    (r) => ({
      classification: r.classification,
      count: r.cnt,
    })
  );
}

// ============================================================================
// STRATEGY LEARNING
// ============================================================================

/**
 * Generate an improved build strategy based on override patterns.
 * Analyzes what the player prefers and creates a new strategy that
 * better matches their play style.
 */
export async function generateImprovedStrategy(
  db: D1Database,
  playerId: string
): Promise<StrategyStep[]> {
  const profile = await analyzePlayerPatterns(db, playerId);

  // Start with a balanced base strategy
  const baseStrategy: StrategyStep[] = [
    { buildingId: BUILDING_ID.metalMine, targetLevel: 5 },
    { buildingId: BUILDING_ID.crystalMine, targetLevel: 4 },
    { buildingId: BUILDING_ID.deutSynth, targetLevel: 3 },
    { buildingId: BUILDING_ID.solarPlant, targetLevel: 5 },
    { buildingId: BUILDING_ID.roboticsFactory, targetLevel: 3 },
    { buildingId: BUILDING_ID.metalMine, targetLevel: 10 },
    { buildingId: BUILDING_ID.crystalMine, targetLevel: 8 },
    { buildingId: BUILDING_ID.deutSynth, targetLevel: 6 },
    { buildingId: BUILDING_ID.solarPlant, targetLevel: 8 },
    { buildingId: BUILDING_ID.researchLab, targetLevel: 3 },
    { buildingId: BUILDING_ID.shipyard, targetLevel: 3 },
  ];

  // Adjust based on player preferences
  const strategy = [...baseStrategy];

  // If player frequently overrides for fleet focus, prioritize shipyard
  if ((profile.classificationBreakdown.fleet_focus || 0) > 2) {
    // Move shipyard earlier and increase its level
    const shipyardIdx = strategy.findIndex(
      (s) => s.buildingId === BUILDING_ID.shipyard
    );
    if (shipyardIdx > 0) {
      const shipyardStep = strategy.splice(shipyardIdx, 1)[0]!;
      // Insert after first solar plant
      const solarIdx = strategy.findIndex(
        (s) => s.buildingId === BUILDING_ID.solarPlant
      );
      strategy.splice(solarIdx + 1, 0, shipyardStep);
    }
    // Add higher shipyard level
    strategy.push({ buildingId: BUILDING_ID.shipyard, targetLevel: 6 });
  }

  // If player frequently overrides for tech rush, prioritize research lab
  if ((profile.classificationBreakdown.tech_rush || 0) > 2) {
    const labIdx = strategy.findIndex(
      (s) => s.buildingId === BUILDING_ID.researchLab
    );
    if (labIdx > 0) {
      const labStep = strategy.splice(labIdx, 1)[0]!;
      // Insert earlier
      const robotIdx = strategy.findIndex(
        (s) => s.buildingId === BUILDING_ID.roboticsFactory
      );
      strategy.splice(robotIdx + 1, 0, labStep);
    }
    strategy.push({ buildingId: BUILDING_ID.researchLab, targetLevel: 6 });
  }

  // If player prioritizes resources, add more production early
  if ((profile.classificationBreakdown.resource_priority || 0) > 2) {
    // Check which resource the player prefers
    for (const pref of profile.preferredBuildings) {
      if (PRODUCTION_BUILDINGS.includes(pref.buildingId)) {
        // Add an extra level of this production building early
        const existingIdx = strategy.findIndex(
          (s) => s.buildingId === pref.buildingId
        );
        if (existingIdx >= 0) {
          const currentMax = Math.max(
            ...strategy
              .filter((s) => s.buildingId === pref.buildingId)
              .map((s) => s.targetLevel)
          );
          strategy.push({
            buildingId: pref.buildingId,
            targetLevel: currentMax + 2,
          });
        }
        break; // Only boost the top preferred
      }
    }
  }

  // If player does strategy shifts, add infrastructure earlier
  if ((profile.classificationBreakdown.strategy_shift || 0) > 3) {
    strategy.push({
      buildingId: BUILDING_ID.naniteFactory,
      targetLevel: 1,
    });
  }

  return strategy;
}

/**
 * Compare two strategies and explain the differences.
 */
export function compareStrategies(
  oldStrategy: StrategyStep[],
  newStrategy: StrategyStep[]
): string {
  const changes: string[] = [];

  // Find buildings in new but not in old
  for (const step of newStrategy) {
    const name = BUILDING_NAME[step.buildingId] || `Building ${step.buildingId}`;
    const oldIdx = oldStrategy.findIndex(
      (s) => s.buildingId === step.buildingId && s.targetLevel === step.targetLevel
    );
    if (oldIdx === -1) {
      // Check if it's a new building entirely or higher level
      const oldBuilding = oldStrategy.find((s) => s.buildingId === step.buildingId);
      if (!oldBuilding) {
        changes.push(`Added ${name} L${step.targetLevel}`);
      } else {
        const oldMax = Math.max(
          ...oldStrategy
            .filter((s) => s.buildingId === step.buildingId)
            .map((s) => s.targetLevel)
        );
        if (step.targetLevel > oldMax) {
          changes.push(`Increased ${name} target from L${oldMax} to L${step.targetLevel}`);
        }
      }
    }
  }

  // Check for reordering
  const oldOrder = oldStrategy.map((s) => s.buildingId);
  const newOrder = newStrategy.map((s) => s.buildingId);

  // Find buildings that moved earlier
  for (let i = 0; i < newOrder.length && i < oldOrder.length; i++) {
    if (newOrder[i] !== oldOrder[i]) {
      const name = BUILDING_NAME[newOrder[i]!] || `Building ${newOrder[i]}`;
      const oldPosition = oldOrder.indexOf(newOrder[i]!);
      if (oldPosition > i) {
        changes.push(`Moved ${name} earlier (position ${oldPosition + 1} -> ${i + 1})`);
      }
    }
  }

  // Find removed steps
  for (const step of oldStrategy) {
    const name = BUILDING_NAME[step.buildingId] || `Building ${step.buildingId}`;
    const exists = newStrategy.some(
      (s) => s.buildingId === step.buildingId && s.targetLevel === step.targetLevel
    );
    if (!exists) {
      const stillExists = newStrategy.some((s) => s.buildingId === step.buildingId);
      if (!stillExists) {
        changes.push(`Removed ${name} L${step.targetLevel}`);
      }
    }
  }

  if (changes.length === 0) {
    return 'No significant changes';
  }

  return changes.join('; ');
}

/**
 * Apply a learned strategy to a planet.
 */
export async function applyLearnedStrategy(
  db: D1Database,
  planetId: string,
  newStrategy: StrategyStep[]
): Promise<{ strategyId: string; applied: boolean }> {
  // Get planet's player
  const planet = await db
    .prepare('SELECT player_id, strategy_id FROM planets WHERE id = ?')
    .bind(planetId)
    .first();

  if (!planet) {
    return { strategyId: '', applied: false };
  }

  const playerId = planet.player_id as string;
  const oldStrategyId = planet.strategy_id as string | null;

  // Get old strategy for comparison
  let oldSteps: StrategyStep[] = [];
  if (oldStrategyId) {
    const oldStrat = await db
      .prepare('SELECT steps FROM build_strategies WHERE id = ?')
      .bind(oldStrategyId)
      .first();
    if (oldStrat) {
      oldSteps = JSON.parse((oldStrat.steps as string) || '[]');
    }
  }

  const changesSummary = compareStrategies(oldSteps, newStrategy);

  // Create new strategy
  const strategyId = `strat-learned-${planetId}-${Date.now()}`;
  await db
    .prepare(
      `INSERT INTO build_strategies (id, player_id, name, steps, created_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(
      strategyId,
      playerId,
      `H2M Learned Strategy (${new Date().toISOString().split('T')[0]})`,
      JSON.stringify(newStrategy),
      Math.floor(Date.now() / 1000)
    )
    .run();

  // Update planet to use new strategy
  await db
    .prepare('UPDATE planets SET strategy_id = ? WHERE id = ?')
    .bind(strategyId, planetId)
    .run();

  // Log to strategy history
  const overrideCountResult = await db
    .prepare(
      `SELECT COUNT(*) as cnt FROM override_analysis WHERE planet_id = ?`
    )
    .bind(planetId)
    .first();

  const adoptionRate = 1 - (await getOverrideRate(db, planetId));

  await db
    .prepare(
      `INSERT INTO strategy_history (id, player_id, planet_id, strategy_json, source, override_count, adoption_rate, parent_strategy_id, changes_summary, created_at)
       VALUES (?, ?, ?, ?, 'learned', ?, ?, ?, ?, ?)`
    )
    .bind(
      `sh-${strategyId}`,
      playerId,
      planetId,
      JSON.stringify(newStrategy),
      (overrideCountResult?.cnt as number) || 0,
      adoptionRate,
      oldStrategyId || null,
      changesSummary,
      Math.floor(Date.now() / 1000)
    )
    .run();

  return { strategyId, applied: true };
}

// ============================================================================
// METRICS & REPORTING
// ============================================================================

/**
 * Get H2M dashboard metrics for a player.
 */
export async function getH2MMetrics(
  db: D1Database,
  playerId: string
): Promise<H2MMetrics> {
  // Total agent decisions
  const agentResult = await db
    .prepare(
      `SELECT COUNT(*) as cnt FROM build_history
       WHERE planet_id IN (SELECT id FROM planets WHERE player_id = ?)
       AND source = 'agent'`
    )
    .bind(playerId)
    .first();
  const totalAgentDecisions = (agentResult?.cnt as number) || 0;

  // Total manual decisions
  const manualResult = await db
    .prepare(
      `SELECT COUNT(*) as cnt FROM build_history
       WHERE planet_id IN (SELECT id FROM planets WHERE player_id = ?)
       AND source = 'manual'`
    )
    .bind(playerId)
    .first();
  const totalManualDecisions = (manualResult?.cnt as number) || 0;

  // Total overrides
  const overrideResult = await db
    .prepare(
      `SELECT COUNT(*) as cnt FROM override_analysis WHERE player_id = ?`
    )
    .bind(playerId)
    .first();
  const totalOverrides = (overrideResult?.cnt as number) || 0;

  // Override rate
  const overrideRate =
    totalAgentDecisions > 0 ? totalOverrides / totalAgentDecisions : 0;

  // Adoption rate (inverse of override rate)
  const adoptionRate = 1 - overrideRate;

  // Strategies generated
  const strategiesResult = await db
    .prepare(
      `SELECT COUNT(*) as cnt FROM strategy_history
       WHERE player_id = ? AND source = 'learned'`
    )
    .bind(playerId)
    .first();
  const strategiesGenerated = (strategiesResult?.cnt as number) || 0;

  // Last learning cycle
  const lastLearnResult = await db
    .prepare(
      `SELECT created_at FROM strategy_history
       WHERE player_id = ? AND source = 'learned'
       ORDER BY created_at DESC LIMIT 1`
    )
    .bind(playerId)
    .first();
  const lastLearningCycle = (lastLearnResult?.created_at as number) || null;

  // Adoption trend: compare recent vs older override rates
  let adoptionTrend: 'improving' | 'stable' | 'declining' = 'stable';
  const now = Math.floor(Date.now() / 1000);
  const halfwayPoint = now - 7 * 24 * 3600; // 1 week ago

  const recentOverrides = await db
    .prepare(
      `SELECT COUNT(*) as cnt FROM override_analysis
       WHERE player_id = ? AND created_at >= ?`
    )
    .bind(playerId, halfwayPoint)
    .first();
  const olderOverrides = await db
    .prepare(
      `SELECT COUNT(*) as cnt FROM override_analysis
       WHERE player_id = ? AND created_at < ?`
    )
    .bind(playerId, halfwayPoint)
    .first();

  const recentAgentBuilds = await db
    .prepare(
      `SELECT COUNT(*) as cnt FROM build_history
       WHERE planet_id IN (SELECT id FROM planets WHERE player_id = ?)
       AND source = 'agent' AND created_at >= ?`
    )
    .bind(playerId, halfwayPoint)
    .first();
  const olderAgentBuilds = await db
    .prepare(
      `SELECT COUNT(*) as cnt FROM build_history
       WHERE planet_id IN (SELECT id FROM planets WHERE player_id = ?)
       AND source = 'agent' AND created_at < ?`
    )
    .bind(playerId, halfwayPoint)
    .first();

  const recentRate =
    ((recentAgentBuilds?.cnt as number) || 0) > 0
      ? ((recentOverrides?.cnt as number) || 0) / ((recentAgentBuilds?.cnt as number) || 1)
      : 0;
  const olderRate =
    ((olderAgentBuilds?.cnt as number) || 0) > 0
      ? ((olderOverrides?.cnt as number) || 0) / ((olderAgentBuilds?.cnt as number) || 1)
      : 0;

  if (recentRate < olderRate * 0.8 && olderRate > 0) {
    adoptionTrend = 'improving';
  } else if (recentRate > olderRate * 1.2 && olderRate > 0) {
    adoptionTrend = 'declining';
  }

  // Per-planet breakdown
  const planetsResult = await db
    .prepare('SELECT id FROM planets WHERE player_id = ?')
    .bind(playerId)
    .all();
  const planetIds = ((planetsResult.results || []) as unknown as Array<{ id: string }>).map(
    (p) => p.id
  );

  const planetBreakdown: H2MMetrics['planetBreakdown'] = [];

  for (const pid of planetIds) {
    const pAgent = await db
      .prepare(
        `SELECT COUNT(*) as cnt FROM build_history
         WHERE planet_id = ? AND source = 'agent'`
      )
      .bind(pid)
      .first();
    const pOverrides = await db
      .prepare(
        `SELECT COUNT(*) as cnt FROM override_analysis WHERE planet_id = ?`
      )
      .bind(pid)
      .first();

    const agentDec = (pAgent?.cnt as number) || 0;
    const ovrCount = (pOverrides?.cnt as number) || 0;

    planetBreakdown.push({
      planetId: pid,
      agentDecisions: agentDec,
      overrides: ovrCount,
      overrideRate: agentDec > 0 ? ovrCount / agentDec : 0,
    });
  }

  return {
    playerId,
    totalAgentDecisions,
    totalManualDecisions,
    totalOverrides,
    overrideRate,
    adoptionRate,
    strategiesGenerated,
    adoptionTrend,
    lastLearningCycle,
    planetBreakdown,
  };
}

/**
 * Get adoption rate over a time window.
 * Shows how many agent decisions the player accepted (higher = agent is learning).
 */
export async function getAdoptionRate(
  db: D1Database,
  playerId: string,
  windowDays: number = 7
): Promise<{ adoptionRate: number; windowDays: number; agentDecisions: number; overrides: number }> {
  const since = Math.floor(Date.now() / 1000) - windowDays * 24 * 3600;

  const agentResult = await db
    .prepare(
      `SELECT COUNT(*) as cnt FROM build_history
       WHERE planet_id IN (SELECT id FROM planets WHERE player_id = ?)
       AND source = 'agent' AND created_at >= ?`
    )
    .bind(playerId, since)
    .first();

  const overrideResult = await db
    .prepare(
      `SELECT COUNT(*) as cnt FROM override_analysis
       WHERE player_id = ? AND created_at >= ?`
    )
    .bind(playerId, since)
    .first();

  const agentDecisions = (agentResult?.cnt as number) || 0;
  const overrides = (overrideResult?.cnt as number) || 0;

  const adoptionRate = agentDecisions > 0 ? 1 - overrides / agentDecisions : 1;

  return { adoptionRate, windowDays, agentDecisions, overrides };
}

/**
 * Generate a full H2M report for a player.
 */
export async function generateH2MReport(
  db: D1Database,
  playerId: string
): Promise<H2MReport> {
  const metrics = await getH2MMetrics(db, playerId);
  const profile = await analyzePlayerPatterns(db, playerId);
  const topReasons = await getTopOverrideReasons(db, playerId, 6);

  // Get examples for top override reasons
  const topOverrideReasons: H2MReport['topOverrideReasons'] = [];
  const totalOverrides = topReasons.reduce((sum, r) => sum + r.count, 0);

  for (const reason of topReasons) {
    // Get an example override
    const exampleResult = await db
      .prepare(
        `SELECT * FROM override_analysis
         WHERE player_id = ? AND classification = ?
         ORDER BY created_at DESC LIMIT 1`
      )
      .bind(playerId, reason.classification)
      .first();

    let example: Override | null = null;
    if (exampleResult) {
      example = {
        id: exampleResult.id as string,
        planetId: exampleResult.planet_id as string,
        playerId: exampleResult.player_id as string,
        agentBuildId: exampleResult.agent_build_id as string,
        agentBuildingId: exampleResult.agent_building_id as number,
        agentLevel: exampleResult.agent_level as number,
        agentReason: exampleResult.agent_reason as string | null,
        manualBuildId: exampleResult.manual_build_id as string,
        manualBuildingId: exampleResult.manual_building_id as number,
        manualLevel: exampleResult.manual_level as number,
        timeDelta: exampleResult.time_delta as number,
        classification: exampleResult.classification as OverrideClassification,
        detectedAt: exampleResult.created_at as number,
      };
    }

    topOverrideReasons.push({
      classification: reason.classification,
      count: reason.count,
      percentage: totalOverrides > 0 ? (reason.count / totalOverrides) * 100 : 0,
      example,
    });
  }

  // Generate recommendations
  const recommendations: string[] = [];

  if (profile.classificationBreakdown.fleet_focus > 2) {
    recommendations.push(
      'You frequently prioritize shipyard over production. The agent will now suggest shipyard upgrades earlier.'
    );
  }
  if (profile.classificationBreakdown.tech_rush > 2) {
    recommendations.push(
      'You favor research lab upgrades. The agent will prioritize tech buildings in future strategies.'
    );
  }
  if (profile.classificationBreakdown.resource_priority > 2) {
    const topPref = profile.preferredBuildings[0];
    if (topPref) {
      const name = BUILDING_NAME[topPref.buildingId] || `Building ${topPref.buildingId}`;
      recommendations.push(
        `You prefer ${name} over agent suggestions. The agent will weight this building higher.`
      );
    }
  }
  if (profile.overrideTrend === 'improving') {
    recommendations.push(
      'The agent is learning your style — override rate is decreasing.'
    );
  }
  if (profile.overrideTrend === 'worsening') {
    recommendations.push(
      'Override rate is increasing. Consider running a learning cycle to update the agent strategy.'
    );
  }
  if (metrics.adoptionRate > 0.8) {
    recommendations.push(
      'Excellent alignment! The agent matches your playstyle over 80% of the time.'
    );
  }
  if (recommendations.length === 0) {
    recommendations.push(
      'Keep playing to generate more data. The agent needs at least 10 decisions to start learning effectively.'
    );
  }

  // Build adoption history (weekly buckets for last 4 weeks)
  const adoptionHistory: H2MReport['adoptionHistory'] = [];
  const now = Math.floor(Date.now() / 1000);
  const weekSeconds = 7 * 24 * 3600;

  for (let i = 3; i >= 0; i--) {
    const windowStart = now - (i + 1) * weekSeconds;
    const windowEnd = now - i * weekSeconds;

    const weekAgent = await db
      .prepare(
        `SELECT COUNT(*) as cnt FROM build_history
         WHERE planet_id IN (SELECT id FROM planets WHERE player_id = ?)
         AND source = 'agent' AND created_at >= ? AND created_at < ?`
      )
      .bind(playerId, windowStart, windowEnd)
      .first();

    const weekOverrides = await db
      .prepare(
        `SELECT COUNT(*) as cnt FROM override_analysis
         WHERE player_id = ? AND created_at >= ? AND created_at < ?`
      )
      .bind(playerId, windowStart, windowEnd)
      .first();

    const agentCount = (weekAgent?.cnt as number) || 0;
    const ovrCount = (weekOverrides?.cnt as number) || 0;

    adoptionHistory.push({
      windowStart,
      windowEnd,
      adoptionRate: agentCount > 0 ? 1 - ovrCount / agentCount : 1,
    });
  }

  return {
    playerId,
    generatedAt: now,
    metrics,
    profile,
    topOverrideReasons,
    recommendations,
    adoptionHistory,
  };
}

// ============================================================================
// LEARNING CYCLE (Cron integration)
// ============================================================================

/**
 * Run the H2M learning cycle for all players with agent-enabled planets.
 * Called from the weekly cron job.
 */
export async function runH2MLearningCycle(
  db: D1Database
): Promise<{ playersProcessed: number; overridesDetected: number; strategiesUpdated: number }> {
  let overridesDetected = 0;
  let strategiesUpdated = 0;

  // Get all players with agent-enabled planets
  const playersResult = await db
    .prepare(
      `SELECT DISTINCT player_id FROM planets WHERE agent_enabled = 1`
    )
    .all();

  const playerIds = ((playersResult.results || []) as unknown as Array<{ player_id: string }>).map(
    (p) => p.player_id
  );

  for (const playerId of playerIds) {
    // Get all planets for this player
    const planetsResult = await db
      .prepare('SELECT id FROM planets WHERE player_id = ? AND agent_enabled = 1')
      .bind(playerId)
      .all();
    const planetIds = ((planetsResult.results || []) as unknown as Array<{ id: string }>).map(
      (p) => p.id
    );

    // Detect overrides for each planet (last 7 days)
    const since = Math.floor(Date.now() / 1000) - 7 * 24 * 3600;

    for (const planetId of planetIds) {
      const overrides = await detectOverrides(db, planetId, since);

      // Store new overrides (skip duplicates)
      for (const override of overrides) {
        const existing = await db
          .prepare('SELECT id FROM override_analysis WHERE id = ?')
          .bind(override.id)
          .first();

        if (!existing) {
          await db
            .prepare(
              `INSERT INTO override_analysis (id, planet_id, player_id, agent_build_id, agent_building_id, agent_level, agent_reason, manual_build_id, manual_building_id, manual_level, time_delta, classification, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .bind(
              override.id,
              override.planetId,
              override.playerId,
              override.agentBuildId,
              override.agentBuildingId,
              override.agentLevel,
              override.agentReason,
              override.manualBuildId,
              override.manualBuildingId,
              override.manualLevel,
              override.timeDelta,
              override.classification,
              override.detectedAt
            )
            .run();

          overridesDetected++;
        }
      }
    }

    // Generate improved strategy if there are enough overrides
    const overrideCountResult = await db
      .prepare(
        `SELECT COUNT(*) as cnt FROM override_analysis WHERE player_id = ?`
      )
      .bind(playerId)
      .first();
    const totalOverrides = (overrideCountResult?.cnt as number) || 0;

    if (totalOverrides >= 3) {
      // Only update if there are meaningful overrides
      const newStrategy = await generateImprovedStrategy(db, playerId);

      // Apply to all agent-enabled planets for this player
      for (const planetId of planetIds) {
        await applyLearnedStrategy(db, planetId, newStrategy);
        strategiesUpdated++;
      }
    }
  }

  return {
    playersProcessed: playerIds.length,
    overridesDetected,
    strategiesUpdated,
  };
}

/**
 * Persist detected overrides to the database.
 * Used when overrides are detected outside the learning cycle.
 */
export async function storeOverrides(
  db: D1Database,
  overrides: Override[]
): Promise<number> {
  let stored = 0;
  for (const override of overrides) {
    const existing = await db
      .prepare('SELECT id FROM override_analysis WHERE id = ?')
      .bind(override.id)
      .first();

    if (!existing) {
      await db
        .prepare(
          `INSERT INTO override_analysis (id, planet_id, player_id, agent_build_id, agent_building_id, agent_level, agent_reason, manual_build_id, manual_building_id, manual_level, time_delta, classification, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          override.id,
          override.planetId,
          override.playerId,
          override.agentBuildId,
          override.agentBuildingId,
          override.agentLevel,
          override.agentReason,
          override.manualBuildId,
          override.manualBuildingId,
          override.manualLevel,
          override.timeDelta,
          override.classification,
          override.detectedAt
        )
        .run();
      stored++;
    }
  }
  return stored;
}
