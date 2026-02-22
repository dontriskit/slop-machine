/**
 * BattleReportList.tsx
 *
 * List of recent battle reports for the current player.
 * Features:
 *   - Fetches from GET /api/battle-reports?player_id=<id>
 *   - Filter tabs: All / As Attacker / As Defender
 *   - Click to expand full BattleReport viewer
 *   - Green retro-terminal aesthetic matching HUD.tsx
 *   - Offline mock data for dev mode
 */

import { useState, useEffect, useCallback } from 'react'
import { DEFAULT_PLAYER_ID } from '../lib/config'
import BattleReportViewer, { type BattleReport } from './BattleReport'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FilterMode = 'all' | 'attacker' | 'defender'

// Flat report row as returned by GET /api/battle-reports (summary list)
interface BattleReportRow {
  id: string
  attacker_id: string
  defender_id: string
  winner: 'attacker' | 'defender' | 'draw'
  rounds_fought: number
  attacker_loss_metal: number
  attacker_loss_crystal: number
  attacker_loss_deuterium: number
  defender_loss_metal: number
  defender_loss_crystal: number
  defender_loss_deuterium: number
  loot_metal: number
  loot_crystal: number
  loot_deuterium: number
  created_at: number
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function fetchBattleReports(playerId: string): Promise<BattleReportRow[]> {
  try {
    const res = await fetch(`/api/battle-reports?player_id=${encodeURIComponent(playerId)}`)
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

async function fetchFullReport(id: string): Promise<BattleReport | null> {
  try {
    const res = await fetch(`/api/battle-reports/${encodeURIComponent(id)}`)
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Mock data for offline / dev
// ---------------------------------------------------------------------------

function makeMockReports(playerId: string): BattleReportRow[] {
  return [
    {
      id: 'mock-001',
      attacker_id: playerId,
      defender_id: 'player-42',
      winner: 'attacker',
      rounds_fought: 3,
      attacker_loss_metal: 15000,
      attacker_loss_crystal: 5000,
      attacker_loss_deuterium: 0,
      defender_loss_metal: 80000,
      defender_loss_crystal: 30000,
      defender_loss_deuterium: 5000,
      loot_metal: 250000,
      loot_crystal: 120000,
      loot_deuterium: 30000,
      created_at: Date.now() - 3600 * 1000,
    },
    {
      id: 'mock-002',
      attacker_id: 'player-99',
      defender_id: playerId,
      winner: 'attacker',
      rounds_fought: 6,
      attacker_loss_metal: 200000,
      attacker_loss_crystal: 100000,
      attacker_loss_deuterium: 20000,
      defender_loss_metal: 450000,
      defender_loss_crystal: 200000,
      defender_loss_deuterium: 50000,
      loot_metal: 0,
      loot_crystal: 0,
      loot_deuterium: 0,
      created_at: Date.now() - 24 * 3600 * 1000,
    },
    {
      id: 'mock-003',
      attacker_id: playerId,
      defender_id: 'player-7',
      winner: 'draw',
      rounds_fought: 6,
      attacker_loss_metal: 90000,
      attacker_loss_crystal: 40000,
      attacker_loss_deuterium: 10000,
      defender_loss_metal: 85000,
      defender_loss_crystal: 38000,
      defender_loss_deuterium: 9000,
      loot_metal: 0,
      loot_crystal: 0,
      loot_deuterium: 0,
      created_at: Date.now() - 48 * 3600 * 1000,
    },
  ]
}

function makeMockFullReport(row: BattleReportRow, playerId: string): BattleReport {
  const isAttacker = row.attacker_id === playerId
  return {
    id: row.id,
    attackerId: row.attacker_id,
    defenderId: row.defender_id,
    attackerName: row.attacker_id === playerId ? 'You' : row.attacker_id,
    defenderName: row.defender_id === playerId ? 'You' : row.defender_id,
    winner: row.winner,
    rounds: [
      {
        round: 1,
        attacker: { ships: { lightFighter: 50, cruiser: 5 }, shipsDestroyed: {} },
        defender: { ships: { lightFighter: 30 }, shipsDestroyed: {} },
        attackerCasualties: isAttacker ? { lightFighter: 3 } : { lightFighter: 8 },
        defenderCasualties: isAttacker ? { lightFighter: 8 } : { lightFighter: 3 },
      },
      {
        round: 2,
        attacker: { ships: { lightFighter: 47, cruiser: 5 }, shipsDestroyed: {} },
        defender: { ships: { lightFighter: 22 }, shipsDestroyed: {} },
        attackerCasualties: isAttacker ? { lightFighter: 2 } : { lightFighter: 5 },
        defenderCasualties: isAttacker ? { lightFighter: 5 } : { lightFighter: 2 },
      },
    ],
    attackerLosses: {
      metal: row.attacker_loss_metal,
      crystal: row.attacker_loss_crystal,
      deuterium: row.attacker_loss_deuterium,
    },
    defenderLosses: {
      metal: row.defender_loss_metal,
      crystal: row.defender_loss_crystal,
      deuterium: row.defender_loss_deuterium,
    },
    loot: {
      metal: row.loot_metal,
      crystal: row.loot_crystal,
      deuterium: row.loot_deuterium,
    },
    debrisField: {
      metal: Math.floor((row.attacker_loss_metal + row.defender_loss_metal) * 0.3),
      crystal: Math.floor((row.attacker_loss_crystal + row.defender_loss_crystal) * 0.3),
      deuterium: 0,
    },
    timestamp: row.created_at,
    coordinates: { galaxy: 1, system: Math.floor(Math.random() * 499) + 1, position: Math.floor(Math.random() * 14) + 1 },
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(Math.floor(n))
}

function fmtDate(ts: number): string {
  const d = new Date(ts > 1e12 ? ts : ts * 1000)
  const now = Date.now()
  const diffMs = now - d.getTime()
  if (diffMs < 60_000) return 'just now'
  if (diffMs < 3600_000) return `${Math.floor(diffMs / 60000)}m ago`
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3600000)}h ago`
  return d.toLocaleDateString()
}

function WinnerLabel({ winner, isAttacker }: { winner: string; isAttacker: boolean }) {
  if (winner === 'draw') return <span style={{ color: '#ffff00', fontSize: 11 }}>DRAW</span>
  const won = (winner === 'attacker' && isAttacker) || (winner === 'defender' && !isAttacker)
  return (
    <span style={{ color: won ? '#00ff00' : '#ff4444', fontSize: 11, fontWeight: 'bold' }}>
      {won ? 'WON' : 'LOST'}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface BattleReportListProps {
  onClose: () => void
}

export default function BattleReportList({ onClose }: BattleReportListProps) {
  const playerId = DEFAULT_PLAYER_ID
  const [reports, setReports] = useState<BattleReportRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterMode>('all')
  const [selectedReport, setSelectedReport] = useState<BattleReport | null>(null)
  const [loadingReport, setLoadingReport] = useState<string | null>(null)
  const [mockMode, setMockMode] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const rows = await fetchBattleReports(playerId)
    if (rows.length === 0) {
      const mocks = makeMockReports(playerId)
      setReports(mocks)
      setMockMode(true)
    } else {
      setReports(rows)
      setMockMode(false)
    }
    setLoading(false)
  }, [playerId])

  useEffect(() => {
    load()
  }, [load])

  const filtered = reports.filter((r) => {
    if (filter === 'attacker') return r.attacker_id === playerId
    if (filter === 'defender') return r.defender_id === playerId
    return true
  })

  const openReport = useCallback(async (row: BattleReportRow) => {
    if (mockMode) {
      const mock = makeMockFullReport(row, playerId)
      setSelectedReport(mock)
      return
    }
    setLoadingReport(row.id)
    const full = await fetchFullReport(row.id)
    setLoadingReport(null)
    if (full) {
      setSelectedReport(full)
    }
  }, [mockMode, playerId])

  const tabStyle = (active: boolean): React.CSSProperties => ({
    background: active ? 'rgba(0,255,0,0.15)' : 'none',
    border: '1px solid ' + (active ? '#00ff00' : 'rgba(0,255,0,0.3)'),
    color: active ? '#00ff00' : 'rgba(0,255,0,0.5)',
    fontFamily: 'Courier New, monospace',
    fontSize: 11,
    cursor: 'pointer',
    padding: '4px 12px',
    borderRadius: 3,
    letterSpacing: 1,
  })

  return (
    <>
      <div style={{
        background: 'rgba(0,8,20,0.97)',
        border: '2px solid #00ff00',
        borderRadius: 6,
        padding: 24,
        width: 700,
        maxWidth: '95vw',
        maxHeight: '85vh',
        overflowY: 'auto',
        fontFamily: 'Courier New, monospace',
        color: '#00ff00',
        boxShadow: '0 0 30px rgba(0,255,0,0.3)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h2 style={{
              margin: 0,
              fontSize: 18,
              color: '#ffff00',
              textShadow: '0 0 10px #ffff00',
              letterSpacing: 3,
            }}>
              BATTLE REPORTS
            </h2>
            {mockMode && (
              <div style={{ fontSize: 10, color: '#ff8800', marginTop: 2, opacity: 0.8 }}>
                [OFFLINE — showing mock data]
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: '1px solid #00ff00',
              color: '#00ff00',
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

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {(['all', 'attacker', 'defender'] as FilterMode[]).map((f) => (
            <button
              key={f}
              style={tabStyle(filter === f)}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'ALL' : f === 'attacker' ? 'AS ATTACKER' : 'AS DEFENDER'}
            </button>
          ))}
          <span style={{ marginLeft: 'auto', fontSize: 11, opacity: 0.5, alignSelf: 'center' }}>
            {filtered.length} report{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* List */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, opacity: 0.6 }}>
            Loading battle reports...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, opacity: 0.5, fontSize: 13 }}>
            No battle reports found.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {filtered.map((row) => {
              const isAttacker = row.attacker_id === playerId
              const isLoading = loadingReport === row.id
              const totalLoot = row.loot_metal + row.loot_crystal + row.loot_deuterium
              const debris = Math.floor((row.attacker_loss_metal + row.defender_loss_metal) * 0.3 +
                                        (row.attacker_loss_crystal + row.defender_loss_crystal) * 0.3)
              return (
                <button
                  key={row.id}
                  onClick={() => openReport(row)}
                  disabled={isLoading}
                  style={{
                    background: 'rgba(0,255,0,0.03)',
                    border: '1px solid rgba(0,255,0,0.25)',
                    borderRadius: 4,
                    padding: '10px 14px',
                    cursor: isLoading ? 'wait' : 'pointer',
                    fontFamily: 'Courier New, monospace',
                    color: '#ccc',
                    textAlign: 'left',
                    width: '100%',
                    transition: 'border-color 0.15s, background 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = '#00ff00'
                    ;(e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,255,0,0.07)'
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(0,255,0,0.25)'
                    ;(e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,255,0,0.03)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: 13, marginBottom: 4 }}>
                        <span style={{ color: '#ff8800' }}>{row.attacker_id === playerId ? 'You' : row.attacker_id}</span>
                        <span style={{ opacity: 0.4, margin: '0 6px' }}>vs</span>
                        <span style={{ color: '#44aaff' }}>{row.defender_id === playerId ? 'You' : row.defender_id}</span>
                      </div>
                      <div style={{ fontSize: 11, opacity: 0.6 }}>
                        {row.rounds_fought} round{row.rounds_fought !== 1 ? 's' : ''} &nbsp;|&nbsp;
                        {fmtDate(row.created_at)}
                        {isLoading && <span style={{ color: '#ffff00' }}> &nbsp;Loading...</span>}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: 11 }}>
                      <div style={{ marginBottom: 2 }}>
                        <WinnerLabel winner={row.winner} isAttacker={isAttacker} />
                      </div>
                      {totalLoot > 0 && (
                        <div style={{ color: '#00ffff', opacity: 0.8 }}>
                          Loot: {fmt(totalLoot)}
                        </div>
                      )}
                      {debris > 0 && (
                        <div style={{ color: '#a0a0a0', opacity: 0.7 }}>
                          Debris: {fmt(debris)}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {/* Keyboard hint */}
        <div style={{
          marginTop: 16,
          paddingTop: 10,
          borderTop: '1px solid rgba(0,255,0,0.15)',
          fontSize: 11,
          opacity: 0.4,
          textAlign: 'center',
        }}>
          Press [B] to toggle &nbsp;|&nbsp; [Esc] to close
        </div>
      </div>

      {/* Full report modal */}
      {selectedReport && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 600,
          }}
          onClick={() => setSelectedReport(null)}
        >
          <div onClick={(e) => e.stopPropagation()}>
            <BattleReportViewer
              report={selectedReport}
              onClose={() => setSelectedReport(null)}
            />
          </div>
        </div>
      )}
    </>
  )
}
