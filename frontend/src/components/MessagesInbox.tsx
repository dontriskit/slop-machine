/**
 * MessagesInbox.tsx
 *
 * Full in-game messaging interface:
 * - Message list with sender, subject, timestamp, read/unread indicator
 * - Click to expand message body
 * - Reply button (POST /api/messages/send)
 * - Delete button (DELETE /api/messages/:id)
 * - Filter tabs: All, Inbox, Sent, System, Combat Reports
 * - Mark as read/unread (GET /api/messages/:id marks as read automatically)
 * - Unread count badge
 * - Cockpit glass panel aesthetic
 */

import { useState, useEffect, useCallback } from 'react'
import { DEFAULT_PLAYER_ID } from '../lib/config'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MessageType = 'player' | 'system' | 'combat_report' | 'espionage_report' | 'alliance'

interface Message {
  id: string
  fromPlayerId: string
  fromPlayerName: string
  toPlayerId: string
  subject: string
  body: string
  type: MessageType
  read: boolean
  createdAt: number // unix seconds
}

interface PaginatedMessages {
  messages: Message[]
  total: number
  page: number
  limit: number
  totalPages: number
}

// ---------------------------------------------------------------------------
// Filter tabs definition
// ---------------------------------------------------------------------------

type FilterTab = 'all' | 'inbox' | 'sent' | 'system' | 'combat'

interface TabDef {
  id: FilterTab
  label: string
}

const TABS: TabDef[] = [
  { id: 'all',    label: 'All' },
  { id: 'inbox',  label: 'Inbox' },
  { id: 'sent',   label: 'Sent' },
  { id: 'system', label: 'System' },
  { id: 'combat', label: 'Combat Reports' },
]

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function apiFetchInbox(playerId: string, page = 1, limit = 20): Promise<PaginatedMessages | null> {
  try {
    const params = new URLSearchParams({ player_id: playerId, page: String(page), limit: String(limit) })
    const res = await fetch(`/api/messages/inbox?${params}`)
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

async function apiFetchOutbox(playerId: string, page = 1, limit = 20): Promise<PaginatedMessages | null> {
  try {
    const params = new URLSearchParams({ player_id: playerId, page: String(page), limit: String(limit) })
    const res = await fetch(`/api/messages/outbox?${params}`)
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

async function apiFetchUnreadCount(playerId: string): Promise<number> {
  try {
    const params = new URLSearchParams({ player_id: playerId })
    const res = await fetch(`/api/messages/unread-count?${params}`)
    if (!res.ok) return 0
    const data: { unreadCount: number } = await res.json()
    return data.unreadCount
  } catch {
    return 0
  }
}

async function apiFetchMessage(messageId: string, playerId: string): Promise<Message | null> {
  try {
    const params = new URLSearchParams({ player_id: playerId })
    const res = await fetch(`/api/messages/${encodeURIComponent(messageId)}?${params}`)
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

async function apiDeleteMessage(messageId: string, playerId: string): Promise<boolean> {
  try {
    const params = new URLSearchParams({ player_id: playerId })
    const res = await fetch(`/api/messages/${encodeURIComponent(messageId)}?${params}`, {
      method: 'DELETE',
    })
    return res.ok
  } catch {
    return false
  }
}

async function apiSendMessage(body: {
  fromPlayerId: string
  toPlayerId: string
  subject: string
  body: string
}): Promise<Message | null> {
  try {
    const res = await fetch('/api/messages/send', {
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

async function apiMarkAllRead(playerId: string): Promise<boolean> {
  try {
    const params = new URLSearchParams({ player_id: playerId })
    const res = await fetch(`/api/messages/mark-all-read?${params}`, { method: 'POST' })
    return res.ok
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Mock data for offline mode
// ---------------------------------------------------------------------------

const MSG_TYPES: MessageType[] = ['player', 'system', 'combat_report', 'espionage_report', 'alliance']

function mockMessages(playerId: string, mode: 'inbox' | 'outbox'): PaginatedMessages {
  const messages: Message[] = Array.from({ length: 10 }, (_, i) => {
    const type = MSG_TYPES[i % MSG_TYPES.length]
    const isInbox = mode === 'inbox'
    return {
      id: `mock-msg-${i}`,
      fromPlayerId: isInbox ? `player-${i + 2}` : playerId,
      fromPlayerName: isInbox ? `Commander${String(i + 2).padStart(3, '0')}` : 'You',
      toPlayerId: isInbox ? playerId : `player-${i + 2}`,
      subject: getMockSubject(type, i),
      body: getMockBody(type, i),
      type,
      read: i > 2,
      createdAt: Math.floor(Date.now() / 1000) - i * 600,
    }
  })
  return { messages, total: 10, page: 1, limit: 20, totalPages: 1 }
}

function getMockSubject(type: MessageType, i: number): string {
  switch (type) {
    case 'combat_report':  return `Combat Report: Attack on [${i + 1}:${i + 2}:${i + 3}]`
    case 'system':         return `System: Resource production updated`
    case 'espionage_report': return `Espionage Report: Planet [${i}:${i + 1}:${i + 2}]`
    case 'alliance':       return `Alliance: New member joined`
    default:               return `Greetings from sector ${i + 1}`
  }
}

function getMockBody(type: MessageType, i: number): string {
  switch (type) {
    case 'combat_report':
      return `BATTLE RESULT\n\nAttacker: Commander${String(i + 1).padStart(3, '0')}\nDefender: Commander${String(i + 2).padStart(3, '0')}\n\nAttacker wins!\nMetal looted: ${(i + 1) * 12000}\nCrystal looted: ${(i + 1) * 8000}\nDeuterium looted: ${(i + 1) * 3000}`
    case 'system':
      return `Your production rates have been updated.\n\nMetal: +${(i + 1) * 500}/h\nCrystal: +${(i + 1) * 300}/h\nDeuterium: +${(i + 1) * 100}/h`
    case 'espionage_report':
      return `ESPIONAGE REPORT\n\nTarget: [${i}:${i + 1}:${i + 2}]\nResources found:\n  Metal: ${(i + 1) * 50000}\n  Crystal: ${(i + 1) * 30000}\n  Deuterium: ${(i + 1) * 10000}\n\nDefenses: None detected.`
    case 'alliance':
      return `Commander${String(i + 3).padStart(3, '0')} has joined the alliance.\n\nWelcome the new member and show them the ropes!`
    default:
      return `Hello Commander,\n\nI noticed your activity in sector ${i + 1} and wanted to reach out. Would you be interested in a trade agreement or mutual defense pact?\n\nBest regards,\nCommander${String(i + 2).padStart(3, '0')}`
  }
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatTime(unixSec: number): string {
  const d = Math.floor(Date.now() / 1000) - unixSec
  if (d < 60)    return `${d}s ago`
  if (d < 3600)  return `${Math.floor(d / 60)}m ago`
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`
  const date = new Date(unixSec * 1000)
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const TYPE_COLORS: Record<MessageType, string> = {
  player:           '#93c5fd',
  system:           '#5b9cf6',
  combat_report:    '#f87171',
  espionage_report: '#f59e0b',
  alliance:         '#a78bfa',
}

const TYPE_LABELS: Record<MessageType, string> = {
  player:           'MSG',
  system:           'SYS',
  combat_report:    'COMBAT',
  espionage_report: 'SPY',
  alliance:         'ALLY',
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface MessagesInboxProps {
  currentPlayerId?: string
  onClose?: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function MessagesInbox({
  currentPlayerId = DEFAULT_PLAYER_ID,
  onClose,
}: MessagesInboxProps) {
  const [activeTab, setActiveTab]         = useState<FilterTab>('inbox')
  const [messages, setMessages]           = useState<Message[]>([])
  const [loading, setLoading]             = useState(false)
  const [offline, setOffline]             = useState(false)
  const [unreadCount, setUnreadCount]     = useState(0)
  const [selectedMsg, setSelectedMsg]     = useState<Message | null>(null)
  const [statusMsg, setStatusMsg]         = useState<string | null>(null)
  const [busyId, setBusyId]              = useState<string | null>(null)

  // Reply compose state
  const [showReply, setShowReply]         = useState(false)
  const [replyTo, setReplyTo]             = useState<string>('')
  const [replyToId, setReplyToId]         = useState<string>('')
  const [replySubject, setReplySubject]   = useState<string>('')
  const [replyBody, setReplyBody]         = useState<string>('')
  const [replySending, setReplySending]   = useState(false)

  // Compose new message state
  const [showCompose, setShowCompose]     = useState(false)
  const [composeTo, setComposeTo]         = useState<string>('')
  const [composeSubject, setComposeSubject] = useState<string>('')
  const [composeBody, setComposeBody]     = useState<string>('')
  const [composeSending, setComposeSending] = useState(false)

  // ---- Load messages ----

  const loadMessages = useCallback(async () => {
    setLoading(true)
    setSelectedMsg(null)

    let result: PaginatedMessages | null = null
    let isOffline = false

    if (activeTab === 'sent') {
      result = await apiFetchOutbox(currentPlayerId)
      if (!result) {
        result = mockMessages(currentPlayerId, 'outbox')
        isOffline = true
      }
    } else {
      result = await apiFetchInbox(currentPlayerId)
      if (!result) {
        result = mockMessages(currentPlayerId, 'inbox')
        isOffline = true
      }
    }

    setOffline(isOffline)

    // Apply client-side filtering for type-based tabs
    let msgs = result.messages
    if (activeTab === 'system') {
      msgs = msgs.filter((m) => m.type === 'system')
    } else if (activeTab === 'combat') {
      msgs = msgs.filter((m) => m.type === 'combat_report')
    }

    setMessages(msgs)
    setLoading(false)
  }, [activeTab, currentPlayerId])

  // ---- Load unread count ----

  const loadUnreadCount = useCallback(async () => {
    const count = await apiFetchUnreadCount(currentPlayerId)
    setUnreadCount(count)
  }, [currentPlayerId])

  useEffect(() => {
    loadMessages()
  }, [loadMessages])

  useEffect(() => {
    loadUnreadCount()
  }, [loadUnreadCount])

  // ---- Utility ----

  function showStatus(msg: string, timeout = 3500) {
    setStatusMsg(msg)
    setTimeout(() => setStatusMsg(null), timeout)
  }

  // ---- Open / read message ----

  async function handleSelectMessage(msg: Message) {
    if (selectedMsg?.id === msg.id) {
      setSelectedMsg(null)
      return
    }

    // Fetch full message (marks as read server-side)
    const full = await apiFetchMessage(msg.id, currentPlayerId)
    const toShow = full ?? msg

    // Optimistically mark as read in list
    setMessages((prev) =>
      prev.map((m) => (m.id === msg.id ? { ...m, read: true } : m))
    )
    if (!msg.read) {
      setUnreadCount((c) => Math.max(0, c - 1))
    }

    setSelectedMsg({ ...toShow, read: true })
    setShowReply(false)
    setShowCompose(false)
  }

  // ---- Delete ----

  async function handleDelete(msgId: string) {
    setBusyId(msgId)
    const ok = await apiDeleteMessage(msgId, currentPlayerId)
    setBusyId(null)

    if (ok || offline) {
      setMessages((prev) => prev.filter((m) => m.id !== msgId))
      if (selectedMsg?.id === msgId) setSelectedMsg(null)
      showStatus('Message deleted.')
    } else {
      showStatus('Failed to delete message.')
    }
  }

  // ---- Reply ----

  function handleOpenReply(msg: Message) {
    setReplyTo(msg.fromPlayerName)
    setReplyToId(msg.fromPlayerId)
    setReplySubject(`Re: ${msg.subject}`)
    setReplyBody('')
    setShowReply(true)
    setShowCompose(false)
  }

  async function handleSendReply(e: React.FormEvent) {
    e.preventDefault()
    if (!replyBody.trim()) {
      showStatus('Reply body cannot be empty.')
      return
    }
    setReplySending(true)
    const result = await apiSendMessage({
      fromPlayerId: currentPlayerId,
      toPlayerId: replyToId,
      subject: replySubject,
      body: replyBody,
    })
    setReplySending(false)

    if (result || offline) {
      showStatus('Reply sent.')
      setShowReply(false)
      setReplyBody('')
    } else {
      showStatus('Failed to send reply.')
    }
  }

  // ---- Compose new ----

  async function handleSendCompose(e: React.FormEvent) {
    e.preventDefault()
    if (!composeTo.trim() || !composeSubject.trim() || !composeBody.trim()) {
      showStatus('All fields are required.')
      return
    }
    setComposeSending(true)
    const result = await apiSendMessage({
      fromPlayerId: currentPlayerId,
      toPlayerId: composeTo,
      subject: composeSubject,
      body: composeBody,
    })
    setComposeSending(false)

    if (result || offline) {
      showStatus('Message sent.')
      setShowCompose(false)
      setComposeTo('')
      setComposeSubject('')
      setComposeBody('')
    } else {
      showStatus('Failed to send message.')
    }
  }

  // ---- Mark all read ----

  async function handleMarkAllRead() {
    const ok = await apiMarkAllRead(currentPlayerId)
    if (ok || offline) {
      setMessages((prev) => prev.map((m) => ({ ...m, read: true })))
      setUnreadCount(0)
      showStatus('All messages marked as read.')
    } else {
      showStatus('Failed to mark all as read.')
    }
  }

  // ---- Render ----

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={styles.title}>Messages</span>
          {unreadCount > 0 && (
            <span style={styles.unreadBadge}>{unreadCount} unread</span>
          )}
          {offline && <span style={styles.offlineBadge}>OFFLINE (mock)</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            style={styles.composeBtn}
            onClick={() => { setShowCompose(true); setShowReply(false); setSelectedMsg(null) }}
          >
            + Compose
          </button>
          {unreadCount > 0 && (
            <button style={styles.markReadBtn} onClick={handleMarkAllRead} title="Mark all as read">
              Mark All Read
            </button>
          )}
          <button style={styles.refreshBtn} onClick={loadMessages} title="Refresh">
            ↺
          </button>
          {onClose && (
            <button style={styles.closeBtn} onClick={onClose}>✕</button>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div style={styles.tabs}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            style={{
              ...styles.tab,
              ...(activeTab === tab.id ? styles.tabActive : {}),
            }}
            onClick={() => {
              setActiveTab(tab.id)
              setSelectedMsg(null)
              setShowReply(false)
              setShowCompose(false)
            }}
          >
            {tab.label}
            {tab.id === 'inbox' && unreadCount > 0 && (
              <span style={styles.tabBadge}>{unreadCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* Status message */}
      {statusMsg && <div style={styles.statusMsg}>{statusMsg}</div>}

      {/* Body — two-column when message selected */}
      <div style={styles.body}>
        {/* Message list */}
        <div style={{ ...styles.msgList, ...(selectedMsg || showCompose ? styles.msgListNarrow : {}) }}>
          {loading ? (
            <div style={styles.centerMsg}>Loading messages...</div>
          ) : messages.length === 0 ? (
            <div style={styles.centerMsg}>No messages in this folder.</div>
          ) : (
            messages.map((msg) => {
              const isSelected = selectedMsg?.id === msg.id
              const isBusy = busyId === msg.id
              return (
                <div
                  key={msg.id}
                  style={{
                    ...styles.msgRow,
                    ...(isSelected ? styles.msgRowSelected : {}),
                    ...(msg.read ? styles.msgRowRead : styles.msgRowUnread),
                  }}
                  onClick={() => handleSelectMessage(msg)}
                >
                  {/* Type badge */}
                  <span
                    style={{
                      ...styles.typeBadge,
                      color: TYPE_COLORS[msg.type],
                      borderColor: TYPE_COLORS[msg.type] + '55',
                    }}
                  >
                    {TYPE_LABELS[msg.type]}
                  </span>

                  {/* Unread dot */}
                  {!msg.read && <span style={styles.unreadDot} title="Unread" />}

                  {/* Content */}
                  <div style={styles.msgContent}>
                    <div style={styles.msgMeta}>
                      <span style={styles.msgSender}>
                        {activeTab === 'sent' ? `To: ${msg.toPlayerId}` : msg.fromPlayerName}
                      </span>
                      <span style={styles.msgTime}>{formatTime(msg.createdAt)}</span>
                    </div>
                    <div style={styles.msgSubject}>{msg.subject}</div>
                  </div>

                  {/* Delete button */}
                  <button
                    style={styles.deleteBtn}
                    onClick={(e) => { e.stopPropagation(); handleDelete(msg.id) }}
                    disabled={isBusy}
                    title="Delete"
                  >
                    {isBusy ? '...' : '✕'}
                  </button>
                </div>
              )
            })
          )}
        </div>

        {/* Message detail pane */}
        {selectedMsg && !showCompose && (
          <div style={styles.detailPane}>
            <div style={styles.detailHeader}>
              <div style={styles.detailSubject}>{selectedMsg.subject}</div>
              <div style={styles.detailMeta}>
                <span style={{ color: '#64748b' }}>
                  From: <span style={{ color: '#e2e8f0' }}>{selectedMsg.fromPlayerName}</span>
                </span>
                <span style={{ color: '#334155', marginLeft: 12 }}>
                  {formatTime(selectedMsg.createdAt)}
                </span>
                <span
                  style={{
                    ...styles.typeBadge,
                    color: TYPE_COLORS[selectedMsg.type],
                    borderColor: TYPE_COLORS[selectedMsg.type] + '55',
                    marginLeft: 10,
                  }}
                >
                  {TYPE_LABELS[selectedMsg.type]}
                </span>
              </div>
            </div>

            <div style={styles.detailBody}>
              {selectedMsg.body.split('\n').map((line, i) => (
                <span key={i}>
                  {line}
                  <br />
                </span>
              ))}
            </div>

            {/* Actions */}
            {!showReply && (
              <div style={styles.detailActions}>
                {selectedMsg.fromPlayerId !== currentPlayerId && selectedMsg.type !== 'system' && (
                  <button
                    style={styles.replyBtn}
                    onClick={() => handleOpenReply(selectedMsg)}
                  >
                    Reply
                  </button>
                )}
                <button
                  style={styles.deleteBtnLarge}
                  onClick={() => handleDelete(selectedMsg.id)}
                  disabled={busyId === selectedMsg.id}
                >
                  {busyId === selectedMsg.id ? 'Deleting...' : 'Delete'}
                </button>
                <button style={styles.closeDetailBtn} onClick={() => setSelectedMsg(null)}>
                  Close
                </button>
              </div>
            )}

            {/* Inline reply form */}
            {showReply && (
              <form style={styles.replyForm} onSubmit={handleSendReply}>
                <div style={styles.replyHeader}>
                  Reply to: <span style={{ color: '#e2e8f0' }}>{replyTo}</span>
                </div>
                <input
                  style={styles.replyInput}
                  type="text"
                  value={replySubject}
                  onChange={(e) => setReplySubject(e.target.value)}
                  placeholder="Subject"
                />
                <textarea
                  style={styles.replyTextarea}
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  placeholder="Type your reply here..."
                  rows={5}
                />
                <div style={styles.replyActions}>
                  <button type="submit" style={styles.sendBtn} disabled={replySending}>
                    {replySending ? 'Sending...' : 'Send Reply'}
                  </button>
                  <button
                    type="button"
                    style={styles.cancelReplyBtn}
                    onClick={() => setShowReply(false)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* Compose new message pane */}
        {showCompose && (
          <div style={styles.detailPane}>
            <form style={styles.replyForm} onSubmit={handleSendCompose}>
              <div style={styles.replyHeader}>New Message</div>
              <div style={styles.composeFieldRow}>
                <label style={styles.composeLabel}>To:</label>
                <input
                  style={styles.replyInput}
                  type="text"
                  value={composeTo}
                  onChange={(e) => setComposeTo(e.target.value)}
                  placeholder="Player ID (e.g. player-2)"
                />
              </div>
              <div style={styles.composeFieldRow}>
                <label style={styles.composeLabel}>Subject:</label>
                <input
                  style={styles.replyInput}
                  type="text"
                  value={composeSubject}
                  onChange={(e) => setComposeSubject(e.target.value)}
                  placeholder="Subject"
                />
              </div>
              <textarea
                style={{ ...styles.replyTextarea, marginTop: 8 }}
                value={composeBody}
                onChange={(e) => setComposeBody(e.target.value)}
                placeholder="Message body..."
                rows={6}
              />
              <div style={styles.replyActions}>
                <button type="submit" style={styles.sendBtn} disabled={composeSending}>
                  {composeSending ? 'Sending...' : 'Send Message'}
                </button>
                <button
                  type="button"
                  style={styles.cancelReplyBtn}
                  onClick={() => setShowCompose(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Styles — cockpit glass panel
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
    width: 820,
    maxHeight: '88vh',
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
    fontSize: 15,
    color: '#5b9cf6',
  },
  unreadBadge: {
    fontSize: 10,
    color: '#f87171',
    border: '1px solid rgba(248,113,113,0.4)',
    borderRadius: 4,
    padding: '1px 6px',
  },
  offlineBadge: {
    fontSize: 10,
    color: '#f59e0b',
    border: '1px solid rgba(245,158,11,0.4)',
    borderRadius: 4,
    padding: '1px 6px',
  },
  composeBtn: {
    background: 'rgba(91,156,246,0.12)',
    border: '1px solid rgba(91,156,246,0.3)',
    color: '#93c5fd',
    cursor: 'pointer',
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: 11,
    padding: '3px 10px',
    borderRadius: 6,
  },
  markReadBtn: {
    background: 'transparent',
    border: '1px solid rgba(100,116,139,0.3)',
    color: '#64748b',
    cursor: 'pointer',
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: 11,
    padding: '3px 8px',
    borderRadius: 6,
  },
  refreshBtn: {
    background: 'transparent',
    border: '1px solid rgba(100,116,139,0.2)',
    color: '#64748b',
    cursor: 'pointer',
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: 16,
    padding: '2px 8px',
    borderRadius: 6,
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: '#64748b',
    cursor: 'pointer',
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: 18,
    padding: '2px 6px',
    borderRadius: 4,
    transition: 'color 0.15s',
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
    borderRight: '1px solid rgba(91,156,246,0.1)',
    color: '#64748b',
    cursor: 'pointer',
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: 11,
    padding: '8px 4px',
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    transition: 'color 0.15s',
  },
  tabActive: {
    color: '#5b9cf6',
    background: 'rgba(91,156,246,0.08)',
    borderBottom: '2px solid #5b9cf6',
  },
  tabBadge: {
    background: '#f87171',
    color: '#fff',
    borderRadius: 8,
    fontSize: 9,
    padding: '0 5px',
    lineHeight: '14px',
    fontWeight: 'bold',
  },
  statusMsg: {
    background: 'rgba(91,156,246,0.06)',
    borderBottom: '1px solid rgba(91,156,246,0.15)',
    color: '#93c5fd',
    fontSize: 12,
    padding: '5px 14px',
    flexShrink: 0,
  },
  body: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  msgList: {
    width: '100%',
    overflowY: 'auto',
    borderRight: '1px solid rgba(91,156,246,0.1)',
    flex: 1,
    minWidth: 260,
  },
  msgListNarrow: {
    flex: '0 0 280px',
    width: 280,
  },
  centerMsg: {
    color: '#334155',
    textAlign: 'center',
    padding: 30,
    fontSize: 12,
  },
  msgRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '9px 12px',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
    cursor: 'pointer',
    transition: 'background 0.1s',
  },
  msgRowRead: {
    opacity: 0.6,
  },
  msgRowUnread: {
    opacity: 1,
  },
  msgRowSelected: {
    background: 'rgba(91,156,246,0.08)',
    borderLeft: '3px solid #5b9cf6',
    paddingLeft: 9,
    opacity: 1,
  },
  typeBadge: {
    fontSize: 9,
    border: '1px solid',
    borderRadius: 3,
    padding: '1px 4px',
    letterSpacing: 0.5,
    flexShrink: 0,
    fontWeight: 600,
  },
  unreadDot: {
    display: 'inline-block',
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: '#5b9cf6',
    flexShrink: 0,
  },
  msgContent: {
    flex: 1,
    minWidth: 0,
  },
  msgMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  msgSender: {
    color: '#e2e8f0',
    fontSize: 11,
    fontWeight: 600,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: 110,
  },
  msgTime: {
    color: '#334155',
    fontSize: 10,
    flexShrink: 0,
  },
  msgSubject: {
    color: '#94a3b8',
    fontSize: 11,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  deleteBtn: {
    background: 'transparent',
    border: 'none',
    color: '#64748b',
    cursor: 'pointer',
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: 12,
    padding: '2px 5px',
    borderRadius: 3,
    flexShrink: 0,
    opacity: 0.5,
    transition: 'opacity 0.15s, color 0.15s',
  },

  // Detail pane
  detailPane: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    padding: 0,
  },
  detailHeader: {
    padding: '12px 16px',
    borderBottom: '1px solid rgba(91,156,246,0.15)',
    flexShrink: 0,
  },
  detailSubject: {
    fontSize: 14,
    fontWeight: 600,
    color: '#5b9cf6',
    marginBottom: 6,
  },
  detailMeta: {
    fontSize: 11,
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap' as const,
    gap: 4,
    color: '#94a3b8',
  },
  detailBody: {
    flex: 1,
    overflowY: 'auto',
    padding: '14px 16px',
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 1.7,
    whiteSpace: 'pre-wrap' as const,
  },
  detailActions: {
    display: 'flex',
    gap: 8,
    padding: '10px 16px',
    borderTop: '1px solid rgba(91,156,246,0.12)',
    flexShrink: 0,
  },
  replyBtn: {
    background: 'rgba(91,156,246,0.12)',
    border: '1px solid rgba(91,156,246,0.3)',
    color: '#93c5fd',
    cursor: 'pointer',
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: 12,
    padding: '5px 18px',
    borderRadius: 6,
  },
  deleteBtnLarge: {
    background: 'transparent',
    border: '1px solid rgba(248,113,113,0.3)',
    color: '#f87171',
    cursor: 'pointer',
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: 12,
    padding: '5px 14px',
    borderRadius: 6,
  },
  closeDetailBtn: {
    background: 'transparent',
    border: '1px solid rgba(100,116,139,0.3)',
    color: '#64748b',
    cursor: 'pointer',
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: 12,
    padding: '5px 12px',
    borderRadius: 6,
    marginLeft: 'auto',
  },

  // Reply / Compose form
  replyForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: '12px 16px',
    flex: 1,
    overflowY: 'auto',
  },
  replyHeader: {
    color: '#5b9cf6',
    fontSize: 12,
    fontWeight: 600,
    borderBottom: '1px solid rgba(91,156,246,0.12)',
    paddingBottom: 8,
    marginBottom: 4,
  },
  composeFieldRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  composeLabel: {
    color: '#64748b',
    fontSize: 11,
    minWidth: 56,
    flexShrink: 0,
  },
  replyInput: {
    flex: 1,
    background: 'rgba(8,14,28,0.8)',
    border: '1px solid rgba(91,156,246,0.2)',
    color: '#e2e8f0',
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: 12,
    padding: '5px 10px',
    borderRadius: 6,
    outline: 'none',
  },
  replyTextarea: {
    flex: 1,
    background: 'rgba(8,14,28,0.8)',
    border: '1px solid rgba(91,156,246,0.2)',
    color: '#e2e8f0',
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: 12,
    padding: '8px 10px',
    borderRadius: 6,
    outline: 'none',
    resize: 'vertical' as const,
    minHeight: 80,
  },
  replyActions: {
    display: 'flex',
    gap: 8,
    marginTop: 4,
  },
  sendBtn: {
    flex: 1,
    background: 'rgba(91,156,246,0.12)',
    border: '1px solid rgba(91,156,246,0.3)',
    color: '#93c5fd',
    cursor: 'pointer',
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: 12,
    fontWeight: 600,
    padding: '7px 0',
    borderRadius: 6,
  },
  cancelReplyBtn: {
    background: 'transparent',
    border: '1px solid rgba(100,116,139,0.3)',
    color: '#64748b',
    cursor: 'pointer',
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: 11,
    padding: '7px 14px',
    borderRadius: 6,
  },
}
