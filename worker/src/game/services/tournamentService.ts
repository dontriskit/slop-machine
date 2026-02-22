/**
 * tournamentService.ts
 *
 * E-Sport Tournament System for Cosmic Protocol
 *
 * Features:
 *   - Multiple tournament types (1v1 Arena, Alliance War, Speed Round, King of the Hill)
 *   - Automated bracket generation with power-of-2 seeding
 *   - Match resolution using existing battleService
 *   - Season tracking with leaderboard and rewards
 *   - Achievement unlocking for tournament wins
 *
 * Data flow:
 *   1. Create tournament (draft state)
 *   2. Players join (open state)
 *   3. Admin generates bracket (in_progress state)
 *   4. Matches resolve automatically or manually
 *   5. Winners advance to next round
 *   6. Final round determines champion
 *   7. Season closes, rewards distributed
 */

import { D1Database } from '@cloudflare/workers-types';
import { simulateBattle, Combatant, BattleResult } from './battleService';


// ============================================================================
// TYPES
// ============================================================================

export type TournamentType = 'arena_1v1' | 'alliance_war' | 'speed_round' | 'koth';
export type TournamentStatus = 'draft' | 'open' | 'in_progress' | 'completed';
export type MatchStatus = 'scheduled' | 'in_progress' | 'completed' | 'forfeited' | 'draw';

export interface Tournament {
  id: string;
  name: string;
  type: TournamentType;
  maxPlayers: number;
  currentRound: number;
  totalRounds: number;
  status: TournamentStatus;
  seasonId: string | null;
  createdAt: number; // unix seconds
  startedAt: number | null;
  completedAt: number | null;
}

export interface TournamentPlayer {
  tournamentId: string;
  playerId: string;
  joinedAt: number;
  seedRank: number; // seeding position (1-indexed)
  currentRound: number; // 0 if eliminated
  isActive: boolean;
}

export interface Bracket {
  id: string;
  tournamentId: string;
  roundNumber: number;
  totalMatches: number;
  bracketData: BracketNode; // JSON tree structure
  createdAt: number;
}

export interface BracketNode {
  matchId: string | null; // null for finals
  player1Id: string | null;
  player2Id: string | null;
  winner: string | null;
  left: BracketNode | null;
  right: BracketNode | null;
}

export interface Match {
  id: string;
  tournamentId: string;
  bracketId: string;
  player1Id: string;
  player2Id: string;
  winnerId: string | null;
  loserId: string | null;
  battleData: BattleResult | null;
  scheduledAt: number;
  completedAt: number | null;
  status: MatchStatus;
  round: number;
}

export interface Season {
  id: string;
  seasonNumber: number;
  startDate: number;
  endDate: number;
  status: 'active' | 'closed';
  createdAt: number;
}

export interface SeasonLeaderboardEntry {
  seasonId: string;
  playerId: string;
  playerName: string;
  points: number;
  rank: number;
  tournaments_won: number;
  titles_earned: string[];
}

export interface TournamentReward {
  tournamentId: string;
  playerId: string;
  placement: number; // 1st, 2nd, 3rd, etc.
  points: number;
  achievementId: string | null;
  titleEarned: string | null;
}

// ============================================================================
// TOURNAMENT CRUD
// ============================================================================

/**
 * Create a new tournament in draft state
 */
export async function createTournament(
  name: string,
  type: TournamentType,
  maxPlayers: number,
  seasonId: string | null,
  db: D1Database
): Promise<Tournament> {
  // Validate tournament type
  const validTypes: TournamentType[] = ['arena_1v1', 'alliance_war', 'speed_round', 'koth'];
  if (!validTypes.includes(type)) {
    throw new Error(`Invalid tournament type: ${type}`);
  }

  // Validate maxPlayers is power of 2
  if (!isPowerOfTwo(maxPlayers) || maxPlayers < 2 || maxPlayers > 64) {
    throw new Error('maxPlayers must be a power of 2 between 2 and 64');
  }

  const id = generateId('tournament');
  const totalRounds = Math.log2(maxPlayers);
  const now = Math.floor(Date.now() / 1000);

  const tournament: Tournament = {
    id,
    name,
    type,
    maxPlayers,
    currentRound: 0,
    totalRounds,
    status: 'draft',
    seasonId,
    createdAt: now,
    startedAt: null,
    completedAt: null,
  };

  await db
    .prepare(
      `INSERT INTO tournaments (id, name, type, max_players, current_round, total_rounds, status, season_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, name, type, maxPlayers, 0, totalRounds, 'draft', seasonId, now)
    .run();

  return tournament;
}

/**
 * Get tournament by ID
 */
export async function getTournament(tournamentId: string, db: D1Database): Promise<Tournament | null> {
  const result = await db
    .prepare(
      `SELECT id, name, type, max_players, current_round, total_rounds, status, season_id, created_at, started_at, completed_at
       FROM tournaments WHERE id = ?`
    )
    .bind(tournamentId)
    .first<{
      id: string;
      name: string;
      type: TournamentType;
      max_players: number;
      current_round: number;
      total_rounds: number;
      status: TournamentStatus;
      season_id: string | null;
      created_at: number;
      started_at: number | null;
      completed_at: number | null;
    }>();

  if (!result) return null;

  return {
    id: result.id,
    name: result.name,
    type: result.type,
    maxPlayers: result.max_players,
    currentRound: result.current_round,
    totalRounds: result.total_rounds,
    status: result.status,
    seasonId: result.season_id,
    createdAt: result.created_at,
    startedAt: result.started_at,
    completedAt: result.completed_at,
  };
}

/**
 * Join a player to a tournament
 */
export async function joinTournament(
  tournamentId: string,
  playerId: string,
  db: D1Database
): Promise<void> {
  const tournament = await getTournament(tournamentId, db);
  if (!tournament) {
    throw new Error(`Tournament not found: ${tournamentId}`);
  }

  if (tournament.status !== 'draft' && tournament.status !== 'open') {
    throw new Error(`Cannot join tournament in status: ${tournament.status}`);
  }

  // Check if player already joined
  const existing = await db
    .prepare(
      `SELECT player_id FROM tournament_players WHERE tournament_id = ? AND player_id = ?`
    )
    .bind(tournamentId, playerId)
    .first();

  if (existing) {
    throw new Error(`Player already joined this tournament`);
  }

  // Check max players
  const playerCount = await db
    .prepare(
      `SELECT COUNT(*) AS count FROM tournament_players WHERE tournament_id = ?`
    )
    .bind(tournamentId)
    .first<{ count: number}>();

  if (playerCount && playerCount.count >= tournament.maxPlayers) {
    throw new Error(`Tournament is full`);
  }

  const now = Math.floor(Date.now() / 1000);
  const seedRank = (playerCount?.count ?? 0) + 1;

  await db
    .prepare(
      `INSERT INTO tournament_players (tournament_id, player_id, joined_at, seed_rank, current_round, is_active)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(tournamentId, playerId, now, seedRank, 0, 1)
    .run();
}

/**
 * List all active tournaments
 */
export async function listTournaments(
  status?: TournamentStatus,
  limit: number = 50,
  offset: number = 0,
  db?: D1Database
): Promise<Tournament[]> {
  if (!db) throw new Error('D1Database required');

  let query = 'SELECT * FROM tournaments';
  const bindings: (string | number)[] = [];

  if (status) {
    query += ' WHERE status = ?';
    bindings.push(status);
  }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  bindings.push(limit, offset);

  const results = await db
    .prepare(query)
    .bind(...bindings)
    .all<{
      id: string;
      name: string;
      type: TournamentType;
      max_players: number;
      current_round: number;
      total_rounds: number;
      status: TournamentStatus;
      season_id: string | null;
      created_at: number;
      started_at: number | null;
      completed_at: number | null;
    }>();

  return (results.results || []).map(r => ({
    id: r.id,
    name: r.name,
    type: r.type,
    maxPlayers: r.max_players,
    currentRound: r.current_round,
    totalRounds: r.total_rounds,
    status: r.status,
    seasonId: r.season_id,
    createdAt: r.created_at,
    startedAt: r.started_at,
    completedAt: r.completed_at,
  }));
}

// ============================================================================
// BRACKET GENERATION
// ============================================================================

/**
 * Generate bracket for a tournament
 * Uses power-of-2 seeding with player ranking
 */
export async function generateBracket(tournamentId: string, db: D1Database): Promise<Bracket> {
  const tournament = await getTournament(tournamentId, db);
  if (!tournament) {
    throw new Error(`Tournament not found: ${tournamentId}`);
  }

  if (tournament.status !== 'draft' && tournament.status !== 'open') {
    throw new Error(`Cannot generate bracket for tournament in status: ${tournament.status}`);
  }

  // Get all players sorted by seed rank
  const playersResult = await db
    .prepare(
      `SELECT player_id, seed_rank FROM tournament_players
       WHERE tournament_id = ?
       ORDER BY seed_rank ASC`
    )
    .bind(tournamentId)
    .all<{ player_id: string; seed_rank: number }>();

  const players = playersResult.results || [];

  if (players.length < 2) {
    throw new Error('At least 2 players required to generate bracket');
  }

  // Pad players list if needed (for byes in case of odd numbers)
  while (players.length < tournament.maxPlayers) {
    players.push({ player_id: null as any, seed_rank: players.length + 1 });
  }

  // Build bracket tree structure
  const bracket = buildBracketTree(players.map(p => p.player_id));

  const bracketId = generateId('bracket');
  const now = Math.floor(Date.now() / 1000);

  const bracketRow: Bracket = {
    id: bracketId,
    tournamentId,
    roundNumber: 1,
    totalMatches: tournament.maxPlayers / 2,
    bracketData: bracket,
    createdAt: now,
  };

  // Save bracket to DB
  await db
    .prepare(
      `INSERT INTO brackets (id, tournament_id, round_number, total_matches, bracket_data, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(bracketId, tournamentId, 1, tournament.maxPlayers / 2, JSON.stringify(bracket), now)
    .run();

  // Create match records from bracket
  await createMatchesFromBracket(bracketId, bracket, 1, db);

  // Update tournament status
  await db
    .prepare(
      `UPDATE tournaments SET status = ?, started_at = ? WHERE id = ?`
    )
    .bind('in_progress', now, tournamentId)
    .run();

  return bracketRow;
}

/**
 * Get bracket for a tournament
 */
export async function getBracket(tournamentId: string, db: D1Database): Promise<Bracket | null> {
  const result = await db
    .prepare(
      `SELECT id, tournament_id, round_number, total_matches, bracket_data, created_at
       FROM brackets WHERE tournament_id = ? ORDER BY round_number DESC LIMIT 1`
    )
    .bind(tournamentId)
    .first<{
      id: string;
      tournament_id: string;
      round_number: number;
      total_matches: number;
      bracket_data: string;
      created_at: number;
    }>();

  if (!result) return null;

  return {
    id: result.id,
    tournamentId: result.tournament_id,
    roundNumber: result.round_number,
    totalMatches: result.total_matches,
    bracketData: JSON.parse(result.bracket_data),
    createdAt: result.created_at,
  };
}

// ============================================================================
// MATCH RESOLUTION
// ============================================================================

/**
 * Resolve a match using battleService
 * Note: For simplicity in MVP, we simulate 1v1 with top fleet of each player
 */
export async function resolveMatch(
  matchId: string,
  defenderId: string,
  db: D1Database
): Promise<Match | null> {
  // Get match
  const matchRow = await db
    .prepare(
      `SELECT id, tournament_id, bracket_id, player1_id, player2_id, round
       FROM matches WHERE id = ? AND status = ?`
    )
    .bind(matchId, 'scheduled')
    .first<{
      id: string;
      tournament_id: string;
      bracket_id: string;
      player1_id: string;
      player2_id: string;
      round: number;
    }>();

  if (!matchRow) {
    throw new Error(`Match not found or already completed: ${matchId}`);
  }

  // Determine attacker/defender
  const attackerId = matchRow.player1_id === defenderId ? matchRow.player2_id : matchRow.player1_id;

  // Build combatants (simplified: use top fleet of each player)
  // In production, would fetch from Durable Objects or compute from planets
  const attacker = await buildCombatant(attackerId, db);
  const defender = await buildCombatant(defenderId, db);

  if (!attacker || !defender) {
    throw new Error('Could not build combatants for battle simulation');
  }

  // Simulate battle
  const battleResult = simulateBattle(attacker.ships, defender.ships);

  // Determine winner
  const winnerId = battleResult.winner === 'attacker' ? attackerId : defenderId;

  const now = Math.floor(Date.now() / 1000);

  // Update match record
  await db
    .prepare(
      `UPDATE matches
       SET winner_id = ?, loser_id = ?, status = ?, completed_at = ?, battle_data = ?
       WHERE id = ?`
    )
    .bind(winnerId, winnerId === attackerId ? defenderId : attackerId, 'completed', now, JSON.stringify(battleResult), matchId)
    .run();

  // Advance winner to next round
  await advanceBracket(matchRow.tournament_id, winnerId, db);

  // Award points to season leaderboard
  await awardTournamentPoints(matchRow.tournament_id, winnerId, 5, db);

  return await getMatch(matchId, db);
}

/**
 * Get match by ID
 */
export async function getMatch(matchId: string, db: D1Database): Promise<Match | null> {
  const result = await db
    .prepare(
      `SELECT id, tournament_id, bracket_id, player1_id, player2_id, winner_id, loser_id, battle_data, scheduled_at, completed_at, status, round
       FROM matches WHERE id = ?`
    )
    .bind(matchId)
    .first<{
      id: string;
      tournament_id: string;
      bracket_id: string;
      player1_id: string;
      player2_id: string;
      winner_id: string | null;
      loser_id: string | null;
      battle_data: string | null;
      scheduled_at: number;
      completed_at: number | null;
      status: MatchStatus;
      round: number;
    }>();

  if (!result) return null;

  return {
    id: result.id,
    tournamentId: result.tournament_id,
    bracketId: result.bracket_id,
    player1Id: result.player1_id,
    player2Id: result.player2_id,
    winnerId: result.winner_id,
    loserId: result.loser_id,
    battleData: result.battle_data ? JSON.parse(result.battle_data) : null,
    scheduledAt: result.scheduled_at,
    completedAt: result.completed_at,
    status: result.status,
    round: result.round,
  };
}

/**
 * Get all matches for a tournament
 */
export async function getTournamentMatches(
  tournamentId: string,
  round?: number,
  db?: D1Database
): Promise<Match[]> {
  if (!db) throw new Error('D1Database required');

  let query = 'SELECT * FROM matches WHERE tournament_id = ?';
  const bindings: (string | number)[] = [tournamentId];

  if (round) {
    query += ' AND round = ?';
    bindings.push(round);
  }

  query += ' ORDER BY round, scheduled_at';

  const results = await db
    .prepare(query)
    .bind(...bindings)
    .all<{
      id: string;
      tournament_id: string;
      bracket_id: string;
      player1_id: string;
      player2_id: string;
      winner_id: string | null;
      loser_id: string | null;
      battle_data: string | null;
      scheduled_at: number;
      completed_at: number | null;
      status: MatchStatus;
      round: number;
    }>();

  return (results.results || []).map(r => ({
    id: r.id,
    tournamentId: r.tournament_id,
    bracketId: r.bracket_id,
    player1Id: r.player1_id,
    player2Id: r.player2_id,
    winnerId: r.winner_id,
    loserId: r.loser_id,
    battleData: r.battle_data ? JSON.parse(r.battle_data) : null,
    scheduledAt: r.scheduled_at,
    completedAt: r.completed_at,
    status: r.status,
    round: r.round,
  }));
}

// ============================================================================
// TOURNAMENT STANDINGS & LEADERBOARD
// ============================================================================

/**
 * Get tournament standings (active players ranked by advancement)
 */
export async function getTournamentStandings(
  tournamentId: string,
  db: D1Database
): Promise<SeasonLeaderboardEntry[]> {
  const results = await db
    .prepare(
      `SELECT tp.player_id, p.name, COALESCE(SUM(CASE WHEN m.winner_id = tp.player_id THEN 1 ELSE 0 END), 0) AS tournaments_won
       FROM tournament_players tp
       JOIN players p ON p.id = tp.player_id
       LEFT JOIN matches m ON m.tournament_id = ? AND (m.player1_id = tp.player_id OR m.player2_id = tp.player_id)
       WHERE tp.tournament_id = ?
       GROUP BY tp.player_id
       ORDER BY tournaments_won DESC`
    )
    .bind(tournamentId, tournamentId)
    .all<{
      player_id: string;
      name: string;
      tournaments_won: number;
    }>();

  const standings = (results.results || []).map((r, idx) => ({
    seasonId: tournamentId,
    playerId: r.player_id,
    playerName: r.name,
    points: r.tournaments_won * 10,
    rank: idx + 1,
    tournaments_won: r.tournaments_won,
    titles_earned: [],
  }));

  return standings;
}

/**
 * Get season leaderboard
 */
export async function getSeasonLeaderboard(
  seasonId: string,
  limit: number = 100,
  db?: D1Database
): Promise<SeasonLeaderboardEntry[]> {
  if (!db) throw new Error('D1Database required');

  const results = await db
    .prepare(
      `SELECT season_id, player_id, points, rank FROM season_leaderboard
       WHERE season_id = ?
       ORDER BY rank ASC
       LIMIT ?`
    )
    .bind(seasonId, limit)
    .all<{
      season_id: string;
      player_id: string;
      points: number;
      rank: number;
    }>();

  // Enrich with player names
  const entries: SeasonLeaderboardEntry[] = [];
  for (const row of results.results || []) {
    const player = await db
      .prepare('SELECT name FROM players WHERE id = ?')
      .bind(row.player_id)
      .first<{ name: string }>();

    entries.push({
      seasonId: row.season_id,
      playerId: row.player_id,
      playerName: player?.name || 'Unknown',
      points: row.points,
      rank: row.rank,
      tournaments_won: 0, // would need separate query
      titles_earned: [],
    });
  }

  return entries;
}

// ============================================================================
// SEASON MANAGEMENT
// ============================================================================

/**
 * Create a new season
 */
export async function createSeason(
  seasonNumber: number,
  startDate: number,
  endDate: number,
  db: D1Database
): Promise<Season> {
  const id = generateId('season');
  const now = Math.floor(Date.now() / 1000);

  const season: Season = {
    id,
    seasonNumber,
    startDate,
    endDate,
    status: 'active',
    createdAt: now,
  };

  await db
    .prepare(
      `INSERT INTO seasons (id, season_number, start_date, end_date, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(id, seasonNumber, startDate, endDate, 'active', now)
    .run();

  return season;
}

/**
 * Get active season
 */
export async function getActiveSeason(db: D1Database): Promise<Season | null> {
  const result = await db
    .prepare(
      `SELECT id, season_number, start_date, end_date, status, created_at
       FROM seasons WHERE status = ? ORDER BY season_number DESC LIMIT 1`
    )
    .bind('active')
    .first<{
      id: string;
      season_number: number;
      start_date: number;
      end_date: number;
      status: 'active' | 'closed';
      created_at: number;
    }>();

  if (!result) return null;

  return {
    id: result.id,
    seasonNumber: result.season_number,
    startDate: result.start_date,
    endDate: result.end_date,
    status: result.status,
    createdAt: result.created_at,
  };
}

/**
 * Close a season and distribute rewards
 */
export async function closeSeason(seasonId: string, db: D1Database): Promise<void> {
  // Get all tournaments for this season
  const tournaments = await db
    .prepare(
      `SELECT id FROM tournaments WHERE season_id = ? AND status = ?`
    )
    .bind(seasonId, 'completed')
    .all<{ id: string }>();

  // Get final leaderboard
  const leaderboard = await getSeasonLeaderboard(seasonId, 100, db);

  // Distribute achievements and titles
  for (const entry of leaderboard) {
    const achievements: string[] = [];

    if (entry.rank === 1) {
      achievements.push('tournament_champion');
    } else if (entry.rank <= 3) {
      achievements.push('tournament_podium');
    }

    if (entry.points >= 200) {
      achievements.push('tournament_legend');
    } else if (entry.points >= 100) {
      achievements.push('tournament_winner');
    }

    // Award achievements
    for (const achievementId of achievements) {
      await awardAchievement(entry.playerId, achievementId, db);
    }
  }

  // Mark season as closed
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      `UPDATE seasons SET status = ? WHERE id = ?`
    )
    .bind('closed', seasonId)
    .run();
}

// ============================================================================
// HELPERS
// ============================================================================

function isPowerOfTwo(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

function generateId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Build bracket tree recursively
 */
function buildBracketTree(playerIds: string[]): BracketNode {
  if (playerIds.length === 1) {
    return {
      matchId: null,
      player1Id: playerIds[0],
      player2Id: null,
      winner: null,
      left: null,
      right: null,
    };
  }

  if (playerIds.length === 2) {
    return {
      matchId: generateId('match'),
      player1Id: playerIds[0],
      player2Id: playerIds[1],
      winner: null,
      left: null,
      right: null,
    };
  }

  const mid = playerIds.length / 2;
  const left = buildBracketTree(playerIds.slice(0, mid));
  const right = buildBracketTree(playerIds.slice(mid));

  return {
    matchId: null,
    player1Id: null,
    player2Id: null,
    winner: null,
    left,
    right,
  };
}

/**
 * Create match records from bracket tree
 */
async function createMatchesFromBracket(
  bracketId: string,
  node: BracketNode,
  round: number,
  db: D1Database
): Promise<void> {
  if (!node.matchId) {
    if (node.left) await createMatchesFromBracket(bracketId, node.left, round, db);
    if (node.right) await createMatchesFromBracket(bracketId, node.right, round, db);
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  const scheduledAt = now + 3600; // Schedule 1 hour from now

  await db
    .prepare(
      `INSERT INTO matches (id, tournament_id, bracket_id, player1_id, player2_id, status, round, scheduled_at)
       VALUES (?, (SELECT tournament_id FROM brackets WHERE id = ?), ?, ?, ?, ?, ?, ?)`
    )
    .bind(node.matchId, bracketId, bracketId, node.player1Id, node.player2Id, 'scheduled', round, scheduledAt)
    .run();
}

/**
 * Simple combatant builder from player's top planets/fleets
 * In production, would get from Durable Objects or fleet DB
 */
async function buildCombatant(playerId: string, db: D1Database): Promise<Combatant | null> {
  // Get player's top fleet
  const fleet = await db
    .prepare(
      `SELECT light_fighter, heavy_fighter, cruiser, battleship, battlecruiser, bomber, destroyer, deathstar,
              small_cargo, large_cargo, colony_ship, recycler, espionage_probe
       FROM fleets WHERE player_id = ? LIMIT 1`
    )
    .bind(playerId)
    .first<{
      light_fighter: number;
      heavy_fighter: number;
      cruiser: number;
      battleship: number;
      battlecruiser: number;
      bomber: number;
      destroyer: number;
      deathstar: number;
      small_cargo: number;
      large_cargo: number;
      colony_ship: number;
      recycler: number;
      espionage_probe: number;
    }>();

  if (!fleet) {
    return {
      ships: {
        lightFighter: 10,
        heavyFighter: 5,
        cruiser: 2,
        battleship: 1,
        battlecruiser: 0,
        bomber: 0,
        destroyer: 0,
        deathstar: 0,
        smallCargo: 0,
        largeCargo: 0,
        colonyShip: 0,
        recycler: 0,
        espionageProbe: 0,
        solarSatellite: 0,
      },
      name: playerId,
    };
  }

  return {
    ships: {
      lightFighter: fleet.light_fighter || 0,
      heavyFighter: fleet.heavy_fighter || 0,
      cruiser: fleet.cruiser || 0,
      battleship: fleet.battleship || 0,
      battlecruiser: fleet.battlecruiser || 0,
      bomber: fleet.bomber || 0,
      destroyer: fleet.destroyer || 0,
      deathstar: fleet.deathstar || 0,
      smallCargo: fleet.small_cargo || 0,
      largeCargo: fleet.large_cargo || 0,
      colonyShip: fleet.colony_ship || 0,
      recycler: fleet.recycler || 0,
      espionageProbe: fleet.espionage_probe || 0,
    },
    name: playerId,
  };
}

/**
 * Award points to season leaderboard
 */
async function awardTournamentPoints(
  tournamentId: string,
  playerId: string,
  points: number,
  db: D1Database
): Promise<void> {
  const tournament = await getTournament(tournamentId, db);
  if (!tournament || !tournament.seasonId) return;

  // Update or insert into season_leaderboard
  await db
    .prepare(
      `INSERT INTO season_leaderboard (season_id, player_id, points)
       VALUES (?, ?, ?)
       ON CONFLICT(season_id, player_id) DO UPDATE SET points = points + ?`
    )
    .bind(tournament.seasonId, playerId, points, points)
    .run();
}

/**
 * Award achievement to player (stub)
 */
async function awardAchievement(
  playerId: string,
  achievementId: string,
  db: D1Database
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      `INSERT OR IGNORE INTO player_achievements (achievement_id, player_id, unlocked_at)
       VALUES (?, ?, ?)`
    )
    .bind(achievementId, playerId, now)
    .run();
}

/**
 * Advance winner to next round (update bracket)
 */
async function advanceBracket(
  tournamentId: string,
  winnerId: string,
  db: D1Database
): Promise<void> {
  // Get bracket
  const bracket = await getBracket(tournamentId, db);
  if (!bracket) return;

  // Mark winner in bracket (simplified: would need to traverse tree)
  // In production, would update bracket_data JSON

  // Check if tournament is complete (only 1 player left)
  const activePlayers = await db
    .prepare(
      `SELECT COUNT(*) AS count FROM tournament_players
       WHERE tournament_id = ? AND is_active = 1`
    )
    .bind(tournamentId)
    .first<{ count: number }>();

  if (activePlayers && activePlayers.count === 1) {
    // Tournament complete
    const now = Math.floor(Date.now() / 1000);
    await db
      .prepare(
        `UPDATE tournaments SET status = ?, completed_at = ? WHERE id = ?`
      )
      .bind('completed', now, tournamentId)
      .run();

    // Award championship achievement
    await awardAchievement(winnerId, 'tournament_champion', db);
  }
}

// ============================================================================
// SEASON REWARDS
// ============================================================================

export interface SeasonRewardResult {
  playerId: string;
  playerName: string;
  placement: number;
  metalReward: number;
  crystalReward: number;
  deuteriumReward: number;
  totalRewardValue: number;
  achievementsAwarded: string[];
}

/**
 * Distribute season-end rewards to top players.
 *
 * Resource rewards (top 3 only):
 *   1st: 50 000 metal / 30 000 crystal / 10 000 deuterium  (×1.0)
 *   2nd: ×0.6
 *   3rd: ×0.3
 *
 * Achievement rewards:
 *   Top 1 : season_champion
 *   Top 10: season_top_10
 */
export async function distributeSeasonRewards(
  seasonId: string,
  db: D1Database
): Promise<SeasonRewardResult[]> {
  // Fetch leaderboard (up to 10 entries)
  const entries = await getSeasonLeaderboard(seasonId, 10, db);

  if (entries.length === 0) {
    return [];
  }

  const BASE_METAL = 50_000;
  const BASE_CRYSTAL = 30_000;
  const BASE_DEUTERIUM = 10_000;
  const MULTIPLIERS = [1.0, 0.6, 0.3]; // 1st, 2nd, 3rd

  const results: SeasonRewardResult[] = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const placement = i + 1;
    const multiplier = MULTIPLIERS[i] ?? 0;

    const metalReward = Math.round(BASE_METAL * multiplier);
    const crystalReward = Math.round(BASE_CRYSTAL * multiplier);
    const deuteriumReward = Math.round(BASE_DEUTERIUM * multiplier);
    const totalRewardValue = metalReward + crystalReward + deuteriumReward;

    const achievementsAwarded: string[] = [];

    // Every top-10 player gets the top-10 achievement
    achievementsAwarded.push('season_top_10');

    // Only 1st place gets the champion achievement
    if (placement === 1) {
      achievementsAwarded.push('season_champion');
    }

    // Persist achievements
    for (const achievementId of achievementsAwarded) {
      await awardAchievement(entry.playerId, achievementId, db);
    }

    // Credit resources to player's home planet (if resources > 0)
    if (totalRewardValue > 0) {
      const planet = await db
        .prepare('SELECT id FROM planets WHERE player_id = ? LIMIT 1')
        .bind(entry.playerId)
        .first<{ id: string }>();

      if (planet) {
        await db
          .prepare(
            `UPDATE planets
             SET metal = metal + ?, crystal = crystal + ?, deuterium = deuterium + ?
             WHERE id = ?`
          )
          .bind(metalReward, crystalReward, deuteriumReward, planet.id)
          .run();
      }
    }

    results.push({
      playerId: entry.playerId,
      playerName: entry.playerName,
      placement,
      metalReward,
      crystalReward,
      deuteriumReward,
      totalRewardValue,
      achievementsAwarded,
    });
  }

  return results;
}

/**
 * Get season leaderboard enriched with tournament win counts.
 */
export async function getSeasonLeaderboardWithPoints(
  seasonId: string,
  limit: number = 100,
  db: D1Database
): Promise<SeasonLeaderboardEntry[]> {
  const entries = await getSeasonLeaderboard(seasonId, limit, db);

  // Enrich each entry with the number of tournament wins
  const enriched: SeasonLeaderboardEntry[] = [];
  for (const entry of entries) {
    const winRow = await db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM matches m
         JOIN tournaments t ON t.id = m.tournament_id
         WHERE t.season_id = ? AND m.winner_id = ?`
      )
      .bind(seasonId, entry.playerId)
      .first<{ count: number }>();

    enriched.push({
      ...entry,
      tournaments_won: winRow?.count ?? 0,
    });
  }

  return enriched;
}
