/**
 * Integration: Battle → Debris Spawn → Harvest
 * Issue #83
 *
 * Verifies:
 * 1. Battle produces a debris field
 * 2. A recycler harvest mission can collect the debris
 */
import { describe, test, expect } from 'vitest';
import { simulateBattle } from '../../worker/src/game/services/battleService';
import { fleetService } from '../../worker/src/game/services/fleetService';
import type { Ships, Resources, Coordinate, PlanetState } from '../../worker/src/game/types';
import { SHIP_CARGO } from '../../worker/src/game/formulas';

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

function makePlanetState(ships: Partial<Ships> = {}, deuterium = 500_000): PlanetState {
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
    resources: { metal: 1_000_000, crystal: 500_000, deuterium },
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

describe('Battle → Debris → Harvest Integration (#83)', () => {

  test('Step 1: battle produces a debris field', () => {
    // Cruisers have rapidfire vs light fighters — guarantees kills
    const attacker = { ...emptyShips(), cruiser: 20 };
    const defender = { ...emptyShips(), lightFighter: 50 };

    const result = simulateBattle(attacker, defender);

    expect(result.winner).toBe('attacker');
    expect(result.debrisField).toBeDefined();
    expect(result.debrisField.metal).toBeGreaterThan(0);
    expect(result.debrisField.crystal).toBeGreaterThan(0);
  });

  test('Step 2: debris field has 30% of destroyed ship costs', () => {
    // Light fighter: 3000 metal, 1000 crystal
    // 1 destroyed → 900 metal, 300 crystal debris
    const attacker = { ...emptyShips(), deathstar: 1 };
    const defender = { ...emptyShips(), lightFighter: 1 };

    const result = simulateBattle(attacker, defender);
    if (result.winner === 'attacker') {
      expect(result.debrisField.metal).toBe(900);
      expect(result.debrisField.crystal).toBe(300);
    }
  });

  test('Step 3: recycler harvest mission collects debris', () => {
    // First produce debris via battle
    const attackerShips = { ...emptyShips(), cruiser: 20 };
    const defenderShips = { ...emptyShips(), lightFighter: 50 };

    const battleResult = simulateBattle(attackerShips, defenderShips);
    const debris = battleResult.debrisField;
    expect(debris.metal + debris.crystal).toBeGreaterThan(0);

    // Now dispatch a recycler to harvest the debris
    const from = makeCoord(1, 1, 1);
    const debrisCoord = makeCoord(1, 1, 5); // debris at target coord

    const harvesterPlanet = makePlanetState({ recycler: 5 });
    const recyclerShips: Ships = { ...emptyShips(), recycler: 5 };

    const { mission, reason } = fleetService.dispatchFleet(
      {
        missionId: 'harvest-1',
        playerId: 'player-1',
        fromPlanetId: 'planet-1',
        toPlanetId: null,
        from,
        to: debrisCoord,
        ships: recyclerShips,
        resources: emptyResources(),
        missionType: 'harvest',
        speedPercent: 100,
      },
      harvesterPlanet,
    );

    expect(reason).toBeUndefined();
    expect(mission).not.toBeNull();
    expect(mission!.missionType).toBe('harvest');
    expect(mission!.ships.recycler).toBe(5);

    // Force arrival
    mission!.timeArrival = Math.floor(Date.now() / 1000) - 1;

    // Process harvest with the debris field from battle
    const harvestResult = fleetService.processFleetArrival(mission!, {
      debrisField: {
        metal: debris.metal,
        crystal: debris.crystal,
        deuterium: 0,
      },
    });

    expect(harvestResult.success).toBe(true);
    expect(harvestResult.missionType).toBe('harvest');
    expect(harvestResult.debrisCollected).toBeDefined();
    const collected = harvestResult.debrisCollected!;
    expect(collected.metal + collected.crystal).toBeGreaterThan(0);
  });

  test('Full flow: battle → collect debris data → recycler harvests it', () => {
    // 1. Battle
    const attacker = { ...emptyShips(), battleship: 10 };
    const defender = { ...emptyShips(), lightFighter: 30 };
    const battle = simulateBattle(attacker, defender);

    expect(battle.debrisField.metal).toBeGreaterThan(0);

    // 2. Recycler dispatched to debris location
    const from = makeCoord(1, 1, 1);
    const targetCoord = makeCoord(1, 1, 7);
    const recyclerPlanet = makePlanetState({ recycler: 10 });

    const { mission } = fleetService.dispatchFleet(
      {
        missionId: 'harvest-full',
        playerId: 'player-1',
        fromPlanetId: 'planet-1',
        toPlanetId: null,
        from,
        to: targetCoord,
        ships: { ...emptyShips(), recycler: 10 },
        resources: emptyResources(),
        missionType: 'harvest',
        speedPercent: 100,
      },
      recyclerPlanet,
    );

    mission!.timeArrival = Math.floor(Date.now() / 1000) - 1;

    // 3. Harvest
    const result = fleetService.processFleetArrival(mission!, {
      debrisField: {
        metal: battle.debrisField.metal,
        crystal: battle.debrisField.crystal,
        deuterium: 0,
      },
    });

    expect(result.success).toBe(true);
    expect(result.debrisCollected!.metal).toBeGreaterThan(0);

    // 4. Return mission carries the debris home
    expect(result.returnMission).toBeDefined();
    const ret = result.returnMission!;
    expect(ret.resources.metal + ret.resources.crystal).toBeGreaterThan(0);
    expect(ret.targetCoordinate).toEqual(from);
  });

  test('Recycler capacity limits how much debris can be collected', () => {
    // Single recycler: 20,000 cargo
    const recyclerCapacity = SHIP_CARGO.recycler;
    expect(recyclerCapacity).toBeGreaterThan(0);

    const from = makeCoord(1, 1, 1);
    const to = makeCoord(1, 1, 9);
    const planet = makePlanetState({ recycler: 1 });

    const { mission } = fleetService.dispatchFleet(
      {
        missionId: 'harvest-limited',
        playerId: 'player-1',
        fromPlanetId: 'planet-1',
        toPlanetId: null,
        from,
        to,
        ships: { ...emptyShips(), recycler: 1 },
        resources: emptyResources(),
        missionType: 'harvest',
        speedPercent: 100,
      },
      planet,
    );

    mission!.timeArrival = Math.floor(Date.now() / 1000) - 1;

    // Massive debris field — much more than 1 recycler can carry
    const hugeDebris = { metal: 1_000_000, crystal: 1_000_000, deuterium: 0 };

    const result = fleetService.processFleetArrival(mission!, { debrisField: hugeDebris });

    expect(result.success).toBe(true);
    const collected = result.debrisCollected!;
    // Can only collect up to recycler capacity
    expect(collected.metal + collected.crystal + collected.deuterium).toBeLessThanOrEqual(recyclerCapacity);
  });

  test('No debris field — harvest returns empty', () => {
    const from = makeCoord(1, 1, 1);
    const to = makeCoord(1, 1, 9);
    const planet = makePlanetState({ recycler: 3 });

    const { mission } = fleetService.dispatchFleet(
      {
        missionId: 'harvest-empty',
        playerId: 'player-1',
        fromPlanetId: 'planet-1',
        toPlanetId: null,
        from,
        to,
        ships: { ...emptyShips(), recycler: 3 },
        resources: emptyResources(),
        missionType: 'harvest',
        speedPercent: 100,
      },
      planet,
    );

    mission!.timeArrival = Math.floor(Date.now() / 1000) - 1;

    // No debris field passed
    const result = fleetService.processFleetArrival(mission!, {});

    expect(result.success).toBe(true);
    expect(result.debrisCollected).toBeDefined();
    expect(result.debrisCollected!.metal).toBe(0);
    expect(result.debrisCollected!.crystal).toBe(0);
  });
});
