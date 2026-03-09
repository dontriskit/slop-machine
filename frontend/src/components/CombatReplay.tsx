/**
 * CombatReplay.tsx
 *
 * Animated round-by-round battle visualization for Cosmic Protocol.
 * Shows attacker vs defender fleet strength bars, ships destroyed per round
 * with ship images, play/pause auto-advance, and round slider scrubbing.
 *
 * Props:
 *   battleData — raw battle_data_json from the API (BattleReport shape)
 *   onClose    — callback to dismiss the replay panel
 */

import { useState, useEffect, useCallback, useRef } from 'react'

// ---------------------------------------------------------------------------
// Types (mirror battleService.ts shapes, safe to use as `any` fields)
// ---------------------------------------------------------------------------

interface Ships {
  lightFighter?: number
  heavyFighter?: number
  cruiser?: number
  battleship?: number
  battlecruiser?: number
  bomber?: number
  destroyer?: number
  deathstar?: number
  smallCargo?: number
  largeCargo?: number
  colonyShip?: number
  recycler?: number
  espionageProbe?: number
  solarSatellite?: number
  [key: string]: number | undefined
}

interface Resources {
  metal: number
  crystal: number
  deuterium: number
}

interface BattleRoundSide {
  ships: Ships
  defenses?: Record<string, number>
  shipsDestroyed: Ships
  defensesDestroyed?: Record<string, number>
}

interface BattleRound {
  round: number
  attacker: BattleRoundSide
  defender: BattleRoundSide
  attackerCasualties: Ships
  defenderCasualties: Ships
}

interface BattleReportData {
  rounds?: BattleRound[]
  winner?: 'attacker' | 'defender' | 'draw'
  attackerLosses?: Resources
  defenderLosses?: Resources
  debrisField?: Resources
  loot?: Resources
  [key: string]: unknown
}

export interface CombatReplayProps {
  battleData: BattleReportData
  attackerName?: string
  defenderName?: string
  onClose: () => void
}

// ---------------------------------------------------------------------------
// Ship image mapping (camelCase key -> snake_case filename)
// ---------------------------------------------------------------------------

const SHIP_IMAGE: Record<string, string> = {
  lightFighter: '/img/objects/units/light_fighter_small.jpg',
  heavyFighter: '/img/objects/units/heavy_fighter_small.jpg',
  cruiser: '/img/objects/units/cruiser_small.jpg',
  battleship: '/img/objects/units/battleship_small.jpg',
  battlecruiser: '/img/objects/units/battlecruiser_small.jpg',
  bomber: '/img/objects/units/bomber_small.jpg',
  destroyer: '/img/objects/units/destroyer_small.jpg',
  deathstar: '/img/objects/units/deathstar_small.jpg',
  smallCargo: '/img/objects/units/small_cargo_small.jpg',
  largeCargo: '/img/objects/units/large_cargo_small.jpg',
  colonyShip: '/img/objects/units/colony_ship_small.jpg',
  recycler: '/img/objects/units/recycler_small.jpg',
  espionageProbe: '/img/objects/units/espionage_probe_small.jpg',
  solarSatellite: '/img/objects/units/solar_satellite_small.jpg',
  // defenses
  rocketLauncher: '/img/objects/units/rocket_launcher_small.jpg',
  lightLaser: '/img/objects/units/light_laser_small.jpg',
  heavyLaser: '/img/objects/units/heavy_laser_small.jpg',
  gaussCannon: '/img/objects/units/gauss_cannon_small.jpg',
  ionCannon: '/img/objects/units/ion_cannon_small.jpg',
  plasmaTurret: '/img/objects/units/plasma_turret_small.jpg',
  smallShieldDome: '/img/objects/units/small_shield_dome_small.jpg',
  largeShieldDome: '/img/objects/units/large_shield_dome_small.jpg',
}

const SHIP_LABEL: Record<string, string> = {
  lightFighter: 'Light Fighter',
  heavyFighter: 'Heavy Fighter',
  cruiser: 'Cruiser',
  battleship: 'Battleship',
  battlecruiser: 'Battlecruiser',
  bomber: 'Bomber',
  destroyer: 'Destroyer',
  deathstar: 'Death Star',
  smallCargo: 'Small Cargo',
  largeCargo: 'Large Cargo',
  colonyShip: 'Colony Ship',
  recycler: 'Recycler',
  espionageProbe: 'Esp. Probe',
  solarSatellite: 'Solar Sat.',
  rocketLauncher: 'Rocket Launcher',
  lightLaser: 'Light Laser',
  heavyLaser: 'Heavy Laser',
  gaussCannon: 'Gauss Cannon',
  ionCannon: 'Ion Cannon',
  plasmaTurret: 'Plasma Turret',
  smallShieldDome: 'Small Shield',
  largeShieldDome: 'Large Shield',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function totalFleet(ships: Ships | undefined): number {
  if (!ships) return 0
  return Object.values(ships).reduce((s, v) => s + (v ?? 0), 0)
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function outcomeColor(winner: string): string {
  if (winner === 'attacker') return '#00ff88'
  if (winner === 'defender') return '#ff8844'
  return '#888888'
}

function outcomeText(winner: string): string {
  if (winner === 'attacker') return 'ATTACKER WINS'
  if (winner === 'defender') return 'DEFENDER WINS'
  return 'DRAW'
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface StrengthBarProps {
  label: string
  value: number
  max: number
  color: string
  animate: boolean
}

function StrengthBar({ label, value, max, color, animate }: StrengthBarProps) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  return (
    <div style={barStyles.wrap}>
      <div style={barStyles.labelRow}>
        <span style={{ color: '#aaa', fontSize: 11 }}>{label}</span>
        <span style={{ color, fontSize: 12, fontWeight: 700 }}>{formatNum(value)}</span>
      </div>
      <div style={barStyles.track}>
        <div
          style={{
            ...barStyles.fill,
            width: `${pct}%`,
            background: color,
            transition: animate ? 'width 0.8s ease-out' : 'none',
          }}
        />
      </div>
    </div>
  )
}

const barStyles: Record<string, React.CSSProperties> = {
  wrap: { marginBottom: 6 },
  labelRow: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  track: {
    height: 8,
    background: '#1a1a1a',
    borderRadius: 2,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 2,
  },
}

interface CasualtyListProps {
  casualties: Ships
  defCasualties?: Record<string, number>
  side: 'attacker' | 'defender'
  animate: boolean
}

function CasualtyList({ casualties, defCasualties, side, animate }: CasualtyListProps) {
  const all: Array<{ key: string; count: number }> = []
  for (const [k, v] of Object.entries(casualties)) {
    if ((v ?? 0) > 0) all.push({ key: k, count: v! })
  }
  if (defCasualties) {
    for (const [k, v] of Object.entries(defCasualties)) {
      if ((v ?? 0) > 0) all.push({ key: k, count: v! })
    }
  }

  if (all.length === 0) {
    return <span style={{ color: '#444', fontSize: 11 }}>No losses this round</span>
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {all.map(({ key, count }) => (
        <div
          key={key}
          title={SHIP_LABEL[key] ?? key}
          style={{
            ...casualtyStyles.chip,
            opacity: animate ? 1 : 0.3,
            transition: animate ? 'opacity 0.4s ease-in' : 'none',
            borderColor: side === 'attacker' ? '#88ccff44' : '#ffcc8844',
          }}
        >
          {SHIP_IMAGE[key] && (
            <img
              src={SHIP_IMAGE[key]}
              alt={SHIP_LABEL[key] ?? key}
              style={casualtyStyles.img}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          )}
          <span style={{ color: '#ff4444', fontSize: 11, fontWeight: 700 }}>-{count}</span>
          <span style={{ color: '#666', fontSize: 10 }}>{SHIP_LABEL[key] ?? key}</span>
        </div>
      ))}
    </div>
  )
}

const casualtyStyles: Record<string, React.CSSProperties> = {
  chip: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
    padding: '4px 6px',
    background: '#0d0d0d',
    border: '1px solid #222',
    borderRadius: 3,
    minWidth: 56,
  },
  img: {
    width: 40,
    height: 30,
    objectFit: 'contain',
    filter: 'grayscale(0.3)',
  },
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function CombatReplay({ battleData, attackerName, defenderName, onClose }: CombatReplayProps) {
  const rounds: BattleRound[] = (battleData?.rounds as BattleRound[]) ?? []
  const winner = (battleData?.winner as string) ?? 'draw'
  const loot: Resources = (battleData?.loot as Resources) ?? { metal: 0, crystal: 0, deuterium: 0 }
  const debris: Resources = (battleData?.debrisField as Resources) ?? { metal: 0, crystal: 0, deuterium: 0 }
  const attackerLosses: Resources = (battleData?.attackerLosses as Resources) ?? { metal: 0, crystal: 0, deuterium: 0 }
  const defenderLosses: Resources = (battleData?.defenderLosses as Resources) ?? { metal: 0, crystal: 0, deuterium: 0 }

  const [currentRound, setCurrentRound] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [animated, setAnimated] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const totalRounds = rounds.length

  // Compute initial fleet size from round 0 survivors + casualties in round 1
  const initialAttackerFleet = totalRounds > 0
    ? totalFleet(rounds[0].attacker.ships) + totalFleet(rounds[0].attackerCasualties)
    : 0
  const initialDefenderFleet = totalRounds > 0
    ? totalFleet(rounds[0].defender.ships) + totalFleet(rounds[0].defenderCasualties)
    : 0
  const maxFleet = Math.max(initialAttackerFleet, initialDefenderFleet, 1)

  // Current round data (index into rounds array, 0 = round 1)
  const roundData = rounds[currentRound] ?? null

  const attackerAlive = totalFleet(roundData?.attacker?.ships)
  const defenderAlive = totalFleet(roundData?.defender?.ships)

  // Trigger animation whenever round changes
  useEffect(() => {
    setAnimated(false)
    const t = setTimeout(() => setAnimated(true), 50)
    return () => clearTimeout(t)
  }, [currentRound])

  const advance = useCallback(() => {
    setCurrentRound((r) => {
      if (r < totalRounds - 1) return r + 1
      setPlaying(false)
      return r
    })
  }, [totalRounds])

  // Auto-play timer
  useEffect(() => {
    if (playing) {
      timerRef.current = setTimeout(advance, 1500)
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [playing, currentRound, advance])

  // Keyboard: Escape closes, left/right scrub rounds, space play/pause
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === 'ArrowRight') setCurrentRound((r) => Math.min(r + 1, totalRounds - 1))
      if (e.key === 'ArrowLeft') setCurrentRound((r) => Math.max(r - 1, 0))
      if (e.key === ' ') { e.preventDefault(); setPlaying((p) => !p) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, totalRounds])

  if (totalRounds === 0) {
    return (
      <div style={s.empty}>
        <div style={{ color: '#444', fontSize: 13 }}>No round data available for this battle.</div>
      </div>
    )
  }

  return (
    <div style={s.root}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.headerLeft}>
          <span style={s.title}>COMBAT REPLAY</span>
          <span style={{ color: outcomeColor(winner), fontWeight: 700, fontSize: 14, letterSpacing: 2 }}>
            {outcomeText(winner)}
          </span>
        </div>
        <div style={s.headerRight}>
          <span style={{ color: '#88ccff', fontSize: 13 }}>{attackerName ?? 'Attacker'}</span>
          <span style={{ color: '#555', fontSize: 13 }}> vs </span>
          <span style={{ color: '#ffcc88', fontSize: 13 }}>{defenderName ?? 'Defender'}</span>
          <button style={s.closeBtn} onClick={onClose}>✕</button>
        </div>
      </div>

      {/* Round strength bars */}
      <div style={s.barsSection}>
        <div style={s.barsCol}>
          <div style={{ color: '#88ccff', fontSize: 11, letterSpacing: 1, marginBottom: 6 }}>ATTACKER FLEET</div>
          <StrengthBar
            label="Remaining ships"
            value={attackerAlive}
            max={maxFleet}
            color="#88ccff"
            animate={animated}
          />
        </div>
        <div style={s.roundBadge}>
          <div style={s.roundNum}>R{currentRound + 1}</div>
          <div style={{ color: '#444', fontSize: 10 }}>of {totalRounds}</div>
        </div>
        <div style={s.barsCol}>
          <div style={{ color: '#ffcc88', fontSize: 11, letterSpacing: 1, marginBottom: 6 }}>DEFENDER FLEET</div>
          <StrengthBar
            label="Remaining ships"
            value={defenderAlive}
            max={maxFleet}
            color="#ffcc88"
            animate={animated}
          />
        </div>
      </div>

      {/* Casualties this round */}
      {roundData && (
        <div style={s.casualtySection}>
          <div style={s.casualtySide}>
            <div style={s.casualtyLabel}>ATTACKER LOSSES (round {currentRound + 1})</div>
            <CasualtyList
              casualties={roundData.attackerCasualties}
              side="attacker"
              animate={animated}
            />
          </div>
          <div style={s.casualtySide}>
            <div style={s.casualtyLabel}>DEFENDER LOSSES (round {currentRound + 1})</div>
            <CasualtyList
              casualties={roundData.defenderCasualties}
              defCasualties={roundData.defender.defensesDestroyed as Record<string, number> | undefined}
              side="defender"
              animate={animated}
            />
          </div>
        </div>
      )}

      {/* Playback controls */}
      <div style={s.controls}>
        <button
          style={{ ...s.btn, ...(currentRound === 0 ? s.btnDisabled : {}) }}
          onClick={() => setCurrentRound(0)}
          disabled={currentRound === 0}
          title="Go to first round"
        >⏮</button>
        <button
          style={{ ...s.btn, ...(currentRound === 0 ? s.btnDisabled : {}) }}
          onClick={() => setCurrentRound((r) => Math.max(0, r - 1))}
          disabled={currentRound === 0}
          title="Previous round"
        >◀</button>
        <button
          style={{ ...s.btn, ...s.btnPrimary }}
          onClick={() => setPlaying((p) => !p)}
          title={playing ? 'Pause (Space)' : 'Play (Space)'}
        >
          {playing ? '⏸ Pause' : '▶ Play'}
        </button>
        <button
          style={{ ...s.btn, ...(currentRound >= totalRounds - 1 ? s.btnDisabled : {}) }}
          onClick={() => setCurrentRound((r) => Math.min(totalRounds - 1, r + 1))}
          disabled={currentRound >= totalRounds - 1}
          title="Next round"
        >▶</button>
        <button
          style={{ ...s.btn, ...(currentRound >= totalRounds - 1 ? s.btnDisabled : {}) }}
          onClick={() => setCurrentRound(totalRounds - 1)}
          disabled={currentRound >= totalRounds - 1}
          title="Go to last round"
        >⏭</button>

        {/* Round slider */}
        <input
          type="range"
          min={0}
          max={Math.max(0, totalRounds - 1)}
          value={currentRound}
          onChange={(e) => {
            setPlaying(false)
            setCurrentRound(Number(e.target.value))
          }}
          style={s.slider}
          title={`Round ${currentRound + 1} of ${totalRounds}`}
        />
        <span style={{ color: '#555', fontSize: 11, minWidth: 60 }}>
          Round {currentRound + 1} / {totalRounds}
        </span>
      </div>

      {/* Battle summary: loot + debris */}
      <div style={s.summarySection}>
        <div style={s.summaryBlock}>
          <div style={s.summaryTitle}>LOOT STOLEN</div>
          <div style={s.summaryRow}>
            <span style={{ color: '#cc8844' }}>Metal</span>
            <span style={{ color: '#ccc' }}>{formatNum(loot.metal)}</span>
          </div>
          <div style={s.summaryRow}>
            <span style={{ color: '#44aacc' }}>Crystal</span>
            <span style={{ color: '#ccc' }}>{formatNum(loot.crystal)}</span>
          </div>
          <div style={s.summaryRow}>
            <span style={{ color: '#4488cc' }}>Deuterium</span>
            <span style={{ color: '#ccc' }}>{formatNum(loot.deuterium)}</span>
          </div>
        </div>

        <div style={s.summaryBlock}>
          <div style={s.summaryTitle}>DEBRIS FIELD</div>
          <div style={s.summaryRow}>
            <span style={{ color: '#cc8844' }}>Metal</span>
            <span style={{ color: '#ccc' }}>{formatNum(debris.metal)}</span>
          </div>
          <div style={s.summaryRow}>
            <span style={{ color: '#44aacc' }}>Crystal</span>
            <span style={{ color: '#ccc' }}>{formatNum(debris.crystal)}</span>
          </div>
        </div>

        <div style={s.summaryBlock}>
          <div style={s.summaryTitle}>TOTAL LOSSES</div>
          <div style={s.summaryRow}>
            <span style={{ color: '#88ccff' }}>Attacker</span>
            <span style={{ color: '#ccc' }}>
              {formatNum(attackerLosses.metal + attackerLosses.crystal)}
            </span>
          </div>
          <div style={s.summaryRow}>
            <span style={{ color: '#ffcc88' }}>Defender</span>
            <span style={{ color: '#ccc' }}>
              {formatNum(defenderLosses.metal + defenderLosses.crystal)}
            </span>
          </div>
        </div>
      </div>

      <div style={s.keyHint}>← → arrow keys to scrub rounds · Space to play/pause · Esc to close</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const s: Record<string, React.CSSProperties> = {
  root: {
    background: '#080808',
    border: '1px solid #1a1a1a',
    borderRadius: 4,
    fontFamily: '"Courier New", Courier, monospace',
    color: '#ccc',
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
    overflow: 'hidden',
  },
  empty: {
    padding: 24,
    textAlign: 'center',
    fontFamily: '"Courier New", Courier, monospace',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 14px',
    background: '#050505',
    borderBottom: '1px solid #111',
  },
  headerLeft: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  title: {
    color: '#00ff88',
    fontSize: 12,
    letterSpacing: 3,
    fontWeight: 700,
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  closeBtn: {
    background: 'transparent',
    border: '1px solid #333',
    color: '#888',
    cursor: 'pointer',
    padding: '2px 8px',
    fontSize: 13,
    fontFamily: 'inherit',
    marginLeft: 8,
  },
  barsSection: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '14px 16px',
    borderBottom: '1px solid #111',
  },
  barsCol: {
    flex: 1,
  },
  roundBadge: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    minWidth: 48,
  },
  roundNum: {
    color: '#00ff88',
    fontSize: 20,
    fontWeight: 700,
    letterSpacing: 1,
  },
  casualtySection: {
    display: 'flex',
    gap: 0,
    borderBottom: '1px solid #111',
  },
  casualtySide: {
    flex: 1,
    padding: '10px 14px',
    borderRight: '1px solid #111',
  },
  casualtyLabel: {
    color: '#ff444488',
    fontSize: 10,
    letterSpacing: 1,
    marginBottom: 8,
  },
  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 14px',
    background: '#050505',
    borderBottom: '1px solid #111',
  },
  btn: {
    background: 'transparent',
    border: '1px solid #333',
    color: '#888',
    cursor: 'pointer',
    padding: '4px 8px',
    fontSize: 13,
    fontFamily: 'inherit',
    borderRadius: 2,
  },
  btnPrimary: {
    border: '1px solid #00ff8844',
    color: '#00ff88',
    minWidth: 72,
  },
  btnDisabled: {
    opacity: 0.3,
    cursor: 'default',
  },
  slider: {
    flex: 1,
    accentColor: '#00ff88',
    cursor: 'pointer',
  },
  summarySection: {
    display: 'flex',
    gap: 0,
  },
  summaryBlock: {
    flex: 1,
    padding: '10px 14px',
    borderRight: '1px solid #0d0d0d',
  },
  summaryTitle: {
    color: '#00ff8866',
    fontSize: 10,
    letterSpacing: 2,
    marginBottom: 6,
  },
  summaryRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 12,
    marginBottom: 3,
  },
  keyHint: {
    color: '#2a2a2a',
    fontSize: 10,
    textAlign: 'center',
    padding: '4px 0 6px',
    letterSpacing: 1,
  },
}
