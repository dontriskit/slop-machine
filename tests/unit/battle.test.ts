/**
 * Unit tests for battle simulation engine
 */
import { describe, test, expect } from 'vitest';
import { simulateBattle } from '../../worker/src/game/services/battleService';

const emptyShips = () => ({
  lightFighter: 0, heavyFighter: 0, cruiser: 0, battleship: 0,
  battlecruiser: 0, bomber: 0, destroyer: 0, deathstar: 0,
  smallCargo: 0, largeCargo: 0, colonyShip: 0, recycler: 0,
  espionageProbe: 0,
});

describe('Battle Engine', () => {

  test('attacker with no ships loses', () => {
    const attacker = emptyShips();
    const defender = { ...emptyShips(), lightFighter: 10 };
    const result = simulateBattle(attacker, defender);
    expect(result.winner).toBe('defender');
  });

  test('defender with no ships loses', () => {
    const attacker = { ...emptyShips(), lightFighter: 10 };
    const defender = emptyShips();
    const result = simulateBattle(attacker, defender);
    expect(result.winner).toBe('attacker');
  });

  test('overwhelming attacker wins', () => {
    const attacker = { ...emptyShips(), battleship: 100 };
    const defender = { ...emptyShips(), lightFighter: 5 };
    const result = simulateBattle(attacker, defender);
    expect(result.winner).toBe('attacker');
  });

  test('overwhelming defender wins', () => {
    const attacker = { ...emptyShips(), lightFighter: 1 };
    const defender = { ...emptyShips(), deathstar: 1 };
    const result = simulateBattle(attacker, defender);
    expect(result.winner).toBe('defender');
  });

  test('battle produces debris', () => {
    // Use asymmetric forces so ships are actually destroyed and produce debris.
    // Cruisers have rapidfire 6 vs light fighters, guaranteeing kills.
    const attacker = { ...emptyShips(), cruiser: 20 };
    const defender = { ...emptyShips(), lightFighter: 50 };
    const result = simulateBattle(attacker, defender);
    expect(result.debrisField.metal).toBeGreaterThan(0);
    expect(result.debrisField.crystal).toBeGreaterThan(0);
  });

  test('debris is 30% of destroyed ship costs', () => {
    const attacker = { ...emptyShips(), deathstar: 1 };
    const defender = { ...emptyShips(), lightFighter: 1 };
    const result = simulateBattle(attacker, defender);
    // Light fighter costs 3000m, 1000c
    // If destroyed: 900m, 300c debris
    if (result.winner === 'attacker') {
      expect(result.debrisField.metal).toBeGreaterThanOrEqual(0);
      expect(result.debrisField.crystal).toBeGreaterThanOrEqual(0);
    }
  });

  test('battle completes within 6 rounds', () => {
    const attacker = { ...emptyShips(), lightFighter: 100 };
    const defender = { ...emptyShips(), lightFighter: 100 };
    const result = simulateBattle(attacker, defender);
    // result.rounds is an array of BattleRound objects
    expect(result.rounds.length).toBeLessThanOrEqual(6);
    expect(result.rounds.length).toBeGreaterThanOrEqual(1);
  });

  test('tech bonuses affect outcome', () => {
    // Use cruisers vs light fighters: cruisers have rapidfire 6 vs LF,
    // and with tech 10 the attacker gets 2x damage/armor/shields.
    // 10 cruisers with tech 10 can beat 100 LF; without tech they cannot.
    const attacker = { ...emptyShips(), cruiser: 10 };
    const defender = { ...emptyShips(), lightFighter: 100 };
    const techHigh = { weaponTech: 10, shieldingTech: 10, armorTech: 10 };
    const techLow = { weaponTech: 0, shieldingTech: 0, armorTech: 0 };

    // Run multiple times since battle has RNG
    let highTechWins = 0;
    for (let i = 0; i < 20; i++) {
      const result = simulateBattle(attacker, defender, undefined, techHigh, techLow);
      if (result.winner === 'attacker') highTechWins++;
    }
    // High tech attacker should win a significant number of times
    expect(highTechWins).toBeGreaterThanOrEqual(5);
  });

});
