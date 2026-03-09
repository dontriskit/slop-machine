/**
 * CombatSimulator.tsx — Hologram Raid Planner
 *
 * Simulate battles offline without sending real fleets.
 * Uses POST /api/simulate/battle to run the full OGame engine server-side.
 */

import { useState } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ShipKey =
  | 'lightFighter'
  | 'heavyFighter'
  | 'cruiser'
  | 'battleship'
  | 'battlecruiser'
  | 'bomber'
  | 'destroyer'
  | 'deathstar'
  | 'smallCargo'
  | 'largeCargo'
  | 'colonyShip'
  | 'recycler'
  | 'espionageProbe'

type DefenseKey =
  | 'rocketLauncher'
  | 'lightLaser'
  | 'heavyLaser'
  | 'gaussCannon'
  | 'ionCannon'
  | 'plasmaTurret'
  | 'smallShieldDome'
  | 'largeShieldDome'

interface Resources {
  metal: number
  crystal: number
  deuterium: number
}

interface SimulateRequest {
  attacker: { ships: Record<string, number> }
  defender: { ships: Record<string, number>; defenses: Record<string, number> }
}

interface SimulateResult {
  winner: 'attacker' | 'defender' | 'draw'
  rounds: number
  attackerLosses: Resources
  defenderLosses: Resources
  loot: Resources
  debrisField: Resources
  attackerSurvivors: Record<string, number>
  defenderSurvivors: Record<string, number>
}

// ---------------------------------------------------------------------------
// Static data
// ---------------------------------------------------------------------------

const SHIP_NAMES: Record<ShipKey, string> = {
  lightFighter:   'Light Fighter',
  heavyFighter:   'Heavy Fighter',
  cruiser:        'Cruiser',
  battleship:     'Battleship',
  battlecruiser:  'Battlecruiser',
  bomber:         'Bomber',
  destroyer:      'Destroyer',
  deathstar:      'Deathstar',
  smallCargo:     'Small Cargo',
  largeCargo:     'Large Cargo',
  colonyShip:     'Colony Ship',
  recycler:       'Recycler',
  espionageProbe: 'Esp. Probe',
}

const SHIP_ORDER: ShipKey[] = [
  'lightFighter', 'heavyFighter', 'cruiser', 'battleship', 'battlecruiser',
  'bomber', 'destroyer', 'deathstar',
  'smallCargo', 'largeCargo', 'colonyShip', 'recycler', 'espionageProbe',
]

// Map ship keys to image filenames in /img/objects/units/
// These images may or may not exist; we fall back gracefully
const SHIP_IMG: Record<ShipKey, string> = {
  lightFighter:   '/img/objects/units/204.gif',
  heavyFighter:   '/img/objects/units/205.gif',
  cruiser:        '/img/objects/units/206.gif',
  battleship:     '/img/objects/units/207.gif',
  battlecruiser:  '/img/objects/units/215.gif',
  bomber:         '/img/objects/units/211.gif',
  destroyer:      '/img/objects/units/213.gif',
  deathstar:      '/img/objects/units/214.gif',
  smallCargo:     '/img/objects/units/202.gif',
  largeCargo:     '/img/objects/units/203.gif',
  colonyShip:     '/img/objects/units/208.gif',
  recycler:       '/img/objects/units/209.gif',
  espionageProbe: '/img/objects/units/210.gif',
}

const DEFENSE_NAMES: Record<DefenseKey, string> = {
  rocketLauncher:  'Rocket Launcher',
  lightLaser:      'Light Laser',
  heavyLaser:      'Heavy Laser',
  gaussCannon:     'Gauss Cannon',
  ionCannon:       'Ion Cannon',
  plasmaTurret:    'Plasma Turret',
  smallShieldDome: 'Small Shield',
  largeShieldDome: 'Large Shield',
}

const DEFENSE_ORDER: DefenseKey[] = [
  'rocketLauncher', 'lightLaser', 'heavyLaser', 'gaussCannon',
  'ionCannon', 'plasmaTurret', 'smallShieldDome', 'largeShieldDome',
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(Math.floor(n))
}

function emptyShips(): Record<ShipKey, number> {
  const r: Partial<Record<ShipKey, number>> = {}
  for (const k of SHIP_ORDER) r[k] = 0
  return r as Record<ShipKey, number>
}

function emptyDefenses(): Record<DefenseKey, number> {
  const r: Partial<Record<DefenseKey, number>> = {}
  for (const k of DEFENSE_ORDER) r[k] = 0
  return r as Record<DefenseKey, number>
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

async function apiSimulate(req: SimulateRequest): Promise<SimulateResult> {
  const res = await fetch('/api/simulate/battle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error(`Server error: ${res.status}`)
  return res.json()
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface FleetInputProps {
  label: string
  ships: Record<string, number>
  onChangeShip: (key: string, val: number) => void
  defenses?: Record<string, number>
  onChangeDefense?: (key: string, val: number) => void
}

function FleetInput({ label, ships, onChangeShip, defenses, onChangeDefense }: FleetInputProps) {
  return (
    <div style={s.fleetCol}>
      <div style={s.fleetLabel}>{label}</div>

      <div style={s.fleetSection}>SHIPS</div>
      <div style={s.unitGrid}>
        {SHIP_ORDER.map((key) => (
          <div key={key} style={s.unitRow}>
            <img
              src={SHIP_IMG[key]}
              alt={SHIP_NAMES[key]}
              style={s.unitImg}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
            <span style={s.unitName}>{SHIP_NAMES[key]}</span>
            <input
              type="number"
              min={0}
              max={99999}
              value={ships[key] || 0}
              onChange={(e) => onChangeShip(key, Math.max(0, parseInt(e.target.value) || 0))}
              style={s.unitInput}
            />
          </div>
        ))}
      </div>

      {defenses && onChangeDefense && (
        <>
          <div style={{ ...s.fleetSection, marginTop: 12 }}>DEFENSES</div>
          <div style={s.unitGrid}>
            {DEFENSE_ORDER.map((key) => (
              <div key={key} style={s.unitRow}>
                <span style={{ ...s.unitImg, display: 'inline-block', width: 28, height: 28 }} />
                <span style={s.unitName}>{DEFENSE_NAMES[key]}</span>
                <input
                  type="number"
                  min={0}
                  max={99999}
                  value={defenses[key] || 0}
                  onChange={(e) => onChangeDefense(key, Math.max(0, parseInt(e.target.value) || 0))}
                  style={s.unitInput}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface CombatSimulatorProps {
  onClose?: () => void
}

export default function CombatSimulator({ onClose }: CombatSimulatorProps) {
  const [attackerShips, setAttackerShips] = useState<Record<string, number>>(emptyShips())
  const [defenderShips, setDefenderShips] = useState<Record<string, number>>(emptyShips())
  const [defenderDefenses, setDefenderDefenses] = useState<Record<string, number>>(emptyDefenses())
  const [result, setResult] = useState<SimulateResult | null>(null)
  const [simulating, setSimulating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function setAttackerShip(key: string, val: number) {
    setAttackerShips((p) => ({ ...p, [key]: val }))
  }
  function setDefenderShip(key: string, val: number) {
    setDefenderShips((p) => ({ ...p, [key]: val }))
  }
  function setDefenderDefense(key: string, val: number) {
    setDefenderDefenses((p) => ({ ...p, [key]: val }))
  }

  async function handleSimulate() {
    setError(null)
    setResult(null)
    setSimulating(true)
    try {
      const res = await apiSimulate({
        attacker: { ships: attackerShips },
        defender: { ships: defenderShips, defenses: defenderDefenses },
      })
      setResult(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Simulation failed')
    } finally {
      setSimulating(false)
    }
  }

  const winnerColor =
    result?.winner === 'attacker' ? '#34d399' :
    result?.winner === 'defender' ? '#f87171' : '#f59e0b'

  return (
    <div style={s.container}>
      {/* Header */}
      <div style={s.header}>
        <span style={s.title}>Hologram Simulator — Raid Planner</span>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={s.badge}>NO LIVE ATTACK</span>
          {onClose && (
            <button style={s.closeBtn} onClick={onClose}>[X]</button>
          )}
        </div>
      </div>

      {/* Fleet inputs */}
      <div style={s.body}>
        <FleetInput
          label="[ ATTACKER FLEET ]"
          ships={attackerShips}
          onChangeShip={setAttackerShip}
        />

        <div style={s.divider}>VS</div>

        <FleetInput
          label="[ DEFENDER FLEET + DEFENSES ]"
          ships={defenderShips}
          onChangeShip={setDefenderShip}
          defenses={defenderDefenses}
          onChangeDefense={setDefenderDefense}
        />
      </div>

      {/* Simulate button */}
      <div style={s.simRow}>
        <button
          style={{ ...s.simBtn, ...(simulating ? s.simBtnBusy : {}) }}
          onClick={handleSimulate}
          disabled={simulating}
        >
          {simulating ? '[ SIMULATING... ]' : '[ SIMULATE BATTLE ]'}
        </button>
      </div>

      {/* Error */}
      {error && <div style={s.errorMsg}>{error}</div>}

      {/* Results */}
      {result && (
        <div style={s.results}>
          <div style={s.resultHeader}>
            <span style={s.resultLabel}>OUTCOME:</span>
            <span style={{ ...s.resultWinner, color: winnerColor }}>
              {result.winner.toUpperCase()} WINS
            </span>
            <span style={s.resultRounds}>({result.rounds} rounds)</span>
          </div>

          <div style={s.resultCols}>
            {/* Attacker losses */}
            <div style={s.resultCol}>
              <div style={s.resultColHeader}>ATTACKER LOSSES</div>
              <LossTable losses={result.attackerLosses} />
              <div style={s.survivorsLabel}>SURVIVORS</div>
              <ShipCountTable counts={result.attackerSurvivors} />
            </div>

            {/* Defender losses */}
            <div style={s.resultCol}>
              <div style={s.resultColHeader}>DEFENDER LOSSES</div>
              <LossTable losses={result.defenderLosses} />
              <div style={s.survivorsLabel}>SURVIVORS</div>
              <ShipCountTable counts={result.defenderSurvivors} />
            </div>

            {/* Loot + debris */}
            <div style={s.resultCol}>
              <div style={s.resultColHeader}>LOOT ESTIMATE</div>
              <ResourceTable res={result.loot} />
              <div style={s.survivorsLabel}>DEBRIS FIELD</div>
              <ResourceTable res={result.debrisField} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Result sub-components
// ---------------------------------------------------------------------------

function LossTable({ losses }: { losses: Resources }) {
  return (
    <div style={s.resTable}>
      <div style={s.resTableRow}>
        <span style={s.resMetal}>Fe</span>
        <span style={s.resVal}>{fmt(losses.metal)}</span>
      </div>
      <div style={s.resTableRow}>
        <span style={s.resCrystal}>Si</span>
        <span style={s.resVal}>{fmt(losses.crystal)}</span>
      </div>
      <div style={s.resTableRow}>
        <span style={s.resDeut}>D</span>
        <span style={s.resVal}>{fmt(losses.deuterium)}</span>
      </div>
    </div>
  )
}

function ResourceTable({ res }: { res: Resources }) {
  return (
    <div style={s.resTable}>
      <div style={s.resTableRow}>
        <span style={s.resMetal}>Fe</span>
        <span style={s.resVal}>{fmt(res.metal)}</span>
      </div>
      <div style={s.resTableRow}>
        <span style={s.resCrystal}>Si</span>
        <span style={s.resVal}>{fmt(res.crystal)}</span>
      </div>
      <div style={s.resTableRow}>
        <span style={s.resDeut}>D</span>
        <span style={s.resVal}>{fmt(res.deuterium)}</span>
      </div>
    </div>
  )
}

function ShipCountTable({ counts }: { counts: Record<string, number> }) {
  const entries = Object.entries(counts).filter(([, v]) => v > 0)
  if (entries.length === 0) return <div style={s.noSurvivors}>None</div>
  return (
    <div style={s.survivorsList}>
      {entries.map(([key, val]) => (
        <div key={key} style={s.survivorRow}>
          <span style={s.survivorName}>
            {SHIP_NAMES[key as ShipKey] ?? key}
          </span>
          <span style={s.survivorCount}>{fmt(val)}</span>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const s: Record<string, React.CSSProperties> = {
  container: {
    background: 'rgba(8,14,28,0.95)',
    backdropFilter: 'blur(16px)',
    border: '1px solid rgba(91,156,246,0.2)',
    borderRadius: 10,
    color: '#e2e8f0',
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: 12,
    width: 1100,
    maxWidth: '98vw',
    maxHeight: '92vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: '1px solid rgba(91,156,246,0.15)',
    flexShrink: 0,
  },
  title: {
    fontWeight: 600,
    fontSize: 14,
    color: '#5b9cf6',
  },
  badge: {
    fontSize: 10,
    color: '#34d399',
    border: '1px solid rgba(52,211,153,0.3)',
    borderRadius: 4,
    padding: '1px 6px',
    fontWeight: 500,
  },
  closeBtn: {
    background: 'transparent',
    border: '1px solid rgba(248,113,113,0.4)',
    color: '#f87171',
    cursor: 'pointer',
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: 14,
    padding: '2px 8px',
    borderRadius: 6,
  },
  body: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
    gap: 0,
  },
  fleetCol: {
    flex: 1,
    overflowY: 'auto',
    padding: '12px 14px',
    borderRight: '1px solid rgba(91,156,246,0.1)',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  fleetLabel: {
    color: '#5b9cf6',
    fontWeight: 600,
    fontSize: 13,
    marginBottom: 8,
  },
  fleetSection: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: 1,
    marginBottom: 4,
  },
  unitGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
  },
  unitRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  unitImg: {
    width: 28,
    height: 28,
    objectFit: 'contain',
    flexShrink: 0,
    borderRadius: 3,
    border: '1px solid rgba(91,156,246,0.15)',
    background: 'rgba(0,0,0,0.4)',
  },
  unitName: {
    flex: 1,
    fontSize: 11,
    color: '#e2e8f0',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  unitInput: {
    background: 'rgba(8,14,28,0.8)',
    border: '1px solid rgba(91,156,246,0.3)',
    color: '#e2e8f0',
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: 12,
    width: 64,
    textAlign: 'right',
    borderRadius: 4,
    outline: 'none',
    padding: '2px 5px',
    flexShrink: 0,
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 44,
    flexShrink: 0,
    color: '#f87171',
    fontWeight: 700,
    fontSize: 16,
    borderLeft: '1px solid rgba(91,156,246,0.1)',
    borderRight: '1px solid rgba(91,156,246,0.1)',
  },
  simRow: {
    padding: '10px 16px',
    borderTop: '1px solid rgba(91,156,246,0.15)',
    flexShrink: 0,
    display: 'flex',
    justifyContent: 'center',
  },
  simBtn: {
    background: 'rgba(91,156,246,0.12)',
    border: '1px solid rgba(91,156,246,0.4)',
    color: '#5b9cf6',
    cursor: 'pointer',
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: 14,
    padding: '8px 40px',
    borderRadius: 6,
    fontWeight: 600,
    transition: 'background 0.15s',
  },
  simBtnBusy: {
    cursor: 'not-allowed',
    opacity: 0.6,
  },
  errorMsg: {
    background: 'rgba(248,113,113,0.06)',
    borderTop: '1px solid rgba(248,113,113,0.2)',
    color: '#f87171',
    padding: '6px 16px',
    fontSize: 12,
    flexShrink: 0,
  },
  results: {
    borderTop: '1px solid rgba(91,156,246,0.15)',
    padding: '12px 16px',
    flexShrink: 0,
    background: 'rgba(91,156,246,0.02)',
  },
  resultHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  resultLabel: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: 1,
  },
  resultWinner: {
    fontWeight: 700,
    fontSize: 16,
  },
  resultRounds: {
    color: '#64748b',
    fontSize: 11,
  },
  resultCols: {
    display: 'flex',
    gap: 20,
    flexWrap: 'wrap',
  },
  resultCol: {
    flex: 1,
    minWidth: 160,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  resultColHeader: {
    color: '#f59e0b',
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: 1,
    marginBottom: 4,
  },
  resTable: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    marginBottom: 4,
  },
  resTableRow: {
    display: 'flex',
    gap: 6,
    alignItems: 'center',
    fontSize: 11,
  },
  resMetal: { color: '#94a3b8', width: 16, textAlign: 'center' },
  resCrystal: { color: '#5b9cf6', width: 16, textAlign: 'center' },
  resDeut: { color: '#34d399', width: 16, textAlign: 'center' },
  resVal: { color: '#e2e8f0', fontWeight: 600 },
  survivorsLabel: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: 1,
    marginTop: 6,
    marginBottom: 2,
  },
  survivorsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
  },
  survivorRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 10,
    color: '#e2e8f0',
  },
  survivorName: { color: '#64748b' },
  survivorCount: { color: '#34d399', fontWeight: 600 },
  noSurvivors: { color: '#334155', fontSize: 11 },
}
