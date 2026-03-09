/**
 * UniverseSettingsPanel — Universe config & server stats
 *
 * Shows speed multipliers, game time, active player count, server info.
 * Key: U
 */

import { useState, useEffect } from 'react'

interface UniverseSettings {
  speed: number
  fleetSpeed: number
  researchSpeed: number
  maxGalaxies: number
  maxSystems: number
  maxPositions: number
  debrisRate: number
  defenseRepairRate: number
  newbieProtectionPoints: number
  bashRuleAttacks: number
}

interface ServerStats {
  activePlayerCount: number
  totalPlayers: number
  gameTime: string
  uptime?: string
}

interface UniverseData {
  settings: UniverseSettings
  stats: ServerStats
}

interface UniverseSettingsPanelProps {
  onClose: () => void
}

function StatRow({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      padding: '8px 12px', borderBottom: '1px solid #0f172a',
    }}>
      <span style={{ color: '#94a3b8', fontSize: 13 }}>
        {label}
        {hint && <span style={{ color: '#4b5563', fontSize: 11, marginLeft: 6 }}>({hint})</span>}
      </span>
      <span style={{ color: '#e2e8f0', fontWeight: 'bold', fontSize: 14 }}>{value}</span>
    </div>
  )
}

export default function UniverseSettingsPanel({ onClose }: UniverseSettingsPanelProps) {
  const [data, setData] = useState<UniverseData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(tick)
  }, [])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch('/api/universe/settings')
        if (!res.ok) throw new Error('Failed to fetch universe settings')
        const json = await res.json() as UniverseData
        setData(json)
      } catch (err) {
        setError(String(err))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const panel: React.CSSProperties = {
    position: 'fixed',
    top: '50%', left: '50%',
    transform: 'translate(-50%, -50%)',
    background: '#060c14',
    border: '1px solid #1e3a5f',
    borderRadius: 12,
    padding: 24,
    width: 500,
    maxWidth: '95vw',
    maxHeight: '85vh',
    overflowY: 'auto',
    color: '#e2e8f0',
    fontFamily: 'monospace',
    zIndex: 1000,
    boxShadow: '0 0 40px rgba(30, 58, 95, 0.4)',
  }

  const sectionTitle: React.CSSProperties = {
    color: '#60a5fa', fontSize: 12, letterSpacing: 2, textTransform: 'uppercase',
    margin: '20px 0 6px', borderBottom: '1px solid #1e3a5f', paddingBottom: 6,
  }

  return (
    <div style={panel}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0, color: '#60a5fa', fontSize: 18, letterSpacing: 2 }}>
          🌌 UNIVERSE SETTINGS
        </h2>
        <button onClick={onClose} style={{
          background: 'none', border: '1px solid #374151', borderRadius: 6,
          color: '#9ca3af', padding: '4px 10px', cursor: 'pointer', fontSize: 14,
        }}>ESC</button>
      </div>

      {loading && <div style={{ color: '#6b7280', padding: 40, textAlign: 'center' }}>Loading...</div>}
      {error && <div style={{ color: '#f87171', padding: 12, background: '#1f1b1b', borderRadius: 6 }}>{error}</div>}

      {!loading && !error && data && (
        <>
          {/* Live Clock */}
          <div style={{
            background: '#0f172a', borderRadius: 8, padding: '12px 16px',
            textAlign: 'center', marginBottom: 4,
          }}>
            <div style={{ fontSize: 11, color: '#475569', letterSpacing: 2, textTransform: 'uppercase' }}>Game Time</div>
            <div style={{ fontSize: 22, color: '#e2e8f0', marginTop: 4, letterSpacing: 3 }}>
              {now.toISOString().replace('T', ' ').substring(0, 19)} UTC
            </div>
          </div>

          {/* Server Stats */}
          <p style={sectionTitle}>📡 Server Stats</p>
          <div style={{ background: '#0a111a', borderRadius: 8, overflow: 'hidden' }}>
            <StatRow label="Active Players" value={data.stats.activePlayerCount} />
            <StatRow label="Total Players" value={data.stats.totalPlayers} />
            {data.stats.uptime && <StatRow label="Uptime" value={data.stats.uptime} />}
          </div>

          {/* Speed Settings */}
          <p style={sectionTitle}>⚡ Speed Multipliers</p>
          <div style={{ background: '#0a111a', borderRadius: 8, overflow: 'hidden' }}>
            <StatRow label="Economy Speed" value={`${data.settings.speed}x`} hint="resource production" />
            <StatRow label="Fleet Speed" value={`${data.settings.fleetSpeed}x`} hint="travel time" />
            <StatRow label="Research Speed" value={`${data.settings.researchSpeed}x`} hint="tech labs" />
          </div>

          {/* Universe Config */}
          <p style={sectionTitle}>🗺️ Universe Config</p>
          <div style={{ background: '#0a111a', borderRadius: 8, overflow: 'hidden' }}>
            <StatRow label="Galaxies" value={data.settings.maxGalaxies} />
            <StatRow label="Systems per Galaxy" value={data.settings.maxSystems} />
            <StatRow label="Positions per System" value={data.settings.maxPositions} />
          </div>

          {/* Rules */}
          <p style={sectionTitle}>⚖️ Game Rules</p>
          <div style={{ background: '#0a111a', borderRadius: 8, overflow: 'hidden' }}>
            <StatRow label="Debris Rate" value={`${Math.round(data.settings.debrisRate * 100)}%`} hint="from battles" />
            <StatRow label="Defense Repair" value={`${Math.round(data.settings.defenseRepairRate * 100)}%`} hint="after attack" />
            <StatRow label="Newbie Protection" value={`${data.settings.newbieProtectionPoints.toLocaleString()} pts`} />
            <StatRow label="Bash Rule" value={`${data.settings.bashRuleAttacks} attacks/24h`} />
          </div>
        </>
      )}

      <div style={{ marginTop: 20, fontSize: 11, color: '#374151', textAlign: 'center' }}>
        Press U to close
      </div>
    </div>
  )
}
