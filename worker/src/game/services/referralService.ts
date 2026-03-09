/**
 * Referral Service
 *
 * Invite-a-friend system. Each player gets a unique 8-char referral code on
 * registration. When a new player applies a valid code, both parties receive
 * 250 dark matter as a bonus.
 *
 * Rules:
 *  - A player can only apply one referral code (one-time use per account)
 *  - A player cannot apply their own code
 *  - The referrer can earn bonuses from multiple referrals
 */

// ============================================================================
// CONSTANTS
// ============================================================================

export const REFERRAL_BONUS_DARK_MATTER = 250;

// ============================================================================
// TYPES
// ============================================================================

export interface ReferralStats {
  playerId: string;
  referralCode: string;
  inviteLink: string;
  totalReferrals: number;
  totalBonusEarned: number;
}

export interface ApplyReferralResult {
  success: boolean;
  referrerId: string;
  refereeId: string;
  bonusAmount: number;
}

// ============================================================================
// CODE GENERATION
// ============================================================================

/**
 * Generate a cryptographically random 8-character alphanumeric referral code.
 */
export function generateReferralCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // avoid ambiguous 0/O, 1/I
  let code = '';
  const randomValues = new Uint8Array(8);
  crypto.getRandomValues(randomValues);
  for (let i = 0; i < 8; i++) {
    code += chars[randomValues[i] % chars.length];
  }
  return code;
}

// ============================================================================
// REGISTRATION HOOK
// ============================================================================

/**
 * Assign a unique referral code to a newly registered player.
 * Called immediately after INSERT into players.
 *
 * Retries up to 5 times in the unlikely event of a collision.
 */
export async function assignReferralCode(
  db: D1Database,
  playerId: string
): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateReferralCode();
    try {
      await db
        .prepare('UPDATE players SET referral_code = ? WHERE id = ?')
        .bind(code, playerId)
        .run();
      return code;
    } catch {
      // UNIQUE constraint violation — try again
    }
  }
  throw new Error('Failed to assign unique referral code after 5 attempts');
}

// ============================================================================
// APPLY CODE
// ============================================================================

/**
 * Apply a referral code on behalf of a player.
 *
 * Validates:
 *  - Code exists and belongs to a known player
 *  - Referee has not already used a referral code
 *  - Referee is not the code owner
 *
 * On success:
 *  - Records the referral in the referrals table
 *  - Marks the referee's `referred_by` column
 *  - Grants 250 DM to both parties via dark_matter / dark_matter_transactions
 */
export async function applyReferralCode(
  db: D1Database,
  refereeId: string,
  code: string
): Promise<ApplyReferralResult> {
  const upperCode = code.trim().toUpperCase();

  // Look up the referrer by code
  const referrerRow = await db
    .prepare('SELECT id FROM players WHERE referral_code = ?')
    .bind(upperCode)
    .first() as { id: string } | null;

  if (!referrerRow) {
    throw new Error('Invalid referral code');
  }

  const referrerId = referrerRow.id;

  if (referrerId === refereeId) {
    throw new Error('Cannot apply your own referral code');
  }

  // Check referee has not already applied a code
  const existingReferral = await db
    .prepare('SELECT id FROM referrals WHERE referee_id = ?')
    .bind(refereeId)
    .first();

  if (existingReferral) {
    throw new Error('You have already applied a referral code');
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const referralId = crypto.randomUUID();

  // Record the referral
  await db
    .prepare(
      'INSERT INTO referrals (id, referrer_id, referee_id, code, bonus_amount, applied_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .bind(referralId, referrerId, refereeId, upperCode, REFERRAL_BONUS_DARK_MATTER, nowSec)
    .run();

  // Mark referred_by on referee player row
  await db
    .prepare('UPDATE players SET referred_by = ? WHERE id = ?')
    .bind(upperCode, refereeId)
    .run();

  // Grant dark matter to both parties
  await _grantDarkMatter(db, referrerId, REFERRAL_BONUS_DARK_MATTER, referralId, nowSec);
  await _grantDarkMatter(db, refereeId, REFERRAL_BONUS_DARK_MATTER, referralId, nowSec);

  return {
    success: true,
    referrerId,
    refereeId,
    bonusAmount: REFERRAL_BONUS_DARK_MATTER,
  };
}

/**
 * Internal helper: upsert dark_matter balance and insert transaction record.
 * Mirrors the logic in darkMatterService without importing it (to avoid
 * circular dependencies and to work cleanly in tests).
 */
async function _grantDarkMatter(
  db: D1Database,
  playerId: string,
  amount: number,
  referralId: string,
  nowSec: number
): Promise<void> {
  // Upsert balance row
  const existing = await db
    .prepare('SELECT balance FROM dark_matter WHERE player_id = ?')
    .bind(playerId)
    .first() as { balance: number } | null;

  const balanceBefore = existing?.balance ?? 0;
  const balanceAfter = balanceBefore + amount;

  if (existing) {
    await db
      .prepare('UPDATE dark_matter SET balance = ?, updated_at = ? WHERE player_id = ?')
      .bind(balanceAfter, nowSec, playerId)
      .run();
  } else {
    await db
      .prepare('INSERT INTO dark_matter (player_id, balance, updated_at) VALUES (?, ?, ?)')
      .bind(playerId, balanceAfter, nowSec)
      .run();
  }

  // Record transaction
  const txnId = crypto.randomUUID();
  await db
    .prepare(
      'INSERT INTO dark_matter_transactions (id, player_id, amount, source, balance_before, balance_after, reference, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .bind(txnId, playerId, amount, 'referral', balanceBefore, balanceAfter, referralId, nowSec)
    .run();
}

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Get a player's referral code and invite link.
 */
export async function getReferralCode(
  db: D1Database,
  playerId: string,
  baseUrl: string = 'https://cosmicprotocol.io'
): Promise<{ referralCode: string; inviteLink: string }> {
  const row = await db
    .prepare('SELECT referral_code FROM players WHERE id = ?')
    .bind(playerId)
    .first() as { referral_code: string | null } | null;

  if (!row) {
    throw new Error('Player not found');
  }

  if (!row.referral_code) {
    // Lazily assign if somehow missing
    const code = await assignReferralCode(db, playerId);
    return {
      referralCode: code,
      inviteLink: `${baseUrl}/register?ref=${code}`,
    };
  }

  return {
    referralCode: row.referral_code,
    inviteLink: `${baseUrl}/register?ref=${row.referral_code}`,
  };
}

/**
 * Get referral statistics for a player.
 */
export async function getReferralStats(
  db: D1Database,
  playerId: string,
  baseUrl: string = 'https://cosmicprotocol.io'
): Promise<ReferralStats> {
  const { referralCode, inviteLink } = await getReferralCode(db, playerId, baseUrl);

  const statsRow = await db
    .prepare(
      'SELECT COUNT(*) as total_referrals, COALESCE(SUM(bonus_amount), 0) as total_bonus FROM referrals WHERE referrer_id = ?'
    )
    .bind(playerId)
    .first() as { total_referrals: number; total_bonus: number } | null;

  return {
    playerId,
    referralCode,
    inviteLink,
    totalReferrals: statsRow?.total_referrals ?? 0,
    totalBonusEarned: statsRow?.total_bonus ?? 0,
  };
}
