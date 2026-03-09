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

  return (
    // Backdrop
    <div style={s.backdrop} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={s.header}>
          <span style={s.title}>// UPGRADE: {buildingName.toUpperCase()}</span>
          <button style={s.closeBtn} onClick={onClose}>[X]</button>
        </div>

        {/* Level bar */}
        <div style={s.levelBar}>
          <div style={s.levelBlock}>
            <span style={s.levelLabel}>CURRENT</span>
            <span style={s.levelNum}>{currentLevel}</span>
          </div>
          <span style={s.arrow}>→</span>
          <div style={s.levelBlock}>
            <span style={s.levelLabel}>TARGET</span>
            <span style={{ ...s.levelNum, color: '#00ffff' }}>{targetLevel}</span>
          </div>
        </div>

        {/* Cost section */}
        <div style={s.section}>
          <div style={s.sectionTitle}>UPGRADE COST</div>
          <div style={s.costTable}>
            {cost.metal > 0 && (
              <div style={s.costRow}>
                <span style={s.resIcon}>Fe</span>
                <span style={s.resName}>Metal</span>
                <span style={{ ...s.costVal, color: canAffordMetal ? '#00ff41' : '#ff4444' }}>
                  {fmt(cost.metal)}
                </span>
                <span style={{ ...s.resAvail, color: canAffordMetal ? '#006600' : '#662200' }}>
                  / {fmt(resources.metal)}
                </span>
              </div>
            )}
            {cost.crystal > 0 && (
              <div style={s.costRow}>
                <span style={{ ...s.resIcon, color: '#64b4ff', background: 'rgba(100,180,255,0.15)', borderColor: '#64b4ff55' }}>Si</span>
                <span style={s.resName}>Crystal</span>
                <span style={{ ...s.costVal, color: canAffordCrystal ? '#00ff41' : '#ff4444' }}>
                  {fmt(cost.crystal)}
                </span>
                <span style={{ ...s.resAvail, color: canAffordCrystal ? '#006600' : '#662200' }}>
                  / {fmt(resources.crystal)}
                </span>
              </div>
            )}
            {cost.deuterium > 0 && (
              <div style={s.costRow}>
                <span style={{ ...s.resIcon, color: '#80ffb0', background: 'rgba(0,200,100,0.15)', borderColor: '#80ffb055' }}>D</span>
                <span style={s.resName}>Deuterium</span>
                <span style={{ ...s.costVal, color: canAffordDeut ? '#00ff41' : '#ff4444' }}>
                  {fmt(cost.deuterium)}
                </span>
                <span style={{ ...s.resAvail, color: canAffordDeut ? '#006600' : '#662200' }}>
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
          <div style={{ ...s.statusMsg, color: success ? '#00ff41' : '#ff8800' }}>
            {msg}
          </div>
        )}

        {/* Action buttons */}
        <div style={s.actions}>
          <button style={s.cancelBtn} onClick={onClose} disabled={loading}>
            CANCEL
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
            {loading ? 'QUEUING...' : success ? 'QUEUED!' : `▲ UPGRADE TO LV ${targetLevel}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Styles — green retro-terminal matching HUD / ShipyardPanel
// ---------------------------------------------------------------------------

const s: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.75)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1200,
    backdropFilter: 'blur(2px)',
  },
  modal: {
    background: 'rgba(0, 8, 20, 0.98)',
    border: '2px solid #00ff00',
    borderRadius: 4,
    color: '#00ff00',
    fontFamily: "'Courier New', monospace",
    fontSize: 13,
    boxShadow: '0 0 30px rgba(0, 255, 0, 0.35)',
    width: 440,
    maxWidth: '95vw',
    textShadow: '0 0 6px #00ff00',
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 16px',
    borderBottom: '1px solid #00ff0033',
  },
  title: {
    fontWeight: 'bold',
    fontSize: 13,
    letterSpacing: 2,
    color: '#ffff00',
    textShadow: '0 0 10px #ffff00',
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
    justifyContent: 'center',
    gap: 24,
    padding: '16px 20px',
    borderBottom: '1px solid #00ff0022',
  },
  levelBlock: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
  },
  levelLabel: {
    fontSize: 9,
    color: '#006600',
    letterSpacing: 2,
    textShadow: 'none',
  },
  levelNum: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#00ff00',
    lineHeight: 1,
    textShadow: '0 0 12px #00ff00',
  },
  arrow: {
    fontSize: 24,
    color: '#004400',
    textShadow: 'none',
  },
  section: {
    padding: '12px 16px',
    borderBottom: '1px solid #00ff0022',
  },
  sectionTitle: {
    fontSize: 9,
    color: '#006600',
    letterSpacing: 2,
    textShadow: 'none',
    marginBottom: 10,
  },
  costTable: {
    display: 'flex',
    flexDirection: 'column',
    gap: 7,
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
    borderRadius: 3,
    fontSize: 9,
    fontWeight: 'bold',
    background: 'rgba(160,160,160,0.15)',
    border: '1px solid #55555566',
    color: '#c0c0c0',
    textShadow: 'none',
    flexShrink: 0,
  },
  resName: {
    color: '#006600',
    fontSize: 11,
    width: 68,
    textShadow: 'none',
  },
  costVal: {
    fontWeight: 'bold',
    fontSize: 13,
    minWidth: 56,
    textAlign: 'right' as const,
  },
  resAvail: {
    fontSize: 10,
    marginLeft: 4,
    textShadow: 'none',
  },
  timeRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 10,
  },
  timeVal: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#00ffff',
    textShadow: '0 0 8px #00ffff',
  },
  timeNote: {
    fontSize: 10,
    color: '#006600',
    textShadow: 'none',
  },
  warning: {
    margin: '0 16px',
    padding: '6px 10px',
    background: 'rgba(255, 68, 68, 0.08)',
    border: '1px solid #ff444433',
    borderRadius: 2,
    color: '#ff4444',
    fontSize: 11,
    textShadow: 'none',
  },
  statusMsg: {
    margin: '0 16px',
    padding: '6px 10px',
    background: 'rgba(0,255,0,0.05)',
    borderRadius: 2,
    fontSize: 11,
    textShadow: 'none',
  },
  actions: {
    display: 'flex',
    gap: 10,
    padding: '14px 16px',
  },
  cancelBtn: {
    flex: '0 0 auto',
    background: 'transparent',
    border: '1px solid #444',
    color: '#666',
    cursor: 'pointer',
    fontFamily: "'Courier New', monospace",
    fontSize: 12,
    padding: '8px 16px',
    borderRadius: 2,
    letterSpacing: 1,
    textShadow: 'none',
  },
  upgradeBtn: {
    flex: 1,
    background: 'rgba(0, 255, 0, 0.12)',
    border: '1px solid #00ff00',
    color: '#00ff00',
    cursor: 'pointer',
    fontFamily: "'Courier New', monospace",
    fontSize: 12,
    padding: '8px 16px',
    borderRadius: 2,
    boxShadow: '0 0 8px rgba(0, 255, 0, 0.3)',
    letterSpacing: 1,
    fontWeight: 'bold',
    textShadow: '0 0 6px #00ff00',
    transition: 'background 0.15s',
  },
  upgradeBtnDisabled: {
    background: 'rgba(0,0,0,0.3)',
    border: '1px solid #333',
    color: '#444',
    cursor: 'not-allowed',
    boxShadow: 'none',
    textShadow: 'none',
  },
}
