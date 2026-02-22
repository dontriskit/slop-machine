import { Coordinate, PlanetState } from '../types';
import {
  UNIVERSE_CONFIG,
  normalizeCoordinate,
  isValidCoordinate,
  calculateDistance,
} from '../formulas';

/**
 * Coordinate Service
 * Handles coordinate validation, lookup, and distance calculations
 */

export class CoordinateService {
  constructor(private numGalaxies: number = 9) {}

  /**
   * Validate if coordinate is valid and within universe bounds
   */
  isValid(coord: Coordinate): boolean {
    return isValidCoordinate(coord, this.numGalaxies);
  }

  /**
   * Normalize coordinate to valid range (applies donut wrapping)
   */
  normalize(coord: Coordinate): Coordinate {
    return normalizeCoordinate(coord, this.numGalaxies);
  }

  /**
   * Convert coordinate to human-readable string: "1:1:1"
   */
  toString(coord: Coordinate): string {
    return `${coord.galaxy}:${coord.system}:${coord.position}`;
  }

  /**
   * Parse coordinate string "1:1:1" to Coordinate object
   */
  fromString(str: string): Coordinate | null {
    const parts = str.split(':');
    if (parts.length !== 3) return null;

    const galaxy = parseInt(parts[0], 10);
    const system = parseInt(parts[1], 10);
    const position = parseInt(parts[2], 10);

    if (isNaN(galaxy) || isNaN(system) || isNaN(position)) return null;

    const coord = { galaxy, system, position };
    return this.isValid(coord) ? coord : null;
  }

  /**
   * Check if coordinate is in same system
   */
  inSameSystem(coord1: Coordinate, coord2: Coordinate): boolean {
    return coord1.galaxy === coord2.galaxy && coord1.system === coord2.system;
  }

  /**
   * Check if coordinate is in same galaxy
   */
  inSameGalaxy(coord1: Coordinate, coord2: Coordinate): boolean {
    return coord1.galaxy === coord2.galaxy;
  }

  /**
   * Check if coordinate is same as another
   */
  isSame(coord1: Coordinate, coord2: Coordinate): boolean {
    return (
      coord1.galaxy === coord2.galaxy &&
      coord1.system === coord2.system &&
      coord1.position === coord2.position
    );
  }

  /**
   * Calculate distance between two coordinates
   * Used for fleet travel time and fuel consumption
   */
  getDistance(from: Coordinate, to: Coordinate): number {
    return calculateDistance(from, to, this.numGalaxies);
  }

  /**
   * Get nearby systems (for scanning/visibility)
   * Returns systems within N systems of target
   */
  getNearbyCoordinates(center: Coordinate, systemRadius: number = 15): Coordinate[] {
    const nearby: Coordinate[] = [];

    if (!this.isValid(center)) return nearby;

    const minSystem = center.system - systemRadius;
    const maxSystem = center.system + systemRadius;

    for (let system = minSystem; system <= maxSystem; system++) {
      // Apply donut wrapping
      let normalizedSystem = system;
      if (normalizedSystem < UNIVERSE_CONFIG.MIN_SYSTEM) {
        normalizedSystem = UNIVERSE_CONFIG.MAX_SYSTEM + (system - UNIVERSE_CONFIG.MIN_SYSTEM + 1);
      } else if (normalizedSystem > UNIVERSE_CONFIG.MAX_SYSTEM) {
        normalizedSystem =
          UNIVERSE_CONFIG.MIN_SYSTEM + (system - UNIVERSE_CONFIG.MAX_SYSTEM - 1);
      }

      for (let pos = UNIVERSE_CONFIG.MIN_POSITION; pos <= UNIVERSE_CONFIG.MAX_POSITION; pos++) {
        nearby.push({
          galaxy: center.galaxy,
          system: normalizedSystem,
          position: pos,
        });
      }
    }

    return nearby;
  }

  /**
   * Validate coordinate uniqueness constraint
   * In OGame, only one planet can occupy each (galaxy, system, position)
   */
  validateUniqueness(coord: Coordinate, existingPlanets: PlanetState[]): boolean {
    return !existingPlanets.some((planet) => this.isSame(planet.coordinate, coord));
  }

  /**
   * Find a valid position in range (used for new player placement)
   * Returns random valid empty position in range, or null if none available
   */
  findFreePosition(
    galaxy: number,
    systemRange: { min: number; max: number },
    positionRange: { min: number; max: number },
    occupiedPositions: Set<string>
  ): Coordinate | null {
    const attempts = 100; // Max attempts to find free position

    for (let i = 0; i < attempts; i++) {
      const system = Math.floor(
        Math.random() * (systemRange.max - systemRange.min + 1) + systemRange.min
      );
      const position = Math.floor(
        Math.random() * (positionRange.max - positionRange.min + 1) + positionRange.min
      );

      const key = `${galaxy}:${system}:${position}`;
      if (!occupiedPositions.has(key)) {
        return { galaxy, system, position };
      }
    }

    return null;
  }

  /**
   * Get all positions in a system as coordinate strings
   */
  getSystemPositions(galaxy: number, system: number): string[] {
    const positions: string[] = [];
    for (let pos = UNIVERSE_CONFIG.MIN_POSITION; pos <= UNIVERSE_CONFIG.MAX_POSITION; pos++) {
      positions.push(this.toString({ galaxy, system, position: pos }));
    }
    return positions;
  }
}

/**
 * Singleton instance for global use
 */
export const coordinateService = new CoordinateService();
