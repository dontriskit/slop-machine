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
| `R2` | R2 Bucket | Strategy files, decision logs |
| `AI` | Workers AI | GLM-4.7-Flash inference |
