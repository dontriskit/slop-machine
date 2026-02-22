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

## Feature Branch Dependencies

See `/docs/issues/001-merge-order.md` for the complete dependency graph.

**Merge Order:**
1. `feat/defense-system`
2. `feat/research-system`
3. `feat/battle-engine`
4. `feat/fleet-movement`
5. `feat/galaxy-map`
6. `feat/frontend-wiring`

## Type Definition Coordination

Multiple branches modify `worker/src/game/types.ts`. See `/docs/issues/002-shared-types.md` for coordination details.

**Important:** When adding types to `types.ts`:
1. Check if the type already exists in other branches
2. Comment your type definitions
3. Update related imports
4. Test TypeScript compilation

## Integration Testing

After all features are merged, follow the integration test plan in `/docs/issues/003-integration-test.md`.

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
