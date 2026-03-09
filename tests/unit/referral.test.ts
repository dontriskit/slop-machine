import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateReferralCode,
  assignReferralCode,
  applyReferralCode,
  getReferralCode,
  getReferralStats,
  REFERRAL_BONUS_DARK_MATTER,
} from '../../worker/src/game/services/referralService';

// ============================================================================
// MOCK DATABASE
// ============================================================================

function createMockDB() {
  // Tables
  const players = new Map<string, any>();
  const referrals = new Map<string, any>(); // id -> row
  const referralsByReferee = new Map<string, any>(); // referee_id -> row
  const darkMatter = new Map<string, { player_id: string; balance: number; updated_at: number }>();
  const transactions: any[] = [];

  const db: any = {
    prepare: (sql: string) => {
      return {
        bind: (...params: any[]) => {
          return {
            first: async () => {
              if (sql.includes('SELECT id FROM players WHERE referral_code')) {
                for (const p of players.values()) {
                  if (p.referral_code === params[0]) return { id: p.id };
                }
                return null;
              }
              if (sql.includes('SELECT referral_code FROM players WHERE id')) {
                return players.get(params[0]) ?? null;
              }
              if (sql.includes('SELECT * FROM players WHERE id') || sql.includes('SELECT id FROM players WHERE id')) {
                return players.get(params[0]) ?? null;
              }
              if (sql.includes('SELECT id FROM referrals WHERE referee_id')) {
                return referralsByReferee.get(params[0]) ?? null;
              }
              if (sql.includes('SELECT balance FROM dark_matter WHERE player_id')) {
                return darkMatter.get(params[0]) ?? null;
              }
              if (sql.includes('SELECT COUNT')) {
                // referral stats
                let count = 0;
                let bonus = 0;
                for (const r of referrals.values()) {
                  if (r.referrer_id === params[0]) {
                    count++;
                    bonus += r.bonus_amount;
                  }
                }
                return { total_referrals: count, total_bonus: bonus };
              }
              return null;
            },
            run: async () => {
              if (sql.includes('UPDATE players SET referral_code')) {
                const p = players.get(params[1]);
                if (p) p.referral_code = params[0];
                return {};
              }
              if (sql.includes('UPDATE players SET referred_by')) {
                const p = players.get(params[1]);
                if (p) p.referred_by = params[0];
                return {};
              }
              if (sql.includes('INSERT INTO referrals')) {
                const row = {
                  id: params[0],
                  referrer_id: params[1],
                  referee_id: params[2],
                  code: params[3],
                  bonus_amount: params[4],
                  applied_at: params[5],
                };
                referrals.set(row.id, row);
                referralsByReferee.set(row.referee_id, row);
                return {};
              }
              if (sql.includes('dark_matter_transactions')) {
                transactions.push({ id: params[0], player_id: params[1], amount: params[2] });
                return {};
              }
              if (sql.includes('UPDATE dark_matter SET balance')) {
                const dm = darkMatter.get(params[2]);
                if (dm) { dm.balance = params[0]; dm.updated_at = params[1]; }
                return {};
              }
              if (sql.includes('INSERT INTO dark_matter')) {
                darkMatter.set(params[0], { player_id: params[0], balance: params[1], updated_at: params[2] });
                return {};
              }
              return {};
            },
          };
        },
      };
    },
    _players: players,
    _darkMatter: darkMatter,
    _referrals: referrals,
    _transactions: transactions,
  };

  // Helper to add test players
  db.addPlayer = (id: string, name: string, referralCode?: string) => {
    players.set(id, { id, name, referral_code: referralCode ?? null, referred_by: null });
  };

  return db;
}

// ============================================================================
// TESTS
// ============================================================================

describe('generateReferralCode', () => {
  it('generates an 8-character uppercase code', () => {
    const code = generateReferralCode();
    expect(code).toHaveLength(8);
    expect(code).toMatch(/^[A-Z0-9]+$/);
  });

  it('generates unique codes', () => {
    const codes = new Set(Array.from({ length: 100 }, () => generateReferralCode()));
    expect(codes.size).toBeGreaterThan(95); // near-zero collision chance
  });
});

describe('assignReferralCode', () => {
  it('assigns a referral code to a new player', async () => {
    const db = createMockDB();
    db.addPlayer('player-1', 'Alice');

    const code = await assignReferralCode(db, 'player-1');
    expect(code).toHaveLength(8);
    expect(db._players.get('player-1').referral_code).toBe(code);
  });
});

describe('applyReferralCode', () => {
  let db: any;

  beforeEach(() => {
    db = createMockDB();
    db.addPlayer('referrer-1', 'Bob', 'TESTCODE');
    db.addPlayer('referee-1', 'Alice');
  });

  it('successfully applies a valid code and grants DM to both parties', async () => {
    const result = await applyReferralCode(db, 'referee-1', 'TESTCODE');

    expect(result.success).toBe(true);
    expect(result.referrerId).toBe('referrer-1');
    expect(result.refereeId).toBe('referee-1');
    expect(result.bonusAmount).toBe(REFERRAL_BONUS_DARK_MATTER);

    // Both players should have DM
    expect(db._darkMatter.get('referrer-1')?.balance).toBe(250);
    expect(db._darkMatter.get('referee-1')?.balance).toBe(250);

    // Transaction records
    expect(db._transactions.length).toBe(2);
  });

  it('is case-insensitive for the code', async () => {
    const result = await applyReferralCode(db, 'referee-1', 'testcode');
    expect(result.success).toBe(true);
  });

  it('rejects an invalid code', async () => {
    await expect(applyReferralCode(db, 'referee-1', 'BADCODE1')).rejects.toThrow('Invalid referral code');
  });

  it('rejects self-referral', async () => {
    await expect(applyReferralCode(db, 'referrer-1', 'TESTCODE')).rejects.toThrow("Cannot apply your own");
  });

  it('rejects double-use by the same referee', async () => {
    await applyReferralCode(db, 'referee-1', 'TESTCODE');
    db.addPlayer('referrer-2', 'Carol', 'OTHERCODE');
    await expect(applyReferralCode(db, 'referee-1', 'OTHERCODE')).rejects.toThrow('already applied');
  });
});

describe('getReferralCode', () => {
  it('returns code and invite link for an existing code', async () => {
    const db = createMockDB();
    db.addPlayer('player-1', 'Bob', 'MYCODE12');

    const result = await getReferralCode(db, 'player-1', 'https://game.test');
    expect(result.referralCode).toBe('MYCODE12');
    expect(result.inviteLink).toBe('https://game.test/register?ref=MYCODE12');
  });

  it('lazily assigns a code if missing', async () => {
    const db = createMockDB();
    db.addPlayer('player-2', 'Alice'); // no code yet

    const result = await getReferralCode(db, 'player-2', 'https://game.test');
    expect(result.referralCode).toHaveLength(8);
    expect(result.inviteLink).toContain(result.referralCode);
  });

  it('throws for unknown player', async () => {
    const db = createMockDB();
    await expect(getReferralCode(db, 'ghost', 'https://game.test')).rejects.toThrow('Player not found');
  });
});

describe('getReferralStats', () => {
  it('returns zero stats for a player with no referrals', async () => {
    const db = createMockDB();
    db.addPlayer('player-1', 'Dave', 'DAVECODE');

    const stats = await getReferralStats(db, 'player-1', 'https://game.test');
    expect(stats.playerId).toBe('player-1');
    expect(stats.referralCode).toBe('DAVECODE');
    expect(stats.totalReferrals).toBe(0);
    expect(stats.totalBonusEarned).toBe(0);
  });

  it('accumulates stats after referrals', async () => {
    const db = createMockDB();
    db.addPlayer('referrer-1', 'Eve', 'EVECODE12');
    db.addPlayer('referee-a', 'Alice');
    db.addPlayer('referee-b', 'Bob');

    await applyReferralCode(db, 'referee-a', 'EVECODE12');
    await applyReferralCode(db, 'referee-b', 'EVECODE12');

    const stats = await getReferralStats(db, 'referrer-1', 'https://game.test');
    expect(stats.totalReferrals).toBe(2);
    expect(stats.totalBonusEarned).toBe(500); // 2 × 250
  });
});

describe('REFERRAL_BONUS_DARK_MATTER', () => {
  it('is 250', () => {
    expect(REFERRAL_BONUS_DARK_MATTER).toBe(250);
  });
});
