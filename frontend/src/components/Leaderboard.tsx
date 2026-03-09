/**
 * Leaderboard.tsx
 *
 * E-sport leaderboard panel with:
 * - Tabs: Points / Fleet / Research / Economy
 * - Sortable table: rank, player, alliance, score
 * - Pagination (20 per page)
 * - Search/filter by player name
 * - Cockpit glass panel aesthetic
 */

import { useState, useEffect, useCallback } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LeaderboardType = 'points' | 'fleet' | 'research' | 'economy'
type SortDir = 'asc' | 'desc'

interface LeaderboardEntry {
  rank: number
  playerId: string
  playerName: string
  allianceTag: string | null
  score: number
  economyScore: number
  researchScore: number
  fleetScore: number
  planetCount: number
}

interface LeaderboardPage {
  type: LeaderboardType
  page: number
  limit: number
  total: number
  entries: LeaderboardEntry[]
}

// ---------------------------------------------------------------------------
// API helper
// ---------------------------------------------------------------------------

async function fetchLeaderboard(
  type: LeaderboardType,
  page: number,
  limit: number
): Promise<LeaderboardPage | null> {
  try {
    const res = await fetch(
      `/api/leaderboard?type=${type}&page=${page}&limit=${limit}`
    )
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

// Mock data for offline / dev mode
function mockLeaderboard(type: LeaderboardType, page: number): LeaderboardPage {
  const entries: LeaderboardEntry[] = Array.from({ length: 20 }, (_, i) => {
    const rank = (page - 1) * 20 + i + 1
    const base = Math.max(1, 10000 - rank * 400 + Math.floor(Math.random() * 200))
    return {
      rank,
      playerId: `player-${rank}`,
      playerName: `Commander${rank.toString().padStart(3, '0')}`,
      allianceTag: rank % 4 === 0 ? 'VOID' : rank % 7 === 0 ? 'NOVA' : null,
      score: base * 3,
      economyScore: Math.floor(base * 1.2),
      researchScore: Math.floor(base * 0.9),
      fleetScore: Math.floor(base * 0.9),
      planetCount: Math.max(1, 8 - Math.floor(rank / 3)),
    }
  })
  return { type, page, limit: 20, total: 200, entries }
}

// ---------------------------------------------------------------------------
// Score column helper
// ---------------------------------------------------------------------------

function scoreForType(entry: LeaderboardEntry, type: LeaderboardType): number {
  switch (type) {
    case 'economy':  return entry.economyScore
    case 'research': return entry.researchScore
    case 'fleet':    return entry.fleetScore
    default:         return entry.score
  }
}

function formatScore(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M'
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K'
  return String(n)
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface LeaderboardProps {
  onClose?: () => void
  /** Callback when player name is clicked */
  onSelectPlayer?: (playerId: string) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Leaderboard({ onClose, onSelectPlayer }: LeaderboardProps) {
  const [activeTab, setActiveTab]   = useState<LeaderboardType>('points')
  const [page, setPage]             = useState(1)
  const [data, setData]             = useState<LeaderboardPage | null>(null)
  const [loading, setLoading]       = useState(false)
  const [search, setSearch]         = useState('')
  const [sortCol, setSortCol]       = useState<'rank' | 'score' | 'planets'>('rank')
  const [sortDir, setSortDir]       = useState<SortDir>('asc')
  const [offline, setOffline]       = useState(false)

  const LIMIT = 20

  const load = useCallback(async () => {
    setLoading(true)
    const result = await fetchLeaderboard(activeTab, page, LIMIT)
    if (!result) {
      setData(mockLeaderboard(activeTab, page))
      setOffline(true)
    } else {
      setData(result)
      setOffline(false)
    }
    setLoading(false)
  }, [activeTab, page])

  useEffect(() => { load() }, [load])

  // Reset to page 1 when tab changes
  useEffect(() => { setPage(1) }, [activeTab])

  // ---- Sort + filter ----

  const filtered = (data?.entries ?? []).filter((e) =>
    search === '' ||
    e.playerName.toLowerCase().includes(search.toLowerCase()) ||
    (e.allianceTag ?? '').toLowerCase().includes(search.toLowerCase())
  )

  const sorted = [...filtered].sort((a, b) => {
    let diff = 0
    if (sortCol === 'rank')    diff = a.rank - b.rank
    if (sortCol === 'score')   diff = scoreForType(b, activeTab) - scoreForType(a, activeTab)
    if (sortCol === 'planets') diff = b.planetCount - a.planetCount
    return sortDir === 'asc' ? diff : -diff
  })

  function toggleSort(col: typeof sortCol) {
    if (sortCol === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortCol(col)
      setSortDir('asc')
    }
  }

  function sortArrow(col: typeof sortCol): string {
    if (sortCol !== col) return ' ↕'
    return sortDir === 'asc' ? ' ↑' : ' ↓'
  }

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / LIMIT))

  // ---- Tabs ----

  const TABS: { key: LeaderboardType; label: string }[] = [
    { key: 'points',   label: 'Points'   },
    { key: 'economy',  label: 'Economy'  },
    { key: 'research', label: 'Research' },
    { key: 'fleet',    label: 'Fleet'    },
  ]

  // ---- Score column label ----
  const scoreLabel: Record<LeaderboardType, string> = {
    points:   'Points',
    economy:  'Economy',
    research: 'Research',
    fleet:    'Fleet',
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.title}>Galactic Leaderboard</span>
        <div style={styles.headerRight}>
          {offline && (
            <span style={styles.offlineBadge}>OFFLINE (mock)</span>
          )}
          {onClose && (
            <button style={styles.closeBtn} onClick={onClose}>
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={styles.tabs}>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            style={{
              ...styles.tab,
              ...(activeTab === tab.key ? styles.tabActive : {}),
            }}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div style={styles.searchRow}>
        <span style={styles.searchLabel}>Search:</span>
        <input
          style={styles.searchInput}
          type="text"
          placeholder="player name or alliance..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button style={styles.clearBtn} onClick={() => setSearch('')}>
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div style={styles.loadingMsg}>Loading leaderboard...</div>
      ) : (
        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th
                  style={{ ...styles.th, cursor: 'pointer' }}
                  onClick={() => toggleSort('rank')}
                >
                  Rank{sortArrow('rank')}
                </th>
                <th style={styles.th}>Player</th>
                <th style={styles.th}>Alliance</th>
                <th
                  style={{ ...styles.th, cursor: 'pointer' }}
                  onClick={() => toggleSort('planets')}
                >
                  Planets{sortArrow('planets')}
                </th>
                <th
                  style={{ ...styles.th, cursor: 'pointer', textAlign: 'right' as const }}
                  onClick={() => toggleSort('score')}
                >
                  {scoreLabel[activeTab]}{sortArrow('score')}
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ ...styles.td, textAlign: 'center', color: '#64748b' }}>
                    No players found
                  </td>
                </tr>
              ) : (
                sorted.map((entry, idx) => (
                  <tr
                    key={entry.playerId}
                    style={{
                      ...styles.row,
                      background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
                    }}
                  >
                    <td style={styles.td}>
                      <RankBadge rank={entry.rank} />
                    </td>
                    <td style={styles.td}>
                      {onSelectPlayer ? (
                        <button
                          style={styles.playerBtn}
                          onClick={() => onSelectPlayer(entry.playerId)}
                          title={`View ${entry.playerName}'s profile`}
                        >
                          {entry.playerName}
                        </button>
                      ) : (
                        <span style={{ color: '#e2e8f0' }}>{entry.playerName}</span>
                      )}
                    </td>
                    <td style={styles.td}>
                      {entry.allianceTag ? (
                        <span style={styles.allianceTag}>[{entry.allianceTag}]</span>
                      ) : (
                        <span style={{ color: '#334155' }}>—</span>
                      )}
                    </td>
                    <td style={{ ...styles.td, textAlign: 'center' as const }}>
                      <span style={{ color: '#94a3b8' }}>{entry.planetCount}</span>
                    </td>
                    <td style={{ ...styles.td, textAlign: 'right' as const }}>
                      <span style={styles.scoreValue}>
                        {formatScore(scoreForType(entry, activeTab))}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      <div style={styles.pagination}>
        <button
          style={styles.pageBtn}
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
        >
          &laquo; Prev
        </button>
        <span style={styles.pageInfo}>
          Page {page} / {totalPages} &nbsp;|&nbsp; {data?.total ?? 0} players
        </span>
        <button
          style={styles.pageBtn}
          disabled={page >= totalPages}
          onClick={() => setPage((p) => p + 1)}
        >
          Next &raquo;
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-component: rank badge with gold/silver/bronze for top 3
// ---------------------------------------------------------------------------

function RankBadge({ rank }: { rank: number }) {
  let color = '#e2e8f0'
  if (rank === 1) color = '#ffd700'
  if (rank === 2) color = '#c0c0c0'
  if (rank === 3) color = '#cd7f32'
  return (
    <span style={{ color, fontWeight: rank <= 3 ? 'bold' : 'normal', minWidth: 28, display: 'inline-block' }}>
      #{rank}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  container: {
    background: 'rgba(8,14,28,0.95)',
    backdropFilter: 'blur(16px)',
    border: '1px solid rgba(91,156,246,0.2)',
    borderRadius: 10,
    color: '#e2e8f0',
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: 13,
    minWidth: 560,
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },

  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: '1px solid rgba(91,156,246,0.15)',
    flexShrink: 0,
  },
  title: {
    fontWeight: 600,
    fontSize: 15,
    color: '#5b9cf6',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
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
    fontSize: 16,
    padding: '2px 6px',
    borderRadius: 4,
    transition: 'color 0.15s',
  },

  // Tabs
  tabs: {
    display: 'flex',
    borderBottom: '1px solid rgba(91,156,246,0.15)',
    flexShrink: 0,
  },
  tab: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    borderRight: '1px solid rgba(91,156,246,0.1)',
    color: '#64748b',
    cursor: 'pointer',
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: 12,
    padding: '8px 4px',
    transition: 'color 0.15s, background 0.15s',
  },
  tabActive: {
    color: '#5b9cf6',
    background: 'rgba(91,156,246,0.08)',
    borderBottom: '2px solid #5b9cf6',
  },

  // Search
  searchRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 14px',
    borderBottom: '1px solid rgba(91,156,246,0.1)',
    flexShrink: 0,
  },
  searchLabel: {
    color: '#64748b',
    fontSize: 12,
    whiteSpace: 'nowrap',
  },
  searchInput: {
    flex: 1,
    background: 'rgba(8,14,28,0.8)',
    border: '1px solid rgba(91,156,246,0.2)',
    color: '#e2e8f0',
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: 12,
    padding: '4px 8px',
    borderRadius: 6,
    outline: 'none',
  },
  clearBtn: {
    background: 'rgba(91,156,246,0.12)',
    border: '1px solid rgba(91,156,246,0.3)',
    color: '#93c5fd',
    cursor: 'pointer',
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: 11,
    padding: '3px 8px',
    borderRadius: 6,
  },

  // Table
  tableWrapper: {
    overflowY: 'auto',
    flex: 1,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 12,
  },
  th: {
    padding: '7px 12px',
    textAlign: 'left',
    borderBottom: '1px solid rgba(91,156,246,0.15)',
    color: '#5b9cf6',
    fontSize: 11,
    fontWeight: 600,
    position: 'sticky' as const,
    top: 0,
    background: 'rgba(8,14,28,0.98)',
    userSelect: 'none',
  },
  row: {
    transition: 'background 0.1s',
  },
  td: {
    padding: '6px 12px',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
    verticalAlign: 'middle',
    color: '#e2e8f0',
  },

  // Player button
  playerBtn: {
    background: 'transparent',
    border: 'none',
    color: '#93c5fd',
    cursor: 'pointer',
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: 12,
    padding: 0,
    textDecoration: 'underline',
    textUnderlineOffset: 2,
  },

  // Alliance tag
  allianceTag: {
    color: '#93c5fd',
    fontWeight: 600,
  },

  // Score
  scoreValue: {
    color: '#f59e0b',
    fontWeight: 600,
  },

  // Loading
  loadingMsg: {
    color: '#64748b',
    textAlign: 'center',
    padding: 30,
    fontSize: 13,
    flex: 1,
  },

  // Pagination
  pagination: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 14px',
    borderTop: '1px solid rgba(91,156,246,0.15)',
    flexShrink: 0,
  },
  pageBtn: {
    background: 'rgba(91,156,246,0.12)',
    border: '1px solid rgba(91,156,246,0.3)',
    color: '#93c5fd',
    cursor: 'pointer',
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: 11,
    padding: '4px 12px',
    borderRadius: 6,
    transition: 'background 0.15s',
  },
  pageInfo: {
    color: '#64748b',
    fontSize: 11,
  },
}
