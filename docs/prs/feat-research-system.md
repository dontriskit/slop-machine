# PR: feat/research-system

## Title
feat: research & technology tree

## Summary
- Implements complete technology tree with research dependencies and cost scaling
- Supports 12+ core technologies including weapon trees, drive systems, and special tech
- Calculates research time using the build-time formula with research lab level bonuses
- Provides technology bonus calculations for production, speed, and cargo capacity

## Key Files Changed
- `src/lib/research-system.ts` — Research execution and technology tracking
- `src/lib/tech-tree.ts` — Technology dependency graph and unlock conditions
- `src/lib/tech-formulas.ts` — Research cost (2.0x exponential) and bonus calculations
- `src/types/technology.ts` — Technology definitions, costs, and bonus types
- `src/services/research-service.ts` — Research orchestration and queuing
- `src/db/schemas/tech-schema.ts` — Technology progress and completion tracking
- `tests/unit/research-system.test.ts` — Unit tests for research mechanics
- `tests/unit/tech-tree.test.ts` — Unit tests for dependency resolution

## Game Mechanics Implemented
- **Core Research Tree:** Energy, Laser, Ion, Plasma with tech requirements
- **Drive Systems:** Combustion (+10% speed), Impulse (+20%), Hyperspace (+30% per level)
- **Special Tech:** Hyperspace Technology (+5% cargo), Graviton Technology (enables Deathstar)
- **Cost Formula:** base × 2^(N-1), exponential scaling (Energy: 0m 800c 400d, Laser: 200m 100c 0d, etc.)
- **Research Time:** Uses build-time formula with Research Lab level scaling
- **Tech Bonuses:** Plasma gives +1% metal, +0.66% crystal, +0.33% deut per level
- **Dependency Graph:** Ion requires Energy 4 + Laser 5; Plasma requires Energy 8 + Laser 10 + Ion 5

## Testing
- [ ] Unit tests for tech tree dependency validation
- [ ] Unit tests for research cost calculations at different levels
- [ ] Unit tests for technology bonus calculations (speed, cargo, production)
- [ ] Unit tests for prerequisite checking before research start
- [ ] Integration test: research full tech chain from Energy to Plasma
- [ ] Manual test with wrangler dev — verify research queue and completion
- [ ] Edge case: research cancel and refund logic
- [ ] Verify formulas match OGameX reference implementation (Section 7)

## Dependencies
- Uses `src/lib/build-formulas.ts` for research time calculation
- Integrates with resource production system for cost validation
- Builds on `src/types/fleet.ts` for ship tech requirements (drive systems)
- Coordinates with defense system for weapon tech requirements

## Cross-Dependencies
**Blocks:**
- `feat/frontend-wiring` — ResearchLab component depends on this system
- `feat/galaxy-map` — Hyperspace Drive required for expedition navigation

**Provides to:**
- `feat/fleet-movement` — speed bonuses from Combustion/Impulse/Hyperspace drives
- `feat/defense-system` — weapon technology requirements and damage scaling
- `feat/battle-engine` — plasma bonus affects ship health calculations

## Implementation Notes
- Maintain tech tree as immutable configuration for easy updates
- Store research progress in Durable Objects with completion timestamps
- Calculate research time on-demand from lab level and queued items
- Implement research queue (FIFO) with cancellation and refund support

🤖 Generated with Claude Code
