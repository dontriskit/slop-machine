/**
 * SpectatorMode.tsx
 *
 * Live battle feed for Cosmic Protocol spectator mode.
 * Shows recent public battles (last 24h), auto-refreshes every 30s.
 * Click a battle to view the full replay (15-min delay enforced by API).
 *
 * Key: W (Watch) — toggled from App.tsx and HUD.
 */

import { useState, useEffect, useCallback } from 'react'
import BattleReport from './BattleReport'
import CombatReplay from './CombatReplay'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BattleSummary {
  id: string
  attacker_id: string
  defender_id: string
  attacker_name: string
  defender_name: string
  winner: 'attacker' | 'defender' | 'draw'
  galaxy: number
  system: number
  position: number
  timestamp: number
}

interface BattleReplay {
  id: string
  attacker_name: string
  defender_name: string
  winner: 'attacker' | 'defender' | 'draw'
  galaxy: number
  system: number
  position: number
  timestamp: number
  battle_data_json: Record<string, unknown>
}

interface DelayedError {
  error: string
  availableIn?: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const API_BASE = (import.meta as Record<string, unknown>).env?.VITE_API_URL as string || ''

function outcomeLabel(winner: string, viewerIsAttacker: boolean): { text: string; color: string } {
  if (winner === 'draw') return { text: 'DRAW', color: '#888' }
  const won = (winner === 'attacker') === viewerIsAttacker
  return won
    ? { text: 'WIN', color: '#00ff88' }
    : { text: 'LOSS', color: '#ff4444' }
}

function formatTime(ts: number): string {
  const d = new Date(ts * 1000)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatAge(ts: number): string {
  const secs = Math.floor(Date.now() / 1000) - ts
  if (secs < 60) return `${secs}s ago`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  return `${Math.floor(secs / 3600)}h ago`
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface SpectatorModeProps {
  onClose: () => void
}

export default function SpectatorMode({ onClose }: SpectatorModeProps) {
  const [battles, setBattles] = useState<BattleSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [replay, setReplay] = useState<BattleReplay | null>(null)
  const [replayLoading, setReplayLoading] = useState(false)
  const [replayError, setReplayError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  // Fetch recent battles
  const fetchBattles = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/battles/recent?limit=20`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as BattleSummary[]
      setBattles(data)
      setError(null)
      setLastRefresh(new Date())
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  // Auto-refresh every 30 seconds
  useEffect(() => {
    fetchBattles()
    const interval = setInterval(fetchBattles, 30_000)
    return () => clearInterval(interval)
  }, [fetchBattles])

  // Keyboard: Escape closes
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Load a specific battle replay
  const loadReplay = async (id: string) => {
    setSelectedId(id)
    setReplay(null)
    setReplayError(null)
    setReplayLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/battles/${id}`)
      const data = await res.json() as BattleReplay | DelayedError
      if (!res.ok) {
        const err = data as DelayedError
        if (err.availableIn) {
          const mins = Math.ceil(err.availableIn / 60)
          setReplayError(`Replay available in ~${mins} minute${mins === 1 ? '' : 's'} (15-min privacy delay)`)
        } else {
          setReplayError(err.error || `HTTP ${res.status}`)
        }
      } else {
        setReplay(data as BattleReplay)
      }
    } catch (err) {
      setReplayError(String(err))
    } finally {
      setReplayLoading(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  const renderFeed = () => {
    if (loading) {
      return <div style={styles.placeholder}>Loading battle feed...</div>
    }
    if (error) {
      return <div style={{ ...styles.placeholder, color: '#ff6666' }}>Error: {error}</div>
    }
    if (battles.length === 0) {
      return <div style={styles.placeholder}>No battles in the last 24 hours. The galaxy is at peace — for now.</div>
    }

    return (
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Time</th>
            <th style={styles.th}>Attacker</th>
            <th style={styles.th}>Defender</th>
            <th style={styles.th}>Coords</th>
            <th style={styles.th}>Outcome</th>
            <th style={styles.th}>Age</th>
          </tr>
        </thead>
        <tbody>
          {battles.map((b) => {
            const outcome = outcomeLabel(b.winner, true /* all battles shown from attacker POV */)
            const isSelected = b.id === selectedId
            return (
              <tr
                key={b.id}
                style={{
                  ...styles.tr,
                  background: isSelected ? 'rgba(0,255,136,0.08)' : 'transparent',
                  cursor: 'pointer',
                }}
                onClick={() => loadReplay(b.id)}
              >
                <td style={styles.td}>{formatTime(b.timestamp)}</td>
                <td style={{ ...styles.td, color: '#88ccff' }}>{b.attacker_name}</td>
                <td style={{ ...styles.td, color: '#ffcc88' }}>{b.defender_name}</td>
                <td style={{ ...styles.td, color: '#aaa' }}>
                  {b.galaxy}:{b.system}:{b.position}
                </td>
                <td style={{ ...styles.td, color: outcome.color, fontWeight: 700 }}>
                  {outcome.text}
                </td>
                <td style={{ ...styles.td, color: '#666' }}>{formatAge(b.timestamp)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    )
  }

  const renderReplay = () => {
    if (!selectedId) {
      return <div style={styles.placeholder}>Select a battle from the feed to view its replay.</div>
    }
    if (replayLoading) {
      return <div style={styles.placeholder}>Loading replay...</div>
    }
    if (replayError) {
      return <div style={{ ...styles.placeholder, color: '#ffaa44' }}>{replayError}</div>
    }
    if (!replay) return null

    // BattleReport expects a specific shape — adapt the replay data
    const reportData = replay.battle_data_json as Record<string, unknown>
    return (
      <div>
        <div style={styles.replayHeader}>
          <span style={{ color: '#88ccff' }}>{replay.attacker_name}</span>
          {' vs '}
          <span style={{ color: '#ffcc88' }}>{replay.defender_name}</span>
          {' — '}
          <span style={{ color: '#888' }}>{replay.galaxy}:{replay.system}:{replay.position}</span>
        </div>
        {/* Animated round-by-round replay */}
        <CombatReplay
          battleData={reportData}
          attackerName={replay.attacker_name}
          defenderName={replay.defender_name}
          onClose={() => setReplay(null)}
        />
        {/* Legacy text report below */}
        <div style={{ marginTop: 16 }}>
          <BattleReport report={reportData as Parameters<typeof BattleReport>[0]['report']} />
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------

  return (
    <div style={styles.overlay}>
      <div style={styles.panel}>
        {/* Header */}
        <div style={styles.header}>
          <span style={styles.title}>SPECTATOR MODE</span>
          <div style={styles.headerRight}>
            <span style={styles.refreshInfo}>
              Last refresh: {lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              {' — '}
              <span
                style={{ color: '#00ff88', cursor: 'pointer', textDecoration: 'underline' }}
                onClick={fetchBattles}
              >
                Refresh now
              </span>
            </span>
            <button style={styles.closeBtn} onClick={onClose}>✕ [ESC]</button>
          </div>
        </div>

        {/* Body: feed + replay side by side */}
        <div style={styles.body}>
          {/* Left: battle feed */}
          <div style={styles.feedPanel}>
            <div style={styles.sectionTitle}>
              LIVE FEED — Last 24h ({battles.length} battle{battles.length !== 1 ? 's' : ''})
            </div>
            <div style={styles.feedScroll}>{renderFeed()}</div>
          </div>

          {/* Right: replay viewer */}
          <div style={styles.replayPanel}>
            <div style={styles.sectionTitle}>BATTLE REPLAY</div>
            <div style={styles.replayScroll}>{renderReplay()}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Styles (retro terminal aesthetic matching HUD.tsx)
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.85)',
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: '"Courier New", Courier, monospace',
  },
  panel: {
    width: '95vw',
    maxWidth: '1400px',
    height: '85vh',
    background: '#0a0a0a',
    border: '1px solid #00ff88',
    borderRadius: '4px',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 16px',
    borderBottom: '1px solid #00ff8844',
    background: '#050505',
  },
  title: {
    color: '#00ff88',
    fontSize: '18px',
    fontWeight: 700,
    letterSpacing: '3px',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  refreshInfo: {
    color: '#555',
    fontSize: '12px',
  },
  closeBtn: {
    background: 'transparent',
    border: '1px solid #333',
    color: '#888',
    cursor: 'pointer',
    padding: '4px 10px',
    fontSize: '13px',
    fontFamily: 'inherit',
  },
  body: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  feedPanel: {
    width: '45%',
    borderRight: '1px solid #00ff8822',
    display: 'flex',
    flexDirection: 'column',
  },
  replayPanel: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
  },
  sectionTitle: {
    color: '#00ff8899',
    fontSize: '11px',
    letterSpacing: '2px',
    padding: '8px 12px',
    borderBottom: '1px solid #111',
    background: '#050505',
  },
  feedScroll: {
    flex: 1,
    overflowY: 'auto',
    padding: '4px',
  },
  replayScroll: {
    flex: 1,
    overflowY: 'auto',
    padding: '12px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px',
  },
  th: {
    color: '#00ff8866',
    fontWeight: 600,
    fontSize: '11px',
    letterSpacing: '1px',
    padding: '6px 8px',
    textAlign: 'left',
    borderBottom: '1px solid #111',
  },
  tr: {
    borderBottom: '1px solid #111',
    transition: 'background 0.1s',
  },
  td: {
    padding: '7px 8px',
    color: '#ccc',
    fontSize: '13px',
  },
  placeholder: {
    color: '#444',
    padding: '24px',
    fontSize: '13px',
    textAlign: 'center',
  },
  replayHeader: {
    color: '#ccc',
    fontSize: '14px',
    marginBottom: '12px',
    padding: '8px',
    border: '1px solid #1a1a1a',
    borderRadius: '2px',
  },
}
