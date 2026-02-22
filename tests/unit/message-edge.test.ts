import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  sendMessage,
  getInbox,
  getMessage,
  deleteMessage,
  getUnreadCount,
  markAllRead,
  sendSystemMessage,
  sendAllianceMessage,
  type Message,
  type PaginatedMessages,
} from '../../worker/src/game/services/messageService';

// ============================================================================
// MOCK DATABASE
// ============================================================================

interface MessageTableRow {
  id: string;
  from_player_id: string | null;
  from_player_name: string;
  to_player_id: string;
  subject: string;
  body: string;
  type: string;
  read: number;
  created_at: number;
  deleted_by_sender: number;
  deleted_by_recipient: number;
}

class MockD1Database {
  private messages: MessageTableRow[] = [];
  private players: Array<{ id: string; name: string; alliance_tag: string }> = [
    { id: 'player1', name: 'Alice', alliance_tag: 'ALPH' },
    { id: 'player2', name: 'Bob', alliance_tag: 'ALPH' },
    { id: 'player3', name: 'Charlie', alliance_tag: 'BETA' },
  ];
  private alliances: Array<{ id: string; tag: string }> = [
    { id: 'alliance1', tag: 'ALPH' },
    { id: 'alliance2', tag: 'BETA' },
  ];

  prepare(sql: string) {
    const db = this;
    return {
      bind(...args: any[]) {
        return {
          first<T = any>(): T | undefined {
            return db.executeQueryFirst(sql, args) as T | undefined;
          },
          all() {
            return { results: db.executeQueryAll(sql, args) };
          },
          run() {
            return { meta: { changes: db.executeUpdate(sql, args) } };
          },
        };
      },
    };
  }

  private executeQueryFirst(sql: string, args: any[]): any {
    const results = this.executeQueryAll(sql, args);
    return results[0];
  }

  private executeQueryAll(sql: string, args: any[]): any[] {
    // COUNT queries
    if (sql.includes('COUNT(*)')) {
      return this.handleCountQuery(sql, args);
    }

    // SELECT queries
    if (sql.includes('SELECT')) {
      return this.handleSelectQuery(sql, args);
    }

    return [];
  }

  private handleCountQuery(sql: string, args: any[]): any[] {
    if (sql.includes('FROM messages')) {
      const filtered = this.filterMessages(sql, args);
      return [{ total: filtered.length, count: filtered.length }];
    }
    if (sql.includes('FROM players')) {
      const filtered = this.filterPlayers(sql, args);
      return [{ count: filtered.length }];
    }
    return [{ total: 0, count: 0 }];
  }

  private handleSelectQuery(sql: string, args: any[]): any[] {
    if (sql.includes('FROM messages')) {
      let results = this.filterMessages(sql, args);

      // Apply ORDER BY
      if (sql.includes('ORDER BY created_at DESC')) {
        results = [...results].sort((a, b) => b.created_at - a.created_at);
      }

      // Apply LIMIT/OFFSET
      const limitMatch = sql.match(/LIMIT\s+\?\s+OFFSET\s+\?/);
      if (limitMatch) {
        const limit = args[args.length - 2];
        const offset = args[args.length - 1];
        results = results.slice(offset, offset + limit);
      }

      return results;
    }

    if (sql.includes('FROM players')) {
      return this.filterPlayers(sql, args);
    }

    if (sql.includes('FROM alliances')) {
      return this.filterAlliances(sql, args);
    }

    return [];
  }

  private filterMessages(sql: string, args: any[]): MessageTableRow[] {
    let results = [...this.messages];
    let argIndex = 0;

    // WHERE to_player_id = ?
    if (sql.includes('WHERE to_player_id = ?')) {
      const playerId = args[argIndex++];
      results = results.filter((m) => m.to_player_id === playerId);

      // AND deleted_by_recipient = 0
      if (sql.includes('AND deleted_by_recipient = 0')) {
        results = results.filter((m) => m.deleted_by_recipient === 0);
      }

      // AND read = 0
      if (sql.includes('AND read = 0')) {
        results = results.filter((m) => m.read === 0);
      }
    }

    // WHERE from_player_id = ?
    if (sql.includes('WHERE from_player_id = ?')) {
      const playerId = args[argIndex++];
      results = results.filter((m) => m.from_player_id === playerId);

      // AND deleted_by_sender = 0
      if (sql.includes('AND deleted_by_sender = 0')) {
        results = results.filter((m) => m.deleted_by_sender === 0);
      }
    }

    // WHERE id = ?
    if (sql.includes('WHERE id = ?')) {
      const id = args[0];
      results = results.filter((m) => m.id === id);
    }

    return results;
  }

  private filterPlayers(sql: string, args: any[]): any[] {
    let results = [...this.players];
    let argIndex = 0;

    // WHERE id = ?
    if (sql.includes('WHERE id = ?')) {
      const playerId = args[argIndex++];
      results = results.filter((p) => p.id === playerId);
    }

    // WHERE alliance_tag = ?
    if (sql.includes('WHERE alliance_tag = ?')) {
      const tag = args[argIndex++];
      results = results.filter((p) => p.alliance_tag === tag);

      // AND id != ?
      if (sql.includes('AND id != ?')) {
        const excludeId = args[argIndex++];
        results = results.filter((p) => p.id !== excludeId);
      }
    }

    return results;
  }

  private filterAlliances(sql: string, args: any[]): any[] {
    let results = [...this.alliances];

    // WHERE id = ?
    if (sql.includes('WHERE id = ?')) {
      results = results.filter((a) => a.id === args[0]);
    }

    return results;
  }

  private executeUpdate(sql: string, args: any[]): number {
    if (sql.includes('DELETE')) {
      return this.handleDelete(sql, args);
    }

    if (sql.includes('UPDATE')) {
      return this.handleUpdate(sql, args);
    }

    if (sql.includes('INSERT')) {
      return this.handleInsert(sql, args);
    }

    return 0;
  }

  private handleInsert(sql: string, args: any[]): number {
    if (sql.includes('INSERT INTO messages')) {
      let msg: MessageTableRow;

      if (sql.includes("'System'")) {
        // System message: (id, NULL, 'System', to_player_id, subject, body, type, 0, 0, 0, created_at)
        // .bind(id, toPlayerId, subject, body, type, now)
        msg = {
          id: args[0],
          from_player_id: null,
          from_player_name: 'System',
          to_player_id: args[1],
          subject: args[2],
          body: args[3],
          type: args[4],
          read: 0,
          deleted_by_sender: 0,
          deleted_by_recipient: 0,
          created_at: args[args.length - 1],
        };
      } else if (sql.includes("'alliance'")) {
        // Alliance message: (id, from_player_id, from_player_name, to_player_id, subject, body, 'alliance', 0, 0, 0, created_at)
        // .bind(id, fromPlayerId, sender.name, member.id, subject, body, now)
        msg = {
          id: args[0],
          from_player_id: args[1] ?? null,
          from_player_name: args[2],
          to_player_id: args[3],
          subject: args[4],
          body: args[5],
          type: 'alliance',
          read: 0,
          deleted_by_sender: 0,
          deleted_by_recipient: 0,
          created_at: args[6] ?? args[args.length - 1],
        };
      } else {
        // Regular player message: (id, from_player_id, from_player_name, to_player_id, subject, body, type, 0, 0, 0, created_at)
        // .bind(id, fromPlayerId, sender.name, toPlayerId, subject, body, type, now)
        msg = {
          id: args[0],
          from_player_id: args[1] ?? null,
          from_player_name: args[2],
          to_player_id: args[3],
          subject: args[4],
          body: args[5],
          type: args[6],
          read: 0,
          deleted_by_sender: 0,
          deleted_by_recipient: 0,
          created_at: args[7] ?? args[args.length - 1],
        };
      }

      this.messages.push(msg);
      return 1;
    }
    return 0;
  }

  private handleUpdate(sql: string, args: any[]): number {
    if (sql.includes('UPDATE messages')) {
      let filtered = this.filterMessages(sql, args);

      if (sql.includes('SET read = 1')) {
        filtered.forEach((m) => (m.read = 1));
      } else if (sql.includes('SET deleted_by_sender = 1')) {
        filtered.forEach((m) => (m.deleted_by_sender = 1));
      } else if (sql.includes('SET deleted_by_recipient = 1')) {
        filtered.forEach((m) => (m.deleted_by_recipient = 1));
      }

      return filtered.length;
    }
    return 0;
  }

  private handleDelete(sql: string, args: any[]): number {
    if (sql.includes('DELETE FROM messages')) {
      const before = this.messages.length;
      this.messages = this.messages.filter((m) => m.id !== args[0]);
      return before - this.messages.length;
    }
    return 0;
  }
}

// ============================================================================
// TESTS
// ============================================================================

describe('Message Service - Edge Cases & Pagination', () => {
  let db: MockD1Database;

  beforeEach(() => {
    db = new MockD1Database();
  });

  afterEach(() => {
    db = null as any;
  });

  it('should return empty array when inbox is empty', async () => {
    const result = await getInbox('player1', 1, 20, db as any);
    expect(result.messages).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('should throw error when sending to non-existent recipient', async () => {
    await expect(
      sendMessage('player1', 'nonexistent', 'Test', 'Body', 'player', db as any),
    ).rejects.toThrow('Recipient not found');
  });

  it('should throw error when sending message to self', async () => {
    await expect(
      sendMessage('player1', 'player1', 'Test', 'Body', 'player', db as any),
    ).rejects.toThrow('Cannot send a message to yourself');
  });

  it('should paginate messages correctly', async () => {
    for (let i = 0; i < 25; i++) {
      await sendMessage('player1', 'player2', `Subject ${i}`, `Body ${i}`, 'player', db as any);
    }

    const page1 = await getInbox('player2', 1, 10, db as any);
    expect(page1.messages).toHaveLength(10);
    expect(page1.total).toBe(25);
    expect(page1.totalPages).toBe(3);

    const page3 = await getInbox('player2', 3, 10, db as any);
    expect(page3.messages).toHaveLength(5);
  });

  it('should mark all unread messages as read', async () => {
    await sendMessage('player1', 'player2', 'Msg 1', 'Body 1', 'player', db as any);
    await sendMessage('player3', 'player2', 'Msg 2', 'Body 2', 'player', db as any);
    await sendMessage('player1', 'player2', 'Msg 3', 'Body 3', 'player', db as any);

    let unreadCount = await getUnreadCount('player2', db as any);
    expect(unreadCount).toBe(3);

    const updated = await markAllRead('player2', db as any);
    expect(updated).toBe(3);

    unreadCount = await getUnreadCount('player2', db as any);
    expect(unreadCount).toBe(0);
  });

  it('should soft-delete message for recipient', async () => {
    const msg = await sendMessage('player1', 'player2', 'Test', 'Body', 'player', db as any);

    let inbox = await getInbox('player2', 1, 20, db as any);
    expect(inbox.messages).toHaveLength(1);

    const deleted = await deleteMessage(msg.id, 'player2', db as any);
    expect(deleted).toBe(true);

    inbox = await getInbox('player2', 1, 20, db as any);
    expect(inbox.messages).toHaveLength(0);
  });

  it('should deliver alliance message to all alliance members except sender', async () => {
    const messages = await sendAllianceMessage(
      'player1',
      'alliance1',
      'Alliance Announcement',
      'Important news for all members',
      db as any,
    );

    expect(messages).toHaveLength(1);
    expect(messages[0].toPlayerId).toBe('player2');
    expect(messages[0].type).toBe('alliance');

    const inbox = await getInbox('player2', 1, 20, db as any);
    expect(inbox.messages.some((m) => m.type === 'alliance')).toBe(true);
  });

  it('should create system message with null sender', async () => {
    const sysMsg = await sendSystemMessage(
      'player1',
      'Fleet Arrival',
      'Your fleet has arrived at destination',
      db as any,
      'system',
    );

    expect(sysMsg.fromPlayerId).toBe('');
    expect(sysMsg.fromPlayerName).toBe('System');
    expect(sysMsg.type).toBe('system');

    const inbox = await getInbox('player1', 1, 20, db as any);
    expect(inbox.messages).toHaveLength(1);
    expect(inbox.messages[0].fromPlayerName).toBe('System');
  });

  it('should auto-mark message as read when recipient views it', async () => {
    const msg = await sendMessage('player1', 'player2', 'Test', 'Body', 'player', db as any);

    let unreadCount = await getUnreadCount('player2', db as any);
    expect(unreadCount).toBe(1);

    const retrieved = await getMessage(msg.id, 'player2', db as any);
    expect(retrieved?.read).toBe(true);

    unreadCount = await getUnreadCount('player2', db as any);
    expect(unreadCount).toBe(0);
  });

  it('should clamp limit and offset to valid ranges', async () => {
    for (let i = 0; i < 5; i++) {
      await sendMessage('player1', 'player2', `Msg ${i}`, `Body ${i}`, 'player', db as any);
    }

    const page0 = await getInbox('player2', 0, 10, db as any);
    expect(page0.page).toBe(1);

    const limit0 = await getInbox('player2', 1, 0, db as any);
    expect(limit0.limit).toBe(1);

    const limit200 = await getInbox('player2', 1, 200, db as any);
    expect(limit200.limit).toBe(100);
  });

  it('should reject empty subject', async () => {
    await expect(
      sendMessage('player1', 'player2', '', 'Body', 'player', db as any),
    ).rejects.toThrow('Subject cannot be empty');
  });

  it('should reject empty body', async () => {
    await expect(
      sendMessage('player1', 'player2', 'Subject', '', 'player', db as any),
    ).rejects.toThrow('Body cannot be empty');
  });

  it('should reject subject exceeding max length', async () => {
    const longSubject = 'x'.repeat(201);
    await expect(
      sendMessage('player1', 'player2', longSubject, 'Body', 'player', db as any),
    ).rejects.toThrow('Subject exceeds maximum length');
  });

  it('should reject body exceeding max length', async () => {
    const longBody = 'x'.repeat(5001);
    await expect(
      sendMessage('player1', 'player2', 'Subject', longBody, 'player', db as any),
    ).rejects.toThrow('Body exceeds maximum length');
  });
});
