# PR: feat/fleet-movement

## Title
feat: fleet movement & mission system

## Summary
- Implements fleet mission system with 8 mission types (Attack, Transport, Deploy, Espionage, Harvest, Moon Destruction, ACS Attack, ACS Defend)
- Calculates fleet travel times based on slowest ship speed and drive technology bonuses
- Resolves attack missions with battle engine and debris field generation
- Handles resource loot mechanics (50% max capacity) for successful attacks

## Key Files Changed
- `src/lib/fleet-movement.ts` — Fleet travel time and mission routing
- `src/lib/mission-system.ts` — Mission execution and completion resolution
- `src/lib/debris-field.ts` — Debris generation and recycler harvesting
- `src/types/mission.ts` — Mission types, states, and payload definitions
- `src/services/mission-service.ts` — Mission orchestration and queuing
- `src/db/schemas/mission-schema.ts` — Mission persistence and history
- `tests/unit/fleet-movement.test.ts` — Unit tests for travel calculations
- `tests/integration/mission-resolution.test.ts` — Mission execution tests

## Game Mechanics Implemented
- **Fleet Speed:** Slowest ship speed bottleneck with tech bonuses (+10% Combustion, +20% Impulse, +30% Hyperspace per level)
- **Travel Time:** Distance-based calculation using fleet speed and universe speed modifier
- **Mission Types:** Attack (battle + 50% loot), Transport, Deploy, Espionage, Harvest, Moon Destruction, ACS variants
- **Loot Mechanics:** Max 50% of target resources, limited by cargo capacity
- **Debris Generation:** 30% metal, 30% crystal, 0% deuterium from destroyed ships (Section 6)
- **Recycler Harvesting:** Collects debris at positions 1-15, distributed 1/3 per resource type

## Testing
- [ ] Unit tests for fleet speed calculation with drive technologies
- [ ] Unit tests for travel time formulas (distance, universe speed modifiers)
- [ ] Unit tests for loot cap enforcement (50% max)
- [ ] Unit tests for debris field generation from destroyed ships
- [ ] Integration test: full attack mission from fleet creation to debris harvest
- [ ] Manual test with wrangler dev — simulate multi-fleet missions
- [ ] Verify speed bonuses and travel times match reference implementations

## Dependencies
- **Requires** `feat/battle-engine` — attack missions invoke battle simulation
- **Requires** `feat/defense-system` — attack missions resolve against planetary defenses
- Uses `src/types/fleet.ts` for ship definitions and cargo capacity
- Uses `docs/patterns.md` fleet mechanics (speeds, cargo, mission types)

## Cross-Dependencies
**Blocks:**
- `feat/frontend-wiring` — needs mission API endpoints
- `feat/galaxy-map` — colonization missions use fleet-movement

**Depends on:**
- `feat/battle-engine` — for attack mission resolution
- `feat/defense-system` — for defense system integration

🤖 Generated with Claude Code
