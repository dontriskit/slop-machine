// ============================================================================
// NOTIFICATION SERVICE
// ============================================================================
//
// Real-time event notification system for players. Supports notification CRUD,
// filtering by type/priority/read status, batch operations, and per-player
// notification preferences.
// ============================================================================

import type {
  Notification,
  NotificationType,
  NotificationPriority,
  PaginatedNotifications,
  NotificationPreferences,
} from '../types';

// ============================================================================
// CONSTANTS
// ============================================================================

export const ALL_NOTIFICATION_TYPES: NotificationType[] = [
  'attack_incoming',
  'battle_complete',
  'espionage_detected',
  'build_complete',
  'research_complete',
  'ship_built',
  'fleet_arrived',
  'fleet_returned',
  'resources_collected',
  'alliance_broadcast',
  'achievement_unlocked',
  'rank_changed',
  'officer_expired',
];

/** Default priority for each notification type */
export const DEFAULT_PRIORITY: Record<NotificationType, NotificationPriority> = {
  attack_incoming: 'critical',
  battle_complete: 'critical',
  espionage_detected: 'warning',
  build_complete: 'info',
  research_complete: 'info',
  ship_built: 'info',
  fleet_arrived: 'info',
  fleet_returned: 'info',
  resources_collected: 'info',
  alliance_broadcast: 'warning',
  achievement_unlocked: 'info',
  rank_changed: 'warning',
  officer_expired: 'warning',
};

const PRIORITY_RANK: Record<NotificationPriority, number> = {
  critical: 3,
  warning: 2,
  info: 1,
};

// ============================================================================
// ID GENERATION
// ============================================================================

function generateNotificationId(): string {
  return `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// ============================================================================
// ROW MAPPER
// ============================================================================

interface NotificationRow {
  id: string;
  player_id: string;
  type: string;
  priority: string;
  title: string;
  message: string;
  data: string | null;
  read: number;
  created_at: number;
}

function rowToNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    playerId: row.player_id,
    type: row.type as NotificationType,
    priority: row.priority as NotificationPriority,
    title: row.title,
    message: row.message,
    data: row.data ? JSON.parse(row.data) : null,
    read: row.read === 1,
    createdAt: row.created_at,
  };
}

// ============================================================================
// CREATE NOTIFICATION
// ============================================================================

/**
 * createNotification
 *
 * Creates a new notification for a player. Respects player preferences:
 * if the notification type is disabled or below minimum priority, the
 * notification is silently dropped (returns null).
 */
export async function createNotification(
  playerId: string,
  type: NotificationType,
  title: string,
  message: string,
  db: D1Database,
  options?: {
    priority?: NotificationPriority;
    data?: Record<string, unknown>;
  },
): Promise<Notification | null> {
  if (!playerId) throw new Error('playerId is required');
  if (!title || title.trim().length === 0) throw new Error('Title cannot be empty');
  if (!message || message.trim().length === 0) throw new Error('Message cannot be empty');
  if (!ALL_NOTIFICATION_TYPES.includes(type)) throw new Error(`Invalid notification type: ${type}`);

  const priority = options?.priority ?? DEFAULT_PRIORITY[type];
  const data = options?.data ?? null;

  // Check player preferences
  const prefs = await getPreferences(playerId, db);
  if (prefs) {
    // Check if this type is disabled
    if (prefs.enabledTypes[type] === false) {
      return null; // silently drop
    }
    // Check minimum priority
    if (PRIORITY_RANK[priority] < PRIORITY_RANK[prefs.minimumPriority]) {
      return null; // below threshold
    }
  }

  const id = generateNotificationId();
  const now = Math.floor(Date.now() / 1000);

  await db
    .prepare(
      `INSERT INTO notifications
         (id, player_id, type, priority, title, message, data, read, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    )
    .bind(id, playerId, type, priority, title, message, data ? JSON.stringify(data) : null, now)
    .run();

  return {
    id,
    playerId,
    type,
    priority,
    title,
    message,
    data,
    read: false,
    createdAt: now,
  };
}

// ============================================================================
// GET NOTIFICATIONS (PAGINATED + FILTERED)
// ============================================================================

export interface GetNotificationsOptions {
  type?: NotificationType;
  priority?: NotificationPriority;
  unread?: boolean;
  page?: number;
  limit?: number;
}

/**
 * getNotifications
 *
 * Returns paginated notifications for a player, optionally filtered by
 * type, priority, and/or read status. Sorted newest first.
 */
export async function getNotifications(
  playerId: string,
  db: D1Database,
  options?: GetNotificationsOptions,
): Promise<PaginatedNotifications> {
  let page = options?.page ?? 1;
  let limit = options?.limit ?? 20;
  if (page < 1) page = 1;
  if (limit < 1) limit = 1;
  if (limit > 100) limit = 100;

  const offset = (page - 1) * limit;

  // Build WHERE clause dynamically
  const conditions: string[] = ['player_id = ?'];
  const binds: (string | number)[] = [playerId];

  if (options?.type) {
    conditions.push('type = ?');
    binds.push(options.type);
  }
  if (options?.priority) {
    conditions.push('priority = ?');
    binds.push(options.priority);
  }
  if (options?.unread === true) {
    conditions.push('read = 0');
  } else if (options?.unread === false) {
    conditions.push('read = 1');
  }

  const whereClause = conditions.join(' AND ');

  // Count total
  const countResult = await db
    .prepare(`SELECT COUNT(*) AS total FROM notifications WHERE ${whereClause}`)
    .bind(...binds)
    .first<{ total: number }>();

  const total = countResult?.total ?? 0;

  // Fetch page
  const result = await db
    .prepare(
      `SELECT id, player_id, type, priority, title, message, data, read, created_at
       FROM notifications
       WHERE ${whereClause}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
    )
    .bind(...binds, limit, offset)
    .all();

  const notifications = (result.results as unknown as NotificationRow[]).map(rowToNotification);

  return {
    notifications,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

// ============================================================================
// MARK READ
// ============================================================================

/**
 * markRead
 *
 * Marks a single notification as read. Returns true if the notification
 * existed and belonged to the player.
 */
export async function markRead(
  notificationId: string,
  playerId: string,
  db: D1Database,
): Promise<boolean> {
  const result = await db
    .prepare('UPDATE notifications SET read = 1 WHERE id = ? AND player_id = ?')
    .bind(notificationId, playerId)
    .run();

  return (result.meta?.changes ?? 0) > 0;
}

// ============================================================================
// MARK ALL READ
// ============================================================================

/**
 * markAllRead
 *
 * Marks all unread notifications as read for a player.
 * Returns the number of notifications updated.
 */
export async function markAllRead(
  playerId: string,
  db: D1Database,
): Promise<number> {
  const result = await db
    .prepare('UPDATE notifications SET read = 1 WHERE player_id = ? AND read = 0')
    .bind(playerId)
    .run();

  return result.meta?.changes ?? 0;
}

// ============================================================================
// DELETE NOTIFICATION
// ============================================================================

/**
 * deleteNotification
 *
 * Permanently deletes a notification. Returns true if the notification
 * existed and belonged to the player.
 */
export async function deleteNotification(
  notificationId: string,
  playerId: string,
  db: D1Database,
): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM notifications WHERE id = ? AND player_id = ?')
    .bind(notificationId, playerId)
    .run();

  return (result.meta?.changes ?? 0) > 0;
}

// ============================================================================
// DELETE OLD NOTIFICATIONS
// ============================================================================

/**
 * deleteOldNotifications
 *
 * Deletes all notifications older than the given age (in seconds).
 * Returns the number of deleted notifications.
 */
export async function deleteOldNotifications(
  playerId: string,
  maxAgeSeconds: number,
  db: D1Database,
): Promise<number> {
  const cutoff = Math.floor(Date.now() / 1000) - maxAgeSeconds;

  const result = await db
    .prepare('DELETE FROM notifications WHERE player_id = ? AND created_at < ?')
    .bind(playerId, cutoff)
    .run();

  return result.meta?.changes ?? 0;
}

// ============================================================================
// GET UNREAD COUNT
// ============================================================================

/**
 * getUnreadCount
 *
 * Returns the number of unread notifications for a player.
 */
export async function getUnreadCount(
  playerId: string,
  db: D1Database,
): Promise<number> {
  const result = await db
    .prepare('SELECT COUNT(*) AS count FROM notifications WHERE player_id = ? AND read = 0')
    .bind(playerId)
    .first<{ count: number }>();

  return result?.count ?? 0;
}

// ============================================================================
// NOTIFICATION PREFERENCES
// ============================================================================

/**
 * getDefaultPreferences
 *
 * Returns the default notification preferences with all types enabled
 * and minimum priority set to 'info'.
 */
export function getDefaultPreferences(playerId: string): NotificationPreferences {
  const enabledTypes = {} as Record<NotificationType, boolean>;
  for (const t of ALL_NOTIFICATION_TYPES) {
    enabledTypes[t] = true;
  }
  return {
    playerId,
    enabledTypes,
    minimumPriority: 'info',
    updatedAt: Math.floor(Date.now() / 1000),
  };
}

/**
 * getPreferences
 *
 * Retrieves notification preferences for a player.
 * Returns null if no preferences have been set (defaults will be used).
 */
export async function getPreferences(
  playerId: string,
  db: D1Database,
): Promise<NotificationPreferences | null> {
  const row = await db
    .prepare(
      `SELECT player_id, enabled_types, minimum_priority, updated_at
       FROM notification_preferences
       WHERE player_id = ?`,
    )
    .bind(playerId)
    .first<{
      player_id: string;
      enabled_types: string;
      minimum_priority: string;
      updated_at: number;
    }>();

  if (!row) return null;

  return {
    playerId: row.player_id,
    enabledTypes: JSON.parse(row.enabled_types),
    minimumPriority: row.minimum_priority as NotificationPriority,
    updatedAt: row.updated_at,
  };
}

/**
 * setPreferences
 *
 * Creates or updates notification preferences for a player.
 * Uses INSERT OR REPLACE to upsert.
 */
export async function setPreferences(
  playerId: string,
  prefs: {
    enabledTypes?: Partial<Record<NotificationType, boolean>>;
    minimumPriority?: NotificationPriority;
  },
  db: D1Database,
): Promise<NotificationPreferences> {
  // Start with existing or defaults
  const existing = await getPreferences(playerId, db);
  const base = existing ?? getDefaultPreferences(playerId);

  // Merge enabledTypes
  if (prefs.enabledTypes) {
    for (const [key, value] of Object.entries(prefs.enabledTypes)) {
      if (ALL_NOTIFICATION_TYPES.includes(key as NotificationType)) {
        base.enabledTypes[key as NotificationType] = value as boolean;
      }
    }
  }

  // Update minimumPriority
  if (prefs.minimumPriority) {
    if (!['critical', 'warning', 'info'].includes(prefs.minimumPriority)) {
      throw new Error(`Invalid priority: ${prefs.minimumPriority}`);
    }
    base.minimumPriority = prefs.minimumPriority;
  }

  const now = Math.floor(Date.now() / 1000);

  await db
    .prepare(
      `INSERT OR REPLACE INTO notification_preferences
         (player_id, enabled_types, minimum_priority, updated_at)
       VALUES (?, ?, ?, ?)`,
    )
    .bind(playerId, JSON.stringify(base.enabledTypes), base.minimumPriority, now)
    .run();

  return {
    ...base,
    updatedAt: now,
  };
}
