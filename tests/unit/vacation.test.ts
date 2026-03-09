import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  enableVacationMode,
  disableVacationMode,
  isOnVacation,
  getVacationInfo,
  checkVacationStatus,
} from '../../worker/src/game/services/vacationService';

// Mock D1Database
const mockDb = {
  prepare: vi.fn(),
} as any;

describe('Vacation Service', () => {
  const testPlayerId = 'test-player-123';
  const now = Math.floor(Date.now() / 1000);
  const minEnd = now + 2 * 86400; // 2 days from now

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('enableVacationMode', () => {
    it('should enable vacation mode when no fleet missions are active', async () => {
      // Mock: no fleet missions
      mockDb.prepare.mockReturnValueOnce({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({ count: 0 }),
        }),
      });

      // Mock: no active research
      mockDb.prepare.mockReturnValueOnce({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({ count: 0 }),
        }),
      });

      // Mock: no active builds
      mockDb.prepare.mockReturnValueOnce({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({ count: 0 }),
        }),
      });

      // Mock: update query
      mockDb.prepare.mockReturnValueOnce({
        bind: vi.fn().mockReturnValue({
          run: vi.fn().mockResolvedValue({ success: true }),
        }),
      });

      const result = await enableVacationMode(mockDb, testPlayerId);
      expect(result.success).toBe(true);
    });

    it('should reject if fleet missions are active', async () => {
      mockDb.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({ count: 1 }),
        }),
      });

      const result = await enableVacationMode(mockDb, testPlayerId);
      expect(result.success).toBe(false);
      expect(result.reason).toContain('fleet missions');
    });

    it('should reject if research is active', async () => {
      // Mock: no fleet missions
      mockDb.prepare.mockReturnValueOnce({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({ count: 0 }),
        }),
      });

      // Mock: active research
      mockDb.prepare.mockReturnValueOnce({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({ count: 1 }),
        }),
      });

      const result = await enableVacationMode(mockDb, testPlayerId);
      expect(result.success).toBe(false);
      expect(result.reason).toContain('research');
    });

    it('should reject if buildings are being built', async () => {
      // Mock: no fleet missions
      mockDb.prepare.mockReturnValueOnce({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({ count: 0 }),
        }),
      });

      // Mock: no active research
      mockDb.prepare.mockReturnValueOnce({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({ count: 0 }),
        }),
      });

      // Mock: active builds
      mockDb.prepare.mockReturnValueOnce({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({ count: 1 }),
        }),
      });

      const result = await enableVacationMode(mockDb, testPlayerId);
      expect(result.success).toBe(false);
      expect(result.reason).toContain('buildings');
    });
  });

  describe('disableVacationMode', () => {
    it('should disable vacation mode after minimum period has elapsed', async () => {
      const pastTime = now - 3 * 86400; // 3 days ago

      // Mock: get player vacation info
      mockDb.prepare.mockReturnValueOnce({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({
            vacation_start: pastTime,
            vacation_min_end: pastTime + 2 * 86400,
          }),
        }),
      });

      // Mock: update query
      mockDb.prepare.mockReturnValueOnce({
        bind: vi.fn().mockReturnValue({
          run: vi.fn().mockResolvedValue({ success: true }),
        }),
      });

      const result = await disableVacationMode(mockDb, testPlayerId);
      expect(result.success).toBe(true);
    });

    it('should reject if minimum period has not elapsed', async () => {
      const recentTime = now;

      mockDb.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({
            vacation_start: recentTime,
            vacation_min_end: recentTime + 2 * 86400,
          }),
        }),
      });

      const result = await disableVacationMode(mockDb, testPlayerId);
      expect(result.success).toBe(false);
      expect(result.reason).toContain('Cannot disable vacation');
    });

    it('should reject if player is not on vacation', async () => {
      mockDb.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({
            vacation_start: null,
            vacation_min_end: null,
          }),
        }),
      });

      const result = await disableVacationMode(mockDb, testPlayerId);
      expect(result.success).toBe(false);
      expect(result.reason).toContain('not on vacation');
    });
  });

  describe('isOnVacation', () => {
    it('should return true if player is on vacation', async () => {
      mockDb.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({ vacation_start: now }),
        }),
      });

      const result = await isOnVacation(mockDb, testPlayerId);
      expect(result).toBe(true);
    });

    it('should return false if player is not on vacation', async () => {
      mockDb.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({ vacation_start: null }),
        }),
      });

      const result = await isOnVacation(mockDb, testPlayerId);
      expect(result).toBe(false);
    });
  });

  describe('getVacationInfo', () => {
    it('should return vacation info for active vacation', async () => {
      const startTime = now - 86400; // 1 day ago
      const endTime = now + 86400; // 1 day from now

      mockDb.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({
            vacation_start: startTime,
            vacation_min_end: endTime,
          }),
        }),
      });

      const result = await getVacationInfo(mockDb, testPlayerId);
      expect(result.isOnVacation).toBe(true);
      expect(result.vacationStart).toBe(startTime);
      expect(result.vacationMinEnd).toBe(endTime);
      expect(result.daysRemaining).toBeGreaterThan(0);
    });

    it('should return no vacation info when player not on vacation', async () => {
      mockDb.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({
            vacation_start: null,
            vacation_min_end: null,
          }),
        }),
      });

      const result = await getVacationInfo(mockDb, testPlayerId);
      expect(result.isOnVacation).toBe(false);
      expect(result.daysRemaining).toBeNull();
    });
  });

  describe('checkVacationStatus', () => {
    it('should allow enabling vacation when no constraints', async () => {
      // Mock: player not on vacation
      mockDb.prepare.mockReturnValueOnce({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({ vacation_start: null }),
        }),
      });

      // Mock: no fleet missions
      mockDb.prepare.mockReturnValueOnce({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({ count: 0 }),
        }),
      });

      // Mock: no active research
      mockDb.prepare.mockReturnValueOnce({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({ count: 0 }),
        }),
      });

      // Mock: no active builds
      mockDb.prepare.mockReturnValueOnce({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({ count: 0 }),
        }),
      });

      const result = await checkVacationStatus(mockDb, testPlayerId);
      expect(result.canEnable).toBe(true);
      expect(result.canDisable).toBe(false);
    });

    it('should reject enabling if fleet missions active', async () => {
      // Mock: player not on vacation
      mockDb.prepare.mockReturnValueOnce({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({ vacation_start: null }),
        }),
      });

      // Mock: active fleet missions
      mockDb.prepare.mockReturnValueOnce({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({ count: 1 }),
        }),
      });

      const result = await checkVacationStatus(mockDb, testPlayerId);
      expect(result.canEnable).toBe(false);
      expect(result.reason).toContain('fleet missions');
    });
  });
});
