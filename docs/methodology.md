# Cosmic Protocol — Development Methodology

## Multi-Agent Parallel Development with Git Worktrees

### Overview

This project uses a **multi-agent parallel development** methodology where multiple AI agents
work simultaneously on different features, each in an isolated git worktree. Agents coordinate
through GitHub-native mechanisms: commits, PRs, issues, and comments.

### Architecture

```
                         ┌─────────────────────────┐
                         │       MASTER REPO        │
                         │  /home/mhm/Documents/    │
                         │       og-game/           │
                         └────────────┬────────────┘
                                      │
         ┌────────────────────────────┼────────────────────────────┐
         │                            │                            │
    ┌────▼─────┐              ┌──────▼──────┐              ┌─────▼──────┐
    │  TIER 1  │              │   TIER 2    │              │   TIER 3   │
    │ Opus 4.6 │              │ Sonnet 4.6  │              │ Haiku 4.5  │
    │ (Heavy)  │              │ (Medium)    │              │ (Fast)     │
    └────┬─────┘              └──────┬──────┘              └─────┬──────┘
         │                           │                           │
    ┌────┴────┐              ┌──────┴──────┐              ┌─────┴──────┐
    │ Battle  │              │  Research   │              │    PR      │
    │ Engine  │              │  Tech Tree  │              │ Coordinator│
    ├─────────┤              ├─────────────┤              ├────────────┤
    │ Fleet   │              │  Galaxy     │              │   Issue    │
    │Movement │              │  Map        │              │  Tracker   │
    ├─────────┤              └─────────────┘              └────────────┘
    │Frontend │
    │ Wiring  │
    ├─────────┤
    │Defense  │
    │ System  │
    └─────────┘
```

### Model Tier Strategy

| Tier | Model | Use Case | Strengths |
|------|-------|----------|-----------|
| **Tier 1** | Opus 4.6 | Core game systems, complex logic | Deep reasoning, large codebases, architecture |
| **Tier 2** | Sonnet 4.6 | Feature modules, UI components | Fast + capable, good for medium tasks |
| **Tier 3** | Haiku 4.5 | Coordination, docs, issues, PRs | Fastest, cheapest, great for meta-work |

### Git Worktree Setup

Each agent works in a **separate git worktree** — an isolated copy of the repo with its own branch:

```bash
# Create worktrees (one per feature)
git worktree add ../og-game-battle   -b feat/battle-engine
git worktree add ../og-game-fleet    -b feat/fleet-movement
git worktree add ../og-game-frontend -b feat/frontend-wiring
git worktree add ../og-game-defense  -b feat/defense-system
git worktree add ../og-game-research -b feat/research-system
git worktree add ../og-game-galaxy   -b feat/galaxy-map

# List all worktrees
git worktree list

# Clean up after merge
git worktree remove ../og-game-battle
```

**Why worktrees, not branches alone?**
- Each agent has a **full working directory** — no checkout conflicts
- Agents can run simultaneously without file locks
- Each worktree is a real filesystem path — agents operate independently
- No merge conflicts during development, only at merge time

### Agent Lifecycle

```
1. SPAWN
   └── Create worktree + branch
   └── Launch agent with detailed prompt
   └── Agent reads existing code first

2. IMPLEMENT
   └── Agent reads types, formulas, patterns docs
   └── Writes implementation
   └── Runs type checks (if available)
   └── Commits to feature branch

3. COORDINATE
   └── PR coordinator creates PR with description
   └── Issue tracker documents dependencies
   └── Cross-references between PRs noted

4. MERGE
   └── Follow dependency order (see below)
   └── Resolve type conflicts in shared files
   └── Run integration tests
   └── Commit merge to master
```

### Dependency Graph & Merge Order

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

**Merge order:**
1. `feat/defense-system` — no dependencies
2. `feat/research-system` — no dependencies
3. `feat/battle-engine` — needs defense types
4. `feat/fleet-movement` — needs battle engine for attack missions
5. `feat/galaxy-map` — needs fleet for colonization
6. `feat/frontend-wiring` — needs all backend PRs

### Communication Protocol

Agents communicate **exclusively** through git-native mechanisms:

| Mechanism | Purpose | Example |
|-----------|---------|---------|
| **Commits** | Record work done | `feat: implement 6-round battle loop` |
| **Commit messages** | Explain decisions | Body explains formula choices |
| **PR descriptions** | Summarize feature | Key files, formulas, test plan |
| **PR comments** | Cross-reference | "Depends on #3 for Defense types" |
| **Issues** | Track tasks & deps | Dependency graph, merge order |
| **CONTRIBUTING.md** | Standards | Branch naming, commit format |

### Commit Convention

```
feat:   New feature (feat: implement battle engine)
fix:    Bug fix (fix: correct shield absorption overflow)
docs:   Documentation (docs: add merge order issue)
chore:  Maintenance (chore: update dependencies)
test:   Tests (test: add battle simulation unit tests)
refactor: Code restructure (refactor: extract damage calc)
```

### Prompt Engineering for Agents

Each agent prompt follows this structure:

```
1. CONTEXT — Where am I? (worktree path, branch name)
2. TASK — What to implement (clear, specific)
3. READ FIRST — Which files to read before writing
4. REQUIREMENTS — Numbered list of features with formulas
5. TYPES — Expected TypeScript interfaces
6. EXPORTS — What functions to export
7. COMMIT — Instructions to commit when done
```

**Key principles:**
- Always tell agents to **read existing code first**
- Provide **exact formulas** (don't let agents guess)
- Specify **export signatures** (ensures compatibility)
- Include **file paths** (no ambiguity)

### Scaling Strategy

```
Small project (1-3 features):
  → 1-2 Opus agents, no worktrees needed

Medium project (4-6 features):
  → 2-4 Opus agents on worktrees
  → 1 Haiku coordinator

Large project (7+ features):
  → 4 Opus agents (core systems)
  → 2 Sonnet agents (modules)
  → 2 Haiku agents (coordination)
  → Full worktree isolation
  → Dependency graph mandatory
```

### Cost Optimization

| Task Type | Model | Why |
|-----------|-------|-----|
| Battle engine (complex math) | Opus | Needs deep reasoning |
| Tech tree (structured data) | Sonnet | Pattern-based, medium complexity |
| PR descriptions | Haiku | Fast, template-based |
| Issue tracking | Haiku | Fast, organizational |
| Galaxy UI component | Sonnet | UI is medium complexity |
| Frontend API wiring | Opus | Needs to understand full stack |

**Rule of thumb:** Use the cheapest model that can handle the task correctly.

### Conflict Resolution

When merging branches that modify the same file (e.g., `types.ts`):

1. **Additive changes** — Both branches add new types → keep all additions
2. **Contradictory changes** — Different implementations of same function → pick the one from the branch that "owns" that domain
3. **Import conflicts** — Different imports added → union of all imports
4. **Test both** — After merge, verify types compile: `npx tsc --noEmit`

### Session Continuity

This methodology supports **context window limits**:

- Each agent runs independently (no shared context needed)
- Work is persisted in git (survives session crashes)
- Prompts contain all necessary context (self-contained)
- `/compact` can be used to summarize and continue
- Agent IDs can be resumed if needed

### Results from First Run (2026-02-22)

**8 agents launched simultaneously:**

| Agent | Model | Task | Duration | Lines |
|-------|-------|------|----------|-------|
| Battle Engine | Opus 4.6 | 6-round combat sim | ~5 min | ~1000 |
| Fleet Movement | Opus 4.6 | Mission lifecycle | ~6 min | ~800 |
| Frontend→API | Opus 4.6 | API client + stores | ~7 min | ~600 |
| Defense System | Opus 4.6 | All defense types | ~5 min | ~700 |
| Research/Tech | Sonnet 4.6 | Full tech tree | ~4 min | ~500 |
| Galaxy Map | Sonnet 4.6 | Backend + UI | ~5 min | ~600 |
| PR Coordinator | Haiku 4.5 | 6 PRs created | ~1 min | ~200 |
| Issue Tracker | Haiku 4.5 | 4 issues + CONTRIBUTING | ~1 min | ~300 |

**Total: ~4,700 lines of code in ~7 minutes of wall-clock time.**

### Prerequisites

- `git` with worktree support (2.5+)
- Claude Code CLI with multi-model access
- Project with clean git state (committed before spawning agents)
- `docs/patterns.md` as shared knowledge base (agents read this)

### Quick Start

```bash
# 1. Ensure clean state
git status  # Should be clean

# 2. Create worktrees
git worktree add ../project-feature-a -b feat/feature-a
git worktree add ../project-feature-b -b feat/feature-b

# 3. Launch agents (in Claude Code)
# Use Task tool with run_in_background=true
# Each agent gets: worktree path, branch, detailed prompt

# 4. Monitor progress
git worktree list
# Check agent output files

# 5. Merge in dependency order
cd main-repo
git merge feat/feature-a  # (no deps first)
git merge feat/feature-b  # (deps resolved)

# 6. Clean up
git worktree remove ../project-feature-a
git worktree remove ../project-feature-b
```

---

**Methodology version:** 1.0.0
**Created:** 2026-02-22
**Author:** Cosmic Protocol Team + Claude Code Multi-Agent System
