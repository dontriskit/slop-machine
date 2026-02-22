// ============================================================================
// MESSAGE SERVICE
// ============================================================================
//
// In-game messaging system supporting player-to-player messages, system
// notifications (fleet arrivals, battle reports, espionage), and alliance
// broadcasts.  All persistence is delegated to D1.
// ============================================================================

// ============================================================================
// TYPES
// ============================================================================

export type MessageType =
  | 'player'
  | 'system'
  | 'combat_report'
  | 'espionage_report'
  | 'alliance';

export interface Message {
  id: string;
  fromPlayerId: string;
  fromPlayerName: string;
  toPlayerId: string;
  subject: string;
  body: string;
  type: MessageType;
  read: boolean;
  createdAt: number; // unix seconds
}

export interface PaginatedMessages {
  messages: Message[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ============================================================================
// ID GENERATION
// ============================================================================

function generateMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// ============================================================================
// ROW -> MESSAGE MAPPER
// ============================================================================

interface MessageRow {
  id: string;
  from_player_id: string | null;
  from_player_name: string;
  to_player_id: string;
  subject: string;
  body: string;
  type: string;
  read: number;
  created_at: number;
}

function rowToMessage(row: MessageRow): Message {
  return {
    id: row.id,
    fromPlayerId: row.from_player_id ?? '',
    fromPlayerName: row.from_player_name,
    toPlayerId: row.to_player_id,
    subject: row.subject,
    body: row.body,
    type: row.type as MessageType,
    read: row.read === 1,
    createdAt: row.created_at,
  };
}

// ============================================================================
// VALIDATION
// ============================================================================

const MAX_SUBJECT_LENGTH = 200;
const MAX_BODY_LENGTH = 5000;

function validateSubject(subject: string): string | null {
  if (!subject || subject.trim().length === 0) {
    return 'Subject cannot be empty';
  }
  if (subject.length > MAX_SUBJECT_LENGTH) {
    return `Subject exceeds maximum length of ${MAX_SUBJECT_LENGTH} characters`;
  }
  return null;
}

function validateBody(body: string): string | null {
  if (!body || body.trim().length === 0) {
    return 'Body cannot be empty';
  }
  if (body.length > MAX_BODY_LENGTH) {
    return `Body exceeds maximum length of ${MAX_BODY_LENGTH} characters`;
  }
  return null;
}

// ============================================================================
// SEND MESSAGE
// ============================================================================

/**
 * sendMessage
 *
 * Send a message from one player to another.
 * Validates sender/recipient exist and content is within limits.
 *
 * @param fromPlayerId - sender player ID
 * @param toPlayerId   - recipient player ID
 * @param subject      - message subject
 * @param body         - message body
 * @param type         - message type (defaults to 'player')
 * @param db           - D1 database binding
 * @returns the created Message, or throws on validation error
 */
export async function sendMessage(
  fromPlayerId: string,
  toPlayerId: string,
  subject: string,
  body: string,
  type: MessageType = 'player',
  db: D1Database,
): Promise<Message> {
  // Validate content
  const subjectError = validateSubject(subject);
  if (subjectError) throw new Error(subjectError);

  const bodyError = validateBody(body);
  if (bodyError) throw new Error(bodyError);

  // Cannot send to yourself
  if (fromPlayerId === toPlayerId) {
    throw new Error('Cannot send a message to yourself');
  }

  // Verify sender exists
  const sender = await db
    .prepare('SELECT id, name FROM players WHERE id = ?')
    .bind(fromPlayerId)
    .first<{ id: string; name: string }>();

  if (!sender) {
    throw new Error('Sender not found');
  }

  // Verify recipient exists
  const recipient = await db
    .prepare('SELECT id FROM players WHERE id = ?')
    .bind(toPlayerId)
    .first();

  if (!recipient) {
    throw new Error('Recipient not found');
  }

  const id = generateMessageId();
  const now = Math.floor(Date.now() / 1000);

  await db
    .prepare(
      `INSERT INTO messages
         (id, from_player_id, from_player_name, to_player_id, subject, body, type, read, deleted_by_sender, deleted_by_recipient, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?)`,
    )
    .bind(id, fromPlayerId, sender.name, toPlayerId, subject, body, type, now)
    .run();

  return {
    id,
    fromPlayerId,
    fromPlayerName: sender.name,
    toPlayerId,
    subject,
    body,
    type,
    read: false,
    createdAt: now,
  };
}

// ============================================================================
// GET INBOX
// ============================================================================

/**
 * getInbox
 *
 * Returns paginated inbox for a player (newest first).
 * Excludes messages soft-deleted by the recipient.
 */
export async function getInbox(
  playerId: string,
  page: number = 1,
  limit: number = 20,
  db: D1Database,
): Promise<PaginatedMessages> {
  if (page < 1) page = 1;
  if (limit < 1) limit = 1;
  if (limit > 100) limit = 100;

  const offset = (page - 1) * limit;

  // Count total
  const countResult = await db
    .prepare(
      `SELECT COUNT(*) AS total
       FROM messages
       WHERE to_player_id = ? AND deleted_by_recipient = 0`,
    )
    .bind(playerId)
    .first<{ total: number }>();

  const total = countResult?.total ?? 0;

  // Fetch page
  const result = await db
    .prepare(
      `SELECT id, from_player_id, from_player_name, to_player_id, subject, body, type, read, created_at
       FROM messages
       WHERE to_player_id = ? AND deleted_by_recipient = 0
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
    )
    .bind(playerId, limit, offset)
    .all();

  const messages = (result.results as unknown as MessageRow[]).map(rowToMessage);

  return {
    messages,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

// ============================================================================
// GET OUTBOX
// ============================================================================

/**
 * getOutbox
 *
 * Returns paginated sent messages for a player (newest first).
 * Excludes messages soft-deleted by the sender.
 */
export async function getOutbox(
  playerId: string,
  page: number = 1,
  limit: number = 20,
  db: D1Database,
): Promise<PaginatedMessages> {
  if (page < 1) page = 1;
  if (limit < 1) limit = 1;
  if (limit > 100) limit = 100;

  const offset = (page - 1) * limit;

  // Count total
  const countResult = await db
    .prepare(
      `SELECT COUNT(*) AS total
       FROM messages
       WHERE from_player_id = ? AND deleted_by_sender = 0`,
    )
    .bind(playerId)
    .first<{ total: number }>();

  const total = countResult?.total ?? 0;

  // Fetch page
  const result = await db
    .prepare(
      `SELECT id, from_player_id, from_player_name, to_player_id, subject, body, type, read, created_at
       FROM messages
       WHERE from_player_id = ? AND deleted_by_sender = 0
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
    )
    .bind(playerId, limit, offset)
    .all();

  const messages = (result.results as unknown as MessageRow[]).map(rowToMessage);

  return {
    messages,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

// ============================================================================
// GET SINGLE MESSAGE
// ============================================================================

/**
 * getMessage
 *
 * Retrieves a single message by ID, verifying the requesting player is
 * either the sender or recipient.  Automatically marks the message as read
 * if the requesting player is the recipient.
 */
export async function getMessage(
  messageId: string,
  playerId: string,
  db: D1Database,
): Promise<Message | null> {
  const row = await db
    .prepare(
      `SELECT id, from_player_id, from_player_name, to_player_id, subject, body, type, read, created_at,
              deleted_by_sender, deleted_by_recipient
       FROM messages
       WHERE id = ?`,
    )
    .bind(messageId)
    .first<MessageRow & { deleted_by_sender: number; deleted_by_recipient: number }>();

  if (!row) return null;

  // Check the player is sender or recipient
  const isSender = row.from_player_id === playerId;
  const isRecipient = row.to_player_id === playerId;

  if (!isSender && !isRecipient) {
    return null; // Not authorized
  }

  // If deleted by this player, treat as not found
  if (isSender && row.deleted_by_sender === 1) return null;
  if (isRecipient && row.deleted_by_recipient === 1) return null;

  // Mark as read if recipient is viewing
  if (isRecipient && row.read === 0) {
    await db
      .prepare('UPDATE messages SET read = 1 WHERE id = ?')
      .bind(messageId)
      .run();
  }

  const message = rowToMessage(row);
  // If we just marked it read, reflect that
  if (isRecipient) {
    message.read = true;
  }

  return message;
}

// ============================================================================
// DELETE MESSAGE (SOFT)
// ============================================================================

/**
 * deleteMessage
 *
 * Soft-deletes a message for the requesting player.  If both sender and
 * recipient have soft-deleted the message, it is permanently removed.
 *
 * @returns true if the message was found and deleted, false otherwise
 */
export async function deleteMessage(
  messageId: string,
  playerId: string,
  db: D1Database,
): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT id, from_player_id, to_player_id, deleted_by_sender, deleted_by_recipient
       FROM messages
       WHERE id = ?`,
    )
    .bind(messageId)
    .first<{
      id: string;
      from_player_id: string | null;
      to_player_id: string;
      deleted_by_sender: number;
      deleted_by_recipient: number;
    }>();

  if (!row) return false;

  const isSender = row.from_player_id === playerId;
  const isRecipient = row.to_player_id === playerId;

  if (!isSender && !isRecipient) return false;

  // Set the appropriate soft-delete flag
  if (isSender) {
    await db
      .prepare('UPDATE messages SET deleted_by_sender = 1 WHERE id = ?')
      .bind(messageId)
      .run();
  }

  if (isRecipient) {
    await db
      .prepare('UPDATE messages SET deleted_by_recipient = 1 WHERE id = ?')
      .bind(messageId)
      .run();
  }

  // If both have deleted, permanently remove the row
  const updated = await db
    .prepare(
      `SELECT deleted_by_sender, deleted_by_recipient
       FROM messages
       WHERE id = ?`,
    )
    .bind(messageId)
    .first<{ deleted_by_sender: number; deleted_by_recipient: number }>();

  if (updated && updated.deleted_by_sender === 1 && updated.deleted_by_recipient === 1) {
    await db
      .prepare('DELETE FROM messages WHERE id = ?')
      .bind(messageId)
      .run();
  }

  return true;
}

// ============================================================================
// GET UNREAD COUNT
// ============================================================================

/**
 * getUnreadCount
 *
 * Returns the number of unread messages in a player's inbox.
 */
export async function getUnreadCount(
  playerId: string,
  db: D1Database,
): Promise<number> {
  const result = await db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM messages
       WHERE to_player_id = ? AND read = 0 AND deleted_by_recipient = 0`,
    )
    .bind(playerId)
    .first<{ count: number }>();

  return result?.count ?? 0;
}

// ============================================================================
// MARK ALL READ
// ============================================================================

/**
 * markAllRead
 *
 * Marks all unread messages in a player's inbox as read.
 * Returns the number of messages that were updated.
 */
export async function markAllRead(
  playerId: string,
  db: D1Database,
): Promise<number> {
  const result = await db
    .prepare(
      `UPDATE messages
       SET read = 1
       WHERE to_player_id = ? AND read = 0 AND deleted_by_recipient = 0`,
    )
    .bind(playerId)
    .run();

  return result.meta?.changes ?? 0;
}

// ============================================================================
// SEND SYSTEM MESSAGE
// ============================================================================

/**
 * sendSystemMessage
 *
 * Sends a system-generated notification to a player.  System messages have
 * no sender (from_player_id is null) and from_player_name is 'System'.
 *
 * Used for fleet arrival notices, battle reports, espionage detection, etc.
 */
export async function sendSystemMessage(
  toPlayerId: string,
  subject: string,
  body: string,
  db: D1Database,
  type: MessageType = 'system',
): Promise<Message> {
  const subjectError = validateSubject(subject);
  if (subjectError) throw new Error(subjectError);

  const bodyError = validateBody(body);
  if (bodyError) throw new Error(bodyError);

  const id = generateMessageId();
  const now = Math.floor(Date.now() / 1000);

  await db
    .prepare(
      `INSERT INTO messages
         (id, from_player_id, from_player_name, to_player_id, subject, body, type, read, deleted_by_sender, deleted_by_recipient, created_at)
       VALUES (?, NULL, 'System', ?, ?, ?, ?, 0, 0, 0, ?)`,
    )
    .bind(id, toPlayerId, subject, body, type, now)
    .run();

  return {
    id,
    fromPlayerId: '',
    fromPlayerName: 'System',
    toPlayerId,
    subject,
    body,
    type,
    read: false,
    createdAt: now,
  };
}

// ============================================================================
// SEND ALLIANCE MESSAGE
// ============================================================================

/**
 * sendAllianceMessage
 *
 * Broadcasts a message to all members of an alliance.
 * Looks up alliance members from the players table (via alliance_tag matching
 * the alliance's tag), then inserts one message row per member.
 *
 * The sender is excluded from the recipient list.
 *
 * @returns array of created messages (one per recipient)
 */
export async function sendAllianceMessage(
  fromPlayerId: string,
  allianceId: string,
  subject: string,
  body: string,
  db: D1Database,
): Promise<Message[]> {
  const subjectError = validateSubject(subject);
  if (subjectError) throw new Error(subjectError);

  const bodyError = validateBody(body);
  if (bodyError) throw new Error(bodyError);

  // Verify sender exists and get name
  const sender = await db
    .prepare('SELECT id, name FROM players WHERE id = ?')
    .bind(fromPlayerId)
    .first<{ id: string; name: string }>();

  if (!sender) {
    throw new Error('Sender not found');
  }

  // Get alliance tag
  const alliance = await db
    .prepare('SELECT id, tag FROM alliances WHERE id = ?')
    .bind(allianceId)
    .first<{ id: string; tag: string }>();

  if (!alliance) {
    throw new Error('Alliance not found');
  }

  // Get all alliance members (excluding sender)
  const membersResult = await db
    .prepare(
      `SELECT id FROM players WHERE alliance_tag = ? AND id != ?`,
    )
    .bind(alliance.tag, fromPlayerId)
    .all();

  const members = membersResult.results as Array<{ id: string }>;

  if (members.length === 0) {
    return [];
  }

  const now = Math.floor(Date.now() / 1000);
  const messages: Message[] = [];

  // Insert one message per member
  for (const member of members) {
    const id = generateMessageId();

    await db
      .prepare(
        `INSERT INTO messages
           (id, from_player_id, from_player_name, to_player_id, subject, body, type, read, deleted_by_sender, deleted_by_recipient, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'alliance', 0, 0, 0, ?)`,
      )
      .bind(id, fromPlayerId, sender.name, member.id, subject, body, now)
      .run();

    messages.push({
      id,
      fromPlayerId,
      fromPlayerName: sender.name,
      toPlayerId: member.id,
      subject,
      body,
      type: 'alliance',
      read: false,
      createdAt: now,
    });
  }

  return messages;
}
