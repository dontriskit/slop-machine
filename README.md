# Cosmic Protocol

An open source, self-hosted, federated OGame clone where humans and AI agents play cooperatively in a space economy simulation.

**Tech Stack:**
- **Frontend**: Svelte + TypeScript-Go (6x faster compiler) + esbuild (fastest bundler)
- **Backend**: Cloudflare Workers + Durable Objects + D1 + Workers AI (GLM-4.7-Flash)
- **Build Agent**: Single-loop agentic pattern with fan-out across all active planets
- **Battle Engine**: Rust FFI (reference: OGameX)

## Reference Implementations

- `references/OGameX` — [lanedirt/OGameX](https://github.com/lanedirt/OGameX) — PHP/Laravel 12 + Rust battle engine
- `references/UniEngine` — [mdziekon/UniEngine](https://github.com/mdziekon/UniEngine) — PHP/Smarty, mature OGame logic

## Project Structure

```
og-game/
├── frontend/                    # Svelte UI (playable immediately)
│   ├── src/
│   │   ├── App.svelte          # Root component (planet dashboard)
│   │   ├── index.ts            # Entry point
│   │   └── types/game.ts       # Shared game types
│   ├── scripts/dev.js          # Live reload dev server
│   ├── package.json
│   ├── tsconfig.json           # TypeScript config for typescript-go
│   └── README.md
│
├── worker/                      # Cloudflare Workers (AI agent + API)
│   ├── src/
│   │   ├── index.ts            # Hono router
│   │   ├── game/
│   │   │   ├── types.ts        # Shared types
│   │   │   └── formulas.ts     # OGame math (production, cost, time)
│   │   ├── db/
│   │   │   └── schema.sql      # D1 database schema
│   │   ├── durable-objects/
│   │   │   └── PlanetDO.ts     # Per-planet state machine
│   │   ├── agents/
│   │   │   └── buildOrderAgent.ts  # GLM-4.7-Flash single-loop
│   │   └── workflows/
│   │       └── generateStrategy.ts # Cloudflare Workflow
│   ├── wrangler.toml
│   ├── package.json
│   └── tsconfig.json
│
├── references/                  # Submodules (read-only)
│   ├── OGameX/
│   └── UniEngine/
│
└── docs/
    └── patterns.md             # Canonical formulas & game mechanics
```

## Setup

```bash
# Initialize submodules
git submodule update --init --recursive

# Frontend
cd frontend && pnpm install && pnpm dev

# Worker (separate terminal)
cd worker && pnpm install && wrangler dev
```

## Frontend Development

Start with playable UI, evolve iteratively:
```bash
cd frontend
pnpm install
pnpm dev  # Starts on http://localhost:5173 with live reload
```

Rebuild time: **<100ms** (thanks to typescript-go + esbuild).

## Worker Deployment

```bash
cd worker
wrangler deploy  # Deploys to Cloudflare
```

## Human-to-Machine (H2M) Protocol

Every build decision is logged in `build_history` table:
- `source: 'agent'` — AI recommendation
- `source: 'manual'` — Human override

This creates a training dataset for continuous AI improvement.
