/**
 * SettingsPage.tsx
 *
 * Settings UI for Cosmic Protocol.
 *
 * Sections:
 * 1. Account — username display, change email form
 * 2. Notifications — toggles stored in localStorage
 * 3. Vacation Mode — calls POST /api/vacation/enable|disable
 * 4. Game Preferences — theme (dark/light), speed display, language stub
 *
 * Keyboard shortcut: S
 * Aesthetic: green retro-terminal matching HUD.tsx / AlliancePage.tsx
 */

import { useState, useEffect, useCallback } from 'react'
import { API_BASE_URL, DEFAULT_PLAYER_ID } from '../lib/config'

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

const LS_NOTIF_KEY = 'cp_notifications'
const LS_PREFS_KEY = 'cp_preferences'

interface NotificationSettings {
  attackAlerts: boolean
  fleetReturns: boolean
  buildComplete: boolean
  researchComplete: boolean
  espionageReports: boolean
  expeditionReturns: boolean
}

interface GamePreferences {
  theme: 'dark' | 'light'
  language: string
  showCoordinates: boolean
}

function loadNotifications(): NotificationSettings {
  try {
    const raw = localStorage.getItem(LS_NOTIF_KEY)
    if (raw) return JSON.parse(raw) as NotificationSettings
  } catch {
    // ignore
  }
  return {
    attackAlerts: true,
    fleetReturns: true,
    buildComplete: true,
    researchComplete: true,
    espionageReports: true,
    expeditionReturns: true,
  }
}

function saveNotifications(s: NotificationSettings) {
  localStorage.setItem(LS_NOTIF_KEY, JSON.stringify(s))
}

function loadPreferences(): GamePreferences {
  try {
    const raw = localStorage.getItem(LS_PREFS_KEY)
    if (raw) return JSON.parse(raw) as GamePreferences
  } catch {
    // ignore
  }
  return { theme: 'dark', language: 'en', showCoordinates: true }
}

function savePreferences(p: GamePreferences) {
  localStorage.setItem(LS_PREFS_KEY, JSON.stringify(p))
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Section = 'account' | 'notifications' | 'vacation' | 'preferences'

interface SettingsPageProps {
  onClose: () => void
}

// ---------------------------------------------------------------------------
// SettingsPage
// ---------------------------------------------------------------------------

export default function SettingsPage({ onClose }: SettingsPageProps) {
  const [activeSection, setActiveSection] = useState<Section>('account')

  // Account
  const [username] = useState(DEFAULT_PLAYER_ID)
  const [email, setEmail] = useState('')
  const [emailSaved, setEmailSaved] = useState(false)
  const [emailError, setEmailError] = useState('')

  // Notifications
  const [notif, setNotif] = useState<NotificationSettings>(loadNotifications)

  // Vacation mode
  const [vacationActive, setVacationActive] = useState(false)
  const [vacationLoading, setVacationLoading] = useState(false)
  const [vacationMsg, setVacationMsg] = useState('')

  // Preferences
  const [prefs, setPrefs] = useState<GamePreferences>(loadPreferences)
  const [prefsSaved, setPrefsSaved] = useState(false)

  // Fetch vacation status on mount
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/vacation/status?playerId=${encodeURIComponent(DEFAULT_PLAYER_ID)}`)
      .then((r) => r.json())
      .then((data: { active?: boolean }) => {
        if (typeof data.active === 'boolean') setVacationActive(data.active)
      })
      .catch(() => {
        // API may not exist yet — ignore
      })
  }, [])

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const handleEmailSave = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      setEmailError('')
      if (!email.includes('@')) {
        setEmailError('Enter a valid email address.')
        return
      }
      // No API endpoint yet — store locally as stub
      localStorage.setItem('cp_email', email)
      setEmailSaved(true)
      setTimeout(() => setEmailSaved(false), 3000)
    },
    [email],
  )

  const toggleNotif = useCallback((key: keyof NotificationSettings) => {
    setNotif((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      saveNotifications(next)
      return next
    })
  }, [])

  const toggleVacation = useCallback(async () => {
    setVacationLoading(true)
    setVacationMsg('')
    const action = vacationActive ? 'disable' : 'enable'
    try {
      const res = await fetch(`${API_BASE_URL}/api/vacation/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: DEFAULT_PLAYER_ID }),
      })
      if (res.ok) {
        setVacationActive(!vacationActive)
        setVacationMsg(action === 'enable' ? 'Vacation mode enabled.' : 'Vacation mode disabled.')
      } else {
        setVacationMsg(`Failed to ${action} vacation mode (server error).`)
      }
    } catch {
      setVacationMsg('Could not reach server.')
    } finally {
      setVacationLoading(false)
    }
  }, [vacationActive])

  const handlePrefsSave = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      savePreferences(prefs)
      setPrefsSaved(true)
      setTimeout(() => setPrefsSaved(false), 3000)
    },
    [prefs],
  )

  // -------------------------------------------------------------------------
  // Styles (inline, matching retro-terminal aesthetic)
  // -------------------------------------------------------------------------

  const panel: React.CSSProperties = {
    background: '#001a00',
    border: '1px solid #00ff00',
    borderRadius: 8,
    color: '#00ff00',
    fontFamily: '"Courier New", monospace',
    width: 680,
    maxWidth: '95vw',
    maxHeight: '85vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  }

  const header: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 18px',
    borderBottom: '1px solid #00ff00',
  }

  const tabs: React.CSSProperties = {
    display: 'flex',
    gap: 4,
    padding: '8px 18px 0',
    borderBottom: '1px solid #004400',
  }

  const tabBtn = (active: boolean): React.CSSProperties => ({
    background: active ? '#003300' : 'transparent',
    border: `1px solid ${active ? '#00ff00' : '#004400'}`,
    borderBottom: active ? '1px solid #001a00' : '1px solid #004400',
    color: active ? '#00ff00' : '#006600',
    fontFamily: '"Courier New", monospace',
    fontSize: 13,
    padding: '4px 14px',
    cursor: 'pointer',
    borderRadius: '4px 4px 0 0',
    marginBottom: -1,
  })

  const body: React.CSSProperties = {
    flex: 1,
    overflowY: 'auto',
    padding: '18px 22px',
  }

  const fieldRow: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 0',
    borderBottom: '1px solid #002200',
  }

  const label: React.CSSProperties = { color: '#00cc00', fontSize: 14 }
  const sublabel: React.CSSProperties = { color: '#006600', fontSize: 12, marginTop: 2 }

  const inputStyle: React.CSSProperties = {
    background: '#001000',
    border: '1px solid #00aa00',
    borderRadius: 4,
    color: '#00ff00',
    fontFamily: '"Courier New", monospace',
    fontSize: 13,
    padding: '4px 8px',
    width: 220,
  }

  const btn = (variant: 'primary' | 'danger' | 'muted' = 'primary'): React.CSSProperties => ({
    background: 'transparent',
    border: `1px solid ${variant === 'danger' ? '#ff4444' : variant === 'muted' ? '#006600' : '#00ff00'}`,
    borderRadius: 4,
    color: variant === 'danger' ? '#ff4444' : variant === 'muted' ? '#006600' : '#00ff00',
    fontFamily: '"Courier New", monospace',
    fontSize: 13,
    padding: '5px 16px',
    cursor: 'pointer',
  })

  const toggle = (on: boolean): React.CSSProperties => ({
    display: 'inline-block',
    width: 38,
    height: 20,
    background: on ? '#003300' : '#001000',
    border: `1px solid ${on ? '#00ff00' : '#004400'}`,
    borderRadius: 10,
    position: 'relative',
    cursor: 'pointer',
    flexShrink: 0,
  })

  const toggleKnob = (on: boolean): React.CSSProperties => ({
    position: 'absolute',
    top: 2,
    left: on ? 18 : 2,
    width: 14,
    height: 14,
    background: on ? '#00ff00' : '#004400',
    borderRadius: '50%',
    transition: 'left 0.15s',
  })

  const successMsg: React.CSSProperties = { color: '#00ff00', fontSize: 12, marginTop: 6 }
  const errorMsg: React.CSSProperties = { color: '#ff4444', fontSize: 12, marginTop: 6 }

  // -------------------------------------------------------------------------
  // Section renderers
  // -------------------------------------------------------------------------

  function renderAccount() {
    return (
      <div>
        <h3 style={{ color: '#00ff88', marginBottom: 16, fontSize: 15 }}>Account Settings</h3>

        <div style={fieldRow}>
          <div>
            <div style={label}>Username</div>
            <div style={sublabel}>Cannot be changed here</div>
          </div>
          <span style={{ color: '#00ff88', fontWeight: 'bold' }}>{username}</span>
        </div>

        <form onSubmit={handleEmailSave} style={{ marginTop: 16 }}>
          <div style={{ marginBottom: 8 }}>
            <label style={{ ...label, display: 'block', marginBottom: 6 }}>Change Email</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={inputStyle}
              />
              <button type="submit" style={btn()}>
                Save
              </button>
            </div>
            {emailError && <div style={errorMsg}>{emailError}</div>}
            {emailSaved && <div style={successMsg}>Email saved locally.</div>}
          </div>
        </form>

        <div style={{ ...fieldRow, marginTop: 20 }}>
          <div>
            <div style={label}>Player ID</div>
            <div style={sublabel}>Unique identifier</div>
          </div>
          <span style={{ color: '#006600', fontSize: 12 }}>{DEFAULT_PLAYER_ID}</span>
        </div>
      </div>
    )
  }

  function renderNotifications() {
    const rows: { key: keyof NotificationSettings; label: string; desc: string }[] = [
      { key: 'attackAlerts', label: 'Attack Alerts', desc: 'Notify when enemy fleet approaches' },
      { key: 'fleetReturns', label: 'Fleet Returns', desc: 'Notify when your fleet returns' },
      { key: 'buildComplete', label: 'Build Complete', desc: 'Notify when building finishes' },
      { key: 'researchComplete', label: 'Research Complete', desc: 'Notify when research finishes' },
      { key: 'espionageReports', label: 'Espionage Reports', desc: 'Notify on spy probe results' },
      { key: 'expeditionReturns', label: 'Expedition Returns', desc: 'Notify on expedition results' },
    ]

    return (
      <div>
        <h3 style={{ color: '#00ff88', marginBottom: 16, fontSize: 15 }}>Notification Settings</h3>
        <div style={{ color: '#006600', fontSize: 12, marginBottom: 14 }}>
          Settings are stored in browser localStorage.
        </div>
        {rows.map(({ key, label: lbl, desc }) => (
          <div key={key} style={fieldRow}>
            <div>
              <div style={label}>{lbl}</div>
              <div style={sublabel}>{desc}</div>
            </div>
            <div
              role="switch"
              aria-checked={notif[key]}
              style={toggle(notif[key])}
              onClick={() => toggleNotif(key)}
              title={notif[key] ? 'Click to disable' : 'Click to enable'}
            >
              <div style={toggleKnob(notif[key])} />
            </div>
          </div>
        ))}
      </div>
    )
  }

  function renderVacation() {
    return (
      <div>
        <h3 style={{ color: '#00ff88', marginBottom: 16, fontSize: 15 }}>Vacation Mode</h3>
        <p style={{ color: '#00cc00', fontSize: 13, lineHeight: 1.6, marginBottom: 18 }}>
          While vacation mode is active, your planets cannot be attacked and resource production is
          paused. You cannot send fleets or issue build orders during vacation.
        </p>

        <div
          style={{
            background: '#001000',
            border: `1px solid ${vacationActive ? '#00ff00' : '#004400'}`,
            borderRadius: 6,
            padding: 18,
            marginBottom: 18,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ ...label, fontSize: 16 }}>
              {vacationActive ? 'Vacation Mode ACTIVE' : 'Vacation Mode INACTIVE'}
            </div>
            <div style={{ ...sublabel, marginTop: 4 }}>
              {vacationActive
                ? 'Your empire is protected. Resources paused.'
                : 'Your empire is active and can be attacked.'}
            </div>
          </div>
          <button
            style={btn(vacationActive ? 'danger' : 'primary')}
            onClick={toggleVacation}
            disabled={vacationLoading}
          >
            {vacationLoading ? 'Please wait...' : vacationActive ? 'Disable' : 'Enable'}
          </button>
        </div>

        {vacationMsg && (
          <div style={vacationActive ? successMsg : errorMsg}>{vacationMsg}</div>
        )}

        <div style={{ color: '#004400', fontSize: 11, marginTop: 12 }}>
          API: POST /api/vacation/enable | /api/vacation/disable
        </div>
      </div>
    )
  }

  function renderPreferences() {
    return (
      <div>
        <h3 style={{ color: '#00ff88', marginBottom: 16, fontSize: 15 }}>Game Preferences</h3>

        <form onSubmit={handlePrefsSave}>
          <div style={fieldRow}>
            <div>
              <div style={label}>Theme</div>
              <div style={sublabel}>UI color scheme</div>
            </div>
            <select
              value={prefs.theme}
              onChange={(e) => setPrefs((p) => ({ ...p, theme: e.target.value as 'dark' | 'light' }))}
              style={{ ...inputStyle, width: 140 }}
            >
              <option value="dark">Dark (retro)</option>
              <option value="light">Light (coming soon)</option>
            </select>
          </div>

          <div style={fieldRow}>
            <div>
              <div style={label}>Language</div>
              <div style={sublabel}>Interface language</div>
            </div>
            <select
              value={prefs.language}
              onChange={(e) => setPrefs((p) => ({ ...p, language: e.target.value }))}
              style={{ ...inputStyle, width: 140 }}
            >
              <option value="en">English</option>
              <option value="pl">Polski (stub)</option>
              <option value="de">Deutsch (stub)</option>
              <option value="fr">Francais (stub)</option>
            </select>
          </div>

          <div style={fieldRow}>
            <div>
              <div style={label}>Show Coordinates</div>
              <div style={sublabel}>Display galaxy:system:position in UI</div>
            </div>
            <div
              role="switch"
              aria-checked={prefs.showCoordinates}
              style={toggle(prefs.showCoordinates)}
              onClick={() => setPrefs((p) => ({ ...p, showCoordinates: !p.showCoordinates }))}
            >
              <div style={toggleKnob(prefs.showCoordinates)} />
            </div>
          </div>

          <div style={{ marginTop: 20 }}>
            <button type="submit" style={btn()}>
              Save Preferences
            </button>
            {prefsSaved && <span style={{ ...successMsg, display: 'inline', marginLeft: 12 }}>Saved!</span>}
          </div>
        </form>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div style={panel}>
      {/* Header */}
      <div style={header}>
        <h2 style={{ margin: 0, fontSize: 18, letterSpacing: 2 }}>SETTINGS</h2>
        <button
          style={{ ...btn('muted'), fontSize: 16, lineHeight: 1, padding: '2px 10px' }}
          onClick={onClose}
          aria-label="Close settings"
        >
          x
        </button>
      </div>

      {/* Tabs */}
      <div style={tabs}>
        {(['account', 'notifications', 'vacation', 'preferences'] as Section[]).map((s) => (
          <button key={s} style={tabBtn(activeSection === s)} onClick={() => setActiveSection(s)}>
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {/* Body */}
      <div style={body}>
        {activeSection === 'account' && renderAccount()}
        {activeSection === 'notifications' && renderNotifications()}
        {activeSection === 'vacation' && renderVacation()}
        {activeSection === 'preferences' && renderPreferences()}
      </div>
    </div>
  )
}
