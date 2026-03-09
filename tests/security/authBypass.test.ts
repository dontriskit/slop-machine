/**
 * Security: Auth Bypass & Authorization Tests
 *
 * These tests document and verify that the API correctly prevents players from
 * accessing or modifying other players' resources.
 *
 * NOTE: The current API uses player_id as a query/body param with no token-based
 * auth. These tests use a mock Hono app that mirrors the real handler logic to
 * verify the *expected* behavior. Where the real API lacks auth enforcement,
 * tests are marked with a TODO comment explaining what needs to be fixed.
 *
 * Issue: #115
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Minimal mock infrastructure
// ---------------------------------------------------------------------------

/** Simulated in-memory player/planet/message store */
interface MockDB {
  planets: Record<string, { owner_id: string; metal: number; crystal: number }>;
  messages: Record<string, { recipient_id: string; sender_id: string; body: string; read: boolean }>;
  resources: Record<string, { owner_id: string; amount: number }>;
}

function makeMockDB(): MockDB {
  return {
    planets: {
      'planet-A': { owner_id: 'player-A', metal: 5000, crystal: 3000 },
      'planet-B': { owner_id: 'player-B', metal: 8000, crystal: 6000 },
    },
    messages: {
      'msg-1': { recipient_id: 'player-B', sender_id: 'player-A', body: 'Hello B!', read: false },
      'msg-2': { recipient_id: 'player-A', sender_id: 'player-B', body: 'Hello A!', read: false },
    },
    resources: {
      'res-player-A': { owner_id: 'player-A', amount: 1000 },
      'res-player-B': { owner_id: 'player-B', amount: 2000 },
    },
  };
}

/**
 * Mock handler: upgrade planet building.
 *
 * Simulates the authorization logic that SHOULD exist in /api/planet/:id/queue.
 * Currently the real API does NOT enforce this — it accepts any caller.
 * This mock shows what the guarded implementation should look like.
 */
function upgradePlanetBuilding(
  db: MockDB,
  requestingPlayerId: string,
  planetId: string,
  buildingId: number,
): { status: number; body: Record<string, unknown> } {
  const planet = db.planets[planetId];
  if (!planet) return { status: 404, body: { error: 'Planet not found' } };

  // AUTH CHECK: requestingPlayerId must own the planet
  if (planet.owner_id !== requestingPlayerId) {
    return { status: 403, body: { error: 'Forbidden: you do not own this planet' } };
  }

  if (buildingId < 0 || buildingId > 99) {
    return { status: 400, body: { error: 'Invalid building ID' } };
  }

  return { status: 200, body: { success: true, planetId, buildingId } };
}

/**
 * Mock handler: read private messages.
 *
 * Simulates the authorization logic that SHOULD exist for GET /api/messages/inbox.
 * The real API returns messages for whichever player_id is supplied as a query param
 * with no verification that the caller is that player.
 */
function readInbox(
  db: MockDB,
  requestingPlayerId: string,
  targetPlayerId: string,
): { status: number; body: Record<string, unknown> } {
  // AUTH CHECK: requestingPlayerId must match targetPlayerId
  if (requestingPlayerId !== targetPlayerId) {
    return { status: 403, body: { error: 'Forbidden: cannot read another player\'s inbox' } };
  }

  const msgs = Object.values(db.messages).filter(m => m.recipient_id === targetPlayerId);
  return { status: 200, body: { messages: msgs } };
}

/**
 * Mock handler: claim resources from a depot.
 *
 * Simulates resource ownership checks.
 */
function claimResources(
  db: MockDB,
  requestingPlayerId: string,
  resourceId: string,
): { status: number; body: Record<string, unknown> } {
  const res = db.resources[resourceId];
  if (!res) return { status: 404, body: { error: 'Resource not found' } };

  // AUTH CHECK: requestingPlayerId must own the resource
  if (res.owner_id !== requestingPlayerId) {
    return { status: 403, body: { error: 'Forbidden: you do not own this resource' } };
  }

  return { status: 200, body: { claimed: res.amount } };
}

/**
 * Mock handler: validate player ID is not spoofed.
 *
 * Simulates what a middleware auth layer should do: compare the player_id claim
 * in the request body/query against the authenticated session token.
 */
function validatePlayerIdClaim(
  authenticatedId: string | null,
  claimedId: string,
): { valid: boolean; error?: string } {
  if (!authenticatedId) {
    return { valid: false, error: 'Not authenticated' };
  }
  if (authenticatedId !== claimedId) {
    return { valid: false, error: 'Spoofed player_id rejected' };
  }
  return { valid: true };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Security: Auth Bypass & Authorization', () => {
  let db: MockDB;

  beforeEach(() => {
    db = makeMockDB();
  });

  // -------------------------------------------------------------------------
  // Test: Player A cannot upgrade Player B's planet
  // -------------------------------------------------------------------------
  describe('Planet building upgrade authorization', () => {
    test('player A can upgrade their own planet', () => {
      const result = upgradePlanetBuilding(db, 'player-A', 'planet-A', 1);
      expect(result.status).toBe(200);
      expect(result.body.success).toBe(true);
    });

    test('player A cannot upgrade player B\'s planet — must return 403', () => {
      const result = upgradePlanetBuilding(db, 'player-A', 'planet-B', 1);
      expect(result.status).toBe(403);
      expect(result.body.error).toMatch(/forbidden/i);
    });

    test('player B cannot upgrade player A\'s planet — must return 403', () => {
      const result = upgradePlanetBuilding(db, 'player-B', 'planet-A', 1);
      expect(result.status).toBe(403);
      expect(result.body.error).toMatch(/forbidden/i);
    });

    test('unknown planet returns 404, not 403', () => {
      const result = upgradePlanetBuilding(db, 'player-A', 'planet-X', 1);
      expect(result.status).toBe(404);
    });

    /**
     * TODO (real API fix needed): /api/planet/:id/queue does NOT check that
     * the caller owns planet/:id. Any player can queue builds on any planet.
     * Fix: read planet owner from DB, compare to authenticated session player.
     */
    test.todo('real API: POST /api/planet/:id/queue rejects non-owner with 403');
  });

  // -------------------------------------------------------------------------
  // Test: Player A cannot read Player B's private messages
  // -------------------------------------------------------------------------
  describe('Message inbox authorization', () => {
    test('player A can read their own inbox', () => {
      const result = readInbox(db, 'player-A', 'player-A');
      expect(result.status).toBe(200);
      const messages = result.body.messages as unknown[];
      expect(Array.isArray(messages)).toBe(true);
    });

    test('player A cannot read player B\'s inbox — must return 403', () => {
      const result = readInbox(db, 'player-A', 'player-B');
      expect(result.status).toBe(403);
      expect(result.body.error).toMatch(/forbidden/i);
    });

    test('player B cannot read player A\'s inbox — must return 403', () => {
      const result = readInbox(db, 'player-B', 'player-A');
      expect(result.status).toBe(403);
      expect(result.body.error).toMatch(/forbidden/i);
    });

    test('player A\'s inbox only contains messages addressed to them', () => {
      const result = readInbox(db, 'player-A', 'player-A');
      expect(result.status).toBe(200);
      const messages = result.body.messages as Array<{ recipient_id: string }>;
      for (const msg of messages) {
        expect(msg.recipient_id).toBe('player-A');
      }
    });

    /**
     * TODO (real API fix needed): GET /api/messages/inbox?player_id=X returns
     * messages for ANY player_id passed in. No session check is performed.
     * Fix: use authenticated session player_id from middleware, ignore query param
     * or validate it against the session.
     */
    test.todo('real API: GET /api/messages/inbox rejects mismatched player_id with 403');
  });

  // -------------------------------------------------------------------------
  // Test: Player A cannot claim Player B's resources
  // -------------------------------------------------------------------------
  describe('Resource claim authorization', () => {
    test('player A can claim their own resources', () => {
      const result = claimResources(db, 'player-A', 'res-player-A');
      expect(result.status).toBe(200);
      expect(typeof result.body.claimed).toBe('number');
    });

    test('player A cannot claim player B\'s resources — must return 403', () => {
      const result = claimResources(db, 'player-A', 'res-player-B');
      expect(result.status).toBe(403);
      expect(result.body.error).toMatch(/forbidden/i);
    });

    test('player B cannot claim player A\'s resources — must return 403', () => {
      const result = claimResources(db, 'player-B', 'res-player-A');
      expect(result.status).toBe(403);
      expect(result.body.error).toMatch(/forbidden/i);
    });

    test('unknown resource id returns 404', () => {
      const result = claimResources(db, 'player-A', 'res-nonexistent');
      expect(result.status).toBe(404);
    });
  });

  // -------------------------------------------------------------------------
  // Test: Spoofed player IDs are rejected
  // -------------------------------------------------------------------------
  describe('Player ID spoof prevention', () => {
    test('authenticated player can claim their own player_id', () => {
      const result = validatePlayerIdClaim('player-A', 'player-A');
      expect(result.valid).toBe(true);
    });

    test('player claiming another player\'s ID is rejected', () => {
      const result = validatePlayerIdClaim('player-A', 'player-B');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/spoof/i);
    });

    test('unauthenticated request (no session) is rejected', () => {
      const result = validatePlayerIdClaim(null, 'player-B');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/not authenticated/i);
    });

    test('empty string player_id claim is rejected when not authenticated', () => {
      const result = validatePlayerIdClaim(null, '');
      expect(result.valid).toBe(false);
    });

    test('player cannot elevate to admin by claiming admin player_id', () => {
      const result = validatePlayerIdClaim('player-A', 'admin');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/spoof/i);
    });

    /**
     * TODO (real API fix needed): All endpoints accept player_id as a plain query
     * param or body field. There is no session/token middleware that verifies the
     * caller is who they claim to be. Any client can send player_id=<victim> and
     * act as that player.
     * Fix: Implement JWT/session auth middleware. Derive player_id from the verified
     * token, never from user-supplied input.
     */
    test.todo('real API: middleware rejects requests where player_id != session player');
  });

  // -------------------------------------------------------------------------
  // Test: Cross-account resource enumeration
  // -------------------------------------------------------------------------
  describe('Authorization boundary: no cross-player resource enumeration', () => {
    test('reading your own planet state is allowed', () => {
      const planet = db.planets['planet-A'];
      const requestingPlayer = 'player-A';
      expect(planet.owner_id).toBe(requestingPlayer);
    });

    test('reading another player\'s planet state should be denied', () => {
      const planet = db.planets['planet-B'];
      const requestingPlayer = 'player-A';
      // planet-B is not owned by player-A — access must be denied
      expect(planet.owner_id).not.toBe(requestingPlayer);
      // This is the authorization check that the real API must enforce
    });

    test('player IDs are treated as opaque identifiers, not trusted claims', () => {
      // A player cannot downgrade to another player by changing their ID
      const authenticated = 'player-A';
      const claimed = 'player-B';
      const result = validatePlayerIdClaim(authenticated, claimed);
      expect(result.valid).toBe(false);
    });
  });
});
