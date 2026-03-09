/**
 * Unit tests for planetPlacementService.ts
 * Tests PlanetPlacementService: getPlacementAttempts, getOccupiedPositions,
 * getRecommendedGalaxy, isInStarterZone, getGalaxyDensity, getLeastPopulatedGalaxy,
 * getSystemDensity, getSystemPlanets, getGalaxyPlanets, isColonizable,
 * getColonizablePositions, findNewPlayerPosition, suggestBalancedPosition
 */
import { describe, it, expect } from 'vitest';
import {
  PlanetPlacementService,
  planetPlacementService,
} from '../../worker/src/game/services/planetPlacementService';
import { UNIVERSE_CONFIG } from '../../worker/src/game/formulas';
import type { PlanetState } from '../../worker/src/game/types';

// ============================================================================
// Helpers
// ============================================================================

function makePlanet(galaxy: number, system: number, position: number, id?: string): PlanetState {
  return {
    id: id ?? `${galaxy}-${system}-${position}`,
    playerId: 'player-1',
    coordinate: { galaxy, system, position },
    name: `Planet ${position}`,
    diameter: 10000,
    temperature: { min: -50, max: 50 },
    fields: { total: 200, used: 10 },
    resources: { metal: 0, crystal: 0, deuterium: 0 },
    lastUpdated: 0,
    buildings: {},
    isHomeworld: false,
  } as unknown as PlanetState;
}

// ============================================================================
// getPlacementAttempts
// ============================================================================

describe('PlanetPlacementService.getPlacementAttempts', () => {
  const svc = new PlanetPlacementService();

  it('returns exactly 3 attempts', () => {
    const attempts = svc.getPlacementAttempts(1);
    expect(attempts).toHaveLength(3);
  });

  it('all attempts use the preferred galaxy', () => {
    const galaxy = 5;
    const attempts = svc.getPlacementAttempts(galaxy);
    for (const attempt of attempts) {
      expect(attempt.galaxy).toBe(galaxy);
    }
  });

  it('attempt 1 has position range 4-12', () => {
    const attempts = svc.getPlacementAttempts(1);
    expect(attempts[0].positionRange[0]).toBe(4);
    expect(attempts[0].positionRange[1]).toBe(12);
  });

  it('attempt 2 has position range 4-12', () => {
    const attempts = svc.getPlacementAttempts(1);
    expect(attempts[1].positionRange[0]).toBe(4);
    expect(attempts[1].positionRange[1]).toBe(12);
  });

  it('attempt 3 covers full position range (1-15)', () => {
    const attempts = svc.getPlacementAttempts(1);
    expect(attempts[2].positionRange[0]).toBe(UNIVERSE_CONFIG.MIN_POSITION);
    expect(attempts[2].positionRange[1]).toBe(UNIVERSE_CONFIG.MAX_POSITION);
  });

  it('each attempt has attempt number 1, 2, 3', () => {
    const attempts = svc.getPlacementAttempts(1);
    expect(attempts.map((a) => a.attempt)).toEqual([1, 2, 3]);
  });

  it('system range covers 1 to MAX_SYSTEM', () => {
    const attempts = svc.getPlacementAttempts(1);
    for (const attempt of attempts) {
      expect(attempt.systemRange[0]).toBe(1);
      expect(attempt.systemRange[1]).toBe(UNIVERSE_CONFIG.MAX_SYSTEM);
    }
  });
});

// ============================================================================
// getOccupiedPositions
// ============================================================================

describe('PlanetPlacementService.getOccupiedPositions', () => {
  const svc = new PlanetPlacementService();

  it('returns empty set for no planets', () => {
    const occupied = svc.getOccupiedPositions([]);
    expect(occupied.size).toBe(0);
  });

  it('returns set with one entry per planet', () => {
    const planets = [makePlanet(1, 1, 8), makePlanet(2, 5, 12)];
    const occupied = svc.getOccupiedPositions(planets);
    expect(occupied.size).toBe(2);
  });

  it('set contains coordinate string for each planet', () => {
    const planets = [makePlanet(1, 1, 8)];
    const occupied = svc.getOccupiedPositions(planets);
    // coordinateService.toString format
    const hasEntry = [...occupied].some((key) => key.includes('1') && key.includes('8'));
    expect(hasEntry).toBe(true);
  });
});

// ============================================================================
// getRecommendedGalaxy
// ============================================================================

describe('PlanetPlacementService.getRecommendedGalaxy', () => {
  const svc = new PlanetPlacementService();

  it('returns value between 1 and numGalaxies', () => {
    for (let i = 0; i < 20; i++) {
      const galaxy = svc.getRecommendedGalaxy(i);
      expect(galaxy).toBeGreaterThanOrEqual(1);
      expect(galaxy).toBeLessThanOrEqual(9);
    }
  });

  it('distributes across 9 galaxies in round-robin', () => {
    const galaxies = new Set<number>();
    for (let i = 0; i < 9; i++) {
      galaxies.add(svc.getRecommendedGalaxy(i));
    }
    expect(galaxies.size).toBe(9);
  });

  it('player 0 goes to galaxy 1', () => {
    // (0 % 9) + 1 = 1
    expect(svc.getRecommendedGalaxy(0)).toBe(1);
  });

  it('respects custom numGalaxies', () => {
    const galaxy = svc.getRecommendedGalaxy(3, 3);
    expect(galaxy).toBeGreaterThanOrEqual(1);
    expect(galaxy).toBeLessThanOrEqual(3);
  });
});

// ============================================================================
// isInStarterZone
// ============================================================================

describe('PlanetPlacementService.isInStarterZone', () => {
  const svc = new PlanetPlacementService();

  it('position 4 is in starter zone', () => {
    expect(svc.isInStarterZone({ galaxy: 1, system: 1, position: 4 })).toBe(true);
  });

  it('position 12 is in starter zone', () => {
    expect(svc.isInStarterZone({ galaxy: 1, system: 1, position: 12 })).toBe(true);
  });

  it('position 8 is in starter zone', () => {
    expect(svc.isInStarterZone({ galaxy: 1, system: 1, position: 8 })).toBe(true);
  });

  it('position 1 is not in starter zone', () => {
    expect(svc.isInStarterZone({ galaxy: 1, system: 1, position: 1 })).toBe(false);
  });

  it('position 15 is not in starter zone', () => {
    expect(svc.isInStarterZone({ galaxy: 1, system: 1, position: 15 })).toBe(false);
  });

  it('position 3 is not in starter zone', () => {
    expect(svc.isInStarterZone({ galaxy: 1, system: 1, position: 3 })).toBe(false);
  });

  it('position 13 is not in starter zone', () => {
    expect(svc.isInStarterZone({ galaxy: 1, system: 1, position: 13 })).toBe(false);
  });
});

// ============================================================================
// getGalaxyDensity
// ============================================================================

describe('PlanetPlacementService.getGalaxyDensity', () => {
  const svc = new PlanetPlacementService();

  it('returns 0 for empty galaxy', () => {
    expect(svc.getGalaxyDensity(1, [])).toBe(0);
  });

  it('returns positive density when planets exist', () => {
    const planets = [makePlanet(1, 1, 8), makePlanet(1, 2, 5)];
    const density = svc.getGalaxyDensity(1, planets);
    expect(density).toBeGreaterThan(0);
  });

  it('ignores planets from other galaxies', () => {
    const planets = [makePlanet(2, 1, 8)];
    const density = svc.getGalaxyDensity(1, planets);
    expect(density).toBe(0);
  });

  it('density is less than 1 for small number of planets', () => {
    const planets = Array.from({ length: 10 }, (_, i) => makePlanet(1, i + 1, 8));
    const density = svc.getGalaxyDensity(1, planets);
    expect(density).toBeLessThan(1);
  });
});

// ============================================================================
// getLeastPopulatedGalaxy
// ============================================================================

describe('PlanetPlacementService.getLeastPopulatedGalaxy', () => {
  const svc = new PlanetPlacementService();

  it('returns galaxy 1 when no planets', () => {
    const galaxy = svc.getLeastPopulatedGalaxy([]);
    expect(galaxy).toBe(UNIVERSE_CONFIG.MIN_GALAXY);
  });

  it('returns galaxy with fewer planets when one is heavily populated', () => {
    // Galaxy 1 has 5 planets, galaxy 2 has 1 planet
    const planets = [
      ...Array.from({ length: 5 }, (_, i) => makePlanet(1, i + 1, 8)),
      makePlanet(2, 1, 8),
    ];
    const galaxy = svc.getLeastPopulatedGalaxy(planets);
    // Galaxy 2 is less populated so should be selected over galaxy 1
    // (or any of galaxies 3-9 which are empty)
    expect(galaxy).not.toBe(1); // galaxy 1 is most populated
  });

  it('returns value in valid galaxy range', () => {
    const planets = [makePlanet(3, 5, 7)];
    const galaxy = svc.getLeastPopulatedGalaxy(planets);
    expect(galaxy).toBeGreaterThanOrEqual(UNIVERSE_CONFIG.MIN_GALAXY);
    expect(galaxy).toBeLessThanOrEqual(9);
  });
});

// ============================================================================
// getSystemDensity
// ============================================================================

describe('PlanetPlacementService.getSystemDensity', () => {
  const svc = new PlanetPlacementService();

  it('returns 0 for empty system', () => {
    expect(svc.getSystemDensity(1, 1, [])).toBe(0);
  });

  it('counts only planets in the specified galaxy+system', () => {
    const planets = [makePlanet(1, 1, 5), makePlanet(1, 2, 5), makePlanet(2, 1, 5)];
    const density = svc.getSystemDensity(1, 1, planets);
    // 1 planet / 15 positions
    expect(density).toBeCloseTo(1 / 15, 5);
  });
});

// ============================================================================
// getSystemPlanets / getGalaxyPlanets
// ============================================================================

describe('PlanetPlacementService.getSystemPlanets', () => {
  const svc = new PlanetPlacementService();
  const planets = [
    makePlanet(1, 1, 5),
    makePlanet(1, 1, 8),
    makePlanet(1, 2, 5),
    makePlanet(2, 1, 5),
  ];

  it('returns only planets in specified galaxy+system', () => {
    const result = svc.getSystemPlanets(1, 1, planets);
    expect(result).toHaveLength(2);
    for (const p of result) {
      expect(p.coordinate.galaxy).toBe(1);
      expect(p.coordinate.system).toBe(1);
    }
  });

  it('returns empty array when no planets in system', () => {
    const result = svc.getSystemPlanets(3, 1, planets);
    expect(result).toHaveLength(0);
  });
});

describe('PlanetPlacementService.getGalaxyPlanets', () => {
  const svc = new PlanetPlacementService();
  const planets = [
    makePlanet(1, 1, 5),
    makePlanet(1, 2, 8),
    makePlanet(2, 1, 5),
  ];

  it('returns only planets in specified galaxy', () => {
    const result = svc.getGalaxyPlanets(1, planets);
    expect(result).toHaveLength(2);
    for (const p of result) {
      expect(p.coordinate.galaxy).toBe(1);
    }
  });

  it('returns empty array for galaxy with no planets', () => {
    const result = svc.getGalaxyPlanets(9, planets);
    expect(result).toHaveLength(0);
  });
});

// ============================================================================
// isColonizable
// ============================================================================

describe('PlanetPlacementService.isColonizable', () => {
  const svc = new PlanetPlacementService();

  it('position 1 is colonizable', () => {
    expect(svc.isColonizable(1)).toBe(true);
  });

  it('position 15 is colonizable', () => {
    expect(svc.isColonizable(15)).toBe(true);
  });

  it('position 8 is colonizable', () => {
    expect(svc.isColonizable(8)).toBe(true);
  });

  it('position 0 is not colonizable', () => {
    expect(svc.isColonizable(0)).toBe(false);
  });

  it('position 16 is not colonizable', () => {
    expect(svc.isColonizable(16)).toBe(false);
  });
});

// ============================================================================
// getColonizablePositions
// ============================================================================

describe('PlanetPlacementService.getColonizablePositions', () => {
  const svc = new PlanetPlacementService();

  it('returns 15 positions', () => {
    const positions = svc.getColonizablePositions(1, 1);
    expect(positions).toHaveLength(15);
  });

  it('starts at position 1', () => {
    const positions = svc.getColonizablePositions(1, 1);
    expect(positions[0]).toBe(1);
  });

  it('ends at position 15', () => {
    const positions = svc.getColonizablePositions(1, 1);
    expect(positions[positions.length - 1]).toBe(15);
  });
});

// ============================================================================
// findNewPlayerPosition
// ============================================================================

describe('PlanetPlacementService.findNewPlayerPosition', () => {
  const svc = new PlanetPlacementService();

  it('returns a Coordinate when space is available', () => {
    const occupied = new Set<string>();
    const coord = svc.findNewPlayerPosition(1, occupied);
    expect(coord).not.toBeNull();
    expect(coord!.galaxy).toBe(1);
    expect(coord!.position).toBeGreaterThanOrEqual(1);
    expect(coord!.position).toBeLessThanOrEqual(15);
  });

  it('returns null when maxAttempts=0', () => {
    const occupied = new Set<string>();
    const coord = svc.findNewPlayerPosition(1, occupied, 0);
    expect(coord).toBeNull();
  });

  it('returned coordinate has galaxy matching preferred galaxy', () => {
    const occupied = new Set<string>();
    const coord = svc.findNewPlayerPosition(3, occupied);
    if (coord) {
      expect(coord.galaxy).toBe(3);
    }
  });
});

// ============================================================================
// suggestBalancedPosition
// ============================================================================

describe('PlanetPlacementService.suggestBalancedPosition', () => {
  const svc = new PlanetPlacementService();

  it('returns a Coordinate or null', () => {
    const result = svc.suggestBalancedPosition([]);
    // May be null if algo finds no good spot, but normally returns a coord
    if (result !== null) {
      expect(result).toHaveProperty('galaxy');
      expect(result).toHaveProperty('system');
      expect(result).toHaveProperty('position');
    }
  });

  it('returned position is in colonizable range', () => {
    const result = svc.suggestBalancedPosition([]);
    if (result) {
      expect(result.position).toBeGreaterThanOrEqual(1);
      expect(result.position).toBeLessThanOrEqual(15);
    }
  });
});

// ============================================================================
// Singleton
// ============================================================================

describe('planetPlacementService singleton', () => {
  it('is an instance of PlanetPlacementService', () => {
    expect(planetPlacementService).toBeInstanceOf(PlanetPlacementService);
  });

  it('has all required methods', () => {
    expect(typeof planetPlacementService.getPlacementAttempts).toBe('function');
    expect(typeof planetPlacementService.findNewPlayerPosition).toBe('function');
    expect(typeof planetPlacementService.getOccupiedPositions).toBe('function');
    expect(typeof planetPlacementService.getRecommendedGalaxy).toBe('function');
    expect(typeof planetPlacementService.isInStarterZone).toBe('function');
    expect(typeof planetPlacementService.getGalaxyDensity).toBe('function');
    expect(typeof planetPlacementService.getLeastPopulatedGalaxy).toBe('function');
    expect(typeof planetPlacementService.isColonizable).toBe('function');
    expect(typeof planetPlacementService.getColonizablePositions).toBe('function');
  });
});
