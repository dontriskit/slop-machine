# Contributing to Cosmic Protocol

Welcome to the Cosmic Protocol project! This document outlines the guidelines for contributing to this project.

## Branch Naming Convention

All branches should follow this naming convention:

```
<type>/<description>

Examples:
- feat/battle-engine
- fix/fleet-movement-bug
- docs/setup-guide
- chore/update-deps
```

### Valid Branch Types:
- `feat/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation updates
- `chore/` - Maintenance, dependency updates, refactoring
- `test/` - Test additions or improvements

## Commit Message Conventions

Commits should follow the Conventional Commits format:

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Commit Types:
- `feat:` - A new feature
- `fix:` - A bug fix
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, semicolons, etc.)
- `refactor:` - Code refactoring without feature changes
- `perf:` - Performance improvements
- `test:` - Adding or updating tests
- `chore:` - Maintenance, dependency updates

### Examples:
```
feat(battle): implement damage calculation with tech bonuses

- Add tech bonus multipliers
- Update battle simulation
- Add unit tests

Closes #123
```

```
fix(fleet): correct arrival time calculation

The previous calculation did not account for variable speeds.

Fixes #456
```

## Pull Request Format

When creating a pull request, use this template:

```markdown
## Description
Brief description of changes.

## Type
- [ ] feat (new feature)
- [ ] fix (bug fix)
- [ ] docs (documentation)
- [ ] refactor (code refactoring)
- [ ] test (test addition)

## Related Issues
Closes #123

## Changes Made
- Change 1
- Change 2
- Change 3

## Testing
How to test these changes:
1. Step 1
2. Step 2

## Checklist
- [ ] Code follows project style
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] No breaking changes (or documented)
```

## Progress Updates

Each contributor/agent working on a feature branch MUST provide progress updates by commenting on their PR.

### Comment Template
```markdown
## Progress Update - [Date]

**Status:** [In Progress / Ready for Review / Blocked]

**Completed:**
- [ ] Task 1
- [ ] Task 2

**In Progress:**
- [ ] Task 3

**Blockers:**
- Waiting for X

**Next Steps:**
- Do Y
- Do Z

**Dependencies:**
- Needs #XYZ merged first
```

### When to Comment:
- Initial comment when PR is created (status: starting)
- Daily updates while actively developing
- When blocked or encountering issues
- Before requesting review (status: ready for review)
- After incorporating feedback

## Code Style

### TypeScript
- Use `const` by default, `let` when necessary
- Use arrow functions for callbacks
- Use interfaces for type definitions
- No implicit `any` types
- Use meaningful variable names

### Project Structure
```
worker/
├── src/
│   ├── game/
│   │   ├── types.ts         (shared type definitions)
│   │   ├── battle.ts        (battle simulation)
│   │   ├── defense.ts       (defense system)
│   │   ├── research.ts      (research system)
│   │   ├── fleet.ts         (fleet management)
│   │   └── galaxy.ts        (galaxy map)
│   └── api/
│       └── routes.ts        (API endpoints)
└── tests/
    └── integration.test.ts  (integration tests)
```

## Testing Requirements

- Unit tests for new functions
- Integration tests for feature interactions
- All tests must pass before merging
- Aim for >80% code coverage

Run tests with:
```bash
uv run pytest
# or
npm test
```

## Multi-Agent Parallel Development

We use **git worktrees** for parallel feature development. Each agent works on an isolated copy of the repo.

### Agent Tiers
- **Opus** — Complex systems (battle, fleet, Solana, shipyard)
- **Sonnet** — Services and UI (alliance, marketplace, achievements)
- **Coordinator** — Merges, conflict resolution, test verification

### Merge Protocol
1. Agent completes work and commits on its feature branch
2. Coordinator verifies: `npx tsc --noEmit` + `npx vitest run` + `npx vite build`
3. Merge to master with descriptive commit (emoji prefix)
4. Resolve conflicts in predictable files: `index.ts` (routes), `schema.sql` (tables), `services/index.ts` (exports)
5. All new features are **additive** — no breaking changes

### Conflict Zones
| File | Why | Resolution |
|------|-----|------------|
| `worker/src/index.ts` | Every feature adds API routes | Combine route blocks |
| `worker/src/db/schema.sql` | Every feature adds tables | Keep all (additive) |
| `worker/src/game/services/index.ts` | Barrel exports | Combine exports |
| `frontend/src/App.tsx` | UI features add components | Combine imports + JSX |

### Merge Criteria
- [ ] TypeScript compiles (`npx tsc --noEmit` in worker/)
- [ ] Unit tests pass (`npx vitest run`)
- [ ] Frontend builds (`cd frontend && npx vite build`)
- [ ] No breaking changes to existing features
- [ ] Descriptive commit message with scope

## Type Definition Coordination

When adding types to `worker/src/game/types.ts`:
1. Check if the type already exists
2. Use interfaces for object shapes
3. Export from `worker/src/game/index.ts` barrel
4. Run `npx tsc --noEmit` to verify

## Questions or Issues?

- Check existing issues in `/docs/issues/`
- Review PR discussions for context
- Ask in PR comments
- Contact project maintainers

## Code of Conduct

- Be respectful and constructive
- Provide clear feedback with reasoning
- Acknowledge contributions
- Help others succeed

Thank you for contributing to Cosmic Protocol!
