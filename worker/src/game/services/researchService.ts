import { Resources, BuildingLevels, PlanetState, TechLevels, ResearchQueueItem } from '../types';

/**
 * Research Service
 * Handles all technology research: definitions, prerequisites, costs, time, effects, queue management.
 *
 * Formulas verified against OGameX and UniEngine reference implementations.
 */

// ============================================================================
// TECH DEFINITION TYPES
// ============================================================================

export interface TechPrerequisite {
  /** Building prerequisite: key is building name, value is minimum level required */
  buildings?: Partial<Record<keyof BuildingLevels, number>>;
  /** Tech prerequisite: key is tech field name, value is minimum level required */
  techs?: Partial<Record<keyof TechLevels, number>>;
  /** Special energy production requirement (Graviton Technology) */
  energyProduction?: number;
}

export interface TechDefinition {
  id: number;
  name: string;
  /** Field name in TechLevels interface */
  key: keyof TechLevels;
  baseCost: Resources;
  /** Exponential cost factor per level (base × factor^(level-1)) */
  factor: number;
  prerequisites: TechPrerequisite;
  description: string;
}

// ============================================================================
// TECH EFFECT TYPES
// ============================================================================

export interface TechEffect {
  techId: number;
  techName: string;
  level: number;
  effects: TechEffectDetail[];
}

export interface TechEffectDetail {
  type:
    | 'weapon_bonus'
    | 'shield_bonus'
    | 'armor_bonus'
    | 'speed_bonus'
    | 'cargo_bonus'
    | 'production_bonus'
    | 'fleet_slots'
    | 'colony_slots'
    | 'special';
  value: number;         // Multiplier or flat value (e.g. 1.5 = +50%, or 3 for +3 slots)
  description: string;
  affectedUnits?: string[];
}

// ============================================================================
// ALL TECHNOLOGY DEFINITIONS
// ============================================================================

export const TECH_DEFINITIONS: Record<number, TechDefinition> = {
  // --------------------------------------------------------------------------
  // Energy Technology (113)
  // --------------------------------------------------------------------------
  113: {
    id: 113,
    name: 'Energy Technology',
    key: 'energyTech',
    baseCost: { metal: 0, crystal: 800, deuterium: 400 },
    factor: 2.0,
    prerequisites: {
      buildings: { researchLab: 1 },
    },
    description:
      'Advances in energy management. Required for most advanced technologies. Improves fusion reactor output.',
  },

  // --------------------------------------------------------------------------
  // Laser Technology (120)
  // --------------------------------------------------------------------------
  120: {
    id: 120,
    name: 'Laser Technology',
    key: 'laserTech',
    baseCost: { metal: 200, crystal: 100, deuterium: 0 },
    factor: 2.0,
    prerequisites: {
      buildings: { researchLab: 1 },
      techs: { energyTech: 2 },
    },
    description: 'Focused light beam weaponry. Prerequisite for Ion and Plasma technologies.',
  },

  // --------------------------------------------------------------------------
  // Ion Technology (121)
  // --------------------------------------------------------------------------
  121: {
    id: 121,
    name: 'Ion Technology',
    key: 'ionTech',
    baseCost: { metal: 1000, crystal: 300, deuterium: 100 },
    factor: 2.0,
    prerequisites: {
      buildings: { researchLab: 1 },
      techs: { laserTech: 5, energyTech: 4 },
    },
    description:
      'Charged particle beam technology. Required for Plasma Technology and advanced ships.',
  },

  // --------------------------------------------------------------------------
  // Hyperspace Technology (114)
  // --------------------------------------------------------------------------
  114: {
    id: 114,
    name: 'Hyperspace Technology',
    key: 'hyperspaceTech',
    baseCost: { metal: 0, crystal: 4000, deuterium: 2000 },
    factor: 2.0,
    prerequisites: {
      buildings: { researchLab: 1 },
      techs: { energyTech: 5, shieldingTech: 5 },
    },
    description:
      'Mastery of hyperspace physics. Improves cargo capacity (+5% per level) and unlocks Hyperspace Drive.',
  },

  // --------------------------------------------------------------------------
  // Plasma Technology (122)
  // --------------------------------------------------------------------------
  122: {
    id: 122,
    name: 'Plasma Technology',
    key: 'plasmaTech',
    baseCost: { metal: 2000, crystal: 4000, deuterium: 1000 },
    factor: 2.0,
    prerequisites: {
      buildings: { researchLab: 1 },
      techs: { energyTech: 8, laserTech: 10, ionTech: 5 },
    },
    description:
      'High-energy plasma weapon systems. Boosts resource production: +1% metal, +0.66% crystal, +0.33% deuterium per level.',
  },

  // --------------------------------------------------------------------------
  // Combustion Drive (115)
  // --------------------------------------------------------------------------
  115: {
    id: 115,
    name: 'Combustion Drive',
    key: 'combustionDrive',
    baseCost: { metal: 400, crystal: 0, deuterium: 600 },
    factor: 2.0,
    prerequisites: {
      buildings: { researchLab: 1 },
      techs: { energyTech: 1 },
    },
    description:
      'Basic propulsion for small vessels. +10% speed per level for: Small Cargo, Light Fighter, Recycler.',
  },

  // --------------------------------------------------------------------------
  // Impulse Drive (117)
  // --------------------------------------------------------------------------
  117: {
    id: 117,
    name: 'Impulse Drive',
    key: 'impulseDrive',
    baseCost: { metal: 2000, crystal: 4000, deuterium: 600 },
    factor: 2.0,
    prerequisites: {
      buildings: { researchLab: 1 },
      techs: { energyTech: 1 },
    },
    description:
      'Advanced ion propulsion. +20% speed per level for: Bomber, Cruiser, Heavy Fighter, Colony Ship.',
  },

  // --------------------------------------------------------------------------
  // Hyperspace Drive (118)
  // --------------------------------------------------------------------------
  118: {
    id: 118,
    name: 'Hyperspace Drive',
    key: 'hyperspaceDrive',
    baseCost: { metal: 10000, crystal: 20000, deuterium: 6000 },
    factor: 2.0,
    prerequisites: {
      buildings: { researchLab: 1 },
      techs: { hyperspaceTech: 3 },
    },
    description:
      '+30% speed per level for capital ships: Battlecruiser, Battleship, Destroyer, Deathstar.',
  },

  // --------------------------------------------------------------------------
  // Espionage Technology (106)
  // --------------------------------------------------------------------------
  106: {
    id: 106,
    name: 'Espionage Technology',
    key: 'espionageTech',
    baseCost: { metal: 200, crystal: 1000, deuterium: 200 },
    factor: 2.0,
    prerequisites: {
      buildings: { researchLab: 3 },
    },
    description:
      'Advanced intelligence-gathering. Higher levels reveal more planet data in espionage reports. Required for Astrophysics.',
  },

  // --------------------------------------------------------------------------
  // Computer Technology (108)
  // --------------------------------------------------------------------------
  108: {
    id: 108,
    name: 'Computer Technology',
    key: 'computerTech',
    baseCost: { metal: 0, crystal: 400, deuterium: 600 },
    factor: 2.0,
    prerequisites: {
      buildings: { researchLab: 1 },
    },
    description: 'Improves fleet command systems. +1 fleet slot per level.',
  },

  // --------------------------------------------------------------------------
  // Astrophysics (124)
  // --------------------------------------------------------------------------
  124: {
    id: 124,
    name: 'Astrophysics',
    key: 'astrophysics',
    baseCost: { metal: 4000, crystal: 8000, deuterium: 4000 },
    factor: 1.75,
    prerequisites: {
      buildings: { researchLab: 1 },
      techs: { espionageTech: 4, impulseDrive: 3 },
    },
    description:
      'Study of celestial bodies. Unlocks additional colony slots every 2 levels (max colonies = floor(astrophysics / 2) + 1).',
  },

  // --------------------------------------------------------------------------
  // Weapon Technology (109)
  // --------------------------------------------------------------------------
  109: {
    id: 109,
    name: 'Weapon Technology',
    key: 'weaponTech',
    baseCost: { metal: 800, crystal: 200, deuterium: 0 },
    factor: 2.0,
    prerequisites: {
      buildings: { researchLab: 4 },
    },
    description: 'Improves attack power of all ships and defenses. +10% attack per level.',
  },

  // --------------------------------------------------------------------------
  // Shielding Technology (110)
  // --------------------------------------------------------------------------
  110: {
    id: 110,
    name: 'Shielding Technology',
    key: 'shieldingTech',
    baseCost: { metal: 200, crystal: 600, deuterium: 0 },
    factor: 2.0,
    prerequisites: {
      buildings: { researchLab: 6 },
      techs: { energyTech: 3 },
    },
    description: 'Advances in defensive shielding. +10% shield strength per level for all units.',
  },

  // --------------------------------------------------------------------------
  // Armor Technology (111)
  // --------------------------------------------------------------------------
  111: {
    id: 111,
    name: 'Armor Technology',
    key: 'armorTech',
    baseCost: { metal: 1000, crystal: 0, deuterium: 0 },
    factor: 2.0,
    prerequisites: {
      buildings: { researchLab: 2 },
    },
    description: 'Stronger hull materials. +10% hull integrity per level for all ships and defenses.',
  },

  // --------------------------------------------------------------------------
  // Graviton Technology (199) — special: requires 300,000 energy production
  // --------------------------------------------------------------------------
  199: {
    id: 199,
    name: 'Graviton Technology',
    key: 'gravitonTech',
    baseCost: { metal: 0, crystal: 0, deuterium: 0 },
    factor: 3.0, // Irrelevant since base is 0 and level 1 is the only meaningful research
    prerequisites: {
      buildings: { researchLab: 12 },
      energyProduction: 300000,
    },
    description:
      'Graviton field generator. Enables construction of the Deathstar. Requires 300,000 energy production to initiate research.',
  },
};

// ============================================================================
// TECH ID ↔ KEY MAPPINGS
// ============================================================================

/** Map from numeric tech ID to TechLevels field key */
export const TECH_ID_TO_KEY: Record<number, keyof TechLevels> = Object.fromEntries(
  Object.values(TECH_DEFINITIONS).map((def) => [def.id, def.key])
) as Record<number, keyof TechLevels>;

/** Map from TechLevels field key to numeric tech ID */
export const TECH_KEY_TO_ID: Record<keyof TechLevels, number> = Object.fromEntries(
  Object.values(TECH_DEFINITIONS).map((def) => [def.key, def.id])
) as Record<keyof TechLevels, number>;

// ============================================================================
// ZERO TECH LEVELS (helper)
// ============================================================================

export function getEmptyTechLevels(): TechLevels {
  return {
    energyTech: 0,
    laserTech: 0,
    ionTech: 0,
    hyperspaceTech: 0,
    plasmaTech: 0,
    combustionDrive: 0,
    impulseDrive: 0,
    hyperspaceDrive: 0,
    espionageTech: 0,
    computerTech: 0,
    astrophysics: 0,
    weaponTech: 0,
    shieldingTech: 0,
    armorTech: 0,
    gravitonTech: 0,
  };
}

// ============================================================================
// COST FORMULA
// cost_at_level = floor(base_cost × factor^(level - 1))
// ============================================================================

/**
 * Calculate the resource cost to research a technology at a given level.
 *
 * Formula: cost = floor(baseCost × factor^(level - 1))
 *
 * @param techId  - Numeric technology ID (e.g. 113 for Energy Technology)
 * @param level   - Target research level (must be >= 1)
 * @returns Resources required, or all-zero Resources if techId is unknown
 */
export function getResearchCost(techId: number, level: number): Resources {
  const def = TECH_DEFINITIONS[techId];
  if (!def) {
    return { metal: 0, crystal: 0, deuterium: 0 };
  }

  if (level <= 0) {
    return { metal: 0, crystal: 0, deuterium: 0 };
  }

  const multiplier = Math.pow(def.factor, level - 1);

  return {
    metal: Math.floor(def.baseCost.metal * multiplier),
    crystal: Math.floor(def.baseCost.crystal * multiplier),
    deuterium: Math.floor(def.baseCost.deuterium * multiplier),
  };
}

// ============================================================================
// RESEARCH TIME FORMULA
// time_seconds = (metalCost + crystalCost) / (1000 × (1 + labLevel) × universeSpeed)
// ============================================================================

/**
 * Calculate how long a technology research takes in seconds.
 *
 * Formula: (metalCost + crystalCost) / (1000 × (1 + researchLabLevel) × universeSpeed)
 *
 * @param techId        - Numeric technology ID
 * @param level         - Target research level
 * @param labLevel      - Research Lab level at the planet conducting the research
 * @param universeSpeed - Universe speed multiplier (1 = normal, 2 = 2x, etc.)
 * @returns Research duration in seconds (minimum 1)
 */
export function getResearchTime(
  techId: number,
  level: number,
  labLevel: number,
  universeSpeed: number = 1
): number {
  const cost = getResearchCost(techId, level);
  const numerator = cost.metal + cost.crystal;

  // Graviton special case: instant (no resource cost at level 1, just energy requirement)
  if (numerator === 0 && cost.deuterium === 0) {
    return 1;
  }

  const denominator = 1000 * (1 + labLevel) * universeSpeed;
  return Math.max(Math.floor(numerator / denominator), 1);
}

// ============================================================================
// PREREQUISITE CHECKING
// ============================================================================

/**
 * Check whether a technology can currently be researched.
 *
 * Validates:
 *  1. The techId exists
 *  2. All building prerequisites are met
 *  3. All technology prerequisites are met
 *  4. Special energy production requirement (Graviton Technology)
 *
 * Note: energy production check for Graviton requires the caller to pass the
 * current total energy production of the planet via the optional parameter.
 *
 * @param techId           - Numeric technology ID
 * @param currentTechs     - Player's current technology levels
 * @param buildings        - Planet's current building levels
 * @param energyProduction - Current total energy production (required for Graviton check)
 * @returns true if all prerequisites are met
 */
export function canResearch(
  techId: number,
  currentTechs: TechLevels,
  buildings: BuildingLevels,
  energyProduction: number = 0
): boolean {
  const def = TECH_DEFINITIONS[techId];
  if (!def) return false;

  const prereqs = def.prerequisites;

  // Check building prerequisites
  if (prereqs.buildings) {
    for (const [buildingKey, requiredLevel] of Object.entries(prereqs.buildings)) {
      const currentLevel = buildings[buildingKey as keyof BuildingLevels] ?? 0;
      if (currentLevel < (requiredLevel as number)) {
        return false;
      }
    }
  }

  // Check tech prerequisites
  if (prereqs.techs) {
    for (const [techKey, requiredLevel] of Object.entries(prereqs.techs)) {
      const currentLevel = currentTechs[techKey as keyof TechLevels] ?? 0;
      if (currentLevel < (requiredLevel as number)) {
        return false;
      }
    }
  }

  // Check special energy production requirement
  if (prereqs.energyProduction !== undefined) {
    if (energyProduction < prereqs.energyProduction) {
      return false;
    }
  }

  return true;
}

// ============================================================================
// TECHNOLOGY EFFECTS
// ============================================================================

/**
 * Get the effect description and multiplier for a technology at a given level.
 *
 * Returns a structured TechEffect object describing all bonuses granted.
 *
 * @param techId - Numeric technology ID
 * @param level  - Current technology level
 * @returns TechEffect with all applicable effect details, or null if unknown techId
 */
export function getTechEffect(techId: number, level: number): TechEffect | null {
  const def = TECH_DEFINITIONS[techId];
  if (!def || level < 0) return null;

  const effects: TechEffectDetail[] = [];

  switch (techId) {
    // Weapon Technology: +10% attack per level (all ships & defenses)
    case 109:
      effects.push({
        type: 'weapon_bonus',
        value: 1 + level * 0.1,
        description: `+${level * 10}% attack power (all ships and defenses)`,
      });
      break;

    // Shielding Technology: +10% shield per level
    case 110:
      effects.push({
        type: 'shield_bonus',
        value: 1 + level * 0.1,
        description: `+${level * 10}% shield strength (all ships and defenses)`,
      });
      break;

    // Armor Technology: +10% hull per level
    case 111:
      effects.push({
        type: 'armor_bonus',
        value: 1 + level * 0.1,
        description: `+${level * 10}% hull integrity (all ships and defenses)`,
      });
      break;

    // Combustion Drive: +10% speed per level (small cargo, light fighter, recycler)
    case 115:
      effects.push({
        type: 'speed_bonus',
        value: 1 + level * 0.1,
        description: `+${level * 10}% speed`,
        affectedUnits: ['smallCargo', 'lightFighter', 'recycler'],
      });
      break;

    // Impulse Drive: +20% speed per level (bomber, cruiser, heavy fighter, colony ship)
    case 117:
      effects.push({
        type: 'speed_bonus',
        value: 1 + level * 0.2,
        description: `+${level * 20}% speed`,
        affectedUnits: ['bomber', 'cruiser', 'heavyFighter', 'colonyShip'],
      });
      break;

    // Hyperspace Drive: +30% speed per level (battlecruiser, battleship, destroyer, deathstar)
    case 118:
      effects.push({
        type: 'speed_bonus',
        value: 1 + level * 0.3,
        description: `+${level * 30}% speed`,
        affectedUnits: ['battlecruiser', 'battleship', 'destroyer', 'deathstar'],
      });
      break;

    // Hyperspace Technology: +5% cargo capacity per level
    case 114:
      effects.push({
        type: 'cargo_bonus',
        value: 1 + level * 0.05,
        description: `+${level * 5}% cargo capacity (all cargo ships)`,
        affectedUnits: ['smallCargo', 'largeCargo', 'recycler', 'colonyShip'],
      });
      break;

    // Plasma Technology: +1% metal, +0.66% crystal, +0.33% deut production per level
    case 122:
      effects.push(
        {
          type: 'production_bonus',
          value: 1 + level * 0.01,
          description: `+${level * 1}% metal mine production`,
          affectedUnits: ['metalMine'],
        },
        {
          type: 'production_bonus',
          value: 1 + level * 0.0066,
          description: `+${(level * 0.66).toFixed(2)}% crystal mine production`,
          affectedUnits: ['crystalMine'],
        },
        {
          type: 'production_bonus',
          value: 1 + level * 0.0033,
          description: `+${(level * 0.33).toFixed(2)}% deuterium synthesizer production`,
          affectedUnits: ['deutSynth'],
        }
      );
      break;

    // Computer Technology: +1 fleet slot per level
    case 108:
      effects.push({
        type: 'fleet_slots',
        value: level,
        description: `${level} fleet slot${level !== 1 ? 's' : ''} (base 1 + Computer Tech level)`,
      });
      break;

    // Astrophysics: colony slots every 2 levels (floor(level / 2) + 1 max colonies)
    case 124: {
      const maxColonies = Math.floor(level / 2) + 1;
      effects.push({
        type: 'colony_slots',
        value: maxColonies,
        description: `${maxColonies} max colony slot${maxColonies !== 1 ? 's' : ''} (unlocks every 2 levels)`,
      });
      break;
    }

    // Energy Technology: no direct combat/speed effect — powers fusion reactor and other tech
    case 113:
      effects.push({
        type: 'special',
        value: level,
        description: `Energy Technology level ${level} — enables higher-tier research; improves fusion reactor output`,
      });
      break;

    // Laser Technology: prerequisite only
    case 120:
      effects.push({
        type: 'special',
        value: level,
        description: `Laser Technology level ${level} — prerequisite for Ion and Plasma technologies`,
      });
      break;

    // Ion Technology: prerequisite only
    case 121:
      effects.push({
        type: 'special',
        value: level,
        description: `Ion Technology level ${level} — prerequisite for Plasma Technology and advanced ships`,
      });
      break;

    // Espionage Technology: report detail
    case 106:
      effects.push({
        type: 'special',
        value: level,
        description: `Espionage Technology level ${level} — increases detail of espionage reports`,
      });
      break;

    // Graviton Technology: enables Deathstar
    case 199:
      effects.push({
        type: 'special',
        value: level,
        description: `Graviton Technology level ${level} — enables Deathstar construction`,
      });
      break;

    default:
      effects.push({
        type: 'special',
        value: level,
        description: `${def.name} level ${level}`,
      });
  }

  return {
    techId,
    techName: def.name,
    level,
    effects,
  };
}

// ============================================================================
// RESEARCH QUEUE OPERATIONS
// ============================================================================

/**
 * Start researching a technology on a planet.
 *
 * Deducts the resource cost from the planet's resources and returns a
 * ResearchQueueItem describing the in-progress research.
 *
 * Rules enforced:
 *  - TechId must be a valid technology
 *  - Prerequisites must be satisfied
 *  - Planet must have sufficient resources
 *  - Research is conducted at the planet's Research Lab
 *
 * @param planetState   - Current state of the planet (resources, buildings, etc.)
 * @param techId        - Technology to research
 * @param currentTechs  - Player's current global technology levels
 * @param universeSpeed - Universe speed multiplier (default 1)
 * @param energyProduction - Current energy production (for Graviton check)
 * @returns ResearchQueueItem on success, or throws an Error describing why it failed
 */
export function startResearch(
  planetState: PlanetState,
  techId: number,
  currentTechs: TechLevels,
  universeSpeed: number = 1,
  energyProduction: number = 0
): ResearchQueueItem {
  const def = TECH_DEFINITIONS[techId];
  if (!def) {
    throw new Error(`Unknown technology ID: ${techId}`);
  }

  // Check prerequisites
  if (!canResearch(techId, currentTechs, planetState.buildings, energyProduction)) {
    throw new Error(`Prerequisites not met for ${def.name}`);
  }

  const targetLevel = (currentTechs[def.key] ?? 0) + 1;
  const cost = getResearchCost(techId, targetLevel);

  // Check resources
  if (
    planetState.resources.metal < cost.metal ||
    planetState.resources.crystal < cost.crystal ||
    planetState.resources.deuterium < cost.deuterium
  ) {
    throw new Error(
      `Insufficient resources for ${def.name} level ${targetLevel}. ` +
        `Need: ${cost.metal}m ${cost.crystal}c ${cost.deuterium}d. ` +
        `Have: ${planetState.resources.metal}m ${planetState.resources.crystal}c ${planetState.resources.deuterium}d`
    );
  }

  // Deduct resources
  planetState.resources.metal -= cost.metal;
  planetState.resources.crystal -= cost.crystal;
  planetState.resources.deuterium -= cost.deuterium;

  const labLevel = planetState.buildings.researchLab ?? 0;
  const durationSeconds = getResearchTime(techId, targetLevel, labLevel, universeSpeed);
  const nowMs = Date.now();

  return {
    techId,
    level: targetLevel,
    timeStart: nowMs,
    timeEnd: nowMs + durationSeconds * 1000,
  };
}

/**
 * Complete a research and return the updated technology levels.
 *
 * Call this when a ResearchQueueItem's timeEnd has been reached.
 * The returned TechLevels object has the researched technology incremented by 1.
 *
 * @param techId       - Technology that was researched
 * @param currentTechs - Player's current global technology levels
 * @returns New TechLevels with the completed technology level incremented
 */
export function completeResearch(techId: number, currentTechs: TechLevels): TechLevels {
  const def = TECH_DEFINITIONS[techId];
  if (!def) {
    throw new Error(`Unknown technology ID: ${techId}`);
  }

  return {
    ...currentTechs,
    [def.key]: (currentTechs[def.key] ?? 0) + 1,
  };
}

/**
 * Cancel an in-progress research.
 *
 * Refunds 100% of the resource cost back to the planet.
 *
 * @param planetState - Planet state to refund resources into (mutated in place)
 * @param queueItem   - The research queue item to cancel
 * @returns The resource amount refunded
 */
export function cancelResearch(planetState: PlanetState, queueItem: ResearchQueueItem): Resources {
  const cost = getResearchCost(queueItem.techId, queueItem.level);

  // 100% refund
  planetState.resources.metal += cost.metal;
  planetState.resources.crystal += cost.crystal;
  planetState.resources.deuterium += cost.deuterium;

  return cost;
}

// ============================================================================
// RESEARCH SERVICE CLASS (convenience wrapper)
// ============================================================================

export class ResearchService {
  /**
   * Get all technology definitions
   */
  getAllTechs(): Record<number, TechDefinition> {
    return TECH_DEFINITIONS;
  }

  /**
   * Get a single technology definition by ID
   */
  getTechDefinition(techId: number): TechDefinition | undefined {
    return TECH_DEFINITIONS[techId];
  }

  /**
   * Check if a technology can be researched
   */
  canResearch(
    techId: number,
    currentTechs: TechLevels,
    buildings: BuildingLevels,
    energyProduction: number = 0
  ): boolean {
    return canResearch(techId, currentTechs, buildings, energyProduction);
  }

  /**
   * Get all technologies the player can currently research
   */
  getAvailableTechs(
    currentTechs: TechLevels,
    buildings: BuildingLevels,
    energyProduction: number = 0
  ): TechDefinition[] {
    return Object.values(TECH_DEFINITIONS).filter((def) =>
      canResearch(def.id, currentTechs, buildings, energyProduction)
    );
  }

  /**
   * Get research cost for a technology at a given level
   */
  getResearchCost(techId: number, level: number): Resources {
    return getResearchCost(techId, level);
  }

  /**
   * Get research time in seconds
   */
  getResearchTime(
    techId: number,
    level: number,
    labLevel: number,
    universeSpeed: number = 1
  ): number {
    return getResearchTime(techId, level, labLevel, universeSpeed);
  }

  /**
   * Get technology effect details at a given level
   */
  getTechEffect(techId: number, level: number): TechEffect | null {
    return getTechEffect(techId, level);
  }

  /**
   * Start researching a technology (validates prerequisites and deducts resources)
   */
  startResearch(
    planetState: PlanetState,
    techId: number,
    currentTechs: TechLevels,
    universeSpeed: number = 1,
    energyProduction: number = 0
  ): ResearchQueueItem {
    return startResearch(planetState, techId, currentTechs, universeSpeed, energyProduction);
  }

  /**
   * Complete a research and return updated tech levels
   */
  completeResearch(techId: number, currentTechs: TechLevels): TechLevels {
    return completeResearch(techId, currentTechs);
  }

  /**
   * Cancel research and refund resources
   */
  cancelResearch(planetState: PlanetState, queueItem: ResearchQueueItem): Resources {
    return cancelResearch(planetState, queueItem);
  }

  /**
   * Get the best (highest-level) Research Lab across all planets.
   *
   * In OGame, research is conducted at the planet with the highest Research Lab level.
   * Pass an array of building levels from all of the player's planets.
   *
   * @param allPlanetBuildings - Array of BuildingLevels from each planet
   * @returns The highest Research Lab level found
   */
  getBestLabLevel(allPlanetBuildings: BuildingLevels[]): number {
    if (allPlanetBuildings.length === 0) return 0;
    return Math.max(...allPlanetBuildings.map((b) => b.researchLab ?? 0));
  }

  /**
   * Get a zero-initialized TechLevels object (new player starting state)
   */
  getEmptyTechLevels(): TechLevels {
    return getEmptyTechLevels();
  }

  /**
   * Get weapon attack multiplier from Weapon Technology
   */
  getWeaponMultiplier(weaponTechLevel: number): number {
    return 1 + weaponTechLevel * 0.1;
  }

  /**
   * Get shield multiplier from Shielding Technology
   */
  getShieldMultiplier(shieldingTechLevel: number): number {
    return 1 + shieldingTechLevel * 0.1;
  }

  /**
   * Get hull/armor multiplier from Armor Technology
   */
  getArmorMultiplier(armorTechLevel: number): number {
    return 1 + armorTechLevel * 0.1;
  }

  /**
   * Get cargo capacity multiplier from Hyperspace Technology
   */
  getCargoMultiplier(hyperspaceTechLevel: number): number {
    return 1 + hyperspaceTechLevel * 0.05;
  }

  /**
   * Get max colonies allowed based on Astrophysics level
   * Formula: floor(astrophysicsLevel / 2) + 1
   */
  getMaxColonies(astrophysicsLevel: number): number {
    if (astrophysicsLevel === 0) return 1; // Home planet only
    return Math.floor(astrophysicsLevel / 2) + 1;
  }

  /**
   * Get total fleet slots from Computer Technology
   * Formula: 1 (base) + computerTechLevel
   */
  getFleetSlots(computerTechLevel: number): number {
    return 1 + computerTechLevel;
  }

  /**
   * Get production bonus multipliers from Plasma Technology
   */
  getPlasmaBonuses(plasmaTechLevel: number): { metal: number; crystal: number; deuterium: number } {
    return {
      metal: 1 + plasmaTechLevel * 0.01,
      crystal: 1 + plasmaTechLevel * 0.0066,
      deuterium: 1 + plasmaTechLevel * 0.0033,
    };
  }

  /**
   * Get speed multiplier for ships affected by Combustion Drive
   * Affects: Small Cargo, Light Fighter, Recycler
   */
  getCombustionDriveMultiplier(combustionDriveLevel: number): number {
    return 1 + combustionDriveLevel * 0.1;
  }

  /**
   * Get speed multiplier for ships affected by Impulse Drive
   * Affects: Bomber, Cruiser, Heavy Fighter, Colony Ship
   */
  getImpulseDriveMultiplier(impulseDriveLevel: number): number {
    return 1 + impulseDriveLevel * 0.2;
  }

  /**
   * Get speed multiplier for ships affected by Hyperspace Drive
   * Affects: Battlecruiser, Battleship, Destroyer, Deathstar
   */
  getHyperspaceDriveMultiplier(hyperspaceDriveLevel: number): number {
    return 1 + hyperspaceDriveLevel * 0.3;
  }

  /**
   * Check if research is complete (timeEnd has passed)
   */
  isResearchComplete(queueItem: ResearchQueueItem, nowMs: number = Date.now()): boolean {
    return nowMs >= queueItem.timeEnd;
  }

  /**
   * Get remaining research time in seconds
   */
  getRemainingTime(queueItem: ResearchQueueItem, nowMs: number = Date.now()): number {
    return Math.max(0, Math.ceil((queueItem.timeEnd - nowMs) / 1000));
  }

  /**
   * Get research progress as a percentage (0-100)
   */
  getProgress(queueItem: ResearchQueueItem, nowMs: number = Date.now()): number {
    const totalMs = queueItem.timeEnd - queueItem.timeStart;
    if (totalMs <= 0) return 100;
    const elapsedMs = nowMs - queueItem.timeStart;
    return Math.min(100, Math.max(0, Math.round((elapsedMs / totalMs) * 100)));
  }
}

/**
 * Singleton instance for global use
 */
export const researchService = new ResearchService();
