# Cosmic Protocol — Game Mechanics & Formulas

Canonical formulas extracted from OGameX (Laravel/Rust FFI) and UniEngine (legacy PHP). These are the source-of-truth for all game calculations.

**Last Updated:** 2026-02-22
**References:** `/references/OGameX/` and `/references/UniEngine/`

---

## 1. RESOURCE PRODUCTION

### Mining Formulas

All mines use **exponential scaling**: `base × level × 1.1^level`

#### Metal Mine
```
Production per hour = 30 × level × 1.1^level
Energy cost = -10 × level × 1.1^level

Examples:
  Level 1:  33 metal/hr, -11 energy
  Level 10: 778 metal/hr, -259 energy
  Level 30: 15,705 metal/hr, -1,745 energy
```

#### Crystal Mine
```
Production per hour = 20 × level × 1.1^level
Energy cost = -10 × level × 1.1^level

Examples:
  Level 1:  22 crystal/hr
  Level 10: 519 crystal/hr
  Level 30: 10,470 crystal/hr
```

#### Deuterium Synthesizer
```
Production per hour = 10 × level × 1.1^level × (1.44 - 0.004 × planet_temp)
Energy cost = -20 × level × 1.1^level

Temperature Modifiers:
  Cold (temp = -60°C):  1.44 - (-0.24) = 1.68x bonus
  Normal (temp = 0°C):  1.44 - 0 = 1.44x (baseline)
  Hot (temp = 200°C):   1.44 - 0.8 = 0.64x penalty
```

### Energy Production

#### Solar Plant
```
Production per hour = 20 × level × 1.1^level

Examples:
  Level 1:  22 energy/hr
  Level 10: 519 energy/hr
  Level 30: 10,470 energy/hr
```

#### Fusion Reactor
```
Production per hour = 30 × level × (1.05 + energy_tech_level × 0.01)^level
Deuterium consumption = -10 × level × 1.1^level

Energy Tech Scaling: Each tech level adds 1% to base multiplier

Examples (with Energy Tech = 15):
  Level 1:  30 × 1.2^1 = 36 energy/hr
  Level 10: 30 × 10 × 1.2^10 = 1,858 energy/hr
```

---

## 2. BUILDING COSTS & SCALING

### Base Cost Formula
```
cost_at_level = base_cost × factor^(level - 1)

Factors by building (exponential growth):
  Mines:              1.5x per level
  Production:         1.5x (solar) to 1.8x (fusion)
  Storage:            2.0x per level
  Industry:           2.0x per level (robotics, nanite)
  Research Lab:       2.0x per level
```

### Building Cost Examples

#### Metal Mine
```
Base: 60 metal, 15 crystal
Factor: 1.5

  Level 1:   60 metal,     15 crystal
  Level 2:   90 metal,     22.5 crystal
  Level 10:  2,306 metal,  577 crystal
  Level 20:  205,480 metal, 51,370 crystal
```

#### Fusion Reactor
```
Base: 900 metal, 360 crystal, 180 deuterium
Factor: 1.8

  Level 1:   900 metal,        360 crystal,   180 deuterium
  Level 2:   1,620 metal,      648 crystal,   324 deuterium
  Level 10:  1,207,260 metal,  482,904 cr,    241,452 deut
```

#### Deathstar (Special - Fixed Cost)
```
Cost: 5,000,000 metal, 4,000,000 crystal, 1,000,000 deuterium
NO scaling - same cost per unit
```

### Storage Capacity
```
Capacity = 5,000 × floor(2.5 × e^(20×level/33))

Examples:
  Level 1:   20,000 units
  Level 5:   300,000 units
  Level 10:  5,400,000 units
  Level 30:  billions (exponential)
```

---

## 3. BUILD TIME FORMULA

```
Build Time (seconds) = (metalCost + crystalCost) /
                       (2500 × max(4 - level/2, 1) ×
                        (1 + robotics_level × 0.1) ×
                        universe_speed × 2^nanite_level)

With bonuses:
  Robotics: 10% per level
  Nanite: 2^level exponential multiplier
```

---

## 4. BATTLE MECHANICS

### Battle Structure
- **Max Rounds:** 6 rounds
- **Shields:** Regenerate fully each round
- **Damage:** Absorbed by shields first, then hull
- **Destruction:** Ships destroyed when hull < 30%

### Damage Formula

```
Minimum threshold = 0.01 × target_shield

Absorption:
  damage ≤ shield → shield -= damage
  damage > shield → hull -= (damage - shield), shield = 0
```

### Hull Destruction Logic
```
hull_percentage = current_hull / original_hull

IF hull_percentage < 0.7:
  explosion_chance = (1 - hull_percentage) × 100%
  IF random(0, 100) < explosion_chance:
    Ship destroyed
```

### Rapidfire (Special Attacks)
```
Chance = 100 - (100 / rapidfire_amount) percent

Examples:
  Rapidfire 4:  75% chance per extra shot
  Rapidfire 10: 90% chance per extra shot
```

---

## 5. FLEET MECHANICS

### Fleet Speed
```
Fleet speed = slowest ship speed (bottleneck)

Base speeds:
  Deathstar:  100
  Bomber:     4,000
  Recycler:   2,000
  Destroyer:  5,000
  Battleship: 10,000
  Light Fighter: 12,500
  Cruiser:    15,000

Tech bonuses:
  Combustion Drive:    +10% per level
  Impulse Drive:       +20% per level
  Hyperspace Drive:    +30% per level
```

### Cargo Capacity
```
Small Cargo:  5,000 per unit
Large Cargo:  25,000 per unit
Recycler:     20,000 per unit
Others:       0 (combat only)
```

### Mission Types
1. **Attack** — Battle, loot 50% max
2. **Transport** — Move resources
3. **Deploy** — Station permanently
4. **Espionage** — Gather intelligence
5. **Harvest** — Collect debris
6. **Moon Destruction** — Use Deathstar
7. **ACS Attack** — Coordinated multi-fleet
8. **ACS Defend** — Coordinated multi-defense

---

## 6. DEBRIS FIELD

### Wreck Generation
```
Debris metal   = 30% of destroyed ships' metal cost
Debris crystal = 30% of destroyed ships' crystal cost
Debris deut    = 0% (lost completely)
```

### Recycler Collection
```
Recyclers harvest positions 1-15
Pathfinders harvest position 16 (expeditions)

max_harvest = min(debris, recycler_capacity)
Distribution: 1/3 to each resource type
```

---

## 7. TECHNOLOGY TREE

### Core Research
```
Energy Technology (base)
├─ Laser Technology (requires: Energy 2)
├─ Ion Technology (requires: Energy 4, Laser 5)
└─ Plasma Technology (requires: Energy 8, Laser 10, Ion 5)
    Bonus: +1% metal, +0.66% crystal, +0.33% deut/level

Combustion Drive      (+10% speed per level)
Impulse Drive         (+20% speed per level)
Hyperspace Drive      (+30% speed per level)
Hyperspace Technology (+5% cargo per level)
Graviton Technology   (Enables Deathstar)
```

### Research Costs (2.0x factor)
```
Energy:         0m, 800c, 400d
Laser:          200m, 100c, 0d
Ion:            1,000m, 300c, 100d
Plasma:         2,000m, 4,000c, 1,000d
Hyperspace:     0m, 4,000c, 2,000d

Level N cost = base × 2^(N-1)
```

---

## 8. UNIVERSE RULES

### Coordinates
```
Galaxy:   1-9 (9 total)
System:   1-499 (500 per galaxy)
Position: 1-15 (planets/moons)
Position: 16 (expedition debris)
```

### Special Mechanics
```
Vacation Mode:        Can't attack/be attacked
Inactive Protection:  7+ days no login
Alliance:             ACS attacks/defends, shared intel
Ranking:              Economy, Military, Defense scores
```

---

## 9. KEY FORMULAS REFERENCE TABLE

| Component | Formula | Factor |
|-----------|---------|--------|
| Metal Mine | 30×L×1.1^L | 1.5x cost |
| Crystal Mine | 20×L×1.1^L | 1.6x cost |
| Deut Synth | 10×L×1.1^L×temp_mod | 1.5x cost |
| Storage | 5000×⌊2.5×e^(20L/33)⌋ | 2.0x cost |
| Building | base×factor^(L-1) | 1.5-2.0x |
| Build Time | (metal+crystal)/(2500×mods) | — |
| Fusion Energy | 30×L×(1.05+tech×0.01)^L | 1.8x cost |
| Loot Max | 50% of resources | — |
| Defense Repair | 70% probability | — |

---

**Verified against:** OGameX + UniEngine
**Version:** 1.0.0
**Last Updated:** 2026-02-22
