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
  if (min >= 120) return '#ff4444'     // scorching – red
  if (min >= 50)  return '#ffaa00'     // warm – orange
  if (min >= 10)  return '#88cc44'     // comfortable – green
  if (min >= -30) return '#44aaff'     // cool – light blue
  return '#aaddff'                     // frozen – icy blue
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
        <button style={styles.closeBtn} onClick={onClose}>X</button>
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
            <span style={{ ...styles.popupValue, color: '#44aaff' }}>[{planet.allianceTag}]</span>
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
            <span style={{ ...styles.popupValue, color: '#aaaaff' }}>
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
        <button style={styles.closeBtn} onClick={onClose}>X</button>
      </div>
      <div style={styles.popupBody}>
        <p style={{ color: '#ccc', margin: '0 0 8px 0', fontSize: 12 }}>
          Target: {planet.name} ({galaxy}:{system}:{position})
        </p>
        <p style={{ color: '#ff4444', fontSize: 11, margin: 0 }}>
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
                        <span style={{ color: '#444', fontSize: 11 }}>(empty)</span>
                      )}
                    </td>

                    {/* Player */}
                    <td style={styles.td}>
                      {planet ? (
                        <span style={planet.playerId === currentPlayerId ? { color: '#00ff88' } : {}}>
                          {planet.playerName}
                        </span>
                      ) : (
                        <span style={{ color: '#333' }}>—</span>
                      )}
                    </td>

                    {/* Alliance tag */}
                    <td style={styles.td}>
                      {planet?.allianceTag ? (
                        <span style={{ color: '#44aaff' }}>[{planet.allianceTag}]</span>
                      ) : (
                        <span style={{ color: '#333' }}>—</span>
                      )}
                    </td>

                    {/* Moon indicator */}
                    <td style={{ ...styles.td, textAlign: 'center' }}>
                      {planet?.hasMoon ? (
                        <span title="Moon present" style={{ color: '#aaaaff' }}>M</span>
                      ) : (
                        <span style={{ color: '#333' }}>—</span>
                      )}
                    </td>

                    {/* Debris field */}
                    <td style={{ ...styles.td, fontSize: 11 }}>
                      {planet?.debris ? (
                        <span style={{ color: '#9988ff' }} title={`${planet.debris.metal}M / ${planet.debris.crystal}C`}>
                          D
                        </span>
                      ) : (
                        <span style={{ color: '#333' }}>—</span>
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
                          <span style={{ color: '#00ff88', fontSize: 11 }}>Own</span>
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
    background: 'rgba(0, 8, 20, 0.96)',
    border: '2px solid #00ff00',
    borderRadius: 6,
    padding: 16,
    color: '#00ff00',
    fontFamily: "'Courier New', monospace",
    outline: 'none',
    boxShadow: '0 0 30px rgba(0, 255, 0, 0.2)',
    maxHeight: '90vh',
    overflowY: 'auto',
    minWidth: 680,
  },

  mapCloseBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    background: 'rgba(255,0,0,0.2)',
    border: '1px solid #ff4444',
    color: '#ff4444',
    cursor: 'pointer',
    fontFamily: "'Courier New', monospace",
    borderRadius: 3,
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
    background: 'rgba(0,255,0,0.1)',
    border: '1px solid #00ff00',
    color: '#00ff00',
    cursor: 'pointer',
    fontFamily: "'Courier New', monospace",
    borderRadius: 3,
    padding: '4px 10px',
    fontSize: 14,
    transition: 'background 0.15s',
  },
  select: {
    background: 'rgba(0,8,20,0.9)',
    border: '1px solid #00ff00',
    color: '#00ff00',
    fontFamily: "'Courier New', monospace",
    borderRadius: 3,
    padding: '4px 8px',
    fontSize: 13,
    cursor: 'pointer',
  },
  coordDisplay: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#00ffff',
    textShadow: '0 0 8px #00ffff',
    minWidth: 100,
    textAlign: 'center',
  },
  jumpInput: {
    background: 'rgba(0,8,20,0.9)',
    border: '1px solid #008800',
    color: '#00ff00',
    fontFamily: "'Courier New', monospace",
    borderRadius: 3,
    padding: '4px 8px',
    fontSize: 12,
    width: 180,
  },
  keyHint: {
    color: '#006600',
    fontSize: 10,
    letterSpacing: 1,
    marginLeft: 'auto',
  },

  // ---- Error banner ----
  errorBanner: {
    background: 'rgba(255,0,0,0.15)',
    border: '1px solid #ff4444',
    color: '#ff8888',
    borderRadius: 3,
    padding: '6px 12px',
    fontSize: 12,
    marginBottom: 10,
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  dismissBtn: {
    background: 'transparent',
    border: '1px solid #ff4444',
    color: '#ff4444',
    cursor: 'pointer',
    fontFamily: "'Courier New', monospace",
    borderRadius: 2,
    padding: '2px 8px',
    fontSize: 11,
    marginLeft: 'auto',
  },

  // ---- Loading ----
  loadingMsg: {
    color: '#008800',
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
    borderBottom: '1px solid #004400',
    color: '#008800',
    fontSize: 11,
    letterSpacing: 1,
    whiteSpace: 'nowrap',
  },
  row: {
    transition: 'filter 0.1s',
  },
  rowEmpty: {
    background: 'transparent',
  },
  rowOwn: {
    background: 'rgba(0, 255, 136, 0.06)',
  },
  rowAlliance: {
    background: 'rgba(68, 170, 255, 0.06)',
  },
  rowEnemy: {
    background: 'rgba(255, 68, 68, 0.04)',
  },
  td: {
    padding: '5px 10px',
    borderBottom: '1px solid #001a00',
    verticalAlign: 'middle',
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
    color: '#00ff00',
    cursor: 'pointer',
    fontFamily: "'Courier New', monospace",
    fontSize: 12,
    padding: 0,
    position: 'relative',
    textDecoration: 'underline',
  },

  // ---- Action buttons ----
  actionBtn: {
    background: 'rgba(0,0,0,0.3)',
    border: '1px solid #555',
    color: '#ccc',
    cursor: 'pointer',
    fontFamily: "'Courier New', monospace",
    borderRadius: 2,
    padding: '2px 8px',
    fontSize: 11,
    marginRight: 4,
    transition: 'background 0.15s',
  },
  spyBtn: {
    borderColor: '#aaaa00',
    color: '#ffff44',
  },
  attackBtn: {
    borderColor: '#ff4444',
    color: '#ff8888',
  },
  colonizeBtn: {
    borderColor: '#00ff00',
    color: '#00ff00',
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
    background: 'rgba(0, 8, 20, 0.98)',
    border: '2px solid #00ff00',
    borderRadius: 6,
    minWidth: 280,
    boxShadow: '0 0 30px rgba(0,255,0,0.3)',
    fontFamily: "'Courier New', monospace",
    color: '#00ff00',
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
    borderBottom: '1px solid #004400',
  },
  popupTitle: {
    fontWeight: 'bold',
    color: '#ffff00',
    fontSize: 13,
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: '#ff4444',
    cursor: 'pointer',
    fontFamily: "'Courier New', monospace",
    fontSize: 13,
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
    color: '#006600',
    fontSize: 11,
  },
  popupValue: {
    color: '#00ffff',
    fontSize: 11,
  },
  popupActions: {
    display: 'flex',
    gap: 8,
    padding: '8px 12px',
    borderTop: '1px solid #004400',
  },
}
