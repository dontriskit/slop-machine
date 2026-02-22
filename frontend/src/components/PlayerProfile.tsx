/**
 * PlayerProfile.tsx
 *
 * Player profile panel showing:
 * - Name, alliance, planet count, joined date
 * - Score breakdown: economy, research, fleet, defense, total
 * - Recent activity (last 5 build actions)
 * - "Send Message" placeholder button
 * - Green retro terminal styling (matches HUD.tsx)
 */

import { useState, useEffect } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RecentActivity {
  buildingId: number
  level: number
  source: string
  reason: string | null
  createdAt: number
}

interface PlayerProfileData {
  playerId: string
  playerName: string
  allianceTag: string | null
  planetCount: number
  joinedAt: number
  economyScore: number
  researchScore: number
  fleetScore: number
  totalScore: number
  recentActivity: RecentActivity[]
}

// ---------------------------------------------------------------------------
// Building name map (mirrors HUD.tsx)
// ---------------------------------------------------------------------------

const BUILDING_NAMES: Record<number, string> = {
  1:  'Metal Mine',
  2:  'Crystal Mine',
  3:  'Deuterium Synth',
  4:  'Solar Plant',
  12: 'Fusion Reactor',
  14: 'Robotics Factory',
  15: 'Nanite Factory',
  21: 'Shipyard',
  31: 'Research Lab',
  22: 'Metal Storage',
  23: 'Crystal Storage',
  24: 'Deut Tank',
}

// ---------------------------------------------------------------------------
// API helper
// ---------------------------------------------------------------------------

async function fetchProfile(playerId: string): Promise<PlayerProfileData | null> {
  try {
    const res = await fetch(`/api/player/${encodeURIComponent(playerId)}/profile`)
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

function mockProfile(playerId: string): PlayerProfileData {
  return {
    playerId,
    playerName: 'Commander' + playerId.slice(-3),
    allianceTag: 'VOID',
    planetCount: 5,
    joinedAt: Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 30,
    economyScore: 48200,
    researchScore: 31600,
    fleetScore: 19400,
    totalScore: 99200,
    recentActivity: [
      { buildingId: 1, level: 12, source: 'agent',  reason: 'Maximize metal production for queue',  createdAt: Date.now() / 1000 - 60    },
      { buildingId: 4, level: 8,  source: 'manual', reason: null,                                   createdAt: Date.now() / 1000 - 300   },
      { buildingId: 2, level: 10, source: 'agent',  reason: 'Crystal shortage — upgrade mine',       createdAt: Date.now() / 1000 - 900   },
      { buildingId: 14, level: 4, source: 'manual', reason: null,                                   createdAt: Date.now() / 1000 - 3600  },
      { buildingId: 31, level: 5, source: 'agent',  reason: 'Research lab needed for next tech',    createdAt: Date.now() / 1000 - 7200  },
    ],
  }
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function formatScore(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M'
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K'
  return String(n)
}

function formatDate(unixSec: number): string {
  return new Date(unixSec * 1000).toLocaleDateString('en-US', {
    year:  'numeric',
    month: 'short',
    day:   'numeric',
  })
}

function timeAgo(unixSec: number): string {
  const diffSec = Math.floor(Date.now() / 1000) - unixSec
  if (diffSec < 60)      return `${diffSec}s ago`
  if (diffSec < 3600)    return `${Math.floor(diffSec / 60)}m ago`
  if (diffSec < 86400)   return `${Math.floor(diffSec / 3600)}h ago`
  return `${Math.floor(diffSec / 86400)}d ago`
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PlayerProfileProps {
  playerId: string
  onClose?: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PlayerProfile({ playerId, onClose }: PlayerProfileProps) {
  const [data, setData]       = useState<PlayerProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [offline, setOffline] = useState(false)
  const [msgSent, setMsgSent] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchProfile(playerId).then((result) => {
      if (cancelled) return
      setLoading(false)
      if (!result) {
        setData(mockProfile(playerId))
        setOffline(true)
      } else {
        setData(result)
        setOffline(false)
      }
    })
    return () => { cancelled = true }
  }, [playerId])

  function handleSendMessage() {
    setMsgSent(true)
    setTimeout(() => setMsgSent(false), 3000)
  }

  const scoreBarMax = data ? Math.max(
    data.economyScore, data.researchScore, data.fleetScore, 1
  ) : 1

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.title}>// PLAYER PROFILE</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {offline && <span style={styles.offlineBadge}>OFFLINE (mock)</span>}
          {onClose && (
            <button style={styles.closeBtn} onClick={onClose}>[X]</button>
          )}
        </div>
      </div>

      {loading ? (
        <div style={styles.loadingMsg}>Loading profile...</div>
      ) : data ? (
        <div style={styles.body}>
          {/* Identity card */}
          <div style={styles.card}>
            <div style={styles.cardRow}>
              <span style={styles.label}>PLAYER</span>
              <span style={{ ...styles.value, fontSize: 16, fontWeight: 'bold', textShadow: '0 0 8px #00ff41' }}>
                {data.playerName}
              </span>
            </div>
            <div style={styles.cardRow}>
              <span style={styles.label}>ALLIANCE</span>
              {data.allianceTag ? (
                <span style={{ ...styles.value, color: '#44aaff', fontWeight: 'bold' }}>
                  [{data.allianceTag}]
                </span>
              ) : (
                <span style={{ color: '#444' }}>None</span>
              )}
            </div>
            <div style={styles.cardRow}>
              <span style={styles.label}>PLANETS</span>
              <span style={styles.value}>{data.planetCount}</span>
            </div>
            <div style={styles.cardRow}>
              <span style={styles.label}>JOINED</span>
              <span style={styles.value}>{formatDate(data.joinedAt)}</span>
            </div>
            <div style={styles.cardRow}>
              <span style={styles.label}>TOTAL PTS</span>
              <span style={{ ...styles.value, color: '#ffd700', fontWeight: 'bold', fontSize: 15 }}>
                {formatScore(data.totalScore)}
              </span>
            </div>
          </div>

          {/* Score breakdown */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>SCORE BREAKDOWN</div>
            <ScoreBar label="Economy"  value={data.economyScore}  max={scoreBarMax} color="#00ff41" />
            <ScoreBar label="Research" value={data.researchScore} max={scoreBarMax} color="#44aaff" />
            <ScoreBar label="Fleet"    value={data.fleetScore}    max={scoreBarMax} color="#ff8800" />
          </div>

          {/* Recent activity */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>RECENT ACTIVITY</div>
            {data.recentActivity.length === 0 ? (
              <div style={{ color: '#444', fontSize: 12, padding: '4px 0' }}>No activity recorded.</div>
            ) : (
              <div style={styles.activityList}>
                {data.recentActivity.map((act, idx) => (
                  <div key={idx} style={styles.activityItem}>
                    <div style={styles.activityLeft}>
                      <span style={{ color: act.source === 'agent' ? '#ff8800' : '#00ff41', fontSize: 10, marginRight: 6 }}>
                        {act.source === 'agent' ? '[AI]' : '[ME]'}
                      </span>
                      <span style={{ color: '#00ff41' }}>
                        {BUILDING_NAMES[act.buildingId] ?? `Building #${act.buildingId}`}
                      </span>
                      <span style={{ color: '#006622', marginLeft: 6, fontSize: 11 }}>
                        Lv{act.level}
                      </span>
                    </div>
                    <div style={styles.activityRight}>
                      <span style={{ color: '#444', fontSize: 10 }}>{timeAgo(act.createdAt)}</span>
                    </div>
                    {act.reason && (
                      <div style={styles.activityReason}>
                        &ldquo;{act.reason}&rdquo;
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div style={styles.actions}>
            <button
              style={{ ...styles.actionBtn, ...(msgSent ? styles.actionBtnSent : {}) }}
              onClick={handleSendMessage}
              disabled={msgSent}
            >
              {msgSent ? 'Message queued!' : 'Send Message'}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ color: '#ff4444', padding: 20, textAlign: 'center' }}>
          Player not found.
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// ScoreBar sub-component
// ---------------------------------------------------------------------------

function ScoreBar({
  label, value, max, color,
}: {
  label: string; value: number; max: number; color: string
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ color: '#006622', fontSize: 11, letterSpacing: 1 }}>{label.toUpperCase()}</span>
        <span style={{ color, fontSize: 11, fontWeight: 'bold' }}>
          {formatScore(value)}
        </span>
      </div>
      <div style={{ background: 'rgba(0,255,65,0.06)', borderRadius: 2, height: 6, border: '1px solid #00ff4122' }}>
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: color,
            borderRadius: 2,
            boxShadow: `0 0 4px ${color}88`,
            transition: 'width 0.4s ease',
          }}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  container: {
    background: '#0a0a0a',
    border: '1px solid #00ff41',
    borderRadius: 4,
    color: '#00ff41',
    fontFamily: "'Courier New', monospace",
    fontSize: 13,
    boxShadow: '0 0 20px rgba(0,255,65,0.15)',
    width: 360,
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    borderBottom: '1px solid #00ff4133',
    flexShrink: 0,
  },
  title: {
    fontWeight: 'bold',
    fontSize: 13,
    letterSpacing: 2,
    textShadow: '0 0 8px #00ff41',
  },
  offlineBadge: {
    fontSize: 10,
    color: '#ff8800',
    border: '1px solid #ff8800',
    borderRadius: 2,
    padding: '1px 6px',
    letterSpacing: 1,
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
  },
  loadingMsg: {
    color: '#006622',
    textAlign: 'center',
    padding: 30,
    fontSize: 13,
  },
  body: {
    overflowY: 'auto',
    flex: 1,
    padding: 14,
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },

  // Identity card
  card: {
    border: '1px solid #00ff4133',
    borderRadius: 3,
    padding: '10px 12px',
    background: 'rgba(0,255,65,0.02)',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  cardRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    color: '#006622',
    fontSize: 11,
    letterSpacing: 1,
  },
  value: {
    color: '#00ff41',
    fontSize: 13,
  },

  // Sections
  section: {
    border: '1px solid #00ff4122',
    borderRadius: 3,
    padding: '10px 12px',
  },
  sectionTitle: {
    color: '#006622',
    fontSize: 10,
    letterSpacing: 2,
    marginBottom: 10,
    borderBottom: '1px solid #00ff4122',
    paddingBottom: 4,
  },

  // Activity
  activityList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  activityItem: {
    borderLeft: '2px solid #006622',
    paddingLeft: 8,
    display: 'flex',
    flexWrap: 'wrap' as const,
    alignItems: 'center',
    gap: 4,
  },
  activityLeft: {
    display: 'flex',
    alignItems: 'center',
    flex: 1,
  },
  activityRight: {
    marginLeft: 'auto',
  },
  activityReason: {
    width: '100%',
    color: '#554400',
    fontSize: 10,
    fontStyle: 'italic',
    paddingTop: 2,
  },

  // Actions
  actions: {
    display: 'flex',
    gap: 8,
    paddingTop: 4,
  },
  actionBtn: {
    background: 'rgba(0,255,65,0.08)',
    border: '1px solid #00ff41',
    color: '#00ff41',
    cursor: 'pointer',
    fontFamily: "'Courier New', monospace",
    fontSize: 12,
    padding: '6px 16px',
    borderRadius: 3,
    transition: 'background 0.15s',
    boxShadow: '0 0 5px #00ff4133',
  },
  actionBtnSent: {
    color: '#888',
    border: '1px solid #444',
    boxShadow: 'none',
    cursor: 'default',
  },
}
