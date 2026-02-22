# PR: feat/galaxy-map

## Title
feat: galaxy map navigation & colonization

## Summary
- Implements galaxy coordinate system (9 galaxies × 500 systems × 15 positions per system)
- Provides planet/moon colonization mechanics with resource generation initialization
- Supports espionage missions for intelligence gathering on other players
- Integrates debris field at position 16 for expedition harvesting with Pathfinders

## Key Files Changed
- `src/lib/galaxy-map.ts` — Galaxy navigation and coordinate validation
- `src/lib/colonization.ts` — Planet/moon creation and initial resource setup
- `src/lib/expedition-system.ts` — Expedition missions and position 16 mechanics
- `src/types/galaxy.ts` — Coordinate types, planet/moon properties
- `src/types/colony.ts` — Colony state and owner tracking
- `src/services/colonization-service.ts` — Colonization orchestration
- `src/db/schemas/galaxy-schema.ts` — Galaxy state persistence
- `src/db/schemas/colony-schema.ts` — Colony tracking and queries
- `tests/unit/galaxy-map.test.ts` — Unit tests for coordinate validation
- `tests/integration/colonization.test.ts` — Colonization flow tests

## Game Mechanics Implemented
- **Universe Structure:** 9 galaxies, 500 systems per galaxy, 15 planet/moon positions
- **Position 16:** Expedition debris field (only Pathfinders can harvest)
- **Colonization:** Create new planet/moon with initial resource production setup
- **Planet Properties:** Size (160-320 fields), temperature (-100 to +200°C for deuterium bonus)
- **Espionage Missions:** Gather intelligence on other player colonies
- **Debris Field:** Position 16 contains wreckage from destroyed expedition fleets
- **Moon Destruction:** Deathstar can destroy moons (Graviton Tech requirement)
- **Inactive Protection:** 7+ days no login prevents attacks/colonization

## Testing
- [ ] Unit tests for coordinate validation (galaxy 1-9, system 1-499, position 1-16)
- [ ] Unit tests for planet/moon property generation (size, temperature ranges)
- [ ] Unit tests for initial resource production setup on colonization
- [ ] Integration test: full colonization flow (select position, create colony, verify production)
- [ ] Integration test: espionage mission to gather intel on target colony
- [ ] Integration test: expedition to position 16 debris field with Pathfinders
- [ ] Manual test with wrangler dev — navigate galaxy and colonize planets
- [ ] Verify coordinate system against OGameX reference (Section 8)

## Dependencies
- **Requires** `feat/fleet-movement` — colonization and espionage use fleet missions
- Uses `src/lib/production-system.ts` for initial resource generation
- Coordinates with research system for Graviton Tech (moon destruction)
- Integrates with debris-field system for position 16 harvesting

## Cross-Dependencies
**Blocks:** None (can proceed in parallel with other systems)

**Depends on:**
- `feat/fleet-movement` — colonization/espionage/expedition missions
- `feat/research-system` — Graviton Technology for moon destruction
- `feat/defense-system` — defenses protect colonies from attack

## Implementation Notes
- Store galaxy state in Durable Objects keyed by (galaxy, system)
- Implement coordinate validation as reusable utility
- Pre-populate expedition debris at position 16 periodically
- Cache colony listings per system for fast queries
- Implement inactive protection check (last login timestamp + 7 days)
- Support moon creation on colonies (separate position from planet)

🤖 Generated with Claude Code
