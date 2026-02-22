# Coverage Report — Cosmic Protocol

Generated: 2026-02-22  
Test Suite: 970 tests passing, 0 failing  
Provider: v8 (Node.js built-in)

## Overall Coverage

| Metric     | Current | Target | Status |
|------------|---------|--------|--------|
| Statements | 62.2%   | 85%    | Below  |
| Branches   | 81.82%  | 80%    | ✓      |
| Functions  | 67.68%  | 85%    | Below  |
| Lines      | 62.2%   | 85%    | Below  |

## Per-File Coverage Matrix

| File | Statements | Branches | Functions | Lines | Priority |
|------|-----------|----------|-----------|-------|----------|
| **game/services/** | | | | | |
| battleService.ts | 97.75% | 89.65% | 91.66% | 97.75% | ✓ |
| messageService.ts | 97.95% | 94.31% | 100% | 97.95% | ✓ |
| moonBuildingService.ts | 100% | 100% | 100% | 100% | ✓ |
| espionageService.ts | 97.95% | 94.31% | 100% | 97.95% | ✓ |
| allianceService.ts | 92.63% | 78.49% | 94.44% | 92.63% | P1 |
| expeditionService.ts | 89.54% | 92.85% | 76.47% | 89.54% | P1 |
| tutorialService.ts | 94.37% | 88.88% | 72.22% | 94.37% | P1 |
| leaderboardService.ts | 82.7% | 85.96% | 50% | 82.7% | P1 |
| tournamentService.ts | 75.54% | 69.89% | 84% | 75.54% | P2 |
| moonService.ts | 70.83% | 70% | 100% | 70.83% | P2 |
| fleetService.ts | 66.52% | 71.27% | 65.71% | 66.52% | P0 |
| officerService.ts | 59.74% | 94.73% | 64.86% | 59.74% | P2 |
| researchService.ts | 72.26% | 61.4% | 33.33% | 72.26% | P1 |
| shipyardService.ts | 82.7% | 85.96% | 50% | 82.7% | P1 |
| formulas.ts | 90.29% | 94.44% | 85.71% | 90.29% | ✓ |
| **Critical Gaps (0% coverage)** | | | | | |
| leaderboardService.ts (exported) | 0% | 100% | 100% | 0% | P0 |
| statsService.ts | 0% | 100% | 100% | 0% | P0 |
| missionService.ts | 0% | 0% | 0% | 0% | P0 |
| planetPlacementService.ts | 0% | 0% | 0% | 0% | P1 |
| galaxyService.ts | 28.15% | 50% | 36.36% | 28.15% | P0 |
| achievementService.ts | 71.54% | 92.3% | 14.28% | 71.54% | P1 |
| coordinateService.ts | 41.93% | 100% | 53.84% | 41.93% | P2 |
| **durable-objects/** | | | | | |
| PlanetDO.ts | 0% | 0% | 0% | 0% | P0 |
| MoonDO.ts | 0% | 0% | 0% | 0% | P1 |
| **agents/** | | | | | |
| assetGenerator.ts | 0% | 100% | 100% | 0% | P2 |
| buildOrderAgent.ts | 0% | 0% | 0% | 0% | P2 |
| **solana/** | | | | | |
| mint.ts | 0% | 0% | 0% | 0% | P3 |

## Top 10 Priority Files for New Tests

1. **statsService.ts** (0%) — tracks player stats events
2. **leaderboardService (exported fns)** (0%) — critical game feature
3. **PlanetDO.ts** (0%) — per-planet state machine
4. **missionService.ts** (0%) — fleet missions
5. **galaxyService.ts** (28%) — galaxy generation
6. **fleetService.ts** (66%) — fleet dispatch/travel
7. **researchService.ts** (72%) — tech tree
8. **achievementService.ts** (71%) — achievement tracking
9. **coordinateService.ts** (41%) — planet coordinates
10. **tournamentService.ts** (75%) — seasonal tournaments

## Running Coverage Locally

```bash
# Generate full coverage report (HTML + LCOV + JSON)
npm run coverage

# View interactive HTML report
open coverage/index.html

# Continuous coverage in watch mode
npm run coverage:watch
```

## Coverage Reports Location

```
coverage/
├── index.html           # Interactive HTML report (open in browser)
├── coverage-final.json  # Raw coverage data
├── lcov.info           # LCOV format (for CI integration)
└── lcov-report/        # Alternative HTML report
```

## Action Items to Reach 85% Target

### P0 — Critical (must fix first)
- [ ] Add tests for `statsService.ts` (recordStatEvent, getPlayerStats)
- [ ] Add tests for `leaderboardService.ts` (getLeaderboard, updateScore)
- [ ] Add mock tests for `PlanetDO.ts` state machine
- [ ] Add tests for `missionService.ts` (fleet mission CRUD)
- [ ] Expand `galaxyService.ts` tests (coordinate generation, galaxy map)

### P1 — High Priority
- [ ] Expand `fleetService.ts` coverage (dispatch, travel, combat return)
- [ ] Expand `researchService.ts` coverage (queue management, completion)
- [ ] Add tests for `planetPlacementService.ts`

### P2 — Medium Priority
- [ ] Expand `officerService.ts` function coverage
- [ ] Expand `tournamentService.ts` (closeSeason, getSeasonLeaderboard)
- [ ] Add mock tests for `MoonDO.ts`

## CI Integration

Coverage is checked in CI with thresholds defined in `vitest.config.ts`.
The `npm run coverage` script generates reports in `./coverage/`.

To add GitHub Actions CI check, add to `.github/workflows/test.yml`:
```yaml
- name: Run Tests with Coverage
  run: npm run coverage
- name: Upload Coverage Report
  uses: actions/upload-artifact@v4
  with:
    name: coverage-report
    path: coverage/
```
