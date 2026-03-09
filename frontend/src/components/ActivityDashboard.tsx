import { useEffect, useState, useCallback, useRef } from 'react'
import { getPlayerId, getPlanetId, API_BASE_URL } from '../lib/config'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ResourceData {
  metal: number
  crystal: number
  deuterium: number
  energy: number
  production: {
    metalPerHour: number
    crystalPerHour: number
    deutPerHour: number
    energyProduction?: number
    energyConsumption?: number
  }
}

interface QueueItem {
  buildingType?: string
  buildingId?: number
  level?: number
  targetLevel?: number
  completesAt?: number
  timeEnd?: number
}

interface Mission {
  id?: string
  missionType?: string
  mission_type?: string
  arrivalTime?: number
  arrival_time?: number
  targetPlanetId?: string
  returnTime?: number
  return_time?: number
}

interface GameEvent {
  id: string
  type: string
  message: string
  timestamp: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(Math.floor(n))
}

function fmtCountdown(ms: number): string {
  if (ms <= 0) return 'Done'
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h ${m}m ${sec}s`
  if (m > 0) return `${m}m ${sec}s`
  return `${sec}s`
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const BUILDING_NAMES: Record<string, string> = {
  '1': 'Metal Mine', '2': 'Crystal Mine', '3': 'Deut Synth',
  '4': 'Solar Plant', '12': 'Fusion Reactor', '14': 'Robotics',
  '15': 'Nanite Factory', '21': 'Shipyard', '22': 'Metal Storage',
  '23': 'Crystal Storage', '24': 'Deut Tank', '31': 'Research Lab',
  metalMine: 'Metal Mine', crystalMine: 'Crystal Mine', deutSynth: 'Deut Synth',
  solarPlant: 'Solar Plant', fusionReactor: 'Fusion Reactor',
  roboticsFactory: 'Robotics', shipyard: 'Shipyard', researchLab: 'Research Lab',
}

function getBuildingName(item: QueueItem): string {
  const key = item.buildingType ?? String(item.buildingId ?? '')
  return BUILDING_NAMES[key] ?? key ?? 'Building'
}

function getLevel(item: QueueItem): number {
  return item.targetLevel ?? item.level ?? 0
}

function getCompletesAt(item: QueueItem): number {
  return item.completesAt ?? item.timeEnd ?? 0
}

function getMissionType(m: Mission): string {
  return m.missionType ?? m.mission_type ?? 'Mission'
}

function getArrivalTime(m: Mission): number {
  return m.arrivalTime ?? m.arrival_time ?? 0
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ActivityDashboard() {
  const [collapsed, setCollapsed] = useState(false)
  const [resources, setResources] = useState<ResourceData | null>(null)
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [missions, setMissions] = useState<Mission[]>([])
  const [events, setEvents] = useState<GameEvent[]>([])
  const [tick, setTick] = useState(0) // forces countdown re-render
  const [registered, setRegistered] = useState(true)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const playerId = getPlayerId()
  const planetId = getPlanetId()

  // Consider unregistered if using defaults with no localStorage value
  useEffect(() => {
    const stored = localStorage.getItem('cp_player_id') ?? localStorage.getItem('og_player_id')
    setRegistered(!!stored)
  }, [])

  const fetchAll = useCallback(async () => {
    if (!registered) return
    const base = API_BASE_URL
    try {
      // Resources + production
      const resResp = await fetch(`${base}/api/planet/${encodeURIComponent(planetId)}/resources?player_id=${encodeURIComponent(playerId)}`)
      if (resResp.ok) {
        const data: ResourceData = await resResp.json()
        setResources(data)
      }
    } catch { /* offline */ }

    try {
      // Build queue
      const qResp = await fetch(`${base}/api/planet/${encodeURIComponent(planetId)}/queue?player_id=${encodeURIComponent(playerId)}`)
      if (qResp.ok) {
        const data: QueueItem[] | { queue?: QueueItem[] } = await qResp.json()
        setQueue(Array.isArray(data) ? data : (data.queue ?? []))
      }
    } catch { /* offline */ }

    try {
      // Active missions
      const mResp = await fetch(`${base}/api/missions?player_id=${encodeURIComponent(playerId)}`)
      if (mResp.ok) {
        const data: Mission[] | { missions?: Mission[] } = await mResp.json()
        setMissions(Array.isArray(data) ? data : (data.missions ?? []))
      }
    } catch { /* offline */ }

    try {
      // Events (battle reports / notifications as proxy)
      const eResp = await fetch(`${base}/api/notifications?player_id=${encodeURIComponent(playerId)}&limit=5`)
      if (eResp.ok) {
        const raw: { notifications?: { id: string; type: string; message: string; createdAt?: number; created_at?: number }[] } = await eResp.json()
        const notifs = raw.notifications ?? []
        setEvents(notifs.slice(0, 5).map(n => ({
          id: n.id,
          type: n.type,
          message: n.message,
          timestamp: n.createdAt ?? n.created_at ?? Date.now(),
        })))
      }
    } catch { /* offline */ }
  }, [playerId, planetId, registered])

  useEffect(() => {
    if (!registered) return
    fetchAll()
    intervalRef.current = setInterval(fetchAll, 5000)
    tickRef.current = setInterval(() => setTick(t => t + 1), 1000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      if (tickRef.current) clearInterval(tickRef.current)
    }
  }, [fetchAll, registered])

  if (!registered) {
    return (
      <div style={panelStyle}>
        <div style={headerStyle} onClick={() => setCollapsed(v => !v)}>
          <span style={{ color: '#5b9cf6', letterSpacing: 2, fontWeight: 600, fontSize: 10 }}>LIVE ACTIVITY</span>
        </div>
        <div style={{ padding: '8px 12px', color: '#64748b', fontSize: 11 }}>
          Register to play to see live data.
        </div>
      </div>
    )
  }

  const activeQueue = queue.filter(item => getCompletesAt(item) > Date.now())
  const firstQueued = activeQueue[0]
  const nextQueued = activeQueue[1]
  const now = Date.now()

  const energyProd = resources?.production?.energyProduction ?? resources?.energy ?? 0
  const energyCons = resources?.production?.energyConsumption ?? 0
  const energyBalance = energyCons > 0 ? energyProd - energyCons : (resources?.energy ?? 0)
  const energyNegative = energyCons > 0 && energyBalance < 0

  // Nearest fleet ETA
  const sortedMissions = [...missions].sort((a, b) => getArrivalTime(a) - getArrivalTime(b))
  const nearestMission = sortedMissions[0]

  return (
    <div style={panelStyle}>
      {/* Header / collapse toggle */}
      <div style={headerStyle} onClick={() => setCollapsed(v => !v)} title="Click to collapse/expand">
        <span style={{ color: '#5b9cf6', letterSpacing: 2, fontSize: 10, fontWeight: 600 }}>LIVE ACTIVITY</span>
        <span style={{ color: '#475569', fontSize: 10 }}>
          {collapsed ? '▶ Expand' : '▼ Collapse'}
        </span>
      </div>

      {!collapsed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>

          {/* Build Queue */}
          <Section label="BUILD QUEUE">
            {activeQueue.length === 0 ? (
              <Row label="Queue" value="Empty" dim />
            ) : (
              <>
                <Row
                  label={`${getBuildingName(firstQueued)} Lv${getLevel(firstQueued)}`}
                  value={fmtCountdown(getCompletesAt(firstQueued) - now)}
                  valueColor="#f59e0b"
                  badge="ACTIVE"
                />
                {nextQueued && (
                  <Row
                    label={`${getBuildingName(nextQueued)} Lv${getLevel(nextQueued)}`}
                    value={`~${fmtCountdown(getCompletesAt(nextQueued) - now)}`}
                    dim
                  />
                )}
                {activeQueue.length > 2 && (
                  <Row label={`+${activeQueue.length - 2} more`} value="" dim />
                )}
              </>
            )}
          </Section>

          {/* Resource Production */}
          <Section label="PRODUCTION /HR">
            {resources ? (
              <>
                <Row label="Metal" value={`+${fmtNum(resources.production.metalPerHour)}`} valueColor="#94a3b8" />
                <Row label="Crystal" value={`+${fmtNum(resources.production.crystalPerHour)}`} valueColor="#7dd3fc" />
                <Row label="Deut" value={`+${fmtNum(resources.production.deutPerHour)}`} valueColor="#6ee7b7" />
              </>
            ) : (
              <Row label="Status" value="Loading..." dim />
            )}
          </Section>

          {/* Energy */}
          <Section label="ENERGY">
            {resources ? (
              energyCons > 0 ? (
                <>
                  <Row label="Production" value={fmtNum(energyProd)} valueColor="#f59e0b" />
                  <Row label="Consumption" value={fmtNum(energyCons)} valueColor="#fb923c" />
                  <Row
                    label="Balance"
                    value={(energyBalance >= 0 ? '+' : '') + fmtNum(energyBalance)}
                    valueColor={energyNegative ? '#f87171' : '#34d399'}
                  />
                  {energyNegative && (
                    <div style={{ color: '#f59e0b', fontSize: 9, marginTop: 2, textAlign: 'center' }}>
                      ⚠ ENERGY DEFICIT — production reduced
                    </div>
                  )}
                </>
              ) : (
                <Row
                  label="Energy"
                  value={fmtNum(resources.energy)}
                  valueColor={resources.energy < 0 ? '#f87171' : '#f59e0b'}
                />
              )
            ) : (
              <Row label="Status" value="Loading..." dim />
            )}
          </Section>

          {/* Fleet Missions */}
          <Section label={`FLEET MISSIONS (${missions.length})`}>
            {missions.length === 0 ? (
              <Row label="Status" value="No active missions" dim />
            ) : (
              <>
                {nearestMission && (
                  <Row
                    label={getMissionType(nearestMission)}
                    value={`ETA ${fmtCountdown(getArrivalTime(nearestMission) - now)}`}
                    valueColor="#93c5fd"
                    badge="NEXT"
                  />
                )}
                {missions.length > 1 && (
                  <Row label={`+${missions.length - 1} more`} value="" dim />
                )}
              </>
            )}
          </Section>

          {/* Recent Events */}
          <Section label="RECENT EVENTS">
            {events.length === 0 ? (
              <Row label="Events" value="No recent events" dim />
            ) : (
              events.slice(0, 4).map(ev => (
                <div key={ev.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 4, marginBottom: 2 }}>
                  <span style={{
                    fontSize: 10,
                    color: ev.type === 'attack' ? '#f87171' : ev.type === 'build' ? '#34d399' : '#64748b',
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }} title={ev.message}>
                    {ev.message}
                  </span>
                  <span style={{ fontSize: 9, color: '#334155', flexShrink: 0 }}>
                    {fmtTime(ev.timestamp)}
                  </span>
                </div>
              ))
            )}
          </Section>

          {/* Footer refresh indicator */}
          <div style={{ textAlign: 'right', fontSize: 9, color: '#1e293b', marginTop: 2, padding: '0 12px 4px' }}>
            auto-refresh 5s
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Style helpers
// ---------------------------------------------------------------------------

const panelStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 20,
  left: 20,
  width: 244,
  background: 'rgba(8, 14, 28, 0.88)',
  border: '1px solid rgba(100, 140, 200, 0.18)',
  borderRadius: 8,
  boxShadow: '0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)',
  backdropFilter: 'blur(12px)',
  fontFamily: "'Inter', system-ui, sans-serif",
  color: '#e2e8f0',
  fontSize: 11,
  zIndex: 50,
  pointerEvents: 'all',
  maxHeight: '70vh',
  overflowY: 'auto',
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '7px 12px',
  cursor: 'pointer',
  borderBottom: '1px solid rgba(100, 140, 200, 0.12)',
  userSelect: 'none',
  background: 'rgba(255,255,255,0.03)',
  borderRadius: '8px 8px 0 0',
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '4px 12px 2px' }}>
      <div style={{ color: '#64748b', fontSize: 9, letterSpacing: 1.5, marginBottom: 4, fontWeight: 600, textTransform: 'uppercase' }}>
        {label}
      </div>
      {children}
    </div>
  )
}

function Row({
  label,
  value,
  valueColor,
  dim,
  badge,
}: {
  label: string
  value: string
  valueColor?: string
  dim?: boolean
  badge?: string
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
      <span style={{ color: dim ? '#334155' : '#64748b', fontSize: 10, flex: 1 }}>{label}</span>
      {badge && (
        <span style={{
          fontSize: 8, color: '#0f172a', background: '#5b9cf6',
          borderRadius: 3, padding: '0 4px', marginRight: 5, letterSpacing: 0.5, fontWeight: 700,
        }}>{badge}</span>
      )}
      <span style={{ color: valueColor ?? (dim ? '#334155' : '#e2e8f0'), fontSize: 10, fontWeight: 600, fontFamily: "'Courier New', monospace" }}>
        {value}
      </span>
    </div>
  )
}
