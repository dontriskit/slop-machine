import { useState, useEffect, useRef, useCallback } from 'react'
import { API_BASE_URL } from '../lib/config'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatMessage {
  id: string
  channel: string
  playerId: string
  playerName: string
  message: string
  timestamp: number
  isDeleted: boolean
}

interface ChatPanelProps {
  onClose: () => void
  playerId: string
  allianceId?: string
  allianceName?: string
  onOpenProfile?: (playerId: string) => void
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function fetchMessages(channel: string, limit = 50): Promise<ChatMessage[]> {
  const res = await fetch(`${API_BASE_URL}/api/chat/${encodeURIComponent(channel)}?limit=${limit}`)
  if (!res.ok) return []
  const data = await res.json<{ messages: ChatMessage[] }>()
  return data.messages ?? []
}

async function postMessage(channel: string, playerId: string, message: string): Promise<ChatMessage | null> {
  const res = await fetch(`${API_BASE_URL}/api/chat/${encodeURIComponent(channel)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ player_id: playerId, message }),
  })
  if (!res.ok) {
    const err = await res.json<{ error: string }>()
    throw new Error(err.error ?? 'Failed to send message')
  }
  return res.json<ChatMessage>()
}

async function deleteMessage(channel: string, messageId: string, playerId: string): Promise<void> {
  const res = await fetch(
    `${API_BASE_URL}/api/chat/${encodeURIComponent(channel)}/${encodeURIComponent(messageId)}?player_id=${encodeURIComponent(playerId)}`,
    { method: 'DELETE' },
  )
  if (!res.ok) {
    const err = await res.json<{ error: string }>()
    throw new Error(err.error ?? 'Failed to delete message')
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type TabKey = 'global' | 'alliance'

const MAX_CHARS = 500
const POLL_INTERVAL_MS = 5000

export default function ChatPanel({ onClose, playerId, allianceId, allianceName, onOpenProfile }: ChatPanelProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('global')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sendError, setSendError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [unreadAlliance, setUnreadAlliance] = useState(0)

  const bottomRef = useRef<HTMLDivElement>(null)
  const lastSeenRef = useRef<Record<TabKey, number>>({ global: 0, alliance: 0 })

  const currentChannel = activeTab === 'global' ? 'global' : (allianceId ?? 'global')

  // Load messages for current channel
  const loadMessages = useCallback(async () => {
    const msgs = await fetchMessages(currentChannel)
    setMessages(msgs)

    // Track unread badge for the non-active tab
    if (activeTab === 'global' && allianceId) {
      const allianceMsgs = await fetchMessages(allianceId, 1)
      if (allianceMsgs.length > 0) {
        const latest = allianceMsgs[allianceMsgs.length - 1].timestamp
        if (latest > lastSeenRef.current.alliance) {
          setUnreadAlliance((n) => n + 1)
        }
      }
    }

    if (activeTab === 'alliance') {
      setUnreadAlliance(0)
      if (msgs.length > 0) {
        lastSeenRef.current.alliance = msgs[msgs.length - 1].timestamp
      }
    }
  }, [currentChannel, activeTab, allianceId])

  // Initial load + polling
  useEffect(() => {
    setMessages([])
    setUnreadAlliance(0)
    loadMessages()

    const interval = setInterval(loadMessages, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [loadMessages])

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = useCallback(async () => {
    const trimmed = input.trim()
    if (!trimmed || loading) return

    setLoading(true)
    setSendError(null)

    try {
      const msg = await postMessage(currentChannel, playerId, trimmed)
      if (msg) {
        setMessages((prev) => [...prev, msg])
        setInput('')
      }
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed to send')
    } finally {
      setLoading(false)
    }
  }, [input, loading, currentChannel, playerId])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  const handleDelete = useCallback(
    async (messageId: string) => {
      try {
        await deleteMessage(currentChannel, messageId, playerId)
        setMessages((prev) => prev.filter((m) => m.id !== messageId))
      } catch {
        // ignore
      }
    },
    [currentChannel, playerId],
  )

  function formatTime(ts: number): string {
    const d = new Date(ts * 1000)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div
      style={{
        width: 480,
        maxWidth: '95vw',
        height: 520,
        display: 'flex',
        flexDirection: 'column',
        background: 'rgba(8,14,28,0.95)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(91,156,246,0.2)',
        borderRadius: 10,
        overflow: 'hidden',
        fontFamily: "'Inter', system-ui, sans-serif",
        color: '#e2e8f0',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          background: 'rgba(15,23,42,0.6)',
          borderBottom: '1px solid rgba(91,156,246,0.15)',
        }}
      >
        <span style={{ fontWeight: 600, color: '#5b9cf6', fontSize: 14 }}>Communications</span>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}
        >
          ×
        </button>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid rgba(91,156,246,0.15)', background: 'rgba(15,23,42,0.4)' }}>
        <TabButton
          label="Global"
          active={activeTab === 'global'}
          badge={0}
          onClick={() => setActiveTab('global')}
        />
        {allianceId && (
          <TabButton
            label={allianceName ?? 'Alliance'}
            active={activeTab === 'alliance'}
            badge={activeTab === 'global' ? unreadAlliance : 0}
            onClick={() => {
              setActiveTab('alliance')
              setUnreadAlliance(0)
            }}
          />
        )}
      </div>

      {/* Message list */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        {messages.length === 0 && (
          <div style={{ color: '#64748b', textAlign: 'center', marginTop: 40, fontSize: 13 }}>
            No messages yet. Say something!
          </div>
        )}
        {messages.map((msg) => (
          <MessageRow
            key={msg.id}
            msg={msg}
            isOwn={msg.playerId === playerId}
            onDelete={handleDelete}
            onOpenProfile={onOpenProfile}
            formatTime={formatTime}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div style={{ padding: '8px 12px', borderTop: '1px solid rgba(91,156,246,0.15)', background: 'rgba(15,23,42,0.6)' }}>
        {sendError && (
          <div style={{ color: '#f87171', fontSize: 12, marginBottom: 4 }}>{sendError}</div>
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value.slice(0, MAX_CHARS))}
              onKeyDown={handleKeyDown}
              placeholder="Press Enter to send…"
              rows={2}
              style={{
                width: '100%',
                resize: 'none',
                background: 'rgba(8,14,28,0.8)',
                border: '1px solid rgba(91,156,246,0.25)',
                borderRadius: 6,
                color: '#e2e8f0',
                padding: '6px 8px',
                fontSize: 13,
                fontFamily: "'Inter', system-ui, sans-serif",
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
            <span
              style={{
                position: 'absolute',
                bottom: 4,
                right: 8,
                fontSize: 11,
                color: input.length >= MAX_CHARS ? '#f87171' : '#64748b',
              }}
            >
              {input.length}/{MAX_CHARS}
            </span>
          </div>
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            style={{
              background: loading || !input.trim() ? 'rgba(30,41,59,0.5)' : 'rgba(91,156,246,0.2)',
              border: '1px solid rgba(91,156,246,0.4)',
              borderRadius: 6,
              color: loading || !input.trim() ? '#334155' : '#5b9cf6',
              padding: '6px 14px',
              cursor: loading || !input.trim() ? 'default' : 'pointer',
              fontSize: 13,
              fontFamily: "'Inter', system-ui, sans-serif",
              fontWeight: 500,
              height: 56,
            }}
          >
            {loading ? '…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TabButton({
  label,
  active,
  badge,
  onClick,
}: {
  label: string
  active: boolean
  badge: number
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'none',
        border: 'none',
        borderBottom: active ? '2px solid #5b9cf6' : '2px solid transparent',
        color: active ? '#5b9cf6' : '#64748b',
        padding: '8px 16px',
        cursor: 'pointer',
        fontSize: 13,
        fontFamily: "'Inter', system-ui, sans-serif",
        fontWeight: active ? 600 : 400,
        position: 'relative',
      }}
    >
      {label}
      {badge > 0 && (
        <span
          style={{
            marginLeft: 6,
            background: '#f87171',
            color: '#fff',
            borderRadius: 10,
            padding: '1px 6px',
            fontSize: 10,
            fontWeight: 700,
          }}
        >
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  )
}

function MessageRow({
  msg,
  isOwn,
  onDelete,
  onOpenProfile,
  formatTime,
}: {
  msg: ChatMessage
  isOwn: boolean
  onDelete: (id: string) => void
  onOpenProfile?: (playerId: string) => void
  formatTime: (ts: number) => string
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        padding: '3px 0',
        borderRadius: 4,
        background: hovered ? 'rgba(91,156,246,0.06)' : 'transparent',
      borderRadius: 4,
      }}
    >
      <span style={{ color: '#64748b', fontSize: 11, minWidth: 42, marginTop: 1 }}>
        {formatTime(msg.timestamp)}
      </span>
      <span style={{ flex: 1, wordBreak: 'break-word' }}>
        <button
          onClick={() => onOpenProfile?.(msg.playerId)}
          style={{
            background: 'none',
            border: 'none',
            color: isOwn ? '#34d399' : '#5b9cf6',
            fontWeight: 700,
            cursor: onOpenProfile ? 'pointer' : 'default',
            padding: 0,
            fontFamily: "'Inter', system-ui, sans-serif",
            fontSize: 13,
          }}
        >
          {msg.playerName}
        </button>
        <span style={{ color: '#334155', margin: '0 4px' }}>:</span>
        <span style={{ color: '#e2e8f0', fontSize: 13 }}>{msg.message}</span>
      </span>
      {isOwn && hovered && (
        <button
          onClick={() => onDelete(msg.id)}
          title="Delete message"
          style={{
            background: 'none',
            border: 'none',
            color: '#f87171',
            cursor: 'pointer',
            fontSize: 12,
            padding: '0 4px',
          }}
        >
          ✕
        </button>
      )}
    </div>
  )
}
