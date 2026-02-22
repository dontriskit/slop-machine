/**
 * Defense System for OGame
 * Defensive structures that protect planets from attack
 */

export interface DefenseStructure {
  id: number;
  name: string;
  metal: number;
  crystal: number;
  deuterium: number;
  hull: number; // HP per unit
  armor: number; // Damage reduction (%)
  attack: number; // Attack power (if counter-attacking)
  rapidFire: Partial<Record<keyof DefenseStructures, number>>; // Rapid fire bonuses against ship types
}

export interface DefenseStructures {
  // Shields
  smallShield: number; // 1
  largeShield: number; // 2

  // Cannons
  smallLaser: number; // 3
  bigLaser: number; // 4
  gaussCannon: number; // 5
  ionCannon: number; // 6

  // Missiles
  antiBallisticMissile: number; // 7
  interplanetaryMissile: number; // 8

  // Advanced
  plasmaTurret: number; // 9
}

/**
 * Defense structure definitions
 * From OGameX and UniEngine reference implementations
 */
export const DEFENSE_SPECS: Record<keyof DefenseStructures, DefenseStructure> = {
  smallShield: {
    id: 1,
    name: 'Small Shield Dome',
    metal: 10000,
    crystal: 10000,
    deuterium: 0,
    hull: 20000,
    armor: 50, // 50% damage reduction
    attack: 0,
    rapidFire: {},
  },
  largeShield: {
    id: 2,
    name: 'Large Shield Dome',
    metal: 50000,
    crystal: 50000,
    deuterium: 0,
    hull: 100000,
    armor: 50, // 50% damage reduction
    attack: 0,
    rapidFire: {},
  },
  smallLaser: {
    id: 3,
    name: 'Small Laser',
    metal: 1600,
    crystal: 400,
    deuterium: 0,
    hull: 25,
    armor: 25,
    attack: 50,
    rapidFire: {
      lightFighter: 2, // 2x rapid fire vs light fighters
    },
  },
  bigLaser: {
    id: 4,
    name: 'Big Laser',
    metal: 6000,
    crystal: 2000,
    deuterium: 0,
    hull: 150,
    armor: 25,
    attack: 150,
    rapidFire: {
      heavyFighter: 2,
      cruiser: 2,
    },
  },
  gaussCannon: {
    id: 5,
    name: 'Gauss Cannon',
    metal: 20000,
    crystal: 15000,
    deuterium: 0,
    hull: 200,
    armor: 30,
    attack: 1100,
    rapidFire: {
      smallCargo: 3,
      largeCargo: 2,
      colonyShip: 3,
    },
  },
  ionCannon: {
    id: 6,
    name: 'Ion Cannon',
    metal: 5000,
    crystal: 3000,
    deuterium: 0,
    hull: 150,
    armor: 25,
    attack: 150,
    rapidFire: {
      battleship: 4,
    },
  },
  antiBallisticMissile: {
    id: 7,
    name: 'Anti-Ballistic Missile',
    metal: 8000,
    crystal: 0,
    deuterium: 0,
    hull: 1,
    armor: 0,
    attack: 20,
    rapidFire: {},
  },
  interplanetaryMissile: {
    id: 8,
    name: 'Interplanetary Missile',
    metal: 12500,
    crystal: 2500,
    deuterium: 0,
    hull: 1,
    armor: 0,
    attack: 100,
    rapidFire: {
      bomber: 20, // 20x against bombers
    },
  },
  plasmaTurret: {
    id: 9,
    name: 'Plasma Turret',
    metal: 50000,
    crystal: 50000,
    deuterium: 0,
    hull: 300,
    armor: 50,
    attack: 3000,
    rapidFire: {
      battlecruiser: 3,
      destroyer: 3,
    },
  },
};

export const DEFENSE_ID: Record<keyof DefenseStructures, number> = {
  smallShield: 1,
  largeShield: 2,
  smallLaser: 3,
  bigLaser: 4,
  gaussCannon: 5,
  ionCannon: 6,
  antiBallisticMissile: 7,
  interplanetaryMissile: 8,
  plasmaTurret: 9,
};

export const DEFENSE_NAME: Record<number, string> = Object.fromEntries(
  Object.entries(DEFENSE_ID).map(([name, id]) => [id, name])
);

/**
 * Get defense power rating (for debugging/UI)
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
 * Calculate defense hull capacity
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
