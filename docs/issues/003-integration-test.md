# Issue 3: Integration test plan — post-merge verification

## Overview

After all branches merged, verify that all systems work together correctly.

## Integration Tests

### 1. Battle System
- [ ] simulateBattle() with ships + defenses + tech bonuses
- [ ] Verify battle calculations
- [ ] Check defender advantage (70% repair)
- [ ] Verify tech bonuses apply correctly

### 2. Fleet Movement
- [ ] dispatch → travel → arrive → battle → return
- [ ] Verify fleet state transitions
- [ ] Check travel time calculations
- [ ] Verify battle triggers on arrival

### 3. Defense System
- [ ] Build defenses
- [ ] Verify defender bonus in battle
- [ ] Verify repair after battle (70%)
- [ ] Check repair mechanics

### 4. Research System
- [ ] Start research
- [ ] Complete research
- [ ] Verify tech bonuses apply
- [ ] Check tech effects on building/battle

### 5. Galaxy Map
- [ ] View system with colonization data
- [ ] Colonize empty slot
- [ ] View alliance territory
- [ ] Verify system visibility rules

### 6. Frontend
- [ ] All API calls work
- [ ] Resources update live
- [ ] Battle results display correctly
- [ ] Galaxy map renders properly

## Manual Test Sequence

1. **Create player + planet via API**
   - [ ] Player created
   - [ ] Planet spawned
   - [ ] Initial resources set

2. **Build Metal Mine to level 5**
   - [ ] Building placed
   - [ ] Level increments
   - [ ] Resource costs deducted
   - [ ] Production increases

3. **Build Research Lab to level 3**
   - [ ] Building placed
   - [ ] Level increments
   - [ ] Research becomes available

4. **Research Energy Tech to level 2**
   - [ ] Research starts
   - [ ] Progress bar shows
   - [ ] Research completes
   - [ ] Tech bonus applies (e.g., Probe range +20%)

5. **Build defenses (10 Rocket Launchers)**
   - [ ] Defenses placed
   - [ ] Costs deducted
   - [ ] Defender bonus calculated

6. **View galaxy map**
   - [ ] All systems visible
   - [ ] Player's planet marked
   - [ ] NPC planets visible
   - [ ] Colonizable slots shown

7. **Send fleet to attack NPC**
   - [ ] Fleet created and dispatched
   - [ ] Fleet shows in transit
   - [ ] Fleet arrives at target
   - [ ] Battle initiates

8. **Verify battle result + debris**
   - [ ] Battle calculated correctly
   - [ ] Defender bonuses applied
   - [ ] Tech bonuses applied
   - [ ] Debris field created
   - [ ] Defenses repaired (70%)

9. **Enable AI agent, verify auto-build**
   - [ ] AI enabled
   - [ ] Auto-build triggers
   - [ ] Buildings queue correctly
   - [ ] Resources allocated properly

## Acceptance Criteria
- [ ] All tests pass without errors
- [ ] No TypeScript compilation errors
- [ ] All API endpoints respond correctly
- [ ] Frontend displays all data correctly
- [ ] No race conditions in async operations
