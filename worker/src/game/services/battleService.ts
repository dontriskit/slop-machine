import { Ships, Resources } from '../types';
import { SHIP_SPEEDS, SHIP_FUEL } from '../formulas';
import { DEFENSE_SPECS, DefenseStructures } from '../defenses';

/**
 * Battle Service
 * Handles all combat mechanics: Fleet vs Fleet, Fleet vs Defense
 * Based on OGameX reference implementation
 */

export interface Combatant {
  ships: Ships;
  defenses?: DefenseStructures;
  name: string;
}

export interface BattleRound {
  round: number;
  attacker: BattleState;
  defender: BattleState;
  attackerCasualties: Ships;
  defenderCasualties: Ships;
}

export interface BattleState {
  ships: Ships;
  defenses?: DefenseStructures;
  casualties: Ships;
  defenseCasualties?: DefenseStructures;
  remainingHull: number;
}

export interface BattleReport {
  id: string;
  attackerId: string;
  defenderId: string;
  rounds: BattleRound[];
  winner: 'attacker' | 'defender' | 'draw';
  attackerLosses: Resources;
  defenderLosses: Resources;
  loot: Resources;
  timestamp: number;
}

/**
 * Ship attack power values
 * Damage = (power × count / 100) × random(0.5, 1.5)
 */
const SHIP_ATTACK_POWER: Record<keyof Ships, number> = {
  lightFighter: 50,
  heavyFighter: 150,
  cruiser: 400,
  battleship: 600,
  battlecruiser: 400,
  bomber: 1000,
  destroyer: 2000,
  deathstar: 200000,
  smallCargo: 5, // Minimal
  largeCargo: 5, // Minimal
  colonyShip: 0, // Can't attack
  recycler: 1, // Minimal
  espionageProbe: 0, // Can't attack
};

/**
 * Ship hull/HP values
 */
const SHIP_HULL: Record<keyof Ships, number> = {
  lightFighter: 4000,
  heavyFighter: 10000,
  cruiser: 27000,
  battleship: 60000,
  battlecruiser: 48000,
  bomber: 75000,
  destroyer: 110000,
  deathstar: 9000000,
  smallCargo: 4000,
  largeCargo: 12000,
  colonyShip: 30000,
  recycler: 16000,
  espionageProbe: 1000,
};

export class BattleService {
  /**
   * Run a complete battle simulation
   * Fleet vs Fleet (attacker) vs Defense (defender)
   */
  resolveBattle(
    attacker: Combatant,
    defender: Combatant,
    maxRounds: number = 6
  ): BattleReport {
    const report: BattleReport = {
      id: `battle-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      attackerId: attacker.name,
      defenderId: defender.name,
      rounds: [],
      winner: 'draw',
      attackerLosses: { metal: 0, crystal: 0, deuterium: 0 },
      defenderLosses: { metal: 0, crystal: 0, deuterium: 0 },
      loot: { metal: 0, crystal: 0, deuterium: 0 },
      timestamp: Date.now(),
    };

    const attackerState: BattleState = {
      ships: { ...attacker.ships },
      casualties: this.getEmptyFleet(),
      remainingHull: this.calculateFleetHull(attacker.ships),
    };

    const defenderState: BattleState = {
      ships: { ...defender.ships },
      defenses: defender.defenses ? { ...defender.defenses } : undefined,
      casualties: this.getEmptyFleet(),
      defenseCasualties: defender.defenses
        ? Object.fromEntries(
            Object.entries(defender.defenses).map(([k]) => [k, 0])
          ) as DefenseStructures
        : undefined,
      remainingHull:
        this.calculateFleetHull(defender.ships) +
        (defender.defenses ? this.calculateDefenseHull(defender.defenses) : 0),
    };

    // Run battle rounds (max 6)
    for (let round = 1; round <= maxRounds; round++) {
      // Attacker targets defender fleet + defenses
      const defenderDamage = this.calculateDamage(
        attackerState.ships,
        defenderState.ships,
        defenderState.defenses
      );

      // Apply damage to defender
      const defenderCasualties = this.applyDamage(
        defenderState.ships,
        defenderDamage,
        defenderState.defenses
      );

      defenderState.casualties = this.addFleets(
        defenderState.casualties,
        defenderCasualties.shipCasualties
      );

      if (defenderCasualties.defenseCasualties) {
        defenderState.defenseCasualties = this.addDefenses(
          defenderState.defenseCasualties,
          defenderCasualties.defenseCasualties
        );
      }

      defenderState.ships = defenderCasualties.remainingShips;
      defenderState.remainingHull = defenderCasualties.remainingHull;

      // Defender counter-attacks (defenses + ships)
      const attackerDamage = this.calculateCounterDamage(
        defenderState.ships,
        defenderState.defenses,
        attackerState.ships
      );

      const attackerCasualties = this.applyDamage(attackerState.ships, attackerDamage);
      attackerState.casualties = this.addFleets(
        attackerState.casualties,
        attackerCasualties.shipCasualties
      );
      attackerState.ships = attackerCasualties.remainingShips;
      attackerState.remainingHull = attackerCasualties.remainingHull;

      // Record round
      report.rounds.push({
        round,
        attacker: { ...attackerState },
        defender: { ...defenderState },
        attackerCasualties,
        defenderCasualties: { ...defenderCasualties.shipCasualties },
      });

      // Check if battle is over
      const attackerDefeated = this.getTotalShips(attackerState.ships) === 0;
      const defenderDefeated =
        this.getTotalShips(defenderState.ships) === 0 &&
        this.getTotalDefenses(defenderState.defenses) === 0;

      if (attackerDefeated || defenderDefeated) {
        break;
      }
    }

    // Determine winner
    const attackerShips = this.getTotalShips(attackerState.ships);
    const defenderShips = this.getTotalShips(defenderState.ships);
    const defenderDefenses = this.getTotalDefenses(defenderState.defenses);

    if (attackerShips > 0 && defenderShips === 0 && defenderDefenses === 0) {
      report.winner = 'attacker';
    } else if (attackerShips === 0) {
      report.winner = 'defender';
    }

    // Calculate losses (metal + crystal cost of destroyed units)
    report.attackerLosses = this.calculateFleetCost(attackerState.casualties);
    report.defenderLosses = this.calculateFleetCost(defenderState.casualties);

    // Loot calculation (for attacker victory)
    if (report.winner === 'attacker') {
      // TODO: Implement actual loot from defender's planet resources
      report.loot = { metal: 10000, crystal: 5000, deuterium: 1000 }; // Placeholder
    }

    return report;
  }

  /**
   * Calculate damage from attacking fleet to defending fleet
   * Damage = (ship_power × count / 100) × random(0.5, 1.5)
   */
  private calculateDamage(
    attackingShips: Ships,
    defendingShips: Ships,
    defenses?: DefenseStructures
  ): number {
    let totalDamage = 0;

    for (const [shipKey, count] of Object.entries(attackingShips)) {
      if (count === 0) continue;

      const power = SHIP_ATTACK_POWER[shipKey as keyof Ships] || 0;
      const shipDamage = (power * count) / 100;
      const variance = Math.random() * 1 + 0.5; // 0.5 to 1.5
      totalDamage += shipDamage * variance;
    }

    return Math.floor(totalDamage);
  }

  /**
   * Calculate counter-damage from defending ships and defenses
   */
  private calculateCounterDamage(
    defendingShips: Ships,
    defenses: DefenseStructures | undefined,
    attackingShips: Ships
  ): number {
    let totalDamage = 0;

    // Damage from defending ships
    for (const [shipKey, count] of Object.entries(defendingShips)) {
      if (count === 0) continue;

      const power = SHIP_ATTACK_POWER[shipKey as keyof Ships] || 0;
      const shipDamage = (power * count) / 100;
      const variance = Math.random() * 1 + 0.5;
      totalDamage += shipDamage * variance;
    }

    // Damage from defenses
    if (defenses) {
      for (const [defenseKey, count] of Object.entries(defenses)) {
        if (count === 0) continue;

        const spec = DEFENSE_SPECS[defenseKey as keyof typeof DEFENSE_SPECS];
        if (spec && spec.attack > 0) {
          const defenseDamage = (spec.attack * count) / 100;
          const variance = Math.random() * 1 + 0.5;
          totalDamage += defenseDamage * variance;
        }
      }
    }

    return Math.floor(totalDamage);
  }

  /**
   * Apply damage to fleet, return casualties
   */
  private applyDamage(
    fleet: Ships,
    damage: number,
    defenses?: DefenseStructures
  ): {
    shipCasualties: Ships;
    defenseCasualties?: DefenseStructures;
    remainingShips: Ships;
    remainingHull: number;
  } {
    const casualties = this.getEmptyFleet();
    const remaining = { ...fleet };
    let remainingDamage = damage;
    let remainingHull = 0;

    // Targets ships in order (from weakest to strongest)
    const shipOrder: (keyof Ships)[] = [
      'espionageProbe',
      'recycler',
      'colonyShip',
      'smallCargo',
      'largeCargo',
      'lightFighter',
      'heavyFighter',
      'cruiser',
      'battlecruiser',
      'battleship',
      'bomber',
      'destroyer',
      'deathstar',
    ];

    for (const shipKey of shipOrder) {
      if (remaining[shipKey] === 0 || remainingDamage <= 0) continue;

      const hull = SHIP_HULL[shipKey];
      const shipsDestroyed = Math.floor(remainingDamage / hull);

      if (shipsDestroyed > 0) {
        const destroyed = Math.min(shipsDestroyed, remaining[shipKey]);
        casualties[shipKey] += destroyed;
        remaining[shipKey] -= destroyed;
        remainingDamage -= destroyed * hull;
      }
    }

    // Calculate remaining hull
    remainingHull = this.calculateFleetHull(remaining);

    return {
      shipCasualties: casualties,
      defenseCasualties: undefined,
      remainingShips: remaining,
      remainingHull,
    };
  }

  /**
   * Calculate total fleet hull (HP)
   */
  private calculateFleetHull(ships: Ships): number {
    let totalHull = 0;

    for (const [shipKey, count] of Object.entries(ships)) {
      if (count === 0) continue;

      const hull = SHIP_HULL[shipKey as keyof Ships] || 0;
      totalHull += hull * count;
    }

    return totalHull;
  }

  /**
   * Calculate total defense hull
   */
  private calculateDefenseHull(defenses: DefenseStructures): number {
    let totalHull = 0;

    for (const [defenseKey, count] of Object.entries(defenses)) {
      if (count === 0) continue;

      const spec = DEFENSE_SPECS[defenseKey as keyof typeof DEFENSE_SPECS];
      if (spec) {
        totalHull += spec.hull * count;
      }
    }

    return totalHull;
  }

  /**
   * Get total number of ships
   */
  private getTotalShips(ships: Ships): number {
    return Object.values(ships).reduce((sum, count) => sum + count, 0);
  }

  /**
   * Get total number of defenses
   */
  private getTotalDefenses(defenses: DefenseStructures | undefined): number {
    if (!defenses) return 0;
    return Object.values(defenses).reduce((sum, count) => sum + count, 0);
  }

  /**
   * Add two fleets together
   */
  private addFleets(fleet1: Ships, fleet2: Ships): Ships {
    const result = { ...fleet1 };
    for (const [key, count] of Object.entries(fleet2)) {
      result[key as keyof Ships] += count;
    }
    return result;
  }

  /**
   * Add two defense arrays
   */
  private addDefenses(
    def1: DefenseStructures,
    def2: DefenseStructures
  ): DefenseStructures {
    const result = { ...def1 };
    for (const [key, count] of Object.entries(def2)) {
      result[key as keyof DefenseStructures] += count;
    }
    return result;
  }

  /**
   * Get empty fleet
   */
  private getEmptyFleet(): Ships {
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

  /**
   * Calculate cost of destroyed ships (for battle report)
   */
  private calculateFleetCost(casualties: Ships): Resources {
    // TODO: Use actual ship costs from formulas
    const metalCosts: Record<keyof Ships, number> = {
      lightFighter: 1000,
      heavyFighter: 6000,
      cruiser: 20000,
      battleship: 45000,
      battlecruiser: 30000,
      bomber: 50000,
      destroyer: 60000,
      deathstar: 5000000,
      smallCargo: 2000,
      largeCargo: 6000,
      colonyShip: 10000,
      recycler: 3000,
      espionageProbe: 1000,
    };

    let totalCost = { metal: 0, crystal: 0, deuterium: 0 };

    for (const [shipKey, count] of Object.entries(casualties)) {
      if (count === 0) continue;

      const baseCost = metalCosts[shipKey as keyof Ships] || 1000;
      totalCost.metal += baseCost * count;
      totalCost.crystal += Math.floor(baseCost * 0.5 * count);
      totalCost.deuterium += Math.floor(baseCost * 0.25 * count);
    }

    return totalCost;
  }
}

/**
 * Singleton instance
 */
export const battleService = new BattleService();
