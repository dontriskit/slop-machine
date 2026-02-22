// ============================================================================
// ALLIANCE SERVICE
// ============================================================================
//
// Manages alliance creation, membership, roles, and applications.
//
// Role hierarchy (highest → lowest):
//   founder > officer > member > applicant
//
// Permission summary:
//   founder   — dissolve, promote, demote, kick, accept, reject, all member ops
//   officer   — accept, reject, kick members (not founder), all member ops
//   member    — leave
//   applicant — cancel own application (via leaveAlliance)

// ============================================================================
// TYPES
// ============================================================================

export interface Alliance {
  id: string;
  name: string;
  tag: string;           // 3–8 character tag shown in galaxy view
  founderId: string;
  description: string;
  memberCount: number;
  createdAt: number;     // unix seconds
}

export type AllianceRole = 'founder' | 'officer' | 'member' | 'applicant';

export interface AllianceMember {
  playerId: string;
  playerName: string;
  allianceId: string;
  role: AllianceRole;
  joinedAt: number;      // unix seconds
}

export interface AllianceApplication {
  id: string;
  playerId: string;
  playerName: string;
  allianceId: string;
  message: string;
  createdAt: number;     // unix seconds
}

export interface AllianceSearchResult {
  id: string;
  name: string;
  tag: string;
  memberCount: number;
  createdAt: number;
}

// ============================================================================
// INTERNAL DB ROW TYPES
// ============================================================================

interface AllianceRow {
  id: string;
  name: string;
  tag: string;
  founder_id: string;
  description: string;
  member_count: number;
  created_at: number;
}

interface MemberRow {
  player_id: string;
  player_name: string;
  alliance_id: string;
  role: AllianceRole;
  joined_at: number;
}

interface ApplicationRow {
  id: string;
  player_id: string;
  player_name: string;
  alliance_id: string;
  message: string;
  created_at: number;
}

// ============================================================================
// HELPERS
// ============================================================================

/** Generate a short unique ID prefixed with the given prefix. */
function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Map a DB row to the Alliance interface. */
function rowToAlliance(row: AllianceRow): Alliance {
  return {
    id: row.id,
    name: row.name,
    tag: row.tag,
    founderId: row.founder_id,
    description: row.description,
    memberCount: row.member_count,
    createdAt: row.created_at,
  };
}

/** Map a DB row to the AllianceMember interface. */
function rowToMember(row: MemberRow): AllianceMember {
  return {
    playerId: row.player_id,
    playerName: row.player_name,
    allianceId: row.alliance_id,
    role: row.role,
    joinedAt: row.joined_at,
  };
}

/** Numeric rank for permission comparisons — higher = more authority. */
const ROLE_RANK: Record<AllianceRole, number> = {
  founder: 3,
  officer: 2,
  member: 1,
  applicant: 0,
};

function canManage(actorRole: AllianceRole, targetRole: AllianceRole): boolean {
  return ROLE_RANK[actorRole] > ROLE_RANK[targetRole];
}

// ============================================================================
// SERVICE FUNCTIONS
// ============================================================================

/**
 * createAlliance
 *
 * Creates a new alliance with the given name and tag.
 * The founding player automatically joins as 'founder'.
 *
 * Constraints:
 *   - name must be 3–32 characters
 *   - tag must be 3–8 uppercase alphanumeric characters
 *   - name and tag must be globally unique (UNIQUE constraint in DB)
 *   - player must not already be in an alliance
 */
export async function createAlliance(
  playerId: string,
  name: string,
  tag: string,
  description: string,
  db: D1Database,
): Promise<Alliance> {
  const trimmedName = name.trim();
  const upperTag = tag.toUpperCase().trim();

  if (trimmedName.length < 3 || trimmedName.length > 32) {
    throw new Error('Alliance name must be 3–32 characters');
  }

  if (!/^[A-Z0-9]{3,8}$/.test(upperTag)) {
    throw new Error('Alliance tag must be 3–8 uppercase alphanumeric characters');
  }

  // Verify player exists
  const player = await db.prepare('SELECT id FROM players WHERE id = ?').bind(playerId).first();
  if (!player) {
    throw new Error('Player not found');
  }

  // Verify player is not already in an alliance
  const existingMembership = await db
    .prepare(
      `SELECT am.alliance_id
       FROM alliance_members am
       WHERE am.player_id = ? AND am.role != 'applicant'`
    )
    .bind(playerId)
    .first();

  if (existingMembership) {
    throw new Error('Player is already a member of an alliance');
  }

  const id = makeId('alliance');
  const now = Math.floor(Date.now() / 1000);

  // Insert alliance row — UNIQUE constraint on name and tag will throw if taken
  await db
    .prepare(
      `INSERT INTO alliances (id, name, tag, founder_id, description, member_count, created_at)
       VALUES (?, ?, ?, ?, ?, 1, ?)`
    )
    .bind(id, trimmedName, upperTag, playerId, description ?? '', now)
    .run();

  // Founder joins automatically
  await db
    .prepare(
      `INSERT INTO alliance_members (player_id, alliance_id, role, joined_at)
       VALUES (?, ?, 'founder', ?)`
    )
    .bind(playerId, id, now)
    .run();

  // Update player's alliance_tag on the players table
  await db
    .prepare(`UPDATE players SET alliance_tag = ? WHERE id = ?`)
    .bind(upperTag, playerId)
    .run();

  return {
    id,
    name: trimmedName,
    tag: upperTag,
    founderId: playerId,
    description: description ?? '',
    memberCount: 1,
    createdAt: now,
  };
}

/**
 * dissolveAlliance
 *
 * Permanently deletes the alliance and removes all members.
 * Only the founder can dissolve.
 */
export async function dissolveAlliance(
  allianceId: string,
  requesterId: string,
  db: D1Database,
): Promise<void> {
  const alliance = await db
    .prepare('SELECT * FROM alliances WHERE id = ?')
    .bind(allianceId)
    .first<AllianceRow>();

  if (!alliance) {
    throw new Error('Alliance not found');
  }

  if (alliance.founder_id !== requesterId) {
    throw new Error('Only the founder can dissolve an alliance');
  }

  // Clear alliance_tag from all members' player rows
  await db
    .prepare(
      `UPDATE players SET alliance_tag = NULL
       WHERE id IN (SELECT player_id FROM alliance_members WHERE alliance_id = ?)`
    )
    .bind(allianceId)
    .run();

  // Delete members, applications, and finally the alliance row
  await db
    .prepare('DELETE FROM alliance_members WHERE alliance_id = ?')
    .bind(allianceId)
    .run();

  await db
    .prepare('DELETE FROM alliance_applications WHERE alliance_id = ?')
    .bind(allianceId)
    .run();

  await db
    .prepare('DELETE FROM alliances WHERE id = ?')
    .bind(allianceId)
    .run();
}

/**
 * applyToAlliance
 *
 * Submits a membership application on behalf of a player.
 * The player must not already be in an alliance or have a pending application.
 */
export async function applyToAlliance(
  playerId: string,
  allianceId: string,
  message: string,
  db: D1Database,
): Promise<AllianceApplication> {
  // Verify alliance exists
  const alliance = await db
    .prepare('SELECT id, tag FROM alliances WHERE id = ?')
    .bind(allianceId)
    .first<{ id: string; tag: string }>();

  if (!alliance) {
    throw new Error('Alliance not found');
  }

  // Verify player exists
  const player = await db
    .prepare('SELECT id, name FROM players WHERE id = ?')
    .bind(playerId)
    .first<{ id: string; name: string }>();

  if (!player) {
    throw new Error('Player not found');
  }

  // Must not already be a full member/officer/founder
  const existingMembership = await db
    .prepare(
      `SELECT role FROM alliance_members WHERE player_id = ? AND role != 'applicant'`
    )
    .bind(playerId)
    .first<{ role: AllianceRole }>();

  if (existingMembership) {
    throw new Error('Player is already a member of an alliance');
  }

  // Must not have a pending application to this alliance
  const existingApp = await db
    .prepare(
      'SELECT id FROM alliance_applications WHERE player_id = ? AND alliance_id = ?'
    )
    .bind(playerId, allianceId)
    .first<{ id: string }>();

  if (existingApp) {
    throw new Error('Player already has a pending application to this alliance');
  }

  const id = makeId('app');
  const now = Math.floor(Date.now() / 1000);

  await db
    .prepare(
      `INSERT INTO alliance_applications (id, player_id, alliance_id, message, created_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(id, playerId, allianceId, message ?? '', now)
    .run();

  return {
    id,
    playerId,
    playerName: player.name,
    allianceId,
    message: message ?? '',
    createdAt: now,
  };
}

/**
 * acceptApplication
 *
 * Accepts a player's application and promotes them to 'member'.
 * Officers and founders can accept applications.
 */
export async function acceptApplication(
  allianceId: string,
  applicantId: string,
  officerId: string,
  db: D1Database,
): Promise<AllianceMember> {
  // Verify officer's rank
  const officerMember = await db
    .prepare(
      `SELECT role FROM alliance_members WHERE player_id = ? AND alliance_id = ?`
    )
    .bind(officerId, allianceId)
    .first<{ role: AllianceRole }>();

  if (!officerMember || ROLE_RANK[officerMember.role] < ROLE_RANK['officer']) {
    throw new Error('Only officers or founders can accept applications');
  }

  // Verify application exists
  const application = await db
    .prepare(
      'SELECT id FROM alliance_applications WHERE player_id = ? AND alliance_id = ?'
    )
    .bind(applicantId, allianceId)
    .first<{ id: string }>();

  if (!application) {
    throw new Error('Application not found');
  }

  // Verify applicant is not already a member elsewhere
  const existingMembership = await db
    .prepare(
      `SELECT role FROM alliance_members WHERE player_id = ? AND role != 'applicant'`
    )
    .bind(applicantId)
    .first<{ role: AllianceRole }>();

  if (existingMembership) {
    // Clean up the stale application
    await db
      .prepare('DELETE FROM alliance_applications WHERE player_id = ? AND alliance_id = ?')
      .bind(applicantId, allianceId)
      .run();
    throw new Error('Applicant is already a member of another alliance');
  }

  const player = await db
    .prepare('SELECT name FROM players WHERE id = ?')
    .bind(applicantId)
    .first<{ name: string }>();

  if (!player) {
    throw new Error('Player not found');
  }

  const now = Math.floor(Date.now() / 1000);

  // Get alliance tag for player update
  const alliance = await db
    .prepare('SELECT tag FROM alliances WHERE id = ?')
    .bind(allianceId)
    .first<{ tag: string }>();

  if (!alliance) {
    throw new Error('Alliance not found');
  }

  // Insert member row
  await db
    .prepare(
      `INSERT INTO alliance_members (player_id, alliance_id, role, joined_at)
       VALUES (?, ?, 'member', ?)`
    )
    .bind(applicantId, allianceId, now)
    .run();

  // Remove the application
  await db
    .prepare('DELETE FROM alliance_applications WHERE player_id = ? AND alliance_id = ?')
    .bind(applicantId, allianceId)
    .run();

  // Increment member_count
  await db
    .prepare('UPDATE alliances SET member_count = member_count + 1 WHERE id = ?')
    .bind(allianceId)
    .run();

  // Update player's alliance_tag
  await db
    .prepare('UPDATE players SET alliance_tag = ? WHERE id = ?')
    .bind(alliance.tag, applicantId)
    .run();

  return {
    playerId: applicantId,
    playerName: player.name,
    allianceId,
    role: 'member',
    joinedAt: now,
  };
}

/**
 * rejectApplication
 *
 * Rejects and deletes a player's application.
 * Officers and founders can reject applications.
 */
export async function rejectApplication(
  allianceId: string,
  applicantId: string,
  officerId: string,
  db: D1Database,
): Promise<void> {
  // Verify officer's rank
  const officerMember = await db
    .prepare(
      `SELECT role FROM alliance_members WHERE player_id = ? AND alliance_id = ?`
    )
    .bind(officerId, allianceId)
    .first<{ role: AllianceRole }>();

  if (!officerMember || ROLE_RANK[officerMember.role] < ROLE_RANK['officer']) {
    throw new Error('Only officers or founders can reject applications');
  }

  const result = await db
    .prepare(
      'DELETE FROM alliance_applications WHERE player_id = ? AND alliance_id = ?'
    )
    .bind(applicantId, allianceId)
    .run();

  if (result.meta.changes === 0) {
    throw new Error('Application not found');
  }
}

/**
 * kickMember
 *
 * Removes a member from the alliance.
 * Officers can kick members (not founders). Founders can kick anyone.
 */
export async function kickMember(
  allianceId: string,
  memberId: string,
  officerId: string,
  db: D1Database,
): Promise<void> {
  if (memberId === officerId) {
    throw new Error('Cannot kick yourself — use leaveAlliance instead');
  }

  // Verify kicker's role
  const kickerMember = await db
    .prepare(
      `SELECT role FROM alliance_members WHERE player_id = ? AND alliance_id = ?`
    )
    .bind(officerId, allianceId)
    .first<{ role: AllianceRole }>();

  if (!kickerMember || ROLE_RANK[kickerMember.role] < ROLE_RANK['officer']) {
    throw new Error('Only officers or founders can kick members');
  }

  // Verify target's role
  const targetMember = await db
    .prepare(
      `SELECT role FROM alliance_members WHERE player_id = ? AND alliance_id = ?`
    )
    .bind(memberId, allianceId)
    .first<{ role: AllianceRole }>();

  if (!targetMember) {
    throw new Error('Member not found in alliance');
  }

  if (!canManage(kickerMember.role, targetMember.role)) {
    throw new Error('Cannot kick a member with equal or higher rank');
  }

  // Remove member
  await db
    .prepare('DELETE FROM alliance_members WHERE player_id = ? AND alliance_id = ?')
    .bind(memberId, allianceId)
    .run();

  // Decrement member_count (applicants don't count)
  if (targetMember.role !== 'applicant') {
    await db
      .prepare('UPDATE alliances SET member_count = member_count - 1 WHERE id = ?')
      .bind(allianceId)
      .run();
  }

  // Clear alliance_tag from player
  await db
    .prepare('UPDATE players SET alliance_tag = NULL WHERE id = ?')
    .bind(memberId)
    .run();
}

/**
 * leaveAlliance
 *
 * Removes the calling player from the alliance.
 * The founder cannot leave — they must dissolve the alliance first.
 */
export async function leaveAlliance(
  playerId: string,
  allianceId: string,
  db: D1Database,
): Promise<void> {
  const membership = await db
    .prepare(
      `SELECT role FROM alliance_members WHERE player_id = ? AND alliance_id = ?`
    )
    .bind(playerId, allianceId)
    .first<{ role: AllianceRole }>();

  if (!membership) {
    // Also check applications
    const application = await db
      .prepare('SELECT id FROM alliance_applications WHERE player_id = ? AND alliance_id = ?')
      .bind(playerId, allianceId)
      .first<{ id: string }>();

    if (application) {
      // Player is withdrawing their application
      await db
        .prepare('DELETE FROM alliance_applications WHERE player_id = ? AND alliance_id = ?')
        .bind(playerId, allianceId)
        .run();
      return;
    }

    throw new Error('Player is not a member of this alliance');
  }

  if (membership.role === 'founder') {
    throw new Error('Founder cannot leave — dissolve the alliance instead');
  }

  await db
    .prepare('DELETE FROM alliance_members WHERE player_id = ? AND alliance_id = ?')
    .bind(playerId, allianceId)
    .run();

  if (membership.role !== 'applicant') {
    await db
      .prepare('UPDATE alliances SET member_count = member_count - 1 WHERE id = ?')
      .bind(allianceId)
      .run();
  }

  // Clear alliance_tag from player
  await db
    .prepare('UPDATE players SET alliance_tag = NULL WHERE id = ?')
    .bind(playerId)
    .run();
}

/**
 * promoteToOfficer
 *
 * Promotes a full member to officer rank.
 * Only the founder can promote.
 */
export async function promoteToOfficer(
  allianceId: string,
  memberId: string,
  founderId: string,
  db: D1Database,
): Promise<AllianceMember> {
  // Verify caller is founder
  const callerMember = await db
    .prepare(
      `SELECT role FROM alliance_members WHERE player_id = ? AND alliance_id = ?`
    )
    .bind(founderId, allianceId)
    .first<{ role: AllianceRole }>();

  if (!callerMember || callerMember.role !== 'founder') {
    throw new Error('Only the founder can promote members to officer');
  }

  // Verify target is a member (not applicant, not already officer/founder)
  const targetMember = await db
    .prepare(
      `SELECT am.role, p.name AS player_name
       FROM alliance_members am
       JOIN players p ON p.id = am.player_id
       WHERE am.player_id = ? AND am.alliance_id = ?`
    )
    .bind(memberId, allianceId)
    .first<{ role: AllianceRole; player_name: string }>();

  if (!targetMember) {
    throw new Error('Member not found in alliance');
  }

  if (targetMember.role !== 'member') {
    throw new Error(`Cannot promote — member is already '${targetMember.role}'`);
  }

  const now = Math.floor(Date.now() / 1000);

  await db
    .prepare(
      `UPDATE alliance_members SET role = 'officer' WHERE player_id = ? AND alliance_id = ?`
    )
    .bind(memberId, allianceId)
    .run();

  // Retrieve joined_at for return value
  const updated = await db
    .prepare(
      `SELECT joined_at FROM alliance_members WHERE player_id = ? AND alliance_id = ?`
    )
    .bind(memberId, allianceId)
    .first<{ joined_at: number }>();

  return {
    playerId: memberId,
    playerName: targetMember.player_name,
    allianceId,
    role: 'officer',
    joinedAt: updated?.joined_at ?? now,
  };
}

/**
 * demoteToMember
 *
 * Demotes an officer back to regular member.
 * Only the founder can demote.
 */
export async function demoteToMember(
  allianceId: string,
  officerId: string,
  founderId: string,
  db: D1Database,
): Promise<AllianceMember> {
  // Verify caller is founder
  const callerMember = await db
    .prepare(
      `SELECT role FROM alliance_members WHERE player_id = ? AND alliance_id = ?`
    )
    .bind(founderId, allianceId)
    .first<{ role: AllianceRole }>();

  if (!callerMember || callerMember.role !== 'founder') {
    throw new Error('Only the founder can demote officers');
  }

  // Verify target is an officer
  const targetMember = await db
    .prepare(
      `SELECT am.role, am.joined_at, p.name AS player_name
       FROM alliance_members am
       JOIN players p ON p.id = am.player_id
       WHERE am.player_id = ? AND am.alliance_id = ?`
    )
    .bind(officerId, allianceId)
    .first<{ role: AllianceRole; joined_at: number; player_name: string }>();

  if (!targetMember) {
    throw new Error('Member not found in alliance');
  }

  if (targetMember.role !== 'officer') {
    throw new Error(`Cannot demote — member is '${targetMember.role}', not 'officer'`);
  }

  await db
    .prepare(
      `UPDATE alliance_members SET role = 'member' WHERE player_id = ? AND alliance_id = ?`
    )
    .bind(officerId, allianceId)
    .run();

  return {
    playerId: officerId,
    playerName: targetMember.player_name,
    allianceId,
    role: 'member',
    joinedAt: targetMember.joined_at,
  };
}

/**
 * getAllianceMembers
 *
 * Returns all members (and their roles) in the given alliance.
 * Results are ordered by role rank (founder first), then joinedAt.
 */
export async function getAllianceMembers(
  allianceId: string,
  db: D1Database,
): Promise<AllianceMember[]> {
  const alliance = await db
    .prepare('SELECT id FROM alliances WHERE id = ?')
    .bind(allianceId)
    .first<{ id: string }>();

  if (!alliance) {
    throw new Error('Alliance not found');
  }

  const result = await db
    .prepare(
      `SELECT am.player_id, p.name AS player_name, am.alliance_id, am.role, am.joined_at
       FROM alliance_members am
       JOIN players p ON p.id = am.player_id
       WHERE am.alliance_id = ?
       ORDER BY
         CASE am.role
           WHEN 'founder'   THEN 0
           WHEN 'officer'   THEN 1
           WHEN 'member'    THEN 2
           WHEN 'applicant' THEN 3
         END ASC,
         am.joined_at ASC`
    )
    .bind(allianceId)
    .all<MemberRow>();

  return (result.results ?? []).map(rowToMember);
}

/**
 * getAllianceApplications
 *
 * Returns all pending applications for the given alliance.
 * Only officers/founders would call this in practice.
 */
export async function getAllianceApplications(
  allianceId: string,
  db: D1Database,
): Promise<AllianceApplication[]> {
  const result = await db
    .prepare(
      `SELECT aa.id, aa.player_id, p.name AS player_name, aa.alliance_id, aa.message, aa.created_at
       FROM alliance_applications aa
       JOIN players p ON p.id = aa.player_id
       WHERE aa.alliance_id = ?
       ORDER BY aa.created_at ASC`
    )
    .bind(allianceId)
    .all<ApplicationRow>();

  return (result.results ?? []).map((row) => ({
    id: row.id,
    playerId: row.player_id,
    playerName: row.player_name,
    allianceId: row.alliance_id,
    message: row.message,
    createdAt: row.created_at,
  }));
}

/**
 * getPlayerAlliance
 *
 * Returns the alliance (and the player's role in it) for the given player.
 * Returns null if the player is not in any alliance.
 */
export async function getPlayerAlliance(
  playerId: string,
  db: D1Database,
): Promise<{ alliance: Alliance; role: AllianceRole } | null> {
  const memberRow = await db
    .prepare(
      `SELECT am.role, am.alliance_id
       FROM alliance_members am
       WHERE am.player_id = ? AND am.role != 'applicant'`
    )
    .bind(playerId)
    .first<{ role: AllianceRole; alliance_id: string }>();

  if (!memberRow) {
    return null;
  }

  const alliance = await db
    .prepare('SELECT * FROM alliances WHERE id = ?')
    .bind(memberRow.alliance_id)
    .first<AllianceRow>();

  if (!alliance) {
    return null;
  }

  return {
    alliance: rowToAlliance(alliance),
    role: memberRow.role,
  };
}

/**
 * getAllianceById
 *
 * Returns alliance details for the given ID.
 */
export async function getAllianceById(
  allianceId: string,
  db: D1Database,
): Promise<Alliance> {
  const alliance = await db
    .prepare('SELECT * FROM alliances WHERE id = ?')
    .bind(allianceId)
    .first<AllianceRow>();

  if (!alliance) {
    throw new Error('Alliance not found');
  }

  return rowToAlliance(alliance);
}

/**
 * searchAlliances
 *
 * Full-text search over alliance names and tags.
 * Returns up to 20 results ordered by member_count descending (most active first).
 */
export async function searchAlliances(
  query: string,
  db: D1Database,
): Promise<AllianceSearchResult[]> {
  const trimmed = query.trim();

  if (trimmed.length < 1) {
    throw new Error('Search query must not be empty');
  }

  // Use SQL LIKE for simple substring search (case-insensitive in SQLite)
  const pattern = `%${trimmed}%`;

  const result = await db
    .prepare(
      `SELECT id, name, tag, member_count, created_at
       FROM alliances
       WHERE name LIKE ? OR tag LIKE ?
       ORDER BY member_count DESC
       LIMIT 20`
    )
    .bind(pattern, pattern)
    .all<{
      id: string;
      name: string;
      tag: string;
      member_count: number;
      created_at: number;
    }>();

  return (result.results ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    tag: row.tag,
    memberCount: row.member_count,
    createdAt: row.created_at,
  }));
}
