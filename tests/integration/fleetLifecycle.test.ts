/**
 * Integration: Fleet Lifecycle — Dispatch → Travel → Arrival → Combat → Return
 * Issue #89
 *
 * Tests the complete fleet lifecycle using fleetService directly.
 * No HTTP/DO required — pure service-layer integration.
 */
import { describe, test, expect } from 'vitest';
import { fleetService } from '../../worker/src/game/services/fleetService';
import type { Ships, Resources, Coordinate, PlanetState } from '../../worker/src/game/types';

// ============================================================================
// Helpers
// ============================================================================

const emptyShips = (): Ships => ({
  lightFighter: 0, heavyFighter: 0, cruiser: 0, battleship: 0,
  battlecruiser: 0, bomber: 0, destroyer: 0, deathstar: 0,
  smallCargo: 0, largeCargo: 0, colonyShip: 0, recycler: 0,
  espionageProbe: 0, solarSatellite: 0,
});

const emptyResources = (): Resources => ({ metal: 0, crystal: 0, deuterium: 0 });

function makeCoord(galaxy: number, system: number, position: number): Coordinate {
  return { galaxy, system, position };
}

function makePlanetState(ships: Partial<Ships> = {}, deuterium = 100_000): PlanetState {
  return {
    planetId: 'planet-1',
    playerId: 'player-1',
    coordinate: makeCoord(1, 1, 1),
    planetType: 'planet',
    name: 'Home Planet',
    temperature: 40,
    fields: 163,
    universeSpeed: 1,
    buildings: {
      metalMine: 0, crystalMine: 0, deutSynth: 0, solarPlant: 5,
      fusionReactor: 0, roboticsFactory: 0, naniteFactory: 0,
      shipyard: 0, researchLab: 0, metalStorage: 0, crystalStorage: 0, deutTank: 0,
    },
    resources: { metal: 500_000, crystal: 200_000, deuterium },
    ships: { ...emptyShips(), ...ships },
    techLevels: {
      espionageTech: 0, computerTech: 0, weaponTech: 0, shieldingTech: 0,
      armorTech: 0, energyTech: 0, hyperspaceTech: 0, combustionDrive: 0,
      impulseDrive: 0, hyperspaceDrive: 0, laserTech: 0, ionTech: 0,
      plasmaTech: 0, astrophysics: 0, gravitonTech: 0,
    },
    queue: [],
    lastTickAt: Date.now(),
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('Fleet Lifecycle Integration (#89)', () => {

  test('Step 1: dispatch a fleet — validates and creates mission', () => {
    const from = makeCoord(1, 1, 1);
    const to = makeCoord(1, 1, 5);
    // Use smallCargo to provide cargo capacity for fuel; lightFighter satisfies attack requirement
    const ships: Ships = { ...emptyShips(), lightFighter: 5, smallCargo: 5 };
    const planet = makePlanetState({ lightFighter: 5, smallCargo: 5 });

    const { mission, reason } = fleetService.dispatchFleet(
      {
        missionId: 'mission-1',
        playerId: 'player-1',
        fromPlanetId: 'planet-1',
        toPlanetId: 'planet-2',
        from,
        to,
        ships,
        resources: emptyResources(),
        missionType: 'attack',
        speedPercent: 100,
      },
      planet,
    );

    expect(reason).toBeUndefined();
    expect(mission).not.toBeNull();
    expect(mission!.missionType).toBe('attack');
    expect(mission!.missionStatus).toBe('in_transit');
    expect(mission!.timeArrival).toBeGreaterThan(mission!.timeDeparture);
    // Ships deducted from planet
    // All ships deducted from planet
    expect(planet.ships.lightFighter).toBe(0);
    expect(planet.ships.smallCargo).toBe(0);
  });

  test('Step 2: fleet is "in transit" — mission not yet processable', () => {
    const from = makeCoord(1, 1, 1);
    const to = makeCoord(1, 1, 5);
    const ships: Ships = { ...emptyShips(), lightFighter: 5, smallCargo: 5 };
    const planet = makePlanetState({ lightFighter: 5, smallCargo: 5 });

    const { mission } = fleetService.dispatchFleet(
      {
        missionId: 'mission-2',
        playerId: 'player-1',
        fromPlanetId: 'planet-1',
        toPlanetId: 'planet-2',
        from,
        to,
        ships,
        resources: emptyResources(),
        missionType: 'attack',
        speedPercent: 100,
      },
      planet,
    );

    expect(mission!.missionStatus).toBe('in_transit');
    // processFleetArrival before arrival time returns failure
    const earlyResult = fleetService.processFleetArrival(mission!, {});
    expect(earlyResult.success).toBe(false);
    expect(mission!.missionStatus).toBe('in_transit'); // unchanged
  });

  test('Step 3: fleet arrives — attack with defender → battle occurs', () => {
    const from = makeCoord(1, 1, 1);
    const to = makeCoord(1, 1, 5);
    const ships: Ships = { ...emptyShips(), lightFighter: 1, battleship: 10, largeCargo: 5 };
    const planet = makePlanetState({ lightFighter: 1, battleship: 10, largeCargo: 5 });

    const { mission } = fleetService.dispatchFleet(
      {
        missionId: 'mission-3',
        playerId: 'player-1',
        fromPlanetId: 'planet-1',
        toPlanetId: 'planet-2',
        from,
        to,
        ships,
        resources: emptyResources(),
        missionType: 'attack',
        speedPercent: 100,
      },
      planet,
    );

    // Force mission to arrived state (simulate time passing)
    mission!.timeArrival = Math.floor(Date.now() / 1000) - 1;

    const defenderData = {
      ships: { ...emptyShips(), lightFighter: 5 },
      defenses: {
        rocketLauncher: 0, lightLaser: 0, heavyLaser: 0, gaussCannon: 0,
        ionCannon: 0, plasmaTurret: 0, smallShieldDome: 0, largeShieldDome: 0,
      },
      resources: { metal: 50_000, crystal: 20_000, deuterium: 5_000 },
      owner: 'player-2',
    };

    const result = fleetService.processFleetArrival(mission!, { defenderData });

    expect(result.success).toBe(true);
    expect(result.missionType).toBe('attack');
    expect(result.battle).toBeDefined();
    // Battle report should indicate attacker wins vs 5 light fighters
    expect(result.battle!.winner).toBe('attacker');
    // Loot should be non-zero
    expect(result.loot).toBeDefined();
    const totalLoot = result.loot!.metal + result.loot!.crystal + result.loot!.deuterium;
    expect(totalLoot).toBeGreaterThan(0);
  });

  test('Step 4: return mission is created after attack', () => {
    const from = makeCoord(1, 1, 1);
    const to = makeCoord(1, 1, 5);
    const ships: Ships = { ...emptyShips(), lightFighter: 1, battleship: 10, largeCargo: 5 };
    const planet = makePlanetState({ lightFighter: 1, battleship: 10, largeCargo: 5 });

    const { mission } = fleetService.dispatchFleet(
      {
        missionId: 'mission-4',
        playerId: 'player-1',
        fromPlanetId: 'planet-1',
        toPlanetId: 'planet-2',
        from,
        to,
        ships,
        resources: emptyResources(),
        missionType: 'attack',
        speedPercent: 100,
      },
      planet,
    );

    mission!.timeArrival = Math.floor(Date.now() / 1000) - 1;

    const defenderData = {
      ships: { ...emptyShips(), lightFighter: 2 },
      defenses: {
        rocketLauncher: 0, lightLaser: 0, heavyLaser: 0, gaussCannon: 0,
        ionCannon: 0, plasmaTurret: 0, smallShieldDome: 0, largeShieldDome: 0,
      },
      resources: { metal: 10_000, crystal: 5_000, deuterium: 1_000 },
      owner: 'player-2',
    };

    const result = fleetService.processFleetArrival(mission!, { defenderData });

    // Return mission scheduled
    expect(result.returnMission).toBeDefined();
    expect(result.returnMission!.missionStatus).toBe('in_transit');
    expect(result.returnMission!.sourceCoordinate).toEqual(to);
    expect(result.returnMission!.targetCoordinate).toEqual(from);
    expect(mission!.missionStatus).toBe('returning');
  });

  test('Full lifecycle: dispatch → arrive → combat → return mission', () => {
    const from = makeCoord(1, 1, 1);
    const to = makeCoord(1, 2, 7);
    const attackerShips: Ships = { ...emptyShips(), lightFighter: 1, cruiser: 20, smallCargo: 3 };
    const planet = makePlanetState({ lightFighter: 1, cruiser: 20, smallCargo: 3 });

    // 1. Dispatch
    const { mission } = fleetService.dispatchFleet(
      {
        missionId: 'mission-full',
        playerId: 'player-1',
        fromPlanetId: 'planet-1',
        toPlanetId: 'planet-2',
        from,
        to,
        ships: attackerShips,
        resources: emptyResources(),
        missionType: 'attack',
        speedPercent: 100,
      },
      planet,
    );

    expect(mission).not.toBeNull();
    expect(mission!.missionStatus).toBe('in_transit');

    // 2. Simulate arrival
    mission!.timeArrival = Math.floor(Date.now() / 1000) - 1;

    const defenderData = {
      ships: { ...emptyShips(), lightFighter: 5 },
      defenses: {
        rocketLauncher: 0, lightLaser: 0, heavyLaser: 0, gaussCannon: 0,
        ionCannon: 0, plasmaTurret: 0, smallShieldDome: 0, largeShieldDome: 0,
      },
      resources: { metal: 100_000, crystal: 50_000, deuterium: 10_000 },
      owner: 'player-2',
    };

    // 3. Process arrival (combat)
    const result = fleetService.processFleetArrival(mission!, { defenderData });

    expect(result.success).toBe(true);
    expect(result.battle).toBeDefined();
    expect(result.returnMission).toBeDefined();

    // 4. Return mission is in transit back home
    const ret = result.returnMission!;
    expect(ret.missionStatus).toBe('in_transit');
    expect(ret.targetCoordinate).toEqual(from);
  });

  test('Attack with no defender — returns without combat', () => {
    const from = makeCoord(1, 1, 1);
    const to = makeCoord(1, 1, 5);
    const ships: Ships = { ...emptyShips(), lightFighter: 3, smallCargo: 3 };
    const planet = makePlanetState({ lightFighter: 3, smallCargo: 3 });

    const { mission } = fleetService.dispatchFleet(
      {
        missionId: 'mission-empty',
        playerId: 'player-1',
        fromPlanetId: 'planet-1',
        toPlanetId: null,
        from,
        to,
        ships,
        resources: emptyResources(),
        missionType: 'attack',
        speedPercent: 100,
      },
      planet,
    );

    mission!.timeArrival = Math.floor(Date.now() / 1000) - 1;
    const result = fleetService.processFleetArrival(mission!, {}); // no defender

    expect(result.success).toBe(false);
    expect(result.battle).toBeUndefined();
    expect(result.returnMission).toBeDefined(); // still returns
  });
});
