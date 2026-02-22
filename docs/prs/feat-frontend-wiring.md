# PR: feat/frontend-wiring

## Title
feat: connect frontend UI to Worker API

## Summary
- Wires React frontend components to Cloudflare Worker API endpoints
- Implements real-time resource production tracking and building/research queue UI
- Connects battle simulation UI with backend battle-engine service
- Provides mission control dashboard for fleet movements and mission tracking

## Key Files Changed
- `src/components/Dashboard.tsx` — Main game dashboard with resource display
- `src/components/BuildingQueue.tsx` — Building upgrade UI with progress tracking
- `src/components/ResearchLab.tsx` — Technology research UI and cost calculations
- `src/components/FleetControl.tsx` — Fleet management and mission creation UI
- `src/components/BattleSimulator.tsx` — Real-time battle visualization
- `src/components/PlanetDefense.tsx` — Defense structure management UI
- `src/hooks/useWorkerAPI.ts` — Custom hook for API communication
- `src/hooks/useGameState.ts` — Global game state management
- `src/api/client.ts` — Worker API client with request/response serialization
- `tests/unit/api-client.test.ts` — API communication tests

## Game Mechanics Implemented
- **Resource Production:** Real-time display using mining formulas (30×L×1.1^L for metal, etc.)
- **Building Queue:** UI respects build time formula with robotics/nanite bonuses
- **Research Tracking:** Tech cost formula (base × 2^(N-1)) with progress percentage
- **Mission Display:** Shows travel time, arrival, and mission status
- **Battle Visualization:** Real-time damage, shield status, and destruction probability
- **Defense UI:** Planetary defense status with repair probability indicators

## Testing
- [ ] Unit tests for API client request/response handling
- [ ] Unit tests for game state management and updates
- [ ] Component tests for dashboard resource display accuracy
- [ ] Component tests for queue progress calculations
- [ ] Integration test: full flow from building start to completion notification
- [ ] Manual test with wrangler dev — verify all UI updates match backend state
- [ ] Manual test: real-time battle visualization with 6-round simulation

## Dependencies
- **Requires all backend PRs merged:**
  - `feat/battle-engine` — BattleSimulator component
  - `feat/defense-system` — PlanetDefense component
  - `feat/fleet-movement` — FleetControl component
  - `feat/research-system` — ResearchLab component
  - `feat/galaxy-map` — Map navigation features
- Worker API must be stable before frontend integration starts
- Uses Cloudflare Worker endpoints from all feature branches

## Cross-Dependencies
**Blocks:** None (final integration step)

**Depends on:** ALL backend systems
- Cannot begin until other 5 feature branches are production-ready
- Requires stable API contracts from all backend services

## Implementation Notes
- Use optimistic updates for better UX (assume success, rollback on error)
- Implement polling or WebSocket for real-time updates during long operations
- Handle network errors gracefully with retry logic
- Store game state in Durable Objects for persistence across page reloads

🤖 Generated with Claude Code
