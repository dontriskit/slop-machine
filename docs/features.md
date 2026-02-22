# Cosmic Protocol — Feature Catalog

> Generated: 2026-02-22. Source: `worker/src/index.ts`, `worker/src/game/services/`, `worker/src/solana/`, `tests/unit/`.

---

## Feature Index

| # | Feature | Status | Tests |
|---|---------|--------|-------|
| 1 | Planet Management & Build Queue | stable | 16 (integration) |
| 2 | Fleet Dispatch & Missions | stable | 57 (integration) |
| 3 | Battle Engine | stable | 7 + 18 integration |
| 4 | Espionage System | stable | 67 |
| 5 | Research System | stable | 26 (integration) |
| 6 | Shipyard | stable | 42 |
| 7 | Alliance System | stable | 48 |
| 8 | Messaging System | stable | 60 |
| 9 | Solana NFT + AI Asset Generation | beta | 0 |

---

## 1. Planet Management & Build Queue

Manages per-planet resources, buildings, and build queue. Each planet is backed by a Cloudflare Durable Object (`PlanetDO`) that maintains persistent state with alarm-based queue completion.

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/planet/:id/state` | Full planet state (resources, buildings, queue) |
| GET | `/api/planet/:id/resources` | Resources with production rates |
| GET | `/api/planet/:id/buildings` | Building levels |
| GET | `/api/planet/:id/queue` | Build queue list |
| POST | `/api/planet/:id/queue` | Add building to queue |
| POST | `/api/planet/:id/initialize` | Initialize planet with starting state |
| POST | `/api/planet/:id/agent/run` | Manually trigger AI build agent |
| POST | `/api/planet/:id/agent/enable` | Enable automatic AI agent |
| POST | `/api/planet/:id/agent/disable` | Disable automatic AI agent |

### Key Types

```typescript
interface PlanetState {
  planetId: string;
  playerId: string;
  coordinate: Coordinate;       // { galaxy, system, position }
  planetType: 'planet' | 'moon' | 'debris';
  name: string;
  temperature: number;
  fields: number;
  universeSpeed: number;
  buildings: BuildingLevels;
  resources: Resources;         // { metal, crystal, deuterium }
  ships: Ships;
  queue: BuildQueueItem[];
  lastTickAt: number;           // unix ms
}

interface BuildQueueItem {
  buildingId: number;
  targetLevel: number;
  timeStart: number;
  timeEnd: number;
}
```

### Strategy Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/strategies` | List strategies for a player (`?player_id=`) |
| GET | `/api/strategies/:id` | Get specific strategy |
| POST | `/api/strategies` | Create new build strategy |

**Strategy body:** `{ playerId, name, steps: [{ buildingId, targetLevel }] }`

### Status: stable

---

## 2. Fleet Dispatch & Missions

Full fleet movement system supporting 8 mission types. Missions are persisted to D1 (`fleet_missions` table) and processed by the `FleetService`.

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/fleet/dispatch` | Dispatch fleet mission (primary) |
| POST | `/api/fleet/send` | Legacy endpoint (returns 501) |
| GET | `/api/fleet/missions` | List player missions (`?player_id=`) |
| GET | `/api/fleet/missions/:id` | Get mission details |
| POST | `/api/fleet/missions/:id/recall` | Recall fleet (returns 501) |

### Request: POST /api/fleet/dispatch

```typescript
{
  fromPlanetId: string;
  toCoord: Coordinate;
  ships: Record<string, number>;
  missionType: 'attack' | 'transport' | 'deploy' | 'espionage' |
               'harvest' | 'colonize' | 'expedition' | 'return';
  resources?: { metal: number; crystal: number; deuterium: number };
  speedPercent?: number;        // 10–100, default 100
  playerId?: string;
}
```

### Mission Types

| Type | Effect |
|------|--------|
| `attack` | Battle, loot up to 50% defender resources, return |
| `transport` | Deliver resources, return empty |
| `deploy` | Station fleet permanently (no return) |
| `espionage` | Gather intel, return |
| `harvest` | Collect debris field, return |
| `colonize` | Create new planet (consumes colony ship) |
| `expedition` | Explore unknown space |
| `return` | Return trip after mission completion |

### Key Types

```typescript
interface FleetMission {
  id: string;
  playerId: string;
  missionType: MissionType;
  missionStatus: 'in_transit' | 'returning' | 'completed' | 'cancelled';
  timeDeparture: number;      // unix seconds
  timeArrival: number;        // unix seconds
  sourceCoordinate: Coordinate;
  targetCoordinate: Coordinate;
  ships: Ships;
  resources: Resources;
  loot: Resources;
  fuelConsumed: number;
  speedPercent: number;
}
```

### Status: stable (recall endpoint pending)

---

## 3. Battle Engine

Full OGame combat simulation. Up to 6 rounds per battle with rapidfire, shields, tech bonuses, and debris generation.

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/battle-reports` | Player battle reports (`?player_id=`) |
| GET | `/api/battle-reports/:id` | Full battle report with round data |

### Battle Mechanics

- Up to 6 rounds; simulation ends early if one side is eliminated
- Per-unit targeting (random target selection)
- Shield absorption with 1% bounce rule
- Probabilistic destruction when hull drops below 70%
- Rapidfire: repeated shots with chance `1 - 1/rfAmount`
- Tech bonuses: +10% weapon/shield/armor per level
- Debris field: 30% metal + 30% crystal of destroyed ships (defenses excluded)
- Defenses: 70% repair chance after battle

### Key Types

```typescript
interface BattleResult {
  winner: 'attacker' | 'defender' | 'draw';
  rounds: BattleRound[];
  attackerLosses: Resources;
  defenderLosses: Resources;
  debrisField: { metal: number; crystal: number; deuterium: 0 };
  defenderSurvivingDefenses?: DefenseStructures;
  loot: Resources;
}
```

### Status: stable (1 flaky RNG test in `battle.test.ts`)

---

## 4. Espionage System

Full OGame espionage: tiered information revelation based on espionage tech difference + probe count. Counter-espionage probe destruction. Serialization to/from D1.

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/espionage/send` | Send probes to target |
| GET | `/api/espionage/reports` | List reports (`?player_id=&limit=50`) |
| GET | `/api/espionage/reports/:id` | Get single report |

### Request: POST /api/espionage/send

```typescript
{
  fromPlanetId: string;
  targetGalaxy: number;
  targetSystem: number;
  targetPosition: number;
  probeCount: number;           // 1–50
  playerId?: string;
}
```

### Information Tiers

| Diff | InfoLevel | Data Revealed |
|------|-----------|---------------|
| < 2 | Resources | Metal, crystal, deuterium |
| >= 2 | Fleet | + Ships stationed |
| >= 4 | Defenses | + Defense structures |
| >= 6 | Buildings | + Building levels |
| >= 8 | Research | + Tech levels |

Effective diff = `(attackerSpyTech - defenderSpyTech) + max(0, probeCount - 1) * 2`

### Key Types

```typescript
interface EspionageReport {
  id: string;
  timestamp: number;
  attackerId: string;
  defenderId: string | null;
  targetCoordinate: Coordinate;
  infoLevel: InfoLevel;         // 0–4
  resources: Resources | null;
  fleet: Partial<Ships> | null;
  defenses: Partial<DefenseStructures> | null;
  buildings: Partial<BuildingLevels> | null;
  research: Partial<TechLevels> | null;
  counterChance: number;        // 0–100 %
  probesSent: number;
  probesLost: number;
}
```

### Status: stable

---

## 5. Research System

15 technologies with prerequisite chains, cost scaling, and integration with fleet/battle tech bonuses.

### No direct REST endpoints
Research is queued via the planet build queue (`POST /api/planet/:id/queue`) or managed internally. Query via planet state.

### Technologies (ID → Key)

| ID | Key | Effect |
|----|-----|--------|
| 113 | energyTech | Prerequisite for most techs |
| 120 | laserTech | Requires Energy 2 |
| 121 | ionTech | Requires Laser 5, Energy 4 |
| 122 | plasmaTech | +1% metal production/level |
| 114 | hyperspaceTech | +5% cargo/level |
| 115 | combustionDrive | +10% speed (small ships) |
| 117 | impulseDrive | +20% speed (medium ships) |
| 118 | hyperspaceDrive | +30% speed (capital ships) |
| 106 | espionageTech | Info level for espionage |
| 108 | computerTech | +1 fleet slot/level |
| 124 | astrophysics | +1 colony every 2 levels |
| 109 | weaponTech | +10% attack/level |
| 110 | shieldingTech | +10% shields/level |
| 111 | armorTech | +10% hull/level |
| 199 | gravitonTech | Requires 300k energy production |

### Key Functions

```typescript
canResearch(techId: number, techs: TechLevels, buildings: BuildingLevels, energyProduction?: number): boolean
getResearchCost(techId: number, targetLevel: number): Resources
startResearch(planet: PlanetState, techId: number, techs: TechLevels): ResearchQueueItem
completeResearch(techId: number, techs: TechLevels): TechLevels
cancelResearch(planet: PlanetState, queueItem: ResearchQueueItem): void
```

### Status: stable

---

## 6. Shipyard

Build 13 ship types with prerequisite validation, resource deduction, build time calculation, and queue management via Durable Object.

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/planet/:id/ships/build` | Queue a ship build order |
| GET | `/api/planet/:id/ships/queue` | Current shipyard queue |
| POST | `/api/planet/:id/ships/cancel` | Cancel queued build order |
| GET | `/api/planet/:id/ships/available` | All ship types with buildability |

### Request: POST /api/planet/:id/ships/build

```typescript
{ shipType: keyof Ships; count: number }
```

### Ship Types

13 ship types: `lightFighter`, `heavyFighter`, `cruiser`, `battleship`, `battlecruiser`, `bomber`, `destroyer`, `deathstar`, `smallCargo`, `largeCargo`, `colonyShip`, `recycler`, `espionageProbe`

### Build Time Formula

```
buildTime = max(1, floor((metalCost + crystalCost) / (2500 × (1 + shipyardLevel) × universeSpeed × 2^naniteLevel)))
```

### Key Types

```typescript
interface ShipyardQueue {
  currentOrder: ShipBuildOrder | null;
  orders: ShipBuildOrder[];
  currentProgress: number;  // units completed in currentOrder
  startedAt: number;        // unix ms
}
```

### Status: stable

---

## 7. Alliance System

Full alliance lifecycle: creation, membership, role hierarchy (founder > officer > member > applicant), applications, search. Implemented in `allianceService.ts` but HTTP routes are not yet wired in `index.ts`.

### Service Functions (internal / planned endpoints)

| Function | Description |
|----------|-------------|
| `createAlliance(playerId, name, tag, description, db)` | Create new alliance, founder auto-joins |
| `dissolveAlliance(allianceId, requesterId, db)` | Permanently delete (founder only) |
| `applyToAlliance(playerId, allianceId, message, db)` | Submit membership application |
| `acceptApplication(allianceId, applicantId, officerId, db)` | Accept applicant (officer+) |
| `rejectApplication(allianceId, applicantId, officerId, db)` | Reject applicant (officer+) |
| `kickMember(allianceId, memberId, officerId, db)` | Remove member (officer+) |
| `leaveAlliance(playerId, allianceId, db)` | Leave or withdraw application |
| `promoteToOfficer(allianceId, memberId, founderId, db)` | Promote member to officer |
| `demoteToMember(allianceId, officerId, founderId, db)` | Demote officer to member |
| `getAllianceMembers(allianceId, db)` | List all members ordered by rank |
| `searchAlliances(query, db)` | Search by name/tag substring |

### Key Types

```typescript
interface Alliance {
  id: string;
  name: string;           // 3–32 chars
  tag: string;            // 3–8 uppercase alphanumeric
  founderId: string;
  description: string;
  memberCount: number;
  createdAt: number;
}

type AllianceRole = 'founder' | 'officer' | 'member' | 'applicant';
```

### Note

Alliance service is fully implemented and tested. HTTP route wiring is pending.

### Status: beta (service complete, no HTTP routes)

---

## 8. Messaging System

In-game player-to-player messaging with inbox/outbox, read tracking, soft-delete, system messages, and alliance broadcasts.

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/messages/send` | Send player-to-player message |
| GET | `/api/messages/inbox` | Paginated inbox (`?player_id=&page=1&limit=20`) |
| GET | `/api/messages/outbox` | Paginated outbox (`?player_id=&page=1&limit=20`) |
| GET | `/api/messages/unread-count` | Unread count (`?player_id=`) |
| POST | `/api/messages/mark-all-read` | Mark all inbox as read (`?player_id=`) |
| GET | `/api/messages/:id` | Get message and mark as read (`?player_id=`) |
| DELETE | `/api/messages/:id` | Soft-delete message (`?player_id=`) |

### Message Types

`player` | `system` | `combat_report` | `espionage_report` | `alliance`

### Delete Semantics

Soft-delete per side (sender/recipient). Permanent deletion occurs when both sides delete the message.

### Key Types

```typescript
interface GameMessage {
  id: string;
  fromPlayerId: string;
  fromPlayerName: string;
  toPlayerId: string;
  subject: string;
  body: string;
  type: MessageType;
  read: boolean;
  createdAt: number;    // unix seconds
}
```

### Status: stable

---

## 9. Solana NFT + AI Asset Generation

Compressed NFT minting on Solana devnet via Metaplex cNFT standard. AI-powered asset image generation using Cloudflare Workers AI (`@cf/stabilityai/stable-diffusion-xl-base-1.0`).

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/nft/mint` | Mint compressed NFT on Solana devnet |
| GET | `/api/nft/list` | List player NFT assets (`?player_id=`) |
| GET | `/api/nft/:id` | Get single NFT asset |
| POST | `/api/assets/generate` | Generate AI asset image + metadata |

### Request: POST /api/nft/mint

```typescript
{
  playerId: string;
  assetType: 'ship_skin' | 'planet_theme' | 'booster' | 'rare_ship';
  name: string;
  imageUrl?: string;
  ownerPublicKey: string;   // base58 Solana address (32–44 chars)
}
```

### Request: POST /api/assets/generate

```typescript
{
  assetType: 'ship_skin' | 'planet_theme' | 'booster' | 'rare_ship';
  style?: 'cyberpunk' | 'steampunk' | 'alien' | 'organic' | 'crystal' | 'futuristic';
  rarity?: 'common' | 'uncommon' | 'rare' | 'legendary';
}
```

### Response: POST /api/nft/mint

```typescript
{
  asset: NFTAsset;
  signature: string;     // Solana transaction signature
  assetId: string;       // On-chain cNFT ID
}
```

### Key Types

```typescript
interface NFTAsset {
  id: string;
  playerId: string;
  mintAddress?: string;
  assetType: AssetType;
  name: string;
  imageUrl?: string;
  metadataUri?: string;
  solanaTx?: string;
  network: 'devnet' | 'mainnet-beta';
  createdAt: number;
}
```

### Bindings Required

`SOLANA_RPC_URL`, `SOLANA_NETWORK`, `MINT_AUTHORITY_KEY`, `MERKLE_TREE_ADDRESS`, `R2`, `AI`

### Status: beta (devnet only, no unit tests)

---

## 10. Achievements & Stats

30+ achievements across 5 categories, backed by `player_stats` and `player_achievements` tables. Stats leaderboard with 9 sortable metrics.

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/achievements` | All achievement definitions |
| GET | `/api/player/:id/achievements` | Player's unlocked achievements |
| POST | `/api/player/:id/check-achievements` | Evaluate and unlock new achievements |
| GET | `/api/player/:id/stats` | Full e-sport player stats |
| GET | `/api/stats/top` | Leaderboard (`?stat=battles_won&limit=10`) |

### Achievement Categories

| Category | Count | Examples |
|----------|-------|---------|
| combat | 9 | first_blood, warrior, conqueror, warlord, destroyer |
| economy | 7 | miner, industrialist, tech_pioneer, scientist |
| exploration | 6 | first_colony, empire_builder, spy_master, navigator |
| social | 3 | team_player, trader, merchant |
| special | 5 | speed_demon, ai_ally, ai_overlord, veteran, legend |

### Leaderboard Stats

`battles_won`, `ships_destroyed`, `resources_raided_metal`, `fleets_dispatched`, `planets_colonized`, `research_completed`, `buildings_built`, `trades_completed`, `agent_decisions`

### Status: stable

---

## 11. Galaxy Map

System-level galaxy view, galaxy occupancy summary, and colonization.

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/galaxy/:galaxy/:system` | 15-slot SystemView |
| GET | `/api/galaxy/:galaxy` | Galaxy occupancy summary |
| POST | `/api/galaxy/colonize` | Colonize empty position |

### Request: POST /api/galaxy/colonize

```typescript
{
  playerId: string;
  fromPlanetId: string;
  galaxy: number;       // 1–9
  system: number;       // 1–499
  position: number;     // 1–15
}
```

### Status: stable
