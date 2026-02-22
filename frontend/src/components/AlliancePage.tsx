/**
 * AlliancePage.tsx
 *
 * Alliance management UI for Cosmic Protocol.
 *
 * Features:
 * - Alliance info: name, tag, description, member count, total points
 * - Member list table: name, rank/role, points, online status
 * - Applications tab: pending applications with accept/reject buttons
 * - Broadcast tab: send message to all members
 * - Settings tab (leader only): edit name/tag/description, manage roles
 * - Join / leave / create alliance buttons
 *
 * Keyboard shortcut: W (G=galaxy, A=assets, L=leaderboard, T=trades, R=research)
 * Aesthetic: green retro-terminal matching HUD.tsx / Leaderboard.tsx
 */

import { useState, useEffect, useCallback } from 'react'
import { DEFAULT_PLAYER_ID } from '../lib/config'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AllianceRole = 'founder' | 'officer' | 'member' | 'applicant'

interface Alliance {
  id: string
  name: string
  tag: string
  founderId: string
  description: string
  memberCount: number
  totalPoints?: number
  createdAt: number
}

interface AllianceMember {
  playerId: string
  playerName: string
  allianceId: string
  role: AllianceRole
  joinedAt: number
  points?: number
  online?: boolean
}

interface AllianceApplication {
  id: string
  playerId: string
  playerName: string
  allianceId: string
  message: string
  createdAt: number
}

type ActiveTab = 'members' | 'applications' | 'broadcast' | 'settings'

// ---------------------------------------------------------------------------
// Role hierarchy helper
// ---------------------------------------------------------------------------

const ROLE_RANK: Record<AllianceRole, number> = {
  founder: 3,
  officer: 2,
  member: 1,
  applicant: 0,
}

function roleColor(role: AllianceRole): string {
  switch (role) {
    case 'founder':   return '#ffd700'
    case 'officer':   return '#44aaff'
    case 'member':    return '#00ff41'
    case 'applicant': return '#888888'
  }
}

function roleLabel(role: AllianceRole): string {
  switch (role) {
    case 'founder':   return 'FOUNDER'
    case 'officer':   return 'OFFICER'
    case 'member':    return 'MEMBER'
    case 'applicant': return 'APPLICANT'
  }
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function apiFetchAlliance(id: string): Promise<Alliance | null> {
  try {
    const res = await fetch(`/api/alliance/${id}`)
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

async function apiFetchMembers(id: string): Promise<AllianceMember[]> {
  try {
    const res = await fetch(`/api/alliance/${id}/members`)
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? data : data.members ?? []
  } catch {
    return []
  }
}

async function apiFetchApplications(id: string): Promise<AllianceApplication[]> {
  try {
    const res = await fetch(`/api/alliance/${id}/applications`)
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? data : data.applications ?? []
  } catch {
    return []
  }
}

async function apiCreateAlliance(
  playerId: string,
  name: string,
  tag: string,
  description: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/alliance/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId, name, tag, description }),
    })
    const data = await res.json()
    return res.ok ? { ok: true } : { ok: false, error: data.error ?? 'Create failed' }
  } catch {
    return { ok: false, error: 'Network error' }
  }
}

async function apiJoinAlliance(
  allianceId: string,
  playerId: string,
  message: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`/api/alliance/${allianceId}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId, message }),
    })
    const data = await res.json()
    return res.ok ? { ok: true } : { ok: false, error: data.error ?? 'Join failed' }
  } catch {
    return { ok: false, error: 'Network error' }
  }
}

async function apiLeaveAlliance(
  allianceId: string,
  playerId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`/api/alliance/${allianceId}/leave`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId }),
    })
    const data = await res.json()
    return res.ok ? { ok: true } : { ok: false, error: data.error ?? 'Leave failed' }
  } catch {
    return { ok: false, error: 'Network error' }
  }
}

async function apiAcceptApplication(
  allianceId: string,
  applicationId: string,
  actorId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`/api/alliance/${allianceId}/applications/${applicationId}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actorId }),
    })
    const data = await res.json()
    return res.ok ? { ok: true } : { ok: false, error: data.error ?? 'Accept failed' }
  } catch {
    return { ok: false, error: 'Network error' }
  }
}

async function apiRejectApplication(
  allianceId: string,
  applicationId: string,
  actorId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`/api/alliance/${allianceId}/applications/${applicationId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actorId }),
    })
    const data = await res.json()
    return res.ok ? { ok: true } : { ok: false, error: data.error ?? 'Reject failed' }
  } catch {
    return { ok: false, error: 'Network error' }
  }
}

async function apiBroadcast(
  allianceId: string,
  actorId: string,
  subject: string,
  body: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`/api/alliance/${allianceId}/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actorId, subject, body }),
    })
    const data = await res.json()
    return res.ok ? { ok: true } : { ok: false, error: data.error ?? 'Broadcast failed' }
  } catch {
    return { ok: false, error: 'Network error' }
  }
}

async function apiUpdateAlliance(
  allianceId: string,
  actorId: string,
  updates: { name?: string; tag?: string; description?: string }
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`/api/alliance/${allianceId}/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actorId, ...updates }),
    })
    const data = await res.json()
    return res.ok ? { ok: true } : { ok: false, error: data.error ?? 'Update failed' }
  } catch {
    return { ok: false, error: 'Network error' }
  }
}

async function apiSetRole(
  allianceId: string,
  actorId: string,
  targetPlayerId: string,
  role: AllianceRole
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`/api/alliance/${allianceId}/members/${targetPlayerId}/role`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actorId, role }),
    })
    const data = await res.json()
    return res.ok ? { ok: true } : { ok: false, error: data.error ?? 'Role update failed' }
  } catch {
    return { ok: false, error: 'Network error' }
  }
}

async function apiKickMember(
  allianceId: string,
  actorId: string,
  targetPlayerId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`/api/alliance/${allianceId}/members/${targetPlayerId}/kick`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actorId }),
    })
    const data = await res.json()
    return res.ok ? { ok: true } : { ok: false, error: data.error ?? 'Kick failed' }
  } catch {
    return { ok: false, error: 'Network error' }
  }
}

// ---------------------------------------------------------------------------
// Mock data for offline / dev mode
// ---------------------------------------------------------------------------

function mockAlliance(): Alliance {
  return {
    id: 'alliance-mock-1',
    name: 'Void Covenant',
    tag: 'VOID',
    founderId: 'player-1',
    description: 'Elite commanders united against the chaos of the cosmos. Disciplined. Relentless. Victorious.',
    memberCount: 7,
    totalPoints: 1_284_500,
    createdAt: Math.floor(Date.now() / 1000) - 86400 * 30,
  }
}

function mockMembers(): AllianceMember[] {
  const roles: AllianceRole[] = ['founder', 'officer', 'officer', 'member', 'member', 'member', 'applicant']
  return roles.map((role, i) => ({
    playerId: `player-${i + 1}`,
    playerName: `Commander${String(i + 1).padStart(3, '0')}`,
    allianceId: 'alliance-mock-1',
    role,
    joinedAt: Math.floor(Date.now() / 1000) - 86400 * (30 - i * 3),
    points: Math.floor(300000 - i * 35000 + Math.random() * 10000),
    online: i < 3,
  }))
}

function mockApplications(): AllianceApplication[] {
  return [
    {
      id: 'app-1',
      playerId: 'player-100',
      playerName: 'Rogue Nova',
      allianceId: 'alliance-mock-1',
      message: 'I bring 50K fleet points and strong espionage support. Ready for coordinated strikes.',
      createdAt: Math.floor(Date.now() / 1000) - 3600,
    },
    {
      id: 'app-2',
      playerId: 'player-101',
      playerName: 'DarkPulsar',
      allianceId: 'alliance-mock-1',
      message: 'Active daily. Experienced raider. Can follow orders.',
      createdAt: Math.floor(Date.now() / 1000) - 7200 * 2,
    },
  ]
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(Math.floor(n))
}

function formatDate(unix: number): string {
  return new Date(unix * 1000).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function formatTimeAgo(unix: number): string {
  const diff = Math.floor(Date.now() / 1000) - unix
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface AlliancePageProps {
  onClose?: () => void
  /** The current player's ID — determines permissions */
  playerId?: string
  /** Pre-loaded alliance ID to display; if null, show search/create screen */
  allianceId?: string | null
}

// ---------------------------------------------------------------------------
// Component: AlliancePage
// ---------------------------------------------------------------------------

export default function AlliancePage({
  onClose,
  playerId = DEFAULT_PLAYER_ID,
  allianceId: initialAllianceId = null,
}: AlliancePageProps) {
  // ---- State: which alliance we're looking at ----
  const [allianceId, setAllianceId] = useState<string | null>(initialAllianceId)
  const [alliance, setAlliance] = useState<Alliance | null>(null)
  const [members, setMembers] = useState<AllianceMember[]>([])
  const [applications, setApplications] = useState<AllianceApplication[]>([])
  const [myMembership, setMyMembership] = useState<AllianceMember | null>(null)

  // ---- UI state ----
  const [activeTab, setActiveTab] = useState<ActiveTab>('members')
  const [loading, setLoading] = useState(false)
  const [offline, setOffline] = useState(false)
  const [flashMsg, setFlashMsg] = useState<{ text: string; ok: boolean } | null>(null)

  // ---- Create/Search state ----
  const [showCreate, setShowCreate] = useState(false)
  const [showJoin, setShowJoin] = useState(false)
  const [searchAllianceId, setSearchAllianceId] = useState('')
  const [joinMessage, setJoinMessage] = useState('')
  const [createName, setCreateName] = useState('')
  const [createTag, setCreateTag] = useState('')
  const [createDesc, setCreateDesc] = useState('')
  const [createBusy, setCreateBusy] = useState(false)

  // ---- Broadcast state ----
  const [bcastSubject, setBcastSubject] = useState('')
  const [bcastBody, setBcastBody] = useState('')
  const [bcastBusy, setBcastBusy] = useState(false)

  // ---- Settings state ----
  const [settingsName, setSettingsName] = useState('')
  const [settingsTag, setSettingsTag] = useState('')
  const [settingsDesc, setSettingsDesc] = useState('')
  const [settingsBusy, setSettingsBusy] = useState(false)

  // ---- Flash message helper ----
  const flash = useCallback((text: string, ok = true) => {
    setFlashMsg({ text, ok })
    setTimeout(() => setFlashMsg(null), 3500)
  }, [])

  // ---- Load alliance data ----
  const loadAlliance = useCallback(async (id: string) => {
    setLoading(true)

    const [allianceData, memberData] = await Promise.all([
      apiFetchAlliance(id),
      apiFetchMembers(id),
    ])

    if (!allianceData) {
      // Use mock data when offline
      const mock = mockAlliance()
      const mockMems = mockMembers()
      setAlliance(mock)
      setMembers(mockMems)
      setMyMembership(mockMems.find((m) => m.playerId === playerId) ?? null)
      setApplications(mockApplications())
      setOffline(true)
    } else {
      setAlliance(allianceData)
      setMembers(memberData)
      setMyMembership(memberData.find((m) => m.playerId === playerId) ?? null)
      setOffline(false)

      // Load applications if officer+
      const myRole = memberData.find((m) => m.playerId === playerId)?.role
      if (myRole && ROLE_RANK[myRole] >= ROLE_RANK['officer']) {
        const apps = await apiFetchApplications(id)
        setApplications(apps)
      }
    }

    setLoading(false)
  }, [playerId])

  // Sync settings fields when alliance loads
  useEffect(() => {
    if (alliance) {
      setSettingsName(alliance.name)
      setSettingsTag(alliance.tag)
      setSettingsDesc(alliance.description)
    }
  }, [alliance])

  useEffect(() => {
    if (allianceId) {
      loadAlliance(allianceId)
    }
  }, [allianceId, loadAlliance])

  // ---- Permission shortcuts ----
  const myRole = myMembership?.role ?? null
  const canManageApplications =
    myRole !== null && ROLE_RANK[myRole] >= ROLE_RANK['officer']
  const canBroadcast =
    myRole !== null && ROLE_RANK[myRole] >= ROLE_RANK['member']
  const canEditSettings =
    myRole !== null && ROLE_RANK[myRole] >= ROLE_RANK['founder']

  // ---- Actions ----

  async function handleCreate() {
    if (!createName.trim() || !createTag.trim()) {
      flash('Name and tag are required', false)
      return
    }
    setCreateBusy(true)
    const result = await apiCreateAlliance(playerId, createName.trim(), createTag.trim().toUpperCase(), createDesc.trim())
    setCreateBusy(false)
    if (result.ok) {
      flash('Alliance created!')
      setShowCreate(false)
      // Reload with alliance-<timestamp> pattern — for now, reload from search
      setSearchAllianceId(createTag.trim().toUpperCase())
    } else {
      flash(result.error ?? 'Create failed', false)
    }
  }

  async function handleJoin() {
    if (!allianceId) return
    const result = await apiJoinAlliance(allianceId, playerId, joinMessage)
    if (result.ok) {
      flash('Application sent!')
      setShowJoin(false)
      setJoinMessage('')
      loadAlliance(allianceId)
    } else {
      flash(result.error ?? 'Join failed', false)
    }
  }

  async function handleLeave() {
    if (!allianceId) return
    if (!window.confirm('Leave this alliance?')) return
    const result = await apiLeaveAlliance(allianceId, playerId)
    if (result.ok) {
      flash('You left the alliance')
      setMyMembership(null)
      loadAlliance(allianceId)
    } else {
      flash(result.error ?? 'Leave failed', false)
    }
  }

  async function handleAccept(app: AllianceApplication) {
    if (!allianceId) return
    const result = await apiAcceptApplication(allianceId, app.id, playerId)
    if (result.ok) {
      flash(`Accepted ${app.playerName}`)
      setApplications((prev) => prev.filter((a) => a.id !== app.id))
      loadAlliance(allianceId)
    } else {
      flash(result.error ?? 'Accept failed', false)
    }
  }

  async function handleReject(app: AllianceApplication) {
    if (!allianceId) return
    const result = await apiRejectApplication(allianceId, app.id, playerId)
    if (result.ok) {
      flash(`Rejected ${app.playerName}`)
      setApplications((prev) => prev.filter((a) => a.id !== app.id))
    } else {
      flash(result.error ?? 'Reject failed', false)
    }
  }

  async function handleBroadcast() {
    if (!allianceId || !bcastSubject.trim() || !bcastBody.trim()) {
      flash('Subject and message are required', false)
      return
    }
    setBcastBusy(true)
    const result = await apiBroadcast(allianceId, playerId, bcastSubject.trim(), bcastBody.trim())
    setBcastBusy(false)
    if (result.ok) {
      flash('Broadcast sent to all members!')
      setBcastSubject('')
      setBcastBody('')
    } else {
      flash(result.error ?? 'Broadcast failed', false)
    }
  }

  async function handleSaveSettings() {
    if (!allianceId) return
    setSettingsBusy(true)
    const result = await apiUpdateAlliance(allianceId, playerId, {
      name: settingsName.trim(),
      tag: settingsTag.trim().toUpperCase(),
      description: settingsDesc.trim(),
    })
    setSettingsBusy(false)
    if (result.ok) {
      flash('Alliance settings updated!')
      loadAlliance(allianceId)
    } else {
      flash(result.error ?? 'Update failed', false)
    }
  }

  async function handleKick(member: AllianceMember) {
    if (!allianceId) return
    if (!window.confirm(`Kick ${member.playerName}?`)) return
    const result = await apiKickMember(allianceId, playerId, member.playerId)
    if (result.ok) {
      flash(`Kicked ${member.playerName}`)
      setMembers((prev) => prev.filter((m) => m.playerId !== member.playerId))
    } else {
      flash(result.error ?? 'Kick failed', false)
    }
  }

  async function handlePromote(member: AllianceMember) {
    if (!allianceId) return
    const newRole: AllianceRole = member.role === 'member' ? 'officer' : 'member'
    const result = await apiSetRole(allianceId, playerId, member.playerId, newRole)
    if (result.ok) {
      flash(`${member.playerName} is now ${newRole}`)
      setMembers((prev) =>
        prev.map((m) => (m.playerId === member.playerId ? { ...m, role: newRole } : m))
      )
    } else {
      flash(result.error ?? 'Role update failed', false)
    }
  }

  // ---------------------------------------------------------------------------
  // Render: no alliance selected yet
  // ---------------------------------------------------------------------------

  if (!allianceId) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <span style={styles.title}>// ALLIANCE COMMAND</span>
          <div style={styles.headerRight}>
            {onClose && (
              <button style={styles.closeBtn} onClick={onClose}>[X]</button>
            )}
          </div>
        </div>

        <div style={styles.welcomeBody}>
          <div style={styles.asciiArt}>
            {`  ██████╗ ██████╗ ███████╗
 ██╔═══██╗██╔══██╗██╔════╝
 ██║   ██║██████╔╝███████╗
 ██║   ██║██╔═══╝ ╚════██║
 ╚██████╔╝██║     ███████║
  ╚═════╝ ╚═╝     ╚══════╝`}
          </div>

          <p style={styles.welcomeText}>
            Unite with other commanders. Share intelligence. Dominate the galaxy.
          </p>

          {/* Search for existing alliance */}
          <div style={styles.welcomeSection}>
            <div style={styles.sectionLabel}>JOIN EXISTING ALLIANCE</div>
            <div style={styles.row}>
              <input
                style={styles.input}
                placeholder="Enter alliance ID or tag..."
                value={searchAllianceId}
                onChange={(e) => setSearchAllianceId(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && searchAllianceId.trim()) {
                    setAllianceId(searchAllianceId.trim())
                  }
                }}
              />
              <button
                style={styles.btnPrimary}
                onClick={() => {
                  if (searchAllianceId.trim()) setAllianceId(searchAllianceId.trim())
                }}
              >
                SEARCH
              </button>
            </div>
          </div>

          {/* Create new */}
          <div style={styles.welcomeSection}>
            <div style={styles.sectionLabel}>FOUND NEW ALLIANCE</div>
            {!showCreate ? (
              <button style={styles.btnPrimary} onClick={() => setShowCreate(true)}>
                CREATE ALLIANCE
              </button>
            ) : (
              <div style={styles.createForm}>
                <label style={styles.fieldLabel}>Name (3–32 chars)</label>
                <input
                  style={styles.input}
                  placeholder="e.g. Void Covenant"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  maxLength={32}
                />
                <label style={styles.fieldLabel}>Tag (3–8 uppercase)</label>
                <input
                  style={styles.input}
                  placeholder="e.g. VOID"
                  value={createTag}
                  onChange={(e) => setCreateTag(e.target.value.toUpperCase())}
                  maxLength={8}
                />
                <label style={styles.fieldLabel}>Description</label>
                <textarea
                  style={{ ...styles.input, height: 72, resize: 'vertical' }}
                  placeholder="What is your alliance about?"
                  value={createDesc}
                  onChange={(e) => setCreateDesc(e.target.value)}
                  maxLength={500}
                />
                <div style={styles.row}>
                  <button
                    style={styles.btnPrimary}
                    onClick={handleCreate}
                    disabled={createBusy}
                  >
                    {createBusy ? 'CREATING...' : 'CONFIRM CREATE'}
                  </button>
                  <button
                    style={styles.btnSecondary}
                    onClick={() => { setShowCreate(false); setCreateName(''); setCreateTag(''); setCreateDesc('') }}
                  >
                    CANCEL
                  </button>
                </div>
              </div>
            )}
          </div>

          {flashMsg && (
            <div style={{ ...styles.flashMsg, color: flashMsg.ok ? '#00ff41' : '#ff4444', borderColor: flashMsg.ok ? '#00ff41' : '#ff4444' }}>
              {flashMsg.text}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Render: loading
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <span style={styles.title}>// ALLIANCE COMMAND</span>
          <div style={styles.headerRight}>
            {onClose && <button style={styles.closeBtn} onClick={onClose}>[X]</button>}
          </div>
        </div>
        <div style={styles.loadingMsg}>Connecting to Alliance Network...</div>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Render: alliance loaded
  // ---------------------------------------------------------------------------

  const TABS: { key: ActiveTab; label: string; visible: boolean }[] = [
    { key: 'members',      label: 'Members',      visible: true },
    { key: 'applications', label: `Applications${applications.length > 0 ? ` (${applications.length})` : ''}`, visible: canManageApplications },
    { key: 'broadcast',    label: 'Broadcast',    visible: canBroadcast },
    { key: 'settings',     label: 'Settings',     visible: canEditSettings },
  ]

  const visibleTabs = TABS.filter((t) => t.visible)

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.title}>
          // ALLIANCE — <span style={{ color: '#44aaff' }}>[{alliance?.tag ?? '???'}]</span>{' '}
          <span style={{ color: '#00ff41' }}>{alliance?.name ?? '...'}</span>
        </span>
        <div style={styles.headerRight}>
          {offline && <span style={styles.offlineBadge}>OFFLINE (mock)</span>}
          {onClose && <button style={styles.closeBtn} onClick={onClose}>[X]</button>}
        </div>
      </div>

      {/* Alliance info bar */}
      {alliance && (
        <div style={styles.infoBar}>
          <div style={styles.infoItem}>
            <span style={styles.infoLabel}>Members</span>
            <span style={styles.infoValue}>{alliance.memberCount}</span>
          </div>
          <div style={styles.infoItem}>
            <span style={styles.infoLabel}>Total Points</span>
            <span style={styles.infoValue}>{formatNumber(alliance.totalPoints ?? 0)}</span>
          </div>
          <div style={styles.infoItem}>
            <span style={styles.infoLabel}>Founded</span>
            <span style={styles.infoValue}>{formatDate(alliance.createdAt)}</span>
          </div>
          <div style={styles.infoItem}>
            <span style={styles.infoLabel}>My Rank</span>
            <span style={{ ...styles.infoValue, color: myRole ? roleColor(myRole) : '#555' }}>
              {myRole ? roleLabel(myRole) : 'NOT A MEMBER'}
            </span>
          </div>
        </div>
      )}

      {/* Description */}
      {alliance?.description && (
        <div style={styles.description}>
          <span style={styles.descPrompt}>&gt;</span>{' '}
          {alliance.description}
        </div>
      )}

      {/* Tabs */}
      <div style={styles.tabs}>
        {visibleTabs.map((tab) => (
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

        {/* Action buttons pushed to right */}
        <div style={{ flex: 1 }} />
        {myMembership && myRole !== 'founder' && (
          <button style={styles.btnDanger} onClick={handleLeave}>LEAVE</button>
        )}
        {!myMembership && (
          <button style={styles.btnPrimary} onClick={() => setShowJoin((v) => !v)}>
            {showJoin ? 'CANCEL' : 'APPLY TO JOIN'}
          </button>
        )}
        <button
          style={styles.btnSecondary}
          onClick={() => { setAllianceId(null); setAlliance(null); setMembers([]) }}
          title="Back to alliance search"
        >
          BACK
        </button>
      </div>

      {/* Join form */}
      {showJoin && !myMembership && (
        <div style={styles.joinForm}>
          <label style={styles.fieldLabel}>Application Message (optional)</label>
          <div style={styles.row}>
            <input
              style={{ ...styles.input, flex: 1 }}
              placeholder="Why do you want to join?"
              value={joinMessage}
              onChange={(e) => setJoinMessage(e.target.value)}
            />
            <button style={styles.btnPrimary} onClick={handleJoin}>SEND</button>
          </div>
        </div>
      )}

      {/* Flash message */}
      {flashMsg && (
        <div style={{ ...styles.flashMsg, color: flashMsg.ok ? '#00ff41' : '#ff4444', borderColor: flashMsg.ok ? '#00ff41' : '#ff4444' }}>
          {flashMsg.text}
        </div>
      )}

      {/* Tab content */}
      <div style={styles.tabContent}>
        {/* ---- MEMBERS TAB ---- */}
        {activeTab === 'members' && (
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Commander</th>
                  <th style={styles.th}>Rank</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>Points</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Joined</th>
                  {canManageApplications && <th style={styles.th}>Manage</th>}
                </tr>
              </thead>
              <tbody>
                {members.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ ...styles.td, textAlign: 'center', color: '#444' }}>
                      No members found
                    </td>
                  </tr>
                ) : (
                  members
                    .sort((a, b) => ROLE_RANK[b.role] - ROLE_RANK[a.role])
                    .map((member, idx) => (
                      <tr
                        key={member.playerId}
                        style={{
                          background: idx % 2 === 0 ? 'transparent' : 'rgba(0,255,65,0.02)',
                        }}
                      >
                        <td style={styles.td}>
                          <span style={{ color: '#00ff41' }}>
                            {member.playerName}
                            {member.playerId === playerId && (
                              <span style={{ color: '#44aaff', marginLeft: 6, fontSize: 10 }}>[YOU]</span>
                            )}
                          </span>
                        </td>
                        <td style={styles.td}>
                          <span style={{ color: roleColor(member.role), fontWeight: 'bold' }}>
                            {roleLabel(member.role)}
                          </span>
                        </td>
                        <td style={{ ...styles.td, textAlign: 'right' }}>
                          <span style={{ color: '#00ffff' }}>
                            {member.points !== undefined ? formatNumber(member.points) : '—'}
                          </span>
                        </td>
                        <td style={styles.td}>
                          {member.online ? (
                            <span style={{ color: '#00ff41' }}>● ONLINE</span>
                          ) : (
                            <span style={{ color: '#444' }}>○ offline</span>
                          )}
                        </td>
                        <td style={{ ...styles.td, color: '#555', fontSize: 11 }}>
                          {formatDate(member.joinedAt)}
                        </td>
                        {canManageApplications && (
                          <td style={styles.td}>
                            {member.playerId !== playerId && member.role !== 'founder' && (
                              <div style={{ display: 'flex', gap: 4 }}>
                                {canEditSettings && member.role !== 'officer' && (
                                  <button
                                    style={styles.actionBtn}
                                    onClick={() => handlePromote(member)}
                                    title="Promote to officer"
                                  >
                                    ▲
                                  </button>
                                )}
                                {canEditSettings && member.role === 'officer' && (
                                  <button
                                    style={styles.actionBtn}
                                    onClick={() => handlePromote(member)}
                                    title="Demote to member"
                                  >
                                    ▼
                                  </button>
                                )}
                                <button
                                  style={{ ...styles.actionBtn, color: '#ff4444', borderColor: '#ff4444' }}
                                  onClick={() => handleKick(member)}
                                  title="Kick"
                                >
                                  KICK
                                </button>
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ---- APPLICATIONS TAB ---- */}
        {activeTab === 'applications' && canManageApplications && (
          <div style={{ padding: 14 }}>
            {applications.length === 0 ? (
              <div style={{ color: '#444', textAlign: 'center', padding: 30 }}>
                No pending applications
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {applications.map((app) => (
                  <div key={app.id} style={styles.appCard}>
                    <div style={styles.appHeader}>
                      <span style={{ color: '#00ff41', fontWeight: 'bold' }}>{app.playerName}</span>
                      <span style={{ color: '#444', fontSize: 11 }}>{formatTimeAgo(app.createdAt)}</span>
                    </div>
                    {app.message && (
                      <div style={styles.appMessage}>
                        <span style={{ color: '#555' }}>&gt;</span>{' '}
                        <span style={{ color: '#aaa' }}>{app.message}</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button
                        style={styles.btnPrimary}
                        onClick={() => handleAccept(app)}
                      >
                        ACCEPT
                      </button>
                      <button
                        style={styles.btnDanger}
                        onClick={() => handleReject(app)}
                      >
                        REJECT
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ---- BROADCAST TAB ---- */}
        {activeTab === 'broadcast' && canBroadcast && (
          <div style={{ padding: 14 }}>
            <div style={styles.sectionLabel}>BROADCAST TO ALL MEMBERS</div>
            <label style={styles.fieldLabel}>Subject</label>
            <input
              style={{ ...styles.input, width: '100%', boxSizing: 'border-box' }}
              placeholder="Mission briefing subject..."
              value={bcastSubject}
              onChange={(e) => setBcastSubject(e.target.value)}
              maxLength={120}
            />
            <label style={{ ...styles.fieldLabel, marginTop: 10 }}>Message</label>
            <textarea
              style={{ ...styles.input, width: '100%', boxSizing: 'border-box', height: 120, resize: 'vertical' }}
              placeholder="Your message to all alliance members..."
              value={bcastBody}
              onChange={(e) => setBcastBody(e.target.value)}
              maxLength={2000}
            />
            <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
              <button
                style={styles.btnPrimary}
                onClick={handleBroadcast}
                disabled={bcastBusy}
              >
                {bcastBusy ? 'TRANSMITTING...' : 'BROADCAST'}
              </button>
              <button
                style={styles.btnSecondary}
                onClick={() => { setBcastSubject(''); setBcastBody('') }}
              >
                CLEAR
              </button>
            </div>
            <p style={{ color: '#444', fontSize: 11, marginTop: 8 }}>
              This message will be delivered to all {alliance?.memberCount ?? '?'} members via the in-game message system.
            </p>
          </div>
        )}

        {/* ---- SETTINGS TAB ---- */}
        {activeTab === 'settings' && canEditSettings && (
          <div style={{ padding: 14 }}>
            <div style={styles.sectionLabel}>ALLIANCE SETTINGS</div>

            <label style={styles.fieldLabel}>Alliance Name</label>
            <input
              style={{ ...styles.input, width: '100%', boxSizing: 'border-box' }}
              value={settingsName}
              onChange={(e) => setSettingsName(e.target.value)}
              maxLength={32}
            />

            <label style={{ ...styles.fieldLabel, marginTop: 10 }}>Alliance Tag (3–8 chars)</label>
            <input
              style={{ ...styles.input, width: '100%', boxSizing: 'border-box' }}
              value={settingsTag}
              onChange={(e) => setSettingsTag(e.target.value.toUpperCase())}
              maxLength={8}
            />

            <label style={{ ...styles.fieldLabel, marginTop: 10 }}>Description</label>
            <textarea
              style={{ ...styles.input, width: '100%', boxSizing: 'border-box', height: 100, resize: 'vertical' }}
              value={settingsDesc}
              onChange={(e) => setSettingsDesc(e.target.value)}
              maxLength={500}
            />

            <div style={{ marginTop: 12 }}>
              <button
                style={styles.btnPrimary}
                onClick={handleSaveSettings}
                disabled={settingsBusy}
              >
                {settingsBusy ? 'SAVING...' : 'SAVE CHANGES'}
              </button>
            </div>

            <div style={{ marginTop: 24, borderTop: '1px solid #ff444433', paddingTop: 14 }}>
              <div style={{ ...styles.sectionLabel, color: '#ff4444' }}>DANGER ZONE</div>
              <p style={{ color: '#ff4444', fontSize: 12, marginBottom: 8 }}>
                Dissolving the alliance is irreversible and removes all members.
              </p>
              <button
                style={{ ...styles.btnDanger, opacity: 0.7 }}
                onClick={() => flash('Dissolve not yet implemented — contact support', false)}
              >
                DISSOLVE ALLIANCE
              </button>
            </div>
          </div>
        )}
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
    boxShadow: '0 0 24px rgba(0,255,65,0.18)',
    width: 680,
    maxWidth: '98vw',
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
    fontSize: 14,
    letterSpacing: 2,
    color: '#00ff41',
    textShadow: '0 0 8px #00ff41',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
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

  // Info bar
  infoBar: {
    display: 'flex',
    gap: 0,
    borderBottom: '1px solid #00ff4133',
    flexShrink: 0,
  },
  infoItem: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    padding: '8px 14px',
    borderRight: '1px solid #00ff4122',
  },
  infoLabel: {
    fontSize: 10,
    color: '#006622',
    letterSpacing: 1,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#00ff41',
  },

  // Description
  description: {
    padding: '8px 14px',
    borderBottom: '1px solid #00ff4122',
    color: '#88aa88',
    fontSize: 12,
    fontStyle: 'italic',
    flexShrink: 0,
    lineHeight: 1.5,
  },
  descPrompt: {
    color: '#006622',
  },

  // Tabs
  tabs: {
    display: 'flex',
    alignItems: 'center',
    borderBottom: '1px solid #00ff4133',
    flexShrink: 0,
    flexWrap: 'wrap',
  },
  tab: {
    background: 'transparent',
    border: 'none',
    borderRight: '1px solid #00ff4122',
    color: '#006622',
    cursor: 'pointer',
    fontFamily: "'Courier New', monospace",
    fontSize: 12,
    padding: '7px 14px',
    letterSpacing: 1,
    transition: 'color 0.15s, background 0.15s',
    whiteSpace: 'nowrap',
  },
  tabActive: {
    color: '#00ff41',
    background: 'rgba(0,255,65,0.06)',
    borderBottom: '2px solid #00ff41',
  },

  // Tab content area
  tabContent: {
    overflowY: 'auto',
    flex: 1,
  },

  // Table
  tableWrapper: {
    overflowX: 'auto',
    flex: 1,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 12,
  },
  th: {
    padding: '7px 12px',
    textAlign: 'left' as const,
    borderBottom: '1px solid #00ff4133',
    color: '#006622',
    fontSize: 11,
    letterSpacing: 1,
    position: 'sticky' as const,
    top: 0,
    background: '#0a0a0a',
    userSelect: 'none' as const,
    whiteSpace: 'nowrap' as const,
  },
  td: {
    padding: '6px 12px',
    borderBottom: '1px solid #00ff4115',
    verticalAlign: 'middle' as const,
  },

  // Action button in table
  actionBtn: {
    background: 'transparent',
    border: '1px solid #006622',
    color: '#00ff41',
    cursor: 'pointer',
    fontFamily: "'Courier New', monospace",
    fontSize: 10,
    padding: '2px 6px',
    borderRadius: 2,
  },

  // Forms
  welcomeBody: {
    padding: '20px 24px',
    overflowY: 'auto',
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
  },
  asciiArt: {
    color: '#006622',
    fontSize: 10,
    lineHeight: 1.2,
    whiteSpace: 'pre',
    textAlign: 'center',
    textShadow: '0 0 6px #006622',
  },
  welcomeText: {
    textAlign: 'center',
    color: '#446644',
    fontSize: 12,
    margin: 0,
    lineHeight: 1.6,
  },
  welcomeSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  sectionLabel: {
    fontSize: 10,
    letterSpacing: 2,
    color: '#006622',
    marginBottom: 6,
  },
  row: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
  },
  createForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    border: '1px solid #00ff4133',
    borderRadius: 3,
    padding: 12,
  },
  fieldLabel: {
    fontSize: 10,
    color: '#006622',
    letterSpacing: 1,
  },
  input: {
    background: 'rgba(0,8,0,0.8)',
    border: '1px solid #006622',
    color: '#00ff41',
    fontFamily: "'Courier New', monospace",
    fontSize: 12,
    padding: '5px 8px',
    borderRadius: 2,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box' as const,
  },

  // Application cards
  appCard: {
    border: '1px solid #00ff4133',
    borderRadius: 3,
    padding: 12,
    background: 'rgba(0,255,65,0.02)',
  },
  appHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  appMessage: {
    fontSize: 12,
    lineHeight: 1.5,
    color: '#aaa',
  },

  // Join form
  joinForm: {
    padding: '10px 14px',
    borderBottom: '1px solid #00ff4122',
    flexShrink: 0,
  },

  // Flash message
  flashMsg: {
    margin: '6px 14px',
    padding: '6px 10px',
    border: '1px solid',
    borderRadius: 2,
    fontSize: 12,
    flexShrink: 0,
  },

  // Buttons
  btnPrimary: {
    background: 'rgba(0,255,65,0.12)',
    border: '1px solid #00ff41',
    color: '#00ff41',
    cursor: 'pointer',
    fontFamily: "'Courier New', monospace",
    fontSize: 12,
    padding: '5px 14px',
    borderRadius: 2,
    letterSpacing: 1,
    fontWeight: 'bold',
    whiteSpace: 'nowrap' as const,
  },
  btnSecondary: {
    background: 'transparent',
    border: '1px solid #555',
    color: '#888',
    cursor: 'pointer',
    fontFamily: "'Courier New', monospace",
    fontSize: 12,
    padding: '5px 14px',
    borderRadius: 2,
    letterSpacing: 1,
    whiteSpace: 'nowrap' as const,
  },
  btnDanger: {
    background: 'rgba(255,68,68,0.1)',
    border: '1px solid #ff4444',
    color: '#ff4444',
    cursor: 'pointer',
    fontFamily: "'Courier New', monospace",
    fontSize: 12,
    padding: '5px 14px',
    borderRadius: 2,
    letterSpacing: 1,
    whiteSpace: 'nowrap' as const,
  },

  // Loading
  loadingMsg: {
    color: '#006622',
    textAlign: 'center',
    padding: 40,
    fontSize: 13,
    flex: 1,
  },
}
