# QA Cross-Feature Compatibility Report

**Date:** 2026-02-22
**Branch:** `test/qa-compatibility`
**Test file:** `tests/unit/qa-compatibility.test.ts` (84 tests, all passing)

---

## Compatibility Matrix

| Feature A         | Feature B           | Status     | Notes                                              |
|-------------------|---------------------|------------|----------------------------------------------------|
| Shipyard          | Battle Engine       | PASS       | All 13 ship types, costs, and specs match           |
| Fleet Service     | Battle Engine       | PASS*      | Works with cargo-capable fleets; see Issue #1       |
| Espionage         | Battle Engine       | PASS       | Report fleet/defense types match battle inputs      |
| Research          | Battle Engine       | PASS       | Tech multipliers consistent (1 + level * 0.1)      |
| Research          | Shipyard            | PASS       | Tech prerequisites reference valid research IDs     |
| Defense           | Battle Engine       | PASS       | Stats/specs match; debris only from ships           |
| Defense           | Missile System      | PASS       | IPM/ABM interaction correct                         |
| Achievement       | Stats               | PASS*      | Type shapes differ; see Issue #3                    |
| Stats             | Leaderboard         | PASS       | Event types cover all game actions                  |
| Fleet             | Espionage           | PASS*      | Validation order issue; see Issue #2                |
| Fleet             | Colonization        | PASS       | Colony ship consumed on success                     |
| Fleet             | Transport/Deploy    | PASS       | Resources delivered, deploy has no return            |
| Fleet             | Harvest (Debris)    | PASS       | Recycler cargo caps debris collection               |
| Message           | Battle/Espionage    | PASS       | Message types cover combat/espionage reports        |
| Leaderboard       | Alliance            | PASS       | allianceTag field present, nullable                  |
| NFT/Solana        | Player Profile      | PASS       | Asset types valid, metadata well-formed              |
| Formulas          | Shipyard            | PASS       | Build time formulas consistent                       |
| Formulas          | Fleet Service       | PASS       | Distance/duration/fuel symmetric and non-negative    |
| Battle            | Debris -> Harvest   | PASS       | Full chain: battle -> debris -> recycler collection  |

---

## Issues Found

### Issue #1: Fleet Cargo vs Fuel — Attack Missions Cannot Use Pure Fighter Fleets

**Severity:** Medium
**Services:** FleetService, Formulas

**Description:**
`FleetService.planMission()` checks that `resources + fuel <= cargoCapacity`. Light fighters have only 50 cargo each. A fleet of 10 light fighters has 500 total cargo, but fuel for even a same-system trip (distance ~1005) exceeds this. The result is that a pure light-fighter attack fleet is rejected before dispatch.

In canonical OGame, fuel is deducted from the planet's deuterium stockpile, **not** from the fleet's cargo hold. The cargo check should only apply to resources being transported, not fuel.

**Affected Code:**
- `worker/src/game/services/fleetService.ts`, `planMission()` lines ~252-259

**Recommended Fix:**
Change the cargo check from:
```ts
const totalNeeded = totalResources + fuelRequired;
if (totalNeeded > cargoCapacity) { ... }
```
To:
```ts
if (totalResources > cargoCapacity) { ... }
```
Fuel should be deducted from planet deuterium independently of cargo capacity.

---

### Issue #2: Fleet Validation — Duplicate/Unreachable Ship-Type Checks

**Severity:** Low
**Services:** FleetService

**Description:**
`validateDispatch()` has two layers of ship-type validation:
1. Step 5: `meetsRequirements(ships, missionType)` — generic check using `getMinimumShipsForMission()`
2. Steps 9-10: Specific checks for espionage probes and recyclers

When step 5 fails, it produces a generic message like "Missing required ships for espionage mission" instead of the more specific "Espionage requires at least 1 espionage probe" from step 9. Steps 9 and 10 are unreachable when the same condition already fails at step 5.

**Affected Code:**
- `worker/src/game/services/fleetService.ts`, `validateDispatch()` lines ~312-343

**Recommended Fix:**
Remove steps 9 and 10 since they duplicate step 5, or improve step 5's error message to include the specific missing ship type. Example:
```ts
if (!this.meetsRequirements(ships, missionType)) {
  const required = this.getMinimumShipsForMission(missionType);
  const missing = Object.entries(required)
    .filter(([k, v]) => ships[k as keyof Ships] < v)
    .map(([k]) => k);
  return { valid: false, reason: `Missing required ships: ${missing.join(', ')}` };
}
```

---

### Issue #3: Stats Service vs Achievement Service — `resourcesRaided` Type Mismatch

**Severity:** Medium
**Services:** StatsService, AchievementService

**Description:**
`StatsService.PlayerStats.resourcesRaided` is an object:
```ts
resourcesRaided: { metal: number; crystal: number; deuterium: number }
```

`AchievementService.AggregatedPlayerStats.resourcesRaided` is a single number:
```ts
resourcesRaided: number // total metal + crystal + deuterium raided
```

The `getPlayerStats()` function in `achievementService.ts` performs the summation at query time (lines 506-509), so the two services work correctly in isolation. However, any integration code that passes `StatsService.PlayerStats` directly to `getAchievementProgress()` would fail at runtime because the types are incompatible.

**Affected Code:**
- `worker/src/game/services/statsService.ts` — `PlayerStats` interface
- `worker/src/game/services/achievementService.ts` — `AggregatedPlayerStats` interface

**Recommended Fix:**
Create a shared adapter function:
```ts
function toAggregatedStats(stats: PlayerStats): AggregatedPlayerStats {
  return {
    ...stats,
    resourcesRaided: stats.resourcesRaided.metal
      + stats.resourcesRaided.crystal
      + stats.resourcesRaided.deuterium,
    espionageSent: stats.espionageReportsSent,
    allianceJoined: false, // needs separate query
    deathstarsBuilt: 0,    // needs separate query
    playTimeDays: stats.playTimeDays,
  };
}
```

---

### Issue #4: `getMinimumShipsForMission('attack')` Requires `lightFighter`

**Severity:** Low
**Services:** FleetService

**Description:**
`getMinimumShipsForMission('attack')` returns `{ lightFighter: 1 }`, meaning an attack fleet of only cruisers, battleships, or deathstars would fail validation. In OGame, any combat-capable ship can be sent on an attack mission.

**Affected Code:**
- `worker/src/game/services/fleetService.ts`, `getMinimumShipsForMission()`

**Recommended Fix:**
For attack missions, the requirement should be "at least 1 combat-capable ship" rather than specifically `lightFighter: 1`. Implement a `hasCombatShips(ships)` check instead:
```ts
case 'attack':
  return {}; // Any ship can attack; or check hasCombatShips()
```

---

### Issue #5: No Automated Stats/Achievement Update After Battle

**Severity:** Medium
**Services:** FleetService, StatsService, AchievementService, MessageService

**Description:**
After a battle resolves in `processFleetArrival()`, there is no automated call to:
1. `statsService.updateStats()` for battle_win/loss/draw, ships_destroyed, resources_raided
2. `achievementService.checkAchievements()` for unlocking combat achievements
3. `messageService.sendSystemMessage()` for battle report delivery

Each of these requires a D1 database binding, which `processFleetArrival()` does not receive. The fleet service returns battle results as data, but the orchestration layer (API route or cron handler) must manually wire up these calls.

**Recommended Fix:**
Create an orchestration function in a new `combatOrchestrator.ts`:
```ts
async function processAttackResult(result, attackerId, defenderId, db) {
  // 1. Update stats for both players
  await statsService.updateStats(attackerId, result.winner === 'attacker' ? 'battle_win' : 'battle_loss', {}, db);
  await statsService.updateStats(defenderId, result.winner === 'defender' ? 'battle_win' : 'battle_loss', {}, db);

  // 2. Check achievements
  const attackerStats = await achievementService.getPlayerStats(attackerId, db);
  await achievementService.checkAchievements(attackerId, attackerStats, db);

  // 3. Send battle report messages
  await messageService.sendSystemMessage(attackerId, 'Battle Report', JSON.stringify(result), db, 'combat_report');
  await messageService.sendSystemMessage(defenderId, 'Battle Report', JSON.stringify(result), db, 'combat_report');
}
```

---

### Issue #6: Espionage Service `resourcesRaided` Stat Not Updated

**Severity:** Low
**Services:** EspionageService, StatsService

**Description:**
After a successful espionage mission, `statsService.updateStats(playerId, 'espionage_sent', { count: probeCount }, db)` should be called. This is not done automatically. The `espionage_reports` achievement requirement in `achievementService.ts` checks `espionageSent`, which would remain 0.

---

## Test Coverage Summary

| Test Group                               | Tests | Status |
|------------------------------------------|-------|--------|
| Shipyard -> Battle: Ship Specs           | 6     | PASS   |
| Fleet -> Battle: Attack Mission Flow     | 3     | PASS   |
| Espionage -> Battle: Intel Pipeline      | 4     | PASS   |
| Research -> Battle: Tech Bonuses         | 5     | PASS   |
| Defense -> Battle: Stats Consistency     | 5     | PASS   |
| Achievement -> Stats: Type Alignment     | 8     | PASS   |
| Stats -> Leaderboard: Event Coverage     | 2     | PASS   |
| Fleet -> Espionage: Mission Integration  | 4     | PASS   |
| Battle -> Debris -> Harvest: Full Chain  | 1     | PASS   |
| Message Service: Type Compatibility      | 3     | PASS   |
| Shipyard Build Time vs Formulas          | 2     | PASS   |
| NFT Assets: Type Validation              | 4     | PASS   |
| Research -> Shipyard: Tech Prerequisites | 4     | PASS   |
| Formula Consistency                      | 7     | PASS   |
| Fleet Return: Resource Repatriation     | 1     | PASS   |
| Espionage: Mission Validation            | 4     | PASS   |
| Research -> Formulas: Cost Consistency   | 2     | PASS   |
| Defense Missile System                   | 2     | PASS   |
| Full Combat Pipeline: E2E Data Flow     | 3     | PASS   |
| Leaderboard -> Alliance                 | 2     | PASS   |
| Cross-Service Type Consistency           | 5     | PASS   |
| Espionage -> Fleet: Counter-Espionage   | 3     | PASS   |
| Transport & Deploy                       | 2     | PASS   |
| Colonization                            | 2     | PASS   |
| **TOTAL**                                | **84**| **ALL PASS** |

---

## Conclusion

The 9 independently-built features are broadly compatible. All shared types (`Ships`, `Resources`, `Coordinate`, `TechLevels`, `DefenseStructures`) are consistent across services. Battle formulas, tech multipliers, and ship specs match between services.

The 6 issues identified are integration-layer gaps rather than fundamental incompatibilities:
- **Issue #1** (cargo vs fuel) is the most impactful, as it prevents pure-fighter attack fleets
- **Issue #3** (resourcesRaided type mismatch) needs an adapter for stats-to-achievement conversion
- **Issue #5** (no automated post-battle orchestration) is the most important architectural gap

None of these issues cause data corruption or runtime crashes; they are missing wiring that needs to be added in the orchestration layer.
