// ============================================================================
// CHAT SERVICE
// ============================================================================
//
// Global & Alliance real-time chat with moderation support.
// Channels:
//   'global'   — visible to all players
//   'alliance' — visible to alliance members only (channel = alliance ID)
//
// Rate limit: 1 message per 3 seconds per player.
// ============================================================================

export interface ChatMessage {
  id: string;
  channel: string;
  playerId: string;
  playerName: string;
  message: string;
  timestamp: number; // unix seconds
  isDeleted: boolean;
}

interface ChatMessageRow {
  id: string;
  channel: string;
  player_id: string;
  player_name: string;
  message: string;
  timestamp: number;
  is_deleted: number;
}

function rowToMessage(row: ChatMessageRow): ChatMessage {
  return {
    id: row.id,
    channel: row.channel,
    playerId: row.player_id,
    playerName: row.player_name,
    message: row.message,
    timestamp: row.timestamp,
    isDeleted: row.is_deleted === 1,
  };
}

function makeId(): string {
  return `chat-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const MAX_MESSAGE_LENGTH = 500;
const RATE_LIMIT_SECONDS = 3;

/**
 * getChatHistory
 *
 * Returns paginated chat history for a channel, ordered newest first.
 */
export async function getChatHistory(
  channel: string,
  limit: number = 50,
  before: number | null,
  db: D1Database,
): Promise<ChatMessage[]> {
  if (limit < 1) limit = 1;
  if (limit > 100) limit = 100;

  let query: string;
  let params: (string | number)[];

  if (before != null) {
    query = `
      SELECT id, channel, player_id, player_name, message, timestamp, is_deleted
      FROM chat_messages
      WHERE channel = ? AND timestamp < ? AND is_deleted = 0
      ORDER BY timestamp DESC
      LIMIT ?
    `;
    params = [channel, before, limit];
  } else {
    query = `
      SELECT id, channel, player_id, player_name, message, timestamp, is_deleted
      FROM chat_messages
      WHERE channel = ? AND is_deleted = 0
      ORDER BY timestamp DESC
      LIMIT ?
    `;
    params = [channel, limit];
  }

  const result = await db.prepare(query).bind(...params).all<ChatMessageRow>();
  return (result.results ?? []).map(rowToMessage).reverse(); // oldest first
}

/**
 * sendChatMessage
 *
 * Sends a message to the given channel.
 * Enforces 500-char limit and 3-second rate limit per player.
 */
export async function sendChatMessage(
  channel: string,
  playerId: string,
  message: string,
  db: D1Database,
): Promise<ChatMessage> {
  const trimmed = message.trim();

  if (!trimmed || trimmed.length === 0) {
    throw new Error('Message cannot be empty');
  }
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    throw new Error(`Message exceeds maximum length of ${MAX_MESSAGE_LENGTH} characters`);
  }

  // Verify player exists and get name
  const player = await db
    .prepare('SELECT id, name FROM players WHERE id = ?')
    .bind(playerId)
    .first<{ id: string; name: string }>();

  if (!player) {
    throw new Error('Player not found');
  }

  // Rate limit: check last message timestamp
  const now = Math.floor(Date.now() / 1000);
  const lastMsg = await db
    .prepare(
      `SELECT timestamp FROM chat_messages
       WHERE player_id = ?
       ORDER BY timestamp DESC
       LIMIT 1`
    )
    .bind(playerId)
    .first<{ timestamp: number }>();

  if (lastMsg && now - lastMsg.timestamp < RATE_LIMIT_SECONDS) {
    throw new Error(`Rate limit: please wait ${RATE_LIMIT_SECONDS} seconds between messages`);
  }

  const id = makeId();

  await db
    .prepare(
      `INSERT INTO chat_messages (id, channel, player_id, player_name, message, timestamp, is_deleted)
       VALUES (?, ?, ?, ?, ?, ?, 0)`
    )
    .bind(id, channel, playerId, player.name, trimmed, now)
    .run();

  return {
    id,
    channel,
    playerId,
    playerName: player.name,
    message: trimmed,
    timestamp: now,
    isDeleted: false,
  };
}

/**
 * deleteChatMessage
 *
 * Soft-deletes a chat message. The requesting player must be the author.
 */
export async function deleteChatMessage(
  channel: string,
  messageId: string,
  playerId: string,
  db: D1Database,
): Promise<void> {
  const row = await db
    .prepare(
      'SELECT id, player_id, is_deleted FROM chat_messages WHERE id = ? AND channel = ?'
    )
    .bind(messageId, channel)
    .first<{ id: string; player_id: string; is_deleted: number }>();

  if (!row) {
    throw new Error('Message not found');
  }

  if (row.player_id !== playerId) {
    throw new Error('Cannot delete another player\'s message');
  }

  if (row.is_deleted === 1) {
    throw new Error('Message already deleted');
  }

  await db
    .prepare('UPDATE chat_messages SET is_deleted = 1 WHERE id = ?')
    .bind(messageId)
    .run();
}
