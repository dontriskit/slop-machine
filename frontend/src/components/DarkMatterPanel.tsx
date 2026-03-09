/**
 * DarkMatterPanel — Premium Currency UI
 *
 * Shows DM balance, transaction history, merchant trade UI, and instant finish.
 * Cockpit style: dark background, amber #f59e0b for DM.
 * Key: Z
 */

import { useState, useEffect } from 'react'
import { GameStore } from '../store/gameStore'
import { LS_PLAYER_ID_KEY } from '../lib/config'

interface DMBalance {
  playerId: string
  balance: number
  updatedAt: number
}

interface DMTransaction {
  id: string
  playerId: string
  amount: number
  source?: string
  purpose?: string
  reference?: string
  balanceBefore: number
  balanceAfter: number
  createdAt: number
}

interface TradeResult {
  offered: number
  received: number
  offer: string
  want: string
}

interface DarkMatterPanelProps {
  onClose: () => void
}

const DM_COLOR = '#f59e0b'
const DM_DIM = '#92400e'

function formatAmount(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function txLabel(tx: DMTransaction): string {
  if (tx.amount > 0) {
    return tx.source ? `+${formatAmount(tx.amount)} DM (${tx.source})` : `+${formatAmount(tx.amount)} DM`
  }
  return tx.purpose ? `${formatAmount(tx.amount)} DM (${tx.purpose})` : `${formatAmount(tx.amount)} DM`
}

type Resource = 'metal' | 'crystal' | 'deuterium'

const RESOURCES: Resource[] = ['metal', 'crystal', 'deuterium']

export default function DarkMatterPanel({ onClose }: DarkMatterPanelProps) {
  const activePlanetId = GameStore((s) => s.activePlanetId)
  const playerId = localStorage.getItem(LS_PLAYER_ID_KEY) || ''

  const [balance, setBalance] = useState<DMBalance | null>(null)
  const [history, setHistory] = useState<DMTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Merchant trade state
  const [offerRes, setOfferRes] = useState<Resource>('metal')
  const [wantRes, setWantRes] = useState<Resource>('crystal')
  const [offerAmt, setOfferAmt] = useState('')
  const [tradeResult, setTradeResult] = useState<TradeResult | null>(null)
  const [tradeLoading, setTradeLoading] = useState(false)
  const [tradeMsg, setTradeMsg] = useState<string | null>(null)

  // Instant finish state
  const [ifPlanetId, setIfPlanetId] = useState(activePlanetId || '')
  const [ifType, setIfType] = useState<'building' | 'research'>('building')
  const [ifIdx, setIfIdx] = useState('0')
  const [ifMsg, setIfMsg] = useState<string | null>(null)
  const [ifLoading, setIfLoading] = useState(false)

  useEffect(() => {
    if (!playerId) return
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/dm/${playerId}?limit=20`)
        if (!res.ok) throw new Error('Failed to fetch DM data')
        const data = await res.json() as { balance: DMBalance; history: DMTransaction[] }
        setBalance(data.balance)
        setHistory(data.history || [])
      } catch (err) {
        setError(String(err))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [playerId])

  const handleMerchantTrade = async () => {
    if (!activePlanetId) { setTradeMsg('No active planet selected'); return }
    const amount = parseInt(offerAmt, 10)
    if (isNaN(amount) || amount <= 0) { setTradeMsg('Enter a valid amount'); return }
    if (offerRes === wantRes) { setTradeMsg('Cannot trade same resource'); return }
    setTradeLoading(true)
    setTradeMsg(null)
    setTradeResult(null)
    try {
      const res = await fetch('/api/dm/merchant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId, planetId: activePlanetId, offerResource: offerRes, offerAmount: amount, wantResource: wantRes }),
      })
      const data = await res.json() as { success?: boolean; trade?: TradeResult; error?: string }
      if (!res.ok || data.error) { setTradeMsg(data.error || 'Trade failed'); return }
      const t = data.trade!
      setTradeResult(t)
      setTradeMsg(`Traded ${t.offered.toLocaleString()} ${t.offer} → ${t.received.toLocaleString()} ${t.want}`)
    } catch (err) {
      setTradeMsg(String(err))
    } finally {
      setTradeLoading(false)
    }
  }

  const handleInstantFinish = async () => {
    if (!ifPlanetId) { setIfMsg('Enter planet ID'); return }
    setIfLoading(true)
    setIfMsg(null)
    try {
      const res = await fetch('/api/dm/instant-finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId, planetId: ifPlanetId, queueType: ifType, queueIndex: parseInt(ifIdx, 10) }),
      })
      const data = await res.json() as { balance?: DMBalance; error?: string }
      if (!res.ok || data.error) { setIfMsg(data.error || 'Failed'); return }
      if (data.balance) setBalance(data.balance)
      setIfMsg(`Done! New balance: ${data.balance?.balance ?? '?'} DM`)
    } catch (err) {
      setIfMsg(String(err))
    } finally {
      setIfLoading(false)
    }
  }

  const panel: React.CSSProperties = {
    position: 'fixed',
    top: '50%', left: '50%',
    transform: 'translate(-50%, -50%)',
    background: '#080808',
    border: `1px solid ${DM_DIM}`,
    borderRadius: 12,
    padding: 24,
    width: 560,
    maxWidth: '95vw',
    maxHeight: '85vh',
    overflowY: 'auto',
    color: '#e2e8f0',
    fontFamily: 'monospace',
    zIndex: 1000,
    boxShadow: `0 0 40px rgba(245, 158, 11, 0.15)`,
  }

  const sectionTitle: React.CSSProperties = {
    color: DM_COLOR, fontSize: 12, letterSpacing: 2, textTransform: 'uppercase',
    margin: '20px 0 10px', borderBottom: `1px solid ${DM_DIM}`, paddingBottom: 6,
  }

  const inputStyle: React.CSSProperties = {
    background: '#111', border: `1px solid ${DM_DIM}`, borderRadius: 5,
    color: '#e2e8f0', padding: '5px 10px', fontFamily: 'monospace', fontSize: 13,
  }

  const selectStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer' }

  const btnStyle: React.CSSProperties = {
    background: DM_DIM, border: `1px solid ${DM_COLOR}`, borderRadius: 6,
    color: DM_COLOR, padding: '6px 14px', cursor: 'pointer',
    fontFamily: 'monospace', fontSize: 13, fontWeight: 'bold',
  }

  return (
    <div style={panel}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <h2 style={{ margin: 0, color: DM_COLOR, fontSize: 18, letterSpacing: 2 }}>
          ◆ DARK MATTER
        </h2>
        <button onClick={onClose} style={{
          background: 'none', border: '1px solid #374151', borderRadius: 6,
          color: '#9ca3af', padding: '4px 10px', cursor: 'pointer', fontSize: 14,
        }}>ESC</button>
      </div>

      {loading && <div style={{ color: '#6b7280', padding: 40, textAlign: 'center' }}>Loading...</div>}
      {error && <div style={{ color: '#f87171', padding: 12, background: '#1f1b1b', borderRadius: 6 }}>{error}</div>}

      {!loading && !error && balance && (
        <>
          {/* Balance */}
          <div style={{
            background: 'linear-gradient(135deg, #1a1000, #261800)',
            border: `1px solid ${DM_COLOR}`,
            borderRadius: 10, padding: '20px 24px', textAlign: 'center', marginTop: 16,
          }}>
            <div style={{ fontSize: 11, color: '#b45309', letterSpacing: 3, textTransform: 'uppercase' }}>Balance</div>
            <div style={{ fontSize: 40, fontWeight: 'bold', color: DM_COLOR, letterSpacing: 2, marginTop: 4 }}>
              {balance.balance.toLocaleString()} <span style={{ fontSize: 18 }}>DM</span>
            </div>
          </div>

          {/* Instant Finish */}
          <p style={sectionTitle}>⚡ Instant Finish</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              style={{ ...inputStyle, width: 160 }}
              placeholder="Planet ID"
              value={ifPlanetId}
              onChange={e => setIfPlanetId(e.target.value)}
            />
            <select style={selectStyle} value={ifType} onChange={e => setIfType(e.target.value as any)}>
              <option value="building">Building</option>
              <option value="research">Research</option>
            </select>
            <input
              style={{ ...inputStyle, width: 60 }}
              placeholder="Slot"
              value={ifIdx}
              onChange={e => setIfIdx(e.target.value)}
              type="number"
              min={0}
            />
            <button style={btnStyle} onClick={handleInstantFinish} disabled={ifLoading}>
              {ifLoading ? '...' : 'Finish Now'}
            </button>
          </div>
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
            Cost: remaining_seconds / 10 DM (rounded up)
          </div>
          {ifMsg && <div style={{ color: ifMsg.includes('Done') ? '#34d399' : '#f87171', fontSize: 13, marginTop: 6 }}>{ifMsg}</div>}

          {/* Merchant Trade */}
          <p style={sectionTitle}>⚖️ Merchant Trade</p>
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 8 }}>
            Rate: 3 metal = 2 crystal = 1 deuterium
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              style={{ ...inputStyle, width: 100 }}
              type="number"
              placeholder="Amount"
              value={offerAmt}
              onChange={e => setOfferAmt(e.target.value)}
              min={1}
            />
            <select style={selectStyle} value={offerRes} onChange={e => setOfferRes(e.target.value as Resource)}>
              {RESOURCES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <span style={{ color: '#6b7280' }}>→</span>
            <select style={selectStyle} value={wantRes} onChange={e => setWantRes(e.target.value as Resource)}>
              {RESOURCES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <button style={btnStyle} onClick={handleMerchantTrade} disabled={tradeLoading}>
              {tradeLoading ? '...' : 'Trade'}
            </button>
          </div>
          {tradeMsg && (
            <div style={{ color: tradeResult ? '#34d399' : '#f87171', fontSize: 13, marginTop: 6 }}>
              {tradeMsg}
            </div>
          )}

          {/* Transaction History */}
          <p style={sectionTitle}>📋 Transaction History</p>
          {history.length === 0 ? (
            <div style={{ color: '#6b7280', fontSize: 13, textAlign: 'center', padding: 16 }}>
              No transactions yet
            </div>
          ) : (
            <div style={{ maxHeight: 220, overflowY: 'auto' }}>
              {history.map(tx => (
                <div key={tx.id} style={{
                  display: 'flex', justifyContent: 'space-between',
                  padding: '7px 10px',
                  borderBottom: '1px solid #1a1a1a',
                  fontSize: 12,
                }}>
                  <span style={{ color: tx.amount > 0 ? '#34d399' : '#f87171' }}>
                    {txLabel(tx)}
                  </span>
                  <span style={{ color: '#6b7280', fontSize: 11 }}>
                    {new Date(tx.createdAt * 1000).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <div style={{ marginTop: 20, fontSize: 11, color: '#374151', textAlign: 'center' }}>
        Press Z to close
      </div>
    </div>
  )
}
