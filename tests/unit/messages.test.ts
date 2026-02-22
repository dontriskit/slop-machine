/**
 * Unit tests for in-game messaging system
 */
import { describe, test, expect, beforeEach } from 'vitest';
import {
  sendMessage,
  getInbox,
  getOutbox,
  getMessage,
  deleteMessage,
  getUnreadCount,
  markAllRead,
  sendSystemMessage,
  sendAllianceMessage,
} from '../../worker/src/game/services/messageService';

// ============================================================================
// D1 MOCK
// ============================================================================

/**
 * Lightweight in-memory D1Database mock.
 * Stores rows in a Map keyed by table name.
 * Supports the subset of SQL used by messageService:
 *   INSERT, SELECT (with WHERE, ORDER BY, LIMIT, OFFSET), UPDATE, DELETE, COUNT.
 */

interface Row {
  [key: string]: string | number | null;
}

function createMockDB() {
  const tables: Map<string, Row[]> = new Map();

  // Seed players table
  tables.set('players', [
    { id: 'p1', name: 'Alice', alliance_tag: 'ALLY' },
    { id: 'p2', name: 'Bob', alliance_tag: 'ALLY' },
    { id: 'p3', name: 'Charlie', alliance_tag: null },
    { id: 'p4', name: 'Diana', alliance_tag: 'ALLY' },
  ]);

  // Seed alliances table
  tables.set('alliances', [
    { id: 'alliance-1', tag: 'ALLY', name: 'The Alliance', founder_id: 'p1' },
  ]);

  // Empty messages table
  tables.set('messages', []);

  function getTable(name: string): Row[] {
    if (!tables.has(name)) tables.set(name, []);
    return tables.get(name)!;
  }

  /**
   * Minimal SQL parser.
   * Handles the patterns used by messageService — not a general SQL engine.
   */
  function execSQL(sql: string, binds: (string | number | null)[]): {
    results?: Row[];
    first?: Row | null;
    meta?: { changes: number };
  } {
    const trimmed = sql.trim().replace(/\s+/g, ' ');
    let bindIdx = 0;
    const nextBind = () => binds[bindIdx++];

    // INSERT INTO messages (...) VALUES (...)
    if (/^INSERT INTO messages/i.test(trimmed)) {
      const colMatch = trimmed.match(/\(([^)]+)\)\s*VALUES/i);
      const cols = colMatch
        ? colMatch[1].split(',').map((c) => c.trim())
        : [];
      // Parse the VALUES clause, handling ?, NULL, 'literal', and numeric literals
      const valuesMatch = trimmed.match(/VALUES\s*\((.+)\)\s*$/i);
      const valuesStr = valuesMatch ? valuesMatch[1] : '';
      const valueParts = valuesStr.split(',').map((v) => v.trim());
      const row: Row = {};
      for (let i = 0; i < cols.length; i++) {
        const part = valueParts[i];
        if (part === '?') {
          row[cols[i]] = nextBind();
        } else if (part === 'NULL') {
          row[cols[i]] = null;
        } else if (/^'(.+)'$/.test(part)) {
          row[cols[i]] = part.slice(1, -1); // strip quotes
        } else {
          row[cols[i]] = parseInt(part, 10); // numeric literal
        }
      }
      getTable('messages').push(row);
      return { meta: { changes: 1 } };
    }

    // SELECT COUNT(*) AS total/count FROM messages WHERE ...
    if (/^SELECT COUNT\(\*\) AS (total|count)/i.test(trimmed)) {
      const rows = getTable('messages');
      const filtered = applyWhere(rows, trimmed, () => nextBind());
      const alias = /AS (\w+)/i.exec(trimmed)?.[1] ?? 'total';
      return { first: { [alias]: filtered.length }, results: [{ [alias]: filtered.length }] };
    }

    // SELECT ... FROM messages WHERE ...
    if (/^SELECT .+ FROM messages/i.test(trimmed)) {
      const rows = getTable('messages');
      let filtered = applyWhere(rows, trimmed, () => nextBind());

      // ORDER BY created_at DESC
      if (/ORDER BY created_at DESC/i.test(trimmed)) {
        filtered.sort((a, b) => (b.created_at as number) - (a.created_at as number));
      }

      // LIMIT and OFFSET
      const limitMatch = /LIMIT (\?)/i.exec(trimmed);
      const offsetMatch = /OFFSET (\?)/i.exec(trimmed);
      let limit = Infinity;
      let offset = 0;
      if (limitMatch) limit = nextBind() as number;
      if (offsetMatch) offset = nextBind() as number;
      filtered = filtered.slice(offset, offset + limit);

      return { results: filtered, first: filtered[0] ?? null };
    }

    // SELECT id, name FROM players WHERE id = ?
    if (/^SELECT .+ FROM players WHERE id = \?/i.test(trimmed)) {
      const id = nextBind();
      const player = getTable('players').find((p) => p.id === id);
      return { results: player ? [player] : [], first: player ?? null };
    }

    // SELECT id FROM players WHERE id = ?
    if (/^SELECT id FROM players WHERE id = \?/i.test(trimmed)) {
      const id = nextBind();
      const player = getTable('players').find((p) => p.id === id);
      return { results: player ? [player] : [], first: player ?? null };
    }

    // SELECT id, tag FROM alliances WHERE id = ?
    if (/^SELECT .+ FROM alliances WHERE id = \?/i.test(trimmed)) {
      const id = nextBind();
      const alliance = getTable('alliances').find((a) => a.id === id);
      return { results: alliance ? [alliance] : [], first: alliance ?? null };
    }

    // SELECT id FROM players WHERE alliance_tag = ? AND id != ?
    if (/^SELECT id FROM players WHERE alliance_tag = \? AND id != \?/i.test(trimmed)) {
      const tag = nextBind();
      const excludeId = nextBind();
      const members = getTable('players').filter(
        (p) => p.alliance_tag === tag && p.id !== excludeId,
      );
      return { results: members, first: members[0] ?? null };
    }

    // UPDATE messages SET read = 1 WHERE id = ?
    if (/^UPDATE messages SET read = 1 WHERE id = \?/i.test(trimmed)) {
      const id = nextBind();
      const msgs = getTable('messages');
      let changes = 0;
      for (const m of msgs) {
        if (m.id === id) {
          m.read = 1;
          changes++;
        }
      }
      return { meta: { changes } };
    }

    // UPDATE messages SET read = 1 WHERE to_player_id = ? AND read = 0 AND deleted_by_recipient = 0
    if (/^UPDATE messages SET read = 1 WHERE to_player_id = \?/i.test(trimmed)) {
      const playerId = nextBind();
      const msgs = getTable('messages');
      let changes = 0;
      for (const m of msgs) {
        if (m.to_player_id === playerId && m.read === 0 && m.deleted_by_recipient === 0) {
          m.read = 1;
          changes++;
        }
      }
      return { meta: { changes } };
    }

    // UPDATE messages SET deleted_by_sender = 1 WHERE id = ?
    if (/^UPDATE messages SET deleted_by_sender = 1/i.test(trimmed)) {
      const id = nextBind();
      const msgs = getTable('messages');
      let changes = 0;
      for (const m of msgs) {
        if (m.id === id) {
          m.deleted_by_sender = 1;
          changes++;
        }
      }
      return { meta: { changes } };
    }

    // UPDATE messages SET deleted_by_recipient = 1 WHERE id = ?
    if (/^UPDATE messages SET deleted_by_recipient = 1/i.test(trimmed)) {
      const id = nextBind();
      const msgs = getTable('messages');
      let changes = 0;
      for (const m of msgs) {
        if (m.id === id) {
          m.deleted_by_recipient = 1;
          changes++;
        }
      }
      return { meta: { changes } };
    }

    // DELETE FROM messages WHERE id = ?
    if (/^DELETE FROM messages WHERE id = \?/i.test(trimmed)) {
      const id = nextBind();
      const msgs = getTable('messages');
      const before = msgs.length;
      const filtered = msgs.filter((m) => m.id !== id);
      tables.set('messages', filtered);
      return { meta: { changes: before - filtered.length } };
    }

    throw new Error(`Mock DB: unhandled SQL: ${trimmed}`);
  }

  /**
   * Apply WHERE clause filters from the SQL to an array of rows.
   * Handles the specific patterns used in messageService.
   */
  function applyWhere(rows: Row[], sql: string, nextBind: () => string | number | null): Row[] {
    // Extract the WHERE clause
    const whereMatch = /WHERE (.+?)(?:ORDER|LIMIT|$)/i.exec(sql);
    if (!whereMatch) return [...rows];

    const whereClause = whereMatch[1].trim();
    const conditions = whereClause.split(/\s+AND\s+/i);

    let result = [...rows];

    for (const cond of conditions) {
      const trimCond = cond.trim();

      if (/^id = \?$/i.test(trimCond)) {
        const val = nextBind();
        result = result.filter((r) => r.id === val);
      } else if (/^to_player_id = \?$/i.test(trimCond)) {
        const val = nextBind();
        result = result.filter((r) => r.to_player_id === val);
      } else if (/^from_player_id = \?$/i.test(trimCond)) {
        const val = nextBind();
        result = result.filter((r) => r.from_player_id === val);
      } else if (/^deleted_by_recipient = 0$/i.test(trimCond)) {
        result = result.filter((r) => r.deleted_by_recipient === 0);
      } else if (/^deleted_by_sender = 0$/i.test(trimCond)) {
        result = result.filter((r) => r.deleted_by_sender === 0);
      } else if (/^read = 0$/i.test(trimCond)) {
        result = result.filter((r) => r.read === 0);
      }
    }

    return result;
  }

  // Build the D1Database-compatible mock
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

describe('Message Service', () => {
  let db: D1Database;
  let tables: Map<string, Row[]>;

  beforeEach(() => {
    const mock = createMockDB();
    db = mock.db;
    tables = mock.tables;
  });

  // --------------------------------------------------------------------------
  // sendMessage
  // --------------------------------------------------------------------------

  describe('sendMessage', () => {
    test('sends a message between two players', async () => {
      const msg = await sendMessage('p1', 'p2', 'Hello', 'World', 'player', db);

      expect(msg.fromPlayerId).toBe('p1');
      expect(msg.fromPlayerName).toBe('Alice');
      expect(msg.toPlayerId).toBe('p2');
      expect(msg.subject).toBe('Hello');
      expect(msg.body).toBe('World');
      expect(msg.type).toBe('player');
      expect(msg.read).toBe(false);
      expect(msg.id).toMatch(/^msg-/);
    });

    test('rejects empty subject', async () => {
      await expect(
        sendMessage('p1', 'p2', '', 'Body', 'player', db),
      ).rejects.toThrow('Subject cannot be empty');
    });

    test('rejects empty body', async () => {
      await expect(
        sendMessage('p1', 'p2', 'Subject', '', 'player', db),
      ).rejects.toThrow('Body cannot be empty');
    });

    test('rejects sending to self', async () => {
      await expect(
        sendMessage('p1', 'p1', 'Hello', 'World', 'player', db),
      ).rejects.toThrow('Cannot send a message to yourself');
    });

    test('rejects nonexistent sender', async () => {
      await expect(
        sendMessage('nonexistent', 'p2', 'Hello', 'World', 'player', db),
      ).rejects.toThrow('Sender not found');
    });

    test('rejects nonexistent recipient', async () => {
      await expect(
        sendMessage('p1', 'nonexistent', 'Hello', 'World', 'player', db),
      ).rejects.toThrow('Recipient not found');
    });

    test('persists message in database', async () => {
      await sendMessage('p1', 'p2', 'Test', 'Content', 'player', db);
      const msgs = tables.get('messages')!;
      expect(msgs.length).toBe(1);
      expect(msgs[0].subject).toBe('Test');
    });
  });

  // --------------------------------------------------------------------------
  // getInbox / getOutbox
  // --------------------------------------------------------------------------

  describe('getInbox', () => {
    test('returns messages addressed to player', async () => {
      await sendMessage('p1', 'p2', 'Msg 1', 'Body 1', 'player', db);
      await sendMessage('p3', 'p2', 'Msg 2', 'Body 2', 'player', db);
      await sendMessage('p1', 'p3', 'Msg 3', 'Body 3', 'player', db);

      const inbox = await getInbox('p2', 1, 20, db);

      expect(inbox.messages.length).toBe(2);
      expect(inbox.total).toBe(2);
      expect(inbox.page).toBe(1);
    });

    test('returns empty inbox for player with no messages', async () => {
      const inbox = await getInbox('p4', 1, 20, db);
      expect(inbox.messages.length).toBe(0);
      expect(inbox.total).toBe(0);
    });

    test('paginates correctly', async () => {
      // Send 5 messages to p2
      for (let i = 0; i < 5; i++) {
        await sendMessage('p1', 'p2', `Msg ${i}`, `Body ${i}`, 'player', db);
      }

      const page1 = await getInbox('p2', 1, 2, db);
      expect(page1.messages.length).toBe(2);
      expect(page1.total).toBe(5);
      expect(page1.totalPages).toBe(3);

      const page2 = await getInbox('p2', 2, 2, db);
      expect(page2.messages.length).toBe(2);

      const page3 = await getInbox('p2', 3, 2, db);
      expect(page3.messages.length).toBe(1);
    });

    test('excludes messages deleted by recipient', async () => {
      const msg = await sendMessage('p1', 'p2', 'Delete me', 'Body', 'player', db);
      await deleteMessage(msg.id, 'p2', db);

      const inbox = await getInbox('p2', 1, 20, db);
      expect(inbox.messages.length).toBe(0);
    });
  });

  describe('getOutbox', () => {
    test('returns messages sent by player', async () => {
      await sendMessage('p1', 'p2', 'Msg 1', 'Body 1', 'player', db);
      await sendMessage('p1', 'p3', 'Msg 2', 'Body 2', 'player', db);

      const outbox = await getOutbox('p1', 1, 20, db);

      expect(outbox.messages.length).toBe(2);
      expect(outbox.total).toBe(2);
    });

    test('excludes messages deleted by sender', async () => {
      const msg = await sendMessage('p1', 'p2', 'Delete me', 'Body', 'player', db);
      await deleteMessage(msg.id, 'p1', db);

      const outbox = await getOutbox('p1', 1, 20, db);
      expect(outbox.messages.length).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // getMessage
  // --------------------------------------------------------------------------

  describe('getMessage', () => {
    test('returns message for recipient', async () => {
      const sent = await sendMessage('p1', 'p2', 'Hello', 'World', 'player', db);
      const msg = await getMessage(sent.id, 'p2', db);

      expect(msg).not.toBeNull();
      expect(msg!.subject).toBe('Hello');
    });

    test('returns message for sender', async () => {
      const sent = await sendMessage('p1', 'p2', 'Hello', 'World', 'player', db);
      const msg = await getMessage(sent.id, 'p1', db);

      expect(msg).not.toBeNull();
      expect(msg!.subject).toBe('Hello');
    });

    test('returns null for unauthorized player', async () => {
      const sent = await sendMessage('p1', 'p2', 'Hello', 'World', 'player', db);
      const msg = await getMessage(sent.id, 'p3', db);

      expect(msg).toBeNull();
    });

    test('marks message as read when recipient views', async () => {
      const sent = await sendMessage('p1', 'p2', 'Hello', 'World', 'player', db);

      // Initially unread
      expect(sent.read).toBe(false);

      // Recipient views
      const msg = await getMessage(sent.id, 'p2', db);
      expect(msg!.read).toBe(true);

      // Verify persisted
      const row = tables.get('messages')!.find((r) => r.id === sent.id);
      expect(row!.read).toBe(1);
    });

    test('does not mark as read when sender views', async () => {
      const sent = await sendMessage('p1', 'p2', 'Hello', 'World', 'player', db);
      await getMessage(sent.id, 'p1', db);

      const row = tables.get('messages')!.find((r) => r.id === sent.id);
      expect(row!.read).toBe(0);
    });

    test('returns null for nonexistent message', async () => {
      const msg = await getMessage('nonexistent', 'p1', db);
      expect(msg).toBeNull();
    });

    test('returns null for message deleted by recipient', async () => {
      const sent = await sendMessage('p1', 'p2', 'Hello', 'World', 'player', db);
      await deleteMessage(sent.id, 'p2', db);

      const msg = await getMessage(sent.id, 'p2', db);
      expect(msg).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // deleteMessage
  // --------------------------------------------------------------------------

  describe('deleteMessage', () => {
    test('soft-deletes for sender', async () => {
      const sent = await sendMessage('p1', 'p2', 'Hello', 'World', 'player', db);
      const result = await deleteMessage(sent.id, 'p1', db);
      expect(result).toBe(true);

      const row = tables.get('messages')!.find((r) => r.id === sent.id);
      expect(row!.deleted_by_sender).toBe(1);
      expect(row!.deleted_by_recipient).toBe(0);
    });

    test('soft-deletes for recipient', async () => {
      const sent = await sendMessage('p1', 'p2', 'Hello', 'World', 'player', db);
      const result = await deleteMessage(sent.id, 'p2', db);
      expect(result).toBe(true);

      const row = tables.get('messages')!.find((r) => r.id === sent.id);
      expect(row!.deleted_by_sender).toBe(0);
      expect(row!.deleted_by_recipient).toBe(1);
    });

    test('permanently deletes when both sender and recipient delete', async () => {
      const sent = await sendMessage('p1', 'p2', 'Hello', 'World', 'player', db);

      await deleteMessage(sent.id, 'p1', db);
      await deleteMessage(sent.id, 'p2', db);

      // Row should be permanently removed
      const row = tables.get('messages')!.find((r) => r.id === sent.id);
      expect(row).toBeUndefined();
    });

    test('returns false for nonexistent message', async () => {
      const result = await deleteMessage('nonexistent', 'p1', db);
      expect(result).toBe(false);
    });

    test('returns false for unauthorized player', async () => {
      const sent = await sendMessage('p1', 'p2', 'Hello', 'World', 'player', db);
      const result = await deleteMessage(sent.id, 'p3', db);
      expect(result).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // getUnreadCount / markAllRead
  // --------------------------------------------------------------------------

  describe('getUnreadCount', () => {
    test('returns 0 for no messages', async () => {
      const count = await getUnreadCount('p2', db);
      expect(count).toBe(0);
    });

    test('counts unread messages', async () => {
      await sendMessage('p1', 'p2', 'Msg 1', 'Body', 'player', db);
      await sendMessage('p3', 'p2', 'Msg 2', 'Body', 'player', db);

      const count = await getUnreadCount('p2', db);
      expect(count).toBe(2);
    });

    test('does not count read messages', async () => {
      const msg = await sendMessage('p1', 'p2', 'Msg 1', 'Body', 'player', db);
      await sendMessage('p3', 'p2', 'Msg 2', 'Body', 'player', db);

      // Mark first as read
      await getMessage(msg.id, 'p2', db);

      const count = await getUnreadCount('p2', db);
      expect(count).toBe(1);
    });

    test('does not count deleted messages', async () => {
      const msg = await sendMessage('p1', 'p2', 'Msg 1', 'Body', 'player', db);
      await deleteMessage(msg.id, 'p2', db);

      const count = await getUnreadCount('p2', db);
      expect(count).toBe(0);
    });
  });

  describe('markAllRead', () => {
    test('marks all messages as read', async () => {
      await sendMessage('p1', 'p2', 'Msg 1', 'Body', 'player', db);
      await sendMessage('p3', 'p2', 'Msg 2', 'Body', 'player', db);

      const updated = await markAllRead('p2', db);
      expect(updated).toBe(2);

      const count = await getUnreadCount('p2', db);
      expect(count).toBe(0);
    });

    test('returns 0 when no unread messages', async () => {
      const updated = await markAllRead('p2', db);
      expect(updated).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // sendSystemMessage
  // --------------------------------------------------------------------------

  describe('sendSystemMessage', () => {
    test('sends a system message with no sender', async () => {
      const msg = await sendSystemMessage('p2', 'Fleet Arrived', 'Your fleet has arrived.', db);

      expect(msg.fromPlayerId).toBe('');
      expect(msg.fromPlayerName).toBe('System');
      expect(msg.toPlayerId).toBe('p2');
      expect(msg.type).toBe('system');
    });

    test('supports combat_report type', async () => {
      const msg = await sendSystemMessage(
        'p2',
        'Battle Report',
        'You were attacked!',
        db,
        'combat_report',
      );
      expect(msg.type).toBe('combat_report');
    });

    test('supports espionage_report type', async () => {
      const msg = await sendSystemMessage(
        'p2',
        'Espionage Report',
        'Probes detected resources.',
        db,
        'espionage_report',
      );
      expect(msg.type).toBe('espionage_report');
    });

    test('system message appears in recipient inbox', async () => {
      await sendSystemMessage('p2', 'System Notice', 'Test body', db);
      const inbox = await getInbox('p2', 1, 20, db);
      expect(inbox.messages.length).toBe(1);
      expect(inbox.messages[0].fromPlayerName).toBe('System');
    });
  });

  // --------------------------------------------------------------------------
  // sendAllianceMessage
  // --------------------------------------------------------------------------

  describe('sendAllianceMessage', () => {
    test('broadcasts to all alliance members except sender', async () => {
      // p1, p2, p4 have alliance_tag='ALLY'
      const messages = await sendAllianceMessage(
        'p1',
        'alliance-1',
        'Alliance Msg',
        'Important info',
        db,
      );

      // p2 and p4 should receive (p1 is sender, p3 has no alliance)
      expect(messages.length).toBe(2);
      const recipients = messages.map((m) => m.toPlayerId).sort();
      expect(recipients).toEqual(['p2', 'p4']);
    });

    test('all messages have type alliance', async () => {
      const messages = await sendAllianceMessage(
        'p1',
        'alliance-1',
        'Test',
        'Body',
        db,
      );

      for (const msg of messages) {
        expect(msg.type).toBe('alliance');
      }
    });

    test('rejects nonexistent sender', async () => {
      await expect(
        sendAllianceMessage('nonexistent', 'alliance-1', 'Test', 'Body', db),
      ).rejects.toThrow('Sender not found');
    });

    test('rejects nonexistent alliance', async () => {
      await expect(
        sendAllianceMessage('p1', 'nonexistent', 'Test', 'Body', db),
      ).rejects.toThrow('Alliance not found');
    });

    test('returns empty array when sender is the only member', async () => {
      // Override players so only p1 has the tag
      tables.set('players', [
        { id: 'p1', name: 'Alice', alliance_tag: 'ALLY' },
        { id: 'p2', name: 'Bob', alliance_tag: null },
      ]);

      const messages = await sendAllianceMessage(
        'p1',
        'alliance-1',
        'Test',
        'Body',
        db,
      );
      expect(messages.length).toBe(0);
    });
  });
});
