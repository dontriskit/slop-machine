/**
 * HallOfFame.tsx
 *
 * All-time records, rankings, and achievement highlights.
 * Uses GET /api/hall-of-fame and GET /api/hall-of-fame/:category
 *
 * Keyboard shortcut: O
 * Style: cockpit glass panels
 */

import { useState, useEffect, useCallback } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HofEntry {
  id: string
  playerId: string
  playerName?: string
  category: string
  value: number
  recordedAt?: number
  rank?: number
}

type CategoryTab = 'all' | 'fleet_points' | 'kills' | 'resources_mined'

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function fetchHallOfFame(): Promise<HofEntry[]> {
  try {
    const res = await fetch('/api/hall-of-fame')
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? data : (data.hallOfFame ?? data.entries ?? [])
  } catch {
    return []
  }
}

async function fetchCategory(category: string): Promise<HofEntry[]> {
  try {
    const res = await fetch(`/api/hall-of-fame/${encodeURIComponent(category)}`)
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? data : (data.entries ?? data.hallOfFame ?? [])
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

function makeMockEntries(): HofEntry[] {
  const categories = ['fleet_points', 'kills', 'resources_mined']
  const entries: HofEntry[] = []
  let id = 1
  for (const cat of categories) {
    for (let i = 0; i < 5; i++) {
      entries.push({
        id: `mock-${id++}`,
        playerId: `player-${(i + 1) * 10}`,
        playerName: `Commander ${['Aleph', 'Bravo', 'Cipher', 'Delta', 'Echo'][i]}`,
        category: cat,
        value: Math.floor(Math.random() * 10_000_000 * (5 - i)),
        rank: i + 1,
        recordedAt: Date.now() - i * 3600 * 1000,
      })
    }
  }
  return entries
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + 'B'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(Math.floor(n))
}

const CATEGORY_LABELS: Record<string, string> = {
  fleet_points: 'Fleet Points',
  kills: 'Ships Destroyed',
  resources_mined: 'Resources Mined',
}

const CATEGORY_ICONS: Record<string, string> = {
  fleet_points: '🚀',
  kills: '💀',
  resources_mined: '⛏️',
}

const TABS: CategoryTab[] = ['all', 'fleet_points', 'kills', 'resources_mined']

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface HallOfFameProps {
  onClose: () => void
}

export default function HallOfFame({ onClose }: HallOfFameProps) {
  const [entries, setEntries] = useState<HofEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<CategoryTab>('all')
  const [mockMode, setMockMode] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    let data: HofEntry[]
    if (activeTab === 'all') {
      data = await fetchHallOfFame()
    } else {
      data = await fetchCategory(activeTab)
    }
    if (data.length === 0) {
      setEntries(makeMockEntries())
      setMockMode(true)
    } else {
      setEntries(data)
      setMockMode(false)
    }
    setLoading(false)
  }, [activeTab])

  useEffect(() => {
    load()
  }, [load])

  const displayed = activeTab === 'all'
    ? entries
    : entries.filter((e) => e.category === activeTab)

  // Group by category for 'all' view
  const grouped: Record<string, HofEntry[]> = {}
  for (const e of displayed) {
    if (!grouped[e.category]) grouped[e.category] = []
    grouped[e.category].push(e)
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    background: active ? 'rgba(70,130,180,0.25)' : 'none',
    border: '1px solid ' + (active ? '#4682b4' : 'rgba(70,130,180,0.3)'),
    color: active ? '#87ceeb' : 'rgba(135,206,235,0.5)',
    fontFamily: 'Courier New, monospace',
    fontSize: 11,
    cursor: 'pointer',
    padding: '4px 10px',
    borderRadius: 3,
    letterSpacing: 1,
  })

  const rankColor = (rank: number | undefined) => {
    if (rank === 1) return '#ffd700'
    if (rank === 2) return '#c0c0c0'
    if (rank === 3) return '#cd7f32'
    return '#87ceeb'
  }

  return (
    <div style={{
      background: 'rgba(8,14,28,0.97)',
      border: '2px solid #4682b4',
      borderRadius: 8,
      padding: 24,
      width: 720,
      maxWidth: '95vw',
      maxHeight: '85vh',
      overflowY: 'auto',
      fontFamily: 'Courier New, monospace',
      color: '#87ceeb',
      backdropFilter: 'blur(12px)',
      boxShadow: '0 0 40px rgba(70,130,180,0.4), inset 0 0 20px rgba(70,130,180,0.05)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div>
          <h2 style={{
            margin: 0,
            fontSize: 20,
            color: '#ffd700',
            textShadow: '0 0 12px #ffd700',
            letterSpacing: 4,
          }}>
            HALL OF FAME
          </h2>
          <div style={{ fontSize: 11, color: 'rgba(135,206,235,0.5)', marginTop: 2 }}>
            ALL-TIME RECORDS &amp; LEGENDARY COMMANDERS
          </div>
          {mockMode && (
            <div style={{ fontSize: 10, color: '#ff8800', marginTop: 2 }}>
              [DEMO DATA — server offline]
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: '1px solid #4682b4',
            color: '#87ceeb',
            cursor: 'pointer',
            fontFamily: 'Courier New, monospace',
            fontSize: 14,
            padding: '2px 10px',
            borderRadius: 3,
          }}
        >
          [X]
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        {TABS.map((tab) => (
          <button
            key={tab}
            style={tabStyle(activeTab === tab)}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'all' ? 'ALL RECORDS' : `${CATEGORY_ICONS[tab] ?? ''} ${CATEGORY_LABELS[tab] ?? tab.toUpperCase()}`}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, opacity: 0.6 }}>
          Loading records...
        </div>
      ) : (
        <div>
          {activeTab === 'all' ? (
            Object.entries(grouped).map(([cat, catEntries]) => (
              <CategorySection
                key={cat}
                category={cat}
                entries={catEntries}
                rankColor={rankColor}
              />
            ))
          ) : (
            <CategorySection
              category={activeTab}
              entries={displayed}
              rankColor={rankColor}
            />
          )}
          {displayed.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, opacity: 0.5, fontSize: 13 }}>
              No records found for this category.
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div style={{
        marginTop: 16,
        paddingTop: 10,
        borderTop: '1px solid rgba(70,130,180,0.2)',
        fontSize: 11,
        opacity: 0.4,
        textAlign: 'center',
      }}>
        Press [O] to toggle &nbsp;|&nbsp; [Esc] to close
      </div>
    </div>
  )
}

function CategorySection({
  category,
  entries,
  rankColor,
}: {
  category: string
  entries: HofEntry[]
  rankColor: (rank: number | undefined) => string
}) {
  const sorted = [...entries].sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{
        fontSize: 13,
        color: '#ffd700',
        letterSpacing: 2,
        marginBottom: 10,
        borderBottom: '1px solid rgba(70,130,180,0.3)',
        paddingBottom: 4,
      }}>
        {CATEGORY_ICONS[category] ?? '★'} {CATEGORY_LABELS[category] ?? category.replace(/_/g, ' ').toUpperCase()}
      </div>
      {sorted.length === 0 ? (
        <div style={{ opacity: 0.4, fontSize: 12, padding: '8px 0' }}>No entries yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {sorted.map((entry, idx) => {
            const rank = entry.rank ?? idx + 1
            return (
              <div
                key={entry.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  background: rank === 1 ? 'rgba(255,215,0,0.05)' : 'rgba(70,130,180,0.04)',
                  border: `1px solid ${rank === 1 ? 'rgba(255,215,0,0.2)' : 'rgba(70,130,180,0.15)'}`,
                  borderRadius: 4,
                  padding: '8px 12px',
                }}
              >
                <div style={{
                  fontSize: 16,
                  fontWeight: 'bold',
                  color: rankColor(rank),
                  minWidth: 28,
                  textAlign: 'center',
                  textShadow: rank <= 3 ? `0 0 8px ${rankColor(rank)}` : 'none',
                }}>
                  {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: rankColor(rank) }}>
                    {entry.playerName ?? entry.playerId}
                  </div>
                  {entry.recordedAt && (
                    <div style={{ fontSize: 10, opacity: 0.4, marginTop: 1 }}>
                      {new Date(entry.recordedAt > 1e12 ? entry.recordedAt : entry.recordedAt * 1000).toLocaleDateString()}
                    </div>
                  )}
                </div>
                <div style={{
                  fontSize: 14,
                  fontWeight: 'bold',
                  color: '#87ceeb',
                  textShadow: '0 0 6px rgba(135,206,235,0.5)',
                }}>
                  {fmt(entry.value)}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
