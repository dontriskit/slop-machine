import {
  Coordinate,
  Ships,
  Resources,
  BuildingLevels,
  TechLevels,
  PlanetState,
  SHIP_KEYS,
} from '../types';
import { DefenseStructures } from '../defenses';

/**
 * Espionage Service
 *
 * Full OGame espionage system implementation:
 *  - Espionage report generation with tech-level-based information revelation
 *  - Counter-espionage detection and probe destruction
 *  - Espionage probe fleet management
 *
 * Information is revealed in tiers based on the difference between the
 * attacker's espionage tech and the defender's espionage tech, plus a bonus
 * from additional probes sent.
 *
 * Reference: OGameX and UniEngine canonical mechanics.
 */

// ============================================================================
// TYPES
// ============================================================================

/** Espionage information tier levels */
export enum InfoLevel {
  /** Resources only (always visible) */
  Resources = 0,
  /** Resources + fleet stationed */
  Fleet = 1,
  /** Resources + fleet + defenses */
  Defenses = 2,
  /** Resources + fleet + defenses + buildings */
  Buildings = 3,
  /** Resources + fleet + defenses + buildings + research */
  Research = 4,
}

/** Full espionage report returned after a successful probe mission */
export interface EspionageReport {
  /** Unique report identifier */
  id: string;
  /** Unix millisecond timestamp of report creation */
  timestamp: number;
  /** Attacker player ID */
  attackerId: string;
  /** Defender player ID (null if planet is unoccupied) */
  defenderId: string | null;
  /** Defender player name */
  targetPlayerName: string;
  /** Target planet coordinate */
  targetCoordinate: Coordinate;

  // --- Information sections (null = not enough tech to see) ---

  /** Target planet resources (always visible if report succeeds) */
  resources: Resources | null;
  /** Fleet stationed at target planet */
  fleet: Partial<Ships> | null;
  /** Defense structures on target planet */
  defenses: Partial<DefenseStructures> | null;
  /** Building levels on target planet */
  buildings: Partial<BuildingLevels> | null;
  /** Research/tech levels of target player */
  research: Partial<TechLevels> | null;

  // --- Meta ---

  /** Percentage chance that the defender detected the probes */
  counterChance: number;
  /** Number of probes destroyed by counter-espionage */
  probesLost: number;
  /** Number of probes originally sent */
  probesSent: number;
  /** Information tier revealed (0-4) */
  infoLevel: InfoLevel;
}

/** Counter-espionage result */
export interface CounterEspionageResult {
  /** Whether the defender detected the probes */
  detected: boolean;
  /** Detection probability percentage (0-100) */
  detectionChance: number;
  /** Number of probes destroyed */
  probesDestroyed: number;
  /** Number of probes surviving */
  probesSurviving: number;
}

/** Espionage notification sent to the defender when probes are detected */
export interface EspionageNotification {
  /** Notification ID */
  id: string;
  /** Timestamp of detection */
  timestamp: number;
  /** Defender player ID (who was probed) */
  defenderId: string;
  /** Attacker's coordinates (revealed to defender on detection) */
  attackerCoordinate: Coordinate;
  /** Attacker player name (if known) */
  attackerName: string;
  /** Number of probes detected */
  probesDetected: number;
  /** Whether the probes were destroyed */
  probesDestroyed: boolean;
}

/** Input parameters for an espionage mission */
export interface EspionageParams {
  /** Attacker player ID */
  attackerId: string;
  /** Attacker player name */
  attackerName: string;
  /** Attacker's espionage tech level */
  attackerSpyTech: number;
  /** Attacker's coordinate (source planet) */
  attackerCoordinate: Coordinate;
  /** Number of espionage probes sent */
  probeCount: number;
  /** Defender player ID */
  defenderId: string;
  /** Defender player name */
  defenderName: string;
  /** Defender's espionage tech level */
  defenderSpyTech: number;
  /** Full planet state of the target */
  targetPlanet: PlanetState;
  /** Defender's defense structures */
  targetDefenses: DefenseStructures;
  /** Defender's tech levels */
  defenderTech: TechLevels;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Effective spy level difference thresholds for each information tier.
 *
 * Effective spy level = (attackerSpyTech - defenderSpyTech) + (probeCount - 1) * 2
 *
 * Each additional probe beyond the first adds +2 to the effective spy level,
 * meaning more probes reveal more information.
 */
const INFO_TIER_THRESHOLDS = {
  /** Resources: always visible (diff >= -Infinity) */
  [InfoLevel.Resources]: -Infinity,
  /** Fleet: requires effective diff >= 2 */
  [InfoLevel.Fleet]: 2,
  /** Defenses: requires effective diff >= 4 */
  [InfoLevel.Defenses]: 4,
  /** Buildings: requires effective diff >= 6 */
  [InfoLevel.Buildings]: 6,
  /** Research: requires effective diff >= 8 */
  [InfoLevel.Research]: 8,
} as const;

/**
 * Base counter-espionage formula coefficient.
 * Detection chance = max(0, (defenderSpy - attackerSpy + 1)) * probeCount * 2
 * Clamped to [0, 100].
 */
const COUNTER_ESPIONAGE_COEFFICIENT = 2;

// ============================================================================
// ESPIONAGE SERVICE
// ============================================================================

export class EspionageService {

  // --------------------------------------------------------------------------
  // EFFECTIVE SPY LEVEL
  // --------------------------------------------------------------------------

  /**
   * Calculate the effective spy level difference.
   *
   * Formula: (attackerSpyTech - defenderSpyTech) + (probeCount - 1) * 2
   *
   * Each probe beyond the first adds +2 to the effective level.
   * More probes = more intel, but also higher detection chance.
   *
   * @param attackerSpyTech  Attacker's espionage technology level
   * @param defenderSpyTech  Defender's espionage technology level
   * @param probeCount       Number of espionage probes sent (minimum 1)
   * @returns Effective spy level difference
   */
  calculateEffectiveSpyDiff(
    attackerSpyTech: number,
    defenderSpyTech: number,
    probeCount: number,
  ): number {
    const baseDiff = attackerSpyTech - defenderSpyTech;
    const probeBonus = Math.max(0, probeCount - 1) * 2;
    return baseDiff + probeBonus;
  }

  // --------------------------------------------------------------------------
  // INFORMATION LEVEL DETERMINATION
  // --------------------------------------------------------------------------

  /**
   * Determine how much information the spy report reveals.
   *
   * Each tier requires a minimum effective spy difference:
   *   - Resources: always (diff >= 0, but shown even at negative diff)
   *   - Fleet:     diff >= 2
   *   - Defenses:  diff >= 4
   *   - Buildings: diff >= 6
   *   - Research:  diff >= 8
   *
   * @param effectiveDiff  The effective spy level difference
   * @returns InfoLevel enum value (0-4)
   */
  getInfoLevel(effectiveDiff: number): InfoLevel {
    if (effectiveDiff >= INFO_TIER_THRESHOLDS[InfoLevel.Research]) {
      return InfoLevel.Research;
    }
    if (effectiveDiff >= INFO_TIER_THRESHOLDS[InfoLevel.Buildings]) {
      return InfoLevel.Buildings;
    }
    if (effectiveDiff >= INFO_TIER_THRESHOLDS[InfoLevel.Defenses]) {
      return InfoLevel.Defenses;
    }
    if (effectiveDiff >= INFO_TIER_THRESHOLDS[InfoLevel.Fleet]) {
      return InfoLevel.Fleet;
    }
    return InfoLevel.Resources;
  }

  // --------------------------------------------------------------------------
  // COUNTER-ESPIONAGE
  // --------------------------------------------------------------------------

  /**
   * Calculate counter-espionage detection chance.
   *
   * Formula: max(0, (defenderSpyTech - attackerSpyTech + 1)) * probeCount * 2
   * Result clamped to [0, 100] percent.
   *
   * Higher defender tech = higher detection chance.
   * More probes = higher detection chance.
   * The "+1" means even with equal tech, there's a base detection chance.
   *
   * @param attackerSpyTech  Attacker's espionage technology level
   * @param defenderSpyTech  Defender's espionage technology level
   * @param probeCount       Number of espionage probes sent
   * @returns Detection chance as percentage (0-100)
   */
  calculateCounterChance(
    attackerSpyTech: number,
    defenderSpyTech: number,
    probeCount: number,
  ): number {
    const techDiff = Math.max(0, defenderSpyTech - attackerSpyTech + 1);
    const chance = techDiff * probeCount * COUNTER_ESPIONAGE_COEFFICIENT;
    return Math.min(100, Math.max(0, chance));
  }

  /**
   * Process counter-espionage: determine if probes are detected and destroyed.
   *
   * If detection succeeds:
   *   - Defender gets a notification with attacker's coordinates
   *   - Probes are destroyed (removed from attacker's fleet)
   *
   * @param attackerSpyTech  Attacker's espionage technology level
   * @param defenderSpyTech  Defender's espionage technology level
   * @param probeCount       Number of probes sent
   * @returns Counter-espionage result
   */
  processCounterEspionage(
    attackerSpyTech: number,
    defenderSpyTech: number,
    probeCount: number,
  ): CounterEspionageResult {
    const detectionChance = this.calculateCounterChance(
      attackerSpyTech,
      defenderSpyTech,
      probeCount,
    );

    // Roll for detection
    const roll = Math.random() * 100;
    const detected = roll < detectionChance;

    // If detected, all probes are destroyed
    const probesDestroyed = detected ? probeCount : 0;
    const probesSurviving = probeCount - probesDestroyed;

    return {
      detected,
      detectionChance,
      probesDestroyed,
      probesSurviving,
    };
  }

  // --------------------------------------------------------------------------
  // REPORT GENERATION
  // --------------------------------------------------------------------------

  /**
   * Generate a complete espionage report.
   *
   * This is the main entry point for the espionage system. Given the
   * attacker's and defender's tech levels and the target planet state,
   * it produces a report with information tiers based on the effective
   * spy level difference, and processes counter-espionage.
   *
   * @param params  Full espionage parameters
   * @returns Complete espionage report
   */
  generateReport(params: EspionageParams): EspionageReport {
    const {
      attackerId,
      attackerName,
      attackerSpyTech,
      attackerCoordinate,
      probeCount,
      defenderId,
      defenderName,
      defenderSpyTech,
      targetPlanet,
      targetDefenses,
      defenderTech,
    } = params;

    // Calculate effective spy level and info tier
    const effectiveDiff = this.calculateEffectiveSpyDiff(
      attackerSpyTech,
      defenderSpyTech,
      probeCount,
    );
    const infoLevel = this.getInfoLevel(effectiveDiff);

    // Process counter-espionage
    const counter = this.processCounterEspionage(
      attackerSpyTech,
      defenderSpyTech,
      probeCount,
    );

    // Build report with available information tiers
    const report: EspionageReport = {
      id: this.generateReportId(),
      timestamp: Date.now(),
      attackerId,
      defenderId,
      targetPlayerName: defenderName,
      targetCoordinate: { ...targetPlanet.coordinate },

      // Information sections
      resources: this.getResources(targetPlanet, infoLevel),
      fleet: this.getFleet(targetPlanet, infoLevel),
      defenses: this.getDefenses(targetDefenses, infoLevel),
      buildings: this.getBuildings(targetPlanet, infoLevel),
      research: this.getResearch(defenderTech, infoLevel),

      // Meta
      counterChance: counter.detectionChance,
      probesLost: counter.probesDestroyed,
      probesSent: probeCount,
      infoLevel,
    };

    return report;
  }

  /**
   * Generate a spy report from raw data (simplified version for use
   * when you don't have the full EspionageParams).
   *
   * @param spyLevel        Attacker's espionage tech level
   * @param counterSpyLevel Defender's espionage tech level
   * @param probeCount      Number of probes sent
   * @param targetPlanet    Target planet state
   * @param targetDefenses  Target planet defenses
   * @param defenderTech    Defender's tech levels
   * @returns EspionageReport
   */
  generateEspionageReport(
    spyLevel: number,
    counterSpyLevel: number,
    probeCount: number,
    targetPlanet: PlanetState,
    targetDefenses: DefenseStructures,
    defenderTech: TechLevels,
  ): EspionageReport {
    return this.generateReport({
      attackerId: 'unknown',
      attackerName: 'Unknown',
      attackerSpyTech: spyLevel,
      attackerCoordinate: { galaxy: 1, system: 1, position: 1 },
      probeCount,
      defenderId: targetPlanet.playerId,
      defenderName: 'Unknown',
      defenderSpyTech: counterSpyLevel,
      targetPlanet,
      targetDefenses,
      defenderTech,
    });
  }

  // --------------------------------------------------------------------------
  // INFORMATION TIER EXTRACTORS
  // --------------------------------------------------------------------------

  /**
   * Extract resource information. Resources are always visible if the
   * report is generated at all.
   */
  private getResources(
    planet: PlanetState,
    _infoLevel: InfoLevel,
  ): Resources {
    // Resources are always visible (InfoLevel.Resources = 0)
    return {
      metal: Math.floor(planet.resources.metal),
      crystal: Math.floor(planet.resources.crystal),
      deuterium: Math.floor(planet.resources.deuterium),
    };
  }

  /**
   * Extract fleet information. Requires InfoLevel >= Fleet.
   */
  private getFleet(
    planet: PlanetState,
    infoLevel: InfoLevel,
  ): Partial<Ships> | null {
    if (infoLevel < InfoLevel.Fleet) return null;

    // Return only ship types that have count > 0
    const fleet: Partial<Ships> = {};
    for (const key of SHIP_KEYS) {
      if (planet.ships[key] > 0) {
        fleet[key] = planet.ships[key];
      }
    }
    return fleet;
  }

  /**
   * Extract defense information. Requires InfoLevel >= Defenses.
   */
  private getDefenses(
    defenses: DefenseStructures,
    infoLevel: InfoLevel,
  ): Partial<DefenseStructures> | null {
    if (infoLevel < InfoLevel.Defenses) return null;

    // Return only defense types that have count > 0
    const result: Partial<DefenseStructures> = {};
    for (const [key, count] of Object.entries(defenses)) {
      if (count > 0) {
        (result as any)[key] = count;
      }
    }
    return result;
  }

  /**
   * Extract building information. Requires InfoLevel >= Buildings.
   */
  private getBuildings(
    planet: PlanetState,
    infoLevel: InfoLevel,
  ): Partial<BuildingLevels> | null {
    if (infoLevel < InfoLevel.Buildings) return null;

    // Return all building levels (even zero levels are meaningful)
    return { ...planet.buildings };
  }

  /**
   * Extract research/tech information. Requires InfoLevel >= Research.
   */
  private getResearch(
    tech: TechLevels,
    infoLevel: InfoLevel,
  ): Partial<TechLevels> | null {
    if (infoLevel < InfoLevel.Research) return null;

    return { ...tech };
  }

  // --------------------------------------------------------------------------
  // NOTIFICATION GENERATION
  // --------------------------------------------------------------------------

  /**
   * Create a counter-espionage notification for the defender.
   * This is sent when the defender detects incoming probes.
   */
  createNotification(
    defenderId: string,
    attackerCoordinate: Coordinate,
    attackerName: string,
    probesDetected: number,
    probesDestroyed: boolean,
  ): EspionageNotification {
    return {
      id: `espnotif-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      timestamp: Date.now(),
      defenderId,
      attackerCoordinate: { ...attackerCoordinate },
      attackerName,
      probesDetected,
      probesDestroyed,
    };
  }

  // --------------------------------------------------------------------------
  // PROBE LOSS APPLICATION
  // --------------------------------------------------------------------------

  /**
   * Apply probe losses to a ship composition.
   * Returns a new Ships object with the destroyed probes removed.
   *
   * @param ships       Current ship composition
   * @param probesLost  Number of probes destroyed
   * @returns Updated ship composition
   */
  applyProbeLoss(ships: Ships, probesLost: number): Ships {
    const updated = { ...ships };
    updated.espionageProbe = Math.max(0, updated.espionageProbe - probesLost);
    return updated;
  }

  // --------------------------------------------------------------------------
  // FULL ESPIONAGE MISSION PROCESSING
  // --------------------------------------------------------------------------

  /**
   * Process a complete espionage mission.
   *
   * This combines report generation, counter-espionage, notification creation,
   * and probe loss application into a single call.
   *
   * @param params  Full espionage parameters
   * @returns Object containing the report, counter-espionage result,
   *          optional defender notification, and updated attacker ships
   */
  processEspionageMission(
    params: EspionageParams & { attackerShips: Ships },
  ): {
    report: EspionageReport;
    counter: CounterEspionageResult;
    notification: EspionageNotification | null;
    updatedAttackerShips: Ships;
  } {
    // Generate the report (includes counter-espionage calculation)
    const report = this.generateReport(params);

    // Process counter-espionage with deterministic result matching the report
    const counter: CounterEspionageResult = {
      detected: report.probesLost > 0,
      detectionChance: report.counterChance,
      probesDestroyed: report.probesLost,
      probesSurviving: params.probeCount - report.probesLost,
    };

    // Create notification for defender if detected
    let notification: EspionageNotification | null = null;
    if (counter.detected) {
      notification = this.createNotification(
        params.defenderId,
        params.attackerCoordinate,
        params.attackerName,
        counter.probesDestroyed,
        true,
      );
    }

    // Apply probe losses to attacker ships
    const updatedAttackerShips = this.applyProbeLoss(
      params.attackerShips,
      counter.probesDestroyed,
    );

    return {
      report,
      counter,
      notification,
      updatedAttackerShips,
    };
  }

  // --------------------------------------------------------------------------
  // REPORT SCORING & ANALYSIS
  // --------------------------------------------------------------------------

  /**
   * Calculate the "attractiveness" score of a target based on an
   * espionage report. Higher score = more valuable target.
   *
   * Score factors:
   *   - Resources on planet (proportional to total)
   *   - Low defense = easier target
   *   - Low fleet = less risk
   *
   * @param report  Espionage report to analyze
   * @returns Numeric attractiveness score (higher = better target)
   */
  calculateTargetScore(report: EspionageReport): number {
    let score = 0;

    // Resource score: total available resources
    if (report.resources) {
      score += report.resources.metal;
      score += report.resources.crystal * 1.5; // Crystal is more valuable
      score += report.resources.deuterium * 3;  // Deuterium is most valuable
    }

    // Fleet penalty: each ship reduces attractiveness
    if (report.fleet) {
      const totalFleet = Object.values(report.fleet).reduce(
        (sum, count) => sum + (count ?? 0),
        0,
      );
      score *= Math.max(0.1, 1 - totalFleet * 0.01);
    }

    // Defense penalty: each defense reduces attractiveness
    if (report.defenses) {
      const totalDefense = Object.values(report.defenses).reduce(
        (sum, count) => sum + (count ?? 0),
        0,
      );
      score *= Math.max(0.1, 1 - totalDefense * 0.02);
    }

    return Math.floor(score);
  }

  /**
   * Determine how many probes to send for optimal information.
   *
   * Given the tech difference, calculates the minimum probes needed
   * to reach a desired info level while keeping detection chance
   * within acceptable limits.
   *
   * @param attackerSpyTech  Attacker's espionage tech level
   * @param defenderSpyTech  Defender's espionage tech level (estimated)
   * @param desiredInfoLevel Desired information tier
   * @param maxDetectionChance Maximum acceptable detection chance (default 50%)
   * @returns Recommended number of probes
   */
  recommendProbeCount(
    attackerSpyTech: number,
    defenderSpyTech: number,
    desiredInfoLevel: InfoLevel = InfoLevel.Defenses,
    maxDetectionChance: number = 50,
  ): number {
    const baseDiff = attackerSpyTech - defenderSpyTech;
    const threshold = INFO_TIER_THRESHOLDS[desiredInfoLevel];

    // If threshold is -Infinity (resources), 1 probe is enough
    if (threshold === -Infinity) return 1;

    // Calculate minimum probes needed for desired info level
    // effectiveDiff = baseDiff + (probes - 1) * 2 >= threshold
    // probes >= (threshold - baseDiff) / 2 + 1
    const minProbes = Math.max(1, Math.ceil((threshold - baseDiff) / 2) + 1);

    // Check detection chance with that many probes
    const detectionWithMin = this.calculateCounterChance(
      attackerSpyTech,
      defenderSpyTech,
      minProbes,
    );

    // If detection chance already exceeds max, find the best we can do
    if (detectionWithMin > maxDetectionChance) {
      // Find maximum probes within detection limit
      // chance = max(0, defenderSpy - attackerSpy + 1) * probes * 2 <= maxDetection
      const techDiff = Math.max(0, defenderSpyTech - attackerSpyTech + 1);
      if (techDiff <= 0) return minProbes;
      const maxProbes = Math.floor(maxDetectionChance / (techDiff * COUNTER_ESPIONAGE_COEFFICIENT));
      return Math.max(1, maxProbes);
    }

    return minProbes;
  }

  // --------------------------------------------------------------------------
  // SERIALIZATION HELPERS
  // --------------------------------------------------------------------------

  /**
   * Serialize an espionage report to a D1-compatible row object.
   */
  serializeForDb(report: EspionageReport): {
    id: string;
    attacker_id: string;
    defender_id: string | null;
    target_galaxy: number;
    target_system: number;
    target_position: number;
    target_player_name: string;
    resources_json: string | null;
    fleet_json: string | null;
    defenses_json: string | null;
    buildings_json: string | null;
    research_json: string | null;
    counter_chance: number;
    probes_lost: number;
    probes_sent: number;
    info_level: number;
    created_at: number;
  } {
    return {
      id: report.id,
      attacker_id: report.attackerId,
      defender_id: report.defenderId,
      target_galaxy: report.targetCoordinate.galaxy,
      target_system: report.targetCoordinate.system,
      target_position: report.targetCoordinate.position,
      target_player_name: report.targetPlayerName,
      resources_json: report.resources ? JSON.stringify(report.resources) : null,
      fleet_json: report.fleet ? JSON.stringify(report.fleet) : null,
      defenses_json: report.defenses ? JSON.stringify(report.defenses) : null,
      buildings_json: report.buildings ? JSON.stringify(report.buildings) : null,
      research_json: report.research ? JSON.stringify(report.research) : null,
      counter_chance: report.counterChance,
      probes_lost: report.probesLost,
      probes_sent: report.probesSent,
      info_level: report.infoLevel,
      created_at: Math.floor(report.timestamp / 1000),
    };
  }

  /**
   * Deserialize a D1 row back into an EspionageReport.
   */
  deserializeFromDb(row: Record<string, any>): EspionageReport {
    return {
      id: row.id as string,
      timestamp: (row.created_at as number) * 1000,
      attackerId: row.attacker_id as string,
      defenderId: row.defender_id as string | null,
      targetPlayerName: row.target_player_name as string,
      targetCoordinate: {
        galaxy: row.target_galaxy as number,
        system: row.target_system as number,
        position: row.target_position as number,
      },
      resources: row.resources_json ? JSON.parse(row.resources_json as string) : null,
      fleet: row.fleet_json ? JSON.parse(row.fleet_json as string) : null,
      defenses: row.defenses_json ? JSON.parse(row.defenses_json as string) : null,
      buildings: row.buildings_json ? JSON.parse(row.buildings_json as string) : null,
      research: row.research_json ? JSON.parse(row.research_json as string) : null,
      counterChance: row.counter_chance as number,
      probesLost: row.probes_lost as number,
      probesSent: row.probes_sent as number,
      infoLevel: row.info_level as InfoLevel,
    };
  }

  // --------------------------------------------------------------------------
  // UTILITY HELPERS
  // --------------------------------------------------------------------------

  /** Generate a unique report ID */
  private generateReportId(): string {
    return `espionage-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  /**
   * Check if the attacker has enough probes for the mission.
   *
   * @param ships       Attacker's current ship composition
   * @param probeCount  Number of probes to send
   * @returns true if sufficient probes available
   */
  hasEnoughProbes(ships: Ships, probeCount: number): boolean {
    return ships.espionageProbe >= probeCount && probeCount > 0;
  }

  /**
   * Validate espionage mission parameters.
   *
   * @returns null if valid, or an error message string
   */
  validateMission(
    probeCount: number,
    attackerShips: Ships,
  ): string | null {
    if (probeCount <= 0) {
      return 'Probe count must be at least 1';
    }

    if (probeCount > 50) {
      return 'Maximum 50 probes per espionage mission';
    }

    if (!this.hasEnoughProbes(attackerShips, probeCount)) {
      return `Not enough espionage probes: need ${probeCount}, have ${attackerShips.espionageProbe}`;
    }

    return null;
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

export const espionageService = new EspionageService();

// ============================================================================
// CONVENIENCE FUNCTION EXPORTS
// ============================================================================

/**
 * Generate an espionage report.
 *
 * @param spyLevel         Attacker's espionage tech level
 * @param counterSpyLevel  Defender's espionage tech level
 * @param probeCount       Number of probes sent
 * @param targetPlanet     Target planet state
 * @param targetDefenses   Target planet defenses
 * @param defenderTech     Defender's tech levels
 * @returns EspionageReport
 */
export function generateEspionageReport(
  spyLevel: number,
  counterSpyLevel: number,
  probeCount: number,
  targetPlanet: PlanetState,
  targetDefenses: DefenseStructures,
  defenderTech: TechLevels,
): EspionageReport {
  return espionageService.generateEspionageReport(
    spyLevel,
    counterSpyLevel,
    probeCount,
    targetPlanet,
    targetDefenses,
    defenderTech,
  );
}

/**
 * Calculate counter-espionage detection chance.
 *
 * @param attackerSpyTech  Attacker's espionage tech level
 * @param defenderSpyTech  Defender's espionage tech level
 * @param probeCount       Number of probes sent
 * @returns Detection chance percentage (0-100)
 */
export function calculateCounterChance(
  attackerSpyTech: number,
  defenderSpyTech: number,
  probeCount: number,
): number {
  return espionageService.calculateCounterChance(
    attackerSpyTech,
    defenderSpyTech,
    probeCount,
  );
}

/**
 * Calculate effective spy level difference.
 *
 * @param attackerSpyTech  Attacker's espionage tech level
 * @param defenderSpyTech  Defender's espionage tech level
 * @param probeCount       Number of probes sent
 * @returns Effective spy level difference
 */
export function calculateEffectiveSpyDiff(
  attackerSpyTech: number,
  defenderSpyTech: number,
  probeCount: number,
): number {
  return espionageService.calculateEffectiveSpyDiff(
    attackerSpyTech,
    defenderSpyTech,
    probeCount,
  );
}
