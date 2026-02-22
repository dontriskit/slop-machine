# Cosmic Protocol — Architecture

## Overview

Cosmic Protocol is a self-hosted, federated OGame clone. The architecture separates concerns across a stateless Cloudflare Worker (API + agent), per-planet Durable Objects (state machines), a D1 relational database (persistent records), and a React Three Fiber frontend (3D galaxy rendering).

---

## Backend: Cloudflare Workers

### Hono Router (`worker/src/index.ts`)

REST API served by the Hono framework on Cloudflare Workers. All endpoints are stateless; state lives in D1 or Durable Objects.

**Endpoint groups:**
- `GET/POST /api/planet/:id/*` — Planet state, resources, buildings, queue, agent control
- `GET/POST /api/strategies/*` — Build strategy CRUD
- `POST /api/planet/:id/agent/run` — Manual agent trigger
- `GET /api/galaxy/:galaxy/:system` — Galaxy map system view

**Cron trigger:** Runs every minute (`*/1 * * * *`), fans out build agent across all planets with `agent_enabled = 1` via `Promise.all`.

---

### Durable Objects: PlanetDO (`worker/src/durable-objects/PlanetDO.ts`)

One Durable Object instance per planet. Provides:
- Persistent storage of buildings, resources, build queue
- Resource production ticking (called by Cron or on-demand)
- Build queue management with alarm-based completion
- Endpoints: `/state`, `/resources`, `/buildings`, `/queue/*`, `/initialize`, `/tick`

Each planet's state is isolated; no shared mutable state between planets.

---

### D1 Database (`worker/src/db/schema.sql`)

SQLite-compatible relational database hosted on Cloudflare D1.

| Table | Purpose |
|-------|---------|
| `players` | User accounts |
| `planets` | Coordinates (galaxy:system:position), temperature, fields, agent flag |
| `fleets` | Ships stationed at a planet |
| `fleet_missions` | In-flight missions with departure/arrival times |
| `build_strategies` | JSON build order sequences |
| `build_history` | AI + human decision log (H2M training data) |
| `debris_fields` | Metal/crystal left after battles |
| `moons` | Moon presence per planet |

---

### Workers AI: Build Order Agent (`worker/src/agents/buildOrderAgent.ts`)

**Model:** `@cf/thudm/glm-4-0520` (GLM-4.7-Flash)

**Single-loop pattern (one inference per planet per minute):**
1. Read planet state (buildings, resources, queue, strategy)
2. Call GLM-4.7-Flash with structured prompt
3. Parse JSON response: `{"action":"build"|"wait","buildingId":number,"reason":string}`
4. Validate and execute decision
5. Log to D1 `build_history` for H2M training

Temperature: 0.3 (deterministic). Fan-out via `Promise.all` across all enabled planets.

---

## Game Systems (`worker/src/game/`)

### Formulas (`formulas.ts`)

All canonical OGame formulas, verified against OGameX and UniEngine:

| Formula | Description |
|---------|-------------|
| `calculateDistance` | Galaxy/system/position distance with donut wrapping |
| `calculateDuration` | `(35000 / speedPercent × √(dist × 10 / slowestSpeed) + 10) / fleetSpeed` |
| `calculateFuelConsumption` | Per-ship fuel at given distance + speed |
| `calculateProduction` | `base × level × 1.1^level × tempBonus` |
| `calculateBuildingCost` | `floor(baseCost × factor^(level-1))` |
| `calculateBuildTime` | `(m+c) / (2500 × robotics × nanite × speed)` |

### Services

| Service | File | Responsibility |
|---------|------|---------------|
| `BattleService` | `battleService.ts` | 6-round combat, rapidfire, debris (30% metal/crystal) |
| `FleetService` | `fleetService.ts` | Dispatch, arrival, return for 8 mission types |
| `ResearchService` | `researchService.ts` | 15 technologies, prerequisites, costs, effects |
| `GalaxyService` | `galaxyService.ts` | System view, galaxy summary, colonization |
| `CoordinateService` | `coordinateService.ts` | Validation, distance, donut wrapping |
| `MissionService` | `missionService.ts` | Mission lifecycle queries |
| `PlanetPlacementService` | `planetPlacementService.ts` | New player 3-attempt placement algorithm |

### Battle Engine (`battleService.ts`)

Full OGame combat simulation:
- Up to 6 rounds
- Per-unit targeting (random target selection)
- Shield absorption with 1% bounce rule
- Probabilistic destruction below 70% hull
- Rapidfire mechanic (repeated shots, chance = `1 - 1/rfAmount`)
- Technology bonuses: +10% weapon/shield/armor per level
- Debris field: 30% metal + 30% crystal of destroyed ships (not defenses)

### Fleet Missions (`fleetService.ts`)

8 mission types:
- `attack` — Battle → loot up to 50% defender resources → return
- `transport` — Deliver resources → return empty
- `deploy` — Station fleet permanently (no return)
- `espionage` — Gather intel → return
- `harvest` — Collect debris field → return
- `colonize` — Create new planet (colony ship consumed)
- `expedition` — Explore unknown space
- `return` — Return trip after mission completion

### Research System (`researchService.ts`)

15 technologies with prerequisite chains:

| Tech | ID | Effect |
|------|----|--------|
| Energy Technology | 113 | Prerequisite for most techs |
| Laser Technology | 120 | Requires Energy 2 |
| Ion Technology | 121 | Requires Laser 5, Energy 4 |
| Plasma Technology | 122 | Production bonus (+1% metal/level) |
| Hyperspace Technology | 114 | +5% cargo/level |
| Combustion Drive | 115 | +10% speed (small ships) |
| Impulse Drive | 117 | +20% speed (medium ships) |
| Hyperspace Drive | 118 | +30% speed (capital ships) |
| Espionage Technology | 106 | Requires Lab 3 |
| Computer Technology | 108 | +1 fleet slot/level |
| Astrophysics | 124 | +1 colony every 2 levels |
| Weapon Technology | 109 | +10% attack/level |
| Shielding Technology | 110 | +10% shields/level |
| Armor Technology | 111 | +10% hull/level |
| Graviton Technology | 199 | Requires 300k energy production |

### Defense System (`defenses.ts`)

10 defense structures (401–503):
Rocket Launcher, Light Laser, Heavy Laser, Gauss Cannon, Ion Cannon, Plasma Turret, Small Shield Dome, Large Shield Dome, Anti-Ballistic Missile, Interplanetary Missile.

Post-battle: 70% chance to repair each destroyed defense structure.

---

## Frontend: React Three Fiber

### Stack
- **React 19** — Component framework
- **React Three Fiber** — Three.js declarative wrapper for 3D rendering
- **Zustand** — Lightweight global state (selected galaxy/system/planet)
- **Vite** — Build tool and dev server

### Components

| Component | File | Purpose |
|-----------|------|---------|
| `Galaxy` | `Galaxy.tsx` | 3D spiral galaxy, 499 systems, procedurally placed |
| `System` | `System.tsx` | Star system with 1-15 orbiting planets, real-time animation |
| `Planet` | `Planet.tsx` | Individual planet with cartoonish material |
| `HUD` | `HUD.tsx` | Green retro-terminal overlay: resources, queue, agent toggle |
| `GalaxyMap` | `GalaxyMap.tsx` | 2D grid galaxy browser (system rows × position columns) |

### State (`store/gameStore.ts`)

Zustand store holds:
- Selected galaxy (1–9), system (1–499), planet position
- Loaded planet state from API
- Agent enabled flag

### API Client (`lib/api.ts`)

Typed wrapper around the Worker REST API. All fetch calls go through this module, which handles base URL, error handling, and JSON parsing.

---

## Data Flow

```
User click (3D planet) → Zustand update → HUD re-render
  ↓
API Client → Hono Worker → PlanetDO (per-planet state)
  ↓                            ↓
D1 (persistent records)    Alarm (build queue timer)
  ↓
Cron (every 1 min) → Agent fan-out → GLM-4.7-Flash → build decision → D1 log
```

---

## Bindings

| Binding | Type | Purpose |
|---------|------|---------|
| `PLANET_DO` | Durable Object | Per-planet state machine |
| `DB` | D1 Database | Persistent records |
| `KV` | KV Namespace | Session tokens, snapshots |
| `R2` | R2 Bucket | Strategy files, decision logs, NFT images |
| `AI` | Workers AI | GLM-4.7-Flash inference + Stable Diffusion |
| `SOLANA_RPC_URL` | Secret | Solana devnet RPC endpoint |
| `SOLANA_NETWORK` | Secret | `devnet` or `mainnet-beta` |
| `MINT_AUTHORITY_KEY` | Secret | Solana keypair for cNFT minting |
| `MERKLE_TREE_ADDRESS` | Secret | Bubblegum Merkle tree for compressed NFTs |

---

## New Feature Systems (Phase 8+)

### Solana NFT Integration (`worker/src/solana/`)

Compressed NFT (cNFT) minting on Solana devnet using the Metaplex Bubblegum standard. Each in-game asset (ship skin, planet theme, booster, rare ship) can be minted as an on-chain token.

**Flow:**
1. Client calls `POST /api/assets/generate` to create AI-generated image and metadata
2. Client calls `POST /api/nft/mint` with `ownerPublicKey` and asset details
3. Worker calls `mintCompressedNFT` from `solana/mint.ts`
4. Metadata JSON is stored in R2; on-chain asset record persisted to D1 `nft_assets` table
5. Solana transaction signature returned to client

**Key files:**
- `worker/src/solana/types.ts` — `NFTAsset`, `NFTMetadata`, `MintRequest`, `AssetType`
- `worker/src/solana/mint.ts` — `mintCompressedNFT`, `buildMetadata`
- `worker/src/agents/assetGenerator.ts` — `generateAsset` (Stable Diffusion via Workers AI)

**Status:** Beta — devnet only, no unit tests (requires live bindings).

---

### AI Asset Generation Pipeline (`worker/src/agents/assetGenerator.ts`)

Uses Cloudflare Workers AI (`@cf/stabilityai/stable-diffusion-xl-base-1.0`) to generate game asset images on demand. Output is stored in R2 and returned as both a URL and base64 string.

**Asset types:** `ship_skin`, `planet_theme`, `booster`, `rare_ship`
**Styles:** `cyberpunk`, `steampunk`, `alien`, `organic`, `crystal`, `futuristic`
**Rarities:** `common`, `uncommon`, `rare`, `legendary`

---

### Espionage System (`worker/src/game/services/espionageService.ts`)

Full OGame espionage with info-level revelation tiers.

- **Effective spy diff:** `(attackerTech - defenderTech) + max(0, probeCount - 1) * 2`
- **Info tiers:** Resources (0) → Fleet (1) → Defenses (2) → Buildings (3) → Research (4)
- **Counter-espionage:** `max(0, defenderTech - attackerTech + 1) × probeCount × 2` % chance, clamped 0–100
- **Probe loss:** Deterministic when detection chance is 100%; probabilistic otherwise
- **Serialization:** `serializeForDb` / `deserializeFromDb` for D1 storage

Reports stored in `espionage_reports` D1 table.

---

### Alliance System (`worker/src/game/services/allianceService.ts`)

Full alliance lifecycle with a 4-tier role hierarchy.

**Role hierarchy (authority order):** `founder` > `officer` > `member` > `applicant`

- Founders can dissolve, promote, demote, kick, accept/reject
- Officers can accept, reject, kick regular members
- Members can leave
- Applicants can withdraw their application

Alliance tags (3–8 chars, uppercase alphanumeric) appear on the galaxy map next to player names. Stored in `alliances`, `alliance_members`, `alliance_applications` D1 tables.

**Note:** HTTP routes for alliance management are not yet wired in `index.ts`.

---

### Messaging System (`worker/src/game/services/messageService.ts`)

Asynchronous player-to-player messaging with type tagging, pagination, read tracking, and soft-delete.

**Message types:** `player`, `system`, `combat_report`, `espionage_report`, `alliance`

Soft-delete is per-side: each player can independently delete a message from their view. Permanent deletion occurs only when both sender and recipient have deleted. Stored in `messages` D1 table.

Alliance broadcasts (`sendAllianceMessage`) look up all members sharing the sender's `alliance_tag` and insert one message per recipient.

---

### Shipyard & Ship Construction (`worker/src/game/services/shipyardService.ts`)

Build pipeline for all 13 ship types with prerequisite checking, resource deduction, and queue management.

**13 ship types:** `lightFighter`, `heavyFighter`, `cruiser`, `battleship`, `battlecruiser`, `bomber`, `destroyer`, `deathstar`, `smallCargo`, `largeCargo`, `colonyShip`, `recycler`, `espionageProbe`

**Build time formula:** `max(1, floor((metal + crystal) / (2500 × (1 + shipyard) × speed × 2^nanite)))`

The queue is embedded in the planet's Durable Object state (`ShipyardQueue`). The `processShipyardQueue` function is called on each tick to advance in-progress orders and move completed ships into `planet.ships`.

---

### Achievements & Stats Tracking (`worker/src/game/services/achievementService.ts`, `statsService.ts`)

**30 achievements** across 5 categories (combat, economy, exploration, social, special). Achievement evaluation is event-driven: call `checkAchievements(playerId, stats, db)` after any game event.

Stats are aggregated from `player_stats`, `battle_reports`, `planets`, and `build_history` tables. The `getPlayerStats` function does not write to the database — it reads and computes.

**Leaderboard** (`statsService.ts`) supports 9 sortable columns backed by `player_stats` table. Used by `GET /api/stats/top`.

---

## Updated Data Flow

```
User action (web/API) ──→ Hono Worker
  │
  ├── Planet ops  ──→ PlanetDO (Durable Object) ──→ D1 build_history
  │
  ├── Fleet ops   ──→ FleetService ──→ D1 fleet_missions
  │                      └──→ BattleService ──→ D1 battle_reports
  │
  ├── Espionage   ──→ EspionageService ──→ D1 espionage_reports
  │
  ├── Alliances   ──→ AllianceService ──→ D1 alliances / members / applications
  │
  ├── Messages    ──→ MessageService ──→ D1 messages
  │
  ├── Shipyard    ──→ ShipyardService ──→ PlanetDO (ships queue in DO state)
  │
  ├── Research    ──→ ResearchService ──→ PlanetDO (research queue in DO state)
  │
  ├── NFT Mint    ──→ Solana mint.ts ──→ Solana devnet + R2 + D1 nft_assets
  │
  ├── AI Assets   ──→ assetGenerator.ts ──→ Workers AI (Stable Diffusion) + R2
  │
  └── Cron (1min) ──→ BuildOrderAgent ──→ Workers AI (GLM-4.7-Flash) ──→ D1 build_history
                          └──→ PlanetDO (alarm → queue completion)
```
