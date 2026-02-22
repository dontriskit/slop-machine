/**
 * Unit tests for Marketplace Trade Validation and Edge Cases
 *
 * Tests the marketplace/trading system without mocking D1 fully.
 * Uses in-memory storage to simulate database behavior.
 */
import { describe, test, expect, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';

// ============================================================================
// TRADE OFFER DATA STRUCTURES & CONSTANTS
// ============================================================================

interface TradeOffer {
  id: string;
  player_id: string;
  planet_id: string;
  offer_resource: string;
  offer_amount: number;
  want_resource: string;
  want_amount: number;
  status: 'open' | 'accepted' | 'cancelled';
  created_at: number;
}

interface PlayerResources {
  metal: number;
  crystal: number;
  deuterium: number;
}

// Trade ratios: metal=1, crystal=2, deuterium=4 (value per unit)
const TRADE_RATIOS: Record<string, number> = {
  metal: 1,
  crystal: 2,
  deuterium: 4,
};

const TRADE_RESOURCE_TYPES = ['metal', 'crystal', 'deuterium'];

// ============================================================================
// IN-MEMORY MARKETPLACE STORAGE
// ============================================================================

class MarketplaceStorage {
  private offers: Map<string, TradeOffer> = new Map();

  createOffer(offer: TradeOffer): void {
    this.offers.set(offer.id, { ...offer });
  }

  getOffer(offerId: string): TradeOffer | null {
    const offer = this.offers.get(offerId);
    return offer ? { ...offer } : null;
  }

  updateOfferStatus(offerId: string, status: 'open' | 'accepted' | 'cancelled'): TradeOffer | null {
    const offer = this.offers.get(offerId);
    if (offer) {
      offer.status = status;
      return { ...offer };
    }
    return null;
  }

  getOpenOffers(): TradeOffer[] {
    return Array.from(this.offers.values()).filter((o) => o.status === 'open');
  }

  getOffersByPlayer(playerId: string): TradeOffer[] {
    return Array.from(this.offers.values()).filter((o) => o.player_id === playerId);
  }

  reset(): void {
    this.offers.clear();
  }
}

// ============================================================================
// MARKETPLACE SERVICE
// ============================================================================

/**
 * Validate trade ratio: offer_amount * offer_ratio >= want_amount * want_ratio
 */
function validateTradeRatio(
  offerResource: string,
  offerAmount: number,
  wantResource: string,
  wantAmount: number
): boolean {
  const offerValue = offerAmount * TRADE_RATIOS[offerResource];
  const wantValue = wantAmount * TRADE_RATIOS[wantResource];
  return offerValue >= wantValue;
}

/**
 * Create a new trade offer
 */
function createTradeOffer(
  storage: MarketplaceStorage,
  playerId: string,
  planetId: string,
  offerResource: string,
  offerAmount: number,
  wantResource: string,
  wantAmount: number
): TradeOffer {
  // Validate inputs
  if (offerAmount <= 0) throw new Error('Offer amount must be > 0');
  if (wantAmount <= 0) throw new Error('Want amount must be > 0');
  if (!TRADE_RESOURCE_TYPES.includes(offerResource)) throw new Error('Invalid offer resource');
  if (!TRADE_RESOURCE_TYPES.includes(wantResource)) throw new Error('Invalid want resource');
  if (offerResource === wantResource) throw new Error('Cannot trade same resource');

  // Validate trade ratio
  if (!validateTradeRatio(offerResource, offerAmount, wantResource, wantAmount)) {
    throw new Error('Trade ratio invalid: offer not worth want amount');
  }

  const offer: TradeOffer = {
    id: `offer_${randomUUID()}`,
    player_id: playerId,
    planet_id: planetId,
    offer_resource: offerResource,
    offer_amount: offerAmount,
    want_resource: wantResource,
    want_amount: wantAmount,
    status: 'open',
    created_at: Date.now(),
  };

  storage.createOffer(offer);
  return offer;
}

/**
 * Accept a trade offer
 */
function acceptTradeOffer(
  storage: MarketplaceStorage,
  offerId: string,
  acceptingPlayerId: string,
  acceptingPlayerResources: PlayerResources,
  offeringPlayerResources: PlayerResources
): void {
  const offer = storage.getOffer(offerId);
  if (!offer) throw new Error('Offer not found');
  if (offer.status !== 'open') throw new Error('Offer is not open');

  // Prevent self-trading
  if (offer.player_id === acceptingPlayerId) {
    throw new Error('Cannot accept your own offer');
  }

  // Check accepting player has resources (wants to give want_resource)
  const acceptorHasResources =
    acceptingPlayerResources[offer.want_resource as keyof PlayerResources] >= offer.want_amount;
  if (!acceptorHasResources) {
    throw new Error('Accepting player has insufficient resources');
  }

  // Check offering player still has resources (wants to give offer_resource)
  const offerorHasResources =
    offeringPlayerResources[offer.offer_resource as keyof PlayerResources] >= offer.offer_amount;
  if (!offerorHasResources) {
    throw new Error('Offering player has insufficient resources (offer expired)');
  }

  // Accept the offer
  storage.updateOfferStatus(offerId, 'accepted');
}

/**
 * Cancel a trade offer
 */
function cancelTradeOffer(
  storage: MarketplaceStorage,
  offerId: string,
  playerId: string
): void {
  const offer = storage.getOffer(offerId);
  if (!offer) throw new Error('Offer not found');
  if (offer.status !== 'open') throw new Error('Offer is not open');

  // Only offerer can cancel
  if (offer.player_id !== playerId) {
    throw new Error('Only the offer creator can cancel');
  }

  storage.updateOfferStatus(offerId, 'cancelled');
}

/**
 * Get open offers
 */
function getOpenOffers(storage: MarketplaceStorage): TradeOffer[] {
  return storage.getOpenOffers();
}

/**
 * Get offers by player
 */
function getOffersByPlayer(storage: MarketplaceStorage, playerId: string): TradeOffer[] {
  return storage.getOffersByPlayer(playerId);
}

// ============================================================================
// TESTS
// ============================================================================

describe('Marketplace Trade Validation and Edge Cases', () => {
  let storage: MarketplaceStorage;

  beforeEach(() => {
    storage = new MarketplaceStorage();
  });

  // Test 1: Create trade offer with valid parameters
  test('should create trade offer with valid parameters', () => {
    const offer = createTradeOffer(storage, 'player1', 'planet1', 'metal', 1000, 'crystal', 400);
    expect(offer).toBeDefined();
    expect(offer.player_id).toBe('player1');
    expect(offer.planet_id).toBe('planet1');
    expect(offer.offer_resource).toBe('metal');
    expect(offer.offer_amount).toBe(1000);
    expect(offer.want_resource).toBe('crystal');
    expect(offer.want_amount).toBe(400);
    expect(offer.status).toBe('open');
    expect(offer.created_at).toBeLessThanOrEqual(Date.now());
  });

  // Test 2: Create offer with 0 amount should fail
  test('should reject offer with 0 offer amount', () => {
    expect(() =>
      createTradeOffer(storage, 'player1', 'planet1', 'metal', 0, 'crystal', 400)
    ).toThrow('Offer amount must be > 0');
  });

  // Test 3: Create offer with 0 want amount should fail
  test('should reject offer with 0 want amount', () => {
    expect(() =>
      createTradeOffer(storage, 'player1', 'planet1', 'metal', 1000, 'crystal', 0)
    ).toThrow('Want amount must be > 0');
  });

  // Test 4: Accept own offer should fail
  test('should prevent accepting own offer', () => {
    const offer = createTradeOffer(storage, 'player1', 'planet1', 'metal', 1000, 'crystal', 400);

    const playerResources: PlayerResources = { metal: 0, crystal: 500, deuterium: 0 };
    expect(() =>
      acceptTradeOffer(storage, offer.id, 'player1', playerResources, playerResources)
    ).toThrow('Cannot accept your own offer');
  });

  // Test 5: Accept offer with insufficient resources should fail
  test('should prevent accepting offer with insufficient resources', () => {
    const offer = createTradeOffer(storage, 'player1', 'planet1', 'metal', 1000, 'crystal', 400);

    const acceptorResources: PlayerResources = { metal: 0, crystal: 100, deuterium: 0 }; // Not enough crystal
    const offerorResources: PlayerResources = { metal: 2000, crystal: 0, deuterium: 0 };

    expect(() =>
      acceptTradeOffer(storage, offer.id, 'player2', acceptorResources, offerorResources)
    ).toThrow('Accepting player has insufficient resources');
  });

  // Test 6: Cancel own offer should succeed
  test('should allow cancelling own offer', () => {
    const offer = createTradeOffer(storage, 'player1', 'planet1', 'metal', 1000, 'crystal', 400);

    cancelTradeOffer(storage, offer.id, 'player1');
    const cancelledOffer = storage.getOffer(offer.id);
    expect(cancelledOffer?.status).toBe('cancelled');
  });

  // Test 7: Cancel someone else's offer should fail
  test('should prevent cancelling someone else\'s offer', () => {
    const offer = createTradeOffer(storage, 'player1', 'planet1', 'metal', 1000, 'crystal', 400);

    expect(() => cancelTradeOffer(storage, offer.id, 'player2')).toThrow(
      'Only the offer creator can cancel'
    );
  });

  // Test 8: Trade ratio calculation
  test('should validate trade ratio correctly', () => {
    // Valid: 1000 metal (value=1000) for 400 crystal (value=800)
    const validOffer = createTradeOffer(
      storage,
      'player1',
      'planet1',
      'metal',
      1000,
      'crystal',
      400
    );
    expect(validOffer).toBeDefined();

    // Invalid: 500 metal (value=500) for 400 crystal (value=800) - not enough value
    expect(() =>
      createTradeOffer(storage, 'player1', 'planet1', 'metal', 500, 'crystal', 400)
    ).toThrow('Trade ratio invalid');
  });

  // Test 9: Accept valid offer should succeed
  test('should accept valid trade offer', () => {
    const offer = createTradeOffer(storage, 'player1', 'planet1', 'metal', 1000, 'crystal', 400);

    const acceptorResources: PlayerResources = { metal: 0, crystal: 500, deuterium: 0 };
    const offerorResources: PlayerResources = { metal: 2000, crystal: 0, deuterium: 0 };

    acceptTradeOffer(storage, offer.id, 'player2', acceptorResources, offerorResources);
    const acceptedOffer = storage.getOffer(offer.id);
    expect(acceptedOffer?.status).toBe('accepted');
  });

  // Test 10: Expired offer handling (offer created long ago, offerer no longer has resources)
  test('should detect expired offer when offerer lacks resources', () => {
    const offer = createTradeOffer(storage, 'player1', 'planet1', 'metal', 1000, 'crystal', 400);

    // Acceptor has resources, but offerer doesn't anymore
    const acceptorResources: PlayerResources = { metal: 0, crystal: 500, deuterium: 0 };
    const offerorResources: PlayerResources = { metal: 100, crystal: 0, deuterium: 0 }; // Not enough metal

    expect(() =>
      acceptTradeOffer(storage, offer.id, 'player2', acceptorResources, offerorResources)
    ).toThrow('Offering player has insufficient resources');
  });

  // Test 11: Multiple offers tracking
  test('should track multiple offers per player', () => {
    createTradeOffer(storage, 'player1', 'planet1', 'metal', 1000, 'crystal', 400);
    createTradeOffer(storage, 'player1', 'planet2', 'crystal', 500, 'deuterium', 100);

    const openOffers = getOpenOffers(storage);
    expect(openOffers.length).toBe(2);
    expect(openOffers.filter((o) => o.player_id === 'player1').length).toBe(2);
  });

  // Test 12: Invalid resource types should fail
  test('should reject invalid resource types', () => {
    expect(() =>
      createTradeOffer(storage, 'player1', 'planet1', 'invalid', 1000, 'crystal', 400)
    ).toThrow('Invalid offer resource');

    expect(() =>
      createTradeOffer(storage, 'player1', 'planet1', 'metal', 1000, 'invalid', 400)
    ).toThrow('Invalid want resource');
  });

  // Test 13: Cannot trade same resource to self
  test('should reject trading same resource type', () => {
    expect(() =>
      createTradeOffer(storage, 'player1', 'planet1', 'metal', 1000, 'metal', 500)
    ).toThrow('Cannot trade same resource');
  });
});
