# Issue 2: Shared type definitions — coordinate across branches

## Overview

Multiple branches modify `worker/src/game/types.ts`:
- `research-system` adds `TechLevels` interface
- `defense-system` adds `Defense` types
- `fleet-movement` may add `FleetMission` updates
- `galaxy-map` adds `SystemView` types

## Action needed

When merging, carefully resolve `types.ts` conflicts.
Keep all additions, ensure no duplicates.

## Type Definitions to Coordinate

### From defense-system
- Defense structure types
- Defense building costs
- Defense repair mechanics

### From research-system
- TechLevels interface
- Tech tree structure
- Tech bonus calculations

### From fleet-movement
- FleetMission types (may extend)
- Fleet movement state
- Fleet arrival/battle interactions

### From galaxy-map
- SystemView interface
- System colonization types
- Galaxy display data structures

## Merge Strategy
1. Create a unified types file review
2. Check for duplicate definitions
3. Ensure type imports are correct
4. Test compilation after each type merge
5. Update TypeScript in frontend accordingly

## Checklist
- [ ] Review all type additions from each branch
- [ ] Identify conflicts in types.ts
- [ ] Create resolution plan
- [ ] Merge types.ts carefully
- [ ] Verify no duplicate types
- [ ] Test TypeScript compilation
- [ ] Update related imports
