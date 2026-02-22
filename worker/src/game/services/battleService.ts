import { Ships, Resources } from '../types';
import { DefenseStructures, DEFENSE_SPECS, DefenseStructure } from '../defenses';

/**
 * Battle Service — Full OGame Battle Engine
 *
 * Implements the canonical OGame combat simulation:
 *   - 6-round maximum battle loop
 *   - Per-unit targeting with random target selection
 *   - Shield absorption with minimum damage threshold (1% bounce rule)
 *   - Hull integrity tracking with probabilistic destruction (< 70% hull)
 *   - Rapidfire mechanic (repeated shots after each hit)
 *   - Technology bonuses for weapons, shields, and armor
 *   - Debris field generation (30% metal, 30% crystal of destroyed ships)
 *
 * Based on OGameX and UniEngine reference implementations.
 */

// ============================================================================
// TYPES
// ============================================================================

/** Technology levels that affect combat */
export interface TechLevels {
  weaponsTech: number; // +10% attack per level
  shieldTech: number;  // +10% shield per level
  armorTech: number;   // +10% hull per level
}

/** A single unit participating in battle (ship or defense) */
interface BattleUnit {
  type: string;               // Ship or defense key
  isShip: boolean;            // true = ship, false = defense
  baseHull: number;           // Base structural integrity
  baseShield: number;         // Base shield points
  baseAttack: number;         // Base weapon power
  currentHull: number;        // Current hull HP (with tech bonus)
  maxHull: number;            // Maximum hull HP (with tech bonus)
  currentShield: number;      // Current shield HP (with tech bonus)
  maxShield: number;          // Maximum shield HP (with tech bonus)
  attack: number;             // Effective attack power (with tech bonus)
  rapidfire: Record<string, number>; // Rapidfire table: target_type -> rapidfire_amount
  metalCost: number;          // Metal cost of this unit
  crystalCost: number;        // Crystal cost of this unit
  deuteriumCost: number;      // Deuterium cost of this unit
  destroyed: boolean;         // Whether this unit has been destroyed
}

/** Summary of one side's state in a battle round */
export interface BattleRoundSide {
  ships: Ships;
  defenses?: DefenseStructures;
  shipsDestroyed: Ships;
  defensesDestroyed?: DefenseStructures;
}

/** Record of a single battle round */
export interface BattleRound {
  round: number;
  attacker: BattleRoundSide;
  defender: BattleRoundSide;
  attackerCasualties: Ships;
  defenderCasualties: Ships;
}

/** State tracker for each combatant */
export interface BattleState {
  ships: Ships;
  defenses?: DefenseStructures;
  casualties: Ships;
  defenseCasualties?: DefenseStructures;
  remainingHull: number;
}

/** Combatant input to the battle */
export interface Combatant {
  ships: Ships;
  defenses?: DefenseStructures;
  name: string;
}

/** Full battle result */
export interface BattleResult {
  winner: 'attacker' | 'defender' | 'draw';
  rounds: BattleRound[];
  attackerLosses: Resources;
  defenderLosses: Resources;
  debrisField: Resources;
  attackerSurvivors: Ships;
  defenderSurvivors: Ships;
  defenderSurvivingDefenses?: DefenseStructures;
}

/** Full battle report (includes metadata) */
export interface BattleReport {
  id: string;
  attackerId: string;
  defenderId: string;
  rounds: BattleRound[];
  winner: 'attacker' | 'defender' | 'draw';
  attackerLosses: Resources;
  defenderLosses: Resources;
  debrisField: Resources;
  loot: Resources;
  timestamp: number;
}

// ============================================================================
// SHIP SPECIFICATIONS
// ============================================================================

interface ShipSpec {
  hull: number;     // Structural integrity (base HP)
  shield: number;   // Shield points
  attack: number;   // Weapon power
  metal: number;    // Metal cost
  crystal: number;  // Crystal cost
  deuterium: number; // Deuterium cost
  rapidfire: Record<string, number>; // target_type -> rapidfire_amount
}

/**
 * Ship specifications — hull, shield, attack, costs, and rapidfire tables.
 * Values sourced from the OGame wiki / OGameX reference.
 */
const SHIP_SPECS: Record<keyof Ships, ShipSpec> = {
  lightFighter: {
    hull: 4000,
    shield: 10,
    attack: 50,
    metal: 3000,
    crystal: 1000,
    deuterium: 0,
    rapidfire: {
      espionageProbe: 5,
      solarSatellite: 5,
    },
  },
  heavyFighter: {
    hull: 10000,
    shield: 25,
    attack: 150,
    metal: 6000,
    crystal: 4000,
    deuterium: 0,
    rapidfire: {
      espionageProbe: 5,
      solarSatellite: 5,
      smallCargo: 3,
    },
  },
  cruiser: {
    hull: 27000,
    shield: 50,
    attack: 400,
    metal: 20000,
    crystal: 7000,
    deuterium: 2000,
    rapidfire: {
      espionageProbe: 5,
      solarSatellite: 5,
      lightFighter: 6,
      lightLaser: 10,
    },
  },
  battleship: {
    hull: 60000,
    shield: 200,
    attack: 1000,
    metal: 45000,
    crystal: 15000,
    deuterium: 0,
    rapidfire: {
      espionageProbe: 5,
      solarSatellite: 5,
    },
  },
  battlecruiser: {
    hull: 70000,
    shield: 400,
    attack: 700,
    metal: 30000,
    crystal: 40000,
    deuterium: 15000,
    rapidfire: {
      espionageProbe: 5,
      solarSatellite: 5,
      smallCargo: 3,
      largeCargo: 3,
      heavyFighter: 4,
      cruiser: 4,
      battleship: 7,
    },
  },
  bomber: {
    hull: 75000,
    shield: 500,
    attack: 1000,
    metal: 50000,
    crystal: 25000,
    deuterium: 15000,
    rapidfire: {
      espionageProbe: 5,
      solarSatellite: 5,
      lightLaser: 20,
      heavyLaser: 20,
      gaussCannon: 10,
      ionCannon: 10,
      plasmaTurret: 5,
    },
  },
  destroyer: {
    hull: 110000,
    shield: 500,
    attack: 2000,
    metal: 60000,
    crystal: 50000,
    deuterium: 15000,
    rapidfire: {
      espionageProbe: 5,
      solarSatellite: 5,
      lightFighter: 10,
      battlecruiser: 2,
    },
  },
  deathstar: {
    hull: 9000000,
    shield: 50000,
    attack: 200000,
    metal: 5000000,
    crystal: 4000000,
    deuterium: 1000000,
    rapidfire: {
      espionageProbe: 1250,
      solarSatellite: 1250,
      smallCargo: 250,
      largeCargo: 250,
      lightFighter: 200,
      heavyFighter: 100,
      cruiser: 33,
      battleship: 30,
      battlecruiser: 15,
      bomber: 25,
      destroyer: 5,
      colonyShip: 250,
      recycler: 250,
      lightLaser: 200,
      heavyLaser: 100,
      gaussCannon: 50,
      ionCannon: 100,
      plasmaTurret: 10,
      smallShieldDome: 10,
      largeShieldDome: 10,
    },
  },
  smallCargo: {
    hull: 4000,
    shield: 10,
    attack: 5,
    metal: 2000,
    crystal: 2000,
    deuterium: 0,
    rapidfire: {
      espionageProbe: 5,
      solarSatellite: 5,
    },
  },
  largeCargo: {
    hull: 12000,
    shield: 25,
    attack: 5,
    metal: 6000,
    crystal: 6000,
    deuterium: 0,
    rapidfire: {
      espionageProbe: 5,
      solarSatellite: 5,
    },
  },
  colonyShip: {
    hull: 30000,
    shield: 100,
    attack: 50,
    metal: 10000,
    crystal: 20000,
    deuterium: 10000,
    rapidfire: {
      espionageProbe: 5,
      solarSatellite: 5,
    },
  },
  recycler: {
    hull: 16000,
    shield: 10,
    attack: 1,
    metal: 10000,
    crystal: 6000,
    deuterium: 2000,
    rapidfire: {
      espionageProbe: 5,
      solarSatellite: 5,
    },
  },
  espionageProbe: {
    hull: 1000,
    shield: 0,
    attack: 0,
    metal: 0,
    crystal: 1000,
    deuterium: 0,
    rapidfire: {},
  },
};

/**
 * Defense specifications adapted for the battle engine.
 * Shield and hull values per defense unit.
 */
interface DefenseSpec {
  hull: number;
  shield: number;
  attack: number;
  metal: number;
  crystal: number;
  deuterium: number;
  rapidfire: Record<string, number>;
}

const DEFENSE_BATTLE_SPECS: Record<keyof DefenseStructures, DefenseSpec> = {
  rocketLauncher: {
    hull: 2000,
    shield: 20,
    attack: 80,
    metal: 2000,
    crystal: 0,
    deuterium: 0,
    rapidfire: {},
  },
  lightLaser: {
    hull: 2000,
    shield: 25,
    attack: 100,
    metal: 1500,
    crystal: 500,
    deuterium: 0,
    rapidfire: {},
  },
  heavyLaser: {
    hull: 8000,
    shield: 100,
    attack: 250,
    metal: 6000,
    crystal: 2000,
    deuterium: 0,
    rapidfire: {},
  },
  gaussCannon: {
    hull: 35000,
    shield: 200,
    attack: 1100,
    metal: 20000,
    crystal: 15000,
    deuterium: 2000,
    rapidfire: {},
  },
  ionCannon: {
    hull: 8000,
    shield: 500,
    attack: 150,
    metal: 2000,
    crystal: 6000,
    deuterium: 0,
    rapidfire: {},
  },
  plasmaTurret: {
    hull: 100000,
    shield: 300,
    attack: 3000,
    metal: 50000,
    crystal: 50000,
    deuterium: 30000,
    rapidfire: {},
  },
  smallShieldDome: {
    hull: 20000,
    shield: 2000,
    attack: 1,
    metal: 10000,
    crystal: 10000,
    deuterium: 0,
    rapidfire: {},
  },
  largeShieldDome: {
    hull: 100000,
    shield: 10000,
    attack: 1,
    metal: 50000,
    crystal: 50000,
    deuterium: 0,
    rapidfire: {},
  },
  antiBallisticMissile: {
    hull: 8000,
    shield: 1,
    attack: 1,
    metal: 8000,
    crystal: 0,
    deuterium: 2000,
    rapidfire: {},
  },
  interplanetaryMissile: {
    hull: 15000,
    shield: 1,
    attack: 12000,
    metal: 12500,
    crystal: 2500,
    deuterium: 10000,
    rapidfire: {},
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/** Create an empty Ships object with all counts at zero */
function emptyShips(): Ships {
  return {
    lightFighter: 0,
    heavyFighter: 0,
    cruiser: 0,
    battleship: 0,
    battlecruiser: 0,
    bomber: 0,
    destroyer: 0,
    deathstar: 0,
    smallCargo: 0,
    largeCargo: 0,
    colonyShip: 0,
    recycler: 0,
    espionageProbe: 0,
  };
}

/** Create an empty DefenseStructures object with all counts at zero */
function emptyDefenses(): DefenseStructures {
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

/** Get a default TechLevels with all zero */
function defaultTech(): TechLevels {
  return { weaponsTech: 0, shieldTech: 0, armorTech: 0 };
}

/** Count total units in a Ships object */
function totalShips(ships: Ships): number {
  let total = 0;
  for (const key of Object.keys(ships) as (keyof Ships)[]) {
    total += ships[key];
  }
  return total;
}

/** Count total units in a DefenseStructures object */
function totalDefenses(defenses: DefenseStructures | undefined): number {
  if (!defenses) return 0;
  let total = 0;
  for (const key of Object.keys(defenses) as (keyof DefenseStructures)[]) {
    total += defenses[key];
  }
  return total;
}

/** Pick a random integer in [0, max) */
function randomInt(max: number): number {
  return Math.floor(Math.random() * max);
}

// ============================================================================
// UNIT CREATION
// ============================================================================

/**
 * Expand a Ships object into individual BattleUnit instances,
 * applying technology bonuses.
 */
function createShipUnits(ships: Ships, tech: TechLevels): BattleUnit[] {
  const units: BattleUnit[] = [];
  const weaponMult = 1 + tech.weaponsTech * 0.1;
  const shieldMult = 1 + tech.shieldTech * 0.1;
  const armorMult = 1 + tech.armorTech * 0.1;

  for (const key of Object.keys(ships) as (keyof Ships)[]) {
    const count = ships[key];
    if (count <= 0) continue;

    const spec = SHIP_SPECS[key];
    const maxHull = Math.floor(spec.hull * armorMult);
    const maxShield = Math.floor(spec.shield * shieldMult);
    const attack = Math.floor(spec.attack * weaponMult);

    for (let i = 0; i < count; i++) {
      units.push({
        type: key,
        isShip: true,
        baseHull: spec.hull,
        baseShield: spec.shield,
        baseAttack: spec.attack,
        currentHull: maxHull,
        maxHull,
        currentShield: maxShield,
        maxShield,
        attack,
        rapidfire: { ...spec.rapidfire },
        metalCost: spec.metal,
        crystalCost: spec.crystal,
        deuteriumCost: spec.deuterium,
        destroyed: false,
      });
    }
  }

  return units;
}

/**
 * Expand a DefenseStructures object into individual BattleUnit instances,
 * applying technology bonuses.
 */
function createDefenseUnits(
  defenses: DefenseStructures | undefined,
  tech: TechLevels
): BattleUnit[] {
  if (!defenses) return [];

  const units: BattleUnit[] = [];
  const weaponMult = 1 + tech.weaponsTech * 0.1;
  const shieldMult = 1 + tech.shieldTech * 0.1;
  const armorMult = 1 + tech.armorTech * 0.1;

  for (const key of Object.keys(defenses) as (keyof DefenseStructures)[]) {
    const count = defenses[key];
    if (count <= 0) continue;

    const spec = DEFENSE_BATTLE_SPECS[key];
    if (!spec) continue;

    const maxHull = Math.floor(spec.hull * armorMult);
    const maxShield = Math.floor(spec.shield * shieldMult);
    const attack = Math.floor(spec.attack * weaponMult);

    for (let i = 0; i < count; i++) {
      units.push({
        type: key,
        isShip: false,
        baseHull: spec.hull,
        baseShield: spec.shield,
        baseAttack: spec.attack,
        currentHull: maxHull,
        maxHull,
        currentShield: maxShield,
        maxShield,
        attack,
        rapidfire: { ...spec.rapidfire },
        metalCost: spec.metal,
        crystalCost: spec.crystal,
        deuteriumCost: spec.deuterium,
        destroyed: false,
      });
    }
  }

  return units;
}

// ============================================================================
// CORE COMBAT MECHANICS
// ============================================================================

/**
 * One unit fires at one target.
 *
 * Damage flow:
 *   1. If damage < 1% of target's max shield, the shot bounces (no effect).
 *   2. Shield absorbs damage first. Overflow goes to hull.
 *   3. Shield cannot go negative; hull absorbs the rest.
 */
function fireAtTarget(attacker: BattleUnit, target: BattleUnit): void {
  if (attacker.destroyed || target.destroyed) return;
  if (attacker.attack <= 0) return;

  const damage = attacker.attack;

  // Minimum damage threshold: if damage < 1% of target max shield, it bounces
  const minThreshold = 0.01 * target.maxShield;
  if (damage < minThreshold) {
    return; // Shot bounces off shields
  }

  // Shield absorption
  if (target.currentShield >= damage) {
    // Shields fully absorb the damage
    target.currentShield -= damage;
  } else {
    // Shields absorb what they can, overflow damages hull
    const overflow = damage - target.currentShield;
    target.currentShield = 0;
    target.currentHull -= overflow;
  }

  // Hull can't go below 0
  if (target.currentHull < 0) {
    target.currentHull = 0;
  }
}

/**
 * Check whether a unit should explode based on hull integrity.
 *
 * When hull_percentage < 0.7:
 *   explosion_chance = (1 - hull_percentage)
 *   Random roll in [0, 1) < explosion_chance => destroyed
 *
 * When hull <= 0, always destroyed.
 */
function checkDestruction(unit: BattleUnit): void {
  if (unit.destroyed) return;

  if (unit.currentHull <= 0) {
    unit.destroyed = true;
    return;
  }

  const hullPercentage = unit.currentHull / unit.maxHull;

  if (hullPercentage < 0.7) {
    // Explosion chance = (1 - hull_percentage)
    // E.g., at 30% hull -> 70% explosion chance
    const explosionChance = 1 - hullPercentage;
    if (Math.random() < explosionChance) {
      unit.destroyed = true;
    }
  }
}

/**
 * Handle rapidfire: after a hit, the attacker may fire again at another
 * random target from the same pool.
 *
 * Chance to fire again = 1 - (1 / rapidfire_amount)
 * E.g., rapidfire 6 = 83.3% chance to fire again each time.
 *
 * This is recursive (or iterative): each successful refire picks a new
 * random target and may refire again.
 */
function processRapidfire(
  attacker: BattleUnit,
  targets: BattleUnit[],
  aliveIndices: number[]
): void {
  if (attacker.destroyed || attacker.attack <= 0) return;
  if (aliveIndices.length === 0) return;

  // Check if we have rapidfire against the last target (caller handles first shot)
  // We need to check rapidfire for each successive shot
  let keepFiring = true;

  while (keepFiring && aliveIndices.length > 0) {
    // Pick a random alive target
    const idx = aliveIndices[randomInt(aliveIndices.length)];
    const target = targets[idx];

    // Check rapidfire against this target's type
    const rfAmount = attacker.rapidfire[target.type];
    if (!rfAmount || rfAmount <= 1) {
      // No rapidfire against this target type, stop
      break;
    }

    // Chance to fire again: 1 - 1/rfAmount
    const refireChance = 1 - 1 / rfAmount;
    if (Math.random() >= refireChance) {
      // Failed the refire roll, stop
      break;
    }

    // Fire at this target
    fireAtTarget(attacker, target);

    // After firing, we continue the rapidfire loop (may fire again)
    // Note: we don't remove destroyed units from aliveIndices mid-rapidfire
    // as per OGame behavior; destruction check happens at end of round
  }
}

/**
 * One side fires at the other side.
 * Each unit on the attacking side picks a random target on the defending side,
 * fires, then processes rapidfire.
 */
function sideFiresAtSide(
  attackers: BattleUnit[],
  defenders: BattleUnit[]
): void {
  // Build alive indices for defenders
  const aliveDefenderIndices: number[] = [];
  for (let i = 0; i < defenders.length; i++) {
    if (!defenders[i].destroyed) {
      aliveDefenderIndices.push(i);
    }
  }

  if (aliveDefenderIndices.length === 0) return;

  for (const attacker of attackers) {
    if (attacker.destroyed || attacker.attack <= 0) continue;
    if (aliveDefenderIndices.length === 0) break;

    // Pick a random alive defender
    const targetIdx = aliveDefenderIndices[randomInt(aliveDefenderIndices.length)];
    const target = defenders[targetIdx];

    // Fire primary shot
    fireAtTarget(attacker, target);

    // Process rapidfire (may fire additional shots at random targets)
    processRapidfire(attacker, defenders, aliveDefenderIndices);
  }
}

/**
 * Regenerate shields for all alive units to their maximum value.
 * In OGame, shields fully regenerate at the end of each round.
 */
function regenerateShields(units: BattleUnit[]): void {
  for (const unit of units) {
    if (!unit.destroyed) {
      unit.currentShield = unit.maxShield;
    }
  }
}

/**
 * Check destruction for all units and remove destroyed ones.
 * Returns the count of units destroyed this round, by type.
 */
function processDestructions(units: BattleUnit[]): Record<string, number> {
  const destroyed: Record<string, number> = {};

  for (const unit of units) {
    if (unit.destroyed) continue;
    checkDestruction(unit);
    if (unit.destroyed) {
      destroyed[unit.type] = (destroyed[unit.type] || 0) + 1;
    }
  }

  return destroyed;
}

/**
 * Count alive units by type, returning a Ships or DefenseStructures-shaped object.
 */
function countAliveShips(units: BattleUnit[]): Ships {
  const ships = emptyShips();
  for (const unit of units) {
    if (!unit.destroyed && unit.isShip) {
      ships[unit.type as keyof Ships] += 1;
    }
  }
  return ships;
}

function countAliveDefenses(units: BattleUnit[]): DefenseStructures {
  const defs = emptyDefenses();
  for (const unit of units) {
    if (!unit.destroyed && !unit.isShip) {
      if (unit.type in defs) {
        defs[unit.type as keyof DefenseStructures] += 1;
      }
    }
  }
  return defs;
}

/**
 * Count destroyed units by type, split into Ships and DefenseStructures.
 */
function countDestroyedShips(
  destroyed: Record<string, number>
): Ships {
  const ships = emptyShips();
  for (const [type, count] of Object.entries(destroyed)) {
    if (type in ships) {
      ships[type as keyof Ships] += count;
    }
  }
  return ships;
}

function countDestroyedDefenses(
  destroyed: Record<string, number>
): DefenseStructures {
  const defs = emptyDefenses();
  for (const [type, count] of Object.entries(destroyed)) {
    if (type in defs) {
      defs[type as keyof DefenseStructures] += count;
    }
  }
  return defs;
}

/** Sum all alive units (ships + defenses) */
function countAliveUnits(units: BattleUnit[]): number {
  let count = 0;
  for (const unit of units) {
    if (!unit.destroyed) count++;
  }
  return count;
}

// ============================================================================
// LOSS & DEBRIS CALCULATION
// ============================================================================

/**
 * Calculate total resource cost of all destroyed units.
 */
function calculateLosses(
  originalUnits: BattleUnit[],
  survivingUnits: BattleUnit[]
): Resources {
  // All units that are destroyed contribute their full cost
  let metal = 0;
  let crystal = 0;
  let deuterium = 0;

  for (const unit of originalUnits) {
    if (unit.destroyed) {
      metal += unit.metalCost;
      crystal += unit.crystalCost;
      deuterium += unit.deuteriumCost;
    }
  }

  return { metal, crystal, deuterium };
}

/**
 * Calculate debris field from destroyed ships.
 * Only ships contribute to debris, not defenses.
 * Debris = 30% metal + 30% crystal of destroyed ships. 0% deuterium.
 */
function calculateDebrisField(
  attackerUnits: BattleUnit[],
  defenderUnits: BattleUnit[]
): Resources {
  let metalCost = 0;
  let crystalCost = 0;

  // Destroyed attacker ships
  for (const unit of attackerUnits) {
    if (unit.destroyed && unit.isShip) {
      metalCost += unit.metalCost;
      crystalCost += unit.crystalCost;
    }
  }

  // Destroyed defender ships (not defenses!)
  for (const unit of defenderUnits) {
    if (unit.destroyed && unit.isShip) {
      metalCost += unit.metalCost;
      crystalCost += unit.crystalCost;
    }
  }

  return {
    metal: Math.floor(metalCost * 0.3),
    crystal: Math.floor(crystalCost * 0.3),
    deuterium: 0,
  };
}

// ============================================================================
// MAIN BATTLE SIMULATION
// ============================================================================

/**
 * Simulate a complete battle between an attacker fleet and a defender
 * (fleet + defenses), applying technology bonuses.
 *
 * @param attackerFleet    - Attacker's ship composition
 * @param defenderFleet    - Defender's ship composition
 * @param defenderDefenses - Defender's planetary defenses (optional)
 * @param attackerTech     - Attacker's technology levels
 * @param defenderTech     - Defender's technology levels
 * @returns BattleResult with full round-by-round data
 */
export function simulateBattle(
  attackerFleet: Ships,
  defenderFleet: Ships,
  defenderDefenses?: DefenseStructures,
  attackerTech: TechLevels = defaultTech(),
  defenderTech: TechLevels = defaultTech()
): BattleResult {
  const MAX_ROUNDS = 6;

  // Create individual unit instances for per-unit combat
  const attackerUnits = createShipUnits(attackerFleet, attackerTech);
  const defenderShipUnits = createShipUnits(defenderFleet, defenderTech);
  const defenderDefenseUnits = createDefenseUnits(defenderDefenses, defenderTech);
  const defenderUnits = [...defenderShipUnits, ...defenderDefenseUnits];

  const rounds: BattleRound[] = [];

  // Track cumulative casualties
  const totalAttackerCasualties = emptyShips();
  const totalDefenderShipCasualties = emptyShips();
  const totalDefenderDefenseCasualties = emptyDefenses();

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    // Phase 1: All attacker units fire at random defender units
    sideFiresAtSide(attackerUnits, defenderUnits);

    // Phase 2: All defender units fire at random attacker units
    sideFiresAtSide(defenderUnits, attackerUnits);

    // Phase 3: Check destructions (hull < 70% -> probabilistic explosion)
    const attackerDestroyed = processDestructions(attackerUnits);
    const defenderDestroyed = processDestructions(defenderUnits);

    // Phase 4: Regenerate shields for surviving units
    regenerateShields(attackerUnits);
    regenerateShields(defenderUnits);

    // Record this round's casualties
    const roundAttackerCasualties = countDestroyedShips(attackerDestroyed);
    const roundDefenderShipCasualties = countDestroyedShips(defenderDestroyed);
    const roundDefenderDefenseCasualties = countDestroyedDefenses(defenderDestroyed);

    // Accumulate
    for (const key of Object.keys(totalAttackerCasualties) as (keyof Ships)[]) {
      totalAttackerCasualties[key] += roundAttackerCasualties[key];
    }
    for (const key of Object.keys(totalDefenderShipCasualties) as (keyof Ships)[]) {
      totalDefenderShipCasualties[key] += roundDefenderShipCasualties[key];
    }
    for (const key of Object.keys(totalDefenderDefenseCasualties) as (keyof DefenseStructures)[]) {
      totalDefenderDefenseCasualties[key] += roundDefenderDefenseCasualties[key];
    }

    // Snapshot current state
    const attackerAliveShips = countAliveShips(attackerUnits);
    const defenderAliveShips = countAliveShips(defenderUnits);
    const defenderAliveDefenses = countAliveDefenses(defenderUnits);

    rounds.push({
      round,
      attacker: {
        ships: attackerAliveShips,
        shipsDestroyed: { ...totalAttackerCasualties },
      },
      defender: {
        ships: defenderAliveShips,
        defenses: defenderAliveDefenses,
        shipsDestroyed: { ...totalDefenderShipCasualties },
        defensesDestroyed: { ...totalDefenderDefenseCasualties },
      },
      attackerCasualties: roundAttackerCasualties,
      defenderCasualties: roundDefenderShipCasualties,
    });

    // Check if battle is over
    const attackerAlive = countAliveUnits(attackerUnits);
    const defenderAlive = countAliveUnits(defenderUnits);

    if (attackerAlive === 0 || defenderAlive === 0) {
      break;
    }
  }

  // Determine winner
  const attackerAlive = countAliveUnits(attackerUnits);
  const defenderAlive = countAliveUnits(defenderUnits);

  let winner: 'attacker' | 'defender' | 'draw';
  if (attackerAlive > 0 && defenderAlive === 0) {
    winner = 'attacker';
  } else if (attackerAlive === 0 && defenderAlive > 0) {
    winner = 'defender';
  } else if (attackerAlive === 0 && defenderAlive === 0) {
    winner = 'draw';
  } else {
    // Both sides still have units after 6 rounds
    winner = 'draw';
  }

  // Calculate losses
  const attackerLosses = calculateLosses(attackerUnits, attackerUnits);
  const defenderLosses = calculateLosses(defenderUnits, defenderUnits);

  // Calculate debris field (30% metal, 30% crystal of destroyed ships only)
  const debrisField = calculateDebrisField(attackerUnits, defenderUnits);

  // Final survivors
  const attackerSurvivors = countAliveShips(attackerUnits);
  const defenderSurvivors = countAliveShips(defenderUnits);
  const defenderSurvivingDefenses = countAliveDefenses(defenderUnits);

  return {
    winner,
    rounds,
    attackerLosses,
    defenderLosses,
    debrisField,
    attackerSurvivors,
    defenderSurvivors,
    defenderSurvivingDefenses,
  };
}

// ============================================================================
// BATTLE SERVICE CLASS (wraps simulateBattle for backward compatibility)
// ============================================================================

export class BattleService {
  /**
   * Run a complete battle simulation.
   * Fleet vs Fleet (attacker) vs Defense (defender).
   */
  resolveBattle(
    attacker: Combatant,
    defender: Combatant,
    attackerTech: TechLevels = defaultTech(),
    defenderTech: TechLevels = defaultTech()
  ): BattleReport {
    const result = simulateBattle(
      attacker.ships,
      defender.ships,
      defender.defenses,
      attackerTech,
      defenderTech
    );

    const report: BattleReport = {
      id: `battle-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      attackerId: attacker.name,
      defenderId: defender.name,
      rounds: result.rounds,
      winner: result.winner,
      attackerLosses: result.attackerLosses,
      defenderLosses: result.defenderLosses,
      debrisField: result.debrisField,
      loot: { metal: 0, crystal: 0, deuterium: 0 }, // Loot calculated separately based on planet resources
      timestamp: Date.now(),
    };

    return report;
  }
}

/**
 * Singleton instance
 */
export const battleService = new BattleService();
