# Cosmic Protocol

> **This is a live MMORPG.** Player availability is the top priority — 24/7 gameplay, zero downtime tolerance. Every decision, feature, and deployment must serve one goal: players can always connect, build, fight, and trade. If it breaks the game, it doesn't ship.

![Tests](https://img.shields.io/badge/tests-1600%2B%20passing-brightgreen)
![Coverage Statements](https://img.shields.io/badge/coverage%20statements-62.2%25-yellow)
![Coverage Branches](https://img.shields.io/badge/coverage%20branches-81.82%25-green)

An open source, self-hosted, federated OGame-inspired MMORPG where humans and AI agents play cooperatively in a persistent space economy. Built on Cloudflare's edge network for global low-latency access.

**Tech Stack:**
- **Frontend**: React 19 + React Three Fiber (3D galaxy) + Zustand (state) + Vite (build)
- **Backend**: Cloudflare Workers + Durable Objects + D1 + Workers AI (GLM-4.7-Flash)
- **Build Agent**: Single-loop agentic pattern with fan-out across all active planets
- **Battle Engine**: TypeScript simulation (6-round combat, rapidfire, debris)

## Test Coverage

Run coverage reports with:
```bash
npm run coverage          # Generate HTML + LCOV + JSON reports
npm run coverage:watch    # Watch mode with live coverage
```

Coverage reports are generated in `./coverage/`. See [COVERAGE_REPORT.md](COVERAGE_REPORT.md) for the full baseline analysis and action items.

| Metric | Current | Target |
|--------|---------|--------|
| Statements | 62.2% | 85% |
| Branches | 81.82% | ✓ 80%+ |
| Functions | 67.68% | 85% |
| Lines | 62.2% | 85% |

## Reference Implementations

- `references/OGameX` — [lanedirt/OGameX](https://github.com/lanedirt/OGameX) — PHP/Laravel 12 + Rust battle engine
- `references/UniEngine` — [mdziekon/UniEngine](https://github.com/mdziekon/UniEngine) — PHP/Smarty, mature OGame logic

## Project Structure

```
og-game/
├── frontend/                    # React 19 + React Three Fiber UI
│   ├── src/
│   │   ├── App.tsx             # Root component
│   │   ├── main.tsx            # Entry point
│   │   ├── components/
│   │   │   ├── Galaxy.tsx      # 3D spiral galaxy with 499 systems
│   │   │   ├── System.tsx      # Star system with orbiting planets
│   │   │   ├── Planet.tsx      # Individual planet (cartoonish style)
│   │   │   ├── HUD.tsx         # Green retro-terminal overlay
│   │   │   └── GalaxyMap.tsx   # Galaxy browser UI (grid + navigation)
│   │   ├── store/
│   │   │   └── gameStore.ts    # Zustand state (selected galaxy/system/planet)
│   │   └── lib/
│   │       ├── api.ts          # Typed API client
│   │       └── galaxyGenerator.ts  # Procedural galaxy layout
│   ├── vite.config.ts
│   ├── package.json
│   └── index.html
│
├── worker/                      # Cloudflare Workers (AI agent + API)
│   ├── src/
│   │   ├── index.ts            # Hono router
│   │   ├── game/
│   │   │   ├── types.ts        # Shared types
│   │   │   ├── formulas.ts     # OGame math (production, cost, time, distance)
│   │   │   ├── defenses.ts     # Defense structures (10 types)
│   │   │   └── services/
│   │   │       ├── battleService.ts      # 6-round combat simulation
│   │   │       ├── fleetService.ts       # 8 mission types, dispatch/arrive/return
│   │   │       ├── researchService.ts    # 15 technologies, tech tree
│   │   │       ├── galaxyService.ts      # Galaxy view + colonization
│   │   │       ├── coordinateService.ts  # Coordinate validation + distance
│   │   │       ├── missionService.ts     # Mission lifecycle
│   │   │       └── planetPlacementService.ts  # New player placement
│   │   ├── db/
│   │   │   └── schema.sql      # D1 database schema
│   │   ├── durable-objects/
│   │   │   └── PlanetDO.ts     # Per-planet state machine
│   │   └── agents/
│   │       └── buildOrderAgent.ts  # GLM-4.7-Flash single-loop
│   ├── wrangler.toml
│   ├── package.json
│   └── tsconfig.json
│
├── references/                  # Submodules (read-only)
│   ├── OGameX/
│   └── UniEngine/
│
├── tests/
│   ├── unit/                   # Vitest unit tests
│   │   ├── battle.test.ts
│   │   ├── formulas.test.ts
│   │   └── integration.test.ts
│   └── e2e/                    # Playwright end-to-end tests
│       └── game-flow.spec.ts
│
└── docs/
    ├── architecture.md         # System architecture overview
    └── patterns.md             # Canonical formulas & game mechanics
```

## Features

- **3D Galaxy Map** — Procedurally generated spiral galaxy (499 systems), click-to-select
- **Battle Engine** — 6-round combat, rapidfire mechanics, debris fields
- **Fleet System** — 8 mission types (attack, transport, deploy, espionage, harvest, colonize, expedition, return)
- **Research System** — 15 technologies with prerequisite chains (Weapon, Shield, Armor, Drive, etc.)
- **Defense System** — 10 defense structures (Rocket Launcher through Plasma Turret + shields)
- **Galaxy Map UI** — System grid view, debris fields, player info per slot
- **Build Agent** — GLM-4.7-Flash AI that plans building queues every minute
- **H2M Protocol** — Every build decision logged to `build_history` for AI training

## Setup

```bash
# Initialize submodules
git submodule update --init --recursive

# Frontend
cd frontend && npm install && npm run dev

# Worker (separate terminal)
cd worker && npm install && wrangler dev
```

## Frontend Development

```bash
cd frontend
npm install
npm run dev  # Starts on http://localhost:5173
```

## Worker Deployment

```bash
cd worker
wrangler deploy  # Deploys to Cloudflare
```

## Testing

```bash
# Unit tests (Vitest)
npx vitest run

# TypeScript type check (worker)
cd worker && npx tsc --noEmit

# Frontend build check
cd frontend && npx vite build

# E2E tests (Playwright, requires running dev servers)
npx playwright test
```

## Human-to-Machine (H2M) Protocol

Every build decision is logged in `build_history` table:
- `source: 'agent'` — AI recommendation
- `source: 'manual'` — Human override

This creates a training dataset for continuous AI improvement.
