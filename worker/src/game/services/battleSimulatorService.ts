/**
 * Battle Simulator Service — Monte Carlo Statistical Analysis
 *
 * Provides tools for players to simulate battles before committing fleets:
 *   - simulateBattlePreview: Run N simulations and return statistical outcomes
 *   - getBreakEvenFleet: Find minimum fleet needed for 50%+ win rate
 *   - compareFleetCompositions: Head-to-head fleet comparison
 *
 * All simulation runs use the canonical OGame battle engine from battleService.ts.
 */

import { Ships, Resources } from '../types';
import { DefenseStructures } from '../defenses';
import {
  simulateBattle,
  CombatTechLevels,
  BattleResult,
} from './battleService';

// ============================================================================
// TYPES
// ============================================================================

/** Per-side loss averages */
export interface AverageLosses {
  metal: number;
  crystal: number;
  deuterium: number;
  total: number;
}

/** Distribution of battle endings by round count */
export interface RoundDistribution {
  [round: number]: number; // round_number -> count of simulations ending on this round
}

/** 95% confidence interval for a metric */
export interface ConfidenceInterval {
  lower: number;
  upper: number;
  mean: number;
}

/** Aggregated survivor counts (average per ship type) */
export interface AverageSurvivors {
  [shipType: string]: number;
}

/** Full result from a Monte Carlo battle simulation */
export interface BattleSimulationResult {
  /** Fraction of simulations won by attacker (0.0 - 1.0) */
  winRate: number;
  /** Fraction of simulations that were draws */
  drawRate: number;
  /** Fraction of simulations won by defender */
  lossRate: number;
  /** Average resource losses for attacker across all runs */
  averageAttackerLosses: AverageLosses;
  /** Average resource losses for defender across all runs */
  averageDefenderLosses: AverageLosses;
  /** Average debris field generated */
  averageDebris: AverageLosses;
  /** Distribution of how many rounds battles lasted */
  roundDistribution: RoundDistribution;
  /** 95% confidence interval for attacker win rate */
  confidenceInterval: ConfidenceInterval;
  /** Average surviving ships for attacker */
  averageAttackerSurvivors: AverageSurvivors;
  /** Average surviving ships for defender */
  averageDefenderSurvivors: AverageSurvivors;
  /** Number of simulation runs performed */
  runs: number;
}

/** Result from a fleet comparison */
export interface FleetComparisonResult {
  /** Win rate of fleet1 against fleet2 */
  fleet1WinRate: number;
  /** Win rate of fleet2 against fleet1 */
  fleet2WinRate: number;
  /** Draw rate */
  drawRate: number;
  /** Average losses for fleet1 when attacking fleet2 */
  fleet1AverageLosses: AverageLosses;
  /** Average losses for fleet2 when attacking fleet1 */
  fleet2AverageLosses: AverageLosses;
  /** Which fleet is stronger overall */
  winner: 'fleet1' | 'fleet2' | 'even';
  /** Margin of victory (absolute difference in win rates) */
  margin: number;
  runs: number;
}

/** Result from a break-even fleet calculation */
export interface BreakEvenResult {
  /** The minimum fleet composition achieving >= 50% win rate */
  fleet: Partial<Ships>;
  /** Achieved win rate with the break-even fleet */
  achievedWinRate: number;
  /** Total resource cost of the break-even fleet */
  fleetCost: Resources;
  /** Whether a viable fleet was found */
  found: boolean;
  /** Number of iterations used to find the result */
  iterations: number;
}

// ============================================================================
// SHIP COSTS (for break-even cost calculation)
// ============================================================================

const SHIP_COSTS: Record<keyof Ships, Resources> = {
  lightFighter:   { metal: 3000,    crystal: 1000,    deuterium: 0 },
  heavyFighter:   { metal: 6000,    crystal: 4000,    deuterium: 0 },
  cruiser:        { metal: 20000,   crystal: 7000,    deuterium: 2000 },
  battleship:     { metal: 45000,   crystal: 15000,   deuterium: 0 },
  battlecruiser:  { metal: 30000,   crystal: 40000,   deuterium: 15000 },
  bomber:         { metal: 50000,   crystal: 25000,   deuterium: 15000 },
  destroyer:      { metal: 60000,   crystal: 50000,   deuterium: 15000 },
  deathstar:      { metal: 5000000, crystal: 4000000, deuterium: 1000000 },
  smallCargo:     { metal: 2000,    crystal: 2000,    deuterium: 0 },
  largeCargo:     { metal: 6000,    crystal: 6000,    deuterium: 0 },
  colonyShip:     { metal: 10000,   crystal: 20000,   deuterium: 10000 },
  recycler:       { metal: 10000,   crystal: 6000,    deuterium: 2000 },
  espionageProbe: { metal: 0,       crystal: 1000,    deuterium: 0 },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/** Create an empty Ships object */
function emptyShips(): Ships {
  return {
    lightFighter: 0, heavyFighter: 0, cruiser: 0, battleship: 0,
    battlecruiser: 0, bomber: 0, destroyer: 0, deathstar: 0,
    smallCargo: 0, largeCargo: 0, colonyShip: 0, recycler: 0,
    espionageProbe: 0,
  };
}

/** Default zero tech levels */
function defaultTech(): CombatTechLevels {
  return { weaponTech: 0, shieldingTech: 0, armorTech: 0 };
}

/** Calculate total resource cost of a fleet */
function calculateFleetCost(ships: Partial<Ships>): Resources {
  const cost: Resources = { metal: 0, crystal: 0, deuterium: 0 };
  for (const [type, count] of Object.entries(ships)) {
    if (count && count > 0) {
      const unitCost = SHIP_COSTS[type as keyof Ships];
      if (unitCost) {
        cost.metal += unitCost.metal * count;
        cost.crystal += unitCost.crystal * count;
        cost.deuterium += unitCost.deuterium * count;
      }
    }
  }
  return cost;
}

/** Calculate 95% confidence interval for a proportion using Wilson score interval */
function wilsonConfidenceInterval(
  successes: number,
  total: number
): ConfidenceInterval {
  if (total === 0) {
    return { lower: 0, upper: 0, mean: 0 };
  }

  const p = successes / total;
  const z = 1.96; // 95% confidence
  const z2 = z * z;
  const n = total;

  // Wilson score interval
  const denominator = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denominator;
  const spread = (z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n)) / denominator;

  return {
    lower: Math.max(0, center - spread),
    upper: Math.min(1, center + spread),
    mean: p,
  };
}

/** Check if a ships object has any ships */
function hasShips(ships: Partial<Ships>): boolean {
  for (const count of Object.values(ships)) {
    if (count && count > 0) return true;
  }
  return false;
}

// ============================================================================
// CORE SIMULATION FUNCTIONS
// ============================================================================

/**
 * Run N battle simulations and return statistical analysis of outcomes.
 *
 * @param attackerShips     - Attacker's fleet composition
 * @param defenderShips     - Defender's fleet composition
 * @param defenderDefenses  - Defender's planetary defenses (optional)
 * @param attackerTech      - Attacker's combat technology levels
 * @param defenderTech      - Defender's combat technology levels
 * @param runs              - Number of Monte Carlo simulation runs (default 100)
 * @returns Statistical analysis of battle outcomes
 */
export function simulateBattlePreview(
  attackerShips: Ships,
  defenderShips: Ships,
  defenderDefenses?: DefenseStructures,
  attackerTech: CombatTechLevels = defaultTech(),
  defenderTech: CombatTechLevels = defaultTech(),
  runs: number = 100,
): BattleSimulationResult {
  // Clamp runs to a reasonable range
  runs = Math.max(1, Math.min(runs, 1000));

  let attackerWins = 0;
  let defenderWins = 0;
  let draws = 0;

  // Accumulators for averages
  let totalAttackerLossMetal = 0;
  let totalAttackerLossCrystal = 0;
  let totalAttackerLossDeuterium = 0;
  let totalDefenderLossMetal = 0;
  let totalDefenderLossCrystal = 0;
  let totalDefenderLossDeuterium = 0;
  let totalDebrisMetal = 0;
  let totalDebrisCrystal = 0;

  const roundCounts: RoundDistribution = {};
  const attackerSurvivorAccum: Record<string, number> = {};
  const defenderSurvivorAccum: Record<string, number> = {};

  for (let i = 0; i < runs; i++) {
    const result: BattleResult = simulateBattle(
      { ...attackerShips },
      { ...defenderShips },
      defenderDefenses ? { ...defenderDefenses } : undefined,
      attackerTech,
      defenderTech,
    );

    // Count outcome
    if (result.winner === 'attacker') attackerWins++;
    else if (result.winner === 'defender') defenderWins++;
    else draws++;

    // Accumulate losses
    totalAttackerLossMetal += result.attackerLosses.metal;
    totalAttackerLossCrystal += result.attackerLosses.crystal;
    totalAttackerLossDeuterium += result.attackerLosses.deuterium;
    totalDefenderLossMetal += result.defenderLosses.metal;
    totalDefenderLossCrystal += result.defenderLosses.crystal;
    totalDefenderLossDeuterium += result.defenderLosses.deuterium;
    totalDebrisMetal += result.debrisField.metal;
    totalDebrisCrystal += result.debrisField.crystal;

    // Round distribution
    const roundCount = result.rounds.length;
    roundCounts[roundCount] = (roundCounts[roundCount] || 0) + 1;

    // Accumulate survivors
    for (const [shipType, count] of Object.entries(result.attackerSurvivors)) {
      attackerSurvivorAccum[shipType] = (attackerSurvivorAccum[shipType] || 0) + count;
    }
    for (const [shipType, count] of Object.entries(result.defenderSurvivors)) {
      defenderSurvivorAccum[shipType] = (defenderSurvivorAccum[shipType] || 0) + count;
    }
  }

  // Calculate averages
  const avgAttackerLosses: AverageLosses = {
    metal: Math.round(totalAttackerLossMetal / runs),
    crystal: Math.round(totalAttackerLossCrystal / runs),
    deuterium: Math.round(totalAttackerLossDeuterium / runs),
    total: Math.round((totalAttackerLossMetal + totalAttackerLossCrystal + totalAttackerLossDeuterium) / runs),
  };

  const avgDefenderLosses: AverageLosses = {
    metal: Math.round(totalDefenderLossMetal / runs),
    crystal: Math.round(totalDefenderLossCrystal / runs),
    deuterium: Math.round(totalDefenderLossDeuterium / runs),
    total: Math.round((totalDefenderLossMetal + totalDefenderLossCrystal + totalDefenderLossDeuterium) / runs),
  };

  const avgDebris: AverageLosses = {
    metal: Math.round(totalDebrisMetal / runs),
    crystal: Math.round(totalDebrisCrystal / runs),
    deuterium: 0,
    total: Math.round((totalDebrisMetal + totalDebrisCrystal) / runs),
  };

  // Average survivors
  const avgAttackerSurvivors: AverageSurvivors = {};
  for (const [type, total] of Object.entries(attackerSurvivorAccum)) {
    avgAttackerSurvivors[type] = Math.round((total / runs) * 100) / 100;
  }
  const avgDefenderSurvivors: AverageSurvivors = {};
  for (const [type, total] of Object.entries(defenderSurvivorAccum)) {
    avgDefenderSurvivors[type] = Math.round((total / runs) * 100) / 100;
  }

  // Confidence interval for win rate
  const ci = wilsonConfidenceInterval(attackerWins, runs);

  return {
    winRate: attackerWins / runs,
    drawRate: draws / runs,
    lossRate: defenderWins / runs,
    averageAttackerLosses: avgAttackerLosses,
    averageDefenderLosses: avgDefenderLosses,
    averageDebris: avgDebris,
    roundDistribution: roundCounts,
    confidenceInterval: ci,
    averageAttackerSurvivors: avgAttackerSurvivors,
    averageDefenderSurvivors: avgDefenderSurvivors,
    runs,
  };
}

/**
 * Find the minimum fleet needed to achieve at least a 50% win rate
 * against a given set of defenses and fleet.
 *
 * Strategy: Binary search on fleet multiplier for a base composition.
 * The base composition is derived from the defender's forces to provide
 * a reasonable counter-fleet.
 *
 * @param targetDefenses  - Defender's planetary defenses
 * @param targetFleet     - Defender's fleet
 * @param targetTech      - Defender's technology levels
 * @param attackerTech    - Attacker's technology levels
 * @returns Break-even fleet composition and metadata
 */
export function getBreakEvenFleet(
  targetDefenses: DefenseStructures | undefined,
  targetFleet: Ships,
  targetTech: CombatTechLevels = defaultTech(),
  attackerTech: CombatTechLevels = defaultTech(),
): BreakEvenResult {
  // Determine base fleet composition for the search.
  // Use a balanced attack fleet: cruisers + battleships + bombers (if defenses exist).
  const baseFleet: Partial<Ships> = {};

  // Check what we're up against to pick the right ship composition
  const hasDefenses = targetDefenses && Object.values(targetDefenses).some(v => v > 0);
  const hasFleet = hasShips(targetFleet);

  if (!hasFleet && !hasDefenses) {
    // Nothing to fight
    return {
      fleet: {},
      achievedWinRate: 1.0,
      fleetCost: { metal: 0, crystal: 0, deuterium: 0 },
      found: true,
      iterations: 0,
    };
  }

  // Build a base composition ratio that makes tactical sense
  if (hasDefenses) {
    // Bombers are excellent against defenses due to rapidfire
    baseFleet.bomber = 1;
    baseFleet.cruiser = 2;
    baseFleet.battleship = 1;
  }
  if (hasFleet) {
    // Battleships and destroyers for fleet combat
    baseFleet.battleship = (baseFleet.battleship || 0) + 2;
    baseFleet.destroyer = 1;
    baseFleet.cruiser = (baseFleet.cruiser || 0) + 3;
  }

  // If base fleet is still empty, default to cruisers
  if (!hasShips(baseFleet)) {
    baseFleet.cruiser = 1;
  }

  // Binary search for the right multiplier
  let low = 1;
  let high = 500;
  let bestFleet: Partial<Ships> = {};
  let bestWinRate = 0;
  let iterations = 0;
  const maxIterations = 20; // log2(500) ~ 9, so 20 is plenty
  const runsPerTest = 50; // Fewer runs during search for speed

  while (low <= high && iterations < maxIterations) {
    iterations++;
    const mid = Math.floor((low + high) / 2);

    // Scale the base fleet by the multiplier
    const testFleet = emptyShips();
    for (const [type, count] of Object.entries(baseFleet)) {
      if (count && count > 0) {
        testFleet[type as keyof Ships] = count * mid;
      }
    }

    // Run simulation
    const result = simulateBattlePreview(
      testFleet,
      targetFleet,
      targetDefenses,
      attackerTech,
      targetTech,
      runsPerTest,
    );

    if (result.winRate >= 0.5) {
      bestFleet = { ...testFleet };
      bestWinRate = result.winRate;
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  // If we never found a fleet achieving 50%, return the largest tested
  if (bestWinRate < 0.5) {
    const maxFleet = emptyShips();
    for (const [type, count] of Object.entries(baseFleet)) {
      if (count && count > 0) {
        maxFleet[type as keyof Ships] = count * 500;
      }
    }

    const finalResult = simulateBattlePreview(
      maxFleet,
      targetFleet,
      targetDefenses,
      attackerTech,
      targetTech,
      runsPerTest,
    );

    return {
      fleet: maxFleet,
      achievedWinRate: finalResult.winRate,
      fleetCost: calculateFleetCost(maxFleet),
      found: finalResult.winRate >= 0.5,
      iterations,
    };
  }

  // Clean up the fleet: remove zero entries
  const cleanFleet: Partial<Ships> = {};
  for (const [type, count] of Object.entries(bestFleet)) {
    if (count && count > 0) {
      cleanFleet[type as keyof Ships] = count;
    }
  }

  return {
    fleet: cleanFleet,
    achievedWinRate: bestWinRate,
    fleetCost: calculateFleetCost(cleanFleet),
    found: true,
    iterations,
  };
}

/**
 * Compare two fleet compositions head-to-head.
 * Runs simulations with fleet1 attacking fleet2, then fleet2 attacking fleet1.
 *
 * @param fleet1 - First fleet composition
 * @param fleet2 - Second fleet composition
 * @param tech1  - First fleet's technology levels
 * @param tech2  - Second fleet's technology levels
 * @param runs   - Number of simulation runs per direction (default 100)
 * @returns Comparison result showing which fleet is stronger
 */
export function compareFleetCompositions(
  fleet1: Ships,
  fleet2: Ships,
  tech1: CombatTechLevels = defaultTech(),
  tech2: CombatTechLevels = defaultTech(),
  runs: number = 100,
): FleetComparisonResult {
  runs = Math.max(1, Math.min(runs, 1000));

  // Fleet1 attacks Fleet2
  const f1AttacksF2 = simulateBattlePreview(
    fleet1,
    fleet2,
    undefined,
    tech1,
    tech2,
    runs,
  );

  // Fleet2 attacks Fleet1
  const f2AttacksF1 = simulateBattlePreview(
    fleet2,
    fleet1,
    undefined,
    tech2,
    tech1,
    runs,
  );

  // Composite win rate: average of offensive win rate and defensive survival rate
  const fleet1Score = (f1AttacksF2.winRate + f2AttacksF1.lossRate) / 2;
  const fleet2Score = (f2AttacksF1.winRate + f1AttacksF2.lossRate) / 2;
  const drawScore = 1 - fleet1Score - fleet2Score;

  let winner: 'fleet1' | 'fleet2' | 'even';
  if (Math.abs(fleet1Score - fleet2Score) < 0.05) {
    winner = 'even';
  } else if (fleet1Score > fleet2Score) {
    winner = 'fleet1';
  } else {
    winner = 'fleet2';
  }

  return {
    fleet1WinRate: fleet1Score,
    fleet2WinRate: fleet2Score,
    drawRate: Math.max(0, drawScore),
    fleet1AverageLosses: f1AttacksF2.averageAttackerLosses,
    fleet2AverageLosses: f2AttacksF1.averageAttackerLosses,
    winner,
    margin: Math.abs(fleet1Score - fleet2Score),
    runs,
  };
}

// ============================================================================
// SERVICE CLASS
// ============================================================================

export class BattleSimulatorService {
  simulatePreview(
    attackerShips: Ships,
    defenderShips: Ships,
    defenderDefenses?: DefenseStructures,
    attackerTech?: CombatTechLevels,
    defenderTech?: CombatTechLevels,
    runs?: number,
  ): BattleSimulationResult {
    return simulateBattlePreview(
      attackerShips,
      defenderShips,
      defenderDefenses,
      attackerTech,
      defenderTech,
      runs,
    );
  }

  getBreakEven(
    targetDefenses: DefenseStructures | undefined,
    targetFleet: Ships,
    targetTech?: CombatTechLevels,
    attackerTech?: CombatTechLevels,
  ): BreakEvenResult {
    return getBreakEvenFleet(targetDefenses, targetFleet, targetTech, attackerTech);
  }

  compareFleets(
    fleet1: Ships,
    fleet2: Ships,
    tech1?: CombatTechLevels,
    tech2?: CombatTechLevels,
    runs?: number,
  ): FleetComparisonResult {
    return compareFleetCompositions(fleet1, fleet2, tech1, tech2, runs);
  }
}

/** Singleton instance */
export const battleSimulatorService = new BattleSimulatorService();
