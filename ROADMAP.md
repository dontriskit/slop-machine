# Cosmic Protocol — 100-Agent Development Roadmap v1.0

> **This is a live 24/7 MMORPG.** Player availability is the #1 priority across all phases. No feature ships if it breaks gameplay. Every phase must leave the game in a playable state.

**Status:** Active | **Last Updated:** 2026-02-22 | **Master Issue:** [#51](https://github.com/dontriskit/slop-machine/issues/51)

This roadmap organizes 100 agents across 10 strategic phases to complete **Cosmic Protocol** — a persistent online OGame-inspired MMORPG with autonomous AI agents and Web3 integration.

---

## Vision

Build a complete, always-online OGame-inspired MMORPG with:
- **Core Gameplay:** Resource management, building, research, combat, economy
- **Social Features:** Alliances, messaging, leaderboards, tournaments
- **AI Layer:** Autonomous fleets, research planning, defense optimization
- **Web3:** Solana cNFT assets, token-gated features, on-chain leaderboards
- **Federation:** Multi-server support with cross-universe fleet diplomacy

---

## Phase 1: Core Fixes & Stability (Agents 1–10)
**Duration:** 2–3 weeks | **Model Mix:** 5 Opus, 3 Sonnet, 2 Haiku

### Overview
Establish a clean, stable baseline by fixing TypeScript errors, flaky tests, and missing API endpoints.

### Tasks
- [ ] Fix all tsc errors across worker, frontend, and test suites
- [ ] Resolve flaky battle tech bonus test (#16)
- [ ] Implement missing API endpoints for game services
- [ ] Type safety audit (null safety, strict generics)
- [ ] Test coverage for production cost formulas (#37)
- [ ] Rate limiting + request validation middleware
- [ ] Error boundary improvements in React components
- [ ] Logging setup (Sentry/Datadog integration)
- [ ] Database query optimization + N+1 prevention
- [ ] Code cleanup + remove commented code

### Dependencies
None (foundational phase)

### Success Criteria
- `npx tsc --noEmit` ✓ (0 errors)
- `npm test` ✓ (95%+ passing)
- All API endpoints documented in OpenAPI

---

## Phase 2: Gameplay Completion (Agents 11–20)
**Duration:** 3–4 weeks | **Model Mix:** 6 Opus, 3 Sonnet, 1 Haiku

### Overview
Implement core OGame mechanics: planet colonization, vacation mode, newbie protection, and complete production chains.

### Tasks
- [ ] Planet Colonization System (#19)
  - [ ] Colony ship construction + launch
  - [ ] New planet setup (buildings, research, fleet)
  - [ ] Multi-planet resource management UI
- [ ] Vacation Mode
  - [ ] Freeze production, fleet movement, research
  - [ ] No attack window (7–14 days)
  - [ ] Auto-resume logic
- [ ] Newbie Protection
  - [ ] Shield for first 7 days (no attacks given/received)
  - [ ] Economic scaling (reduced costs for first 30 days)
- [ ] Bash Rule (prevent farming new players)
- [ ] Production Formula Verification (#37)
  - [ ] Mine production (Metal/Crystal/Deuterium)
  - [ ] Factory efficiency (building speed)
  - [ ] Energy consumption + solar plant balance
- [ ] Resource Trading System
  - [ ] Trade validation (avoid profit exploits)
  - [ ] Trade history + analytics
- [ ] Building Prerequisite Chains
- [ ] Research Prerequisite Chains (#35)
- [ ] Building Destruction in Battles
- [ ] Debris Field Creation + Recovery

### Dependencies
Phase 1 (clean API baseline)

### Success Criteria
- All 37 open feature/test issues → closed
- Gameplay loop: build → research → attack ✓
- 100+ concurrent players, no crashes

---

## Phase 3: Frontend MVP (Agents 21–30)
**Duration:** 3–4 weeks | **Model Mix:** 3 Opus, 6 Sonnet, 1 Haiku

### Overview
Build essential player UIs: planet management, fleet control, battle reports, marketplace.

### Tasks
- [ ] Planet Overview Page
  - [ ] Resource display + production rates
  - [ ] Building list + upgrade buttons
  - [ ] Research queue + progress
- [ ] Building Queue UI
  - [ ] Drag-drop management
  - [ ] Cancel/prioritize actions
  - [ ] Time estimation
- [ ] Research Tree UI
  - [ ] Tech tree visualization (network graph)
  - [ ] Prerequisite highlights
  - [ ] Cost breakdown (time, resources)
- [ ] Fleet Dispatch
  - [ ] Target selector (galaxy/system/planet)
  - [ ] Mission choice (attack, spy, harvest, move)
  - [ ] Fleet composition picker
  - [ ] ETA countdown
- [ ] Battle Report Viewer
  - [ ] Combat log (detailed move-by-move)
  - [ ] Unit losses chart
  - [ ] Loot breakdown
- [ ] Marketplace UI
  - [ ] Buy/sell order book
  - [ ] Price charts (7-day history)
  - [ ] Transaction history
- [ ] Leaderboard Pages
  - [ ] Ranked by points (multi-filter: all/this-month/this-week)
  - [ ] Galaxy rankings (top 10 per galaxy)
  - [ ] Achievements feed
- [ ] Player Profile
  - [ ] Stats (battles won, research % complete)
  - [ ] Officers + titles
  - [ ] Alliance info
- [ ] Notification Center
  - [ ] Bell icon + dropdown
  - [ ] Unread count + filtering
- [ ] Mobile Responsive Layout
  - [ ] Tailwind breakpoints
  - [ ] Touch-friendly buttons

### Dependencies
Phase 1 (clean API), Phase 2 (complete game logic)

### Success Criteria
- All pages load <2s (FCP)
- Mobile viewport <768px ✓
- 0 TypeScript errors
- 80%+ component test coverage

---

## Phase 4: Auth & Infrastructure (Agents 31–40)
**Duration:** 2–3 weeks | **Model Mix:** 5 Opus, 3 Sonnet, 2 Haiku

### Overview
User accounts, secure authentication, role-based access, and CI/CD infrastructure.

### Tasks
- [ ] User Registration
  - [ ] Email + password signup
  - [ ] Email verification token
  - [ ] Username uniqueness
- [ ] Login/Logout
  - [ ] Session management (cookies + JWT)
  - [ ] "Remember me" option
  - [ ] Logout all devices
- [ ] Wallet Login
  - [ ] Phantom wallet integration
  - [ ] Solana devnet signature verification
  - [ ] Account linking to existing players
- [ ] JWT Token Management
  - [ ] Access token (15 min expiry)
  - [ ] Refresh token (7 day expiry)
  - [ ] Token rotation on refresh
- [ ] Role-Based Access Control
  - [ ] Admin (all powers)
  - [ ] Moderator (ban players, view logs)
  - [ ] Player (standard gameplay)
- [ ] Multi-Factor Authentication (optional)
  - [ ] TOTP (Google Authenticator)
  - [ ] SMS backup codes
- [ ] Password Reset
  - [ ] Email link (1 hour expiry)
  - [ ] New password validation
- [ ] CI/CD Pipeline
  - [ ] GitHub Actions (build, test, deploy)
  - [ ] Branch protection rules
  - [ ] Auto-deploy to staging on merge
- [ ] Staging Environment
  - [ ] Staging DB (snapshot of production schema)
  - [ ] Staging wallet (different Solana cluster)
  - [ ] 1:1 parity with production
- [ ] Monitoring Dashboard
  - [ ] Worker uptime + error rates
  - [ ] DB performance (query times, slow queries)
  - [ ] API latency (p50/p95/p99)
  - [ ] Memory/CPU usage

### Dependencies
Phase 1 (clean codebase)

### Success Criteria
- Zero auth bypass vulnerabilities (security audit ✓)
- Login flow < 500ms
- CI/CD: green on all PRs
- 99.9% uptime (staging)

---

## Phase 5: Social Features (Agents 41–50)
**Duration:** 3–4 weeks | **Model Mix:** 6 Opus, 2 Sonnet, 2 Haiku

### Overview
Alliances, messaging, friends, daily missions, achievements, and officer unlocks.

### Tasks
- [ ] Alliance System
  - [ ] Create + CRUD operations
  - [ ] Member roles (leader, officer, member)
  - [ ] Invites + applications
  - [ ] Ally/enemy designation
- [ ] Alliance Wars
  - [ ] Schedule wars (start/end dates)
  - [ ] Points system (alliance bonuses per kill)
  - [ ] Season rankings (S1, S2, etc.)
  - [ ] War reports (aggregate statistics)
- [ ] Player Messaging
  - [ ] Direct messages (1-on-1)
  - [ ] Alliance chat (group messages)
  - [ ] Read receipts
  - [ ] Notification (#20, #28)
- [ ] Friends List
  - [ ] Add/remove friends
  - [ ] Friend requests
  - [ ] Online status
- [ ] Daily Missions
  - [ ] Auto-generated tasks (build X, attack Y)
  - [ ] Reward distribution (resources, XP)
  - [ ] Reset at server time
- [ ] Leaderboard Leagues
  - [ ] Rank tiers (S1/S2/Diamond/Gold/Silver/Bronze)
  - [ ] Promotion/demotion cutoffs
  - [ ] League rewards at season end
- [ ] Achievements (#21–33)
  - [ ] Officer unlocks (5 types):
    - Commander (+1 build queue)
    - Admiral (+1 fleet slot)
    - Engineer (defense repair)
    - Geologist (+10% mine production)
    - Technocrat (+25% research, +2 espionage)
  - [ ] Progression tracking
  - [ ] Badge display on profile
- [ ] Guild Hall
  - [ ] Alliance HQ page
  - [ ] Member directory
  - [ ] Treasury management
- [ ] Season Rewards
  - [ ] End-of-season point distribution
  - [ ] Resource bonuses
  - [ ] Title/medal awards

### Dependencies
Phase 3 (frontend pages), Phase 2 (game logic)

### Success Criteria
- 50+ players in alliances
- Chat latency < 200ms
- Achievements unlock correctly
- No message loss

---

## Phase 6: AI Intelligence & Agents (Agents 51–60)
**Duration:** 3–4 weeks | **Model Mix:** 8 Opus, 2 Sonnet

### Overview
Autonomous fleet AI, research planning, defense optimization, and multi-agent coordination.

### Tasks
- [ ] Fleet AI
  - [ ] Auto-attack: find targets, compute best route
  - [ ] Defend: recall fleets on incoming attacks
  - [ ] Harvest: farm resource planets
  - [ ] Constraint: respect economy (avoid bankruptcy)
- [ ] Research Priority AI
  - [ ] Tech tree heuristics (economy → military → economy)
  - [ ] Multi-agent negotiation (shared tech)
- [ ] Defense AI
  - [ ] Optimal defense placement (turrets, shields)
  - [ ] Auto-rebuild after battle
  - [ ] Response time < 2 seconds
- [ ] Espionage AI (#24)
  - [ ] Spy mission targeting (rich players, tech leads)
  - [ ] Intel aggregation + pattern detection
- [ ] Market AI
  - [ ] Price prediction (3-day forecast)
  - [ ] Auto-trading (buy low, sell high)
  - [ ] Hedge resources against volatility
- [ ] Build Order Agent v2
  - [ ] Multi-queue constraint solver
  - [ ] Prioritize critical buildings
  - [ ] 99th percentile response time < 100ms
- [ ] Alliance War AI
  - [ ] Fleet coordination (synchronized attacks)
  - [ ] Strategy adaptation (counter enemy composition)
- [ ] NPC Fleet Generator (#12)
  - [ ] Alien/pirate fleets (threat scaling)
  - [ ] Balanced rewards (loot ∝ difficulty)
- [ ] Opponent Analysis Engine
  - [ ] Predict opponent's next research
  - [ ] Estimate defensive capacity
  - [ ] Recommend counter-strategy
- [ ] Multi-Agent Communication
  - [ ] Agent-to-agent message protocol
  - [ ] Shared blackboard (observable state)
  - [ ] Voting on alliance decisions

### Dependencies
Phase 2 (game logic), Phase 1 (clean API)

### Success Criteria
- AI vs AI: balanced 50/50 win rate
- Market spreads < 5% (efficient)
- Response time (all AI decisions) < 500ms
- 8+ GPT-4 contexts loaded simultaneously

---

## Phase 7: Web3 Expansion & Marketplace (Agents 61–70)
**Duration:** 3–4 weeks | **Model Mix:** 7 Opus, 2 Sonnet, 1 Haiku

### Overview
Solana cNFT marketplace, token-gated features, on-chain leaderboards, and Web3 economics.

### Tasks
- [ ] Metaplex Bubblegum Integration
  - [ ] cNFT minting (asset types: ships, defense, blueprints)
  - [ ] Mint metadata (image, rarity, stats)
  - [ ] Gas estimation + payer selection
- [ ] NFT Gallery UI
  - [ ] List user's minted NFTs
  - [ ] Filter by type (ship/defense/blueprint)
  - [ ] View on Solana Explorer
- [ ] Marketplace Smart Contract
  - [ ] Solana program or Anchor framework
  - [ ] cNFT listing + offer acceptance
  - [ ] Royalty split (creator + platform)
- [ ] Token-Gated Features
  - [ ] Governance token (spl-token)
  - [ ] Holder bonus (+10% XP, +5% production)
  - [ ] Automatic detection on wallet import
- [ ] On-Chain Leaderboard
  - [ ] Solana state account (Anchor)
  - [ ] Top 100 players + scores
  - [ ] Programmatic rank verification
- [ ] Phantom Wallet Persistence
  - [ ] Session recovery (same wallet across tabs)
  - [ ] Multi-signature support (squad)
  - [ ] Network switching (devnet → testnet → mainnet)
- [ ] cNFT Burning (Sell Utility)
  - [ ] Convert cNFT → in-game resources
  - [ ] Burn verification (on-chain confirmation)
  - [ ] Price oracle (SOL/resource exchange rate)
- [ ] Royalty Distribution
  - [ ] Automatic collection royalties (5%)
  - [ ] Creator payouts (Solana Pay)
  - [ ] Payment streaming (Streamflow)
- [ ] Web3 Retry Logic
  - [ ] Exponential backoff (tx confirmation)
  - [ ] Alternative RPC fallback
  - [ ] Transaction status verification
- [ ] Economics Bridge
  - [ ] Solana → in-game: wrap cNFT as building blueprint
  - [ ] In-game → Solana: mint NFT from achievement
  - [ ] Parity formula (1 cNFT = X resources)

### Dependencies
Phase 4 (wallet auth), Phase 6 (AI for secondary content)

### Success Criteria
- 50+ cNFTs minted in first week
- Marketplace 24h volume > $1,000
- Zero failed transactions (retry logic ✓)
- Leaderboard updates < 1s
- Token holders verified on login

---

## Phase 8: Testing & Quality Assurance (Agents 71–80)
**Duration:** 2–3 weeks | **Model Mix:** 4 Opus, 4 Sonnet, 2 Haiku

### Overview
E2E testing, security audit, load testing, coverage to 80%+.

### Tasks
- [ ] E2E Test Suite (Playwright)
  - [ ] Complete user journeys (signup → build → attack → marketplace)
  - [ ] 20+ test scenarios
  - [ ] Multi-browser coverage (Chrome, Firefox, Safari)
  - [ ] Visual regression tests
- [ ] Load Testing
  - [ ] k6 or Artillery setup
  - [ ] 100 concurrent players + ramp-up scenarios
  - [ ] Battle resolution under load
  - [ ] Database query times (p99 < 500ms)
- [ ] Security Audit
  - [ ] SQL injection prevention (parameterized queries)
  - [ ] XSS protection (CSP headers)
  - [ ] CSRF tokens + SameSite cookies
  - [ ] Rate limit bypass checks
  - [ ] Wallet signature validation
- [ ] Penetration Testing
  - [ ] API fuzzing (invalid inputs)
  - [ ] Authentication bypass (JWT tampering)
  - [ ] Authorization bypass (IDOR attacks)
  - [ ] Database access control
- [ ] Code Coverage
  - [ ] Target: 80%+ (worker, frontend, services)
  - [ ] Istanbul coverage reports
  - [ ] Coverage-aware test generation
- [ ] Battle Calculation Verification (#37)
  - [ ] 1000+ battle scenarios
  - [ ] Tech bonus correctness
  - [ ] Rapid fire formula accuracy
- [ ] Marketplace Edge-Case Tests (#36)
  - [ ] Race conditions (buy same item twice)
  - [ ] Price manipulation (flash loans equivalent)
  - [ ] Trade validation (no profit exploits)
- [ ] Alliance Service Tests (#25)
  - [ ] Member join/leave transitions
  - [ ] Role permission enforcement
- [ ] Research Tree Prerequisite Tests (#35)
  - [ ] 100+ chains (permutation testing)
  - [ ] Circular dependency prevention
- [ ] Message System Tests (#34)
  - [ ] Pagination correctness
  - [ ] Read receipt timing
  - [ ] Notification delivery

### Dependencies
Phase 3 (frontend MVP), Phase 5 (all features)

### Success Criteria
- E2E tests: 95%+ pass rate
- Load: 100 concurrent players, no crashes
- Security: 0 critical/high vulnerabilities
- Coverage: 80%+ codebase
- All flaky tests fixed

---

## Phase 9: Federation & Multi-Server (Agents 81–90)
**Duration:** 4–5 weeks | **Model Mix:** 7 Opus, 2 Sonnet, 1 Haiku

### Overview
Cross-universe communication, federated registry, inter-server diplomacy, disaster recovery.

### Tasks
- [ ] Universe Registry
  - [ ] DNS-like registry (lookup other servers)
  - [ ] Server discovery protocol
  - [ ] Health checks + failover
- [ ] Cross-Universe Messaging
  - [ ] Gossip protocol or federation API
  - [ ] Message signing + verification
  - [ ] Out-of-order message handling
- [ ] Cross-Universe Fleet Support
  - [ ] Dispatch fleet to other server
  - [ ] Auction protocol (confirm before arrival)
  - [ ] Conflict resolution (which server adjudicates)
- [ ] Server-to-Server Auth
  - [ ] Mutual TLS certificates
  - [ ] API key management
  - [ ] Rate limiting per peer
- [ ] Conflict Resolution
  - [ ] Deterministic battle outcomes (both servers agree)
  - [ ] Event ordering (lamport clocks)
  - [ ] Two-phase commit (for cross-server battles)
- [ ] Universe Merge Mechanics
  - [ ] Combine two servers (rare event)
  - [ ] Player deduplication (same wallet on 2 servers)
  - [ ] Resource reconciliation (keep max)
- [ ] Admin Dashboard
  - [ ] Player management (ban, kick, reset)
  - [ ] Server status overview
  - [ ] Income streams (Solana royalties)
  - [ ] Game balancing (adjust formulas)
- [ ] Server Analytics
  - [ ] KPIs: DAU, MAU, churn, ARPU
  - [ ] Battle frequency + economy health
  - [ ] Time-series metrics (Prometheus)
- [ ] Federated Leaderboard
  - [ ] Multi-server rankings (all 100 top players)
  - [ ] Cross-server comparison
  - [ ] Seasonal aggregation
- [ ] Disaster Recovery
  - [ ] Hourly backup to S3
  - [ ] Point-in-time restore (72h window)
  - [ ] Federation state snapshot
  - [ ] Runbook + playbook

### Dependencies
Phase 1 (stable baseline), Phase 4 (auth), Phase 5 (social)

### Success Criteria
- 3+ servers can communicate
- Cross-universe fleet 99.9% delivery rate
- Merge completed without data loss
- Admin operations < 100ms
- Backup/restore tested monthly

---

## Phase 10: Polish & Launch (Agents 91–100)
**Duration:** 4–5 weeks | **Model Mix:** 3 Opus, 5 Sonnet, 2 Haiku

### Overview
Mobile app, 3D battle replay, tutorials, performance tuning, accessibility, launch readiness.

### Tasks
- [ ] Mobile App
  - [ ] React Native or PWA (web-based preferred)
  - [ ] Offline mode (cached state)
  - [ ] Push notifications
  - [ ] iOS + Android app stores
- [ ] 3D Battle Replay
  - [ ] R3F (React Three Fiber) animation
  - [ ] Unit movement on grid
  - [ ] Weapon effects + explosions
  - [ ] Free camera controls
- [ ] Interactive Tutorial (#18)
  - [ ] Guided first 30 minutes
  - [ ] Tooltips on first building/research/fleet
  - [ ] Skip option for experienced players
- [ ] Performance Optimization
  - [ ] Bundle size < 200KB (gzipped)
  - [ ] First Contentful Paint < 2s
  - [ ] Time to Interactive < 3.5s
  - [ ] Lighthouse score 90+
- [ ] Accessibility (a11y)
  - [ ] WCAG 2.1 AA compliance
  - [ ] Keyboard navigation (Tab, Enter, Escape)
  - [ ] Screen reader support (ARIA labels)
  - [ ] Color contrast 4.5:1 (WCAG AA)
- [ ] Documentation
  - [ ] Player Handbook (wiki format)
  - [ ] Admin Guide (server setup, configuration)
  - [ ] API docs (OpenAPI/Swagger)
  - [ ] Developer onboarding
- [ ] Localization (i18n)
  - [ ] Spanish, Chinese (Simplified), German
  - [ ] Right-to-left (Arabic) support
  - [ ] Time zone awareness
- [ ] Community Guidelines
  - [ ] Code of Conduct
  - [ ] Moderation tools (mute, ban)
  - [ ] Report system (abuse, bugs)
- [ ] Launch Checklist
  - [ ] Mainnet Solana migration
  - [ ] Production database setup
  - [ ] DNS + SSL certificates
  - [ ] 24/7 monitoring + incident response
  - [ ] Stress test (1000+ players)
- [ ] Post-Launch Roadmap
  - [ ] Season 1 content (new buildings, units)
  - [ ] Cosmetics (skins, colors)
  - [ ] Seasonal events (holidays, special missions)

### Dependencies
All prior phases

### Success Criteria
- Mobile app: 4.5+ star rating (100+ downloads)
- Performance: Lighthouse 95+
- Accessibility: WCAG AA pass
- Launch: 1000+ concurrent players
- Post-launch: 50% retention at day 7

---

## Timeline Summary

| Phase | Agents | Duration | Cumulative |
|-------|--------|----------|-----------|
| 1 | 1–10 | 2–3 weeks | Week 3 |
| 2 | 11–20 | 3–4 weeks | Week 7 |
| 3 | 21–30 | 3–4 weeks | Week 11 |
| 4 | 31–40 | 2–3 weeks | Week 14 |
| 5 | 41–50 | 3–4 weeks | Week 18 |
| 6 | 51–60 | 3–4 weeks | Week 22 |
| 7 | 61–70 | 3–4 weeks | Week 26 |
| 8 | 71–80 | 2–3 weeks | Week 29 |
| 9 | 81–90 | 4–5 weeks | Week 34 |
| 10 | 91–100 | 4–5 weeks | Week 39 |

**Total:** ~7.5–10 months (assuming 1–2 agents per week completion)

---

## How to Contribute

### For New Agents
1. **Pick a phase & agent number** (e.g., "Agent #42 — Alliance Creation API")
2. **Check the phase dependencies** — ensure your phase's prerequisites are complete
3. **Create a sub-issue** on GitHub with:
   - Title: `[Agent #N] feat/fix: [description]`
   - Body: Reference this roadmap + link to parent phase issue
4. **Post progress comments** daily/weekly for visibility
5. **Link your PR** to the issue

### For Maintainers
- Monitor phase progression on the [project board](https://github.com/dontriskit/slop-machine/projects)
- Merge completed phases before starting next
- Escalate blockers (tsc errors, test failures) immediately
- Coordinate with Phase 8 (testing) for parallel quality assurance

---

## Phase Dependencies Graph

```
Phase 1 (Fixes)
    ↓
Phase 2 (Gameplay) ← Phase 1
    ↓
Phase 3 (Frontend) ← Phase 1, 2
    ↓           ↓
Phase 4 (Auth)   Phase 5 (Social) ← Phase 3
    ↓           ↓
    └─ Phase 7 (Web3) ← Phase 4
            ↑
Phase 6 (AI) ← Phase 2
    ↓
Phase 8 (Testing) ← Phase 3, 5 (continuous)
    ↓
Phase 9 (Federation) ← Phase 1, 4, 5
    ↓
Phase 10 (Polish & Launch) ← All prior phases
```

---

## Success Metrics

- **Code Quality:** tsc 0 errors, 80%+ test coverage, 0 lint warnings
- **Performance:** p99 API latency < 500ms, FCP < 2s
- **Stability:** 99.9% uptime, < 0.1% error rate
- **Scalability:** 1000+ concurrent players without degradation
- **Security:** 0 critical vulnerabilities, annual audit pass
- **User Engagement:** 50%+ day-7 retention, 5+ avg session length (minutes)

---

## Notes & Assumptions

- **Phases 1, 8 (Testing)** are continuous throughout all work
- **Phase 4 unblocks Phase 7** (wallet login required for Web3)
- **Phase 6 (AI)** can run in parallel with Phases 3–5
- **Phase 9 (Federation)** is optional for single-server deployments
- Model tier recommendations assume:
  - **Opus:** 100k context (complex logic, full-stack tasks)
  - **Sonnet:** 200k context (UI, integration, large refactors)
  - **Haiku:** 100k context (small fixes, ideas, coordination)
- Agents may work on multiple sub-tasks within their assigned phase
- Dependencies can be relaxed if earlier phases are "good enough" (80%+ complete)

---

## Contact & Questions

- **Master Issue:** [#51](https://github.com/dontriskit/slop-machine/issues/51)
- **Roadmap Owner:** Roadmap Coordinator (Agent #0)
- **Last Updated:** 2026-02-22

Generated for **Cosmic Protocol** — Building the federated OGame on Solana.
