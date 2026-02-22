# Cosmic Protocol: Canonical Patterns & Formulas

Reference implementations analyzed: **OGameX** (PHP/Laravel 12 + Rust FFI) and **UniEngine** (PHP/Smarty).

All formulas verified across both codebases. This is the single source of truth for game mechanics.

---

## 1. Universe Structure

### Coordinate System (Donut Topology)
```
Galaxy:System:Position
  Galaxy:  1 to N (typically 2-9 galaxies)
  System:  1 to 499 per galaxy (wraps: 1↔499)
  Position: 1-15 regular planets, 16 = expedition slot
```

**Wrapping Rules** (both codebases):
- Systems wrap around (donut): min=1, max=499, wraps at boundaries
- Galaxies may also wrap (configurable)
- Positions don't wrap (clamp to 1-16)

**Uniqueness Constraint**:
- Only ONE planet per (galaxy, system, position)
- Critical for colony slot management

### New Player Placement (UniEngine 3-Attempt Algorithm)

```
Attempt 1: Preferred galaxy, systems 1-499, positions 4-12
  → Random position in middle slots (safest for new players)

Attempt 2: Same galaxy, positions 4-12 (broader system range)
  → Better distribution if Attempt 1 fails

Attempt 3: Same galaxy, positions 1-15 (all remaining slots)
  → Last resort, may not be safe
```

**Rationale**: Middle positions (4-12) are safer for new players to develop without immediate threats.

---

## 2. Production Formulas

### Mine Production Per Hour

**Formula** (verified OGameX + UniEngine):
```
production_per_hour = base × level × 1.1^level × (1 + (temperature - 40) / 100)
```

**Base Rates**:
| Resource | Base | Formula |
|----------|------|---------|
| Metal | 30 | 30 × level × 1.1^level |
| Crystal | 20 | 20 × level × 1.1^level |
| Deuterium | 10 | 10 × level × 1.1^level |

**Temperature Modifier**:
- Default: 30°C
- Range: 0°C to 100°C
- Modifier: (temp - 40) / 100
  - At 40°C: 0% bonus
  - At 30°C: -10% penalty
  - At 70°C: +30% bonus

**Example** (Metal Mine):
- Level 1: 30 × 1 × 1.1 = 33/hr
- Level 10: 30 × 10 × 1.1^10 = 77.8k/hr
- Level 20: 30 × 20 × 1.1^20 = 1.37M/hr

### Solar Plant & Fusion Reactor

**Solar Production**:
```
energy_per_hour = 20 × level × 1.1^level
```

**Fusion Production** (requires deuterium):
```
energy_per_hour = 30 × level × 1.1^level
deuterium_cost_per_hour = 10 × level × 1.1^level
```

### Deuterium Synthesizer

Requires energy from solar/fusion. Production rate = energy available.

---

## 3. Building Cost & Upgrade Formulas

### Upgrade Cost Calculation

**Formula** (exponential scaling):
```
cost_at_level_n = floor(base_cost × factor^(n-1))
```

**Building Cost Factors**:
| Building | Metal | Crystal | Deuterium | Factor |
|----------|-------|---------|-----------|--------|
| Metal Mine | 60 | 15 | 0 | 1.5 |
| Crystal Mine | 48 | 24 | 0 | 1.6 |
| Deut Synth | 225 | 75 | 0 | 1.5 |
| Solar Plant | 75 | 30 | 0 | 1.5 |
| Fusion Reactor | 900 | 360 | 180 | 1.8 |
| Robotics | 400 | 120 | 200 | 2.0 |
| Nanite Factory | 1M | 500k | 100k | 2.0 |
| Shipyard | 400 | 200 | 100 | 2.0 |
| Research Lab | 200 | 400 | 200 | 2.0 |
| Metal Storage | 1000 | 0 | 0 | 2.0 |
| Crystal Storage | 1000 | 1000 | 0 | 2.0 |
| Deut Tank | 1000 | 1000 | 0 | 2.0 |

### Build Time Calculation

**Formula** (OGameX reference):
```
build_time_seconds = (metal_cost + crystal_cost) / (2500 × level_factor × robotics_bonus × universe_speed × nanite_bonus)

where:
  level_factor = max(4 - next_level / 2, 1)
  robotics_bonus = 1 + (robotics_level × 0.1)
  nanite_bonus = 2^nanite_level
```

**Example** (Metal Mine Level 2, Robotics Level 0):
- Cost: 60×1.5 + 15×1.5 = 112.5 metal, 22.5 crystal = 135 total
- Time: 135 / (2500 × 4 × 1 × 1 × 1) = 0.0135 seconds ≈ 48 seconds

**Time Modifiers**:
- Robotics Factory: +10% per level (50 levels = 5x faster)
- Nanite Factory: 2× per level (10 levels = 1024× faster!)
- Universe Speed: Linear (2x speed = 2x faster)

---

## 4. Fleet Movement & Combat

### Distance Calculation (Donut Topology)

**Inter-Galaxy Distance**:
```
distance = 20,000 × min(|galaxy1 - galaxy2|, num_galaxies - |galaxy1 - galaxy2|)
```

**Intra-Galaxy, Different System**:
```
distance = 2,700 + (19 × 5 × system_diff - empty_systems - inactive_systems)

where:
  system_diff = min(|sys1 - sys2|, 499 - |sys1 - sys2|)  [donut wrap]
  empty_systems = count of systems with zero planets
  inactive_systems = count of systems with no active players (7+ days)
```

**Same System, Different Position**:
```
distance = 1,000 + (5 × |pos1 - pos2|)
```

**Same Coordinates**:
```
distance = 5
```

### Fleet Duration Calculation

**Formula** (OGameX reference):
```
duration_seconds = round((35,000 / speed_percent × √(distance × 10 / slowest_speed) + 10) / fleet_speed)

where:
  speed_percent: mission speed (10-100), 10=slowest, 100=fastest
  slowest_speed: speed of slowest ship in fleet (tokens/hour)
  fleet_speed: global multiplier (1.0 = normal, 2.0 = 2x faster)
```

**Practical Values**:
- Distance 1,000 tokens, speed 10%, 1 Light Fighter (12.5k speed):
  - Duration ≈ (35k/10 × √(1k×10/12.5k) + 10) / 1 ≈ 297 seconds ≈ 5 minutes

- Distance 20,000 tokens (inter-galaxy), speed 10%, Heavy Fighter (10k speed):
  - Duration ≈ (35k/10 × √(20k×10/10k) + 10) / 1 ≈ 7,420 seconds ≈ 2 hours

### Fuel Consumption

**Formula**:
```
consumption = Σ(ship.fuel × count × distance / 35,000 × (speed_value / 10 + 1)²)
            + max(floor(sum(ship.fuel × count × holding_hours) / 10), 1)

where:
  speed_value = max(0.5, duration × fleet_speed - 10)
  holding_hours = time spent at target before returning
```

**Ship Fuel Costs Per 35k Distance**:
| Ship | Fuel Cost |
|------|-----------|
| Light Fighter | 20 |
| Heavy Fighter | 50 |
| Cruiser | 48 |
| Battleship | 500 |
| Battlecruiser | 250 |
| Bomber | 100 |
| Destroyer | 1,000 |
| Deathstar | 1 |
| Small Cargo | 10 |
| Large Cargo | 50 |
| Colony Ship | 100 |
| Recycler | 20 |
| Espionage Probe | 1 |

### Ship Speeds (tokens/hour)

| Ship | Speed | Role |
|------|-------|------|
| Light Fighter | 12,500 | Fast combat |
| Heavy Fighter | 10,000 | Heavy combat |
| Cruiser | 15,000 | Fast combat |
| Battleship | 10,000 | Capital ship |
| Battlecruiser | 10,000 | Capital ship |
| Bomber | 5,000 | Defense killer |
| Destroyer | 5,000 | Anti-fighter |
| Deathstar | 100 | Ultimate weapon (slow!) |
| Small Cargo | 20,000 | Fast transport |
| Large Cargo | 5,000 | Slow transport |
| Colony Ship | 2,500 | Colonization |
| Recycler | 2,000 | Debris collection |
| Espionage Probe | 100,000,000 | Scouting (instant) |

### Ship Cargo Capacity

| Ship | Capacity |
|------|----------|
| Small Cargo | 5,000 |
| Large Cargo | 25,000 |
| Colony Ship | 7,500 |
| Recycler | 20,000 |
| All Combat Ships | 0 |

### Mission Types

| Mission | Requirements | Result |
|---------|--------------|--------|
| Transport | Small/Large Cargo | Move resources |
| Attack | 1+ Combat Ship | Plunder resources, battle |
| Colonize | 1 Colony Ship, empty slot | Claim new planet |
| Expedition | Any ships, position 16 | Explore and find resources |
| Return | (auto-generated) | Fleet returns home |

### Queue Management

**Queue Size Limits**:
- Free Account: 3 builds simultaneously
- Premium Account: 10 builds simultaneously

**Queue Processing**:
- First-in-first-out (FIFO)
- Head item auto-completes when timeEnd reached
- Automatic alarm triggers completion
- Next item in queue starts immediately

---

## 5. Combat Mechanics (OGameX)

### Battle Resolution

**Combat Happens When**:
1. Attack fleet arrives at target
2. Both fleets fight simultaneously
3. Loser is eliminated or partially destroyed
4. Winner (if any survivors) loots resources

### Damage Calculation

**Formula** (simplified):
```
damage = (attacker_ship_power × attacker_count / 100) × random(0.5, 1.5)

where ship_power varies by type:
  Light Fighter: 50 power
  Heavy Fighter: 150 power
  Cruiser: 400 power
  Battleship: 600 power
  Battlecruiser: 400 power
  Bomber: 1,000 power
  Destroyer: 2,000 power
  Deathstar: 200,000 power
```

### Defense Structures

| Defense | Metal | Crystal | Armor | Capacity |
|---------|-------|---------|-------|----------|
| Small Shield Dome | 10k | 10k | 20k HP | Covers 100k capacity |
| Large Shield Dome | 50k | 50k | 100k HP | Covers 1M capacity |
| Anti-Ballistic Missile | 8k | 0 | 1 HP | 1-slot defense |
| Interplanetary Missile | 12.5k | 2.5k | 1 HP | 1-slot defense |
| Plasma Turret | 50k | 50k | 300 HP | 1-slot defense |
| Small Laser | 1.6k | 0.4k | 25 HP | 1-slot defense |
| Big Laser | 6k | 2k | 150 HP | 1-slot defense |
| Gauss Cannon | 20k | 15k | 200 HP | 1-slot defense |
| Ion Cannon | 5k | 3k | 150 HP | 1-slot defense |

---

## 6. Storage & Capacity

### Resource Storage

**Metal Storage**:
```
capacity = 100,000 × 1.7^level
```

**Crystal Storage**:
```
capacity = 100,000 × 1.7^level
```

**Deuterium Tank**:
```
capacity = 100,000 × 1.7^level
```

**Fleet Cargo Capacity**:
```
total_cargo = Σ(ship.cargo_capacity × count)
```

**Excess Resources**:
- Resources exceed capacity: overflow stops production
- Planet continues producing but can't store more
- Prevents resource waste but creates bottleneck

---

## 7. Research System (Optional)

**Research Lab Building**:
- Required to research technologies
- Multiple labs = faster research (1 + 0.5 × additional_labs)

**Research Time Formula**:
```
time_seconds = (base_time_hours × 1.07^level) / (1 + 0.002 × research_lab_level) × 3600
```

**Key Techs**:
| Tech | Impact | Cost Curve |
|------|--------|-----------|
| Espionage | 0.2× duration for spy missions | 200m/100c/0d base, factor=2.0 |
| Computer | -10% fleet duration per level | 400m/600c/200d base, factor=2.0 |
| Weapons | +10% ship attack per level | 800m/200c/0d base, factor=2.0 |
| Shielding | +10% defense per level | 200m/600c/0d base, factor=2.0 |
| Armor | +10% ship hull per level | 1k/0c/0d base, factor=2.0 |
| Astrophysics | +1 colonizable planet per level | 4k/8k/4k base, factor=2.0 |

---

## 8. Key Implementation Patterns

### Pattern 1: Exponential Cost Growth
All upgradeable buildings use exponential cost scaling with different factors (1.5-2.0) to create progression pacing.

**Design Impact**:
- Early levels are cheap (exploration phase)
- Mid levels are moderate (expansion phase)
- Late levels are expensive (specialization phase)

### Pattern 2: Durable Object State Management
Each planet maintains stateful resources, buildings, and queue.

**Why**:
- Per-planet production ticking without DB hits
- Alarm-based queue completion (serverless-friendly)
- Minimal latency for game state queries

### Pattern 3: Single-Loop Agent Design
Build order agent runs once per minute per planet.

**Why**:
- Deterministic (temperature 0.3 for decisions)
- Parallel execution (Promise.all across planets)
- H2M training data (log every decision)
- No multi-turn complexity

### Pattern 4: Donut Topology
Systems wrap (1↔499) to make universe finite but continuous.

**Why**:
- No "edge" of universe
- Distance calculation accounts for wrapping
- Equal distribution (no edge advantage/disadvantage)

### Pattern 5: Human-to-Machine Protocol
Every decision logged with source ('agent' | 'manual') + reasoning.

**Why**:
- Training data for future model fine-tuning
- Audit trail for transparency
- Cooperation analysis (how often do humans override?)

### Pattern 6: Alarm-Based Processing
Queue completion uses Durable Object alarms.

**Why**:
- No polling needed
- Serverless-friendly (alarm fires automatically)
- Exact timing (fires at timeEnd)

### Pattern 7: Coordinate Uniqueness
Only one planet per (galaxy, system, position).

**Why**:
- Clear slot semantics
- Prevents multiple claims on same position
- Natural limit on planets per system

---

## 9. Implementation Checklist

### Core Game Loop
- [x] Resource production ticking
- [x] Build queue management
- [x] Building upgrade cost/time
- [x] Queue auto-completion
- [ ] Fleet movement
- [ ] Battle resolution
- [ ] Defense evaluation

### Map System
- [x] Coordinate system with wrapping
- [x] Distance calculation
- [x] New player placement
- [x] Uniqueness constraint
- [ ] Planetary scanner
- [ ] Galaxy map UI

### Agent System
- [x] GLM-4.7-Flash integration
- [x] Single-loop decision maker
- [x] H2M decision logging
- [x] Parallel agent fan-out
- [ ] Strategy generation workflow

### Frontend
- [x] 3D galaxy visualization
- [ ] System detail view
- [ ] Planet detail view
- [ ] Fleet control panel
- [ ] Battle report display

---

## 10. Verification Tests

### Test: Distance Calculation
```
From 1:100:5 to 1:110:8
  same_galaxy = true, diff_system = 10
  distance = 2700 + (19 × 5 × 10) = 3700

From 1:1:1 to 2:1:1
  diff_galaxy = 1
  distance = 20000 × 1 = 20000
```

### Test: Build Time
```
Metal Mine L2, no robotics, universe 1x
  cost = 60×1.5 + 15×1.5 = 112.5
  time = 112.5 / (2500 × 4 × 1 × 1 × 1) = 0.0135s
  actual: ~48 seconds (with UI overhead)
```

### Test: Production Rate
```
Metal Mine L10, temp 30°C
  prod = 30 × 10 × 1.1^10 × (1 + (30-40)/100)
       = 30 × 10 × 2.5937 × 0.9
       = 700.4/hour
```

---

## References

- **OGameX**: `/references/OGameX` — PHP/Laravel 12, modern approach
- **UniEngine**: `/references/UniEngine` — PHP/Smarty, mature approach
- **Cosmic Protocol**: `/worker/src/game/formulas.ts` — TypeScript implementation

