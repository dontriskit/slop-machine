# Issue 1: Merge order & dependency graph for feature branches

## Feature Branch Dependency Graph

```
                    master
                      │
        ┌─────────────┼─────────────────┐
        │             │                  │
  battle-engine  defense-system   research-system
        │             │                  │
        └──────┬──────┘                  │
               │                         │
         fleet-movement                  │
               │                         │
               └────────┬───────────────┘
                        │
                   galaxy-map
                        │
                  frontend-wiring
```

## Recommended Merge Order:
1. `feat/defense-system` (no deps)
2. `feat/research-system` (no deps)
3. `feat/battle-engine` (needs defense types)
4. `feat/fleet-movement` (needs battle engine)
5. `feat/galaxy-map` (needs fleet for colonization)
6. `feat/frontend-wiring` (needs all backend)

## Checklist:
- [ ] defense-system merged
- [ ] research-system merged
- [ ] battle-engine merged
- [ ] fleet-movement merged
- [ ] galaxy-map merged
- [ ] frontend-wiring merged
- [ ] All conflicts resolved
- [ ] Integration test passed
