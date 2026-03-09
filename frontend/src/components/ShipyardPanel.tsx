/**
 * ShipyardPanel.tsx
 *
 * Ship construction UI:
 * - Grid of all ship types with stats, costs, prerequisites
 * - Quantity selector per ship
 * - Build button (POST /api/planet/:id/ships/build)
 * - Live build queue with countdown timer
 * - Cockpit glass panel aesthetic
 */

import { useState, useEffect, useCallback } from 'react'
import { DEFAULT_PLANET_ID } from '../lib/config'
import { GameStore } from '../store/gameStore'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ShipType =
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

interface ShipCost {
  metal: number
  crystal: number
  deuterium: number
}

interface ShipInfo {
  shipType: ShipType
  name: string
  cost: ShipCost
  buildTime: number   // seconds per unit
  canBuild: boolean
  requirements: {
    shipyard: number
    techs: Record<string, number>
  }
}

interface ShipQueueOrder {
  shipType: ShipType
  count: number
  totalTime: number    // seconds
  startedAt: number    // unix ms
  completed: number    // units done
}

interface ShipyardQueue {
  orders: ShipQueueOrder[]
  currentOrder: ShipQueueOrder | null
  currentProgress: number
  startedAt: number
}

// ---------------------------------------------------------------------------
// Static ship data (mirrors worker/src/game/services/shipyardService.ts)
// Used as fallback when API is offline
// ---------------------------------------------------------------------------

const SHIP_COSTS: Record<ShipType, ShipCost> = {
  lightFighter:   { metal: 3000,    crystal: 1000,    deuterium: 0 },
  heavyFighter:   { metal: 6000,    crystal: 4000,    deuterium: 0 },
  cruiser:        { metal: 20000,   crystal: 7000,    deuterium: 2000 },
  battleship:     { metal: 45000,   crystal: 15000,   deuterium: 0 },
  battlecruiser:  { metal: 30000,   crystal: 40000,   deuterium: 15000 },
  bomber:         { metal: 50000,   crystal: 25000,   deuterium: 15000 },
  destroyer:      { metal: 60000,   crystal: 50000,   deuterium: 15000 },
  deathstar:      { metal: 5000000, crystal: 4000000, deuterium: 1000000 },
  smallCargo:     { metal: 2000,    crystal: 2000,    deuterium: 0 },
  largeCargo:     { metal: 6000,    crystal: 6000,    deuterium: 0 },
  colonyShip:     { metal: 10000,   crystal: 20000,   deuterium: 10000 },
  recycler:       { metal: 10000,   crystal: 6000,    deuterium: 2000 },
  espionageProbe: { metal: 0,       crystal: 1000,    deuterium: 0 },
}

const SHIP_NAMES: Record<ShipType, string> = {
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
  espionageProbe: 'Espionage Probe',
}

const SHIP_DESCRIPTIONS: Record<ShipType, string> = {
  lightFighter:   'Fast and cheap combat ship. Good for early raids.',
  heavyFighter:   'Slower but tougher combat ship with stronger shields.',
  cruiser:        'Fast medium combat ship with rapid fire vs fighters.',
  battleship:     'Powerful capital ship. Backbone of any attack fleet.',
  battlecruiser:  'Fast capital ship with rapid fire vs various ships.',
  bomber:         'Specialized vs planetary defenses. Slow but effective.',
  destroyer:      'Anti-fighter capital ship with heavy firepower.',
  deathstar:      'Ultimate super weapon. Destroys entire fleets.',
  smallCargo:     'Fast transport ship. Carries 5,000 resources.',
  largeCargo:     'Slow transport ship. Carries 25,000 resources.',
  colonyShip:     'Required to colonize new planets.',
  recycler:       'Collects debris fields after battles.',
  espionageProbe: 'Ultra-fast scouting ship.',
}

// Minimum shipyard level requirement per ship
const SHIP_SHIPYARD_REQ: Record<ShipType, number> = {
  lightFighter:   1,
  heavyFighter:   3,
  cruiser:        5,
  battleship:     7,
  battlecruiser:  8,
  bomber:         8,
  destroyer:      9,
  deathstar:      12,
  smallCargo:     2,
  largeCargo:     4,
  colonyShip:     4,
  recycler:       4,
  espionageProbe: 3,
}

const SHIP_IMAGES: Record<ShipType, string> = {
  lightFighter:   '/img/objects/units/light_fighter_small.jpg',
  heavyFighter:   '/img/objects/units/heavy_fighter_small.jpg',
  cruiser:        '/img/objects/units/cruiser_small.jpg',
  battleship:     '/img/objects/units/battleship_small.jpg',
  battlecruiser:  '/img/objects/units/battlecruiser_small.jpg',
  bomber:         '/img/objects/units/bomber_small.jpg',
  destroyer:      '/img/objects/units/destroyer_small.jpg',
  deathstar:      '/img/objects/units/deathstar_small.jpg',
  smallCargo:     '/img/objects/units/small_cargo_small.jpg',
  largeCargo:     '/img/objects/units/large_cargo_small.jpg',
  colonyShip:     '/img/objects/units/colony_ship_small.jpg',
  recycler:       '/img/objects/units/recycler_small.jpg',
  espionageProbe: '/img/objects/units/espionage_probe_small.jpg',
}

const SHIP_ORDER: ShipType[] = [
  'lightFighter', 'heavyFighter', 'cruiser', 'battleship', 'battlecruiser',
  'bomber', 'destroyer', 'deathstar',
  'smallCargo', 'largeCargo', 'colonyShip', 'recycler', 'espionageProbe',
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

async function apiBuildShip(planetId: string, shipType: string, count: number): Promise<boolean> {
  try {
    const res = await fetch(`/api/planet/${encodeURIComponent(planetId)}/ships/build`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shipType, count }),
    })
    return res.ok
  } catch {
    return false
  }
}

async function apiGetShipQueue(planetId: string): Promise<ShipyardQueue | null> {
  try {
    const res = await fetch(`/api/planet/${encodeURIComponent(planetId)}/ships/queue`)
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

async function apiGetAvailableShips(planetId: string): Promise<ShipInfo[] | null> {
  try {
    const res = await fetch(`/api/planet/${encodeURIComponent(planetId)}/ships/available`)
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ShipyardPanelProps {
  onClose?: () => void
  planetId?: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ShipyardPanel({ onClose, planetId }: ShipyardPanelProps) {
  const activePlanetId = GameStore((s) => s.activePlanetId)
  const resources = GameStore((s) => s.resources)
  const buildings = GameStore((s) => s.buildings)

  const pid = planetId ?? activePlanetId ?? DEFAULT_PLANET_ID
  const shipyardLevel = buildings.shipyard ?? 0

  const [shipInfos, setShipInfos]       = useState<ShipInfo[]>([])
  const [queue, setQueue]               = useState<ShipyardQueue | null>(null)
  const [quantities, setQuantities]     = useState<Record<string, number>>({})
  const [loading, setLoading]           = useState(false)
  const [offline, setOffline]           = useState(false)
  const [statusMsg, setStatusMsg]       = useState<string | null>(null)
  const [building, setBuilding]         = useState<string | null>(null)
  const [tick, setTick]                 = useState(0)   // used to refresh countdown

  // Countdown ticker
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  // Build static fallback list from constants (when API offline)
  const buildFallbackShips = useCallback((): ShipInfo[] => {
    return SHIP_ORDER.map((shipType) => {
      const reqLevel = SHIP_SHIPYARD_REQ[shipType]
      const canBuild = shipyardLevel >= reqLevel
      const cost = SHIP_COSTS[shipType]
      return {
        shipType,
        name: SHIP_NAMES[shipType],
        cost,
        buildTime: Math.floor((cost.metal + cost.crystal) / (2500 * Math.max(1, 1 + shipyardLevel))),
        canBuild,
        requirements: { shipyard: reqLevel, techs: {} },
      }
    })
  }, [shipyardLevel])

  const loadData = useCallback(async () => {
    setLoading(true)
    const [infos, shipQueue] = await Promise.all([
      apiGetAvailableShips(pid),
      apiGetShipQueue(pid),
    ])

    if (!infos) {
      setShipInfos(buildFallbackShips())
      setOffline(true)
    } else {
      setShipInfos(infos as ShipInfo[])
      setOffline(false)
    }

    setQueue(shipQueue)
    setLoading(false)
  }, [pid, buildFallbackShips])

  useEffect(() => {
    loadData()
  }, [loadData])

  function showStatus(msg: string, timeout = 4000) {
    setStatusMsg(msg)
    setTimeout(() => setStatusMsg(null), timeout)
  }

  function setQty(shipType: string, val: number) {
    setQuantities((prev) => ({ ...prev, [shipType]: Math.max(1, Math.min(9999, val)) }))
  }

  function getQty(shipType: string): number {
    return quantities[shipType] ?? 1
  }

  async function handleBuild(ship: ShipInfo) {
    const count = getQty(ship.shipType)
    const totalCost = {
      metal: ship.cost.metal * count,
      crystal: ship.cost.crystal * count,
      deuterium: ship.cost.deuterium * count,
    }

    // Client-side resource check
    if (
      resources.metal < totalCost.metal ||
      resources.crystal < totalCost.crystal ||
      resources.deuterium < totalCost.deuterium
    ) {
      showStatus('Insufficient resources.')
      return
    }

    setBuilding(ship.shipType)
    const ok = await apiBuildShip(pid, ship.shipType, count)
    setBuilding(null)

    if (ok || offline) {
      showStatus(`Queued ${count}x ${ship.name}.`)
      loadData()
    } else {
      showStatus(`Failed to queue ${ship.name}. Check requirements.`)
    }
  }

  // Determine if player can afford a ship
  function canAfford(cost: ShipCost, count: number): boolean {
    return (
      resources.metal >= cost.metal * count &&
      resources.crystal >= cost.crystal * count &&
      resources.deuterium >= cost.deuterium * count
    )
  }

  // Queue time remaining
  const queueTimeMs = queue?.currentOrder
    ? Math.max(
        0,
        queue.startedAt + queue.currentOrder.totalTime * 1000 - Date.now(),
      )
    : 0

  const allOrders = [
    ...(queue?.currentOrder ? [{ ...queue.currentOrder, active: true }] : []),
    ...(queue?.orders ?? []).map((o) => ({ ...o, active: false })),
  ]

  return (
    <div style={s.container}>
      {/* Banner image */}
      <div style={s.bannerWrap}>
        <img src="/img/headers/shipyard/shipyard.jpg" alt="Shipyard" style={s.bannerImg} />
        <span style={s.bannerTitle}>Shipyard</span>
      </div>

      {/* Header */}
      <div style={s.header}>
        <span style={s.title}>Shipyard — Build Queue</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {offline && <span style={s.offlineBadge}>OFFLINE (mock)</span>}
          {onClose && (
            <button style={s.closeBtn} onClick={onClose}>✕</button>
          )}
        </div>
      </div>

      {/* Shipyard level info */}
      <div style={s.levelBar}>
        <span style={s.levelLabel}>Shipyard Level:</span>
        <span style={s.levelValue}>{shipyardLevel}</span>
        {shipyardLevel === 0 && (
          <span style={s.levelWarn}>Build a Shipyard first!</span>
        )}
      </div>

      {/* Status message */}
      {statusMsg && <div style={s.statusMsg}>{statusMsg}</div>}

      <div style={s.body}>
        {/* Left: ship grid */}
        <div style={s.leftCol}>
          <div style={s.sectionLabel}>Ships</div>
          {loading ? (
            <div style={s.loadingMsg}>Loading ships...</div>
          ) : (
            <div style={s.shipGrid}>
              {shipInfos.map((ship) => {
                const qty = getQty(ship.shipType)
                const affordable = canAfford(ship.cost, qty)
                const isBusy = building === ship.shipType
                const reqLevel = ship.requirements?.shipyard ?? SHIP_SHIPYARD_REQ[ship.shipType as ShipType] ?? 1
                const meetsReq = ship.canBuild

                return (
                  <div
                    key={ship.shipType}
                    style={{
                      ...s.shipCard,
                      ...(meetsReq ? {} : s.shipCardLocked),
                    }}
                  >
                    <div style={s.shipHeader}>
                      <img
                        src={SHIP_IMAGES[ship.shipType as ShipType]}
                        alt={ship.name}
                        width={48}
                        height={48}
                        style={s.shipThumb}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                          <span style={s.shipName}>{ship.name}</span>
                          {!meetsReq && (
                            <span style={s.lockBadge}>Lv{reqLevel} req</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div style={s.shipDesc}>
                      {SHIP_DESCRIPTIONS[ship.shipType as ShipType] ?? ''}
                    </div>

                    {/* Cost */}
                    <div style={s.costRow}>
                      {ship.cost.metal > 0 && (
                        <span style={s.costMetal}>Fe {fmt(ship.cost.metal)}</span>
                      )}
                      {ship.cost.crystal > 0 && (
                        <span style={s.costCrystal}>Si {fmt(ship.cost.crystal)}</span>
                      )}
                      {ship.cost.deuterium > 0 && (
                        <span style={s.costDeut}>D {fmt(ship.cost.deuterium)}</span>
                      )}
                    </div>

                    {/* Build time */}
                    <div style={s.buildTime}>
                      Time/unit: {fmtTime(ship.buildTime)}
                    </div>

                    {/* Quantity + Build */}
                    {meetsReq && (
                      <div style={s.buildRow}>
                        <button
                          style={s.qtyBtn}
                          onClick={() => setQty(ship.shipType, qty - 1)}
                        >-</button>
                        <input
                          style={s.qtyInput}
                          type="number"
                          min={1}
                          max={9999}
                          value={qty}
                          onChange={(e) => setQty(ship.shipType, parseInt(e.target.value) || 1)}
                        />
                        <button
                          style={s.qtyBtn}
                          onClick={() => setQty(ship.shipType, qty + 1)}
                        >+</button>
                        <button
                          style={{
                            ...s.buildBtn,
                            ...((!affordable || isBusy) ? s.buildBtnDisabled : {}),
                          }}
                          onClick={() => handleBuild(ship)}
                          disabled={isBusy || !affordable}
                          title={!affordable ? 'Not enough resources' : `Build ${qty}x ${ship.name}`}
                        >
                          {isBusy ? '...' : `BUILD x${qty}`}
                        </button>
                      </div>
                    )}

                    {/* Total cost preview */}
                    {meetsReq && qty > 1 && (
                      <div style={{ ...s.costRow, marginTop: 4, opacity: 0.7 }}>
                        <span style={{ color: '#64748b', fontSize: 10 }}>Total: </span>
                        {ship.cost.metal > 0 && (
                          <span style={{ ...s.costMetal, fontSize: 10 }}>
                            Fe {fmt(ship.cost.metal * qty)}
                          </span>
                        )}
                        {ship.cost.crystal > 0 && (
                          <span style={{ ...s.costCrystal, fontSize: 10 }}>
                            Si {fmt(ship.cost.crystal * qty)}
                          </span>
                        )}
                        {ship.cost.deuterium > 0 && (
                          <span style={{ ...s.costDeut, fontSize: 10 }}>
                            D {fmt(ship.cost.deuterium * qty)}
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

        {/* Right: build queue */}
        <div style={s.rightCol}>
          <div style={s.sectionLabel}>Build Queue</div>
          <button style={s.refreshBtn} onClick={loadData} title="Refresh">
            ↺ Refresh
          </button>

          {allOrders.length === 0 ? (
            <div style={s.emptyQueue}>No ships in queue.</div>
          ) : (
            <div style={s.queueList}>
              {allOrders.map((order, idx) => {
                const isActive = idx === 0 && queue?.currentOrder != null
                const timeLeft = isActive ? queueTimeMs : order.totalTime * 1000
                // Suppress linter for tick dependency (used to force re-render)
                void tick

                return (
                  <div
                    key={`${order.shipType}-${idx}`}
                    style={{
                      ...s.queueItem,
                      ...(isActive ? s.queueItemActive : {}),
                    }}
                  >
                    <div style={s.queueShipName}>
                      {SHIP_NAMES[order.shipType as ShipType] ?? order.shipType}
                    </div>
                    <div style={s.queueMeta}>
                      <span style={s.queueCount}>x{order.count}</span>
                      {isActive && order.completed != null && (
                        <span style={s.queueProgress}>
                          {order.completed}/{order.count} done
                        </span>
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

          {/* Current resources */}
          <div style={s.resourcesBox}>
            <div style={s.sectionLabel}>Resources</div>
            <div style={s.resRow}>
              <span style={s.resIcon}>Fe</span>
              <span style={s.resVal}>{fmt(resources.metal)}</span>
            </div>
            <div style={s.resRow}>
              <span style={{ ...s.resIcon, color: '#93c5fd' }}>Si</span>
              <span style={s.resVal}>{fmt(resources.crystal)}</span>
            </div>
            <div style={s.resRow}>
              <span style={{ ...s.resIcon, color: '#34d399' }}>D</span>
              <span style={s.resVal}>{fmt(resources.deuterium)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Styles — cockpit glass panel
// ---------------------------------------------------------------------------

const s: Record<string, React.CSSProperties> = {
  container: {
    background: 'rgba(8,14,28,0.95)',
    backdropFilter: 'blur(16px)',
    border: '1px solid rgba(91,156,246,0.2)',
    borderRadius: 10,
    color: '#e2e8f0',
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: 13,
    width: 900,
    maxWidth: '95vw',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  bannerWrap: {
    position: 'relative' as const,
    height: 200,
    flexShrink: 0,
    overflow: 'hidden',
    borderRadius: '10px 10px 0 0',
  },
  bannerImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
    display: 'block',
    filter: 'brightness(0.5)',
  },
  bannerTitle: {
    position: 'absolute' as const,
    bottom: 16,
    left: 20,
    fontSize: 28,
    fontWeight: 600,
    letterSpacing: 2,
    color: '#e2e8f0',
    textShadow: '0 2px 16px rgba(0,0,0,0.8)',
    fontFamily: "'Inter', system-ui, sans-serif",
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 16px',
    borderBottom: '1px solid rgba(91,156,246,0.15)',
    flexShrink: 0,
  },
  title: {
    fontWeight: 600,
    fontSize: 14,
    color: '#5b9cf6',
  },
  offlineBadge: {
    fontSize: 10,
    color: '#f59e0b',
    border: '1px solid rgba(245,158,11,0.4)',
    borderRadius: 4,
    padding: '1px 6px',
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: '#64748b',
    cursor: 'pointer',
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: 18,
    padding: '2px 6px',
    borderRadius: 4,
    transition: 'color 0.15s',
  },
  levelBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '6px 16px',
    borderBottom: '1px solid rgba(91,156,246,0.1)',
    flexShrink: 0,
    fontSize: 12,
  },
  levelLabel: { color: '#64748b' },
  levelValue: { color: '#5b9cf6', fontWeight: 600 },
  levelWarn: { color: '#f59e0b', marginLeft: 10, fontSize: 11 },
  statusMsg: {
    background: 'rgba(91,156,246,0.06)',
    borderBottom: '1px solid rgba(91,156,246,0.15)',
    color: '#93c5fd',
    fontSize: 12,
    padding: '6px 16px',
    flexShrink: 0,
  },
  body: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
    gap: 0,
  },
  leftCol: {
    flex: 1,
    overflowY: 'auto',
    padding: 14,
    borderRight: '1px solid rgba(91,156,246,0.1)',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  rightCol: {
    width: 240,
    flexShrink: 0,
    padding: 14,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    overflowY: 'auto',
  },
  sectionLabel: {
    color: '#5b9cf6',
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  loadingMsg: {
    color: '#64748b',
    textAlign: 'center',
    padding: 30,
  },
  shipGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
    gap: 10,
  },
  shipCard: {
    border: '1px solid rgba(91,156,246,0.15)',
    borderRadius: 8,
    padding: '10px 12px',
    background: 'rgba(255,255,255,0.02)',
    display: 'flex',
    flexDirection: 'column',
    gap: 5,
    transition: 'border-color 0.15s',
  },
  shipCardLocked: {
    opacity: 0.45,
    borderColor: 'rgba(255,255,255,0.06)',
    background: 'rgba(0,0,0,0.2)',
  },
  shipHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
  },
  shipThumb: {
    width: 48,
    height: 48,
    objectFit: 'cover' as const,
    borderRadius: 4,
    border: '1px solid rgba(91,156,246,0.2)',
    flexShrink: 0,
  },
  shipName: {
    color: '#e2e8f0',
    fontWeight: 600,
    fontSize: 13,
  },
  lockBadge: {
    fontSize: 10,
    color: '#f87171',
    border: '1px solid rgba(248,113,113,0.3)',
    borderRadius: 4,
    padding: '0 4px',
  },
  shipDesc: {
    color: '#64748b',
    fontSize: 10,
    lineHeight: 1.3,
  },
  costRow: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
    fontSize: 11,
  },
  costMetal: {
    color: '#94a3b8',
    background: 'rgba(148,163,184,0.1)',
    padding: '1px 5px',
    borderRadius: 3,
  },
  costCrystal: {
    color: '#93c5fd',
    background: 'rgba(147,197,253,0.1)',
    padding: '1px 5px',
    borderRadius: 3,
  },
  costDeut: {
    color: '#34d399',
    background: 'rgba(52,211,153,0.1)',
    padding: '1px 5px',
    borderRadius: 3,
  },
  buildTime: {
    color: '#64748b',
    fontSize: 10,
  },
  buildRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  qtyBtn: {
    background: 'rgba(91,156,246,0.12)',
    border: '1px solid rgba(91,156,246,0.3)',
    color: '#93c5fd',
    cursor: 'pointer',
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: 14,
    width: 26,
    height: 26,
    borderRadius: 4,
    padding: 0,
  },
  qtyInput: {
    background: 'rgba(8,14,28,0.8)',
    border: '1px solid rgba(91,156,246,0.2)',
    color: '#e2e8f0',
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: 13,
    width: 52,
    textAlign: 'center',
    borderRadius: 4,
    outline: 'none',
    padding: '2px 4px',
  },
  buildBtn: {
    flex: 1,
    background: 'rgba(91,156,246,0.12)',
    border: '1px solid rgba(91,156,246,0.3)',
    color: '#93c5fd',
    cursor: 'pointer',
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: 11,
    padding: '4px 6px',
    borderRadius: 6,
    transition: 'background 0.15s',
    fontWeight: 600,
  },
  buildBtnDisabled: {
    background: 'rgba(0,0,0,0.2)',
    border: '1px solid rgba(255,255,255,0.06)',
    color: '#334155',
    cursor: 'not-allowed',
  },

  // Queue
  refreshBtn: {
    background: 'rgba(91,156,246,0.08)',
    border: '1px solid rgba(91,156,246,0.2)',
    color: '#64748b',
    cursor: 'pointer',
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: 11,
    padding: '3px 8px',
    borderRadius: 6,
    width: '100%',
  },
  emptyQueue: {
    color: '#334155',
    fontSize: 12,
    textAlign: 'center',
    padding: '20px 0',
  },
  queueList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    flex: 1,
  },
  queueItem: {
    border: '1px solid rgba(91,156,246,0.12)',
    borderRadius: 6,
    padding: '8px 10px',
    background: 'rgba(255,255,255,0.02)',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  queueItemActive: {
    borderColor: 'rgba(52,211,153,0.3)',
    background: 'rgba(52,211,153,0.04)',
  },
  queueShipName: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: 600,
  },
  queueMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 11,
    color: '#64748b',
  },
  queueCount: { color: '#93c5fd' },
  queueProgress: { color: '#f59e0b' },
  queueTime: { color: '#f59e0b', fontWeight: 600 },
  progressBarWrap: {
    background: 'rgba(255,255,255,0.04)',
    borderRadius: 2,
    height: 4,
    overflow: 'hidden',
  },
  progressBar: {
    background: 'linear-gradient(90deg, #5b9cf6, #34d399)',
    height: '100%',
    transition: 'width 0.5s linear',
  },

  // Resources sidebar
  resourcesBox: {
    borderTop: '1px solid rgba(91,156,246,0.1)',
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
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: '#94a3b8',
  },
  resVal: {
    color: '#e2e8f0',
    fontWeight: 600,
  },
}
