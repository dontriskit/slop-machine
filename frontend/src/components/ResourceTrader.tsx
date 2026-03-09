/**
 * ResourceTrader.tsx
 *
 * Player-to-player resource marketplace:
 * - Create trade: "I offer X metal for Y crystal"
 * - List open offers with filters (by want_resource)
 * - Accept offer button
 * - Cancel own offers
 * - Green retro terminal styling (matches HUD.tsx)
 */

import { useState, useEffect, useCallback } from 'react'
import { DEFAULT_PLAYER_ID } from '../lib/config'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Resource = 'metal' | 'crystal' | 'deuterium'

interface TradeOffer {
  id: string
  playerId: string
  playerName: string
  allianceTag: string | null
  planetId: string
  offerResource: Resource
  offerAmount: number
  wantResource: Resource
  wantAmount: number
  status: 'open' | 'accepted' | 'cancelled'
  createdAt: number
}

interface TradesResponse {
  page: number
  limit: number
  trades: TradeOffer[]
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function apiFetchTrades(filter?: Resource, page = 1): Promise<TradesResponse | null> {
  try {
    const params = new URLSearchParams({ page: String(page), limit: '20' })
    if (filter) params.set('resource', filter)
    const res = await fetch(`/api/trades?${params}`)
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

async function apiCreateTrade(body: {
  playerId: string
  planetId: string
  offerResource: Resource
  offerAmount: number
  wantResource: Resource
  wantAmount: number
}): Promise<{ id: string } | null> {
  try {
    const res = await fetch('/api/trades', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

async function apiAcceptTrade(tradeId: string, playerId: string, planetId: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/trades/${encodeURIComponent(tradeId)}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId, planetId }),
    })
    return res.ok
  } catch {
    return false
  }
}

async function apiCancelTrade(tradeId: string, playerId: string): Promise<boolean> {
  try {
    const res = await fetch(
      `/api/trades/${encodeURIComponent(tradeId)}?playerId=${encodeURIComponent(playerId)}`,
      { method: 'DELETE' }
    )
    return res.ok
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Mock data for offline mode
// ---------------------------------------------------------------------------

function mockTrades(filter?: Resource): TradesResponse {
  const resources: Resource[] = ['metal', 'crystal', 'deuterium']
  const trades: TradeOffer[] = Array.from({ length: 12 }, (_, i) => {
    const offer = resources[i % 3]
    const want = resources[(i + 1) % 3]
    return {
      id: `trade-mock-${i}`,
      playerId: `player-${i + 1}`,
      playerName: `Commander${(i + 1).toString().padStart(3, '0')}`,
      allianceTag: i % 4 === 0 ? 'NOVA' : null,
      planetId: `planet-${i + 1}`,
      offerResource: offer as Resource,
      offerAmount: (i + 1) * 5000,
      wantResource: want as Resource,
      wantAmount: (i + 1) * 3500,
      status: 'open',
      createdAt: Math.floor(Date.now() / 1000) - i * 300,
    }
  }).filter((t) => !filter || t.wantResource === filter)
  return { page: 1, limit: 20, trades }
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const RESOURCE_LABELS: Record<Resource, string> = {
  metal:     'Metal',
  crystal:   'Crystal',
  deuterium: 'Deuterium',
}

const RESOURCE_COLORS: Record<Resource, string> = {
  metal:     '#94a3b8',
  crystal:   '#5b9cf6',
  deuterium: '#34d399',
}

const RESOURCE_ABBREV: Record<Resource, string> = {
  metal:     'Fe',
  crystal:   'Si',
  deuterium: 'D',
}

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000)     return (n / 1_000).toFixed(0) + 'K'
  return String(n)
}

function timeAgo(unixSec: number): string {
  const d = Math.floor(Date.now() / 1000) - unixSec
  if (d < 60)    return `${d}s ago`
  if (d < 3600)  return `${Math.floor(d / 60)}m ago`
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`
  return `${Math.floor(d / 86400)}d ago`
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ResourceTraderProps {
  /** Currently logged-in player's ID */
  currentPlayerId?: string
  /** Planet ID to use when creating / accepting trades */
  currentPlanetId?: string
  onClose?: () => void
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

type PanelTab = 'browse' | 'create'

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ResourceTrader({
  currentPlayerId = DEFAULT_PLAYER_ID,
  currentPlanetId = '1:1:1',
  onClose,
}: ResourceTraderProps) {
  const [tab, setTab]               = useState<PanelTab>('browse')
  const [trades, setTrades]         = useState<TradeOffer[]>([])
  const [loading, setLoading]       = useState(false)
  const [offline, setOffline]       = useState(false)
  const [filter, setFilter]         = useState<Resource | ''>('')
  const [statusMsg, setStatusMsg]   = useState<string | null>(null)
  const [busy, setBusy]             = useState<string | null>(null) // tradeId being acted on

  // Create form state
  const [offerResource, setOfferResource] = useState<Resource>('metal')
  const [offerAmount, setOfferAmount]     = useState<string>('10000')
  const [wantResource, setWantResource]   = useState<Resource>('crystal')
  const [wantAmount, setWantAmount]       = useState<string>('7000')
  const [creating, setCreating]           = useState(false)

  // ---- Load trades ----

  const loadTrades = useCallback(async () => {
    setLoading(true)
    const result = await apiFetchTrades(filter || undefined)
    if (!result) {
      setTrades(mockTrades(filter || undefined).trades)
      setOffline(true)
    } else {
      setTrades(result.trades as TradeOffer[])
      setOffline(false)
    }
    setLoading(false)
  }, [filter])

  useEffect(() => {
    if (tab === 'browse') loadTrades()
  }, [tab, loadTrades])

  // ---- Actions ----

  function showStatus(msg: string, timeout = 3000) {
    setStatusMsg(msg)
    setTimeout(() => setStatusMsg(null), timeout)
  }

  async function handleAccept(tradeId: string) {
    setBusy(tradeId)
    const ok = await apiAcceptTrade(tradeId, currentPlayerId, currentPlanetId)
    setBusy(null)
    if (ok || offline) {
      // Optimistically remove from list
      setTrades((prev) => prev.filter((t) => t.id !== tradeId))
      showStatus('Trade accepted successfully.')
    } else {
      showStatus('Failed to accept trade.')
    }
  }

  async function handleCancel(tradeId: string) {
    setBusy(tradeId)
    const ok = await apiCancelTrade(tradeId, currentPlayerId)
    setBusy(null)
    if (ok || offline) {
      setTrades((prev) => prev.filter((t) => t.id !== tradeId))
      showStatus('Trade cancelled.')
    } else {
      showStatus('Failed to cancel trade.')
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    const oAmt = parseInt(offerAmount, 10)
    const wAmt = parseInt(wantAmount, 10)

    if (isNaN(oAmt) || oAmt <= 0 || isNaN(wAmt) || wAmt <= 0) {
      showStatus('Amounts must be positive integers.')
      return
    }
    if (offerResource === wantResource) {
      showStatus('Offer and want resources must be different.')
      return
    }

    setCreating(true)
    const result = await apiCreateTrade({
      playerId: currentPlayerId,
      planetId: currentPlanetId,
      offerResource,
      offerAmount: oAmt,
      wantResource,
      wantAmount: wAmt,
    })
    setCreating(false)

    if (result || offline) {
      showStatus('Trade offer created!')
      setTab('browse')
      loadTrades()
    } else {
      showStatus('Failed to create trade offer.')
    }
  }

  // ---- Render ----

  const RESOURCES: Resource[] = ['metal', 'crystal', 'deuterium']

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.title}>// RESOURCE MARKETPLACE</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {offline && <span style={styles.offlineBadge}>OFFLINE (mock)</span>}
          {onClose && (
            <button style={styles.closeBtn} onClick={onClose}>[X]</button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={styles.tabs}>
        <button
          style={{ ...styles.tab, ...(tab === 'browse' ? styles.tabActive : {}) }}
          onClick={() => setTab('browse')}
        >
          Browse Offers
        </button>
        <button
          style={{ ...styles.tab, ...(tab === 'create' ? styles.tabActive : {}) }}
          onClick={() => setTab('create')}
        >
          + New Offer
        </button>
      </div>

      {/* Status message */}
      {statusMsg && (
        <div style={styles.statusMsg}>{statusMsg}</div>
      )}

      {/* Browse panel */}
      {tab === 'browse' && (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          {/* Filter bar */}
          <div style={styles.filterBar}>
            <span style={styles.filterLabel}>I WANT&gt;</span>
            <button
              style={{ ...styles.filterBtn, ...(filter === '' ? styles.filterBtnActive : {}) }}
              onClick={() => setFilter('')}
            >
              All
            </button>
            {RESOURCES.map((r) => (
              <button
                key={r}
                style={{
                  ...styles.filterBtn,
                  ...(filter === r ? styles.filterBtnActive : {}),
                  color: RESOURCE_COLORS[r],
                  borderColor: filter === r ? RESOURCE_COLORS[r] : '#333',
                }}
                onClick={() => setFilter(r)}
              >
                {RESOURCE_ABBREV[r]} {RESOURCE_LABELS[r]}
              </button>
            ))}
            <button style={styles.refreshBtn} onClick={loadTrades} title="Refresh">
              ↺
            </button>
          </div>

          {/* Trade list */}
          {loading ? (
            <div style={styles.loadingMsg}>Loading offers...</div>
          ) : trades.length === 0 ? (
            <div style={styles.emptyMsg}>No open trade offers{filter ? ` for ${RESOURCE_LABELS[filter as Resource]}` : ''}.</div>
          ) : (
            <div style={styles.tradeList}>
              {trades.map((trade) => {
                const isOwn = trade.playerId === currentPlayerId
                const isBusy = busy === trade.id
                return (
                  <div key={trade.id} style={{ ...styles.tradeCard, ...(isOwn ? styles.tradeCardOwn : {}) }}>
                    {/* Offer summary */}
                    <div style={styles.tradeMain}>
                      <div style={styles.tradeSide}>
                        <span style={styles.tradeSideLabel}>OFFER</span>
                        <div style={styles.tradeResource}>
                          <span style={{ color: RESOURCE_COLORS[trade.offerResource], fontWeight: 'bold', fontSize: 15 }}>
                            {fmt(trade.offerAmount)}
                          </span>
                          <span style={{ color: RESOURCE_COLORS[trade.offerResource], fontSize: 11, marginLeft: 4 }}>
                            {RESOURCE_LABELS[trade.offerResource]}
                          </span>
                        </div>
                      </div>

                      <div style={styles.tradeArrow}>⇌</div>

                      <div style={styles.tradeSide}>
                        <span style={styles.tradeSideLabel}>WANT</span>
                        <div style={styles.tradeResource}>
                          <span style={{ color: RESOURCE_COLORS[trade.wantResource], fontWeight: 'bold', fontSize: 15 }}>
                            {fmt(trade.wantAmount)}
                          </span>
                          <span style={{ color: RESOURCE_COLORS[trade.wantResource], fontSize: 11, marginLeft: 4 }}>
                            {RESOURCE_LABELS[trade.wantResource]}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Meta */}
                    <div style={styles.tradeMeta}>
                      <span style={{ color: '#e2e8f0', fontWeight: 500 }}>
                        {trade.playerName}
                        {trade.allianceTag && (
                          <span style={{ color: '#5b9cf6', marginLeft: 4 }}>[{trade.allianceTag}]</span>
                        )}
                      </span>
                      <span style={{ color: '#64748b', fontSize: 10 }}>{timeAgo(trade.createdAt)}</span>
                    </div>

                    {/* Rate */}
                    <div style={styles.tradeRate}>
                      Rate: 1 {RESOURCE_ABBREV[trade.wantResource]} = {(trade.offerAmount / trade.wantAmount).toFixed(2)} {RESOURCE_ABBREV[trade.offerResource]}
                    </div>

                    {/* Actions */}
                    <div style={styles.tradeActions}>
                      {isOwn ? (
                        <>
                          <span style={{ color: '#34d399', fontSize: 11, marginRight: 8 }}>Your offer</span>
                          <button
                            style={styles.cancelBtn}
                            onClick={() => handleCancel(trade.id)}
                            disabled={isBusy}
                          >
                            {isBusy ? '...' : 'Cancel'}
                          </button>
                        </>
                      ) : (
                        <button
                          style={styles.acceptBtn}
                          onClick={() => handleAccept(trade.id)}
                          disabled={isBusy}
                        >
                          {isBusy ? '...' : 'Accept Trade'}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Create panel */}
      {tab === 'create' && (
        <form style={styles.createForm} onSubmit={handleCreate}>
          <div style={styles.formTitle}>CREATE TRADE OFFER</div>

          <div style={styles.formRow}>
            <label style={styles.formLabel}>I OFFER</label>
            <div style={styles.formInputGroup}>
              <input
                style={styles.amountInput}
                type="number"
                min="1"
                step="1000"
                value={offerAmount}
                onChange={(e) => setOfferAmount(e.target.value)}
                placeholder="Amount"
              />
              <select
                style={styles.resSelect}
                value={offerResource}
                onChange={(e) => setOfferResource(e.target.value as Resource)}
              >
                {RESOURCES.map((r) => (
                  <option key={r} value={r} style={{ color: RESOURCE_COLORS[r] }}>
                    {RESOURCE_LABELS[r]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={styles.formArrowRow}>⇌</div>

          <div style={styles.formRow}>
            <label style={styles.formLabel}>I WANT</label>
            <div style={styles.formInputGroup}>
              <input
                style={styles.amountInput}
                type="number"
                min="1"
                step="1000"
                value={wantAmount}
                onChange={(e) => setWantAmount(e.target.value)}
                placeholder="Amount"
              />
              <select
                style={styles.resSelect}
                value={wantResource}
                onChange={(e) => setWantResource(e.target.value as Resource)}
              >
                {RESOURCES.map((r) => (
                  <option key={r} value={r} style={{ color: RESOURCE_COLORS[r] }}>
                    {RESOURCE_LABELS[r]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Preview */}
          {offerResource !== wantResource && parseInt(offerAmount) > 0 && parseInt(wantAmount) > 0 && (
            <div style={styles.previewBox}>
              <span style={{ color: '#64748b', fontSize: 11, fontWeight: 600 }}>PREVIEW  </span>
              <span style={{ color: RESOURCE_COLORS[offerResource] }}>
                {fmt(parseInt(offerAmount))} {RESOURCE_LABELS[offerResource]}
              </span>
              <span style={{ color: '#64748b', margin: '0 8px' }}>for</span>
              <span style={{ color: RESOURCE_COLORS[wantResource] }}>
                {fmt(parseInt(wantAmount))} {RESOURCE_LABELS[wantResource]}
              </span>
              <div style={{ color: '#64748b', fontSize: 10, marginTop: 4 }}>
                Rate: 1 {RESOURCE_ABBREV[wantResource]} = {(parseInt(offerAmount) / parseInt(wantAmount)).toFixed(2)} {RESOURCE_ABBREV[offerResource]}
              </div>
            </div>
          )}

          <div style={styles.formActions}>
            <button type="submit" style={styles.submitBtn} disabled={creating}>
              {creating ? 'Creating...' : 'Post Offer'}
            </button>
            <button
              type="button"
              style={styles.cancelFormBtn}
              onClick={() => setTab('browse')}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
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
    width: 500,
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
    fontSize: 14,
    color: '#5b9cf6',
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
    border: '1px solid rgba(248,113,113,0.4)',
    color: '#f87171',
    cursor: 'pointer',
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: 14,
    padding: '2px 8px',
    borderRadius: 6,
  },
  tabs: {
    display: 'flex',
    borderBottom: '1px solid rgba(91,156,246,0.15)',
    flexShrink: 0,
  },
  tab: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    borderBottom: '2px solid transparent',
    color: '#64748b',
    cursor: 'pointer',
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: 12,
    fontWeight: 500,
    padding: '8px 4px',
    transition: 'color 0.15s',
  },
  tabActive: {
    color: '#5b9cf6',
    borderBottom: '2px solid #5b9cf6',
  },
  statusMsg: {
    background: 'rgba(52,211,153,0.06)',
    borderBottom: '1px solid rgba(52,211,153,0.2)',
    color: '#34d399',
    fontSize: 12,
    padding: '6px 16px',
    flexShrink: 0,
  },

  // Browse - filter bar
  filterBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 14px',
    borderBottom: '1px solid rgba(91,156,246,0.1)',
    flexShrink: 0,
    flexWrap: 'wrap' as const,
  },
  filterLabel: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: 500,
    whiteSpace: 'nowrap',
  },
  filterBtn: {
    background: 'transparent',
    border: '1px solid rgba(91,156,246,0.15)',
    color: '#64748b',
    cursor: 'pointer',
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: 11,
    padding: '3px 8px',
    borderRadius: 4,
    transition: 'all 0.15s',
  },
  filterBtnActive: {
    background: 'rgba(91,156,246,0.12)',
    color: '#5b9cf6',
    borderColor: 'rgba(91,156,246,0.4)',
  },
  refreshBtn: {
    marginLeft: 'auto',
    background: 'transparent',
    border: '1px solid rgba(91,156,246,0.2)',
    color: '#64748b',
    cursor: 'pointer',
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: 16,
    padding: '2px 8px',
    borderRadius: 4,
  },

  loadingMsg: {
    color: '#64748b',
    textAlign: 'center',
    padding: 30,
    fontSize: 13,
  },
  emptyMsg: {
    color: '#334155',
    textAlign: 'center',
    padding: 30,
    fontSize: 12,
  },

  // Trade list
  tradeList: {
    overflowY: 'auto',
    flex: 1,
    padding: '8px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  tradeCard: {
    border: '1px solid rgba(91,156,246,0.15)',
    borderRadius: 8,
    padding: '10px 12px',
    background: 'rgba(91,156,246,0.03)',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  tradeCardOwn: {
    borderColor: 'rgba(52,211,153,0.25)',
    background: 'rgba(52,211,153,0.03)',
  },
  tradeMain: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  tradeSide: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
  },
  tradeSideLabel: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: 1,
  },
  tradeResource: {
    display: 'flex',
    alignItems: 'baseline',
  },
  tradeArrow: {
    color: '#334155',
    fontSize: 20,
    flexShrink: 0,
  },
  tradeMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: 11,
  },
  tradeRate: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: 500,
  },
  tradeActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  acceptBtn: {
    background: 'rgba(91,156,246,0.12)',
    border: '1px solid rgba(91,156,246,0.4)',
    color: '#5b9cf6',
    cursor: 'pointer',
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: 12,
    fontWeight: 500,
    padding: '4px 14px',
    borderRadius: 6,
    transition: 'background 0.15s',
  },
  cancelBtn: {
    background: 'transparent',
    border: '1px solid rgba(248,113,113,0.35)',
    color: '#f87171',
    cursor: 'pointer',
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: 11,
    padding: '3px 10px',
    borderRadius: 6,
    transition: 'background 0.15s',
  },

  // Create form
  createForm: {
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    overflowY: 'auto',
    flex: 1,
  },
  formTitle: {
    color: '#5b9cf6',
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: 1,
    borderBottom: '1px solid rgba(91,156,246,0.15)',
    paddingBottom: 8,
  },
  formRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  formLabel: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 1,
    minWidth: 60,
  },
  formInputGroup: {
    display: 'flex',
    gap: 8,
    flex: 1,
  },
  amountInput: {
    flex: 1,
    background: 'rgba(8,14,28,0.8)',
    border: '1px solid rgba(91,156,246,0.3)',
    color: '#e2e8f0',
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: 13,
    padding: '6px 10px',
    borderRadius: 6,
    outline: 'none',
  },
  resSelect: {
    background: 'rgba(8,14,28,0.8)',
    border: '1px solid rgba(91,156,246,0.3)',
    color: '#e2e8f0',
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: 13,
    padding: '6px 8px',
    borderRadius: 6,
    cursor: 'pointer',
    outline: 'none',
  },
  formArrowRow: {
    textAlign: 'center' as const,
    color: '#334155',
    fontSize: 24,
    lineHeight: 1,
  },
  previewBox: {
    border: '1px solid rgba(91,156,246,0.15)',
    borderRadius: 6,
    padding: '10px 14px',
    background: 'rgba(91,156,246,0.04)',
    fontSize: 13,
  },
  formActions: {
    display: 'flex',
    gap: 10,
  },
  submitBtn: {
    flex: 1,
    background: 'rgba(91,156,246,0.12)',
    border: '1px solid rgba(91,156,246,0.4)',
    color: '#5b9cf6',
    cursor: 'pointer',
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: 13,
    fontWeight: 500,
    padding: '8px 0',
    borderRadius: 6,
    transition: 'background 0.15s',
  },
  cancelFormBtn: {
    background: 'transparent',
    border: '1px solid rgba(91,156,246,0.15)',
    color: '#64748b',
    cursor: 'pointer',
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: 12,
    padding: '8px 16px',
    borderRadius: 6,
  },
}
