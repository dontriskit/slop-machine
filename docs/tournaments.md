# E-Sport Tournament System — Implementation Guide

## Overview

The E-Sport Tournament System provides competitive ranked play with automated bracket generation, match scheduling, and seasonal rewards. Players compete in multiple tournament formats with real-time leaderboards and achievement progression.

## Features

### Tournament Types

1. **1v1 Arena** — One-on-one fleet battles with simulated combat
2. **Alliance War** — Alliance vs alliance with aggregate fleet power
3. **Speed Round** — Fresh planet start; fastest builder wins (1 hour time limit)
4. **King of the Hill** — Defend a target planet; attackers rotate

### Season Structure

- **Duration**: 4 weeks per season
- **Weekly Events**: Different tournament types rotate weekly
- **Leaderboard**: Accumulates points across all tournaments
- **Rewards**: End-of-season achievements, titles, and NFT trophies

### Bracket System

- **Format**: Single elimination (8/16/32/64 players)
- **Seeding**: Automatic power-of-2 seeding based on player rating
- **Match Scheduling**: Deadline-based with automatic resolution
- **Advancement**: Winners auto-advance to next round

## Architecture

### Database Schema

The tournament system uses 8 new D1 tables:

#### `tournaments`
```
id TEXT PRIMARY KEY
name TEXT
type TEXT ('arena_1v1', 'alliance_war', 'speed_round', 'koth')
max_players INTEGER
current_round INTEGER
total_rounds INTEGER
status TEXT ('draft', 'open', 'in_progress', 'completed')
season_id TEXT (FK)
created_at INTEGER
started_at INTEGER
completed_at INTEGER
```

#### `tournament_players`
```
tournament_id TEXT (PK)
player_id TEXT (PK)
joined_at INTEGER
seed_rank INTEGER
current_round INTEGER
is_active INTEGER
```

#### `brackets`
```
id TEXT PRIMARY KEY
tournament_id TEXT (FK)
round_number INTEGER
total_matches INTEGER
bracket_data TEXT (JSON tree structure)
created_at INTEGER
```

#### `matches`
```
id TEXT PRIMARY KEY
tournament_id TEXT (FK)
bracket_id TEXT (FK)
player1_id TEXT (FK)
player2_id TEXT (FK)
winner_id TEXT (FK)
loser_id TEXT (FK)
battle_data TEXT (JSON battle result)
scheduled_at INTEGER
completed_at INTEGER
status TEXT ('scheduled', 'in_progress', 'completed', 'forfeited', 'draw')
round INTEGER
created_at INTEGER
```

#### `seasons`
```
id TEXT PRIMARY KEY
season_number INTEGER UNIQUE
start_date INTEGER
end_date INTEGER
status TEXT ('active', 'closed')
created_at INTEGER
```

#### `season_leaderboard`
```
season_id TEXT (PK)
player_id TEXT (PK)
points INTEGER
rank INTEGER
created_at INTEGER
```

#### `tournament_rewards`
```
id TEXT PRIMARY KEY
tournament_id TEXT (FK)
player_id TEXT (FK)
placement INTEGER
points INTEGER
achievement_id TEXT
title_earned TEXT
created_at INTEGER
```

### Core Functions

#### Tournament Lifecycle

```typescript
// Create tournament (draft state)
const tournament = await createTournament(
  'Spring Championship',
  'arena_1v1',
  8,
  'season_1',
  db
);

// Players join
await joinTournament('tournament_1', 'player_1', db);
await joinTournament('tournament_1', 'player_2', db);
// ... repeat for 8 players

// Admin generates bracket
const bracket = await generateBracket('tournament_1', db);

// Matches resolve automatically
await resolveMatch('match_1', 'player_1', db);
await resolveMatch('match_2', 'player_3', db);

// Winners advance automatically
// After finals, tournament marked 'completed'
```

#### Bracket Generation Algorithm

1. **Seeding**: Players ranked by current rating/points
2. **Tree Construction**: Build binary tree with `log2(maxPlayers)` levels
3. **Leaf Pairing**: Each leaf is a match in round 1
4. **Match Creation**: Generate match records from bracket nodes
5. **Scheduling**: Set scheduled_at to T+1hr for each match

#### Match Resolution

1. **Battle Simulation**: Use `simulateBattle()` from battleService
2. **Winner Selection**: Attacker/defender roles determined by tournament type
3. **Result Storage**: Full battle report in `battle_data` JSON
4. **Points Award**: Win = 5 points + placement multiplier
5. **Advancement**: Winner moves to next round, loser eliminated

#### Season Management

```typescript
// Create season
const season = await createSeason(
  1,  // seasonNumber
  Math.floor(Date.now() / 1000),  // startDate
  Math.floor(Date.now() / 1000) + (4 * 7 * 86400),  // endDate (4 weeks)
  db
);

// Get active season
const activeSeason = await getActiveSeason(db);

// Get leaderboard
const leaderboard = await getSeasonLeaderboard('season_1', 100, db);

// Close season and distribute rewards
await closeSeason('season_1', db);
// - Awards 'tournament_champion' to #1
// - Awards 'tournament_podium' to top 3
// - Awards 'tournament_legend' for 200+ points
```

## API Endpoints

### Tournament Management

**POST `/tournaments`** — Create tournament
```json
{
  "name": "Spring Championship",
  "type": "arena_1v1",
  "maxPlayers": 8,
  "seasonId": "season_1"
}
```

**GET `/tournaments`** — List tournaments
```
?status=in_progress&limit=50&offset=0
```

**POST `/tournaments/{id}/join`** — Join tournament
```json
{
  "playerId": "player_123"
}
```

**POST `/tournaments/{id}/start`** — Generate bracket
```
POST /tournaments/tournament_1/start
→ Generates bracket, creates matches
```

**GET `/tournaments/{id}/bracket`** — Get bracket state
```json
{
  "bracketId": "bracket_1",
  "roundNumber": 1,
  "totalMatches": 4,
  "bracketData": { /* tree structure */ }
}
```

### Match Resolution

**GET `/tournaments/{id}/matches`** — List tournament matches
```
?round=1&status=completed
```

**POST `/tournaments/{id}/matches/{matchId}/resolve`** — Resolve match
```json
{
  "defenderId": "player_2"
}
```

**GET `/tournaments/{id}/standings`** — Get tournament standings
```json
[
  { "playerId": "player_1", "points": 20, "rank": 1 },
  { "playerId": "player_2", "points": 15, "rank": 2 }
]
```

### Season Management

**POST `/seasons`** — Create season
```json
{
  "seasonNumber": 1,
  "startDate": 1707000000,
  "endDate": 1709678400
}
```

**GET `/seasons/{id}/leaderboard`** — Get season leaderboard
```
?limit=100
```

**POST `/seasons/{id}/close`** — Close season and distribute rewards
```
POST /seasons/season_1/close
→ Unlocks achievements, distributes titles
```

## Achievements

### Tournament-Related Achievements

- **`tournament_champion`** — Win a tournament
- **`tournament_podium`** — Finish in top 3
- **`tournament_winner`** — Reach 100+ season points
- **`tournament_legend`** — Reach 200+ season points

## Points System

### Win Calculation

```
basePoints = 10

// Tournament size multiplier
if (totalPlayers <= 8) multiplier = 1.0
if (totalPlayers <= 16) multiplier = 1.5
if (totalPlayers <= 32) multiplier = 2.0
if (totalPlayers == 64) multiplier = 2.5

// Round multiplier (later rounds worth more)
roundMultiplier = round / totalRounds

totalPoints = basePoints × multiplier × roundMultiplier
```

### Example: 16-player tournament
- Round 1 win: 10 × 1.5 × (1/4) = 3.75 ≈ 4 points
- Round 2 win: 10 × 1.5 × (2/4) = 7.5 ≈ 8 points
- Finals win: 10 × 1.5 × (3/4) = 11.25 ≈ 11 points

### Leaderboard Reset

- Leaderboards reset at start of new season
- Previous season leaderboards archived in database
- Achievements are permanent and accumulate

## Integration with Existing Systems

### Battle Service

Tournament 1v1 matches use `simulateBattle()`:

```typescript
import { simulateBattle, Combatant } from './battleService';

// Get player fleets
const defender: Combatant = {
  ships: defenderFleet.ships,
  name: defenderId
};

const attacker: Combatant = {
  ships: attackerFleet.ships,
  name: attackerId
};

// Simulate
const result = simulateBattle(defender, attacker);

// winner = 'attacker' | 'defender' | 'draw'
// rounds = array of round-by-round combat
// attackerLosses, defenderLosses = resource costs
```

### Achievement System

Award achievements on tournament milestones:

```typescript
// Win tournament
await awardAchievement(winnerId, 'tournament_champion', db);

// Reach leaderboard rank
if (leaderboardRank <= 3) {
  await awardAchievement(playerId, 'tournament_podium', db);
}
```

### Durable Objects (Optional)

For high-concurrency tournament events, store temporary state in Durable Objects:

```typescript
// PlanetDO could track "tournament_in_progress" flag
// Prevents planet changes during tournament match
await planetDO.fetch(new Request('..., {
  method: 'POST',
  body: JSON.stringify({ tournament_id: 'tournament_1' })
}));
```

## Testing Strategy

### Unit Tests (`tests/unit/tournament.test.ts`)

- [x] Tournament creation and validation
- [x] Player joining and limits
- [x] Bracket generation for various sizes (2, 4, 8, 16, 32, 64)
- [x] Match resolution and advancement
- [x] Season leaderboard aggregation
- [x] Achievement unlocking
- [x] Edge cases (forfeits, draws, byes)

### Integration Tests

- [ ] Full 4-player tournament (draft → bracket → finals → rewards)
- [ ] Concurrent match resolution
- [ ] Season closeout with reward distribution
- [ ] Player name and alliance tag in leaderboard

### Load Tests

- Bracket generation for 64 players < 100ms
- Leaderboard queries for 1000 players < 500ms
- Concurrent match resolution (10 simultaneous)

## Implementation Roadmap

### Phase 1: Core Infrastructure ✅
- [x] D1 schema for tournaments, brackets, matches
- [x] Tournament CRUD (create, join, list, get)
- [x] Bracket generation algorithm

### Phase 2: Match Resolution ✅
- [x] Match integration with battleService
- [x] Winner advancement logic
- [x] Battle report storage

### Phase 3: Season System ✅
- [x] Season creation and lifecycle
- [x] Leaderboard point tracking
- [x] Achievement distribution

### Phase 4: API Endpoints (In Progress)
- [ ] All tournament endpoints
- [ ] Match resolution endpoints
- [ ] Season leaderboard endpoints

### Phase 5: Frontend UI (Next)
- [ ] Tournament browser
- [ ] Bracket visualization
- [ ] Leaderboard display
- [ ] Match history

### Phase 6: Advanced Features
- [ ] Swiss round format (for 64+ players)
- [ ] Playoff ladder
- [ ] Alliance tournament aggregation
- [ ] Tournament replays

## Performance Considerations

### Bracket Generation

- O(n) where n = maxPlayers
- Tree building: O(log n) depth × recursive calls
- Database inserts: Batch matches for all rounds

### Match Resolution

- Parallelizable via Promise.all
- Each match independent of others
- Battle simulation: O(6) constant rounds max

### Leaderboard Queries

- Indexed on (season_id, points DESC)
- Pagination: LIMIT/OFFSET on rank
- Incremental updates on each win

## Security Considerations

1. **Match Verification**: All match results signed by server
2. **Participant Validation**: Only registered tournament players can participate
3. **Result Finality**: Completed matches cannot be modified
4. **Cheat Prevention**: Fleet composition validated before battle
5. **Rate Limiting**: Limit tournament creation to 1 per day per player

## Future Enhancements

- [ ] Streaming live tournament results
- [ ] Spectator mode for active matches
- [ ] Tournament commentary/highlights
- [ ] Prize pool distribution
- [ ] Sponsorship integration
- [ ] Trading tournament skins/cosmetics
- [ ] Cross-universe tournament rankings
