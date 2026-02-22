/**
 * Moderation Service
 * Handles player bans, suspension management, and admin moderation tools
 * Supports temporary and permanent bans with reason tracking and history
 */

import type { D1Database } from '@cloudflare/workers-types';

// ============================================================================
// TYPES
// ============================================================================

export interface PlayerBan {
  id: string;
  playerId: string;
  reason: string;
  bannedBy: string;         // Admin user ID who issued the ban
  bannedAt: number;         // Unix timestamp (seconds)
  expiresAt: number | null; // null = permanent, timestamp = expiry
  isActive: boolean;        // true if currently enforced
  unbannedBy?: string;      // Admin who lifted the ban
  unbannedAt?: number;      // When ban was lifted
}

export interface BanStatus {
  isBanned: boolean;
  ban?: PlayerBan;
  message?: string; // Human-readable ban message
}

export interface BanListEntry {
  id: string;
  playerId: string;
  playerName: string;
  reason: string;
  bannedBy: string;
  bannedAt: number;
  expiresAt: number | null;
  daysRemaining: number | null; // null for permanent, days for temporary
}

// ============================================================================
// MODERATION SERVICE CLASS
// ============================================================================

export class ModerationService {
  /**
   * Ban a player temporarily or permanently
   * @param db D1 database instance
   * @param playerId Player to ban
   * @param reason Reason for ban
   * @param durationDays Duration in days (null/undefined = permanent)
   * @param bannedBy Admin ID issuing the ban
   * @returns Ban record created
   */
  async banPlayer(
    db: D1Database,
    playerId: string,
    reason: string,
    durationDays?: number | null,
    bannedBy?: string
  ): Promise<PlayerBan> {
    const banId = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = durationDays ? now + durationDays * 86400 : null;

    const stmt = db.prepare(`
      INSERT INTO player_bans (
        id, player_id, reason, banned_by, banned_at, expires_at, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    await stmt.bind(
      banId,
      playerId,
      reason,
      bannedBy || 'system',
      now,
      expiresAt,
      1
    ).run();

    return {
      id: banId,
      playerId,
      reason,
      bannedBy: bannedBy || 'system',
      bannedAt: now,
      expiresAt,
      isActive: true,
    };
  }

  /**
   * Unban a player, lifting an active ban
   * @param db D1 database instance
   * @param playerId Player to unban
   * @param unbannedBy Admin ID lifting the ban
   * @returns Updated ban record
   */
  async unbanPlayer(
    db: D1Database,
    playerId: string,
    unbannedBy?: string
  ): Promise<PlayerBan | null> {
    const now = Math.floor(Date.now() / 1000);

    // Find active ban for this player
    const activeBan = await db
      .prepare(`
        SELECT * FROM player_bans
        WHERE player_id = ? AND is_active = 1
        ORDER BY banned_at DESC
        LIMIT 1
      `)
      .bind(playerId)
      .first<any>();

    if (!activeBan) {
      return null;
    }

    // Mark as inactive
    await db
      .prepare(`
        UPDATE player_bans
        SET is_active = 0, unbanned_by = ?, unbanned_at = ?
        WHERE id = ?
      `)
      .bind(unbannedBy || 'system', now, activeBan.id)
      .run();

    return {
      id: activeBan.id,
      playerId: activeBan.player_id,
      reason: activeBan.reason,
      bannedBy: activeBan.banned_by,
      bannedAt: activeBan.banned_at,
      expiresAt: activeBan.expires_at,
      isActive: false,
      unbannedBy: unbannedBy || 'system',
      unbannedAt: now,
    };
  }

  /**
   * Check if a player is currently banned
   * Accounts for temporary bans that may have expired
   * @param db D1 database instance
   * @param playerId Player to check
   * @returns Ban status and details
   */
  async isPlayerBanned(db: D1Database, playerId: string): Promise<BanStatus> {
    const now = Math.floor(Date.now() / 1000);

    const ban = await db
      .prepare(`
        SELECT * FROM player_bans
        WHERE player_id = ? AND is_active = 1
        ORDER BY banned_at DESC
        LIMIT 1
      `)
      .bind(playerId)
      .first<any>();

    if (!ban) {
      return { isBanned: false };
    }

    // Check if temporary ban has expired
    if (ban.expires_at && ban.expires_at < now) {
      // Ban has expired, mark as inactive
      await db
        .prepare(`
          UPDATE player_bans
          SET is_active = 0
          WHERE id = ?
        `)
        .bind(ban.id)
        .run();

      return { isBanned: false };
    }

    const banRecord: PlayerBan = {
      id: ban.id,
      playerId: ban.player_id,
      reason: ban.reason,
      bannedBy: ban.banned_by,
      bannedAt: ban.banned_at,
      expiresAt: ban.expires_at,
      isActive: true,
    };

    const message = ban.expires_at
      ? `You are temporarily banned until ${new Date(ban.expires_at * 1000).toISOString()}. Reason: ${ban.reason}`
      : `You are permanently banned. Reason: ${ban.reason}`;

    return {
      isBanned: true,
      ban: banRecord,
      message,
    };
  }

  /**
   * Get complete ban history for a player
   * @param db D1 database instance
   * @param playerId Player to query
   * @returns All bans (active and inactive) for this player
   */
  async getBanHistory(db: D1Database, playerId: string): Promise<PlayerBan[]> {
    const bans = await db
      .prepare(`
        SELECT * FROM player_bans
        WHERE player_id = ?
        ORDER BY banned_at DESC
      `)
      .bind(playerId)
      .all<any>();

    return (bans.results || []).map((ban) => ({
      id: ban.id,
      playerId: ban.player_id,
      reason: ban.reason,
      bannedBy: ban.banned_by,
      bannedAt: ban.banned_at,
      expiresAt: ban.expires_at,
      isActive: ban.is_active === 1,
      unbannedBy: ban.unbanned_by,
      unbannedAt: ban.unbanned_at,
    }));
  }

  /**
   * Get paginated list of currently banned players
   * @param db D1 database instance
   * @param limit Number of results per page
   * @param offset Pagination offset
   * @returns List of active bans with player names and days remaining
   */
  async getActiveBans(
    db: D1Database,
    limit: number = 50,
    offset: number = 0
  ): Promise<{ bans: BanListEntry[]; total: number }> {
    const now = Math.floor(Date.now() / 1000);

    // Get count of active bans
    const countResult = await db
      .prepare(`
        SELECT COUNT(*) as count FROM player_bans
        WHERE is_active = 1 AND (expires_at IS NULL OR expires_at > ?)
      `)
      .bind(now)
      .first<any>();

    const total = countResult?.count || 0;

    // Get paginated active bans with player names
    const bans = await db
      .prepare(`
        SELECT 
          pb.id,
          pb.player_id,
          p.name as player_name,
          pb.reason,
          pb.banned_by,
          pb.banned_at,
          pb.expires_at
        FROM player_bans pb
        LEFT JOIN players p ON pb.player_id = p.id
        WHERE pb.is_active = 1 AND (pb.expires_at IS NULL OR pb.expires_at > ?)
        ORDER BY pb.banned_at DESC
        LIMIT ? OFFSET ?
      `)
      .bind(now, limit, offset)
      .all<any>();

    return {
      bans: (bans.results || []).map((ban) => {
        const daysRemaining = ban.expires_at
          ? Math.ceil((ban.expires_at - now) / 86400)
          : null;

        return {
          id: ban.id,
          playerId: ban.player_id,
          playerName: ban.player_name || 'Unknown',
          reason: ban.reason,
          bannedBy: ban.banned_by,
          bannedAt: ban.banned_at,
          expiresAt: ban.expires_at,
          daysRemaining,
        };
      }),
      total,
    };
  }

  /**
   * Check if a player has any active bans that would restrict gameplay
   * Used by game logic to enforce bans
   * @param db D1 database instance
   * @param playerId Player to check
   * @returns true if player is currently banned and cannot play
   */
  async canPlay(db: D1Database, playerId: string): Promise<boolean> {
    const status = await this.isPlayerBanned(db, playerId);
    return !status.isBanned;
  }
}

/**
 * Singleton instance for global use
 */
export const moderationService = new ModerationService();
