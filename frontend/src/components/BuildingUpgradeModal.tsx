/**
 * BuildingUpgradeModal.tsx
 *
 * Full-detail upgrade modal for a building:
 * - Shows current level and target level
 * - Calculates upgrade cost using OGame formulas
 * - Colors resource costs green/red based on affordability
 * - Shows estimated build time
 * - Confirm UPGRADE button that calls api.addToQueue
 */

import { useState, useCallback } from 'react'
import { GameStore } from '../store/gameStore'

// Building ID -> image filename stem
const BUILDING_IMAGE: Record<number, string> = {
  1: 'metal_mine',
  2: 'crystal_mine',
  3: 'deuterium_synthesizer',
  4: 'solar_plant',
  12: 'fusion_plant',
  14: 'robot_factory',
  15: 'nanite_factory',
  21: 'shipyard',
  22: 'metal_store',
  23: 'crystal_store',
  24: 'deuterium_store',
  31: 'research_lab',
}

// ---------------------------------------------------------------------------
// Cost formulas (OGame standard)
// ---------------------------------------------------------------------------

interface BuildCost {
  metal: number
  crystal: number
  deuterium: number
}

function calcCost(buildingId: number, level: number): BuildCost {
  // level = target level (currentLevel + 1)
  switch (buildingId) {
    case 1:  // Metal Mine
      return {
        metal: Math.floor(60 * Math.pow(1.5, level)),
        crystal: Math.floor(15 * Math.pow(1.5, level)),
        deuterium: 0,
      }
    case 2:  // Crystal Mine
      return {
        metal: Math.floor(48 * Math.pow(1.6, level)),
        crystal: Math.floor(24 * Math.pow(1.6, level)),
        deuterium: 0,
      }
    case 3:  // Deuterium Synthesizer
      return {
        metal: Math.floor(225 * Math.pow(1.5, level)),
        crystal: Math.floor(75 * Math.pow(1.5, level)),
        deuterium: 0,
      }
    case 4:  // Solar Plant
      return {
        metal: Math.floor(75 * Math.pow(1.5, level)),
        crystal: Math.floor(30 * Math.pow(1.5, level)),
        deuterium: 0,
      }
    case 12: // Fusion Reactor
      return {
        metal: Math.floor(900 * Math.pow(1.8, level)),
        crystal: Math.floor(360 * Math.pow(1.8, level)),
        deuterium: Math.floor(180 * Math.pow(1.8, level)),
      }
    case 14: // Robotics Factory
      return {
        metal: Math.floor(400 * Math.pow(2, level)),
        crystal: Math.floor(120 * Math.pow(2, level)),
        deuterium: Math.floor(200 * Math.pow(2, level)),
      }
    case 15: // Nanite Factory
      return {
        metal: Math.floor(1000000 * Math.pow(2, level)),
        crystal: Math.floor(500000 * Math.pow(2, level)),
        deuterium: Math.floor(100000 * Math.pow(2, level)),
      }
    case 21: // Shipyard
      return {
        metal: Math.floor(400 * Math.pow(2, level)),
        crystal: Math.floor(200 * Math.pow(2, level)),
        deuterium: Math.floor(100 * Math.pow(2, level)),
      }
    case 22: // Metal Storage
      return {
        metal: Math.floor(1000 * Math.pow(2, level)),
        crystal: 0,
        deuterium: 0,
      }
    case 23: // Crystal Storage
      return {
        metal: Math.floor(1000 * Math.pow(2, level)),
        crystal: Math.floor(500 * Math.pow(2, level)),
        deuterium: 0,
      }
    case 24: // Deut Tank
      return {
        metal: Math.floor(1000 * Math.pow(2, level)),
        crystal: 0,
        deuterium: 0,
      }
    case 31: // Research Lab
      return {
        metal: Math.floor(200 * Math.pow(2, level)),
        crystal: Math.floor(400 * Math.pow(2, level)),
        deuterium: Math.floor(200 * Math.pow(2, level)),
      }
    default:
      return {
        metal: Math.floor(100 * Math.pow(2, level)),
        crystal: Math.floor(50 * Math.pow(2, level)),
        deuterium: 0,
      }
  }
}

// Build time in seconds: base 2500 / (robotics + 1), scaled by (metal + crystal) / universeSpeed
function calcBuildTime(cost: BuildCost, roboticsLevel: number): number {
  const universeSpeed = 1
  const base = (cost.metal + cost.crystal) / (2500 * (roboticsLevel + 1) * universeSpeed)
  return Math.max(1, Math.floor(base))
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(Math.floor(n))
}

function fmtTime(seconds: number): string {
  if (seconds <= 0) return 'Instant'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface BuildingUpgradeModalProps {
  buildingId: number
  buildingName: string
  currentLevel: number
  planetId: string
  onClose: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function BuildingUpgradeModal({
  buildingId,
  buildingName,
  currentLevel,
  planetId,
  onClose,
}: BuildingUpgradeModalProps) {
  const resources = GameStore((s) => s.resources)
  const buildings = GameStore((s) => s.buildings)
  const fetchPlanetState = GameStore((s) => s.fetchPlanetState)

  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const targetLevel = currentLevel + 1
  const cost = calcCost(buildingId, targetLevel)
  const roboticsLevel = buildings.roboticsFactory ?? 0
  const buildTime = calcBuildTime(cost, roboticsLevel)

  const canAffordMetal = resources.metal >= cost.metal
  const canAffordCrystal = resources.crystal >= cost.crystal
  const canAffordDeut = resources.deuterium >= cost.deuterium
  const canAfford = canAffordMetal && canAffordCrystal && canAffordDeut

  const handleUpgrade = useCallback(async () => {
    setLoading(true)
    setMsg(null)
    try {
      const { addToQueue } = await import('../lib/api')
      await addToQueue(planetId, buildingId, targetLevel)
      setSuccess(true)
      setMsg('Added to build queue!')
      setTimeout(() => {
        fetchPlanetState()
        onClose()
      }, 1200)
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'Error queuing upgrade')
    } finally {
      setLoading(false)
    }
  }, [planetId, buildingId, targetLevel, fetchPlanetState, onClose])

  const imageStem = BUILDING_IMAGE[buildingId]

  return (
    // Backdrop
    <div style={s.backdrop} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>

        {/* Hero image with building name overlay */}
        {imageStem ? (
          <div style={s.heroWrap}>
            <img
              src={`/img/objects/buildings/${imageStem}_small.jpg`}
              alt={buildingName}
              style={s.heroImg}
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
            />
            <div style={s.heroGradient} />
            <div style={s.heroLabel}>
              <span style={s.heroName}>{buildingName}</span>
              <button style={s.closeBtn} onClick={onClose} aria-label="Close">&#x2715;</button>
            </div>
          </div>
        ) : (
          /* Fallback header when no image available */
          <div style={s.header}>
            <span style={s.title}>{buildingName}</span>
            <button style={s.closeBtn} onClick={onClose} aria-label="Close">&#x2715;</button>
          </div>
        )}

        {/* Level bar */}
        <div style={s.levelBar}>
          <div style={s.levelBlock}>
            <span style={s.levelLabel}>CURRENT</span>
            <span style={s.levelNum}>{currentLevel}</span>
          </div>
          <span style={s.arrow}>&#x2192;</span>
          <div style={s.levelBlock}>
            <span style={s.levelLabel}>TARGET</span>
            <span style={{ ...s.levelNum, color: '#5b9cf6' }}>{targetLevel}</span>
          </div>
        </div>

        {/* Cost section */}
        <div style={s.section}>
          <div style={s.sectionTitle}>UPGRADE COST</div>
          <div style={s.costTable}>
            {cost.metal > 0 && (
              <div style={s.costRow}>
                <span style={{ ...s.resIcon, color: '#94a3b8', background: 'rgba(148,163,184,0.12)', borderColor: 'rgba(148,163,184,0.25)' }}>Fe</span>
                <span style={{ ...s.resName, color: '#94a3b8' }}>Metal</span>
                <span style={{ ...s.costVal, color: canAffordMetal ? '#34d399' : '#f87171' }}>
                  {fmt(cost.metal)}
                </span>
                <span style={{ ...s.resAvail, color: canAffordMetal ? 'rgba(52,211,153,0.55)' : 'rgba(248,113,113,0.55)' }}>
                  / {fmt(resources.metal)}
                </span>
              </div>
            )}
            {cost.crystal > 0 && (
              <div style={s.costRow}>
                <span style={{ ...s.resIcon, color: '#7dd3fc', background: 'rgba(125,211,252,0.12)', borderColor: 'rgba(125,211,252,0.25)' }}>Si</span>
                <span style={{ ...s.resName, color: '#7dd3fc' }}>Crystal</span>
                <span style={{ ...s.costVal, color: canAffordCrystal ? '#34d399' : '#f87171' }}>
                  {fmt(cost.crystal)}
                </span>
                <span style={{ ...s.resAvail, color: canAffordCrystal ? 'rgba(52,211,153,0.55)' : 'rgba(248,113,113,0.55)' }}>
                  / {fmt(resources.crystal)}
                </span>
              </div>
            )}
            {cost.deuterium > 0 && (
              <div style={s.costRow}>
                <span style={{ ...s.resIcon, color: '#6ee7b7', background: 'rgba(110,231,183,0.12)', borderColor: 'rgba(110,231,183,0.25)' }}>D</span>
                <span style={{ ...s.resName, color: '#6ee7b7' }}>Deuterium</span>
                <span style={{ ...s.costVal, color: canAffordDeut ? '#34d399' : '#f87171' }}>
                  {fmt(cost.deuterium)}
                </span>
                <span style={{ ...s.resAvail, color: canAffordDeut ? 'rgba(52,211,153,0.55)' : 'rgba(248,113,113,0.55)' }}>
                  / {fmt(resources.deuterium)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Build time */}
        <div style={s.section}>
          <div style={s.sectionTitle}>BUILD TIME</div>
          <div style={s.timeRow}>
            <span style={s.timeVal}>{fmtTime(buildTime)}</span>
            <span style={s.timeNote}>
              (Robotics Lv{roboticsLevel})
            </span>
          </div>
        </div>

        {/* Affordability warning */}
        {!canAfford && (
          <div style={s.warning}>
            Insufficient resources for this upgrade.
          </div>
        )}

        {/* Status message */}
        {msg && (
          <div style={{ ...s.statusMsg, color: success ? '#34d399' : '#f59e0b' }}>
            {msg}
          </div>
        )}

        {/* Action buttons */}
        <div style={s.actions}>
          <button style={s.cancelBtn} onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button
            style={{
              ...s.upgradeBtn,
              ...(!canAfford || loading || success ? s.upgradeBtnDisabled : {}),
            }}
            onClick={handleUpgrade}
            disabled={!canAfford || loading || success}
            title={!canAfford ? 'Not enough resources' : `Upgrade ${buildingName} to level ${targetLevel}`}
          >
            {loading ? 'Queuing\u2026' : success ? 'Queued!' : `Upgrade to Lv\u00a0${targetLevel}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Styles — cockpit aesthetic matching HUD (no neon greens/cyans)
// ---------------------------------------------------------------------------

const s: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.72)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1200,
    backdropFilter: 'blur(6px)',
  },
  modal: {
    background: 'rgba(8,14,28,0.95)',
    border: '1px solid rgba(91,156,246,0.25)',
    borderRadius: 8,
    color: '#cbd5e1',
    fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
    fontSize: 13,
    boxShadow: '0 8px 40px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.04)',
    backdropFilter: 'blur(16px)',
    width: 440,
    maxWidth: '95vw',
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
    overflow: 'hidden',
  },

  /* Hero image */
  heroWrap: {
    position: 'relative',
    width: '100%',
    height: 160,
    overflow: 'hidden',
    flexShrink: 0,
  },
  heroImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  heroGradient: {
    position: 'absolute',
    inset: 0,
    background: 'linear-gradient(to top, rgba(8,14,28,0.92) 0%, rgba(8,14,28,0.3) 55%, transparent 100%)',
  },
  heroLabel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    padding: '0 16px 12px',
  },
  heroName: {
    fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
    fontWeight: 600,
    fontSize: 18,
    color: '#f1f5f9',
    letterSpacing: 0.3,
    textShadow: '0 1px 8px rgba(0,0,0,0.85)',
  },

  /* Fallback header (no image) */
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 16px',
    borderBottom: '1px solid rgba(91,156,246,0.15)',
  },
  title: {
    fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
    fontWeight: 600,
    fontSize: 16,
    color: '#f1f5f9',
    letterSpacing: 0.2,
  },

  closeBtn: {
    background: 'rgba(255,255,255,0.07)',
    border: '1px solid rgba(255,255,255,0.13)',
    color: '#94a3b8',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 13,
    lineHeight: 1,
    padding: '4px 8px',
    borderRadius: 4,
    flexShrink: 0,
    marginLeft: 8,
  },

  levelBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    padding: '16px 20px',
    borderBottom: '1px solid rgba(91,156,246,0.1)',
    background: 'rgba(91,156,246,0.04)',
  },
  levelBlock: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
  },
  levelLabel: {
    fontSize: 9,
    color: '#64748b',
    letterSpacing: 2,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
  },
  levelNum: {
    fontSize: 32,
    fontWeight: 700,
    color: '#94a3b8',
    lineHeight: 1,
    fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
  },
  arrow: {
    fontSize: 20,
    color: 'rgba(91,156,246,0.4)',
  },

  section: {
    padding: '12px 16px',
    borderBottom: '1px solid rgba(91,156,246,0.1)',
  },
  sectionTitle: {
    fontSize: 9,
    color: '#475569',
    letterSpacing: 2,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    marginBottom: 10,
  },
  costTable: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  costRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  resIcon: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 22,
    height: 22,
    borderRadius: 4,
    fontSize: 9,
    fontWeight: 700,
    flexShrink: 0,
    border: '1px solid',
  },
  resName: {
    fontSize: 12,
    width: 72,
    fontWeight: 500,
  },
  costVal: {
    fontWeight: 700,
    fontSize: 13,
    minWidth: 56,
    textAlign: 'right' as const,
    fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
  },
  resAvail: {
    fontSize: 10,
    marginLeft: 4,
    fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
  },

  timeRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 10,
  },
  timeVal: {
    fontSize: 18,
    fontWeight: 700,
    color: '#f59e0b',
    fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
  },
  timeNote: {
    fontSize: 11,
    color: '#475569',
  },

  warning: {
    margin: '0 16px',
    padding: '7px 10px',
    background: 'rgba(248,113,113,0.08)',
    border: '1px solid rgba(248,113,113,0.25)',
    borderRadius: 4,
    color: '#f87171',
    fontSize: 12,
  },
  statusMsg: {
    margin: '0 16px',
    padding: '7px 10px',
    background: 'rgba(52,211,153,0.06)',
    borderRadius: 4,
    fontSize: 12,
  },

  actions: {
    display: 'flex',
    gap: 10,
    padding: '14px 16px',
  },
  cancelBtn: {
    flex: '0 0 auto',
    background: 'transparent',
    border: '1px solid rgba(91,156,246,0.3)',
    color: '#64748b',
    cursor: 'pointer',
    fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
    fontSize: 13,
    fontWeight: 500,
    padding: '8px 18px',
    borderRadius: 6,
    letterSpacing: 0.2,
  },
  upgradeBtn: {
    flex: 1,
    background: '#5b9cf6',
    border: '1px solid rgba(91,156,246,0.6)',
    color: '#fff',
    cursor: 'pointer',
    fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
    fontSize: 13,
    fontWeight: 600,
    padding: '8px 16px',
    borderRadius: 6,
    letterSpacing: 0.2,
    boxShadow: '0 2px 12px rgba(91,156,246,0.35)',
  },
  upgradeBtnDisabled: {
    background: 'rgba(91,156,246,0.12)',
    border: '1px solid rgba(91,156,246,0.15)',
    color: 'rgba(91,156,246,0.35)',
    cursor: 'not-allowed',
    boxShadow: 'none',
  },
}
