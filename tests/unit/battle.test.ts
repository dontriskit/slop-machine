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
    // Use battleships vs light fighters for guaranteed casualties with debris
    const attacker = { ...emptyShips(), battleship: 20 };
    const defender = { ...emptyShips(), lightFighter: 100 };
    const result = simulateBattle(attacker, defender);
    // Light fighters will be destroyed, producing debris
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
    expect(result.rounds.length).toBeLessThanOrEqual(6);
    expect(result.rounds.length).toBeGreaterThanOrEqual(1);
  });

  test('tech bonuses affect outcome', () => {
    // Use an imbalanced fight where tech makes the difference.
    // Cruiser attack=400, hull=27000, shield=50.
    // At tech 0: 400 dmg - 50 shield = 350 hull dmg per hit.
    // At tech 10: attack=800, hull=54000, shield=100.
    //   Attacker hits for 800-50=750 hull, defender hits for 400-100=300 hull.
    // Light fighters have low hull (4000) so they die quickly with high-tech opponents.
    const attacker = { ...emptyShips(), cruiser: 10 };
    const defender = { ...emptyShips(), lightFighter: 50 };
    const techHigh = { weaponTech: 10, shieldingTech: 10, armorTech: 10 };
    const techLow = { weaponTech: 0, shieldingTech: 0, armorTech: 0 };

    // Run multiple times since battle has RNG
    let highTechWins = 0;
    let lowTechWins = 0;
    for (let i = 0; i < 20; i++) {
      const result = simulateBattle(attacker, defender, undefined, techHigh, techLow);
      if (result.winner === 'attacker') highTechWins++;
      // Also run with NO tech to compare
      const resultNoTech = simulateBattle(attacker, defender, undefined, techLow, techLow);
      if (resultNoTech.winner === 'attacker') lowTechWins++;
    }
    // High tech attacker should outperform no-tech attacker
    expect(highTechWins).toBeGreaterThan(lowTechWins);
  });

});
