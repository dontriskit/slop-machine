/**
 * Dark Matter Service
 *
 * Manages the premium currency system. Dark matter can be:
 *  - Earned through expeditions, achievements, special rewards
 *  - Spent on officers, instant finishes, merchant trades, cosmetics
 *
 * Service provides:
 *  - Balance tracking per player
 *  - Income/expense ledger
 *  - Integration with officers, queue finish, merchant trades
 */

import type {
  DarkMatterBalance,
  DarkMatterSource,
  DarkMatterPurpose,
  DarkMatterTransaction,
} from '../types';

// ============================================================================
// DARK MATTER BALANCE FUNCTIONS
// ============================================================================

interface DMRow {
  player_id: string;
  balance: number;
  updated_at: number;
}

function rowToBalance(row: DMRow): DarkMatterBalance {
  return {
    playerId: row.player_id,
    balance: row.balance,
    updatedAt: row.updated_at,
  };
}

/**
 * Get current dark matter balance for a player.
 * Creates a balance record with 0 DM if one doesn't exist.
 *
 * @param db - D1 database binding
 * @param playerId - Player ID
 * @returns Current balance
 */
export async function getDarkMatter(
  db: D1Database,
  playerId: string
): Promise<DarkMatterBalance> {
  const existing = await db
    .prepare('SELECT * FROM dark_matter WHERE player_id = ?')
    .bind(playerId)
    .first() as DMRow | null;

  if (existing) {
    return rowToBalance(existing);
  }

  // Auto-create zero balance
  const nowSec = Math.floor(Date.now() / 1000);
  await db
    .prepare('INSERT INTO dark_matter (player_id, balance, updated_at) VALUES (?, 0, ?)')
    .bind(playerId, nowSec)
    .run();

  return {
    playerId,
    balance: 0,
    updatedAt: nowSec,
  };
}

/**
 * Add dark matter to a player's balance.
 * Records the transaction in the ledger.
 *
 * @param db - D1 database binding
 * @param playerId - Player ID
 * @param amount - Amount to add (positive)
 * @param source - Source of dark matter (expedition, achievement, purchase, reward)
 * @param reference - Optional reference (expedition ID, achievement ID, etc.)
 * @returns Updated balance
 */
export async function addDarkMatter(
  db: D1Database,
  playerId: string,
  amount: number,
  source: DarkMatterSource,
  reference?: string
): Promise<DarkMatterBalance> {
  if (amount <= 0) {
    throw new Error('Amount must be positive');
  }

  // Get current balance
  const current = await getDarkMatter(db, playerId);

  // Record transaction
  const txnId = crypto.randomUUID();
  const nowSec = Math.floor(Date.now() / 1000);
  const newBalance = current.balance + amount;

  await db
    .prepare(
      'INSERT INTO dark_matter_transactions (id, player_id, amount, source, balance_before, balance_after, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .bind(txnId, playerId, amount, source, current.balance, newBalance, nowSec)
    .run();

  if (reference) {
    await db
      .prepare('UPDATE dark_matter_transactions SET reference = ? WHERE id = ?')
      .bind(reference, txnId)
      .run();
  }

  // Update balance
  await db
    .prepare('UPDATE dark_matter SET balance = ?, updated_at = ? WHERE player_id = ?')
    .bind(newBalance, nowSec, playerId)
    .run();

  return {
    playerId,
    balance: newBalance,
    updatedAt: nowSec,
  };
}

/**
 * Spend dark matter from a player's balance.
 * Throws if insufficient funds.
 * Records the transaction in the ledger.
 *
 * @param db - D1 database binding
 * @param playerId - Player ID
 * @param amount - Amount to spend (positive)
 * @param purpose - Purpose of spending (officer, instant_finish, merchant, cosmetic)
 * @param reference - Optional reference (queue item ID, offer ID, etc.)
 * @returns Updated balance
 */
export async function spendDarkMatter(
  db: D1Database,
  playerId: string,
  amount: number,
  purpose: DarkMatterPurpose,
  reference?: string
): Promise<DarkMatterBalance> {
  if (amount <= 0) {
    throw new Error('Amount must be positive');
  }

  // Get current balance
  const current = await getDarkMatter(db, playerId);

  if (current.balance < amount) {
    throw new Error(`Insufficient dark matter: have ${current.balance}, need ${amount}`);
  }

  // Record transaction
  const txnId = crypto.randomUUID();
  const nowSec = Math.floor(Date.now() / 1000);
  const newBalance = current.balance - amount;

  await db
    .prepare(
      'INSERT INTO dark_matter_transactions (id, player_id, amount, purpose, balance_before, balance_after, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .bind(txnId, playerId, -amount, purpose, current.balance, newBalance, nowSec)
    .run();

  if (reference) {
    await db
      .prepare('UPDATE dark_matter_transactions SET reference = ? WHERE id = ?')
      .bind(reference, txnId)
      .run();
  }

  // Update balance
  await db
    .prepare('UPDATE dark_matter SET balance = ?, updated_at = ? WHERE player_id = ?')
    .bind(newBalance, nowSec, playerId)
    .run();

  return {
    playerId,
    balance: newBalance,
    updatedAt: nowSec,
  };
}

// ============================================================================
// TRANSACTION HISTORY
// ============================================================================

interface TxnRow {
  id: string;
  player_id: string;
  amount: number;
  source?: string;
  purpose?: string;
  reference?: string;
  balance_before: number;
  balance_after: number;
  created_at: number;
}

function rowToTransaction(row: TxnRow): DarkMatterTransaction {
  return {
    id: row.id,
    playerId: row.player_id,
    amount: row.amount,
    source: row.source as DarkMatterSource | undefined,
    purpose: row.purpose as DarkMatterPurpose | undefined,
    reference: row.reference,
    balanceBefore: row.balance_before,
    balanceAfter: row.balance_after,
    createdAt: row.created_at,
  };
}

/**
 * Get transaction history for a player.
 *
 * @param db - D1 database binding
 * @param playerId - Player ID
 * @param limit - Max results (default 50)
 * @returns Array of transactions, most recent first
 */
export async function getDarkMatterHistory(
  db: D1Database,
  playerId: string,
  limit: number = 50
): Promise<DarkMatterTransaction[]> {
  const rows = await db
    .prepare(
      'SELECT * FROM dark_matter_transactions WHERE player_id = ? ORDER BY created_at DESC LIMIT ?'
    )
    .bind(playerId, limit)
    .all();

  return (rows.results as unknown as TxnRow[]).map(rowToTransaction);
}

// ============================================================================
// QUEUE INSTANT FINISH
// ============================================================================

/**
 * Spend dark matter to instantly complete a build/research queue item.
 * Cost formula: remaining_seconds / 10 (rounded up)
 * Example: 3600 seconds remaining = 360 DM cost
 *
 * @param db - D1 database binding
 * @param playerId - Player ID
 * @param planetId - Planet ID with queue item
 * @param queueType - 'building' or 'research'
 * @param queueIndex - Index in queue array (0-based)
 * @returns Updated balance
 */
export async function instantFinish(
  db: D1Database,
  playerId: string,
  planetId: string,
  queueType: 'building' | 'research',
  queueIndex: number
): Promise<DarkMatterBalance> {
  const nowMs = Date.now();
  const table = queueType === 'building' ? 'planets' : 'planets';  // both stored in planets.json

  // Fetch planet state (stored as JSON in planets table)
  const planetRow = await db
    .prepare('SELECT * FROM planets WHERE id = ? AND player_id = ?')
    .bind(planetId, playerId)
    .first() as { planet_state: string } | null;

  if (!planetRow) {
    throw new Error(`Planet ${planetId} not found`);
  }

  let state: any;
  try {
    state = JSON.parse(planetRow.planet_state);
  } catch (e) {
    throw new Error('Invalid planet state JSON');
  }

  // Get the queue item
  const queue = queueType === 'building' ? state.queue : state.researchQueue;
  if (!queue || queue.length <= queueIndex) {
    throw new Error(`Queue item ${queueIndex} not found`);
  }

  const item = queue[queueIndex];
  const timeEndMs = item.timeEnd || item.end_time;  // normalize field names

  if (timeEndMs <= nowMs) {
    throw new Error('Queue item already completed');
  }

  // Calculate cost
  const remainingMs = timeEndMs - nowMs;
  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const cost = Math.ceil(remainingSeconds / 10);

  // Spend dark matter
  const ref = `${queueType}_${queueIndex}_${planetId}`;
  const balance = await spendDarkMatter(db, playerId, cost, 'instant_finish', ref);

  // TODO: Update queue item to complete immediately
  // This would normally notify a Durable Object or cron job to process the queue

  return balance;
}

// ============================================================================
// MERCHANT TRADE
// ============================================================================

/**
 * Trade resources using the merchant (NPC trade).
 * Conversion rate: 3 metal = 2 crystal = 1 deuterium (in value)
 *
 * Example trades:
 *  - 300 metal → 200 crystal
 *  - 300 metal → 100 deuterium
 *  - 200 crystal → 100 deuterium
 *
 * Cost: No dark matter cost, but resources must be available.
 * (In OGame, the Merchant building provides this without DM cost.)
 *
 * @param db - D1 database binding
 * @param playerId - Player ID
 * @param planetId - Planet ID with resources
 * @param offerResource - 'metal' | 'crystal' | 'deuterium'
 * @param offerAmount - Amount to trade away
 * @param wantResource - 'metal' | 'crystal' | 'deuterium'
 * @returns Trade result with resources exchanged
 */
export async function merchantTrade(
  db: D1Database,
  playerId: string,
  planetId: string,
  offerResource: 'metal' | 'crystal' | 'deuterium',
  offerAmount: number,
  wantResource: 'metal' | 'crystal' | 'deuterium'
): Promise<{
  offered: number;
  received: number;
  offer: string;
  want: string;
}> {
  if (offerResource === wantResource) {
    throw new Error('Cannot trade resource for itself');
  }

  if (offerAmount <= 0) {
    throw new Error('Offer amount must be positive');
  }

  // Calculate exchange rate
  // Conversion: 3 metal = 2 crystal = 1 deuterium
  const metalValue = 1;
  const crystalValue = 1.5;  // 3 metal = 2 crystal => 1 crystal = 1.5 metal
  const deutValue = 3;      // 3 metal = 1 deut

  const resourceValues: Record<string, number> = {
    metal: metalValue,
    crystal: crystalValue,
    deuterium: deutValue,
  };

  const offerValue = offerAmount * resourceValues[offerResource];
  const received = Math.floor(offerValue / resourceValues[wantResource]);

  if (received <= 0) {
    throw new Error('Exchange results in 0 resources');
  }

  // TODO: Validate player has resources and deduct, add to planet
  // This would fetch planet state, check resources, and update

  return {
    offered: offerAmount,
    received,
    offer: offerResource,
    want: wantResource,
  };
}

// ============================================================================
// CONVENIENCE CLASS WRAPPER
// ============================================================================

export class DarkMatterService {
  async getBalance(db: D1Database, playerId: string): Promise<DarkMatterBalance> {
    return getDarkMatter(db, playerId);
  }

  async add(
    db: D1Database,
    playerId: string,
    amount: number,
    source: DarkMatterSource,
    reference?: string
  ): Promise<DarkMatterBalance> {
    return addDarkMatter(db, playerId, amount, source, reference);
  }

  async spend(
    db: D1Database,
    playerId: string,
    amount: number,
    purpose: DarkMatterPurpose,
    reference?: string
  ): Promise<DarkMatterBalance> {
    return spendDarkMatter(db, playerId, amount, purpose, reference);
  }

  async getHistory(
    db: D1Database,
    playerId: string,
    limit?: number
  ): Promise<DarkMatterTransaction[]> {
    return getDarkMatterHistory(db, playerId, limit);
  }

  async instantFinish(
    db: D1Database,
    playerId: string,
    planetId: string,
    queueType: 'building' | 'research',
    queueIndex: number
  ): Promise<DarkMatterBalance> {
    return instantFinish(db, playerId, planetId, queueType, queueIndex);
  }

  async merchantTrade(
    db: D1Database,
    playerId: string,
    planetId: string,
    offerResource: 'metal' | 'crystal' | 'deuterium',
    offerAmount: number,
    wantResource: 'metal' | 'crystal' | 'deuterium'
  ): Promise<{
    offered: number;
    received: number;
    offer: string;
    want: string;
  }> {
    return merchantTrade(db, playerId, planetId, offerResource, offerAmount, wantResource);
  }
}

/** Singleton instance for global use */
export const darkMatterService = new DarkMatterService();
