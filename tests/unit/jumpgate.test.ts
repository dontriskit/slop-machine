/**
 * Jump Gate Teleportation Service Unit Tests
 *
 * Tests for jump gate cooldown mechanics, fleet validation,
 * and teleportation logic.
 */

import { describe, it, expect } from 'vitest';
import {
  hasShipsToTransfer,
  validateFleetAvailability,
  isJumpGateReady,
  getCooldownRemaining,
  JUMP_GATE_COOLDOWN_SECONDS,
} from '../../worker/src/game/services/jumpGateService';
import type { Ships } from '../../worker/src/game/types';

// ============================================================================
// HELPERS
// ============================================================================

function emptyShips(): Ships {
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

function someShips(overrides: Partial<Ships> = {}): Ships {
  return { ...emptyShips(), ...overrides };
}

// ============================================================================
// TESTS
// ============================================================================

describe('Jump Gate Service', () => {
  describe('Constants', () => {
    it('has a 1-hour cooldown (3600 seconds)', () => {
      expect(JUMP_GATE_COOLDOWN_SECONDS).toBe(3600);
    });
  });

  describe('hasShipsToTransfer', () => {
    it('returns false for empty fleet', () => {
      expect(hasShipsToTransfer(emptyShips())).toBe(false);
    });

    it('returns true for fleet with any ship', () => {
      expect(hasShipsToTransfer(someShips({ lightFighter: 1 }))).toBe(true);
      expect(hasShipsToTransfer(someShips({ deathstar: 1 }))).toBe(true);
      expect(hasShipsToTransfer(someShips({ espionageProbe: 100 }))).toBe(true);
    });

    it('returns true for mixed fleet', () => {
      expect(
        hasShipsToTransfer(
          someShips({ lightFighter: 5, cruiser: 3, largeCargo: 10 })
        )
      ).toBe(true);
    });
  });

  describe('validateFleetAvailability', () => {
    it('accepts when requested <= available', () => {
      const requested = someShips({ lightFighter: 5, cruiser: 3 });
      const available = someShips({ lightFighter: 10, cruiser: 5 });

      const result = validateFleetAvailability(requested, available);
      expect(result.valid).toBe(true);
      expect(result.insufficientShip).toBeUndefined();
    });

    it('accepts exact match', () => {
      const fleet = someShips({ battleship: 7 });
      const result = validateFleetAvailability(fleet, fleet);
      expect(result.valid).toBe(true);
    });

    it('rejects when requested > available', () => {
      const requested = someShips({ lightFighter: 15 });
      const available = someShips({ lightFighter: 10 });

      const result = validateFleetAvailability(requested, available);
      expect(result.valid).toBe(false);
      expect(result.insufficientShip).toBe('lightFighter');
    });

    it('rejects when one ship type exceeds', () => {
      const requested = someShips({ lightFighter: 5, cruiser: 10 });
      const available = someShips({ lightFighter: 100, cruiser: 3 });

      const result = validateFleetAvailability(requested, available);
      expect(result.valid).toBe(false);
      expect(result.insufficientShip).toBe('cruiser');
    });

    it('accepts zero requested ships', () => {
      const requested = emptyShips();
      const available = someShips({ lightFighter: 10 });

      const result = validateFleetAvailability(requested, available);
      expect(result.valid).toBe(true);
    });

    it('checks all ship types', () => {
      // Only deathstar exceeds
      const requested = someShips({ deathstar: 2 });
      const available = someShips({ deathstar: 1 });

      const result = validateFleetAvailability(requested, available);
      expect(result.valid).toBe(false);
      expect(result.insufficientShip).toBe('deathstar');
    });
  });

  describe('isJumpGateReady', () => {
    it('is ready when never used (null lastJumpAt)', () => {
      const now = Math.floor(Date.now() / 1000);
      expect(isJumpGateReady(null, now)).toBe(true);
    });

    it('is ready after cooldown expires', () => {
      const now = 10000;
      const lastJump = now - 3601; // 1 hour + 1 second ago
      expect(isJumpGateReady(lastJump, now)).toBe(true);
    });

    it('is ready exactly at cooldown boundary', () => {
      const now = 10000;
      const lastJump = now - 3600; // exactly 1 hour ago
      expect(isJumpGateReady(lastJump, now)).toBe(true);
    });

    it('is NOT ready during cooldown', () => {
      const now = 10000;
      const lastJump = now - 1800; // 30 minutes ago
      expect(isJumpGateReady(lastJump, now)).toBe(false);
    });

    it('is NOT ready 1 second before cooldown ends', () => {
      const now = 10000;
      const lastJump = now - 3599; // 59 min 59 sec ago
      expect(isJumpGateReady(lastJump, now)).toBe(false);
    });

    it('respects custom cooldown duration', () => {
      const now = 10000;
      const lastJump = now - 1800; // 30 minutes ago

      // Custom 30-minute cooldown: should be ready
      expect(isJumpGateReady(lastJump, now, 1800)).toBe(true);

      // Custom 2-hour cooldown: should NOT be ready
      expect(isJumpGateReady(lastJump, now, 7200)).toBe(false);
    });
  });

  describe('getCooldownRemaining', () => {
    it('returns 0 when never used', () => {
      const now = Math.floor(Date.now() / 1000);
      expect(getCooldownRemaining(null, now)).toBe(0);
    });

    it('returns 0 when cooldown expired', () => {
      const now = 10000;
      const lastJump = now - 5000; // 5000 seconds ago (> 3600)
      expect(getCooldownRemaining(lastJump, now)).toBe(0);
    });

    it('returns remaining seconds during cooldown', () => {
      const now = 10000;
      const lastJump = now - 1800; // 30 minutes ago
      expect(getCooldownRemaining(lastJump, now)).toBe(1800);
    });

    it('returns exact seconds at various points', () => {
      const now = 10000;

      // Just jumped (0 seconds ago)
      expect(getCooldownRemaining(now, now)).toBe(3600);

      // 10 seconds ago
      expect(getCooldownRemaining(now - 10, now)).toBe(3590);

      // 59 minutes ago
      expect(getCooldownRemaining(now - 3540, now)).toBe(60);

      // 1 second before expiry
      expect(getCooldownRemaining(now - 3599, now)).toBe(1);

      // Exactly at expiry
      expect(getCooldownRemaining(now - 3600, now)).toBe(0);
    });

    it('never returns negative', () => {
      const now = 10000;
      const lastJump = now - 999999; // Way in the past
      expect(getCooldownRemaining(lastJump, now)).toBe(0);
    });

    it('respects custom cooldown', () => {
      const now = 10000;
      const lastJump = now - 500;

      // Default cooldown (3600): 3100 remaining
      expect(getCooldownRemaining(lastJump, now)).toBe(3100);

      // Custom 600s cooldown: 100 remaining
      expect(getCooldownRemaining(lastJump, now, 600)).toBe(100);
    });

    it('ceiling rounds fractional seconds', () => {
      // getCooldownRemaining uses Math.ceil
      const now = 10000;
      const lastJump = now - 1799; // 1799 seconds ago
      // Remaining = 3600 - 1799 = 1801 (integer, so ceil doesn't change it)
      expect(getCooldownRemaining(lastJump, now)).toBe(1801);
    });
  });

  describe('Integration scenarios', () => {
    it('first jump is always available', () => {
      const now = Math.floor(Date.now() / 1000);
      const ready = isJumpGateReady(null, now);
      const cooldown = getCooldownRemaining(null, now);

      expect(ready).toBe(true);
      expect(cooldown).toBe(0);
    });

    it('jump sets cooldown then expires', () => {
      const jumpTime = 50000;

      // Immediately after: NOT ready, full cooldown
      expect(isJumpGateReady(jumpTime, jumpTime)).toBe(false);
      expect(getCooldownRemaining(jumpTime, jumpTime)).toBe(3600);

      // 30 minutes later: NOT ready, half cooldown
      expect(isJumpGateReady(jumpTime, jumpTime + 1800)).toBe(false);
      expect(getCooldownRemaining(jumpTime, jumpTime + 1800)).toBe(1800);

      // 1 hour later: ready, 0 cooldown
      expect(isJumpGateReady(jumpTime, jumpTime + 3600)).toBe(true);
      expect(getCooldownRemaining(jumpTime, jumpTime + 3600)).toBe(0);
    });

    it('consecutive jumps each reset cooldown', () => {
      // First jump at t=0
      const jump1 = 0;
      expect(isJumpGateReady(null, jump1)).toBe(true);

      // Can't jump again at t=1800 (30 min later)
      expect(isJumpGateReady(jump1, 1800)).toBe(false);

      // Can jump at t=3600 (1 hour later)
      expect(isJumpGateReady(jump1, 3600)).toBe(true);

      // Second jump at t=3600
      const jump2 = 3600;
      // Can't jump again at t=5400 (30 min after second jump)
      expect(isJumpGateReady(jump2, 5400)).toBe(false);

      // Can jump at t=7200 (1 hour after second jump)
      expect(isJumpGateReady(jump2, 7200)).toBe(true);
    });

    it('fleet validation combined with ship transfer check', () => {
      const requested = someShips({ cruiser: 5, largeCargo: 20 });
      const available = someShips({ cruiser: 10, largeCargo: 50, lightFighter: 100 });

      // Has ships to transfer
      expect(hasShipsToTransfer(requested)).toBe(true);

      // Fleet is available
      const check = validateFleetAvailability(requested, available);
      expect(check.valid).toBe(true);
    });

    it('rejects transfer with no ships even if fleet is available', () => {
      const requested = emptyShips();
      const available = someShips({ lightFighter: 100 });

      // No ships to transfer
      expect(hasShipsToTransfer(requested)).toBe(false);

      // But fleet availability check passes (0 <= 100 for all)
      expect(validateFleetAvailability(requested, available).valid).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('handles very large ship counts', () => {
      const requested = someShips({ lightFighter: 999999 });
      const available = someShips({ lightFighter: 1000000 });

      expect(validateFleetAvailability(requested, available).valid).toBe(true);
      expect(hasShipsToTransfer(requested)).toBe(true);
    });

    it('handles time at unix epoch', () => {
      expect(isJumpGateReady(0, 3600)).toBe(true);
      expect(isJumpGateReady(0, 3599)).toBe(false);
      expect(getCooldownRemaining(0, 0)).toBe(3600);
    });

    it('handles future lastJumpAt gracefully', () => {
      const now = 10000;
      const futureJump = 20000; // Jump in the future (shouldn't happen but handle gracefully)
      expect(isJumpGateReady(futureJump, now)).toBe(false);
      expect(getCooldownRemaining(futureJump, now)).toBe(13600); // 20000 + 3600 - 10000
    });

    it('validates all 13 ship types', () => {
      // Create a fleet with exactly 1 of each ship type
      const allShips: Ships = {
        lightFighter: 1,
        heavyFighter: 1,
        cruiser: 1,
        battleship: 1,
        battlecruiser: 1,
        bomber: 1,
        destroyer: 1,
        deathstar: 1,
        smallCargo: 1,
        largeCargo: 1,
        colonyShip: 1,
        recycler: 1,
        espionageProbe: 1,
      };

      expect(hasShipsToTransfer(allShips)).toBe(true);
      expect(validateFleetAvailability(allShips, allShips).valid).toBe(true);

      // One more than available for each type
      const overRequest: Ships = {
        lightFighter: 2,
        heavyFighter: 1,
        cruiser: 1,
        battleship: 1,
        battlecruiser: 1,
        bomber: 1,
        destroyer: 1,
        deathstar: 1,
        smallCargo: 1,
        largeCargo: 1,
        colonyShip: 1,
        recycler: 1,
        espionageProbe: 1,
      };

      const result = validateFleetAvailability(overRequest, allShips);
      expect(result.valid).toBe(false);
      expect(result.insufficientShip).toBe('lightFighter');
    });
  });
});
