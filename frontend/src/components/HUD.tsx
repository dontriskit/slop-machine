import { useEffect } from 'react'
import { GameStore } from '../store/gameStore'
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
  onOpenAlliance?: () => void
}

export default function HUD({ onOpenGalaxyMap, onOpenLeaderboard, onOpenTrader, onOpenResearch, onOpenAlliance }: HUDProps) {
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
          <BuildingRow label="Metal Mine" level={buildings.metalMine} />
          <BuildingRow label="Crystal Mine" level={buildings.crystalMine} />
          <BuildingRow label="Deut Synth" level={buildings.deutSynth} />
          <BuildingRow label="Solar Plant" level={buildings.solarPlant} />
          <BuildingRow label="Robotics" level={buildings.roboticsFactory} />
          <BuildingRow label="Shipyard" level={buildings.shipyard} />
          <BuildingRow label="Research Lab" level={buildings.researchLab} />
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
        {onOpenAlliance && (
          <button className="galaxy-btn" style={{ marginTop: 6, width: '100%' }} onClick={onOpenAlliance}>
            Alliance (W)
          </button>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function BuildingRow({ label, level }: { label: string; level: number }) {
  return (
    <div className="stat building-stat">
      <span className="label">{label}</span>
      <span className="value">Lv {level}</span>
    </div>
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
