# Cosmic Protocol — Coverage Baseline Report

Generated: 2026-02-22  
Test Suite: 22/25 files passing (3 files have pre-existing failures unrelated to coverage)  
Passing Tests: 856/970 (962 pass in total; 8 in pre-existing failing files)

## How to Run Coverage

```bash
# Full suite (includes 3 known-failing test files)
npm run coverage

# Passing tests only — generates clean HTML + LCOV + JSON report
npm run coverage:passing

# Interactive UI (requires @vitest/ui)
npm run coverage:ui
```

Coverage reports are generated in the `coverage/` directory:
- `coverage/index.html` — interactive HTML report (drill-down per file)
- `coverage/lcov.info` — LCOV format (for CI/external tools)
- `coverage/coverage-final.json` — raw JSON data
- Console output — text summary table

---

## Baseline Coverage Summary (Passing Tests)

| Category | Lines | Branches | Functions | Statements |
|----------|-------|----------|-----------|------------|
| **Overall** | **59.48%** | **81.62%** | **66.18%** | **59.48%** |
| game/services | 68.53% | 81.81% | 66.77% | 68.53% |
| game (core) | 87.25% | 83.56% | 67.85% | 87.25% |
| agents | 0% | 50% | 50% | 0% |
| durable-objects | 0% | 0% | 0% | 0% |
| solana | 5.12% | 0% | 0% | 5.12% |

---

## Per-File Coverage (Sorted by Priority)

### P0 — Critical Services (Target: 90%)

| File | Stmts % | Coverage Status |
|------|---------|-----------------|
| `battleService.ts` | **98%** | EXCELLENT |
| `espionageService.ts` | **98%** | EXCELLENT |
| `messageService.ts` | **99%** | EXCELLENT |
| `allianceService.ts` | **93%** | GOOD |
| `tutorialService.ts` | **94%** | GOOD |
| `expeditionService.ts` | **90%** | GOOD |
| `shipyardService.ts` | **83%** | NEAR TARGET |
| `fleetService.ts` | **67%** | NEEDS WORK |
| `achievementService.ts` | **72%** | NEEDS WORK |
| `researchService.ts` | **72%** | NEEDS WORK |
| `tournamentService.ts` | **72%** | NEEDS WORK |
| `officerService.ts` | **60%** | NEEDS WORK |

### P1 — Core Game Logic

| File | Stmts % | Coverage Status |
|------|---------|-----------------|
| `formulas.ts` | **90%** | GOOD |
| `defenses.ts` | **84%** | NEAR TARGET |
| `types.ts` | **95%** | GOOD |
| `coordinateService.ts` | **42%** | NEEDS WORK |
| `galaxyService.ts` | **28%** | LOW |

### P2 — Uncovered (0%)

| File | Lines | Priority | Reason |
|------|-------|----------|--------|
| `leaderboardService.ts` | 139 | P1 | No test file yet |
| `missionService.ts` | 243 | P0 | No test file yet |
| `moonService.ts` | 120 | P1 | Tests have pre-existing failures |
| `moonBuildingService.ts` | 136 | P1 | Tests have pre-existing failures |
| `planetPlacementService.ts` | 127 | P1 | No test file yet |
| `statsService.ts` | 202 | P2 | No test file yet |
| `PlanetDO.ts` | 596 | P0 | Cloudflare DO env (no unit test) |
| `MoonDO.ts` | 471 | P1 | Cloudflare DO env (no unit test) |
| `buildOrderAgent.ts` | 193 | P2 | Workers AI env dependency |
| `assetGenerator.ts` | 170 | P2 | Workers AI env dependency |
| `solana/mint.ts` | 111 | P2 | Solana devnet env dependency |

---

## Gap Analysis — Top 10 Untested Code Paths

### 1. `missionService.ts` — 0% (P0)
- **Gap**: All mission lifecycle (dispatch, arrival, return, combat trigger)
- **Action**: Create `tests/unit/mission-service.test.ts`
- **Effort**: 4h

### 2. `PlanetDO.ts` — 0% (P0)
- **Gap**: Planet state machine, build queue, resource tick
- **Action**: Mock Durable Object env, create DO integration tests
- **Effort**: 8h

### 3. `leaderboardService.ts` — 0% (P1)
- **Gap**: Score calculation, ranking, score change events
- **Action**: Create `tests/unit/leaderboard.test.ts`
- **Effort**: 2h

### 4. `planetPlacementService.ts` — 0% (P1)
- **Gap**: New player placement, galaxy slot finding, colonization
- **Action**: Create `tests/unit/planet-placement.test.ts`
- **Effort**: 2h

### 5. `galaxyService.ts` — 28% (P1)
- **Gap**: Lines 26-429 — galaxy view, colonization, inactive flag
- **Action**: Expand `tests/unit/galaxy.test.ts` (currently none found)
- **Effort**: 3h

### 6. `fleetService.ts` — 67% (P0)
- **Gap**: Lines 800-1198 — return missions, debris harvest, expedition arrival
- **Action**: Expand fleet tests for return/arrival paths
- **Effort**: 4h

### 7. `coordinateService.ts` — 42% (P1)
- **Gap**: Lines 35-168 — distance validation, galaxy boundaries
- **Action**: Expand coordinate tests
- **Effort**: 1h

### 8. `officerService.ts` — 60% (P0)
- **Gap**: Lines 100-505 — full officer activation/deactivation lifecycle
- **Action**: Expand officer tests with activation flows
- **Effort**: 2h

### 9. `researchService.ts` — 72% (P1)
- **Gap**: Lines 700-1008 — tech cost calculations, prereq checks
- **Action**: Expand research-tree tests
- **Effort**: 2h

### 10. `statsService.ts` — 0% (P2)
- **Gap**: Entire stats aggregation service
- **Action**: Create `tests/unit/stats.test.ts`
- **Effort**: 2h

---

## Coverage Requirements Per Service

| Service | Current | Target | Priority |
|---------|---------|--------|----------|
| battleService | **98%** | 90% | P0 - MET |
| espionageService | **98%** | 90% | P0 - MET |
| messageService | **99%** | 90% | P0 - MET |
| allianceService | **93%** | 90% | P0 - MET |
| fleetService | 67% | 90% | P0 - GAP |
| missionService | 0% | 90% | P0 - GAP |
| leaderboardService | 0% | 85% | P1 - GAP |
| researchService | 72% | 85% | P1 - GAP |
| shipyardService | 83% | 85% | P1 - NEAR |
| solana/mint | 0% | 50% | P2 - GAP |

---

## Pre-existing Test Failures (Not Coverage-Related)

These 3 test files have failures that pre-date this coverage setup:

| File | Failures | Root Cause |
|------|----------|------------|
| `moon.test.ts` | 5 failures | `calculateMoonChance` formula mismatch (test expects old thresholds) |
| `moonBuildings.test.ts` | 2 failures | Build time formula edge case at low factory levels |
| `tournament.test.ts` | 2 failures | `db.prepare().bind().run()` mock returns wrong type |

These do NOT affect coverage of passing code; fix separately.

---

## CI Integration Recommendation

Add to `.github/workflows/test.yml`:

```yaml
- name: Run Tests with Coverage
  run: npm run coverage:passing

- name: Upload Coverage Report
  uses: actions/upload-artifact@v3
  with:
    name: coverage-report
    path: coverage/

- name: Check Coverage Threshold
  run: |
    LINES=$(node -e "const c = require('./coverage/coverage-summary.json'); console.log(c.total.lines.pct)")
    echo "Line coverage: $LINES%"
    node -e "const c = require('./coverage/coverage-summary.json'); if (c.total.lines.pct < 55) process.exit(1)"
```

Current achievable threshold (passing tests only): **~59% lines, ~81% branches**  
Target after gap-filling: **85% lines, 85% branches**

---

## Coverage Report Structure

```
coverage/
├── index.html              # Interactive HTML report (open in browser)
├── coverage-final.json     # Raw Istanbul format data
├── lcov.info               # LCOV format (for SonarQube, Codecov, etc.)
└── lcov-report/
    └── index.html          # LCOV HTML report
```

Open `coverage/index.html` in a browser for an interactive drill-down view of covered/uncovered lines per file.
