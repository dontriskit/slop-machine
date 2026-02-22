# Coverage Report — Cosmic Protocol

Generated: 2026-02-22 | Provider: v8 | Vitest 2.1.9

## Overall Coverage (Worker Services)

| Metric | Coverage | Target |
|--------|----------|--------|
| Statements | 62.16% | 70% |
| Branches | 81.87% | 70% |
| Functions | 68.45% | 60% |
| Lines | 62.16% | 70% |

> Run `npm run coverage` to regenerate this report.

---

## Coverage by Service (worker/src/game/services/)

| Service | Stmts | Branch | Funcs | Lines | Priority | Gap to 85% |
|---------|-------|--------|-------|-------|----------|------------|
| moonBuildingService.ts | 100% | 100% | 100% | 100% | P1 | Done |
| espionageService.ts | 97.95% | 94.31% | 100% | 97.95% | P0 | Done |
| messageService.ts | 98.8% | 79.76% | 100% | 98.8% | P1 | Done |
| battleService.ts | 97.75% | 89.65% | 91.66% | 97.75% | P0 | Done |
| allianceService.ts | 92.63% | 78.49% | 94.44% | 92.63% | P0 | Done |
| tutorialService.ts | 94.37% | 88.88% | 72.22% | 94.37% | P2 | Done |
| expeditionService.ts | 89.54% | 90% | 76.47% | 89.54% | P1 | Done |
| shipyardService.ts | 82.7% | 85.96% | 50% | 82.7% | P0 | -2.3% |
| tournamentService.ts | 75.54% | 70.21% | 84% | 75.54% | P1 | -9.5% |
| researchService.ts | 72.26% | 61.4% | 33.33% | 72.26% | P1 | -12.7% |
| achievementService.ts | 71.54% | 92.3% | 14.28% | 71.54% | P1 | -13.5% |
| moonService.ts | 70.83% | 70% | 100% | 70.83% | P1 | -14.2% |
| fleetService.ts | 66.52% | 71.27% | 65.71% | 66.52% | P0 | -18.5% |
| officerService.ts | 59.74% | 94.73% | 64.86% | 59.74% | P1 | -25.3% |
| coordinateService.ts | 41.93% | 100% | 53.84% | 41.93% | P2 | -43.1% |
| galaxyService.ts | 28.15% | 50% | 36.36% | 28.15% | P1 | -56.9% |
| leaderboardService.ts | 0% | 100% | 100% | 0% | P1 | N/A |
| missionService.ts | 0% | 0% | 0% | 0% | P2 | N/A |
| statsService.ts | 0% | 100% | 100% | 0% | P1 | N/A |
| planetPlacementService.ts | 0% | 0% | 0% | 0% | P2 | N/A |

## Coverage by Category

### Game Core (worker/src/game/)

| File | Stmts | Branch | Funcs | Lines |
|------|-------|--------|-------|-------|
| defenses.ts | 83.76% | 74.28% | 63.63% | 83.76% |
| formulas.ts | 90.29% | 94.44% | 85.71% | 90.29% |

### Durable Objects (worker/src/durable-objects/)

| File | Stmts | Branch | Funcs | Lines | Notes |
|------|-------|--------|-------|-------|-------|
| PlanetDO.ts | 0% | 0% | 0% | 0% | Needs Miniflare env |
| MoonDO.ts | 0% | 0% | 0% | 0% | Needs Miniflare env |

### Agents (worker/src/agents/)

| File | Stmts | Branch | Funcs | Lines | Notes |
|------|-------|--------|-------|-------|-------|
| assetGenerator.ts | 0% | 100% | 100% | 0% | Needs AI mock |
| buildOrderAgent.ts | 0% | 0% | 0% | 0% | Needs AI mock |

### Solana (worker/src/solana/)

| File | Stmts | Branch | Funcs | Lines | Notes |
|------|-------|--------|-------|-------|-------|
| types.ts | 100% | 100% | 100% | 100% | |
| mint.ts | 0% | 0% | 0% | 0% | Needs devnet mock |

---

## Gap Analysis: Files Below 80% Coverage

### Critical (P0) — Fix Immediately

1. **fleetService.ts** — 66.52% lines, 65.71% functions
   - Missing: fleet dispatch with invalid ship types, ACS fleet merging, return mission handling
   - Uncovered: lines ~1100-1198 (return/ACS logic)

2. **battleService.ts** — 97.75% (near target, minor gaps)
   - Missing: lines 477-493 (moon debris special case), line 1013

### High Priority (P1) — Next Sprint

3. **researchService.ts** — 72.26% lines, 33.33% functions
   - Missing: advanced tech tree validation, research cancellation
   - Uncovered: ~30 functions untested

4. **achievementService.ts** — 71.54% lines, 14.28% functions
   - Only 1 of 7 functions tested
   - Needs: achievement unlock triggers, progress tracking

5. **galaxyService.ts** — 28.15% lines
   - Lowest coverage among active services
   - Missing: galaxy scan, debris field queries, position-based lookups

6. **leaderboardService.ts** — 0% statements (but 100% branch/func — likely export-only)
   - Needs execution tests, not just import

7. **statsService.ts** — 0% statements
   - Functions exported but never called in tests

8. **officerService.ts** — 59.74%
   - Missing: officer bonus calculations, level-up handlers

9. **moonService.ts** — 70.83%
   - moon.test.ts has 4 failing tests (formula mismatch with actual implementation)
   - Needs: test fixtures aligned with actual `calculateMoonChance` formula

### Medium Priority (P2)

10. **coordinateService.ts** — 41.93%
11. **missionService.ts** — 0% (no tests exist)
12. **planetPlacementService.ts** — 0% (no tests exist)

---

## Durable Objects & Infrastructure (0% Coverage)

These require Miniflare/CF Workers environment for testing:
- `PlanetDO.ts` — 876 lines, 0% covered
- `MoonDO.ts` — 471 lines, 0% covered
- `worker/src/index.ts` — 1895 lines (router), 0% covered

**Recommendation**: Set up `@cloudflare/vitest-pool-workers` or Miniflare v3 for DO testing.

---

## Action Items (Priority Order)

| # | Action | Files | Est. Effort |
|---|--------|-------|-------------|
| 1 | Add fleet dispatch/return tests | fleetService.ts | 4h |
| 2 | Fix moon.test.ts formula alignment | moonService.ts | 2h |
| 3 | Add galaxyService tests | galaxyService.ts | 3h |
| 4 | Add achievementService trigger tests | achievementService.ts | 3h |
| 5 | Add researchService function tests | researchService.ts | 4h |
| 6 | Add statsService + leaderboard exec tests | statsService.ts, leaderboardService.ts | 2h |
| 7 | Add missionService tests (0% → 70%) | missionService.ts | 5h |
| 8 | Add planetPlacementService tests | planetPlacementService.ts | 3h |
| 9 | Setup Miniflare for DO tests | PlanetDO.ts, MoonDO.ts | 8h |
| 10 | Add Solana mint mock tests | mint.ts | 4h |

---

## How to Run Coverage Locally

```bash
# Install dependencies
npm install

# Run tests with coverage report
npm run coverage

# Open HTML report
open coverage/index.html

# Run specific file coverage
npx vitest run --coverage worker/src/game/services/battleService.ts
```

## Coverage Files

```
coverage/
├── index.html           # Interactive HTML report
├── coverage-final.json  # Raw JSON coverage data
├── lcov.info           # LCOV format (for CI/SonarQube)
└── lcov-report/        # LCOV HTML report
```

## CI Integration

Add to `.github/workflows/test.yml`:

```yaml
- name: Run Tests with Coverage
  run: npm run coverage

- name: Upload Coverage Report
  uses: actions/upload-artifact@v4
  with:
    name: coverage-report
    path: coverage/

- name: Coverage Check
  run: |
    node -e "
    const cov = require('./coverage/coverage-final.json');
    const files = Object.keys(cov);
    let totalStmt = 0, covStmt = 0;
    files.forEach(f => {
      Object.values(cov[f].s).forEach(v => { totalStmt++; if(v > 0) covStmt++; });
    });
    const pct = (covStmt/totalStmt*100).toFixed(2);
    console.log('Coverage:', pct + '%');
    if (pct < 70) process.exit(1);
    "
```

---

## Known Test Failures (Pre-existing, Not Coverage-Related)

| Test File | Failing Tests | Root Cause |
|-----------|--------------|------------|
| moon.test.ts | 4 tests | `calculateMoonChance` formula in service differs from test assumptions |
| moonBuildings.test.ts | 2 tests | `calculateMoonBuildingBuildTime` minimum floor not applied |
| tournament.test.ts | 2 tests | `db.prepare().bind().run()` mock missing `.run()` method |

These are pre-existing failures unrelated to coverage setup.
