// ============================================================================
// ACS PANEL — Alliance Combat System (Attack & Defend)
// Issues #82, #84
// Keyboard: X
// ============================================================================
//
// Tab 1: Attack  — create coordinated attack, join existing attacks
// Tab 2: Defend  — create coordinated defense, join existing defenses
//
// Both use the same /api/acs/* endpoints with different mission types encoded
// in the ACS group's purpose (attack groups have missionType='attack', defend
// groups have missionType='defend').  Since the current backend tracks all ACS
// groups uniformly (no separate mission type column), the UI uses the group's
// initiatorId to distinguish ownership and renders the form/list accordingly.

import { useState, useEffect, useCallback } from 'react'
import { DEFAULT_PLAYER_ID } from '../lib/config'

// ---------------------------------------------------------------------------
// Types mirrored from acsService (no shared import from worker in frontend)
// ---------------------------------------------------------------------------

type ACSStatus = 'gathering' | 'launched' | 'arrived' | 'completed' | 'canceled'

interface ACSAttack {
  id: string
  initiatorId: string
  allianceId: string
  targetGalaxy: number
  targetSystem: number
  targetPosition: number
  status: ACSStatus
  maxParticipants: number
  launchTime: number | null
  arrivalTime: number | null
  createdAt: number
}

interface ACSParticipant {
  acsId: string
  playerId: string
  playerName: string
  planetId: string
  status: string
  fleetValue: number
  travelTime: number
}

interface ACSStatusResponse {
  attack: ACSAttack
  participants: ACSParticipant[]
  syncArrivalTime: number | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtCoord(a: ACSAttack) {
  return `${a.targetGalaxy}:${a.targetSystem}:${a.targetPosition}`
}

function fmtTime(sec: number | null) {
  if (sec === null) return '—'
  const d = new Date(sec * 1000)
  return d.toLocaleTimeString()
}

// ---------------------------------------------------------------------------
// Sub-component: Create ACS Form
// ---------------------------------------------------------------------------

interface CreateFormProps {
  missionLabel: string
  onCreated: () => void
}

function CreateForm({ missionLabel, onCreated }: CreateFormProps) {
  const [galaxy, setGalaxy]     = useState(1)
  const [system, setSystem]     = useState(1)
  const [position, setPosition] = useState(1)
  const [travelTime, setTravelTime] = useState(300)
  const [lightFighter, setLightFighter] = useState(10)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [success, setSuccess]   = useState<string | null>(null)

  const playerId = DEFAULT_PLAYER_ID

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setLoading(true)

    try {
      const res = await fetch('/api/acs/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          initiatorId: playerId,
          planetId: `planet-${playerId}`,
          ships: {
            lightFighter,
            heavyFighter: 0, cruiser: 0, battleship: 0, battlecruiser: 0,
            bomber: 0, destroyer: 0, deathstar: 0, smallCargo: 0,
            largeCargo: 0, colonyShip: 0, recycler: 0, espionageProbe: 0,
            solarSatellite: 0,
          },
          targetGalaxy: galaxy,
          targetSystem: system,
          targetPosition: position,
          travelTime,
        }),
      })
      const data = await res.json() as { error?: string; attack?: ACSAttack }
      if (!res.ok) {
        setError(data.error ?? 'Failed to create ACS group')
      } else {
        setSuccess(`ACS ${missionLabel} group created — ID: ${data.attack?.id}`)
        onCreated()
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ color: '#aaa', fontSize: 12 }}>
        Create coordinated {missionLabel.toLowerCase()} group. Alliance members can join before launch.
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <label style={{ flex: 1 }}>
          Galaxy
          <input type="number" min={1} max={9} value={galaxy}
            onChange={e => setGalaxy(Number(e.target.value))}
            style={{ width: '100%', background: '#1a1a2e', color: '#fff', border: '1px solid #444', padding: '4px 6px', borderRadius: 4, marginTop: 4 }} />
        </label>
        <label style={{ flex: 1 }}>
          System
          <input type="number" min={1} max={499} value={system}
            onChange={e => setSystem(Number(e.target.value))}
            style={{ width: '100%', background: '#1a1a2e', color: '#fff', border: '1px solid #444', padding: '4px 6px', borderRadius: 4, marginTop: 4 }} />
        </label>
        <label style={{ flex: 1 }}>
          Position
          <input type="number" min={1} max={15} value={position}
            onChange={e => setPosition(Number(e.target.value))}
            style={{ width: '100%', background: '#1a1a2e', color: '#fff', border: '1px solid #444', padding: '4px 6px', borderRadius: 4, marginTop: 4 }} />
        </label>
      </div>
      <label>
        Light Fighters (fleet size)
        <input type="number" min={1} value={lightFighter}
          onChange={e => setLightFighter(Number(e.target.value))}
          style={{ width: '100%', background: '#1a1a2e', color: '#fff', border: '1px solid #444', padding: '4px 6px', borderRadius: 4, marginTop: 4 }} />
      </label>
      <label>
        Travel Time (seconds)
        <input type="number" min={1} value={travelTime}
          onChange={e => setTravelTime(Number(e.target.value))}
          style={{ width: '100%', background: '#1a1a2e', color: '#fff', border: '1px solid #444', padding: '4px 6px', borderRadius: 4, marginTop: 4 }} />
      </label>
      {error && <div style={{ color: '#f44', fontSize: 12 }}>{error}</div>}
      {success && <div style={{ color: '#4f4', fontSize: 12 }}>{success}</div>}
      <button type="submit" disabled={loading}
        style={{ background: '#1e40af', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', cursor: 'pointer' }}>
        {loading ? 'Creating…' : `Create ${missionLabel} Group`}
      </button>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Sub-component: ACS Group list row
// ---------------------------------------------------------------------------

function ACSGroupRow({ group, onRefresh }: { group: ACSStatusResponse; onRefresh: () => void }) {
  const { attack, participants, syncArrivalTime } = group
  const playerId = DEFAULT_PLAYER_ID
  const isInitiator = attack.initiatorId === playerId
  const alreadyJoined = participants.some(p => p.playerId === playerId)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function doAction(action: 'join' | 'launch' | 'cancel') {
    setError(null)
    setLoading(true)
    try {
      let url = ''
      let body: Record<string, unknown> = {}
      if (action === 'join') {
        url = `/api/acs/join/${attack.id}`
        body = {
          playerId,
          planetId: `planet-${playerId}`,
          ships: { lightFighter: 5, heavyFighter: 0, cruiser: 0, battleship: 0, battlecruiser: 0, bomber: 0, destroyer: 0, deathstar: 0, smallCargo: 0, largeCargo: 0, colonyShip: 0, recycler: 0, espionageProbe: 0, solarSatellite: 0 },
          travelTime: 300,
        }
      } else if (action === 'launch') {
        url = `/api/acs/launch/${attack.id}`
        body = { playerId }
      } else {
        url = `/api/acs/cancel/${attack.id}`
        body = { playerId }
      }
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const d = await res.json() as { error?: string }
        setError(d.error ?? 'Action failed')
      } else {
        onRefresh()
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ background: '#0f172a', border: '1px solid #334', borderRadius: 8, padding: 12, marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span style={{ color: '#60a5fa', fontWeight: 600 }}>Target: {fmtCoord(attack)}</span>
          <span style={{ marginLeft: 12, color: '#94a3b8', fontSize: 12 }}>Status: {attack.status}</span>
          <span style={{ marginLeft: 12, color: '#94a3b8', fontSize: 12 }}>
            Participants: {participants.length}/{attack.maxParticipants}
          </span>
        </div>
        <div style={{ fontSize: 11, color: '#64748b' }}>
          Sync arrival: {syncArrivalTime !== null ? `${syncArrivalTime}s` : '—'}
          {attack.arrivalTime && <span style={{ marginLeft: 8 }}>ETA: {fmtTime(attack.arrivalTime)}</span>}
        </div>
      </div>
      <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {participants.map(p => (
          <span key={p.playerId} style={{ background: '#1e293b', color: '#cbd5e1', borderRadius: 4, padding: '2px 8px', fontSize: 11 }}>
            {p.playerName} ({p.status})
          </span>
        ))}
      </div>
      {error && <div style={{ color: '#f44', fontSize: 11, marginTop: 4 }}>{error}</div>}
      {attack.status === 'gathering' && (
        <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
          {!alreadyJoined && (
            <button disabled={loading} onClick={() => doAction('join')}
              style={{ background: '#065f46', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 12px', cursor: 'pointer', fontSize: 12 }}>
              Join
            </button>
          )}
          {isInitiator && (
            <>
              <button disabled={loading} onClick={() => doAction('launch')}
                style={{ background: '#1e40af', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 12px', cursor: 'pointer', fontSize: 12 }}>
                Launch
              </button>
              <button disabled={loading} onClick={() => doAction('cancel')}
                style={{ background: '#7f1d1d', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 12px', cursor: 'pointer', fontSize: 12 }}>
                Cancel
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main ACSPanel component
// ---------------------------------------------------------------------------

interface ACSPanelProps {
  onClose: () => void
}

export default function ACSPanel({ onClose }: ACSPanelProps) {
  const [tab, setTab] = useState<'attack' | 'defend'>('attack')
  const [groups, setGroups] = useState<ACSStatusResponse[]>([])
  const [loading, setLoading] = useState(false)
  const playerId = DEFAULT_PLAYER_ID

  const fetchGroups = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/acs/player/${playerId}`)
      if (res.ok) {
        const attacks: ACSAttack[] = await res.json()
        // For each attack, fetch full status
        const statuses = await Promise.all(
          attacks.map(async a => {
            const r = await fetch(`/api/acs/status/${a.id}`)
            if (r.ok) return r.json() as Promise<ACSStatusResponse>
            return null
          })
        )
        setGroups(statuses.filter(Boolean) as ACSStatusResponse[])
      }
    } catch {
      // ignore fetch errors (offline)
    } finally {
      setLoading(false)
    }
  }, [playerId])

  useEffect(() => {
    fetchGroups()
    const iv = setInterval(fetchGroups, 10000)
    return () => clearInterval(iv)
  }, [fetchGroups])

  const panelStyle: React.CSSProperties = {
    background: '#0a0f1e',
    border: '1px solid #1e3a5f',
    borderRadius: 12,
    padding: 20,
    width: 600,
    maxWidth: '95vw',
    maxHeight: '80vh',
    overflowY: 'auto',
    color: '#e2e8f0',
    fontFamily: 'monospace',
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 18px',
    borderRadius: '6px 6px 0 0',
    border: '1px solid #334',
    borderBottom: active ? 'none' : '1px solid #334',
    background: active ? '#0a0f1e' : '#0d1526',
    color: active ? '#60a5fa' : '#94a3b8',
    cursor: 'pointer',
    marginRight: 2,
  })

  return (
    <div style={panelStyle}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0, color: '#60a5fa', fontSize: 18 }}>Alliance Combat System</h2>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 20, cursor: 'pointer' }}>
          x
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #334', marginBottom: 16 }}>
        <button style={tabStyle(tab === 'attack')} onClick={() => setTab('attack')}>Attack</button>
        <button style={tabStyle(tab === 'defend')} onClick={() => setTab('defend')}>Defend</button>
      </div>

      {/* Create form */}
      <div style={{ marginBottom: 20 }}>
        <h3 style={{ margin: '0 0 10px', color: '#93c5fd', fontSize: 14 }}>
          {tab === 'attack' ? 'Create ACS Attack Group' : 'Create ACS Defense Group'}
        </h3>
        <CreateForm
          missionLabel={tab === 'attack' ? 'Attack' : 'Defense'}
          onCreated={fetchGroups}
        />
      </div>

      {/* Active groups */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h3 style={{ margin: 0, color: '#93c5fd', fontSize: 14 }}>
            Your Active ACS Groups
          </h3>
          <button onClick={fetchGroups} disabled={loading}
            style={{ background: 'none', border: '1px solid #334', color: '#94a3b8', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 11 }}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
        {groups.length === 0 && !loading && (
          <div style={{ color: '#64748b', fontSize: 12 }}>No active ACS groups. Create one above or ask your alliance!</div>
        )}
        {groups.map(g => (
          <ACSGroupRow key={g.attack.id} group={g} onRefresh={fetchGroups} />
        ))}
      </div>

      {tab === 'defend' && (
        <div style={{ marginTop: 12, padding: '8px 12px', background: '#0f2937', borderRadius: 6, color: '#7dd3fc', fontSize: 12 }}>
          Defense missions work identically to attack groups — create a group to defend coordinates,
          invite alliance members to add their fleets, then launch synchronized defense.
          Mission type is tracked server-side. All ACS groups (attack &amp; defense) appear in the list above.
        </div>
      )}
    </div>
  )
}
