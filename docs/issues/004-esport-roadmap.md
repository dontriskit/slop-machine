# Issue 4: E-sport features roadmap

## Overview

For competitive/e-sport gameplay, implement features in phases to enable tournament play, live streaming, and fair competition.

## Phase 1: MVP (Deterministic Foundation)

Ensure battles are reproducible and viewable after the fact.

### Deterministic Battle Engine
- [ ] Same input = same output (no floating point randomness)
- [ ] All RNG seeded and deterministic
- [ ] Battle results reproducible across platforms

### Battle Replay System
- [ ] Store all RNG seeds with battle
- [ ] Record all battle actions
- [ ] Enable replay from any point
- [ ] Verify replay matches original

### Spectator Mode
- [ ] Read-only view of battles
- [ ] Spectators see battle in real-time (WebSocket)
- [ ] Spectators cannot affect battle
- [ ] Spectator list visible to players

## Phase 2: Tournament (Bracket & Ranking)

Enable organized competition with structured matches.

### Tournament Bracket System
- [ ] Create tournaments (single/double elimination)
- [ ] Automatic bracket generation
- [ ] Match scheduling
- [ ] Bracket visualization

### Match Creation (Admin)
- [ ] Admin creates matches
- [ ] Set players/teams
- [ ] Set start time
- [ ] Generate match invitations

### Win/Loss Tracking
- [ ] Record match results
- [ ] Track player statistics
- [ ] Calculate win rate
- [ ] Track streak data

### ELO Ranking System
- [ ] Calculate ELO for each player
- [ ] Update ELO after each match
- [ ] Rank players by ELO
- [ ] Display ranking ladder
- [ ] Season resets

## Phase 3: Live (Broadcast & Commentary)

Enable streaming and spectating for competitive events.

### WebSocket Live Battle Updates
- [ ] Real-time battle state broadcast
- [ ] 60 FPS update rate
- [ ] Spectators receive live updates
- [ ] Low latency (< 100ms)

### Commentary/Casting Tools
- [ ] Commentator interface
- [ ] Highlight system key moments
- [ ] Chat system for commentary
- [ ] Broadcast to multiple platforms

### Player Profiles with Stats
- [ ] Profile page per player
- [ ] All-time statistics
- [ ] Win rate by matchup
- [ ] Most used strategies
- [ ] Achievement badges

### Alliance War Declarations
- [ ] Alliance vs Alliance mode
- [ ] War declaration system
- [ ] Alliance battle events
- [ ] Territory control mechanics
- [ ] War statistics

## Phase 4: Anti-Cheat (Fair Play Enforcement)

Prevent cheating and ensure fair competition.

### Server-Authoritative State
- [ ] All game state on server
- [ ] No client trust
- [ ] Client validation before action
- [ ] Cheating detection via state mismatch

### Battle Verification (Rust WASM)
- [ ] Recompile battles in WASM
- [ ] Verify server calculation matches
- [ ] Detect RNG manipulation
- [ ] Detect resource manipulation

### Rate Limiting on Fleet Dispatches
- [ ] Limit fleet dispatches per minute
- [ ] Prevent dispatch spam
- [ ] Detect bot activity
- [ ] Alert on suspicious patterns

### Anomaly Detection on Resource Growth
- [ ] Track resource growth patterns
- [ ] Detect impossible growth rates
- [ ] Detect cheated resources
- [ ] Quarantine suspicious accounts
- [ ] Admin review system

## Success Metrics

- [ ] Deterministic battles verified in Phase 1
- [ ] Tournament system supports 100+ concurrent players
- [ ] Live broadcast supports 1000+ concurrent viewers
- [ ] Anti-cheat catches 99% of cheaters within 24h
- [ ] Player trust in ranking system (survey)

## Timeline Estimate

- Phase 1 MVP: 2 weeks (post-merge)
- Phase 2 Tournament: 3 weeks
- Phase 3 Live: 2 weeks
- Phase 4 Anti-cheat: 3 weeks
- **Total: ~10 weeks**

## Related Issues
- #001-merge-order.md (dependency)
- #003-integration-test.md (prerequisite for Phase 1)
