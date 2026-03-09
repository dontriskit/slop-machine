/**
 * DefensePanel.tsx
 *
 * Planetary defense construction UI:
 * - Grid of all defense types with stats, costs, prerequisites
 * - Quantity selector per defense
 * - Build button (POST /api/defense/build)
 * - Live build queue with countdown timer
 * - Shows current defense counts on planet
 * - Green retro-terminal aesthetic matching HUD.tsx
 */

import { useState, useEffect, useCallback } from 'react'
import { DEFAULT_PLANET_ID } from '../lib/config'
import { GameStore } from '../store/gameStore'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DefenseKey =
  | 'rocketLauncher'
  | 'lightLaser'
  | 'heavyLaser'
  | 'gaussCannon'
  | 'ionCannon'
  | 'plasmaTurret'
  | 'smallShieldDome'
  | 'largeShieldDome'
  | 'antiBallisticMissile'
  | 'interplanetaryMissile'

interface DefenseCost {
  metal: number
  crystal: number
  deuterium: number
}

interface DefenseStats {
  hull: number
  shield: number
  attack: number
}

interface DefenseQueueItem {
  defenseType: DefenseKey
  count: number
  totalTime: number     // seconds
  startedAt?: number    // unix ms
  completed?: number    // units done
}

interface DefenseQueue {
  orders: DefenseQueueItem[]
  currentOrder: DefenseQueueItem | null
  currentProgress: number
  startedAt: number
}

interface DefenseOnPlanet {
  planetId: string
  defenses: Record<DefenseKey, number>
}

// ---------------------------------------------------------------------------
// Static defense data (mirrors worker/src/game/defenses.ts)
// ---------------------------------------------------------------------------

const DEFENSE_COSTS: Record<DefenseKey, DefenseCost> = {
  rocketLauncher:        { metal: 2000,  crystal: 0,     deuterium: 0 },
  lightLaser:            { metal: 1500,  crystal: 500,   deuterium: 0 },
  heavyLaser:            { metal: 6000,  crystal: 2000,  deuterium: 0 },
  gaussCannon:           { metal: 20000, crystal: 15000, deuterium: 2000 },
  ionCannon:             { metal: 2000,  crystal: 6000,  deuterium: 0 },
  plasmaTurret:          { metal: 50000, crystal: 50000, deuterium: 30000 },
  smallShieldDome:       { metal: 10000, crystal: 10000, deuterium: 0 },
  largeShieldDome:       { metal: 50000, crystal: 50000, deuterium: 0 },
  antiBallisticMissile:  { metal: 8000,  crystal: 2000,  deuterium: 0 },
  interplanetaryMissile: { metal: 12500, crystal: 2500,  deuterium: 10000 },
}

const DEFENSE_STATS: Record<DefenseKey, DefenseStats> = {
  rocketLauncher:        { hull: 2000,   shield: 20,    attack: 80 },
  lightLaser:            { hull: 2000,   shield: 25,    attack: 100 },
  heavyLaser:            { hull: 8000,   shield: 100,   attack: 250 },
  gaussCannon:           { hull: 35000,  shield: 200,   attack: 1100 },
  ionCannon:             { hull: 8000,   shield: 500,   attack: 150 },
  plasmaTurret:          { hull: 100000, shield: 300,   attack: 3000 },
  smallShieldDome:       { hull: 20000,  shield: 2000,  attack: 1 },
  largeShieldDome:       { hull: 100000, shield: 10000, attack: 1 },
  antiBallisticMissile:  { hull: 8000,   shield: 1,     attack: 1 },
  interplanetaryMissile: { hull: 15000,  shield: 1,     attack: 12000 },
}

const DEFENSE_NAMES: Record<DefenseKey, string> = {
  rocketLauncher:        'Rocket Launcher',
  lightLaser:            'Light Laser',
  heavyLaser:            'Heavy Laser',
  gaussCannon:           'Gauss Cannon',
  ionCannon:             'Ion Cannon',
  plasmaTurret:          'Plasma Turret',
  smallShieldDome:       'Small Shield Dome',
  largeShieldDome:       'Large Shield Dome',
  antiBallisticMissile:  'Anti-Ballistic Missile',
  interplanetaryMissile: 'Interplanetary Missile',
}

const DEFENSE_DESCRIPTIONS: Record<DefenseKey, string> = {
  rocketLauncher:        'Basic defense. No tech required. High quantity.',
  lightLaser:            'Fast-firing laser. Requires Laser Tech Lv3.',
  heavyLaser:            'High-damage laser. Requires Laser Tech Lv6.',
  gaussCannon:           'Long-range cannon with strong hull. Requires Weapons Lv3.',
  ionCannon:             'Shield-disrupting ion beam. Requires Ion Tech Lv4.',
  plasmaTurret:          'Ultimate fixed defense. Requires Plasma Tech Lv7.',
  smallShieldDome:       'Protects the entire planet. Max 1. Requires Shielding Lv2.',
  largeShieldDome:       'Massive shield dome. Max 1. Requires Shielding Lv6.',
  antiBallisticMissile:  'Intercepts incoming IPMs 1:1. Silo required.',
  interplanetaryMissile: 'Attacks enemy planets from afar. Silo required.',
}

// Prerequisites: tech key -> minimum level  (simplified for display)
const DEFENSE_PREREQS: Record<DefenseKey, { label: string; level: number }[]> = {
  rocketLauncher:        [],
  lightLaser:            [{ label: 'Laser Tech', level: 3 }],
  heavyLaser:            [{ label: 'Laser Tech', level: 6 }, { label: 'Energy Tech', level: 3 }],
  gaussCannon:           [{ label: 'Weapons Tech', level: 3 }, { label: 'Shielding Tech', level: 1 }, { label: 'Energy Tech', level: 6 }],
  ionCannon:             [{ label: 'Ion Tech', level: 4 }],
  plasmaTurret:          [{ label: 'Plasma Tech', level: 7 }],
  smallShieldDome:       [{ label: 'Shielding Tech', level: 2 }],
  largeShieldDome:       [{ label: 'Shielding Tech', level: 6 }],
  antiBallisticMissile:  [{ label: 'Missile Silo', level: 2 }],
  interplanetaryMissile: [{ label: 'Missile Silo', level: 4 }, { label: 'Impulse Drive', level: 1 }],
}

const DEFENSE_IMAGES: Partial<Record<DefenseKey, string>> = {
  rocketLauncher:        '/img/objects/units/rocket_launcher_small.jpg',
  lightLaser:            '/img/objects/units/light_laser_small.jpg',
  heavyLaser:            '/img/objects/units/heavy_laser_small.jpg',
  gaussCannon:           '/img/objects/units/gauss_cannon_small.jpg',
  ionCannon:             '/img/objects/units/ion_cannon_small.jpg',
  plasmaTurret:          '/img/objects/units/plasma_turret_small.jpg',
  smallShieldDome:       '/img/objects/units/small_shield_dome_small.jpg',
  largeShieldDome:       '/img/objects/units/large_shield_dome_small.jpg',
  antiBallisticMissile:  '/img/objects/units/anti_ballistic_missile_small.jpg',
  interplanetaryMissile: '/img/objects/units/interplanetary_missile_small.jpg',
}

const UNIQUE_DEFENSES: Set<DefenseKey> = new Set(['smallShieldDome', 'largeShieldDome'])

const DEFENSE_ORDER: DefenseKey[] = [
  'rocketLauncher', 'lightLaser', 'heavyLaser', 'gaussCannon', 'ionCannon',
  'plasmaTurret', 'smallShieldDome', 'largeShieldDome',
  'antiBallisticMissile', 'interplanetaryMissile',
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(Math.floor(n))
}

function fmtTime(seconds: number): string {
  if (seconds <= 0) return 'Done'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function fmtTimeMs(ms: number): string {
  return fmtTime(Math.max(0, Math.floor(ms / 1000)))
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function apiBuildDefense(
  planetId: string,
  defenseType: string,
  count: number,
  shipyardLevel: number,
): Promise<{ success?: boolean; error?: string } | null> {
  try {
    const res = await fetch('/api/defense/build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planetId, defenseType, count, shipyardLevel }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      return { error: (body as { error?: string }).error ?? `HTTP ${res.status}` }
    }
    return { success: true }
  } catch {
    return null
  }
}

async function apiGetDefenses(planetId: string): Promise<DefenseOnPlanet | null> {
  try {
    const res = await fetch(`/api/defense/${encodeURIComponent(planetId)}`)
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

async function apiGetDefenseQueue(planetId: string): Promise<DefenseQueue | null> {
  try {
    const res = await fetch(`/api/defense/queue/${encodeURIComponent(planetId)}`)
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DefensePanelProps {
  onClose?: () => void
  planetId?: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DefensePanel({ onClose, planetId }: DefensePanelProps) {
  const activePlanetId = GameStore((s) => s.activePlanetId)
  const resources = GameStore((s) => s.resources)
  const buildings = GameStore((s) => s.buildings)

  const pid = planetId ?? activePlanetId ?? DEFAULT_PLANET_ID
  const shipyardLevel = buildings.shipyard ?? 0

  const [defenses, setDefenses]         = useState<Record<DefenseKey, number> | null>(null)
  const [queue, setQueue]               = useState<DefenseQueue | null>(null)
  const [quantities, setQuantities]     = useState<Record<string, number>>({})
  const [loading, setLoading]           = useState(false)
  const [offline, setOffline]           = useState(false)
  const [statusMsg, setStatusMsg]       = useState<string | null>(null)
  const [building, setBuilding]         = useState<string | null>(null)
  const [tick, setTick]                 = useState(0)

  // Countdown ticker
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    const [defData, queueData] = await Promise.all([
      apiGetDefenses(pid),
      apiGetDefenseQueue(pid),
    ])

    if (!defData) {
      setOffline(true)
      // Use empty defaults
      setDefenses({
        rocketLauncher: 0, lightLaser: 0, heavyLaser: 0, gaussCannon: 0,
        ionCannon: 0, plasmaTurret: 0, smallShieldDome: 0, largeShieldDome: 0,
        antiBallisticMissile: 0, interplanetaryMissile: 0,
      })
    } else {
      setDefenses(defData.defenses as Record<DefenseKey, number>)
      setOffline(false)
    }

    setQueue(queueData)
    setLoading(false)
  }, [pid])

  useEffect(() => {
    loadData()
  }, [loadData])

  function showStatus(msg: string, timeout = 4000) {
    setStatusMsg(msg)
    setTimeout(() => setStatusMsg(null), timeout)
  }

  function setQty(key: string, val: number) {
    setQuantities((prev) => ({ ...prev, [key]: Math.max(1, Math.min(9999, val)) }))
  }

  function getQty(key: string): number {
    return quantities[key] ?? 1
  }

  function canAfford(cost: DefenseCost, count: number): boolean {
    return (
      resources.metal >= cost.metal * count &&
      resources.crystal >= cost.crystal * count &&
      resources.deuterium >= cost.deuterium * count
    )
  }

  function isUniqueAlreadyBuilt(key: DefenseKey): boolean {
    if (!UNIQUE_DEFENSES.has(key)) return false
    return (defenses?.[key] ?? 0) >= 1
  }

  async function handleBuild(key: DefenseKey) {
    const count = getQty(key)
    const cost = DEFENSE_COSTS[key]

    if (!canAfford(cost, count)) {
      showStatus('Insufficient resources.')
      return
    }

    if (isUniqueAlreadyBuilt(key)) {
      showStatus(`${DEFENSE_NAMES[key]} is already built (max 1 per planet).`)
      return
    }

    setBuilding(key)
    const result = await apiBuildDefense(pid, key, count, shipyardLevel)
    setBuilding(null)

    if (result === null || result.success) {
      showStatus(`Queued ${count}x ${DEFENSE_NAMES[key]}.`)
      loadData()
    } else if (result.error) {
      showStatus(`Failed: ${result.error}`)
    } else {
      showStatus('Failed to queue defense. Check requirements.')
    }
  }

  // Queue time remaining for active order
  const queueTimeMs =
    queue?.currentOrder && queue.startedAt
      ? Math.max(0, queue.startedAt + queue.currentOrder.totalTime * 1000 - Date.now())
      : 0

  const allOrders = [
    ...(queue?.currentOrder ? [{ ...queue.currentOrder, active: true }] : []),
    ...(queue?.orders ?? []).map((o) => ({ ...o, active: false })),
  ]

  // Calculate build time per unit based on shipyard level
  function buildTimePerUnit(key: DefenseKey): number {
    const cost = DEFENSE_COSTS[key]
    return Math.max(1, Math.floor((cost.metal + cost.crystal) / (2500 * (1 + shipyardLevel))))
  }

  return (
    <div style={s.container}>
      {/* Banner image */}
      <div style={s.bannerWrap}>
        <img src="/img/headers/defense/defense.jpg" alt="Defense" style={s.bannerImg} />
        <span style={s.bannerTitle}>DEFENSE</span>
      </div>

      {/* Header */}
      <div style={s.header}>
        <span style={s.title}>// DEFENSE — PLANETARY PROTECTION</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {offline && <span style={s.offlineBadge}>OFFLINE (mock)</span>}
          {onClose && (
            <button style={s.closeBtn} onClick={onClose}>[X]</button>
          )}
        </div>
      </div>

      {/* Shipyard level */}
      <div style={s.levelBar}>
        <span style={s.levelLabel}>Shipyard Level:</span>
        <span style={s.levelValue}>{shipyardLevel}</span>
        {shipyardLevel === 0 && (
          <span style={s.levelWarn}>Shipyard required to build defenses!</span>
        )}
      </div>

      {/* Status */}
      {statusMsg && <div style={s.statusMsg}>{statusMsg}</div>}

      <div style={s.body}>
        {/* Left: defense grid */}
        <div style={s.leftCol}>
          <div style={s.sectionLabel}>DEFENSE STRUCTURES</div>
          {loading ? (
            <div style={s.loadingMsg}>Loading defenses...</div>
          ) : (
            <div style={s.defenseGrid}>
              {DEFENSE_ORDER.map((key) => {
                const cost = DEFENSE_COSTS[key]
                const stats = DEFENSE_STATS[key]
                const qty = getQty(key)
                const affordable = canAfford(cost, qty)
                const isBusy = building === key
                const prereqs = DEFENSE_PREREQS[key]
                const currentCount = defenses?.[key] ?? 0
                const isUnique = UNIQUE_DEFENSES.has(key)
                const alreadyBuilt = isUniqueAlreadyBuilt(key)
                const bTime = buildTimePerUnit(key)

                return (
                  <div
                    key={key}
                    style={{
                      ...s.defCard,
                      ...(alreadyBuilt ? s.defCardBuilt : {}),
                    }}
                  >
                    <div style={s.defHeader}>
                      {DEFENSE_IMAGES[key] && (
                        <img
                          src={DEFENSE_IMAGES[key]}
                          alt={DEFENSE_NAMES[key]}
                          width={48}
                          height={48}
                          style={s.defThumb}
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                        />
                      )}
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={s.defName}>{DEFENSE_NAMES[key]}</span>
                          <span style={s.defCount}>
                            {isUnique ? (alreadyBuilt ? 'BUILT' : 'MAX 1') : `x${currentCount}`}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div style={s.defDesc}>
                      {DEFENSE_DESCRIPTIONS[key]}
                    </div>

                    {/* Combat stats */}
                    <div style={s.statsRow}>
                      <span style={s.statHull} title="Hull">HP:{fmt(stats.hull)}</span>
                      <span style={s.statShield} title="Shield">Sh:{fmt(stats.shield)}</span>
                      <span style={s.statAtk} title="Attack">Atk:{fmt(stats.attack)}</span>
                    </div>

                    {/* Cost */}
                    <div style={s.costRow}>
                      {cost.metal > 0 && (
                        <span style={s.costMetal}>Fe {fmt(cost.metal)}</span>
                      )}
                      {cost.crystal > 0 && (
                        <span style={s.costCrystal}>Si {fmt(cost.crystal)}</span>
                      )}
                      {cost.deuterium > 0 && (
                        <span style={s.costDeut}>D {fmt(cost.deuterium)}</span>
                      )}
                    </div>

                    {/* Build time */}
                    <div style={s.buildTime}>
                      Time/unit: {fmtTime(bTime)}
                    </div>

                    {/* Prerequisites */}
                    {prereqs.length > 0 && (
                      <div style={s.prereqRow}>
                        {prereqs.map((p) => (
                          <span key={p.label} style={s.prereqBadge}>
                            {p.label} Lv{p.level}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Quantity + build */}
                    {!alreadyBuilt && (
                      <div style={s.buildRow}>
                        {!isUnique && (
                          <>
                            <button
                              style={s.qtyBtn}
                              onClick={() => setQty(key, qty - 1)}
                            >-</button>
                            <input
                              style={s.qtyInput}
                              type="number"
                              min={1}
                              max={9999}
                              value={qty}
                              onChange={(e) => setQty(key, parseInt(e.target.value) || 1)}
                            />
                            <button
                              style={s.qtyBtn}
                              onClick={() => setQty(key, qty + 1)}
                            >+</button>
                          </>
                        )}
                        <button
                          style={{
                            ...s.buildBtn,
                            ...((!affordable || isBusy) ? s.buildBtnDisabled : {}),
                            ...(isUnique ? { flex: 1 } : {}),
                          }}
                          onClick={() => handleBuild(key)}
                          disabled={isBusy || !affordable}
                          title={!affordable ? 'Not enough resources' : undefined}
                        >
                          {isBusy ? '...' : isUnique ? `BUILD` : `BUILD x${qty}`}
                        </button>
                      </div>
                    )}

                    {/* Total cost preview for batches */}
                    {!isUnique && !alreadyBuilt && qty > 1 && (
                      <div style={{ ...s.costRow, marginTop: 4, opacity: 0.65 }}>
                        <span style={{ color: '#555', fontSize: 10 }}>Total: </span>
                        {cost.metal > 0 && (
                          <span style={{ ...s.costMetal, fontSize: 10 }}>
                            Fe {fmt(cost.metal * qty)}
                          </span>
                        )}
                        {cost.crystal > 0 && (
                          <span style={{ ...s.costCrystal, fontSize: 10 }}>
                            Si {fmt(cost.crystal * qty)}
                          </span>
                        )}
                        {cost.deuterium > 0 && (
                          <span style={{ ...s.costDeut, fontSize: 10 }}>
                            D {fmt(cost.deuterium * qty)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Right: queue + defenses summary */}
        <div style={s.rightCol}>
          <div style={s.sectionLabel}>BUILD QUEUE</div>
          <button style={s.refreshBtn} onClick={loadData}>
            ↺ Refresh
          </button>

          {allOrders.length === 0 ? (
            <div style={s.emptyQueue}>No defenses in queue.</div>
          ) : (
            <div style={s.queueList}>
              {allOrders.map((order, idx) => {
                const isActive = idx === 0 && queue?.currentOrder != null
                const timeLeft = isActive ? queueTimeMs : order.totalTime * 1000
                void tick

                return (
                  <div
                    key={`${order.defenseType}-${idx}`}
                    style={{
                      ...s.queueItem,
                      ...(isActive ? s.queueItemActive : {}),
                    }}
                  >
                    <div style={s.queueDefName}>
                      {DEFENSE_NAMES[order.defenseType as DefenseKey] ?? order.defenseType}
                    </div>
                    <div style={s.queueMeta}>
                      <span style={s.queueCount}>x{order.count}</span>
                      {isActive && order.completed != null && (
                        <span style={s.queueProgress}>{order.completed}/{order.count}</span>
                      )}
                      <span style={s.queueTime}>
                        {isActive ? fmtTimeMs(timeLeft) : fmtTime(order.totalTime)}
                      </span>
                    </div>
                    {isActive && (
                      <div style={s.progressBarWrap}>
                        <div
                          style={{
                            ...s.progressBar,
                            width: `${Math.min(100, 100 - (queueTimeMs / Math.max(1, order.totalTime * 1000)) * 100)}%`,
                          }}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Current defense counts */}
          <div style={s.defSummary}>
            <div style={s.sectionLabel}>CURRENT DEFENSES</div>
            {defenses && DEFENSE_ORDER.map((key) => {
              const count = defenses[key] ?? 0
              if (count === 0) return null
              return (
                <div key={key} style={s.defSummaryRow}>
                  <span style={s.defSummaryName}>{DEFENSE_NAMES[key]}</span>
                  <span style={s.defSummaryCount}>x{count}</span>
                </div>
              )
            })}
            {defenses && DEFENSE_ORDER.every((k) => (defenses[k] ?? 0) === 0) && (
              <div style={{ color: '#444', fontSize: 11, textShadow: 'none' }}>
                No defenses yet.
              </div>
            )}
          </div>

          {/* Resources */}
          <div style={s.resourcesBox}>
            <div style={s.sectionLabel}>RESOURCES</div>
            <div style={s.resRow}>
              <span style={s.resIcon}>Fe</span>
              <span style={s.resVal}>{fmt(resources.metal)}</span>
            </div>
            <div style={s.resRow}>
              <span style={{ ...s.resIcon, color: '#64b4ff' }}>Si</span>
              <span style={s.resVal}>{fmt(resources.crystal)}</span>
            </div>
            <div style={s.resRow}>
              <span style={{ ...s.resIcon, color: '#80ffb0' }}>D</span>
              <span style={s.resVal}>{fmt(resources.deuterium)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const s: Record<string, React.CSSProperties> = {
  container: {
    background: 'rgba(0, 8, 20, 0.97)',
    border: '2px solid #00ff00',
    borderRadius: 4,
    color: '#00ff00',
    fontFamily: "'Courier New', monospace",
    fontSize: 13,
    boxShadow: '0 0 20px rgba(0, 255, 0, 0.3)',
    width: 950,
    maxWidth: '95vw',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    textShadow: '0 0 6px #00ff00',
  },
  bannerWrap: {
    position: 'relative' as const,
    height: 200,
    flexShrink: 0,
    overflow: 'hidden',
  },
  bannerImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
    display: 'block',
    filter: 'brightness(0.6)',
  },
  bannerTitle: {
    position: 'absolute' as const,
    bottom: 16,
    left: 20,
    fontSize: 28,
    fontWeight: 'bold',
    letterSpacing: 6,
    color: '#00ff00',
    textShadow: '0 0 20px #00ff00, 0 2px 8px rgba(0,0,0,0.8)',
    fontFamily: "'Courier New', monospace",
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 16px',
    borderBottom: '1px solid #00ff0033',
    flexShrink: 0,
  },
  title: {
    fontWeight: 'bold',
    fontSize: 14,
    letterSpacing: 2,
    textShadow: '0 0 10px #00ff00',
    color: '#ffff00',
  },
  offlineBadge: {
    fontSize: 10,
    color: '#ff8800',
    border: '1px solid #ff8800',
    borderRadius: 2,
    padding: '1px 6px',
    letterSpacing: 1,
    textShadow: 'none',
  },
  closeBtn: {
    background: 'transparent',
    border: '1px solid #ff4444',
    color: '#ff4444',
    cursor: 'pointer',
    fontFamily: "'Courier New', monospace",
    fontSize: 12,
    padding: '2px 8px',
    borderRadius: 2,
    textShadow: 'none',
  },
  levelBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '6px 16px',
    borderBottom: '1px solid #00ff0022',
    flexShrink: 0,
    fontSize: 12,
  },
  levelLabel: { color: '#006600', opacity: 0.8 },
  levelValue: { color: '#00ffff', fontWeight: 'bold' },
  levelWarn: { color: '#ff8800', marginLeft: 10, fontSize: 11 },
  statusMsg: {
    background: 'rgba(0,255,0,0.06)',
    borderBottom: '1px solid #00ff0033',
    color: '#00ff00',
    fontSize: 12,
    padding: '6px 16px',
    flexShrink: 0,
  },
  body: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  leftCol: {
    flex: 1,
    overflowY: 'auto',
    padding: 14,
    borderRight: '1px solid #00ff0022',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  rightCol: {
    width: 250,
    flexShrink: 0,
    padding: 14,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    overflowY: 'auto',
  },
  sectionLabel: {
    color: '#006600',
    fontSize: 10,
    letterSpacing: 2,
    marginBottom: 4,
    textShadow: 'none',
  },
  loadingMsg: {
    color: '#006600',
    textAlign: 'center',
    padding: 30,
  },
  defenseGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))',
    gap: 10,
  },
  defCard: {
    border: '1px solid #00ff0033',
    borderRadius: 3,
    padding: '10px 12px',
    background: 'rgba(0,255,0,0.02)',
    display: 'flex',
    flexDirection: 'column',
    gap: 5,
  },
  defCardBuilt: {
    borderColor: '#00ffff44',
    background: 'rgba(0,255,255,0.03)',
  },
  defHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
  },
  defThumb: {
    width: 48,
    height: 48,
    objectFit: 'cover' as const,
    borderRadius: 3,
    border: '1px solid #003300',
    flexShrink: 0,
  },
  defName: {
    color: '#00ffff',
    fontWeight: 'bold',
    fontSize: 13,
    textShadow: '0 0 6px #00ffff',
  },
  defCount: {
    color: '#ffff00',
    fontSize: 12,
    fontWeight: 'bold',
    textShadow: '0 0 4px #ffff00',
  },
  defDesc: {
    color: '#006600',
    fontSize: 10,
    lineHeight: 1.3,
    textShadow: 'none',
  },
  statsRow: {
    display: 'flex',
    gap: 8,
    fontSize: 10,
  },
  statHull: {
    color: '#a0a0a0',
    background: 'rgba(120,120,120,0.15)',
    padding: '1px 5px',
    borderRadius: 2,
    textShadow: 'none',
  },
  statShield: {
    color: '#64b4ff',
    background: 'rgba(100,180,255,0.1)',
    padding: '1px 5px',
    borderRadius: 2,
    textShadow: 'none',
  },
  statAtk: {
    color: '#ff8844',
    background: 'rgba(255,136,68,0.1)',
    padding: '1px 5px',
    borderRadius: 2,
    textShadow: 'none',
  },
  costRow: {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap',
    fontSize: 11,
  },
  costMetal: {
    color: '#a0a0a0',
    background: 'rgba(160,160,160,0.1)',
    padding: '1px 5px',
    borderRadius: 2,
    textShadow: 'none',
  },
  costCrystal: {
    color: '#64b4ff',
    background: 'rgba(100,180,255,0.1)',
    padding: '1px 5px',
    borderRadius: 2,
    textShadow: 'none',
  },
  costDeut: {
    color: '#80ffb0',
    background: 'rgba(0,200,100,0.1)',
    padding: '1px 5px',
    borderRadius: 2,
    textShadow: 'none',
  },
  buildTime: {
    color: '#555',
    fontSize: 10,
    textShadow: 'none',
  },
  prereqRow: {
    display: 'flex',
    gap: 4,
    flexWrap: 'wrap',
  },
  prereqBadge: {
    fontSize: 9,
    color: '#888',
    border: '1px solid #444',
    borderRadius: 2,
    padding: '0 4px',
    textShadow: 'none',
  },
  buildRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  qtyBtn: {
    background: 'rgba(0,255,0,0.08)',
    border: '1px solid #00ff0066',
    color: '#00ff00',
    cursor: 'pointer',
    fontFamily: "'Courier New', monospace",
    fontSize: 14,
    width: 26,
    height: 26,
    borderRadius: 2,
    textShadow: 'none',
    padding: 0,
  },
  qtyInput: {
    background: 'rgba(0,8,0,0.8)',
    border: '1px solid #006600',
    color: '#00ff00',
    fontFamily: "'Courier New', monospace",
    fontSize: 13,
    width: 52,
    textAlign: 'center',
    borderRadius: 2,
    outline: 'none',
    padding: '2px 4px',
    textShadow: 'none',
  },
  buildBtn: {
    flex: 1,
    background: 'rgba(0,255,0,0.1)',
    border: '1px solid #00ff00',
    color: '#00ff00',
    cursor: 'pointer',
    fontFamily: "'Courier New', monospace",
    fontSize: 11,
    padding: '4px 6px',
    borderRadius: 2,
    boxShadow: '0 0 5px #00ff0033',
    transition: 'background 0.15s',
    textShadow: 'none',
    letterSpacing: 1,
  },
  buildBtnDisabled: {
    background: 'rgba(0,0,0,0.3)',
    border: '1px solid #333',
    color: '#444',
    cursor: 'not-allowed',
    boxShadow: 'none',
  },

  // Queue
  refreshBtn: {
    background: 'transparent',
    border: '1px solid #006600',
    color: '#006600',
    cursor: 'pointer',
    fontFamily: "'Courier New', monospace",
    fontSize: 11,
    padding: '3px 8px',
    borderRadius: 2,
    textShadow: 'none',
    width: '100%',
  },
  emptyQueue: {
    color: '#444',
    fontSize: 12,
    textAlign: 'center',
    padding: '10px 0',
    textShadow: 'none',
  },
  queueList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  queueItem: {
    border: '1px solid #00ff0022',
    borderRadius: 3,
    padding: '8px 10px',
    background: 'rgba(0,255,0,0.01)',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  queueItemActive: {
    borderColor: '#00ffff',
    background: 'rgba(0,255,255,0.05)',
  },
  queueDefName: {
    color: '#00ffff',
    fontSize: 12,
    fontWeight: 'bold',
    textShadow: '0 0 4px #00ffff',
  },
  queueMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 11,
  },
  queueCount: { color: '#00ff00' },
  queueProgress: { color: '#ffff00' },
  queueTime: { color: '#ffff00', fontWeight: 'bold' },
  progressBarWrap: {
    background: 'rgba(0,255,0,0.1)',
    borderRadius: 2,
    height: 4,
    overflow: 'hidden',
  },
  progressBar: {
    background: '#00ff00',
    height: '100%',
    boxShadow: '0 0 6px #00ff00',
    transition: 'width 0.5s linear',
  },

  // Defense summary
  defSummary: {
    borderTop: '1px solid #00ff0022',
    paddingTop: 10,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  defSummaryRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 11,
    color: '#00cc00',
    textShadow: 'none',
  },
  defSummaryName: { opacity: 0.8 },
  defSummaryCount: { color: '#ffff00', fontWeight: 'bold' },

  // Resources
  resourcesBox: {
    borderTop: '1px solid #00ff0022',
    paddingTop: 10,
    marginTop: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 5,
  },
  resRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 12,
  },
  resIcon: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 22,
    height: 22,
    borderRadius: 3,
    fontSize: 10,
    fontWeight: 'bold',
    background: 'rgba(160,160,160,0.2)',
    border: '1px solid #555',
    color: '#e0e0e0',
    textShadow: 'none',
  },
  resVal: {
    color: '#ffffff',
    fontWeight: 'bold',
    textShadow: 'none',
  },
}
