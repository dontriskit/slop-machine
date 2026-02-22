// ============================================================================
// ACS (ALLIANCE COMBAT SYSTEM) SERVICE
// ============================================================================
//
// Implements coordinated multi-player attacks on a single target.
//
// Key mechanics:
//   - Initiator creates an ACS attack group and invites alliance members
//   - Up to 5 participants per ACS attack (including initiator)
//   - All fleets sync to the slowest fleet's arrival time
//   - Combined fleets fight as one side in battle
//   - Loot/debris split proportional to fleet value
//   - Only alliance members can join
//   - Initiator can cancel before launch
//
// Status flow: gathering -> launched -> arrived -> completed | canceled

import { Ships, Coordinate, Resources, SHIP_KEYS } from '../types';

// ============================================================================
// TYPES
// ============================================================================

export type ACSStatus = 'gathering' | 'launched' | 'arrived' | 'completed' | 'canceled';
export type ACSParticipantStatus = 'joined' | 'ready' | 'launched' | 'withdrawn';

export interface ACSAttack {
  id: string;
  initiatorId: string;
  allianceId: string;
  targetGalaxy: number;
  targetSystem: number;
  targetPosition: number;
  status: ACSStatus;
  maxParticipants: number;
  launchTime: number | null;    // unix seconds, set when launched
  arrivalTime: number | null;   // unix seconds, computed on launch
  createdAt: number;            // unix seconds
}

export interface ACSParticipant {
  acsId: string;
  playerId: string;
  playerName: string;
  planetId: string;
  ships: Ships;
  status: ACSParticipantStatus;
  fleetValue: number;           // total resource value of fleet
  travelTime: number;           // seconds to reach target from this player's planet
  joinedAt: number;             // unix seconds
}

export interface ACSStatusResponse {
  attack: ACSAttack;
  participants: ACSParticipant[];
  syncArrivalTime: number | null; // slowest fleet's arrival time in seconds from launch
}

export interface ACSLootShare {
  playerId: string;
  metal: number;
  crystal: number;
  deuterium: number;
  proportion: number;           // 0-1 fraction of total loot
}

// ============================================================================
// INTERNAL DB ROW TYPES
// ============================================================================

interface ACSAttackRow {
  id: string;
  initiator_id: string;
  alliance_id: string;
  target_galaxy: number;
  target_system: number;
  target_position: number;
  status: ACSStatus;
  max_participants: number;
  launch_time: number | null;
  arrival_time: number | null;
  created_at: number;
}

interface ACSParticipantRow {
  acs_id: string;
  player_id: string;
  player_name: string;
  planet_id: string;
  ships_json: string;
  status: ACSParticipantStatus;
  fleet_value: number;
  travel_time: number;
  joined_at: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const MAX_ACS_PARTICIPANTS = 5;

// ============================================================================
// HELPERS
// ============================================================================

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function rowToAttack(row: ACSAttackRow): ACSAttack {
  return {
    id: row.id,
    initiatorId: row.initiator_id,
    allianceId: row.alliance_id,
    targetGalaxy: row.target_galaxy,
    targetSystem: row.target_system,
    targetPosition: row.target_position,
    status: row.status,
    maxParticipants: row.max_participants,
    launchTime: row.launch_time,
    arrivalTime: row.arrival_time,
    createdAt: row.created_at,
  };
}

function rowToParticipant(row: ACSParticipantRow): ACSParticipant {
  return {
    acsId: row.acs_id,
    playerId: row.player_id,
    playerName: row.player_name,
    planetId: row.planet_id,
    ships: JSON.parse(row.ships_json),
    status: row.status,
    fleetValue: row.fleet_value,
    travelTime: row.travel_time,
    joinedAt: row.joined_at,
  };
}

/** Create an empty Ships object */
function emptyShips(): Ships {
  return {
    lightFighter: 0,
    heavyFighter: 0,
    cruiser: 0,
    battleship: 0,
    battlecruiser: 0,
    bomber: 0,
    destroyer: 0,
    deathstar: 0,
    smallCargo: 0,
    largeCargo: 0,
    colonyShip: 0,
    recycler: 0,
    espionageProbe: 0,
  };
}

/** Count total ships in a fleet */
function totalShipCount(ships: Ships): number {
  let total = 0;
  for (const key of SHIP_KEYS) {
    total += ships[key];
  }
  return total;
}

/**
 * Calculate fleet value in total resources (metal + crystal + deuterium).
 * Uses simplified ship costs from battleService SHIP_SPECS.
 */
const SHIP_COSTS: Record<keyof Ships, { metal: number; crystal: number; deuterium: number }> = {
  lightFighter:  { metal: 3000, crystal: 1000, deuterium: 0 },
  heavyFighter:  { metal: 6000, crystal: 4000, deuterium: 0 },
  cruiser:       { metal: 20000, crystal: 7000, deuterium: 2000 },
  battleship:    { metal: 45000, crystal: 15000, deuterium: 0 },
  battlecruiser: { metal: 30000, crystal: 40000, deuterium: 15000 },
  bomber:        { metal: 50000, crystal: 25000, deuterium: 15000 },
  destroyer:     { metal: 60000, crystal: 50000, deuterium: 15000 },
  deathstar:     { metal: 5000000, crystal: 4000000, deuterium: 1000000 },
  smallCargo:    { metal: 2000, crystal: 2000, deuterium: 0 },
  largeCargo:    { metal: 6000, crystal: 6000, deuterium: 0 },
  colonyShip:    { metal: 10000, crystal: 20000, deuterium: 10000 },
  recycler:      { metal: 10000, crystal: 6000, deuterium: 2000 },
  espionageProbe:{ metal: 0, crystal: 1000, deuterium: 0 },
};

export function calculateFleetValue(ships: Ships): number {
  let value = 0;
  for (const key of SHIP_KEYS) {
    const count = ships[key];
    if (count > 0) {
      const cost = SHIP_COSTS[key];
      value += count * (cost.metal + cost.crystal + cost.deuterium);
    }
  }
  return value;
}

/**
 * Combine multiple fleets into a single combined fleet for battle.
 */
export function combineFleets(fleets: Ships[]): Ships {
  const combined = emptyShips();
  for (const fleet of fleets) {
    for (const key of SHIP_KEYS) {
      combined[key] += fleet[key];
    }
  }
  return combined;
}

/**
 * Calculate proportional loot shares based on fleet values.
 */
export function calculateLootShares(
  participants: Array<{ playerId: string; fleetValue: number }>,
  loot: Resources
): ACSLootShare[] {
  const totalValue = participants.reduce((sum, p) => sum + p.fleetValue, 0);
  if (totalValue === 0) {
    // Equal split if somehow all fleets have 0 value
    const equalShare = 1 / participants.length;
    return participants.map(p => ({
      playerId: p.playerId,
      metal: Math.floor(loot.metal / participants.length),
      crystal: Math.floor(loot.crystal / participants.length),
      deuterium: Math.floor(loot.deuterium / participants.length),
      proportion: equalShare,
    }));
  }

  return participants.map(p => {
    const proportion = p.fleetValue / totalValue;
    return {
      playerId: p.playerId,
      metal: Math.floor(loot.metal * proportion),
      crystal: Math.floor(loot.crystal * proportion),
      deuterium: Math.floor(loot.deuterium * proportion),
      proportion,
    };
  });
}

// ============================================================================
// SERVICE FUNCTIONS
// ============================================================================

/**
 * createACSAttack
 *
 * Creates a new ACS attack group. The initiator automatically joins.
 * The initiator must be in an alliance, and the target must be valid coordinates.
 *
 * @param initiatorId  - Player ID of the initiator
 * @param planetId     - Planet from which the initiator is launching
 * @param ships        - Ships the initiator is committing
 * @param targetGalaxy - Target galaxy coordinate
 * @param targetSystem - Target system coordinate
 * @param targetPosition - Target position coordinate
 * @param travelTime   - Pre-calculated travel time in seconds for the initiator
 * @param db           - D1 database instance
 */
export async function createACSAttack(
  initiatorId: string,
  planetId: string,
  ships: Ships,
  targetGalaxy: number,
  targetSystem: number,
  targetPosition: number,
  travelTime: number,
  db: D1Database,
): Promise<ACSStatusResponse> {
  // Validate ships
  if (totalShipCount(ships) === 0) {
    throw new Error('Fleet must contain at least one ship');
  }

  // Verify player exists
  const player = await db.prepare('SELECT id, name FROM players WHERE id = ?')
    .bind(initiatorId)
    .first<{ id: string; name: string }>();
  if (!player) {
    throw new Error('Player not found');
  }

  // Verify player is in an alliance
  const membership = await db.prepare(
    `SELECT alliance_id FROM alliance_members WHERE player_id = ? AND role != 'applicant'`
  ).bind(initiatorId).first<{ alliance_id: string }>();
  if (!membership) {
    throw new Error('Player must be in an alliance to create an ACS attack');
  }

  const id = makeId('acs');
  const now = Math.floor(Date.now() / 1000);
  const fleetValue = calculateFleetValue(ships);

  // Insert ACS attack
  await db.prepare(
    `INSERT INTO acs_attacks (id, initiator_id, alliance_id, target_galaxy, target_system, target_position, status, max_participants, launch_time, arrival_time, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'gathering', ?, NULL, NULL, ?)`
  ).bind(id, initiatorId, membership.alliance_id, targetGalaxy, targetSystem, targetPosition, MAX_ACS_PARTICIPANTS, now).run();

  // Insert initiator as first participant
  await db.prepare(
    `INSERT INTO acs_participants (acs_id, player_id, player_name, planet_id, ships_json, status, fleet_value, travel_time, joined_at)
     VALUES (?, ?, ?, ?, ?, 'joined', ?, ?, ?)`
  ).bind(id, initiatorId, player.name, planetId, JSON.stringify(ships), fleetValue, travelTime, now).run();

  const attack: ACSAttack = {
    id,
    initiatorId,
    allianceId: membership.alliance_id,
    targetGalaxy,
    targetSystem,
    targetPosition,
    status: 'gathering',
    maxParticipants: MAX_ACS_PARTICIPANTS,
    launchTime: null,
    arrivalTime: null,
    createdAt: now,
  };

  const participant: ACSParticipant = {
    acsId: id,
    playerId: initiatorId,
    playerName: player.name,
    planetId,
    ships,
    status: 'joined',
    fleetValue,
    travelTime,
    joinedAt: now,
  };

  return {
    attack,
    participants: [participant],
    syncArrivalTime: travelTime,
  };
}

/**
 * joinACSAttack
 *
 * Join an existing ACS attack with a fleet.
 * Player must be in the same alliance as the initiator.
 */
export async function joinACSAttack(
  acsId: string,
  playerId: string,
  planetId: string,
  ships: Ships,
  travelTime: number,
  db: D1Database,
): Promise<ACSParticipant> {
  // Validate ships
  if (totalShipCount(ships) === 0) {
    throw new Error('Fleet must contain at least one ship');
  }

  // Verify player exists
  const player = await db.prepare('SELECT id, name FROM players WHERE id = ?')
    .bind(playerId)
    .first<{ id: string; name: string }>();
  if (!player) {
    throw new Error('Player not found');
  }

  // Fetch ACS attack
  const attackRow = await db.prepare('SELECT * FROM acs_attacks WHERE id = ?')
    .bind(acsId)
    .first<ACSAttackRow>();
  if (!attackRow) {
    throw new Error('ACS attack not found');
  }

  if (attackRow.status !== 'gathering') {
    throw new Error('ACS attack is not in gathering phase');
  }

  // Verify player is in the same alliance
  const membership = await db.prepare(
    `SELECT alliance_id FROM alliance_members WHERE player_id = ? AND role != 'applicant'`
  ).bind(playerId).first<{ alliance_id: string }>();
  if (!membership || membership.alliance_id !== attackRow.alliance_id) {
    throw new Error('Player must be in the same alliance as the ACS initiator');
  }

  // Check participant count
  const countResult = await db.prepare(
    `SELECT COUNT(*) as cnt FROM acs_participants WHERE acs_id = ? AND status != 'withdrawn'`
  ).bind(acsId).first<{ cnt: number }>();
  const currentCount = countResult?.cnt ?? 0;
  if (currentCount >= attackRow.max_participants) {
    throw new Error(`ACS attack is full (max ${attackRow.max_participants} participants)`);
  }

  // Check player not already joined
  const existing = await db.prepare(
    `SELECT player_id FROM acs_participants WHERE acs_id = ? AND player_id = ? AND status != 'withdrawn'`
  ).bind(acsId, playerId).first();
  if (existing) {
    throw new Error('Player has already joined this ACS attack');
  }

  const now = Math.floor(Date.now() / 1000);
  const fleetValue = calculateFleetValue(ships);

  await db.prepare(
    `INSERT INTO acs_participants (acs_id, player_id, player_name, planet_id, ships_json, status, fleet_value, travel_time, joined_at)
     VALUES (?, ?, ?, ?, ?, 'joined', ?, ?, ?)`
  ).bind(acsId, playerId, player.name, planetId, JSON.stringify(ships), fleetValue, travelTime, now).run();

  return {
    acsId,
    playerId,
    playerName: player.name,
    planetId,
    ships,
    status: 'joined',
    fleetValue,
    travelTime,
    joinedAt: now,
  };
}

/**
 * getACSStatus
 *
 * Get the current status of an ACS attack, including all participants.
 */
export async function getACSStatus(
  acsId: string,
  db: D1Database,
): Promise<ACSStatusResponse> {
  const attackRow = await db.prepare('SELECT * FROM acs_attacks WHERE id = ?')
    .bind(acsId)
    .first<ACSAttackRow>();
  if (!attackRow) {
    throw new Error('ACS attack not found');
  }

  const participantRows = await db.prepare(
    `SELECT * FROM acs_participants WHERE acs_id = ? AND status != 'withdrawn' ORDER BY joined_at ASC`
  ).bind(acsId).all<ACSParticipantRow>();

  const participants = (participantRows.results ?? []).map(rowToParticipant);

  // Calculate sync arrival time (slowest fleet)
  let syncArrivalTime: number | null = null;
  if (participants.length > 0) {
    syncArrivalTime = Math.max(...participants.map(p => p.travelTime));
  }

  return {
    attack: rowToAttack(attackRow),
    participants,
    syncArrivalTime,
  };
}

/**
 * launchACSAttack
 *
 * Launch the coordinated attack. Only the initiator can launch.
 * All fleets sync to the slowest fleet's arrival time.
 * Sets the ACS status to 'launched' and records arrival time.
 */
export async function launchACSAttack(
  acsId: string,
  initiatorId: string,
  db: D1Database,
): Promise<ACSStatusResponse> {
  const attackRow = await db.prepare('SELECT * FROM acs_attacks WHERE id = ?')
    .bind(acsId)
    .first<ACSAttackRow>();
  if (!attackRow) {
    throw new Error('ACS attack not found');
  }

  if (attackRow.initiator_id !== initiatorId) {
    throw new Error('Only the initiator can launch the ACS attack');
  }

  if (attackRow.status !== 'gathering') {
    throw new Error('ACS attack is not in gathering phase');
  }

  // Get all active participants
  const participantRows = await db.prepare(
    `SELECT * FROM acs_participants WHERE acs_id = ? AND status != 'withdrawn' ORDER BY joined_at ASC`
  ).bind(acsId).all<ACSParticipantRow>();

  const participants = (participantRows.results ?? []).map(rowToParticipant);

  if (participants.length === 0) {
    throw new Error('No participants in ACS attack');
  }

  // Calculate sync arrival time (slowest fleet determines when everyone arrives)
  const syncArrivalTime = Math.max(...participants.map(p => p.travelTime));
  const now = Math.floor(Date.now() / 1000);
  const arrivalTime = now + syncArrivalTime;

  // Update attack status
  await db.prepare(
    `UPDATE acs_attacks SET status = 'launched', launch_time = ?, arrival_time = ? WHERE id = ?`
  ).bind(now, arrivalTime, acsId).run();

  // Update all participants to 'launched'
  await db.prepare(
    `UPDATE acs_participants SET status = 'launched' WHERE acs_id = ? AND status != 'withdrawn'`
  ).bind(acsId).run();

  const attack = rowToAttack(attackRow);
  attack.status = 'launched';
  attack.launchTime = now;
  attack.arrivalTime = arrivalTime;

  return {
    attack,
    participants: participants.map(p => ({ ...p, status: 'launched' as ACSParticipantStatus })),
    syncArrivalTime,
  };
}

/**
 * cancelACSAttack
 *
 * Cancel an ACS attack. Only the initiator can cancel, and only before launch.
 */
export async function cancelACSAttack(
  acsId: string,
  initiatorId: string,
  db: D1Database,
): Promise<void> {
  const attackRow = await db.prepare('SELECT * FROM acs_attacks WHERE id = ?')
    .bind(acsId)
    .first<ACSAttackRow>();
  if (!attackRow) {
    throw new Error('ACS attack not found');
  }

  if (attackRow.initiator_id !== initiatorId) {
    throw new Error('Only the initiator can cancel the ACS attack');
  }

  if (attackRow.status !== 'gathering') {
    throw new Error('ACS attack can only be canceled during gathering phase');
  }

  await db.prepare(
    `UPDATE acs_attacks SET status = 'canceled' WHERE id = ?`
  ).bind(acsId).run();

  await db.prepare(
    `UPDATE acs_participants SET status = 'withdrawn' WHERE acs_id = ?`
  ).bind(acsId).run();
}

/**
 * withdrawFromACS
 *
 * Withdraw from an ACS attack. Only possible during gathering phase.
 * The initiator cannot withdraw (they should cancel instead).
 */
export async function withdrawFromACS(
  acsId: string,
  playerId: string,
  db: D1Database,
): Promise<void> {
  const attackRow = await db.prepare('SELECT * FROM acs_attacks WHERE id = ?')
    .bind(acsId)
    .first<ACSAttackRow>();
  if (!attackRow) {
    throw new Error('ACS attack not found');
  }

  if (attackRow.status !== 'gathering') {
    throw new Error('Cannot withdraw after ACS attack has been launched');
  }

  if (attackRow.initiator_id === playerId) {
    throw new Error('Initiator cannot withdraw — cancel the ACS attack instead');
  }

  const participant = await db.prepare(
    `SELECT player_id FROM acs_participants WHERE acs_id = ? AND player_id = ? AND status != 'withdrawn'`
  ).bind(acsId, playerId).first();
  if (!participant) {
    throw new Error('Player is not a participant in this ACS attack');
  }

  await db.prepare(
    `UPDATE acs_participants SET status = 'withdrawn' WHERE acs_id = ? AND player_id = ?`
  ).bind(acsId, playerId).run();
}

/**
 * getPlayerACSAttacks
 *
 * Get all ACS attacks a player is participating in (active ones).
 */
export async function getPlayerACSAttacks(
  playerId: string,
  db: D1Database,
): Promise<ACSAttack[]> {
  // Step 1: get ACS IDs where this player is participating
  const participantRows = await db.prepare(
    `SELECT acs_id FROM acs_participants WHERE player_id = ?`
  ).bind(playerId).all<{ acs_id: string }>();

  const acsIds = (participantRows.results ?? []).map(r => r.acs_id);
  if (acsIds.length === 0) return [];

  // Step 2: fetch active attacks by those IDs
  const attacks: ACSAttack[] = [];
  for (const acsId of acsIds) {
    const row = await db.prepare(
      `SELECT * FROM acs_attacks WHERE id = ?`
    ).bind(acsId).first<ACSAttackRow>();
    if (row && (row.status === 'gathering' || row.status === 'launched')) {
      attacks.push(rowToAttack(row));
    }
  }

  // Sort by created_at descending
  attacks.sort((a, b) => b.createdAt - a.createdAt);
  return attacks;
}

/**
 * completeACSAttack
 *
 * Mark an ACS attack as completed (called after battle resolution).
 */
export async function completeACSAttack(
  acsId: string,
  db: D1Database,
): Promise<void> {
  await db.prepare(
    `UPDATE acs_attacks SET status = 'completed' WHERE id = ?`
  ).bind(acsId).run();
}
