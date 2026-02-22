# QA Report #1 -- Edge-Case Testing (2026-02-22)

**Branch:** `test/qa-random-features`
**Test file:** `tests/unit/qa-edge-cases.test.ts` (58 tests, all passing)
**Features tested:** Espionage, Shipyard, Achievements, Cross-Service Interactions

---

## Bugs Found

### BUG-1: `getShipBuildTime` returns `Infinity` when `universeSpeed` is 0

**Severity:** Medium
**File:** `worker/src/game/services/shipyardService.ts`, line 256
**Reproduction:**
```ts
getShipBuildTime('lightFighter', 1, 0, 0); // returns Infinity
```

**Details:** The build time formula divides by `universeSpeed`. When `universeSpeed` is 0, the denominator is 0, producing `Infinity`. `Math.max(Infinity, 1)` returns `Infinity`, so the function does not crash but returns a nonsensical value. Any downstream code expecting a finite number (e.g., setting alarm timers) will break silently.

**Suggested fix:** Add a guard at the start of the function: `if (universeSpeed <= 0) throw new Error('Universe speed must be positive');` or default to 1.

---

### BUG-2: `getAchievementProgress` does not clamp to 0 for negative stat values

**Severity:** Low (defensive edge case)
**File:** `worker/src/game/services/achievementService.ts`, line 565
**Reproduction:**
```ts
const stats = makeStats({ battlesWon: -10 });
getAchievementProgress('warrior', stats);
// Returns Math.min(100, Math.floor(-10/10 * 100)) = Math.min(100, -100) = -100
```

**Details:** The function uses `Math.min(100, Math.floor((current / threshold) * 100))` but never clamps the lower bound to 0. If a stat counter is somehow negative (data corruption, bug elsewhere), progress becomes negative. While stats should never be negative in normal gameplay, this violates the documented 0-100 range.

**Suggested fix:** Change to `Math.min(100, Math.max(0, Math.floor((current / threshold) * 100)))`.

---

### BUG-3: `validateMission` allows fractional probe counts

**Severity:** Low
**File:** `worker/src/game/services/espionageService.ts`, line 799
**Reproduction:**
```ts
svc.validateMission(0.5, ships); // returns null (valid)
svc.validateMission(1.7, ships); // returns null (valid)
```

**Details:** The validation checks `probeCount <= 0` and `probeCount > 50` but does not enforce that `probeCount` is an integer. Sending 0.5 probes or 2.7 probes would pass validation. Downstream code uses `probeCount` in calculations like `(probeCount - 1) * 2`, which produces fractional spy level differences. While TypeScript types declare `number`, runtime values could be fractional from API input.

**Suggested fix:** Add `if (!Number.isInteger(probeCount)) return 'Probe count must be a whole number';`

---

## Design Issues

### DESIGN-1: Duplicate achievement requirements (millionaire and raider)

**File:** `worker/src/game/services/achievementService.ts`
**Details:** Both `millionaire` (economy category, 100pts) and `raider` (combat category, 150pts) use the same requirement: `resources_raided >= 1,000,000`. They will always unlock simultaneously, which feels unintentional. The `millionaire` description says "Raid or produce" but the actual check only counts `resourcesRaided`.

**Suggestion:** Either differentiate the thresholds or create a separate stat for total resource production.

---

### DESIGN-2: `speed_demon` achievement does not track hourly rate

**File:** `worker/src/game/services/achievementService.ts`
**Details:** The `speed_demon` achievement description says "Build 10 buildings in a single hour" but its requirement is `buildings_built:10`, which is a lifetime counter. A player who builds 10 buildings over 30 days would still unlock it. The `miner` achievement also uses `buildings_built:10`, making them duplicates by a different name.

**Suggestion:** Either implement time-windowed tracking for speed_demon or change its requirement to a higher threshold.

---

### DESIGN-3: Special category lacks introductory achievement

**Details:** Every other category (combat, economy, exploration, social) has at least one "first action" achievement with threshold 1. The `special` category's lowest threshold is 7 (veteran: play 7 days). New players have no early unlock in this category.

**Suggestion:** Add a threshold-1 achievement to special, e.g., "First AI Decision" (agent_decisions:1).

---

## Missing Test Coverage Areas

### 1. Espionage + Battle interaction
No tests verify what happens when an espionage mission arrives at a planet that is mid-battle. The `processEspionageMission` method calls `processCounterEspionage` which uses `Math.random()`, making counter-espionage inherently non-deterministic. Tests for the deterministic paths (0% and 100% detection) exist, but the probabilistic middle ground (e.g., 50% detection) has no statistical coverage (running N trials and checking the distribution).

### 2. Shipyard queue with buildTimePer = 0
The `processShipyardQueue` function divides `elapsedSec / order.buildTimePer`. If `buildTimePer` is 0 (e.g., from a modded universe speed), this would produce `Infinity` completed units, potentially corrupting ship counts.

### 3. Alliance + Message interaction
No tests verify that `sendAllianceMessage` correctly excludes the sender when the sender's `alliance_tag` matches the alliance. The function queries `players WHERE alliance_tag = ? AND id != ?`, but if the player's alliance_tag was not updated (e.g., on join), the broadcast would miss them or double-send.

### 4. Leaderboard with tied scores
The `getLeaderboard` function sorts by score descending but does not break ties deterministically. Two players with identical scores could swap positions between calls.

### 5. Stats service negative delta
The `updateStats` function filters `u.delta > 0` to skip zero-delta updates, but does not guard against negative deltas. A negative `ships_destroyed` count could be injected.

---

## Feature Interaction Gaps

| Interaction | Status | Notes |
|---|---|---|
| Espionage during active battle | Not tested | Report may show stale ship counts |
| Shipyard queue + espionage report | Tested (QA) | Report correctly shows current ships, not queued |
| Build order + battle | Tested (QA) | Queue must be processed before battle to add completed ships |
| IPM attack + defense repair | Not tested | Repair runs after battle but IPM attack is separate codepath |
| Alliance dissolve + leaderboard | Not tested | Alliance tag nullification may affect leaderboard display |
| Achievement check after stats update | Not tested end-to-end | Pure function tests exist but no integration with D1 |

---

## Test Summary

| Test File | Tests | Status |
|---|---|---|
| `formulas.test.ts` | 16 | Pass |
| `battle.test.ts` | 8 | Pass |
| `espionage.test.ts` | 67 | Pass |
| `shipyard.test.ts` | 42 | Pass |
| `alliance.test.ts` | 46 | Pass |
| `messages.test.ts` | 40 | Pass |
| `achievements.test.ts` | 53 | Pass |
| `integration.test.ts` | 50 | Pass |
| **`qa-edge-cases.test.ts`** | **58** | **Pass** |
| **Total** | **380** | **All passing** |
