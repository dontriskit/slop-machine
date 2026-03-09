/**
 * JumpGatePanel.tsx
 *
 * Jump Gate Teleportation interface for Cosmic Protocol:
 * - Lists player's moons with Jump Gate levels
 * - Target moon selector (destination)
 * - Ship quantity inputs
 * - Cooldown timer display
 * - Instant no-fuel teleportation via POST /api/jumpgate/teleport
 */

import { useState, useEffect, useCallback } from 'react'
import { DEFAULT_PLAYER_ID, API_BASE_URL } from '../lib/config'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Moon {
  id: string
  name: string
  planetId: string
  jumpGateLevel: number
  available: boolean
  cooldownRemaining: number
  nextJumpAvailableAt: number | null
}

interface Ships {
  lightFighter: number
  heavyFighter: number
  cruiser: number
  battleship: number
  battlecruiser: number
  bomber: number
  destroyer: number
  deathstar: number
  smallCargo: number
  largeCargo: number
  colonyShip: number
  recycler: number
  espionageProbe: number
}

const EMPTY_SHIPS: Ships = {
  lightFighter: 0,
  heavyFighter: 0,
  cruiser: 0,
  battleship: 0,
  battlecruiser: 0,
  bomber: 0,
  destroyer: 0,
  deathstar: 0,
  smallCargo: 0,
  largeCargo: 0,
  colonyShip: 0,
  recycler: 0,
  espionageProbe: 0,
}

const SHIP_LABELS: Record<keyof Ships, string> = {
  lightFighter: 'Light Fighter',
  heavyFighter: 'Heavy Fighter',
  cruiser: 'Cruiser',
  battleship: 'Battleship',
  battlecruiser: 'Battlecruiser',
  bomber: 'Bomber',
  destroyer: 'Destroyer',
  deathstar: 'Deathstar',
  smallCargo: 'Small Cargo',
  largeCargo: 'Large Cargo',
  colonyShip: 'Colony Ship',
  recycler: 'Recycler',
  espionageProbe: 'Espionage Probe',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCooldown(seconds: number): string {
  if (seconds <= 0) return 'Ready'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function JumpGatePanel() {
  const playerId = DEFAULT_PLAYER_ID

  const [moons, setMoons] = useState<Moon[]>([])
  const [sourceMoonId, setSourceMoonId] = useState<string>('')
  const [destMoonId, setDestMoonId] = useState<string>('')
  const [ships, setShips] = useState<Ships>({ ...EMPTY_SHIPS })
  const [loading, setLoading] = useState(false)
  const [fetchingMoons, setFetchingMoons] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Fetch player's moons and their jump gate statuses
  const fetchMoons = useCallback(async () => {
    try {
      setFetchingMoons(true)
      // Get player's planets that have moons
      const planetsRes = await fetch(`${API_BASE_URL}/api/planets?player_id=${playerId}`)
      if (!planetsRes.ok) {
        setMoons([])
        return
      }
      const planetsData = await planetsRes.json() as { planets?: { id: string; name: string }[] }
      const planets = planetsData.planets ?? []

      // For each planet, check if there is a moon, then get jump gate status
      const moonList: Moon[] = []
      for (const planet of planets) {
        const moonRes = await fetch(`${API_BASE_URL}/api/moon/${planet.id}`)
        if (!moonRes.ok) continue
        const moonData = await moonRes.json() as { id?: string; name?: string } | null
        if (!moonData || !moonData.id) continue

        const statusRes = await fetch(`${API_BASE_URL}/api/jumpgate/status/${moonData.id}`)
        if (!statusRes.ok) continue
        const status = await statusRes.json() as {
          jumpGateLevel?: number
          available?: boolean
          cooldownRemaining?: number
          nextJumpAvailableAt?: number | null
        }

        moonList.push({
          id: moonData.id,
          name: moonData.name ?? `Moon of ${planet.name}`,
          planetId: planet.id,
          jumpGateLevel: status.jumpGateLevel ?? 0,
          available: status.available ?? false,
          cooldownRemaining: status.cooldownRemaining ?? 0,
          nextJumpAvailableAt: status.nextJumpAvailableAt ?? null,
        })
      }

      setMoons(moonList)
      // Auto-select first moon with jump gate as source if not set
      if (!sourceMoonId) {
        const withGate = moonList.find((m) => m.jumpGateLevel >= 1)
        if (withGate) setSourceMoonId(withGate.id)
      }
    } catch (err) {
      console.error('[JumpGatePanel] fetch moons error:', err)
    } finally {
      setFetchingMoons(false)
    }
  }, [playerId, sourceMoonId])

  useEffect(() => {
    fetchMoons()
    // Refresh cooldowns every 10s
    const interval = setInterval(fetchMoons, 10_000)
    return () => clearInterval(interval)
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  const sourceMoon = moons.find((m) => m.id === sourceMoonId)
  const destMoon = moons.find((m) => m.id === destMoonId)

  function handleShipChange(ship: keyof Ships, value: string) {
    const num = Math.max(0, parseInt(value) || 0)
    setShips((prev) => ({ ...prev, [ship]: num }))
  }

  async function handleTeleport() {
    setError(null)
    setSuccess(null)

    if (!sourceMoonId || !destMoonId) {
      setError('Select source and destination moons')
      return
    }
    if (sourceMoonId === destMoonId) {
      setError('Source and destination must be different')
      return
    }
    const hasShips = Object.values(ships).some((v) => v > 0)
    if (!hasShips) {
      setError('Select at least one ship to transfer')
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/jumpgate/teleport`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId,
          sourceMoonId,
          destinationMoonId: destMoonId,
          ships,
        }),
      })
      const data = await res.json() as { success?: boolean; error?: string; logId?: string }
      if (!res.ok || !data.success) {
        setError(data.error ?? 'Teleportation failed')
      } else {
        setSuccess(`Teleportation successful! Log ID: ${data.logId}`)
        setShips({ ...EMPTY_SHIPS })
        await fetchMoons()
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      background: '#0a0a1a',
      border: '1px solid #00ff88',
      borderRadius: 8,
      padding: 20,
      color: '#00ff88',
      fontFamily: 'monospace',
      maxWidth: 700,
    }}>
      <h2 style={{ margin: '0 0 16px', color: '#00ff88', fontSize: 18 }}>
        Jump Gate Teleportation
      </h2>

      {fetchingMoons && (
        <p style={{ color: '#888' }}>Loading moons...</p>
      )}

      {!fetchingMoons && moons.length === 0 && (
        <p style={{ color: '#ff4444' }}>
          No moons found. You need a moon with a Jump Gate (level ≥ 1) to use teleportation.
        </p>
      )}

      {!fetchingMoons && moons.length > 0 && (
        <>
          {/* Source Moon */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 6, color: '#aaffcc' }}>
              Source Moon
            </label>
            <select
              value={sourceMoonId}
              onChange={(e) => setSourceMoonId(e.target.value)}
              style={{
                background: '#0f1a2a',
                border: '1px solid #00ff88',
                color: '#00ff88',
                padding: '6px 10px',
                borderRadius: 4,
                width: '100%',
                fontFamily: 'monospace',
              }}
            >
              <option value="">-- Select Source Moon --</option>
              {moons.map((m) => (
                <option key={m.id} value={m.id} disabled={m.jumpGateLevel < 1}>
                  {m.name} — Jump Gate Lv{m.jumpGateLevel}
                  {m.jumpGateLevel < 1 ? ' (No Gate)' : m.available ? ' [Ready]' : ` [CD: ${formatCooldown(m.cooldownRemaining)}]`}
                </option>
              ))}
            </select>
            {sourceMoon && (
              <div style={{ marginTop: 6, fontSize: 12, color: '#888' }}>
                {sourceMoon.jumpGateLevel < 1
                  ? 'No Jump Gate installed on this moon.'
                  : sourceMoon.available
                  ? 'Jump Gate is ready.'
                  : `Cooldown: ${formatCooldown(sourceMoon.cooldownRemaining)} remaining`}
              </div>
            )}
          </div>

          {/* Destination Moon */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 6, color: '#aaffcc' }}>
              Destination Moon
            </label>
            <select
              value={destMoonId}
              onChange={(e) => setDestMoonId(e.target.value)}
              style={{
                background: '#0f1a2a',
                border: '1px solid #00ff88',
                color: '#00ff88',
                padding: '6px 10px',
                borderRadius: 4,
                width: '100%',
                fontFamily: 'monospace',
              }}
            >
              <option value="">-- Select Destination Moon --</option>
              {moons
                .filter((m) => m.id !== sourceMoonId)
                .map((m) => (
                  <option key={m.id} value={m.id} disabled={m.jumpGateLevel < 1}>
                    {m.name} — Jump Gate Lv{m.jumpGateLevel}
                    {m.jumpGateLevel < 1 ? ' (No Gate)' : m.available ? ' [Ready]' : ` [CD: ${formatCooldown(m.cooldownRemaining)}]`}
                  </option>
                ))}
            </select>
          </div>

          {/* Ship Quantities */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 8, color: '#aaffcc' }}>
              Ships to Transfer
            </label>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '8px 16px',
            }}>
              {(Object.keys(SHIP_LABELS) as (keyof Ships)[]).map((ship) => (
                <div key={ship} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label style={{ flex: 1, fontSize: 12, color: '#aaffcc' }}>
                    {SHIP_LABELS[ship]}
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={ships[ship]}
                    onChange={(e) => handleShipChange(ship, e.target.value)}
                    style={{
                      width: 70,
                      background: '#0f1a2a',
                      border: '1px solid #006633',
                      color: '#00ff88',
                      padding: '3px 6px',
                      borderRadius: 3,
                      fontFamily: 'monospace',
                      textAlign: 'right',
                    }}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Info Banner */}
          <div style={{
            background: '#001a0d',
            border: '1px solid #006633',
            borderRadius: 4,
            padding: '8px 12px',
            marginBottom: 16,
            fontSize: 12,
            color: '#aaffcc',
          }}>
            Jump Gate teleportation is instant and requires no deuterium.
            Both moons must have a Jump Gate. Each gate has a 1-hour cooldown after use.
          </div>

          {/* Error / Success */}
          {error && (
            <div style={{
              background: '#1a0000',
              border: '1px solid #ff4444',
              borderRadius: 4,
              padding: '8px 12px',
              marginBottom: 12,
              color: '#ff4444',
              fontSize: 13,
            }}>
              {error}
            </div>
          )}
          {success && (
            <div style={{
              background: '#001a06',
              border: '1px solid #00ff88',
              borderRadius: 4,
              padding: '8px 12px',
              marginBottom: 12,
              color: '#00ff88',
              fontSize: 13,
            }}>
              {success}
            </div>
          )}

          {/* Teleport Button */}
          <button
            onClick={handleTeleport}
            disabled={loading || !sourceMoon?.available}
            style={{
              background: loading ? '#003322' : '#004422',
              border: '1px solid #00ff88',
              color: '#00ff88',
              padding: '10px 24px',
              borderRadius: 4,
              fontFamily: 'monospace',
              fontSize: 14,
              cursor: loading || !sourceMoon?.available ? 'not-allowed' : 'pointer',
              opacity: loading || !sourceMoon?.available ? 0.6 : 1,
            }}
          >
            {loading ? 'Teleporting...' : 'Teleport Fleet'}
          </button>

          {sourceMoon && !sourceMoon.available && sourceMoon.jumpGateLevel >= 1 && (
            <span style={{ marginLeft: 12, fontSize: 12, color: '#888' }}>
              Gate ready in {formatCooldown(sourceMoon.cooldownRemaining)}
            </span>
          )}
        </>
      )}
    </div>
  )
}
