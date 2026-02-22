/**
 * Defense System for OGame
 * Defensive structures that protect planets from attack.
 *
 * Covers:
 *  - Defense unit definitions (stats, costs, prerequisites)
 *  - Build-time calculations (batch production through shipyard)
 *  - Post-battle repair mechanics (70% restoration chance)
 *  - Anti-Ballistic / Interplanetary Missile mechanics
 *
 * Reference: OGameX + UniEngine canonical formulas.
 */

import { Resources } from './types';

// ============================================================================
// ENUMS & TYPES
// ============================================================================

/**
 * Canonical defense type identifiers.
 * Values mirror the numeric IDs used in the database / OGameX protocol.
 */
export enum DefenseType {
  RocketLauncher = 401,
  LightLaser = 402,
  HeavyLaser = 403,
  GaussCannon = 404,
  IonCannon = 405,
  PlasmaTurret = 406,
  SmallShieldDome = 407,
  LargeShieldDome = 408,
  AntiBallisticMissile = 502,
  InterplanetaryMissile = 503,
}

/** Stats for a single defense unit. */
export interface DefenseStructure {
  id: number;
  name: string;
  hull: number;
  shield: number;
  attack: number;
  metal: number;
  crystal: number;
  deuterium: number;
  /** Rapid fire bonuses this defense has against specific ship types. */
  rapidFire: Partial<Record<string, number>>;
}

/**
 * Planet-level defense counts.
 * Every key is the camelCase identifier for one defense type.
 */
export interface DefenseStructures {
  rocketLauncher: number;
  lightLaser: number;
  heavyLaser: number;
  gaussCannon: number;
  ionCannon: number;
  plasmaTurret: number;
  smallShieldDome: number;
  largeShieldDome: number;
  antiBallisticMissile: number;
  interplanetaryMissile: number;
}

/** Technology / building levels relevant to defense prerequisites. */
export interface TechLevels {
  laserTech: number;
  energyTech: number;
  weaponTech: number;
  shieldingTech: number;
  ionTech: number;
  plasmaTech: number;
  impulseDrive: number;
  missileSilo: number;
}

/** Single prerequisite: a tech/building key and the required minimum level. */
interface Prerequisite {
  tech: keyof TechLevels;
  level: number;
}

// ============================================================================
// DEFENSE STATS
// ============================================================================

/**
 * Combat statistics for every defense type.
 * hull / shield / attack per single unit.
 */
export const DEFENSE_STATS: Record<keyof DefenseStructures, { hull: number; shield: number; attack: number }> = {
  rocketLauncher:        { hull: 2000,   shield: 20,    attack: 80 },
  lightLaser:            { hull: 2000,   shield: 25,    attack: 100 },
  heavyLaser:            { hull: 8000,   shield: 100,   attack: 250 },
  gaussCannon:           { hull: 35000,  shield: 200,   attack: 1100 },
  ionCannon:             { hull: 8000,   shield: 500,   attack: 150 },
  plasmaTurret:          { hull: 100000, shield: 300,   attack: 3000 },
  smallShieldDome:       { hull: 20000,  shield: 2000,  attack: 1 },
  largeShieldDome:       { hull: 100000, shield: 10000, attack: 1 },
  antiBallisticMissile:  { hull: 8000,   shield: 1,     attack: 1 },
  interplanetaryMissile: { hull: 15000,  shield: 1,     attack: 12000 },
};

// ============================================================================
// DEFENSE COSTS
// ============================================================================

/**
 * Resource cost per single defense unit.
 */
export const DEFENSE_COSTS: Record<keyof DefenseStructures, Resources> = {
  rocketLauncher:        { metal: 2000,  crystal: 0,     deuterium: 0 },
  lightLaser:            { metal: 1500,  crystal: 500,   deuterium: 0 },
  heavyLaser:            { metal: 6000,  crystal: 2000,  deuterium: 0 },
  gaussCannon:           { metal: 20000, crystal: 15000, deuterium: 2000 },
  ionCannon:             { metal: 2000,  crystal: 6000,  deuterium: 0 },
  plasmaTurret:          { metal: 50000, crystal: 50000, deuterium: 30000 },
  smallShieldDome:       { metal: 10000, crystal: 10000, deuterium: 0 },
  largeShieldDome:       { metal: 50000, crystal: 50000, deuterium: 0 },
  antiBallisticMissile:  { metal: 8000,  crystal: 2000,  deuterium: 0 },
  interplanetaryMissile: { metal: 12500, crystal: 2500,  deuterium: 10000 },
};

// ============================================================================
// DEFENSE REQUIREMENTS (tech-tree prerequisites)
// ============================================================================

/**
 * Prerequisites for each defense type.
 * Rocket Launcher has no prerequisites (available from the start with a shipyard).
 */
export const DEFENSE_REQUIREMENTS: Record<keyof DefenseStructures, Prerequisite[]> = {
  rocketLauncher:        [],
  lightLaser:            [{ tech: 'laserTech', level: 3 }],
  heavyLaser:            [{ tech: 'laserTech', level: 6 }, { tech: 'energyTech', level: 3 }],
  gaussCannon:           [{ tech: 'weaponTech', level: 3 }, { tech: 'shieldingTech', level: 1 }, { tech: 'energyTech', level: 6 }],
  ionCannon:             [{ tech: 'ionTech', level: 4 }],
  plasmaTurret:          [{ tech: 'plasmaTech', level: 7 }],
  smallShieldDome:       [{ tech: 'shieldingTech', level: 2 }],
  largeShieldDome:       [{ tech: 'shieldingTech', level: 6 }],
  antiBallisticMissile:  [{ tech: 'missileSilo', level: 2 }],
  interplanetaryMissile: [{ tech: 'missileSilo', level: 4 }, { tech: 'impulseDrive', level: 1 }],
};

// ============================================================================
// FULL DEFENSE SPECS (backward-compatible with battleService)
// ============================================================================

/**
 * Complete per-unit specification including cost, combat stats, and rapid fire.
 * The battleService reads `.hull` and `.attack` from this map.
 */
export const DEFENSE_SPECS: Record<keyof DefenseStructures, DefenseStructure> = {
  rocketLauncher: {
    id: DefenseType.RocketLauncher,
    name: 'Rocket Launcher',
    hull: 2000,
    shield: 20,
    attack: 80,
    metal: 2000,
    crystal: 0,
    deuterium: 0,
    rapidFire: {},
  },
  lightLaser: {
    id: DefenseType.LightLaser,
    name: 'Light Laser',
    hull: 2000,
    shield: 25,
    attack: 100,
    metal: 1500,
    crystal: 500,
    deuterium: 0,
    rapidFire: {},
  },
  heavyLaser: {
    id: DefenseType.HeavyLaser,
    name: 'Heavy Laser',
    hull: 8000,
    shield: 100,
    attack: 250,
    metal: 6000,
    crystal: 2000,
    deuterium: 0,
    rapidFire: {},
  },
  gaussCannon: {
    id: DefenseType.GaussCannon,
    name: 'Gauss Cannon',
    hull: 35000,
    shield: 200,
    attack: 1100,
    metal: 20000,
    crystal: 15000,
    deuterium: 2000,
    rapidFire: {},
  },
  ionCannon: {
    id: DefenseType.IonCannon,
    name: 'Ion Cannon',
    hull: 8000,
    shield: 500,
    attack: 150,
    metal: 2000,
    crystal: 6000,
    deuterium: 0,
    rapidFire: {},
  },
  plasmaTurret: {
    id: DefenseType.PlasmaTurret,
    name: 'Plasma Turret',
    hull: 100000,
    shield: 300,
    attack: 3000,
    metal: 50000,
    crystal: 50000,
    deuterium: 30000,
    rapidFire: {},
  },
  smallShieldDome: {
    id: DefenseType.SmallShieldDome,
    name: 'Small Shield Dome',
    hull: 20000,
    shield: 2000,
    attack: 1,
    metal: 10000,
    crystal: 10000,
    deuterium: 0,
    rapidFire: {},
  },
  largeShieldDome: {
    id: DefenseType.LargeShieldDome,
    name: 'Large Shield Dome',
    hull: 100000,
    shield: 10000,
    attack: 1,
    metal: 50000,
    crystal: 50000,
    deuterium: 0,
    rapidFire: {},
  },
  antiBallisticMissile: {
    id: DefenseType.AntiBallisticMissile,
    name: 'Anti-Ballistic Missile',
    hull: 8000,
    shield: 1,
    attack: 1,
    metal: 8000,
    crystal: 2000,
    deuterium: 0,
    rapidFire: {},
  },
  interplanetaryMissile: {
    id: DefenseType.InterplanetaryMissile,
    name: 'Interplanetary Missile',
    hull: 15000,
    shield: 1,
    attack: 12000,
    metal: 12500,
    crystal: 2500,
    deuterium: 10000,
    rapidFire: {},
  },
};

// ============================================================================
// ID / NAME LOOKUP TABLES
// ============================================================================

export const DEFENSE_ID: Record<keyof DefenseStructures, number> = {
  rocketLauncher: DefenseType.RocketLauncher,
  lightLaser: DefenseType.LightLaser,
  heavyLaser: DefenseType.HeavyLaser,
  gaussCannon: DefenseType.GaussCannon,
  ionCannon: DefenseType.IonCannon,
  plasmaTurret: DefenseType.PlasmaTurret,
  smallShieldDome: DefenseType.SmallShieldDome,
  largeShieldDome: DefenseType.LargeShieldDome,
  antiBallisticMissile: DefenseType.AntiBallisticMissile,
  interplanetaryMissile: DefenseType.InterplanetaryMissile,
};

export const DEFENSE_NAME: Record<number, string> = Object.fromEntries(
  Object.entries(DEFENSE_ID).map(([name, id]) => [id, name])
);

/** Set of defense types limited to 1 per planet. */
const UNIQUE_DEFENSES: Set<keyof DefenseStructures> = new Set([
  'smallShieldDome',
  'largeShieldDome',
]);

// ============================================================================
// MISSILE SILO HELPERS
// ============================================================================

/**
 * Total missile storage capacity for a given silo level.
 * Capacity = 10 x silo_level (shared between ABM and IPM).
 */
export function getMissileSiloCapacity(siloLevel: number): number {
  return 10 * siloLevel;
}

/**
 * How many missiles are currently stored (ABM + IPM).
 */
export function getStoredMissileCount(defenses: DefenseStructures): number {
  return defenses.antiBallisticMissile + defenses.interplanetaryMissile;
}

// ============================================================================
// CAN BUILD CHECK
// ============================================================================

/**
 * Determine whether a specific defense type can be built on a planet.
 *
 * Checks:
 *  1. All tech/building prerequisites are met.
 *  2. Shield domes respect the max-1-per-planet rule.
 *  3. Missiles respect silo capacity.
 *
 * @param type          - Key of the defense to build.
 * @param techLevels    - Current technology / building levels.
 * @param currentDefenses - Existing defense counts on the planet.
 * @param count         - Number of units the player wants to queue (default 1).
 * @returns true if the defense can be built.
 */
export function canBuildDefense(
  type: keyof DefenseStructures,
  techLevels: TechLevels,
  currentDefenses: DefenseStructures,
  count: number = 1,
): boolean {
  if (count <= 0) return false;

  // 1. Check tech prerequisites
  const requirements = DEFENSE_REQUIREMENTS[type];
  for (const req of requirements) {
    if ((techLevels[req.tech] ?? 0) < req.level) {
      return false;
    }
  }

  // 2. Shield domes: max 1 per planet
  if (UNIQUE_DEFENSES.has(type)) {
    if (currentDefenses[type] >= 1 || count > 1) {
      return false;
    }
  }

  // 3. Missile silo capacity check for ABM / IPM
  if (type === 'antiBallisticMissile' || type === 'interplanetaryMissile') {
    const capacity = getMissileSiloCapacity(techLevels.missileSilo);
    const stored = getStoredMissileCount(currentDefenses);
    if (stored + count > capacity) {
      return false;
    }
  }

  return true;
}

// ============================================================================
// BUILD TIME
// ============================================================================

/**
 * Calculate the total build time for a batch of defense units.
 *
 * Per-unit time = (metalCost + crystalCost) / (2500 x (1 + shipyard_level) x universe_speed)
 * Total time    = per-unit time x count
 *
 * @param type           - Key of the defense to build.
 * @param count          - Number of units to produce.
 * @param shipyardLevel  - Planet shipyard level.
 * @param universeSpeed  - Universe speed multiplier (e.g. 1, 2, 4).
 * @returns Total build time in seconds (minimum 1).
 */
export function getDefenseBuildTime(
  type: keyof DefenseStructures,
  count: number,
  shipyardLevel: number,
  universeSpeed: number = 1,
): number {
  const cost = DEFENSE_COSTS[type];
  const perUnit =
    (cost.metal + cost.crystal) /
    (2500 * (1 + shipyardLevel) * universeSpeed);

  const totalSeconds = perUnit * count;
  return Math.max(Math.floor(totalSeconds), 1);
}

// ============================================================================
// POST-BATTLE DEFENSE REPAIR
// ============================================================================

/**
 * After a battle, each destroyed defense unit has a 70 % chance to be restored.
 * Shield domes are always restored if the planet survives (handled by the caller
 * passing `planetSurvived = true`).
 *
 * @param destroyedDefenses - Count of each defense type destroyed in battle.
 * @param planetSurvived    - Whether the defending planet survived (default true).
 * @returns An object with the count of units restored per defense type.
 */
export function repairDefenses(
  destroyedDefenses: Partial<DefenseStructures>,
  planetSurvived: boolean = true,
): Partial<DefenseStructures> {
  const restored: Partial<DefenseStructures> = {};

  for (const [key, destroyed] of Object.entries(destroyedDefenses) as [keyof DefenseStructures, number][]) {
    if (!destroyed || destroyed <= 0) continue;

    // Shield domes are always restored if the planet survived
    if (UNIQUE_DEFENSES.has(key) && planetSurvived) {
      restored[key] = destroyed;
      continue;
    }

    // Each unit has an independent 70% chance of being restored
    let restoredCount = 0;
    for (let i = 0; i < destroyed; i++) {
      if (Math.random() < 0.7) {
        restoredCount++;
      }
    }

    if (restoredCount > 0) {
      restored[key] = restoredCount;
    }
  }

  return restored;
}

// ============================================================================
// INTERPLANETARY MISSILE ATTACK
// ============================================================================

/**
 * Default targeting priority when no specific target is chosen.
 * Weakest (lowest hull) defenses are destroyed first.
 */
const IPM_TARGET_PRIORITY: (keyof DefenseStructures)[] = [
  'rocketLauncher',
  'lightLaser',
  'ionCannon',
  'heavyLaser',
  'gaussCannon',
  'plasmaTurret',
  'smallShieldDome',
  'largeShieldDome',
];

/**
 * Simulate an Interplanetary Missile (IPM) attack on a planet.
 *
 * Sequence:
 *  1. Anti-Ballistic Missiles intercept incoming IPMs 1:1 (auto-fire).
 *  2. Remaining IPMs deal damage = 12000 x (1 + 0.1 x weapon_tech_level) each.
 *  3. Damage is applied starting from the targeted defense type (or weakest first).
 *  4. Each defense unit absorbs damage equal to its hull + shield.
 *
 * @param incomingMissiles - Number of Interplanetary Missiles launched.
 * @param abmCount         - Number of Anti-Ballistic Missiles available on the planet.
 * @param defenses         - Current defense counts on the planet.
 * @param weaponTech       - Attacker's weapon technology level.
 * @param targetType       - Specific defense type to target first (optional).
 * @returns The remaining defense counts after the missile strike.
 */
export function calculateMissileAttack(
  incomingMissiles: number,
  abmCount: number,
  defenses: DefenseStructures,
  weaponTech: number,
  targetType?: keyof DefenseStructures,
): DefenseStructures {
  // Clone defenses so we don't mutate the input
  const remaining: DefenseStructures = { ...defenses };

  // 1. ABM interception — each ABM destroys one incoming IPM
  const intercepted = Math.min(abmCount, incomingMissiles);
  remaining.antiBallisticMissile = Math.max(0, remaining.antiBallisticMissile - intercepted);
  const survivingMissiles = incomingMissiles - intercepted;

  if (survivingMissiles <= 0) {
    return remaining;
  }

  // 2. Calculate total damage from surviving missiles
  const damagePerMissile = 12000 * (1 + 0.1 * weaponTech);
  let totalDamage = survivingMissiles * damagePerMissile;

  // 3. Build the targeting order
  //    If a specific target is given, start with that type, then continue
  //    with the default priority (excluding the already-targeted type).
  let targetOrder: (keyof DefenseStructures)[];
  if (targetType && targetType !== 'antiBallisticMissile' && targetType !== 'interplanetaryMissile') {
    targetOrder = [
      targetType,
      ...IPM_TARGET_PRIORITY.filter((t) => t !== targetType),
    ];
  } else {
    targetOrder = [...IPM_TARGET_PRIORITY];
  }

  // 4. Apply damage — each unit absorbs (hull + shield) before being destroyed
  for (const defKey of targetOrder) {
    if (totalDamage <= 0) break;

    const count = remaining[defKey];
    if (!count || count <= 0) continue;

    const stats = DEFENSE_STATS[defKey];
    const hpPerUnit = stats.hull + stats.shield;

    // How many units can the remaining damage destroy?
    const unitsDestroyed = Math.min(count, Math.floor(totalDamage / hpPerUnit));
    remaining[defKey] -= unitsDestroyed;
    totalDamage -= unitsDestroyed * hpPerUnit;

    // If there is leftover damage but not enough to destroy another full unit,
    // the partial damage is lost (consistent with OGameX behavior).
  }

  return remaining;
}

// ============================================================================
// UTILITY / AGGREGATE FUNCTIONS
// ============================================================================

/**
 * Get total offensive power rating for a set of defenses.
 * Useful for battle reports and UI display.
 */
export function getDefensePower(defenses: DefenseStructures): number {
  let totalPower = 0;

  for (const [key, count] of Object.entries(defenses)) {
    const spec = DEFENSE_SPECS[key as keyof DefenseStructures];
    if (spec && count > 0) {
      totalPower += spec.attack * count;
    }
  }

  return totalPower;
}

/**
 * Get total hull points for a set of defenses.
 */
export function getDefenseHull(defenses: DefenseStructures): number {
  let totalHull = 0;

  for (const [key, count] of Object.entries(defenses)) {
    const spec = DEFENSE_SPECS[key as keyof DefenseStructures];
    if (spec && count > 0) {
      totalHull += spec.hull * count;
    }
  }

  return totalHull;
}

/**
 * Get total shield points for a set of defenses.
 */
export function getDefenseShield(defenses: DefenseStructures): number {
  let totalShield = 0;

  for (const [key, count] of Object.entries(defenses)) {
    const stats = DEFENSE_STATS[key as keyof DefenseStructures];
    if (stats && count > 0) {
      totalShield += stats.shield * count;
    }
  }

  return totalShield;
}

/**
 * Calculate total resource cost for a set of defenses.
 */
export function getDefenseCost(defenses: Partial<DefenseStructures>): Resources {
  const total: Resources = { metal: 0, crystal: 0, deuterium: 0 };

  for (const [key, count] of Object.entries(defenses) as [keyof DefenseStructures, number][]) {
    if (!count || count <= 0) continue;
    const cost = DEFENSE_COSTS[key];
    if (cost) {
      total.metal += cost.metal * count;
      total.crystal += cost.crystal * count;
      total.deuterium += cost.deuterium * count;
    }
  }

  return total;
}

/**
 * Create a zeroed-out DefenseStructures object.
 */
export function getEmptyDefenses(): DefenseStructures {
  return {
    rocketLauncher: 0,
    lightLaser: 0,
    heavyLaser: 0,
    gaussCannon: 0,
    ionCannon: 0,
    plasmaTurret: 0,
    smallShieldDome: 0,
    largeShieldDome: 0,
    antiBallisticMissile: 0,
    interplanetaryMissile: 0,
  };
}
