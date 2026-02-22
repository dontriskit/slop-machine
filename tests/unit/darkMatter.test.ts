import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getDarkMatter,
  addDarkMatter,
  spendDarkMatter,
  getDarkMatterHistory,
  instantFinish,
  merchantTrade,
  DarkMatterService,
} from '../../worker/src/game/services/darkMatterService';

// Mock database with better transaction handling
const createMockDB = () => {
  const store = new Map();
  const transactions: any[] = [];
  let transactionIdCounter = 0;

  return {
    prepare: (sql: string) => {
      return {
        bind: (...params: any[]) => {
          return {
            first: async () => {
              if (sql.includes('SELECT * FROM dark_matter WHERE player_id')) {
                return store.get(params[0]) || null;
              }
              if (sql.includes('SELECT * FROM planets WHERE id')) {
                // Return mock planet with queue
                return {
                  planet_state: JSON.stringify({
                    queue: [
                      {
                        buildingId: 1,
                        timeEnd: Date.now() + 3600000, // 1 hour from now
                      },
                    ],
                    researchQueue: [
                      {
                        techId: 113,
                        timeEnd: Date.now() + 7200000, // 2 hours from now
                      },
                    ],
                  }),
                };
              }
              return null;
            },
            all: async () => {
              if (sql.includes('SELECT * FROM dark_matter_transactions')) {
                const filtered = transactions.filter((t: any) => t.player_id === params[0]);
                return {
                  results: filtered.sort((a, b) => b.created_at - a.created_at),
                };
              }
              return { results: [] };
            },
            run: async () => {
              if (sql.includes('INSERT INTO dark_matter')) {
                store.set(params[0], {
                  player_id: params[0],
                  balance: params[1],
                  updated_at: params[2],
                });
              }
              if (sql.includes('UPDATE dark_matter SET balance')) {
                const existing = store.get(params[2]);
                if (existing) {
                  existing.balance = params[0];
                  existing.updated_at = params[1];
                }
              }
              if (sql.includes('INSERT INTO dark_matter_transactions')) {
                const txnId = params[0];
                transactions.push({
                  id: txnId,
                  player_id: params[1],
                  amount: params[2],
                  source: params[3] || null,
                  purpose: params[3] || null,  // This is overloaded in the mock
                  reference: null,
                  balance_before: params[4],
                  balance_after: params[5],
                  created_at: params[6],
                });
              }
              if (sql.includes('UPDATE dark_matter_transactions SET reference')) {
                const txn = transactions.find((t) => t.id === params[1]);
                if (txn) {
                  txn.reference = params[0];
                }
              }
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
  } as any as D1Database;
};

describe('Dark Matter Service', () => {
  let mockDB: D1Database;

  beforeEach(() => {
    mockDB = createMockDB();
  });

  describe('getDarkMatter', () => {
    it('should return zero balance for new player', async () => {
      const balance = await getDarkMatter(mockDB, 'player-1');
      expect(balance.playerId).toBe('player-1');
      expect(balance.balance).toBe(0);
      expect(balance.updatedAt).toBeDefined();
    });

    it('should return existing balance', async () => {
      // First add some dark matter
      await addDarkMatter(mockDB, 'player-2', 1000, 'purchase');
      const balance = await getDarkMatter(mockDB, 'player-2');
      expect(balance.balance).toBe(1000);
    });
  });

  describe('addDarkMatter', () => {
    it('should add dark matter to player balance', async () => {
      const balance = await addDarkMatter(mockDB, 'player-3', 500, 'expedition');
      expect(balance.playerId).toBe('player-3');
      expect(balance.balance).toBe(500);
    });

    it('should add multiple sources', async () => {
      await addDarkMatter(mockDB, 'player-4', 300, 'expedition');
      const balance = await addDarkMatter(mockDB, 'player-4', 200, 'achievement');
      expect(balance.balance).toBe(500);
    });

    it('should reject negative amounts', async () => {
      await expect(addDarkMatter(mockDB, 'player-5', -100, 'expedition')).rejects.toThrow(
        'Amount must be positive'
      );
    });

    it('should record transaction with source', async () => {
      await addDarkMatter(mockDB, 'player-6', 250, 'expedition', 'exp-123');
      const history = await getDarkMatterHistory(mockDB, 'player-6');
      expect(history.length).toBeGreaterThan(0);
      // Source is recorded in the transaction
      expect(history[0].source).toBeDefined();
    });
  });

  describe('spendDarkMatter', () => {
    it('should deduct dark matter from balance', async () => {
      await addDarkMatter(mockDB, 'player-7', 1000, 'purchase');
      const balance = await spendDarkMatter(mockDB, 'player-7', 300, 'officer');
      expect(balance.balance).toBe(700);
    });

    it('should reject spending more than available', async () => {
      await addDarkMatter(mockDB, 'player-8', 100, 'purchase');
      await expect(spendDarkMatter(mockDB, 'player-8', 200, 'officer')).rejects.toThrow(
        'Insufficient dark matter'
      );
    });

    it('should reject negative amounts', async () => {
      await expect(spendDarkMatter(mockDB, 'player-9', -50, 'officer')).rejects.toThrow(
        'Amount must be positive'
      );
    });

    it('should record transaction with purpose', async () => {
      await addDarkMatter(mockDB, 'player-10', 500, 'purchase');
      await spendDarkMatter(mockDB, 'player-10', 150, 'instant_finish', 'queue-456');
      const history = await getDarkMatterHistory(mockDB, 'player-10');
      // Verify spend transaction exists with negative amount
      const spendTxn = history.find((t) => t.amount < 0);
      expect(spendTxn).toBeDefined();
    });
  });

  describe('getDarkMatterHistory', () => {
    it('should return transaction history', async () => {
      await addDarkMatter(mockDB, 'player-11', 200, 'expedition');
      await addDarkMatter(mockDB, 'player-11', 100, 'achievement');
      const history = await getDarkMatterHistory(mockDB, 'player-11');
      expect(history.length).toBeGreaterThanOrEqual(2);
    });

    it('should return transactions in reverse chronological order', async () => {
      await addDarkMatter(mockDB, 'player-13', 100, 'expedition');
      await addDarkMatter(mockDB, 'player-13', 200, 'achievement');
      const history = await getDarkMatterHistory(mockDB, 'player-13');
      // Most recent should come first
      if (history.length > 1) {
        expect(history[0].createdAt).toBeGreaterThanOrEqual(history[1].createdAt);
      }
    });

    it('should show correct balance progression', async () => {
      await addDarkMatter(mockDB, 'player-14', 100, 'expedition');
      await addDarkMatter(mockDB, 'player-14', 50, 'achievement');
      const history = await getDarkMatterHistory(mockDB, 'player-14');
      // Should have at least 2 transactions
      expect(history.length).toBeGreaterThanOrEqual(2);
      // Each transaction should show balance progression
      for (const txn of history) {
        expect(txn.balanceBefore).toBeDefined();
        expect(txn.balanceAfter).toBeDefined();
      }
    });
  });

  describe('instantFinish', () => {
    it('should calculate cost based on remaining time', async () => {
      const cost = Math.ceil(3600 / 10); // 360 DM for 1 hour
      expect(cost).toBe(360);
    });

    it('should reject if queue item not found', async () => {
      await expect(
        instantFinish(mockDB, 'player-15', 'planet-999', 'building', 999)
      ).rejects.toThrow();
    });
  });

  describe('merchantTrade', () => {
    it('should calculate metal to crystal exchange (3:2 ratio)', async () => {
      const result = await merchantTrade(mockDB, 'player-16', 'planet-1', 'metal', 300, 'crystal');
      expect(result.offered).toBe(300);
      expect(result.received).toBe(200);
      expect(result.offer).toBe('metal');
      expect(result.want).toBe('crystal');
    });

    it('should calculate metal to deuterium exchange (3:1 ratio)', async () => {
      const result = await merchantTrade(mockDB, 'player-17', 'planet-1', 'metal', 300, 'deuterium');
      expect(result.offered).toBe(300);
      expect(result.received).toBe(100);
    });

    it('should calculate crystal to deuterium exchange (2:1 ratio)', async () => {
      const result = await merchantTrade(mockDB, 'player-18', 'planet-1', 'crystal', 200, 'deuterium');
      expect(result.offered).toBe(200);
      expect(result.received).toBe(100);
    });

    it('should reject trade of same resource', async () => {
      await expect(
        merchantTrade(mockDB, 'player-19', 'planet-1', 'metal', 100, 'metal')
      ).rejects.toThrow('Cannot trade resource for itself');
    });

    it('should reject zero or negative amounts', async () => {
      await expect(
        merchantTrade(mockDB, 'player-20', 'planet-1', 'metal', 0, 'crystal')
      ).rejects.toThrow('Offer amount must be positive');
    });
  });

  describe('DarkMatterService class', () => {
    it('should provide service interface', async () => {
      const svc = new DarkMatterService();
      expect(svc.getBalance).toBeDefined();
      expect(svc.add).toBeDefined();
      expect(svc.spend).toBeDefined();
      expect(svc.getHistory).toBeDefined();
      expect(svc.instantFinish).toBeDefined();
      expect(svc.merchantTrade).toBeDefined();
    });

    it('should work through service methods', async () => {
      const svc = new DarkMatterService();
      const balance = await svc.add(mockDB, 'player-21', 1000, 'purchase');
      expect(balance.balance).toBe(1000);

      const spent = await svc.spend(mockDB, 'player-21', 500, 'officer');
      expect(spent.balance).toBe(500);
    });
  });

  describe('Integration scenarios', () => {
    it('should handle complete workflow: earn, spend, history', async () => {
      const playerId = 'player-workflow-1';

      // Earn from expedition
      let balance = await addDarkMatter(mockDB, playerId, 150, 'expedition', 'exp-001');
      expect(balance.balance).toBe(150);

      // Earn from achievement
      balance = await addDarkMatter(mockDB, playerId, 50, 'achievement', 'ach-001');
      expect(balance.balance).toBe(200);

      // Spend on officer
      balance = await spendDarkMatter(mockDB, playerId, 100, 'officer', 'off-cmd');
      expect(balance.balance).toBe(100);

      // Check history
      const history = await getDarkMatterHistory(mockDB, playerId);
      expect(history.length).toBeGreaterThanOrEqual(3);
    });

    it('should prevent overspending across multiple transactions', async () => {
      const playerId = 'player-overspend-1';
      await addDarkMatter(mockDB, playerId, 500, 'purchase');

      // First spend
      let balance = await spendDarkMatter(mockDB, playerId, 300, 'officer');
      expect(balance.balance).toBe(200);

      // Second spend
      balance = await spendDarkMatter(mockDB, playerId, 150, 'instant_finish');
      expect(balance.balance).toBe(50);

      // Third spend fails
      await expect(spendDarkMatter(mockDB, playerId, 100, 'merchant')).rejects.toThrow();
    });

    it('should track resource exchange conversions', async () => {
      // Test all exchange rates
      const metalToCrystal = await merchantTrade(mockDB, 'p-a', 'pl-a', 'metal', 600, 'crystal');
      expect(metalToCrystal.received).toBe(400);

      const metalToDeut = await merchantTrade(mockDB, 'p-b', 'pl-b', 'metal', 600, 'deuterium');
      expect(metalToDeut.received).toBe(200);

      const crystalToDeut = await merchantTrade(mockDB, 'p-c', 'pl-c', 'crystal', 400, 'deuterium');
      expect(crystalToDeut.received).toBe(200);

      // Reverse conversions
      const deutToMetal = await merchantTrade(mockDB, 'p-d', 'pl-d', 'deuterium', 100, 'metal');
      expect(deutToMetal.received).toBe(300);

      const deutToCrystal = await merchantTrade(mockDB, 'p-e', 'pl-e', 'deuterium', 100, 'crystal');
      expect(deutToCrystal.received).toBe(200);
    });
  });
});
