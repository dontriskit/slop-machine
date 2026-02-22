# PR: feat/battle-engine

## Title
feat: 6-round battle simulation engine

## Summary
- Implements 6-round battle mechanics with shield regeneration and hull damage calculations
- Supports rapidfire (special attack) mechanics with configurable chance formulas
- Calculates destruction probability when hull drops below 70% threshold
- Integrates with fleet and defense system types for ship combat resolution

## Key Files Changed
- `src/lib/battle-engine.ts` — Core battle simulation and round processing
- `src/lib/battle-formulas.ts` — Damage, shield, and destruction calculations
- `src/types/battle.ts` — Battle state, round, and damage type definitions
- `src/services/battle-service.ts` — High-level battle orchestration
- `tests/unit/battle-engine.test.ts` — Unit tests for battle mechanics

## Game Mechanics Implemented
- **Battle Structure:** Max 6 rounds, shields regenerate fully each round
- **Damage Formula:** Minimum threshold (0.01 × target_shield), shield absorption priority
- **Hull Destruction:** Explosion chance = (1 - hull_percentage) × 100% when hull < 70%
- **Rapidfire:** Special attack chance = 100 - (100 / rapidfire_amount) percent
- **Fleet Speed Bottleneck:** Slowest ship determines overall fleet speed (Section 5)

## Testing
- [ ] Unit tests for damage calculations (shield absorption, overflow to hull)
- [ ] Unit tests for destruction probability and explosion logic
- [ ] Unit tests for rapidfire chance calculations
- [ ] Manual test with wrangler dev — simulate 6-round battles
- [ ] Verify formulas against OGameX reference implementation
- [ ] Edge cases: zero shield, full health, rapid destruction scenarios

## Dependencies
- Requires `feat/defense-system` for ship type definitions and defense stats
- Tested against `src/types/fleet.ts` for ship capacity and speed stats

## Cross-Dependencies
**Needed by:**
- `feat/fleet-movement` — battle engine used for attack missions
- `feat/defense-system` — reciprocal dependency on ship types

🤖 Generated with Claude Code
