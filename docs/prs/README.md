# Pull Request Documentation — Cosmic Protocol

**Generated:** 2026-02-22
**Project:** Cosmic Protocol (OGame-like game engine)
**Status:** All 6 feature branches documented and ready for implementation

---

## Overview

This directory contains detailed PR descriptions for all 6 feature branches of the Cosmic Protocol project. Each PR file corresponds to a feature branch and includes:
- Detailed feature summary
- Key files changed
- Game mechanics from `docs/patterns.md` that are implemented
- Testing checklist
- Dependency tracking
- Cross-dependencies for coordination

---

## 6 Feature Branches & PRs

### 1. feat/battle-engine
**File:** `feat-battle-engine.md`
**Title:** feat: 6-round battle simulation engine

Core battle mechanics with 6-round combat, shield regeneration, hull damage, and destruction probability.

**Key Formulas:**
- Minimum damage threshold: 0.01 × target_shield
- Destruction chance: (1 - hull_percentage) × 100% when hull < 70%
- Rapidfire chance: 100 - (100 / rapidfire_amount) percent

**Status:** Blocks `feat/fleet-movement` (attack missions)

---

### 2. feat/defense-system
**File:** `feat-defense-system.md`
**Title:** feat: planetary defense system

Stationary defense structures (lasers, ions, plasmas, shields) with repair mechanics.

**Key Formulas:**
- Defense repair probability: 70% base after combat
- Weapon damage scales with Laser/Ion/Plasma technology levels
- Defense costs scale 1.5-2.0x per level

**Status:** Blocks `feat/fleet-movement` (attack resolution)

---

### 3. feat/fleet-movement
**File:** `feat-fleet-movement.md`
**Title:** feat: fleet movement & mission system

8 mission types: Attack, Transport, Deploy, Espionage, Harvest, Moon Destruction, ACS Attack, ACS Defend

**Key Formulas:**
- Fleet speed: slowest ship (bottleneck) × tech bonuses (+10% Combustion, +20% Impulse, +30% Hyperspace per level)
- Travel time: distance-based with universe speed modifier
- Loot max: 50% of target resources
- Debris: 30% metal, 30% crystal, 0% deuterium

**Status:** Depends on `feat/battle-engine` + `feat/defense-system`
Blocks: `feat/frontend-wiring` + `feat/galaxy-map`

---

### 4. feat/frontend-wiring
**File:** `feat-frontend-wiring.md`
**Title:** feat: connect frontend UI to Worker API

React components wired to Cloudflare Worker endpoints.

**Components:**
- Dashboard (resources, production)
- BuildingQueue, ResearchLab
- FleetControl, BattleSimulator
- PlanetDefense

**Status:** Final integration step
Depends on ALL 5 other backend PRs being merged first

---

### 5. feat/research-system
**File:** `feat-research-system.md`
**Title:** feat: research & technology tree

12+ technologies with dependency graph and exponential cost scaling.

**Key Formulas:**
- Research cost: base × 2^(N-1) exponential scaling
- Tech bonuses: Plasma +1% metal, +0.66% crystal, +0.33% deut per level
- Research time: uses build-time formula with lab level bonuses

**Dependencies:**
- Energy → Laser (requires Energy 2)
- Laser + Energy → Ion (requires Laser 5 + Energy 4)
- Ion + Laser + Energy → Plasma (requires Ion 5 + Laser 10 + Energy 8)

**Status:** Blocks `feat/frontend-wiring` (ResearchLab component)
Required by `feat/galaxy-map` (Hyperspace Drive for expeditions)

---

### 6. feat/galaxy-map
**File:** `feat-galaxy-map.md`
**Title:** feat: galaxy map navigation & colonization

Universe coordinates (9 galaxies × 500 systems × 15 positions + position 16 expeditions)

**Key Mechanics:**
- Colonization: create new planet/moon with initial production setup
- Espionage missions: gather intelligence on targets
- Position 16: expedition debris field (Pathfinders only)
- Moon Destruction: Deathstar with Graviton Tech requirement
- Inactive Protection: 7+ days no login prevents attacks

**Status:** Depends on `feat/fleet-movement` (colonization/espionage missions)
Requires `feat/research-system` (Graviton Tech, Hyperspace Drive)

---

## Dependency Graph

```
                    feat/research-system
                    /                  \
                   /                    \
          feat/galaxy-map        feat/frontend-wiring
                /                        |
               /                         |
        feat/fleet-movement              |
             /     \                     |
            /       \___________________/
  feat/battle-engine
           |
           └─── feat/defense-system
```

### Critical Path for Implementation

1. **Phase 1 (Parallel):**
   - `feat/battle-engine` — core combat
   - `feat/defense-system` — planetary defense
   - `feat/research-system` — technology tree

2. **Phase 2 (Sequential):**
   - `feat/fleet-movement` — depends on Phase 1
   - `feat/galaxy-map` — depends on Phase 1 + 2

3. **Phase 3 (Final):**
   - `feat/frontend-wiring` — depends on ALL Phase 1-2

---

## Cross-Dependencies Summary

| Branch | Depends On | Blocks |
|--------|-----------|--------|
| battle-engine | — | fleet-movement, defense-system |
| defense-system | battle-engine | fleet-movement |
| fleet-movement | battle-engine, defense-system | frontend-wiring, galaxy-map |
| frontend-wiring | ALL others | — |
| research-system | — | frontend-wiring, galaxy-map |
| galaxy-map | fleet-movement, research-system | frontend-wiring |

---

## Game Mechanics Coverage

All PRs reference canonical formulas from `docs/patterns.md`:

- **Section 1:** Resource Production → All production systems
- **Section 2:** Building Costs & Scaling → Building/Research costs
- **Section 3:** Build Time Formula → Buildings, Research, Defenses
- **Section 4:** Battle Mechanics → `feat/battle-engine`
- **Section 5:** Fleet Mechanics → `feat/fleet-movement`
- **Section 6:** Debris Field → `feat/fleet-movement` (debris generation)
- **Section 7:** Technology Tree → `feat/research-system`
- **Section 8:** Universe Rules → `feat/galaxy-map`

---

## Testing Strategy

Each PR includes:
- **Unit Tests:** Core formulas and edge cases
- **Integration Tests:** Full feature workflows
- **Manual Tests:** Wrangler dev with real-time verification
- **Reference Verification:** Against OGameX + UniEngine

---

## Next Steps

1. Assign branches to team members based on dependency graph
2. Start Phase 1 branches in parallel
3. Merge Phase 1 branches before starting Phase 2
4. Merge Phase 2 branches before starting frontend-wiring
5. Use PR files as requirements specification for implementation
6. Reference `docs/patterns.md` for all formula implementations

---

**Created by:** Claude Code
**Last Updated:** 2026-02-22
