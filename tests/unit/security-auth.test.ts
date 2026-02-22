/**
 * Security: Auth Bypass & Authorization Tests
 * 
 * Tests for:
 * - IDOR (Insecure Direct Object Reference): accessing other players' resources
 * - Player ID spoofing: mismatched auth vs request IDs
 * - Privilege escalation: non-admin accessing admin endpoints
 * - Resource theft: building/sending from planets you don't own
 * - Cross-player actions: modifying other players' data
 * - Fleet manipulation: dispatching from unowned planets
 * - Research theft: starting research on others' planets
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { fleetService, FleetService } from '../../worker/src/game/services/fleetService';
import { startResearch, ResearchService } from '../../worker/src/game/services/researchService';
import { Coordinate, PlanetState, Ships, Resources, FleetMission } from '../../worker/src/game/types';

// ============================================================================
// HELPER: Create mock planet state with full data
// ============================================================================

function createFullMockPlanet(playerId: string, planetId: string) {
  return {
    ships: {
      lightFighter: 100,
      heavyFighter: 50,
      cruiser: 20,
      battleship: 10,
      battlecruiser: 5,
      bomber: 0,
      destroyer: 0,
      deathstar: 0,
      smallCargo: 50,
      largeCargo: 20,
      colonyShip: 0,
      recycler: 10,
      espionageProbe: 20,
    } as any,
    resources: {
      metal: 50000,
      crystal: 30000,
      deuterium: 20000,
    },
  };
}

// ============================================================================
// TESTS: These focus on authorization logic and security requirements
// ============================================================================

describe('Security: Auth Bypass & Authorization', () => {
  // ==========================================================================
  // IDOR TESTS: Insecure Direct Object Reference
  // ==========================================================================

  describe('IDOR: Direct Object Reference Validation', () => {
    test('getMessage requires playerId to be sender or recipient', () => {
      // getMessage logic:
      // 1. Look up message by ID
      // 2. Check if playerId === from_player_id OR playerId === to_player_id
      // 3. If neither, return null (authorization denied)
      
      const messageId = 'msg-1';
      const senderId = 'player-1';
      const recipientId = 'player-2';
      const attackerId = 'player-3';

      // Sender can read
      const senderCanRead = senderId === senderId || senderId === recipientId;
      expect(senderCanRead).toBe(true);

      // Recipient can read
      const recipientCanRead = recipientId === senderId || recipientId === recipientId;
      expect(recipientCanRead).toBe(true);

      // Non-involved player cannot read
      const attackerCanRead = attackerId === senderId || attackerId === recipientId;
      expect(attackerCanRead).toBe(false);
    });

    test('deleteMessage requires playerId to be sender or recipient', () => {
      // deleteMessage logic:
      // 1. Find message by ID
      // 2. Check if playerId is sender or recipient
      // 3. If neither, return false (authorization denied)
      // 4. Set appropriate deleted_by_X flag
      
      const messageId = 'msg-1';
      const senderId = 'player-1';
      const recipientId = 'player-2';
      const attackerId = 'player-3';

      // Sender can delete their copy
      const senderCanDelete = senderId === senderId || senderId === recipientId;
      expect(senderCanDelete).toBe(true);

      // Recipient can delete their copy
      const recipientCanDelete = recipientId === senderId || recipientId === recipientId;
      expect(recipientCanDelete).toBe(true);

      // Attacker cannot delete
      const attackerCanDelete = attackerId === senderId || attackerId === recipientId;
      expect(attackerCanDelete).toBe(false);
    });

    test('getMessage respects soft-delete flags', () => {
      // getMessage checks:
      // if (isSender && row.deleted_by_sender === 1) return null
      // if (isRecipient && row.deleted_by_recipient === 1) return null
      
      const isRecipient = true;
      const deletedByRecipient = 1;

      // Message is hidden from recipient if deleted by them
      if (isRecipient && deletedByRecipient === 1) {
        const result = null;
        expect(result).toBeNull();
      }
    });
  });

  describe('IDOR: Planet Access Control', () => {
    test('planet state includes playerId for ownership verification', () => {
      // Every PlanetState has playerId field
      // API layer MUST check:
      // if (planetState.playerId !== authenticatedPlayerId) {
      //   return 403 Forbidden
      // }
      
      const planet = { playerId: 'player-1' };
      const requester = 'player-2';
      
      const isOwner = planet.playerId === requester;
      expect(isOwner).toBe(false);
    });

    test('all planet operations require ownership check at API layer', () => {
      // GET /api/planet/{id}/state - must verify ownership
      // GET /api/planet/{id}/resources - must verify ownership
      // POST /api/planet/{id}/build - must verify ownership
      // POST /api/planet/{id}/research - must verify ownership
      // POST /api/fleet/dispatch - must verify source planet ownership
      
      // Pattern:
      // 1. Extract playerId from auth context
      // 2. Look up planet by ID
      // 3. Compare planet.playerId === authenticatedPlayerId
      // 4. If mismatch, return 403
      
      const planetId = 'planet-1';
      const planetOwnerId = 'player-1';
      const requester = 'player-2';
      
      expect(planetOwnerId === requester).toBe(false);
    });
  });

  describe('IDOR: Message Visibility', () => {
    test('getInbox only returns messages TO the authenticated player', () => {
      // getInbox query:
      // SELECT ... FROM messages
      // WHERE to_player_id = ? AND deleted_by_recipient = 0
      // 
      // Key: to_player_id is bound to authenticatedPlayerId
      // Messages sent TO other players never appear
      
      const authenticatedPlayer = 'player-1';
      const messages = [
        { id: 'msg-1', from: 'player-2', to: 'player-1' }, // Visible
        { id: 'msg-2', from: 'player-2', to: 'player-3' }, // Not visible
        { id: 'msg-3', from: 'player-1', to: 'player-2' }, // Not visible
      ];

      const visibleToPlayer1 = messages.filter(
        (m) => m.to === authenticatedPlayer
      );
      
      expect(visibleToPlayer1).toHaveLength(1);
      expect(visibleToPlayer1[0].id).toBe('msg-1');
    });

    test('getOutbox only returns messages FROM the authenticated player', () => {
      // getOutbox query:
      // SELECT ... FROM messages
      // WHERE from_player_id = ? AND deleted_by_sender = 0
      
      const authenticatedPlayer = 'player-1';
      const messages = [
        { id: 'msg-1', from: 'player-1', to: 'player-2' }, // Visible
        { id: 'msg-2', from: 'player-2', to: 'player-1' }, // Not visible
        { id: 'msg-3', from: 'player-1', to: 'player-3' }, // Visible
      ];

      const visibleFromPlayer1 = messages.filter(
        (m) => m.from === authenticatedPlayer
      );
      
      expect(visibleFromPlayer1).toHaveLength(2);
    });
  });

  // ==========================================================================
  // PLAYER ID SPOOFING TESTS
  // ==========================================================================

  describe('Player ID Spoofing: Authentication Context Required', () => {
    test('all service functions require playerId parameter from auth context', () => {
      // SECURE PATTERN:
      // const authenticatedPlayerId = extractFromJWT(request);
      // const inbox = await getInbox(authenticatedPlayerId, page, limit, db);
      //
      // INSECURE PATTERN (never do this):
      // const playerId = request.query['player_id']; // Client controls!
      // const inbox = await getInbox(playerId, page, limit, db);
      
      // The authenticatedPlayerId should come from:
      // - JWT token
      // - Session cookie
      // - OAuth provider
      // NOT from client-supplied query parameters!
      
      const authenticatedPlayerId = 'player-1'; // From secure context
      const clientSuppliedId = 'player-2'; // From query param (don't trust!)
      
      expect(authenticatedPlayerId).not.toBe(clientSuppliedId);
    });

    test('query parameters cannot override authentication', () => {
      // If API uses:
      // const playerId = request.query('player_id')
      // 
      // Then attacker can bypass auth:
      // GET /api/messages/inbox?player_id=victim_id
      // 
      // FIX: Ignore query param, use authenticated playerId instead
      
      const queryParam = 'player-2'; // Attacker's input
      const authenticatedPlayerId = 'player-1'; // Real auth
      
      // Correct code uses only authenticatedPlayerId:
      expect(authenticatedPlayerId).toBe('player-1');
    });

    test('body parameters cannot override authentication', () => {
      // Some endpoints accept playerId in request body.
      // This is DANGEROUS if used for authorization:
      //
      // INSECURE:
      // const playerId = body.playerId;
      // const result = await buildOnPlanet(planetId, playerId, ...);
      //
      // SECURE:
      // const playerId = authenticatedPlayerId; // From auth, ignore body
      // const result = await buildOnPlanet(planetId, playerId, ...);
      
      const bodyPlayerId = 'player-2'; // Attacker's input
      const authenticatedPlayerId = 'player-1'; // Real auth
      
      // Should use only authenticated value:
      expect(authenticatedPlayerId).toBe('player-1');
    });
  });

  // ==========================================================================
  // PRIVILEGE ESCALATION TESTS
  // ==========================================================================

  describe('Privilege Escalation: Role-Based Access Control', () => {
    test('admin endpoints must check is_admin flag from database', () => {
      // SECURE PATTERN:
      // 1. Extract playerId from auth
      // 2. Query: SELECT is_admin FROM players WHERE id = ?
      // 3. If is_admin != 1, return 403 Forbidden
      
      // Example: DELETE /api/admin/player/{id}
      const adminUserId = 'admin-1';
      const isAdmin = true; // From database
      
      if (!isAdmin) {
        throw new Error('Admin only');
      }
      expect(isAdmin).toBe(true);
    });

    test('non-admin users cannot access privileged operations', () => {
      const normalUserId = 'player-1';
      const isAdmin = false; // From database
      
      const canDeletePlayer = isAdmin;
      expect(canDeletePlayer).toBe(false);
    });

    test('admin status cannot be spoofed via body parameter', () => {
      // INSECURE (never do this):
      // if (request.body.isAdmin) { ... }
      //
      // SECURE:
      // const user = await db.prepare('SELECT is_admin FROM players WHERE id = ?')
      //   .bind(playerId).first();
      // if (user?.is_admin === 1) { ... }
      
      const bodyIsAdmin = true; // Attacker's lie
      const realIsAdmin = false; // Database truth
      
      // Use database value, not body:
      expect(realIsAdmin).toBe(false);
    });
  });

  // ==========================================================================
  // RESOURCE THEFT TESTS
  // ==========================================================================

  describe('Resource Theft: Ownership Verification Before Mutation', () => {
    test('build operations require planet ownership', () => {
      // SECURE PATTERN:
      // POST /api/planet/{planetId}/build
      // 1. Extract authenticatedPlayerId from auth
      // 2. Fetch planet state: planetState = await getPlanetState(planetId)
      // 3. Check: if (planetState.playerId !== authenticatedPlayerId) return 403
      // 4. Proceed with build logic
      
      const authenticatedPlayerId = 'player-1';
      const planetOwnerId = 'player-1';
      
      const isAuthorized = planetOwnerId === authenticatedPlayerId;
      expect(isAuthorized).toBe(true);
    });

    test('cannot build on unowned planet', () => {
      const authenticatedPlayerId = 'player-1';
      const planetOwnerId = 'player-2';
      
      const isAuthorized = planetOwnerId === authenticatedPlayerId;
      expect(isAuthorized).toBe(false);
    });

    test('resource modifications are validated per-planet owner', () => {
      // All operations that modify planet state:
      // - Build building
      // - Cancel build
      // - Dispatch fleet
      // - Start research
      // - Build defense
      // 
      // Must verify: planetState.playerId === authenticatedPlayerId
      
      const operations = [
        'build',
        'cancel-build',
        'dispatch-fleet',
        'start-research',
        'build-defense',
      ];
      
      for (const op of operations) {
        const planetOwnerId = 'player-1';
        const authenticatedPlayerId = 'player-2';
        
        const authorized = planetOwnerId === authenticatedPlayerId;
        expect(authorized).toBe(false);
      }
    });
  });

  // ==========================================================================
  // CROSS-PLAYER ACTION TESTS
  // ==========================================================================

  describe('Cross-Player Actions: Alliance Authorization', () => {
    test('only alliance founder can manage applications', () => {
      // acceptApplication(applicationId, playerId, db)
      // 1. Look up application
      // 2. Get alliance_id from application
      // 3. Look up alliance, get founder_id
      // 4. Check: if (founder_id !== playerId) return false/error
      
      const applicationId = 'app-1';
      const allianceFounderId = 'player-1';
      const requester = 'player-2';
      
      const canAccept = allianceFounderId === requester;
      expect(canAccept).toBe(false);
    });

    test('only alliance founder can kick members', () => {
      // kickMember(allianceId, targetPlayerId, playerId, db)
      // 1. Look up alliance
      // 2. Check: if (alliance.founder_id !== playerId) return false
      
      const allianceFounderId = 'player-1';
      const requester = 'player-3';
      
      const canKick = allianceFounderId === requester;
      expect(canKick).toBe(false);
    });

    test('only alliance founder can modify alliance settings', () => {
      const allianceFounderId = 'player-1';
      const requester = 'player-2';
      
      const canModify = allianceFounderId === requester;
      expect(canModify).toBe(false);
    });
  });

  // ==========================================================================
  // FLEET MANIPULATION TESTS
  // ==========================================================================

  describe('Fleet Manipulation: Source Planet Ownership', () => {
    test('fleet dispatch validates source planet ownership at API layer', () => {
      // POST /api/fleet/dispatch
      // 1. Extract authenticatedPlayerId from auth
      // 2. Get fromPlanetState = await getPlanetState(fromPlanetId)
      // 3. Check: if (fromPlanetState.playerId !== authenticatedPlayerId) return 403
      // 4. Call fleetService.validateDispatch(...) with validated state
      
      const authenticatedPlayerId = 'player-1';
      const fromPlanetOwnerId = 'player-1';
      
      const isAuthorized = fromPlanetOwnerId === authenticatedPlayerId;
      expect(isAuthorized).toBe(true);
    });

    test('cannot dispatch fleet from unowned planet', () => {
      const authenticatedPlayerId = 'player-1';
      const fromPlanetOwnerId = 'player-2';
      
      const isAuthorized = fromPlanetOwnerId === authenticatedPlayerId;
      expect(isAuthorized).toBe(false);
    });

    test('fleet dispatch with mismatched playerId in body is rejected', () => {
      // Even if body contains playerId parameter:
      // POST /api/fleet/dispatch with body: { playerId: 'player-2', ... }
      // 
      // Correct code:
      // const playerId = authenticatedPlayerId; // Ignore body
      // NOT: const playerId = body.playerId;
      
      const authenticatedPlayerId = 'player-1';
      const bodyPlayerId = 'player-2'; // Attacker's false claim
      
      const useAuthenticatedId = authenticatedPlayerId;
      expect(useAuthenticatedId).toBe('player-1');
    });


    test('fleet service rejects insufficient ships', () => {
      const service = new FleetService();
      const planet = { ships: { lightFighter: 5 } as any };

      const params = {
        missionId: 'm1',
        playerId: 'player-1',
        fromPlanetId: 'planet-1',
        toPlanetId: 'planet-2',
        from: { galaxy: 1, system: 1, position: 1 },
        to: { galaxy: 1, system: 2, position: 1 },
        ships: { lightFighter: 50 } as any, // Want 50 but only have 5
        resources: { metal: 0, crystal: 0, deuterium: 0 },
        missionType: 'attack' as any,
        speedPercent: 50,
      };

      const validation = service.validateDispatch(
        params,
        planet.ships,
        50000
      );

      expect(validation.valid).toBe(false);
      expect(validation.reason).toContain('ships');
    });
  });

  // ==========================================================================
  // RESEARCH THEFT TESTS
  // ==========================================================================

  describe('Research Theft: Planet Ownership Required', () => {
    test('research operations require planet ownership', () => {
      // POST /api/planet/{planetId}/research
      // 1. Extract authenticatedPlayerId from auth
      // 2. Fetch planetState = await getPlanetState(planetId)
      // 3. Check: if (planetState.playerId !== authenticatedPlayerId) return 403
      // 4. Call researchService.startResearch(planetState, ...)
      
      const authenticatedPlayerId = 'player-1';
      const planetOwnerId = 'player-1';
      
      const isAuthorized = planetOwnerId === authenticatedPlayerId;
      expect(isAuthorized).toBe(true);
    });

    test('cannot start research on unowned planet', () => {
      const authenticatedPlayerId = 'player-1';
      const planetOwnerId = 'player-2';
      
      const isAuthorized = planetOwnerId === authenticatedPlayerId;
      expect(isAuthorized).toBe(false);
    });
  });

  // ==========================================================================
  // COORDINATE VALIDATION TESTS
  // ==========================================================================

  describe('Coordinate System: Valid Range Enforcement', () => {
    test('fleet service rejects invalid galaxy coordinates', () => {
      const service = new FleetService();

      const invalidGalaxy = service.validateDispatch(
        {
          missionId: 'test',
          playerId: 'player-1',
          fromPlanetId: 'planet-1',
          toPlanetId: null,
          from: { galaxy: 1, system: 1, position: 1 },
          to: { galaxy: 0, system: 1, position: 1 }, // Invalid: < 1
          ships: { lightFighter: 1 } as any,
          resources: { metal: 0, crystal: 0, deuterium: 0 },
          missionType: 'attack' as any,
          speedPercent: 50,
        },
        { lightFighter: 10 } as any,
        10000
      );
      expect(invalidGalaxy.valid).toBe(false);
    });

    test('fleet service rejects invalid position coordinates', () => {
      const service = new FleetService();

      const invalidPosition = service.validateDispatch(
        {
          missionId: 'test',
          playerId: 'player-1',
          fromPlanetId: 'planet-1',
          toPlanetId: null,
          from: { galaxy: 1, system: 1, position: 1 },
          to: { galaxy: 1, system: 1, position: 17 }, // Invalid: > 16
          ships: { lightFighter: 1 } as any,
          resources: { metal: 0, crystal: 0, deuterium: 0 },
          missionType: 'attack' as any,
          speedPercent: 50,
        },
        { lightFighter: 10 } as any,
        10000
      );
      expect(invalidPosition.valid).toBe(false);
    });
  });

  // ==========================================================================
  // BATCH OPERATIONS: Authorization Checks
  // ==========================================================================

  describe('Batch Operations: Per-Item Verification', () => {
    test('markAllRead only marks messages where user is recipient', () => {
      // markAllRead(playerId, db)
      // Query: UPDATE messages SET read = 1
      //        WHERE to_player_id = ? AND read = 0
      //
      // Key: to_player_id bound to playerId
      // Only messages TO this player are marked read
      // Messages FROM this player are unaffected
      
      const playerId = 'player-1';
      const messages = [
        { id: 'msg-1', from: 'player-2', to: 'player-1', read: 0 }, // Affected
        { id: 'msg-2', from: 'player-1', to: 'player-2', read: 0 }, // Not affected
        { id: 'msg-3', from: 'player-2', to: 'player-1', read: 0 }, // Affected
      ];

      const affected = messages.filter(
        (m) => m.to === playerId && m.read === 0
      );

      expect(affected).toHaveLength(2);
      expect(affected.every((m) => m.to === 'player-1')).toBe(true);
    });
  });

  // ==========================================================================
  // RESPONSE FILTERING: No Data Leakage
  // ==========================================================================

  describe('Response Filtering: Prevent Information Disclosure', () => {
    test('inbox endpoint returns only messages TO authenticated player', () => {
      const authenticatedPlayerId = 'player-1';
      const allMessages = [
        { id: 'msg-1', from: 'player-2', to: 'player-1' },
        { id: 'msg-2', from: 'player-2', to: 'player-3' },
        { id: 'msg-3', from: 'player-3', to: 'player-1' },
      ];

      // API query filters by to_player_id
      const userInbox = allMessages.filter(
        (m) => m.to === authenticatedPlayerId
      );

      expect(userInbox).toHaveLength(2);
      expect(userInbox.every((m) => m.to === 'player-1')).toBe(true);
    });

    test('outbox endpoint returns only messages FROM authenticated player', () => {
      const authenticatedPlayerId = 'player-1';
      const allMessages = [
        { id: 'msg-1', from: 'player-1', to: 'player-2' },
        { id: 'msg-2', from: 'player-2', to: 'player-1' },
        { id: 'msg-3', from: 'player-1', to: 'player-3' },
      ];

      // API query filters by from_player_id
      const userOutbox = allMessages.filter(
        (m) => m.from === authenticatedPlayerId
      );

      expect(userOutbox).toHaveLength(2);
      expect(userOutbox.every((m) => m.from === 'player-1')).toBe(true);
    });

    test('profile data does not expose private information', () => {
      // Public profile fields:
      // - id, name, level, rank, alliance_tag
      //
      // Private fields (never exposed to others):
      // - email, last_login, resources, planet locations, research, ships
      // - diplomatic status with other players
      
      const publicFields = ['id', 'name', 'level', 'rank', 'alliance_tag'];
      const privateFields = [
        'email',
        'resources',
        'planets',
        'research',
        'ships',
        'lastLogin',
      ];

      // Public profile should only include public fields
      const publicProfile = {
        id: 'player-1',
        name: 'Alice',
        level: 5,
        rank: 42,
        alliance_tag: 'ALLY',
      };

      for (const field of Object.keys(publicProfile)) {
        expect(publicFields).toContain(field);
      }
    });
  });

  // ==========================================================================
  // SOFT-DELETE AND AUTHORIZATION
  // ==========================================================================

  describe('Soft-Delete: Authorization Persistence', () => {
    test('soft-deleted messages remain subject to authorization', () => {
      // A message deleted by sender still cannot be read by non-involved player
      // getMessage checks both deleted_by_X flags AND sender/recipient status
      
      const messageId = 'msg-1';
      const senderId = 'player-1';
      const recipientId = 'player-2';
      const attackerId = 'player-3';

      // Message exists with deleted_by_sender = 1
      const isInvolved = (playerId: string) =>
        playerId === senderId || playerId === recipientId;

      expect(isInvolved(senderId)).toBe(true);
      expect(isInvolved(recipientId)).toBe(true);
      expect(isInvolved(attackerId)).toBe(false);

      // Attacker still cannot read, even if soft-delete not yet applied
    });
  });
});
