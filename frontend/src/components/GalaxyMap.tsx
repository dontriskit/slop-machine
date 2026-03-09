import { useState, useEffect, useCallback, useRef } from 'react'
import { GameStore } from '../store/gameStore'
import { planetSmallImg } from '../lib/planetUtils'

// ============================================================================
// TYPES (mirror worker/src/game/services/galaxyService.ts)
// ============================================================================

interface DebrisField {
  metal: number
  crystal: number
}

interface SlotPlanet {
  planetId: string
  name: string
  playerName: string
  playerId: string
  allianceTag: string | null
  hasMoon: boolean
  debris: DebrisField | null
  temperature: number
  fields: number
}

interface SystemSlot {
  position: number
  planet: SlotPlanet | null
}

interface SystemView {
  galaxy: number
  system: number
  slots: SystemSlot[]
}

// ============================================================================
// TEMPERATURE RANGE TABLE (matches galaxyService.ts)
// ============================================================================

const TEMP_RANGE: Record<number, [number, number]> = {
  1:  [220, 260],
  2:  [170, 210],
  3:  [120, 160],
  4:  [70,  110],
  5:  [60,  100],
  6:  [50,   90],
  7:  [40,   80],
  8:  [30,   70],
  9:  [20,   60],
  10: [10,   50],
  11: [-10,  30],
  12: [-50, -10],
  13: [-90, -50],
  14: [-130, -90],
  15: [-170, -130],
}

function tempLabel(pos: number): string {
  const range = TEMP_RANGE[pos]
  if (!range) return ''
  return `${range[0]}°..${range[1]}°`
}

function tempColor(pos: number): string {
  const [min] = TEMP_RANGE[pos] ?? [0, 0]
  if (min >= 120) return '#f87171'     // scorching – red
  if (min >= 50)  return '#f59e0b'     // warm – amber
  if (min >= 10)  return '#34d399'     // comfortable – teal
  if (min >= -30) return '#93c5fd'     // cool – light blue
  return '#bfdbfe'                     // frozen – icy blue
}

// ============================================================================
// API HELPERS
// ============================================================================

const API_BASE = '/api'

async function fetchSystemView(galaxy: number, system: number): Promise<SystemView | null> {
  try {
    const res = await fetch(`${API_BASE}/galaxy/${galaxy}/${system}`)
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

async function postColonize(
  playerId: string,
  fromPlanetId: string,
  galaxy: number,
  system: number,
  position: number
): Promise<{ success: boolean; planetId?: string; error?: string }> {
  const res = await fetch(`${API_BASE}/galaxy/colonize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId, fromPlanetId, galaxy, system, position }),
  })
  return res.json()
}

// ============================================================================
// PLANET DETAIL POPUP
// ============================================================================

interface PlanetDetailProps {
  planet: SlotPlanet
  position: number
  galaxy: number
  system: number
  currentPlayerId: string
  onClose: () => void
  onSpy: (planet: SlotPlanet) => void
  onAttack: (planet: SlotPlanet, position: number) => void
}

function PlanetDetail({
  planet,
  position,
  galaxy,
  system,
  currentPlayerId,
  onClose,
  onSpy,
  onAttack,
}: PlanetDetailProps) {
  const isOwn = planet.playerId === currentPlayerId

  return (
    <div style={styles.popup} onClick={(e) => e.stopPropagation()}>
      <div style={styles.popupHeader}>
        <span style={styles.popupTitle}>{planet.name}</span>
        <button style={styles.closeBtn} onClick={onClose}>✕</button>
      </div>

      <div style={styles.popupBody}>
        <div style={styles.popupRow}>
          <span style={styles.popupLabel}>Coord:</span>
          <span style={styles.popupValue}>{galaxy}:{system}:{position}</span>
        </div>
        <div style={styles.popupRow}>
          <span style={styles.popupLabel}>Player:</span>
          <span style={styles.popupValue}>{planet.playerName}</span>
        </div>
        {planet.allianceTag && (
          <div style={styles.popupRow}>
            <span style={styles.popupLabel}>Alliance:</span>
            <span style={{ ...styles.popupValue, color: '#93c5fd' }}>[{planet.allianceTag}]</span>
          </div>
        )}
        <div style={styles.popupRow}>
          <span style={styles.popupLabel}>Temp:</span>
          <span style={{ ...styles.popupValue, color: tempColor(position) }}>
            {planet.temperature}°C
          </span>
        </div>
        <div style={styles.popupRow}>
          <span style={styles.popupLabel}>Fields:</span>
          <span style={styles.popupValue}>{planet.fields}</span>
        </div>
        <div style={styles.popupRow}>
          <span style={styles.popupLabel}>Moon:</span>
          <span style={styles.popupValue}>{planet.hasMoon ? 'Yes' : 'No'}</span>
        </div>
        {planet.debris && (
          <div style={styles.popupRow}>
            <span style={styles.popupLabel}>Debris:</span>
            <span style={{ ...styles.popupValue, color: '#c4b5fd' }}>
              {planet.debris.metal.toLocaleString()}M / {planet.debris.crystal.toLocaleString()}C
            </span>
          </div>
        )}
      </div>

      {!isOwn && (
        <div style={styles.popupActions}>
          <button style={{ ...styles.actionBtn, ...styles.spyBtn }} onClick={() => onSpy(planet)}>
            Spy
          </button>
          <button style={{ ...styles.actionBtn, ...styles.attackBtn }} onClick={() => onAttack(planet, position)}>
            Attack
          </button>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// FLEET DISPATCH DIALOG (attack)
// ============================================================================

interface AttackDialogProps {
  planet: SlotPlanet
  position: number
  galaxy: number
  system: number
  onClose: () => void
}

function AttackDialog({ planet, position, galaxy, system, onClose }: AttackDialogProps) {
  return (
    <div style={styles.popup} onClick={(e) => e.stopPropagation()}>
      <div style={styles.popupHeader}>
        <span style={styles.popupTitle}>Fleet Dispatch</span>
        <button style={styles.closeBtn} onClick={onClose}>✕</button>
      </div>
      <div style={styles.popupBody}>
        <p style={{ color: '#94a3b8', margin: '0 0 8px 0', fontSize: 12 }}>
          Target: {planet.name} ({galaxy}:{system}:{position})
        </p>
        <p style={{ color: '#f87171', fontSize: 11, margin: 0 }}>
          Fleet dispatch not yet implemented — wire to POST /api/fleet/send
        </p>
      </div>
      <div style={styles.popupActions}>
        <button style={{ ...styles.actionBtn, ...styles.attackBtn }}>Send Fleet</button>
        <button style={{ ...styles.actionBtn }} onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}

// ============================================================================
// MAIN GALAXY MAP COMPONENT
// ============================================================================

interface GalaxyMapProps {
  /** The current logged-in player's ID — used to highlight own planets. */
  currentPlayerId?: string
  /** If provided, Galaxy Map renders as a modal overlay; otherwise inline. */
  onClose?: () => void
}

export default function GalaxyMap({ currentPlayerId = 'local-player', onClose }: GalaxyMapProps) {
  const storeGalaxy = GameStore((state) => state.selectedGalaxy)
  const setStoreGalaxy = GameStore((state) => state.setSelectedGalaxy)

  const [galaxy, setGalaxy] = useState<number>(storeGalaxy)
  const [system, setSystem] = useState<number>(1)
  const [jumpInput, setJumpInput] = useState<string>('')
  const [view, setView] = useState<SystemView | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  const [detailPlanet, setDetailPlanet] = useState<{ planet: SlotPlanet; position: number } | null>(null)
  const [attackTarget, setAttackTarget] = useState<{ planet: SlotPlanet; position: number } | null>(null)

  const jumpRef = useRef<HTMLInputElement>(null)

  // Sync galaxy changes back to GameStore so the 3D view stays in sync
  useEffect(() => {
    setStoreGalaxy(galaxy)
  }, [galaxy, setStoreGalaxy])

  // Fetch system data whenever galaxy/system changes
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setView(null)

    fetchSystemView(galaxy, system).then((result) => {
      if (cancelled) return
      setLoading(false)
      if (!result) {
        // Build a stub 15-slot empty view for offline / dev mode
        setView({
          galaxy,
          system,
          slots: Array.from({ length: 15 }, (_, i) => ({ position: i + 1, planet: null })),
        })
      } else {
        setView(result)
      }
    })

    return () => { cancelled = true }
  }, [galaxy, system])

  // ---- Navigation helpers ----

  const prevSystem = useCallback(() => {
    setSystem((s) => (s <= 1 ? 499 : s - 1))
    setDetailPlanet(null)
    setAttackTarget(null)
  }, [])

  const nextSystem = useCallback(() => {
    setSystem((s) => (s >= 499 ? 1 : s + 1))
    setDetailPlanet(null)
    setAttackTarget(null)
  }, [])

  const prevGalaxy = useCallback(() => {
    setGalaxy((g) => (g <= 1 ? 9 : g - 1))
    setDetailPlanet(null)
    setAttackTarget(null)
  }, [])

  const nextGalaxy = useCallback(() => {
    setGalaxy((g) => (g >= 9 ? 1 : g + 1))
    setDetailPlanet(null)
    setAttackTarget(null)
  }, [])

  const handleJump = useCallback(() => {
    // Parse "G:S" or just "S"
    const raw = jumpInput.trim()
    const parts = raw.split(':').map(Number)
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      const [g, s] = parts
      if (g >= 1 && g <= 9 && s >= 1 && s <= 499) {
        setGalaxy(g)
        setSystem(s)
        setJumpInput('')
        setDetailPlanet(null)
        setAttackTarget(null)
        return
      }
    }
    if (parts.length === 1 && !isNaN(parts[0])) {
      const s = parts[0]
      if (s >= 1 && s <= 499) {
        setSystem(s)
        setJumpInput('')
        setDetailPlanet(null)
        setAttackTarget(null)
        return
      }
    }
    setError('Invalid jump target. Use "G:S" (e.g. 2:123) or just a system number.')
  }, [jumpInput])

  // ---- Keyboard navigation ----

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      // Don't hijack input field events
      if (document.activeElement === jumpRef.current) return

      if (e.key === 'ArrowLeft')  { e.preventDefault(); prevSystem() }
      if (e.key === 'ArrowRight') { e.preventDefault(); nextSystem() }
      if (e.key === 'ArrowUp')    { e.preventDefault(); prevGalaxy() }
      if (e.key === 'ArrowDown')  { e.preventDefault(); nextGalaxy() }
    },
    [prevSystem, nextSystem, prevGalaxy, nextGalaxy]
  )

  const handleJumpKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') handleJump()
    },
    [handleJump]
  )

  // ---- Action callbacks ----

  const handleSpy = useCallback((planet: SlotPlanet) => {
    // TODO: dispatch espionage probe via POST /api/fleet/send
    alert(`Spying on ${planet.name} — wire to fleet dispatch`)
  }, [])

  const handleAttack = useCallback((planet: SlotPlanet, position: number) => {
    setDetailPlanet(null)
    setAttackTarget({ planet, position })
  }, [])

  const handleColonize = useCallback(
    async (position: number) => {
      const fromPlanetId = 'homeworld' // TODO: let player choose source planet
      const result = await postColonize(currentPlayerId, fromPlanetId, galaxy, system, position)
      if (result.success) {
        // Refresh view
        const updated = await fetchSystemView(galaxy, system)
        if (updated) setView(updated)
      } else {
        setError(result.error ?? 'Colonization failed')
      }
    },
    [currentPlayerId, galaxy, system]
  )

  // ---- Row color by ownership ----

  function rowStyle(planet: SlotPlanet | null): React.CSSProperties {
    if (!planet) return styles.rowEmpty
    if (planet.playerId === currentPlayerId) return styles.rowOwn
    if (planet.allianceTag) return styles.rowAlliance
    return styles.rowEnemy
  }

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div
      style={styles.container}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      // eslint-disable-next-line jsx-a11y/no-autofocus
      autoFocus
    >
      {/* Close button (modal mode) */}
      {onClose && (
        <button style={styles.mapCloseBtn} onClick={onClose}>
          Close Map
        </button>
      )}

      {/* ---- NAVIGATOR BAR ---- */}
      <div style={styles.navBar}>
        {/* Galaxy selector */}
        <div style={styles.navGroup}>
          <button style={styles.navBtn} onClick={prevGalaxy} title="Prev galaxy (Up)">
            &uarr;
          </button>
          <select
            style={styles.select}
            value={galaxy}
            onChange={(e) => { setGalaxy(Number(e.target.value)); setDetailPlanet(null) }}
          >
            {Array.from({ length: 9 }, (_, i) => i + 1).map((g) => (
              <option key={g} value={g}>Galaxy {g}</option>
            ))}
          </select>
          <button style={styles.navBtn} onClick={nextGalaxy} title="Next galaxy (Down)">
            &darr;
          </button>
        </div>

        {/* System navigator */}
        <div style={styles.navGroup}>
          <button style={styles.navBtn} onClick={prevSystem} title="Prev system (Left)">
            &larr;
          </button>
          <span style={styles.coordDisplay}>{galaxy} : {String(system).padStart(3, '0')}</span>
          <button style={styles.navBtn} onClick={nextSystem} title="Next system (Right)">
            &rarr;
          </button>
        </div>

        {/* Jump input */}
        <div style={styles.navGroup}>
          <input
            ref={jumpRef}
            style={styles.jumpInput}
            type="text"
            placeholder="G:S or S — Enter to jump"
            value={jumpInput}
            onChange={(e) => setJumpInput(e.target.value)}
            onKeyDown={handleJumpKeyDown}
          />
          <button style={styles.navBtn} onClick={handleJump}>Go</button>
        </div>

        {/* Keyboard hint */}
        <span style={styles.keyHint}>
          Arrow keys navigate · Enter jumps
        </span>
      </div>

      {/* ---- ERROR BANNER ---- */}
      {error && (
        <div style={styles.errorBanner}>
          {error}
          <button style={styles.dismissBtn} onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {/* ---- SYSTEM GRID ---- */}
      {loading && <div style={styles.loadingMsg}>Loading system {galaxy}:{system}...</div>}

      {!loading && view && (
        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Pos</th>
                <th style={styles.th}>Temp Range</th>
                <th style={styles.th}>Planet</th>
                <th style={styles.th}>Player</th>
                <th style={styles.th}>Alliance</th>
                <th style={styles.th}>Moon</th>
                <th style={styles.th}>Debris</th>
                <th style={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {view.slots.map((slot) => {
                const { position, planet } = slot
                const isDetailOpen = detailPlanet?.position === position

                return (
                  <tr
                    key={position}
                    style={{ ...styles.row, ...rowStyle(planet) }}
                  >
                    {/* Position + temp colour pill */}
                    <td style={styles.td}>
                      <span style={{ ...styles.posBadge, background: tempColor(position) }}>
                        {position}
                      </span>
                    </td>

                    {/* Temperature range for this slot */}
                    <td style={{ ...styles.td, color: tempColor(position), fontSize: 11 }}>
                      {tempLabel(position)}
                    </td>

                    {/* Planet name — clickable to open detail */}
                    <td style={styles.td}>
                      {planet ? (
                        <button
                          style={{ ...styles.planetNameBtn, display: 'inline-flex', alignItems: 'center', gap: 5 }}
                          onClick={() =>
                            setDetailPlanet(isDetailOpen ? null : { planet, position })
                          }
                        >
                          <img
                            src={planetSmallImg(position)}
                            alt=""
                            width={24}
                            height={24}
                            style={{ borderRadius: '50%', flexShrink: 0 }}
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                          />
                          {planet.name}
                          {isDetailOpen && (
                            <PlanetDetail
                              planet={planet}
                              position={position}
                              galaxy={galaxy}
                              system={system}
                              currentPlayerId={currentPlayerId}
                              onClose={() => setDetailPlanet(null)}
                              onSpy={handleSpy}
                              onAttack={handleAttack}
                            />
                          )}
                        </button>
                      ) : (
                        <span style={{ color: '#334155', fontSize: 11 }}>(empty)</span>
                      )}
                    </td>

                    {/* Player */}
                    <td style={styles.td}>
                      {planet ? (
                        <span style={planet.playerId === currentPlayerId ? { color: '#34d399' } : { color: '#e2e8f0' }}>
                          {planet.playerName}
                        </span>
                      ) : (
                        <span style={{ color: '#334155' }}>—</span>
                      )}
                    </td>

                    {/* Alliance tag */}
                    <td style={styles.td}>
                      {planet?.allianceTag ? (
                        <span style={{ color: '#93c5fd' }}>[{planet.allianceTag}]</span>
                      ) : (
                        <span style={{ color: '#334155' }}>—</span>
                      )}
                    </td>

                    {/* Moon indicator */}
                    <td style={{ ...styles.td, textAlign: 'center' }}>
                      {planet?.hasMoon ? (
                        <span title="Moon present" style={{ color: '#c4b5fd' }}>M</span>
                      ) : (
                        <span style={{ color: '#334155' }}>—</span>
                      )}
                    </td>

                    {/* Debris field */}
                    <td style={{ ...styles.td, fontSize: 11 }}>
                      {planet?.debris ? (
                        <span style={{ color: '#a5b4fc' }} title={`${planet.debris.metal}M / ${planet.debris.crystal}C`}>
                          D
                        </span>
                      ) : (
                        <span style={{ color: '#334155' }}>—</span>
                      )}
                    </td>

                    {/* Action buttons */}
                    <td style={{ ...styles.td, whiteSpace: 'nowrap' }}>
                      {planet ? (
                        planet.playerId !== currentPlayerId ? (
                          <>
                            <button
                              style={{ ...styles.actionBtn, ...styles.spyBtn }}
                              onClick={() => handleSpy(planet)}
                              title={`Spy ${planet.name}`}
                            >
                              Spy
                            </button>
                            <button
                              style={{ ...styles.actionBtn, ...styles.attackBtn }}
                              onClick={() => handleAttack(planet, position)}
                              title={`Attack ${planet.name}`}
                            >
                              Attack
                            </button>
                          </>
                        ) : (
                          <span style={{ color: '#34d399', fontSize: 11 }}>Own</span>
                        )
                      ) : (
                        <button
                          style={{ ...styles.actionBtn, ...styles.colonizeBtn }}
                          onClick={() => handleColonize(position)}
                          title={`Colonize position ${position}`}
                        >
                          Colonize
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ---- ATTACK DIALOG ---- */}
      {attackTarget && (
        <div style={styles.overlay} onClick={() => setAttackTarget(null)}>
          <AttackDialog
            planet={attackTarget.planet}
            position={attackTarget.position}
            galaxy={galaxy}
            system={system}
            onClose={() => setAttackTarget(null)}
          />
        </div>
      )}
    </div>
  )
}

// ============================================================================
// STYLES
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'relative',
    background: 'rgba(8,14,28,0.95)',
    backdropFilter: 'blur(16px)',
    border: '1px solid rgba(91,156,246,0.2)',
    borderRadius: 10,
    padding: 16,
    color: '#e2e8f0',
    fontFamily: "'Inter', system-ui, sans-serif",
    outline: 'none',
    maxHeight: '90vh',
    overflowY: 'auto',
    minWidth: 680,
  },

  mapCloseBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    background: 'rgba(248,113,113,0.12)',
    border: '1px solid rgba(248,113,113,0.3)',
    color: '#f87171',
    cursor: 'pointer',
    fontFamily: "'Inter', system-ui, sans-serif",
    borderRadius: 6,
    padding: '4px 10px',
    fontSize: 12,
  },

  // ---- Navigator ----
  navBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    marginBottom: 14,
    flexWrap: 'wrap',
  },
  navGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  navBtn: {
    background: 'rgba(91,156,246,0.12)',
    border: '1px solid rgba(91,156,246,0.3)',
    color: '#93c5fd',
    cursor: 'pointer',
    fontFamily: "'Inter', system-ui, sans-serif",
    borderRadius: 6,
    padding: '4px 10px',
    fontSize: 14,
    transition: 'background 0.15s',
  },
  select: {
    background: 'rgba(8,14,28,0.9)',
    border: '1px solid rgba(91,156,246,0.3)',
    color: '#e2e8f0',
    fontFamily: "'Inter', system-ui, sans-serif",
    borderRadius: 6,
    padding: '4px 8px',
    fontSize: 13,
    cursor: 'pointer',
  },
  coordDisplay: {
    fontSize: 18,
    fontWeight: 600,
    color: '#5b9cf6',
    minWidth: 100,
    textAlign: 'center',
  },
  jumpInput: {
    background: 'rgba(8,14,28,0.9)',
    border: '1px solid rgba(91,156,246,0.2)',
    color: '#e2e8f0',
    fontFamily: "'Inter', system-ui, sans-serif",
    borderRadius: 6,
    padding: '4px 8px',
    fontSize: 12,
    width: 180,
  },
  keyHint: {
    color: '#64748b',
    fontSize: 10,
    letterSpacing: 0.5,
    marginLeft: 'auto',
  },

  // ---- Error banner ----
  errorBanner: {
    background: 'rgba(248,113,113,0.1)',
    border: '1px solid rgba(248,113,113,0.3)',
    color: '#f87171',
    borderRadius: 6,
    padding: '6px 12px',
    fontSize: 12,
    marginBottom: 10,
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  dismissBtn: {
    background: 'transparent',
    border: '1px solid rgba(248,113,113,0.4)',
    color: '#f87171',
    cursor: 'pointer',
    fontFamily: "'Inter', system-ui, sans-serif",
    borderRadius: 4,
    padding: '2px 8px',
    fontSize: 11,
    marginLeft: 'auto',
  },

  // ---- Loading ----
  loadingMsg: {
    color: '#64748b',
    fontSize: 13,
    textAlign: 'center',
    padding: 20,
  },

  // ---- Table ----
  tableWrapper: {
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 12,
  },
  th: {
    padding: '6px 10px',
    textAlign: 'left',
    borderBottom: '1px solid rgba(91,156,246,0.15)',
    color: '#5b9cf6',
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 0.5,
    whiteSpace: 'nowrap',
  },
  row: {
    transition: 'filter 0.1s',
  },
  rowEmpty: {
    background: 'transparent',
  },
  rowOwn: {
    background: 'rgba(52,211,153,0.05)',
  },
  rowAlliance: {
    background: 'rgba(147,197,253,0.05)',
  },
  rowEnemy: {
    background: 'rgba(248,113,113,0.04)',
  },
  td: {
    padding: '5px 10px',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
    verticalAlign: 'middle',
    color: '#e2e8f0',
  },

  // ---- Position badge ----
  posBadge: {
    display: 'inline-block',
    width: 22,
    height: 22,
    borderRadius: '50%',
    textAlign: 'center',
    lineHeight: '22px',
    fontSize: 11,
    fontWeight: 'bold',
    color: '#000',
  },

  // ---- Planet name button ----
  planetNameBtn: {
    background: 'transparent',
    border: 'none',
    color: '#93c5fd',
    cursor: 'pointer',
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: 12,
    padding: 0,
    position: 'relative',
    textDecoration: 'underline',
  },

  // ---- Action buttons ----
  actionBtn: {
    background: 'rgba(91,156,246,0.12)',
    border: '1px solid rgba(91,156,246,0.3)',
    color: '#93c5fd',
    cursor: 'pointer',
    fontFamily: "'Inter', system-ui, sans-serif",
    borderRadius: 6,
    padding: '2px 8px',
    fontSize: 11,
    marginRight: 4,
    transition: 'background 0.15s',
  },
  spyBtn: {
    borderColor: 'rgba(245,158,11,0.4)',
    color: '#f59e0b',
    background: 'rgba(245,158,11,0.1)',
  },
  attackBtn: {
    borderColor: 'rgba(248,113,113,0.4)',
    color: '#f87171',
    background: 'rgba(248,113,113,0.1)',
  },
  colonizeBtn: {
    borderColor: 'rgba(52,211,153,0.4)',
    color: '#34d399',
    background: 'rgba(52,211,153,0.1)',
  },

  // ---- Popup ----
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  popup: {
    background: 'rgba(8,14,28,0.98)',
    backdropFilter: 'blur(16px)',
    border: '1px solid rgba(91,156,246,0.2)',
    borderRadius: 10,
    minWidth: 280,
    fontFamily: "'Inter', system-ui, sans-serif",
    color: '#e2e8f0',
    position: 'absolute',
    top: '100%',
    left: 0,
    zIndex: 999,
    marginTop: 4,
  },
  popupHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    borderBottom: '1px solid rgba(91,156,246,0.15)',
  },
  popupTitle: {
    fontWeight: 600,
    color: '#5b9cf6',
    fontSize: 13,
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: '#64748b',
    cursor: 'pointer',
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: 14,
    transition: 'color 0.15s',
  },
  popupBody: {
    padding: '8px 12px',
  },
  popupRow: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: 4,
    gap: 16,
  },
  popupLabel: {
    color: '#64748b',
    fontSize: 11,
  },
  popupValue: {
    color: '#e2e8f0',
    fontSize: 11,
  },
  popupActions: {
    display: 'flex',
    gap: 8,
    padding: '8px 12px',
    borderTop: '1px solid rgba(91,156,246,0.15)',
  },
}
