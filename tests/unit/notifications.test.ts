/**
 * Unit tests for the Notification System
 */
import { describe, test, expect, beforeEach, vi } from 'vitest';
import {
  createNotification,
  getNotifications,
  markRead,
  markAllRead,
  deleteNotification,
  deleteOldNotifications,
  getUnreadCount,
  getPreferences,
  setPreferences,
  getDefaultPreferences,
  ALL_NOTIFICATION_TYPES,
  DEFAULT_PRIORITY,
} from '../../worker/src/game/services/notificationService';
import type {
  NotificationType,
  NotificationPriority,
} from '../../worker/src/game/types';

// ============================================================================
// D1 MOCK
// ============================================================================

interface Row {
  [key: string]: string | number | null;
}

function createMockDB() {
  const tables: Map<string, Row[]> = new Map();

  tables.set('notifications', []);
  tables.set('notification_preferences', []);

  function getTable(name: string): Row[] {
    if (!tables.has(name)) tables.set(name, []);
    return tables.get(name)!;
  }

  function execSQL(sql: string, binds: (string | number | null)[]): {
    results?: Row[];
    first?: Row | null;
    meta?: { changes: number };
  } {
    const trimmed = sql.trim().replace(/\s+/g, ' ');
    let bindIdx = 0;
    const nextBind = () => binds[bindIdx++];

    // INSERT INTO notifications
    if (/^INSERT INTO notifications/i.test(trimmed)) {
      const row: Row = {
        id: nextBind(),
        player_id: nextBind(),
        type: nextBind(),
        priority: nextBind(),
        title: nextBind(),
        message: nextBind(),
        data: nextBind(),
        read: 0,
        created_at: nextBind(),
      };
      getTable('notifications').push(row);
      return { meta: { changes: 1 } };
    }

    // INSERT OR REPLACE INTO notification_preferences
    if (/^INSERT OR REPLACE INTO notification_preferences/i.test(trimmed)) {
      const playerId = nextBind() as string;
      const enabledTypes = nextBind() as string;
      const minimumPriority = nextBind() as string;
      const updatedAt = nextBind() as number;

      const table = getTable('notification_preferences');
      const existingIdx = table.findIndex((r) => r.player_id === playerId);
      const row: Row = {
        player_id: playerId,
        enabled_types: enabledTypes,
        minimum_priority: minimumPriority,
        updated_at: updatedAt,
      };

      if (existingIdx >= 0) {
        table[existingIdx] = row;
      } else {
        table.push(row);
      }
      return { meta: { changes: 1 } };
    }

    // SELECT COUNT(*) AS total FROM notifications WHERE ...
    if (/^SELECT COUNT\(\*\) AS total FROM notifications/i.test(trimmed)) {
      let rows = [...getTable('notifications')];
      rows = applyNotificationWhere(rows, trimmed, () => nextBind());
      return { first: { total: rows.length }, results: [{ total: rows.length }] };
    }

    // SELECT COUNT(*) AS count FROM notifications WHERE ...
    if (/^SELECT COUNT\(\*\) AS count FROM notifications/i.test(trimmed)) {
      let rows = [...getTable('notifications')];
      rows = applyNotificationWhere(rows, trimmed, () => nextBind());
      return { first: { count: rows.length }, results: [{ count: rows.length }] };
    }

    // SELECT ... FROM notifications WHERE ...
    if (/^SELECT .+ FROM notifications WHERE/i.test(trimmed)) {
      let rows = [...getTable('notifications')];
      rows = applyNotificationWhere(rows, trimmed, () => nextBind());

      // ORDER BY created_at DESC
      if (/ORDER BY created_at DESC/i.test(trimmed)) {
        rows.sort((a, b) => (b.created_at as number) - (a.created_at as number));
      }

      // LIMIT and OFFSET
      const limitMatch = /LIMIT \?/i.test(trimmed);
      const offsetMatch = /OFFSET \?/i.test(trimmed);
      let limit = Infinity;
      let offset = 0;
      if (limitMatch) limit = nextBind() as number;
      if (offsetMatch) offset = nextBind() as number;
      rows = rows.slice(offset, offset + limit);

      return { results: rows, first: rows[0] ?? null };
    }

    // SELECT ... FROM notification_preferences WHERE player_id = ?
    if (/^SELECT .+ FROM notification_preferences WHERE player_id = \?/i.test(trimmed)) {
      const playerId = nextBind();
      const row = getTable('notification_preferences').find((r) => r.player_id === playerId);
      return { results: row ? [row] : [], first: row ?? null };
    }

    // UPDATE notifications SET read = 1 WHERE id = ? AND player_id = ?
    if (/^UPDATE notifications SET read = 1 WHERE id = \? AND player_id = \?/i.test(trimmed)) {
      const id = nextBind();
      const playerId = nextBind();
      let changes = 0;
      for (const r of getTable('notifications')) {
        if (r.id === id && r.player_id === playerId) {
          r.read = 1;
          changes++;
        }
      }
      return { meta: { changes } };
    }

    // UPDATE notifications SET read = 1 WHERE player_id = ? AND read = 0
    if (/^UPDATE notifications SET read = 1 WHERE player_id = \? AND read = 0/i.test(trimmed)) {
      const playerId = nextBind();
      let changes = 0;
      for (const r of getTable('notifications')) {
        if (r.player_id === playerId && r.read === 0) {
          r.read = 1;
          changes++;
        }
      }
      return { meta: { changes } };
    }

    // DELETE FROM notifications WHERE id = ? AND player_id = ?
    if (/^DELETE FROM notifications WHERE id = \? AND player_id = \?/i.test(trimmed)) {
      const id = nextBind();
      const playerId = nextBind();
      const table = getTable('notifications');
      const before = table.length;
      const filtered = table.filter((r) => !(r.id === id && r.player_id === playerId));
      tables.set('notifications', filtered);
      return { meta: { changes: before - filtered.length } };
    }

    // DELETE FROM notifications WHERE player_id = ? AND created_at < ?
    if (/^DELETE FROM notifications WHERE player_id = \? AND created_at < \?/i.test(trimmed)) {
      const playerId = nextBind();
      const cutoff = nextBind() as number;
      const table = getTable('notifications');
      const before = table.length;
      const filtered = table.filter(
        (r) => !(r.player_id === playerId && (r.created_at as number) < cutoff),
      );
      tables.set('notifications', filtered);
      return { meta: { changes: before - filtered.length } };
    }

    throw new Error(`Mock DB: unhandled SQL: ${trimmed}`);
  }

  function applyNotificationWhere(
    rows: Row[],
    sql: string,
    nextBind: () => string | number | null,
  ): Row[] {
    const whereMatch = /WHERE (.+?)(?:ORDER|LIMIT|$)/i.exec(sql);
    if (!whereMatch) return rows;

    const whereClause = whereMatch[1].trim();
    const conditions = whereClause.split(/\s+AND\s+/i);

    let result = rows;

    for (const cond of conditions) {
      const c = cond.trim();

      if (/^player_id = \?$/i.test(c)) {
        const val = nextBind();
        result = result.filter((r) => r.player_id === val);
      } else if (/^type = \?$/i.test(c)) {
        const val = nextBind();
        result = result.filter((r) => r.type === val);
      } else if (/^priority = \?$/i.test(c)) {
        const val = nextBind();
        result = result.filter((r) => r.priority === val);
      } else if (/^read = 0$/i.test(c)) {
        result = result.filter((r) => r.read === 0);
      } else if (/^read = 1$/i.test(c)) {
        result = result.filter((r) => r.read === 1);
      } else if (/^id = \?$/i.test(c)) {
        const val = nextBind();
        result = result.filter((r) => r.id === val);
      } else if (/^created_at < \?$/i.test(c)) {
        const val = nextBind() as number;
        result = result.filter((r) => (r.created_at as number) < val);
      }
    }

    return result;
  }

  const db = {
    prepare(sql: string) {
      let boundValues: (string | number | null)[] = [];

      const stmt = {
        bind(...values: (string | number | null)[]) {
          boundValues = values;
          return stmt;
        },
        async run() {
          return execSQL(sql, boundValues);
        },
        async first<T = Row>(): Promise<T | null> {
          const result = execSQL(sql, boundValues);
          return (result.first ?? null) as T | null;
        },
        async all() {
          const result = execSQL(sql, boundValues);
          return { results: result.results ?? [] };
        },
      };

      return stmt;
    },
  } as unknown as D1Database;

  return { db, tables };
}

// ============================================================================
// TESTS
// ============================================================================

describe('Notification Service', () => {
  let db: D1Database;
  let tables: Map<string, Row[]>;

  beforeEach(() => {
    const mock = createMockDB();
    db = mock.db;
    tables = mock.tables;
  });

  // --------------------------------------------------------------------------
  // Constants
  // --------------------------------------------------------------------------

  describe('Constants', () => {
    test('ALL_NOTIFICATION_TYPES has 13 types', () => {
      expect(ALL_NOTIFICATION_TYPES).toHaveLength(13);
    });

    test('DEFAULT_PRIORITY maps all types', () => {
      for (const type of ALL_NOTIFICATION_TYPES) {
        expect(DEFAULT_PRIORITY[type]).toBeDefined();
        expect(['critical', 'warning', 'info']).toContain(DEFAULT_PRIORITY[type]);
      }
    });

    test('attack_incoming is critical priority', () => {
      expect(DEFAULT_PRIORITY.attack_incoming).toBe('critical');
    });

    test('build_complete is info priority', () => {
      expect(DEFAULT_PRIORITY.build_complete).toBe('info');
    });
  });

  // --------------------------------------------------------------------------
  // createNotification
  // --------------------------------------------------------------------------

  describe('createNotification', () => {
    test('creates a notification with default priority', async () => {
      const n = await createNotification('p1', 'attack_incoming', 'Incoming Attack', 'Fleet ETA 5min', db);

      expect(n).not.toBeNull();
      expect(n!.playerId).toBe('p1');
      expect(n!.type).toBe('attack_incoming');
      expect(n!.priority).toBe('critical');
      expect(n!.title).toBe('Incoming Attack');
      expect(n!.message).toBe('Fleet ETA 5min');
      expect(n!.read).toBe(false);
      expect(n!.id).toMatch(/^notif-/);
    });

    test('creates a notification with custom priority', async () => {
      const n = await createNotification('p1', 'build_complete', 'Building Done', 'Metal Mine level 5', db, {
        priority: 'warning',
      });

      expect(n).not.toBeNull();
      expect(n!.priority).toBe('warning');
    });

    test('creates a notification with metadata', async () => {
      const n = await createNotification('p1', 'fleet_arrived', 'Fleet Arrived', 'At [1:2:3]', db, {
        data: { fleetId: 'fleet-123', coordinate: { galaxy: 1, system: 2, position: 3 } },
      });

      expect(n).not.toBeNull();
      expect(n!.data).toEqual({
        fleetId: 'fleet-123',
        coordinate: { galaxy: 1, system: 2, position: 3 },
      });
    });

    test('persists in database', async () => {
      await createNotification('p1', 'ship_built', 'Ship Built', 'Light Fighter', db);
      const rows = tables.get('notifications')!;
      expect(rows).toHaveLength(1);
      expect(rows[0].type).toBe('ship_built');
    });

    test('rejects empty playerId', async () => {
      await expect(
        createNotification('', 'build_complete', 'Title', 'Body', db),
      ).rejects.toThrow('playerId is required');
    });

    test('rejects empty title', async () => {
      await expect(
        createNotification('p1', 'build_complete', '', 'Body', db),
      ).rejects.toThrow('Title cannot be empty');
    });

    test('rejects empty message', async () => {
      await expect(
        createNotification('p1', 'build_complete', 'Title', '', db),
      ).rejects.toThrow('Message cannot be empty');
    });

    test('rejects invalid notification type', async () => {
      await expect(
        createNotification('p1', 'invalid_type' as NotificationType, 'Title', 'Body', db),
      ).rejects.toThrow('Invalid notification type');
    });

    test('respects disabled type in preferences', async () => {
      await setPreferences('p1', { enabledTypes: { build_complete: false } }, db);
      const n = await createNotification('p1', 'build_complete', 'Done', 'Metal Mine', db);
      expect(n).toBeNull();
    });

    test('respects minimum priority in preferences', async () => {
      await setPreferences('p1', { minimumPriority: 'warning' }, db);
      // build_complete defaults to 'info' which is below 'warning'
      const n = await createNotification('p1', 'build_complete', 'Done', 'Metal Mine', db);
      expect(n).toBeNull();
    });

    test('allows notification at or above minimum priority', async () => {
      await setPreferences('p1', { minimumPriority: 'warning' }, db);
      const n = await createNotification('p1', 'attack_incoming', 'Attack!', 'Fleet incoming', db);
      expect(n).not.toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // getNotifications
  // --------------------------------------------------------------------------

  describe('getNotifications', () => {
    test('returns empty result for player with no notifications', async () => {
      const result = await getNotifications('p1', db);
      expect(result.notifications).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.page).toBe(1);
    });

    test('returns all notifications for a player', async () => {
      await createNotification('p1', 'build_complete', 'Build 1', 'Done', db);
      await createNotification('p1', 'ship_built', 'Ship 1', 'Done', db);
      await createNotification('p2', 'build_complete', 'Build 2', 'Done', db);

      const result = await getNotifications('p1', db);
      expect(result.notifications).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    test('paginates correctly', async () => {
      for (let i = 0; i < 5; i++) {
        await createNotification('p1', 'build_complete', `Build ${i}`, 'Done', db);
      }

      const page1 = await getNotifications('p1', db, { page: 1, limit: 2 });
      expect(page1.notifications).toHaveLength(2);
      expect(page1.total).toBe(5);
      expect(page1.totalPages).toBe(3);

      const page3 = await getNotifications('p1', db, { page: 3, limit: 2 });
      expect(page3.notifications).toHaveLength(1);
    });

    test('filters by type', async () => {
      await createNotification('p1', 'build_complete', 'Build', 'Done', db);
      await createNotification('p1', 'ship_built', 'Ship', 'Done', db);
      await createNotification('p1', 'build_complete', 'Build 2', 'Done', db);

      const result = await getNotifications('p1', db, { type: 'build_complete' });
      expect(result.notifications).toHaveLength(2);
      expect(result.notifications.every((n) => n.type === 'build_complete')).toBe(true);
    });

    test('filters by priority', async () => {
      await createNotification('p1', 'attack_incoming', 'Attack', 'Fleet', db); // critical
      await createNotification('p1', 'build_complete', 'Build', 'Done', db);    // info

      const result = await getNotifications('p1', db, { priority: 'critical' });
      expect(result.notifications).toHaveLength(1);
      expect(result.notifications[0].priority).toBe('critical');
    });

    test('filters by unread status', async () => {
      const n1 = await createNotification('p1', 'build_complete', 'Build 1', 'Done', db);
      await createNotification('p1', 'build_complete', 'Build 2', 'Done', db);
      await markRead(n1!.id, 'p1', db);

      const unread = await getNotifications('p1', db, { unread: true });
      expect(unread.notifications).toHaveLength(1);
      expect(unread.notifications[0].title).toBe('Build 2');

      const read = await getNotifications('p1', db, { unread: false });
      expect(read.notifications).toHaveLength(1);
      expect(read.notifications[0].title).toBe('Build 1');
    });
  });

  // --------------------------------------------------------------------------
  // markRead
  // --------------------------------------------------------------------------

  describe('markRead', () => {
    test('marks a notification as read', async () => {
      const n = await createNotification('p1', 'build_complete', 'Build', 'Done', db);
      const result = await markRead(n!.id, 'p1', db);
      expect(result).toBe(true);

      const row = tables.get('notifications')!.find((r) => r.id === n!.id);
      expect(row!.read).toBe(1);
    });

    test('returns false for nonexistent notification', async () => {
      const result = await markRead('nonexistent', 'p1', db);
      expect(result).toBe(false);
    });

    test('returns false for wrong player', async () => {
      const n = await createNotification('p1', 'build_complete', 'Build', 'Done', db);
      const result = await markRead(n!.id, 'p2', db);
      expect(result).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // markAllRead
  // --------------------------------------------------------------------------

  describe('markAllRead', () => {
    test('marks all unread notifications as read', async () => {
      await createNotification('p1', 'build_complete', 'Build 1', 'Done', db);
      await createNotification('p1', 'ship_built', 'Ship 1', 'Done', db);

      const count = await markAllRead('p1', db);
      expect(count).toBe(2);

      const unreadCount = await getUnreadCount('p1', db);
      expect(unreadCount).toBe(0);
    });

    test('returns 0 when no unread notifications', async () => {
      const count = await markAllRead('p1', db);
      expect(count).toBe(0);
    });

    test('does not affect other players', async () => {
      await createNotification('p1', 'build_complete', 'Build 1', 'Done', db);
      await createNotification('p2', 'build_complete', 'Build 2', 'Done', db);

      await markAllRead('p1', db);

      const p2Unread = await getUnreadCount('p2', db);
      expect(p2Unread).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // deleteNotification
  // --------------------------------------------------------------------------

  describe('deleteNotification', () => {
    test('deletes a notification', async () => {
      const n = await createNotification('p1', 'build_complete', 'Build', 'Done', db);
      const result = await deleteNotification(n!.id, 'p1', db);
      expect(result).toBe(true);
      expect(tables.get('notifications')).toHaveLength(0);
    });

    test('returns false for nonexistent notification', async () => {
      const result = await deleteNotification('nonexistent', 'p1', db);
      expect(result).toBe(false);
    });

    test('returns false for wrong player', async () => {
      const n = await createNotification('p1', 'build_complete', 'Build', 'Done', db);
      const result = await deleteNotification(n!.id, 'p2', db);
      expect(result).toBe(false);
      expect(tables.get('notifications')).toHaveLength(1);
    });
  });

  // --------------------------------------------------------------------------
  // deleteOldNotifications
  // --------------------------------------------------------------------------

  describe('deleteOldNotifications', () => {
    test('deletes notifications older than threshold', async () => {
      // Create two notifications with different timestamps
      await createNotification('p1', 'build_complete', 'Old', 'Done', db);

      // Manually adjust the timestamp to be old
      const rows = tables.get('notifications')!;
      rows[0].created_at = Math.floor(Date.now() / 1000) - 86400 * 31; // 31 days ago

      await createNotification('p1', 'ship_built', 'New', 'Done', db);

      const deleted = await deleteOldNotifications('p1', 86400 * 30, db); // 30 days threshold
      expect(deleted).toBe(1);
      expect(tables.get('notifications')).toHaveLength(1);
      expect(tables.get('notifications')![0].title).toBe('New');
    });

    test('returns 0 when no old notifications', async () => {
      await createNotification('p1', 'build_complete', 'Recent', 'Done', db);
      const deleted = await deleteOldNotifications('p1', 86400 * 30, db);
      expect(deleted).toBe(0);
    });

    test('does not affect other players', async () => {
      await createNotification('p1', 'build_complete', 'Old P1', 'Done', db);
      await createNotification('p2', 'build_complete', 'Old P2', 'Done', db);

      // Make both old
      for (const row of tables.get('notifications')!) {
        row.created_at = Math.floor(Date.now() / 1000) - 86400 * 31;
      }

      await deleteOldNotifications('p1', 86400 * 30, db);
      expect(tables.get('notifications')).toHaveLength(1);
      expect(tables.get('notifications')![0].player_id).toBe('p2');
    });
  });

  // --------------------------------------------------------------------------
  // getUnreadCount
  // --------------------------------------------------------------------------

  describe('getUnreadCount', () => {
    test('returns 0 for no notifications', async () => {
      const count = await getUnreadCount('p1', db);
      expect(count).toBe(0);
    });

    test('counts unread notifications', async () => {
      await createNotification('p1', 'build_complete', 'Build 1', 'Done', db);
      await createNotification('p1', 'ship_built', 'Ship 1', 'Done', db);

      const count = await getUnreadCount('p1', db);
      expect(count).toBe(2);
    });

    test('does not count read notifications', async () => {
      const n = await createNotification('p1', 'build_complete', 'Build 1', 'Done', db);
      await createNotification('p1', 'ship_built', 'Ship 1', 'Done', db);
      await markRead(n!.id, 'p1', db);

      const count = await getUnreadCount('p1', db);
      expect(count).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // Preferences
  // --------------------------------------------------------------------------

  describe('getDefaultPreferences', () => {
    test('returns defaults with all types enabled', () => {
      const prefs = getDefaultPreferences('p1');
      expect(prefs.playerId).toBe('p1');
      expect(prefs.minimumPriority).toBe('info');

      for (const type of ALL_NOTIFICATION_TYPES) {
        expect(prefs.enabledTypes[type]).toBe(true);
      }
    });
  });

  describe('getPreferences', () => {
    test('returns null when no preferences set', async () => {
      const prefs = await getPreferences('p1', db);
      expect(prefs).toBeNull();
    });

    test('returns saved preferences', async () => {
      await setPreferences('p1', { minimumPriority: 'warning' }, db);
      const prefs = await getPreferences('p1', db);

      expect(prefs).not.toBeNull();
      expect(prefs!.playerId).toBe('p1');
      expect(prefs!.minimumPriority).toBe('warning');
    });
  });

  describe('setPreferences', () => {
    test('creates new preferences', async () => {
      const prefs = await setPreferences('p1', { minimumPriority: 'critical' }, db);
      expect(prefs.playerId).toBe('p1');
      expect(prefs.minimumPriority).toBe('critical');
      // All types should be enabled by default
      for (const type of ALL_NOTIFICATION_TYPES) {
        expect(prefs.enabledTypes[type]).toBe(true);
      }
    });

    test('updates existing preferences', async () => {
      await setPreferences('p1', { minimumPriority: 'warning' }, db);
      const prefs = await setPreferences('p1', { minimumPriority: 'info' }, db);
      expect(prefs.minimumPriority).toBe('info');
    });

    test('disables specific notification types', async () => {
      const prefs = await setPreferences(
        'p1',
        { enabledTypes: { build_complete: false, ship_built: false } },
        db,
      );

      expect(prefs.enabledTypes.build_complete).toBe(false);
      expect(prefs.enabledTypes.ship_built).toBe(false);
      expect(prefs.enabledTypes.attack_incoming).toBe(true); // unchanged
    });

    test('merges with existing enabled types', async () => {
      await setPreferences('p1', { enabledTypes: { build_complete: false } }, db);
      const prefs = await setPreferences('p1', { enabledTypes: { ship_built: false } }, db);

      expect(prefs.enabledTypes.build_complete).toBe(false); // preserved
      expect(prefs.enabledTypes.ship_built).toBe(false);     // new
      expect(prefs.enabledTypes.attack_incoming).toBe(true);  // default
    });

    test('rejects invalid priority', async () => {
      await expect(
        setPreferences('p1', { minimumPriority: 'bogus' as NotificationPriority }, db),
      ).rejects.toThrow('Invalid priority');
    });

    test('persists in database', async () => {
      await setPreferences('p1', { minimumPriority: 'warning' }, db);
      const rows = tables.get('notification_preferences')!;
      expect(rows).toHaveLength(1);
      expect(rows[0].player_id).toBe('p1');
      expect(rows[0].minimum_priority).toBe('warning');
    });
  });

  // --------------------------------------------------------------------------
  // Integration: preferences + createNotification
  // --------------------------------------------------------------------------

  describe('Preferences integration', () => {
    test('disabled type prevents notification creation', async () => {
      await setPreferences('p1', { enabledTypes: { alliance_broadcast: false } }, db);
      const n = await createNotification('p1', 'alliance_broadcast', 'Broadcast', 'Message', db);
      expect(n).toBeNull();
      expect(tables.get('notifications')).toHaveLength(0);
    });

    test('enabled type allows notification creation', async () => {
      await setPreferences('p1', { enabledTypes: { alliance_broadcast: true } }, db);
      const n = await createNotification('p1', 'alliance_broadcast', 'Broadcast', 'Message', db);
      expect(n).not.toBeNull();
    });

    test('minimum priority warning blocks info notifications', async () => {
      await setPreferences('p1', { minimumPriority: 'warning' }, db);

      // info-level notification
      const info = await createNotification('p1', 'fleet_returned', 'Fleet', 'Returned', db);
      expect(info).toBeNull();

      // warning-level notification
      const warn = await createNotification('p1', 'espionage_detected', 'Spied', 'You were scanned', db);
      expect(warn).not.toBeNull();

      // critical-level notification
      const crit = await createNotification('p1', 'attack_incoming', 'Attack', 'Incoming!', db);
      expect(crit).not.toBeNull();
    });

    test('minimum priority critical blocks warning and info', async () => {
      await setPreferences('p1', { minimumPriority: 'critical' }, db);

      const warn = await createNotification('p1', 'rank_changed', 'Rank', 'New rank', db);
      expect(warn).toBeNull();

      const crit = await createNotification('p1', 'battle_complete', 'Battle', 'Victory!', db);
      expect(crit).not.toBeNull();
    });
  });
});
