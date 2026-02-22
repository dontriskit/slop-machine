import { Coordinate, PlanetState } from '../types';
import { coordinateService } from './coordinateService';
import { UNIVERSE_CONFIG } from '../formulas';

/**
 * Planet Placement Service
 * Implements UniEngine's 3-attempt new player planet placement algorithm
 * Ensures fair distribution with preference for middle positions (4-12)
 */

export interface PlacementAttempt {
  attempt: number;
  galaxy: number;
  systemRange: [number, number];
  positionRange: [number, number];
  description: string;
}

export class PlanetPlacementService {
  /**
   * Get the 3 placement attempts for new player (following UniEngine logic)
   *
   * Attempt 1: Random position in preferred galaxy, systems 1-499, positions 4-12 (middle slots)
   * Attempt 2: Any position in preferred galaxy, positions 4-12
   * Attempt 3: Any remaining position in preferred galaxy (all positions)
   */
  getPlacementAttempts(preferredGalaxy: number): PlacementAttempt[] {
    return [
      {
        attempt: 1,
        galaxy: preferredGalaxy,
        systemRange: [1, UNIVERSE_CONFIG.MAX_SYSTEM],
        positionRange: [4, 12],
        description: 'Middle slots (4-12) in preferred galaxy',
      },
      {
        attempt: 2,
        galaxy: preferredGalaxy,
        systemRange: [1, UNIVERSE_CONFIG.MAX_SYSTEM],
        positionRange: [4, 12],
        description: 'Middle slots (4-12) across all systems in preferred galaxy',
      },
      {
        attempt: 3,
        galaxy: preferredGalaxy,
        systemRange: [1, UNIVERSE_CONFIG.MAX_SYSTEM],
        positionRange: [UNIVERSE_CONFIG.MIN_POSITION, UNIVERSE_CONFIG.MAX_POSITION],
        description: 'Any remaining slot in preferred galaxy (1-15)',
      },
    ];
  }

  /**
   * Find a free planet position for new player
   * Uses 3-attempt algorithm from UniEngine
   *
   * Attempts:
   * 1. Random position in middle range (4-12)
   * 2. Full system range, still middle positions
   * 3. All positions 1-15
   */
  findNewPlayerPosition(
    preferredGalaxy: number,
    occupiedPositions: Set<string>,
    maxAttempts: number = 3
  ): Coordinate | null {
    const attempts = this.getPlacementAttempts(preferredGalaxy);

    for (const attempt of attempts.slice(0, maxAttempts)) {
      const position = coordinateService.findFreePosition(
        attempt.galaxy,
        { min: attempt.systemRange[0], max: attempt.systemRange[1] },
        { min: attempt.positionRange[0], max: attempt.positionRange[1] },
        occupiedPositions
      );

      if (position) {
        return position;
      }
    }

    return null;
  }

  /**
   * Build set of occupied coordinate strings from planets
   */
  getOccupiedPositions(planets: PlanetState[]): Set<string> {
    const occupied = new Set<string>();

    for (const planet of planets) {
      const key = coordinateService.toString(planet.coordinate);
      occupied.add(key);
    }

    return occupied;
  }

  /**
   * Get recommended galaxy for new player
   * Spreads players across galaxies evenly
   */
  getRecommendedGalaxy(playerCount: number, numGalaxies: number = 9): number {
    // Simple distribution: assign players to galaxies in round-robin
    const galaxy = (playerCount % numGalaxies) + 1;
    return Math.min(Math.max(galaxy, UNIVERSE_CONFIG.MIN_GALAXY), numGalaxies);
  }

  /**
   * Check if position is in "safe zone" for new players
   * New players start in middle positions (4-12) in preferred galaxy
   * This can be used to restrict early attacks on new players
   */
  isInStarterZone(coord: Coordinate): boolean {
    return coord.position >= 4 && coord.position <= 12;
  }

  /**
   * Calculate galaxy density (how many planets per available slot)
   * Useful for balancing load
   */
  getGalaxyDensity(galaxy: number, planets: PlanetState[]): number {
    const planetCount = planets.filter((p) => p.coordinate.galaxy === galaxy).length;
    const maxSlots = UNIVERSE_CONFIG.MAX_SYSTEM * UNIVERSE_CONFIG.MAX_POSITION; // 499 × 15 = 7,485
    return planetCount / maxSlots;
  }

  /**
   * Find least populated galaxy
   */
  getLeastPopulatedGalaxy(planets: PlanetState[], numGalaxies: number = 9): number {
    let minDensity = Infinity;
    let bestGalaxy = UNIVERSE_CONFIG.MIN_GALAXY;

    for (let g = UNIVERSE_CONFIG.MIN_GALAXY; g <= numGalaxies; g++) {
      const density = this.getGalaxyDensity(g, planets);
      if (density < minDensity) {
        minDensity = density;
        bestGalaxy = g;
      }
    }

    return bestGalaxy;
  }

  /**
   * Get system density (planets in system)
   */
  getSystemDensity(galaxy: number, system: number, planets: PlanetState[]): number {
    const planetCount = planets.filter(
      (p) => p.coordinate.galaxy === galaxy && p.coordinate.system === system
    ).length;
    return planetCount / UNIVERSE_CONFIG.MAX_POSITION;
  }

  /**
   * Get planets in a system
   */
  getSystemPlanets(galaxy: number, system: number, planets: PlanetState[]): PlanetState[] {
    return planets.filter((p) => p.coordinate.galaxy === galaxy && p.coordinate.system === system);
  }

  /**
   * Get planets in a galaxy
   */
  getGalaxyPlanets(galaxy: number, planets: PlanetState[]): PlanetState[] {
    return planets.filter((p) => p.coordinate.galaxy === galaxy);
  }

  /**
   * Suggest a balanced position for new player
   * Avoids clustering in same system/area
   */
  suggestBalancedPosition(
    planets: PlanetState[],
    numGalaxies: number = 9,
    minSystemDistance: number = 25
  ): Coordinate | null {
    // Find least populated galaxy
    const galaxy = this.getLeastPopulatedGalaxy(planets, numGalaxies);

    // Get occupied positions in that galaxy
    const occupied = this.getOccupiedPositions(planets);

    // Try to find position far from existing planets
    for (let attempt = 0; attempt < 5; attempt++) {
      const system = Math.floor(Math.random() * UNIVERSE_CONFIG.MAX_SYSTEM) + 1;
      const position = Math.floor(Math.random() * 9) + 4; // Positions 4-12

      const candidate: Coordinate = { galaxy, system, position };
      const key = coordinateService.toString(candidate);

      if (!occupied.has(key)) {
        // Check distance from other planets in system
        const systemPlanets = this.getSystemPlanets(galaxy, system, planets);

        // If system is empty or far enough, use this position
        if (
          systemPlanets.length === 0 ||
          systemPlanets.some((p) => Math.abs(p.coordinate.position - position) >= 3)
        ) {
          return candidate;
        }
      }
    }

    // Fallback to first available position in 3-attempt algorithm
    return this.findNewPlayerPosition(galaxy, occupied);
  }

  /**
   * Validate if position is suitable for colonization
   * (In OGame, positions 1-15 are colonizable, not position 16 which is expedition)
   */
  isColonizable(position: number): boolean {
    return (
      position >= UNIVERSE_CONFIG.MIN_POSITION && position <= UNIVERSE_CONFIG.MAX_POSITION
    );
  }

  /**
   * Get colonizable positions in a system
   */
  getColonizablePositions(galaxy: number, system: number): number[] {
    const positions: number[] = [];
    for (let pos = UNIVERSE_CONFIG.MIN_POSITION; pos <= UNIVERSE_CONFIG.MAX_POSITION; pos++) {
      positions.push(pos);
    }
    return positions;
  }
}

/**
 * Singleton instance for global use
 */
export const planetPlacementService = new PlanetPlacementService();
