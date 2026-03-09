import { useEffect, useState, useCallback } from 'react'
import { GameStore } from '../store/gameStore'
import { DEFAULT_PLAYER_ID } from '../lib/config'
import PlanetSelector from './PlanetSelector'
import BuildingUpgradeModal from './BuildingUpgradeModal'
import './HUD.css'

// Building ID -> human-readable name
const BUILDING_NAMES: Record<number, string> = {
  1: 'Metal Mine',
  2: 'Crystal Mine',
  3: 'Deuterium Synth',
  4: 'Solar Plant',
  12: 'Fusion Reactor',
  14: 'Robotics Factory',
  15: 'Nanite Factory',
  21: 'Shipyard',
  31: 'Research Lab',
  22: 'Metal Storage',
  23: 'Crystal Storage',
  24: 'Deut Tank',
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(Math.floor(n))
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'Done'
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

interface HUDProps {
  onOpenGalaxyMap?: () => void
  onOpenLeaderboard?: () => void
  onOpenTrader?: () => void
  onOpenResearch?: () => void
  onOpenFleet?: () => void
  onOpenChart?: () => void
  onOpenMessages?: () => void
  onOpenShipyard?: () => void
  onOpenDefense?: () => void
  onOpenBuddyList?: () => void
  onOpenFriendsList?: () => void
  onOpenChat?: () => void
}

export default function HUD({ onOpenGalaxyMap, onOpenLeaderboard, onOpenTrader, onOpenResearch, onOpenFleet, onOpenChart, onOpenMessages, onOpenShipyard, onOpenDefense, onOpenBuddyList, onOpenFriendsList, onOpenChat }: HUDProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [unreadMessages, setUnreadMessages] = useState(0)

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await fetch(`/api/messages/unread-count?player_id=${DEFAULT_PLAYER_ID}`)
      if (res.ok) {
        const data: { unreadCount: number } = await res.json()
        setUnreadMessages(data.unreadCount)
      }
    } catch {
      // offline — ignore
    }
  }, [])

  useEffect(() => {
    fetchUnreadCount()
    const interval = setInterval(fetchUnreadCount, 60_000) // poll every minute
    return () => clearInterval(interval)
  }, [fetchUnreadCount])

  const closeMenu = () => setMenuOpen(false)

  const selectedGalaxy = GameStore((s) => s.selectedGalaxy)
  const selectedSystem = GameStore((s) => s.selectedSystem)
  const selectedPlanet = GameStore((s) => s.selectedPlanet)
  const setSelectedGalaxy = GameStore((s) => s.setSelectedGalaxy)

  const resources = GameStore((s) => s.resources)
  const production = GameStore((s) => s.production)
  const buildings = GameStore((s) => s.buildings)
  const queue = GameStore((s) => s.queue)

  const loading = GameStore((s) => s.loading)
  const error = GameStore((s) => s.error)
  const apiReachable = GameStore((s) => s.apiReachable)

  const agentEnabled = GameStore((s) => s.agentEnabled)
  const agentRunning = GameStore((s) => s.agentRunning)
  const lastAgentDecision = GameStore((s) => s.lastAgentDecision)
  const toggleAgent = GameStore((s) => s.toggleAgent)
  const runAgentNow = GameStore((s) => s.runAgentNow)

  const startPolling = GameStore((s) => s._startPolling)
  const stopPolling = GameStore((s) => s._stopPolling)

  // Start polling on mount, stop on unmount
  useEffect(() => {
    startPolling()
    return () => stopPolling()
  }, [startPolling, stopPolling])

  return (
    <div className="hud">
      {/* Hamburger button — mobile only */}
      <button
        className={`hamburger-btn${menuOpen ? ' open' : ''}`}
        onClick={() => setMenuOpen((v) => !v)}
        aria-label="Toggle menu"
      >
        <span />
        <span />
        <span />
      </button>

      {/* Mobile resource bar — shown at top on small screens */}
      <div className="mobile-resource-bar">
        <span className="mobile-resource-item">
          <span className="res-icon metal-icon" style={{ width: 20, height: 20, fontSize: 10 }}>Fe</span>
          {formatNumber(resources.metal)}
        </span>
        <span className="mobile-resource-separator">|</span>
        <span className="mobile-resource-item">
          <span className="res-icon crystal-icon" style={{ width: 20, height: 20, fontSize: 10 }}>Si</span>
          {formatNumber(resources.crystal)}
        </span>
        <span className="mobile-resource-separator">|</span>
        <span className="mobile-resource-item">
          <span className="res-icon deut-icon" style={{ width: 20, height: 20, fontSize: 10 }}>D</span>
          {formatNumber(resources.deuterium)}
        </span>
        {apiReachable !== undefined && (
          <>
            <span className="mobile-resource-separator">|</span>
            <span className="mobile-resource-item" style={{ color: apiReachable ? '#00ff00' : '#ff4444' }}>
              {apiReachable ? '● Online' : '● Offline'}
            </span>
          </>
        )}
      </div>

      {/* Mobile nav drawer */}
      <div className={`mobile-nav-drawer${menuOpen ? ' open' : ''}`} onClick={closeMenu}>
        <div className="mobile-nav-content" onClick={(e) => e.stopPropagation()}>
          <div className="mobile-nav-section">
            <h3>Navigation</h3>
            {onOpenGalaxyMap && (
              <button className="mobile-nav-btn" onClick={() => { onOpenGalaxyMap(); closeMenu() }}>
                Galaxy Map (G)
              </button>
            )}
            {onOpenLeaderboard && (
              <button className="mobile-nav-btn" onClick={() => { onOpenLeaderboard(); closeMenu() }}>
                Leaderboard (L)
              </button>
            )}
            {onOpenTrader && (
              <button className="mobile-nav-btn" onClick={() => { onOpenTrader(); closeMenu() }}>
                Marketplace (T)
              </button>
            )}
            {onOpenResearch && (
              <button className="mobile-nav-btn" onClick={() => { onOpenResearch(); closeMenu() }}>
                Research (R)
              </button>
            )}
            {onOpenFleet && (
              <button className="mobile-nav-btn" onClick={() => { onOpenFleet(); closeMenu() }}>
                Fleet (F)
              </button>
            )}
            {onOpenChart && (
              <button className="mobile-nav-btn" onClick={() => { onOpenChart(); closeMenu() }}>
                Production Chart (C)
              </button>
            )}
            {onOpenMessages && (
              <button className="mobile-nav-btn" onClick={() => { onOpenMessages(); closeMenu() }}
                style={{ position: 'relative' }}>
                Messages (M)
                {unreadMessages > 0 && (
                  <span style={{
                    position: 'absolute', top: 4, right: 8,
                    background: '#ff4444', color: '#fff',
                    borderRadius: 8, fontSize: 9, padding: '0 5px',
                    lineHeight: '14px', fontWeight: 'bold',
                  }}>{unreadMessages}</span>
                )}
              </button>
            )}
            {onOpenShipyard && (
              <button className="mobile-nav-btn" onClick={() => { onOpenShipyard(); closeMenu() }}>
                Shipyard (Y)
              </button>
            )}
            {onOpenDefense && (
              <button className="mobile-nav-btn" onClick={() => { onOpenDefense(); closeMenu() }}>
                Defense (D)
              </button>
            )}
            {onOpenFriendsList && (
              <button className="mobile-nav-btn" onClick={() => { onOpenFriendsList(); closeMenu() }}>
                Friends (N)
              </button>
            )}
          </div>

          <div className="mobile-nav-section">
            <h3>Galaxies</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {Array.from({ length: 9 }, (_, i) => i + 1).map((galaxy) => (
                <button
                  key={galaxy}
                  className={`galaxy-btn${selectedGalaxy === galaxy ? ' active' : ''}`}
                  onClick={() => { setSelectedGalaxy(galaxy); closeMenu() }}
                >
                  {galaxy}
                </button>
              ))}
            </div>
          </div>

          <div className="mobile-nav-section">
            <h3>AI Agent</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className={`agent-btn${agentEnabled ? ' enabled' : ''}`}
                onClick={toggleAgent}
                style={{ flex: 1 }}
              >
                {agentEnabled ? 'Disable Agent' : 'Enable Agent'}
              </button>
              <button
                className="agent-btn run-btn"
                onClick={runAgentNow}
                disabled={agentRunning}
                style={{ flex: 1 }}
              >
                {agentRunning ? 'Running...' : 'Run Now'}
              </button>
            </div>
          </div>

          <div className="mobile-nav-section">
            <h3>Buildings</h3>
            <div style={{ fontSize: 12 }}>
              <BuildingRow label="Metal Mine" level={buildings.metalMine} buildingId={1} />
              <BuildingRow label="Crystal Mine" level={buildings.crystalMine} buildingId={2} />
              <BuildingRow label="Deut Synth" level={buildings.deutSynth} buildingId={3} />
              <BuildingRow label="Solar Plant" level={buildings.solarPlant} buildingId={4} />
              <BuildingRow label="Shipyard" level={buildings.shipyard} buildingId={21} />
              <BuildingRow label="Research Lab" level={buildings.researchLab} buildingId={31} />
            </div>
          </div>
        </div>
      </div>

      {/* Top-left: Galaxy info */}
      <div className="hud-panel info-panel">
        <h2>Cosmic Protocol</h2>
        <div className="stat">
          <span className="label">Galaxy:</span>
          <span className="value">{selectedGalaxy}</span>
        </div>
        {selectedSystem && (
          <div className="stat">
            <span className="label">System:</span>
            <span className="value">{selectedSystem}</span>
          </div>
        )}
        {selectedPlanet && (
          <div className="stat">
            <span className="label">Planet:</span>
            <span className="value">{selectedPlanet}</span>
          </div>
        )}

        {/* Connection indicator */}
        <div className="stat" style={{ marginTop: 8 }}>
          <span className="label">API:</span>
          <span
            className="value"
            style={{ color: apiReachable ? '#00ff00' : '#ff4444' }}
          >
            {apiReachable ? 'Connected' : 'Offline (mock)'}
          </span>
        </div>

        {loading && <div className="loading-indicator">Loading...</div>}
        {error && <div className="error-indicator">{error}</div>}

        <PlanetSelector />
      </div>

      {/* Top-right: Resources */}
      <div className="hud-panel resource-panel">
        <h3>Resources</h3>
        <div className="resource-row">
          <span className="res-icon metal-icon">Fe</span>
          <span className="res-value">{formatNumber(resources.metal)}</span>
          <span className="res-rate">+{formatNumber(production.metalPerHour)}/h</span>
        </div>
        <div className="resource-row">
          <span className="res-icon crystal-icon">Si</span>
          <span className="res-value">{formatNumber(resources.crystal)}</span>
          <span className="res-rate">+{formatNumber(production.crystalPerHour)}/h</span>
        </div>
        <div className="resource-row">
          <span className="res-icon deut-icon">D</span>
          <span className="res-value">{formatNumber(resources.deuterium)}</span>
          <span className="res-rate">+{formatNumber(production.deutPerHour)}/h</span>
        </div>
      </div>

      {/* Middle-right: Buildings */}
      <div className="hud-panel buildings-panel">
        <h3>Buildings</h3>
        <div className="buildings-grid">
          <BuildingRow label="Metal Mine" level={buildings.metalMine} buildingId={1} />
          <BuildingRow label="Crystal Mine" level={buildings.crystalMine} buildingId={2} />
          <BuildingRow label="Deut Synth" level={buildings.deutSynth} buildingId={3} />
          <BuildingRow label="Solar Plant" level={buildings.solarPlant} buildingId={4} />
          <BuildingRow label="Robotics" level={buildings.roboticsFactory} buildingId={14} />
          <BuildingRow label="Shipyard" level={buildings.shipyard} buildingId={21} />
          <BuildingRow label="Research Lab" level={buildings.researchLab} buildingId={31} />
        </div>
      </div>

      {/* Bottom-right: Build Queue */}
      <div className="hud-panel queue-panel">
        <h3>Build Queue</h3>
        {queue.length === 0 ? (
          <p className="queue-empty">No items in queue</p>
        ) : (
          <div className="queue-list">
            {queue.map((item, idx) => (
              <QueueRow key={`${item.buildingId}-${item.timeStart}`} item={item} isFirst={idx === 0} />
            ))}
          </div>
        )}
      </div>

      {/* Agent Control Panel */}
      <div className="hud-panel agent-panel">
        <h3>
          AI Agent
          <span
            className={`agent-dot ${agentEnabled ? 'active' : 'inactive'}`}
          />
        </h3>
        <div className="agent-controls">
          <button
            className={`agent-btn ${agentEnabled ? 'enabled' : ''}`}
            onClick={toggleAgent}
          >
            {agentEnabled ? 'Disable Agent' : 'Enable Agent'}
          </button>
          <button
            className="agent-btn run-btn"
            onClick={runAgentNow}
            disabled={agentRunning}
          >
            {agentRunning ? 'Running...' : 'Run Agent Now'}
          </button>
        </div>
        {lastAgentDecision && (
          <div className="agent-decision">
            <span className="label">Last decision:</span>
            <span className="value">
              {lastAgentDecision.action === 'build'
                ? `Build ${BUILDING_NAMES[lastAgentDecision.buildingId ?? 0] ?? `#${lastAgentDecision.buildingId}`}`
                : 'Wait'}
            </span>
            <p className="agent-reason">{lastAgentDecision.reason}</p>
          </div>
        )}
      </div>

      {/* Bottom-left: Galaxy selector */}
      <div className="hud-panel galaxy-selector">
        <h3>Galaxies</h3>
        <div className="galaxy-buttons">
          {Array.from({ length: 9 }, (_, i) => i + 1).map((galaxy) => (
            <button
              key={galaxy}
              className={`galaxy-btn ${selectedGalaxy === galaxy ? 'active' : ''}`}
              onClick={() => setSelectedGalaxy(galaxy)}
            >
              {galaxy}
            </button>
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="hud-panel controls-panel">
        <h3>Controls</h3>
        <p className="control-item">Drag to rotate</p>
        <p className="control-item">Scroll to zoom</p>
        <p className="control-item">Click system/planet</p>
        {onOpenGalaxyMap && (
          <button className="galaxy-btn" style={{ marginTop: 10, width: '100%' }} onClick={onOpenGalaxyMap}>
            Galaxy Map (G)
          </button>
        )}
        {onOpenLeaderboard && (
          <button className="galaxy-btn" style={{ marginTop: 6, width: '100%' }} onClick={onOpenLeaderboard}>
            Leaderboard (L)
          </button>
        )}
        {onOpenTrader && (
          <button className="galaxy-btn" style={{ marginTop: 6, width: '100%' }} onClick={onOpenTrader}>
            Marketplace (T)
          </button>
        )}
        {onOpenResearch && (
          <button className="galaxy-btn" style={{ marginTop: 6, width: '100%' }} onClick={onOpenResearch}>
            Research (R)
          </button>
        )}
        {onOpenFleet && (
          <button className="galaxy-btn" style={{ marginTop: 6, width: '100%' }} onClick={onOpenFleet}>
            Fleet (F)
          </button>
        )}
        {onOpenChart && (
          <button className="galaxy-btn" style={{ marginTop: 6, width: '100%' }} onClick={onOpenChart}>
            Production Chart (C)
          </button>
        )}
        {onOpenMessages && (
          <button
            className="galaxy-btn"
            style={{ marginTop: 6, width: '100%', position: 'relative' }}
            onClick={onOpenMessages}
          >
            Messages (M)
            {unreadMessages > 0 && (
              <span style={{
                position: 'absolute', top: 4, right: 8,
                background: '#ff4444', color: '#fff',
                borderRadius: 8, fontSize: 9, padding: '0 5px',
                lineHeight: '14px', fontWeight: 'bold',
              }}>{unreadMessages}</span>
            )}
          </button>
        )}
        {onOpenShipyard && (
          <button className="galaxy-btn" style={{ marginTop: 6, width: '100%' }} onClick={onOpenShipyard}>
            Shipyard (Y)
          </button>
        )}
        {onOpenDefense && (
          <button className="galaxy-btn" style={{ marginTop: 6, width: '100%' }} onClick={onOpenDefense}>
            Defense (D)
          </button>
        )}
        {onOpenBuddyList && (
          <button className="galaxy-btn" style={{ marginTop: 6, width: '100%' }} onClick={onOpenBuddyList}>
            Buddy List (B)
          </button>
        )}
        {onOpenFriendsList && (
          <button className="galaxy-btn" style={{ marginTop: 6, width: '100%' }} onClick={onOpenFriendsList}>
            Friends (N)
          </button>
        )}
        {onOpenChat && (
          <button className="galaxy-btn" style={{ marginTop: 6, width: '100%' }} onClick={onOpenChat}>
            Chat (K)
          </button>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function BuildingRow({ label, level, buildingId }: { label: string; level: number; buildingId: number }) {
  const activePlanetId = GameStore((s) => s.activePlanetId)
  const fetchPlanetState = GameStore((s) => s.fetchPlanetState)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  // Quick-upgrade shortcut (skips modal)
  const handleQuickUpgrade = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation()
    setLoading(true)
    setMsg(null)
    try {
      const { addToQueue } = await import('../lib/api')
      await addToQueue(activePlanetId, buildingId, level + 1)
      setMsg('Queued!')
      setTimeout(() => { setMsg(null); fetchPlanetState() }, 1500)
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'Error')
      setTimeout(() => setMsg(null), 2000)
    } finally {
      setLoading(false)
    }
  }, [activePlanetId, buildingId, level, fetchPlanetState])

  return (
    <>
      <div
        className="stat building-stat"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, cursor: 'pointer' }}
        onClick={() => setModalOpen(true)}
        title={`Click to view upgrade details for ${label}`}
      >
        <span className="label">{label}</span>
        <span className="value" style={{ minWidth: 36 }}>Lv {level}</span>
        <button
          onClick={handleQuickUpgrade}
          disabled={loading}
          style={{
            background: 'none', border: '1px solid #00ff41', color: '#00ff41',
            fontSize: '0.65rem', padding: '1px 5px', cursor: 'pointer',
            opacity: loading ? 0.5 : 1, minWidth: 42,
          }}
          title={`Quick upgrade ${label} to Lv ${level + 1}`}
        >
          {msg ?? (loading ? '...' : '▲ UP')}
        </button>
      </div>

      {modalOpen && (
        <BuildingUpgradeModal
          buildingId={buildingId}
          buildingName={label}
          currentLevel={level}
          planetId={activePlanetId}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  )
}

function QueueRow({ item, isFirst }: { item: api.QueueItem; isFirst: boolean }) {
  const now = Date.now()
  const remaining = item.timeEnd - now
  const name = BUILDING_NAMES[item.buildingId] ?? `Building #${item.buildingId}`

  return (
    <div className={`queue-item ${isFirst ? 'queue-active' : ''}`}>
      <span className="queue-name">
        {name} Lv{item.targetLevel}
      </span>
      <span className="queue-time">{formatCountdown(remaining)}</span>
    </div>
  )
}

// Need to import the QueueItem type for the sub-component
import type * as api from '../lib/api'
