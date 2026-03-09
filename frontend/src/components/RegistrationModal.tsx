import { useState } from 'react'
import { API_BASE_URL, LS_PLAYER_ID_KEY, LS_PLANET_ID_KEY } from '../lib/config'
import { GameStore } from '../store/gameStore'

interface Props {
  onComplete: () => void
}

export default function RegistrationModal({ onComplete }: Props) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const setActivePlanet = GameStore((s) => s.setActivePlanet)

  const nameValid = /^[a-zA-Z0-9 _]{2,30}$/.test(name)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nameValid) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE_URL}/api/players/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(`Registration failed (${res.status}): ${text}`)
      }
      const data: { player_id: string; planet_id: string } = await res.json()
      localStorage.setItem(LS_PLAYER_ID_KEY, data.player_id)
      localStorage.setItem(LS_PLANET_ID_KEY, data.planet_id)
      setActivePlanet(data.planet_id)
      onComplete()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.92)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: '#0d1117',
          border: '1px solid #30363d',
          borderRadius: 12,
          padding: '40px 48px',
          maxWidth: 420,
          width: '90%',
          color: '#e6edf3',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 40, marginBottom: 8 }}>🚀</div>
        <h1 style={{ margin: '0 0 8px', fontSize: 24, fontWeight: 700, letterSpacing: 1 }}>
          COSMIC PROTOCOL
        </h1>
        <p style={{ margin: '0 0 28px', color: '#8b949e', fontSize: 14 }}>
          Enter your commander name to begin your conquest.
        </p>

        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Commander name"
            maxLength={30}
            autoFocus
            style={{
              width: '100%',
              padding: '10px 14px',
              background: '#161b22',
              border: `1px solid ${name.length > 0 && !nameValid ? '#f85149' : '#30363d'}`,
              borderRadius: 6,
              color: '#e6edf3',
              fontSize: 16,
              outline: 'none',
              boxSizing: 'border-box',
              marginBottom: 8,
            }}
          />
          {name.length > 0 && !nameValid && (
            <p style={{ color: '#f85149', fontSize: 12, margin: '0 0 8px', textAlign: 'left' }}>
              2–30 characters, letters/numbers/spaces/underscores only.
            </p>
          )}

          {error && (
            <p style={{ color: '#f85149', fontSize: 13, margin: '0 0 12px' }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={!nameValid || loading}
            style={{
              width: '100%',
              padding: '12px',
              background: nameValid && !loading ? '#238636' : '#21262d',
              color: nameValid && !loading ? '#fff' : '#8b949e',
              border: 'none',
              borderRadius: 6,
              fontSize: 15,
              fontWeight: 700,
              letterSpacing: 1,
              cursor: nameValid && !loading ? 'pointer' : 'not-allowed',
              transition: 'background 0.2s',
            }}
          >
            {loading ? 'REGISTERING...' : 'BEGIN CONQUEST'}
          </button>
        </form>
      </div>
    </div>
  )
}
