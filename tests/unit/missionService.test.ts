/**
 * Unit tests for missionService.ts
 * Tests MissionService class: prepareMission, createMission, hasArrived,
 * processMissionArrival, recallMission, getRemainingTime, getProgress,
 * getStatusLabel, getMissionTypeLabel
 */
import { describe, it, expect } from 'vitest';
import { missionService, MissionService } from '../../worker/src/game/services/missionService';
import type { Coordinate, FleetMission, Ships, Resources } from '../../worker/src/game/types';

// ============================================================================
// Helpers
// ============================================================================

function coord(galaxy: number, system: number, position: number): Coordinate {
  return { galaxy, system, position };
}

function emptyShips(): Ships {
  return {
    lightFighter: 0, heavyFighter: 0, cruiser: 0, battleship: 0,
    battlecruiser: 0, bomber: 0, destroyer: 0, deathstar: 0,
    smallCargo: 0, largeCargo: 0, colonyShip: 0, recycler: 0,
    espionageProbe: 0,
  };
}

function emptyResources(): Resources {
  return { metal: 0, crystal: 0, deuterium: 0 };
}

function makeTransitMission(overrides: Partial<FleetMission> = {}): FleetMission {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: 'mission-1',
    playerId: 'player-1',
    planetIdFrom: 'planet-from',
    planetIdTo: 'planet-to',
    sourceCoordinate: coord(1, 1, 8),
    targetCoordinate: coord(1, 2, 8),
    missionType: 'transport',
    missionStatus: 'in_transit',
    timeDeparture: now - 300,
    timeArrival: now - 10,    // already arrived by default
    holdTime: 0,
    speedPercent: 100,
    resources: emptyResources(),
    loot: emptyResources(),
    ships: { ...emptyShips(), smallCargo: 5 },
    fuelConsumed: 10,
    createdAt: Date.now(),
    ...overrides,
  };
}

const NOW = Math.floor(Date.now() / 1000);

// ============================================================================
// prepareMission
// ============================================================================

describe('MissionService.prepareMission', () => {
  const svc = new MissionService();
  const from = coord(1, 1, 8);
  const to = coord(1, 5, 8);

  it('returns canLaunch=false when no ships meet requirements for attack', () => {
    const result = svc.prepareMission(from, to, emptyShips(), 'attack');
    expect(result.canLaunch).toBe(false);
  });

  it('returns canLaunch with fighters for attack', () => {
    const ships = { ...emptyShips(), lightFighter: 10 };
    const result = svc.prepareMission(from, to, ships, 'attack');
    // canLaunch depends on fleetService.meetsRequirements — just check shape
    expect(typeof result.canLaunch).toBe('boolean');
    expect(typeof result.fuelRequired).toBe('number');
    expect(typeof result.duration).toBe('number');
    expect(typeof result.cargoCapacity).toBe('number');
  });

  it('returns fuelRequired >= 0', () => {
    const ships = { ...emptyShips(), smallCargo: 5 };
    const result = svc.prepareMission(from, to, ships, 'transport');
    expect(result.fuelRequired).toBeGreaterThanOrEqual(0);
  });

  it('returns duration >= 0', () => {
    const ships = { ...emptyShips(), smallCargo: 5 };
    const result = svc.prepareMission(from, to, ships, 'transport');
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// createMission
// ============================================================================

describe('MissionService.createMission', () => {
  const svc = new MissionService();
  const from = coord(1, 1, 8);
  const to = coord(1, 5, 8);
  const ships = { ...emptyShips(), smallCargo: 5 };

  it('returns FleetMission with correct id', () => {
    const m = svc.createMission('m-1', 'p1', from, to, 'planet-a', 'planet-b', 'transport', ships, emptyResources());
    expect(m.id).toBe('m-1');
  });

  it('sets playerId correctly', () => {
    const m = svc.createMission('m-2', 'p-xyz', from, to, 'planet-a', 'planet-b', 'transport', ships, emptyResources());
    expect(m.playerId).toBe('p-xyz');
  });

  it('sets missionStatus to in_transit', () => {
    const m = svc.createMission('m-3', 'p1', from, to, 'planet-a', 'planet-b', 'transport', ships, emptyResources());
    expect(m.missionStatus).toBe('in_transit');
  });

  it('sets timeArrival > timeDeparture', () => {
    const farTo = coord(9, 499, 15);
    const m = svc.createMission('m-4', 'p1', from, farTo, 'planet-a', null, 'transport', ships, emptyResources());
    expect(m.timeArrival).toBeGreaterThan(m.timeDeparture);
  });

  it('sets missionType correctly', () => {
    const m = svc.createMission('m-5', 'p1', from, to, 'planet-a', null, 'colonize', { ...ships, colonyShip: 1 }, emptyResources());
    expect(m.missionType).toBe('colonize');
  });
});

// ============================================================================
// hasArrived
// ============================================================================

describe('MissionService.hasArrived', () => {
  const svc = new MissionService();

  it('returns true when timeArrival has passed', () => {
    const m = makeTransitMission({ timeArrival: NOW - 5 });
    expect(svc.hasArrived(m, NOW)).toBe(true);
  });

  it('returns false when timeArrival is in the future', () => {
    const m = makeTransitMission({ timeArrival: NOW + 1000 });
    expect(svc.hasArrived(m, NOW)).toBe(false);
  });

  it('returns false when mission is not in_transit', () => {
    const m = makeTransitMission({ missionStatus: 'arrived', timeArrival: NOW - 5 });
    expect(svc.hasArrived(m, NOW)).toBe(false);
  });

  it('returns true exactly at arrival time', () => {
    const m = makeTransitMission({ timeArrival: NOW });
    expect(svc.hasArrived(m, NOW)).toBe(true);
  });
});

// ============================================================================
// processMissionArrival
// ============================================================================

describe('MissionService.processMissionArrival', () => {
  const svc = new MissionService();

  it('returns success=false for not-yet-arrived mission', () => {
    const m = makeTransitMission({ timeArrival: NOW + 9999 });
    const result = svc.processMissionArrival(m);
    expect(result.success).toBe(false);
  });

  it('transport mission returns success=true on arrival', () => {
    const m = makeTransitMission({ missionType: 'transport', timeArrival: NOW - 10 });
    const result = svc.processMissionArrival(m);
    expect(result.success).toBe(true);
  });

  it('expedition mission returns success=true on arrival', () => {
    const m = makeTransitMission({ missionType: 'expedition', timeArrival: NOW - 10 });
    const result = svc.processMissionArrival(m);
    expect(result.success).toBe(true);
  });

  it('colonize with colony ship returns success=true', () => {
    const m = makeTransitMission({
      missionType: 'colonize',
      ships: { ...emptyShips(), colonyShip: 1 },
      timeArrival: NOW - 10,
    });
    const result = svc.processMissionArrival(m);
    expect(result.success).toBe(true);
  });

  it('colonize without colony ship returns success=false', () => {
    const m = makeTransitMission({
      missionType: 'colonize',
      ships: emptyShips(),
      timeArrival: NOW - 10,
    });
    const result = svc.processMissionArrival(m);
    expect(result.success).toBe(false);
  });

  it('attack without defender data returns success=false', () => {
    const m = makeTransitMission({ missionType: 'attack', timeArrival: NOW - 10 });
    const result = svc.processMissionArrival(m);
    expect(result.success).toBe(false);
  });

  it('attack with defender data returns a battle report', () => {
    const m = makeTransitMission({
      missionType: 'attack',
      ships: { ...emptyShips(), lightFighter: 50 },
      timeArrival: NOW - 10,
    });
    const defenderData = {
      defenseStructures: {},
      resources: emptyResources(),
      owner: 'defender-player',
    };
    const result = svc.processMissionArrival(m, defenderData);
    // battle is run — result has battle property
    expect(result.battle).toBeDefined();
    expect(['attacker', 'defender', 'draw']).toContain(result.battle!.winner);
  });

  it('result always has missionId', () => {
    const m = makeTransitMission({ timeArrival: NOW - 10 });
    const result = svc.processMissionArrival(m);
    expect(result.missionId).toBe('mission-1');
  });
});

// ============================================================================
// recallMission
// ============================================================================

describe('MissionService.recallMission', () => {
  const svc = new MissionService();

  it('returns recalled mission when in_transit', () => {
    const m = makeTransitMission({ timeArrival: NOW + 5000 });
    const recalled = svc.recallMission(m, NOW);
    expect(recalled).not.toBeNull();
    expect(recalled!.id).toContain('-recalled');
  });

  it('returns null when mission is not in_transit', () => {
    const m = makeTransitMission({ missionStatus: 'completed' });
    const recalled = svc.recallMission(m, NOW);
    expect(recalled).toBeNull();
  });

  it('recalled mission has missionType=return', () => {
    const m = makeTransitMission({ timeArrival: NOW + 5000 });
    const recalled = svc.recallMission(m, NOW);
    expect(recalled!.missionType).toBe('return');
  });

  it('recalled mission swaps source and target coordinates', () => {
    const m = makeTransitMission();
    const recalled = svc.recallMission(m, NOW);
    expect(recalled!.sourceCoordinate).toEqual(m.targetCoordinate);
    expect(recalled!.targetCoordinate).toEqual(m.sourceCoordinate);
  });

  it('recalled mission has immediate arrival (timeArrival = nowSeconds)', () => {
    const m = makeTransitMission();
    const recalled = svc.recallMission(m, NOW);
    expect(recalled!.timeArrival).toBe(NOW);
  });
});

// ============================================================================
// getRemainingTime
// ============================================================================

describe('MissionService.getRemainingTime', () => {
  const svc = new MissionService();

  it('returns positive remaining time for in-flight mission', () => {
    const m = makeTransitMission({ timeArrival: NOW + 500 });
    expect(svc.getRemainingTime(m, NOW)).toBe(500);
  });

  it('returns 0 when mission has already arrived', () => {
    const m = makeTransitMission({ timeArrival: NOW - 100 });
    expect(svc.getRemainingTime(m, NOW)).toBe(0);
  });

  it('returns 0 when mission is not in_transit', () => {
    const m = makeTransitMission({ missionStatus: 'completed', timeArrival: NOW + 500 });
    expect(svc.getRemainingTime(m, NOW)).toBe(0);
  });
});

// ============================================================================
// getProgress
// ============================================================================

describe('MissionService.getProgress', () => {
  const svc = new MissionService();

  it('returns 0 at departure', () => {
    const m = makeTransitMission({ timeDeparture: NOW, timeArrival: NOW + 1000 });
    expect(svc.getProgress(m, NOW)).toBe(0);
  });

  it('returns 100 when arrived', () => {
    const m = makeTransitMission({ timeDeparture: NOW - 1000, timeArrival: NOW });
    expect(svc.getProgress(m, NOW)).toBe(100);
  });

  it('returns ~50 at halfway', () => {
    const m = makeTransitMission({ timeDeparture: NOW - 500, timeArrival: NOW + 500 });
    const progress = svc.getProgress(m, NOW);
    expect(progress).toBeCloseTo(50, 0);
  });

  it('returns 100 for arrived status', () => {
    const m = makeTransitMission({ missionStatus: 'arrived' });
    expect(svc.getProgress(m, NOW)).toBe(100);
  });

  it('returns 100 for completed status', () => {
    const m = makeTransitMission({ missionStatus: 'completed' });
    expect(svc.getProgress(m, NOW)).toBe(100);
  });

  it('returns 0 for canceled status', () => {
    const m = makeTransitMission({ missionStatus: 'canceled' });
    expect(svc.getProgress(m, NOW)).toBe(0);
  });

  it('never exceeds 100', () => {
    const m = makeTransitMission({ timeDeparture: NOW - 2000, timeArrival: NOW - 500 });
    expect(svc.getProgress(m, NOW)).toBeLessThanOrEqual(100);
  });
});

// ============================================================================
// getStatusLabel
// ============================================================================

describe('MissionService.getStatusLabel', () => {
  const svc = new MissionService();

  it('returns "In Transit" for in_transit', () => {
    const m = makeTransitMission();
    expect(svc.getStatusLabel(m)).toBe('In Transit');
  });

  it('returns "Arrived" for arrived', () => {
    const m = makeTransitMission({ missionStatus: 'arrived' });
    expect(svc.getStatusLabel(m)).toBe('Arrived');
  });

  it('returns "Completed" for completed', () => {
    const m = makeTransitMission({ missionStatus: 'completed' });
    expect(svc.getStatusLabel(m)).toBe('Completed');
  });

  it('returns "Returning" for returning', () => {
    const m = makeTransitMission({ missionStatus: 'returning' });
    expect(svc.getStatusLabel(m)).toBe('Returning');
  });

  it('returns "Canceled" for canceled', () => {
    const m = makeTransitMission({ missionStatus: 'canceled' });
    expect(svc.getStatusLabel(m)).toBe('Canceled');
  });

  it('returns "Dispatched" for dispatched', () => {
    const m = makeTransitMission({ missionStatus: 'dispatched' });
    expect(svc.getStatusLabel(m)).toBe('Dispatched');
  });
});

// ============================================================================
// getMissionTypeLabel
// ============================================================================

describe('MissionService.getMissionTypeLabel', () => {
  const svc = new MissionService();

  const cases: [string, string][] = [
    ['attack', 'Attack'],
    ['transport', 'Transport'],
    ['deploy', 'Deploy'],
    ['espionage', 'Espionage'],
    ['harvest', 'Harvest'],
    ['colonize', 'Colonize'],
    ['expedition', 'Expedition'],
    ['return', 'Return'],
  ];

  for (const [type, label] of cases) {
    it(`returns "${label}" for "${type}"`, () => {
      expect(svc.getMissionTypeLabel(type as any)).toBe(label);
    });
  }

  it('returns "Unknown" for unrecognized type', () => {
    expect(svc.getMissionTypeLabel('warp_drive' as any)).toBe('Unknown');
  });
});

// ============================================================================
// Singleton
// ============================================================================

describe('missionService singleton', () => {
  it('is an instance of MissionService', () => {
    expect(missionService).toBeInstanceOf(MissionService);
  });

  it('has all required methods', () => {
    expect(typeof missionService.prepareMission).toBe('function');
    expect(typeof missionService.createMission).toBe('function');
    expect(typeof missionService.hasArrived).toBe('function');
    expect(typeof missionService.processMissionArrival).toBe('function');
    expect(typeof missionService.recallMission).toBe('function');
    expect(typeof missionService.getRemainingTime).toBe('function');
    expect(typeof missionService.getProgress).toBe('function');
    expect(typeof missionService.getStatusLabel).toBe('function');
    expect(typeof missionService.getMissionTypeLabel).toBe('function');
  });
});
