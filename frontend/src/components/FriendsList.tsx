/**
 * FriendsList.tsx
 *
 * Friend System panel:
 * - Friends list with green (online) / grey (offline) status dots
 * - Pending requests section with Accept / Decline buttons
 * - Quick-message button per friend (opens compose via messages API)
 * - Add friend by player name form
 */

import { useState, useEffect, useCallback } from 'react'
import { GameStore } from '../store/gameStore'
import { API_BASE_URL, getPlayerId } from '../lib/config'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Friend {
  id: string
  friendId: string
  friendName: string
  status: 'pending' | 'accepted' | 'blocked'
  direction: 'sent' | 'received'
  online: boolean
  createdAt: number
}

interface FriendsListProps {
  onClose: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function FriendsList({ onClose }: FriendsListProps) {
  const playerId = getPlayerId()
  const [friends, setFriends] = useState<Friend[]>([])
  const [loading, setLoading] = useState(false)
  const [addName, setAddName] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [addSuccess, setAddSuccess] = useState<string | null>(null)
  const [msgCompose, setMsgCompose] = useState<{ friendId: string; friendName: string } | null>(null)
  const [msgBody, setMsgBody] = useState('')
  const [msgSending, setMsgSending] = useState(false)
  const [msgError, setMsgError] = useState<string | null>(null)

  const fetchFriends = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/friends?player_id=${encodeURIComponent(playerId)}`)
      if (res.ok) {
        const data = await res.json() as { friends: Friend[] }
        setFriends(data.friends)
      }
    } finally {
      setLoading(false)
    }
  }, [playerId])

  useEffect(() => {
    fetchFriends()
  }, [fetchFriends])

  const handleAddFriend = useCallback(async () => {
    setAddError(null)
    setAddSuccess(null)
    const name = addName.trim()
    if (!name) return

    // Look up player by name
    try {
      const searchRes = await fetch(`${API_BASE_URL}/api/players?name=${encodeURIComponent(name)}`)
      if (!searchRes.ok) {
        setAddError('Player not found')
        return
      }
      const data = await searchRes.json() as { players?: Array<{ id: string; name: string }> }
      const target = data.players?.[0]
      if (!target) {
        setAddError('Player not found')
        return
      }
      const res = await fetch(`${API_BASE_URL}/api/friends/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_id: playerId, friend_id: target.id }),
      })
      if (!res.ok) {
        const err = await res.json() as { error?: string }
        setAddError(err.error ?? 'Failed to send request')
        return
      }
      setAddSuccess(`Friend request sent to ${target.name}`)
      setAddName('')
      fetchFriends()
    } catch {
      setAddError('Network error')
    }
  }, [addName, playerId, fetchFriends])

  const handleAccept = useCallback(async (friend: Friend) => {
    await fetch(`${API_BASE_URL}/api/friends/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player_id: playerId, friend_id: friend.friendId }),
    })
    fetchFriends()
  }, [playerId, fetchFriends])

  const handleRemove = useCallback(async (friendId: string) => {
    await fetch(`${API_BASE_URL}/api/friends/${encodeURIComponent(friendId)}?player_id=${encodeURIComponent(playerId)}`, {
      method: 'DELETE',
    })
    fetchFriends()
  }, [playerId, fetchFriends])

  const handleSendMessage = useCallback(async () => {
    if (!msgCompose || !msgBody.trim()) return
    setMsgSending(true)
    setMsgError(null)
    try {
      const res = await fetch(`${API_BASE_URL}/api/messages/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_player_id: playerId,
          to_player_id: msgCompose.friendId,
          subject: 'Message',
          body: msgBody.trim(),
        }),
      })
      if (!res.ok) {
        const err = await res.json() as { error?: string }
        setMsgError(err.error ?? 'Failed to send message')
        return
      }
      setMsgCompose(null)
      setMsgBody('')
    } catch {
      setMsgError('Network error')
    } finally {
      setMsgSending(false)
    }
  }, [msgCompose, msgBody, playerId])

  const accepted = friends.filter((f) => f.status === 'accepted')
  const pendingReceived = friends.filter((f) => f.status === 'pending' && f.direction === 'received')
  const pendingSent = friends.filter((f) => f.status === 'pending' && f.direction === 'sent')

  return (
    <div style={{
      background: '#0a1628',
      border: '1px solid #1a3a5c',
      borderRadius: 8,
      padding: 20,
      minWidth: 360,
      maxWidth: 480,
      color: '#a0c4ff',
      fontFamily: 'monospace',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0, color: '#4fc3f7', fontSize: 18 }}>Friends (N)</h2>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#4fc3f7', cursor: 'pointer', fontSize: 18 }}>x</button>
      </div>

      {/* Add Friend */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddFriend()}
            placeholder="Player name..."
            style={{
              flex: 1, background: '#0d1f3c', border: '1px solid #1a3a5c',
              color: '#a0c4ff', padding: '4px 8px', borderRadius: 4, fontFamily: 'monospace',
            }}
          />
          <button
            onClick={handleAddFriend}
            style={{
              background: '#1a3a5c', border: '1px solid #4fc3f7', color: '#4fc3f7',
              padding: '4px 12px', borderRadius: 4, cursor: 'pointer', fontFamily: 'monospace',
            }}
          >
            Add
          </button>
        </div>
        {addError && <div style={{ color: '#ff6b6b', fontSize: 11, marginTop: 4 }}>{addError}</div>}
        {addSuccess && <div style={{ color: '#69db7c', fontSize: 11, marginTop: 4 }}>{addSuccess}</div>}
      </div>

      {loading && <div style={{ color: '#4fc3f7', fontSize: 12 }}>Loading...</div>}

      {/* Pending Requests Received */}
      {pendingReceived.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <h3 style={{ color: '#ffd43b', margin: '0 0 8px', fontSize: 13 }}>
            Pending Requests ({pendingReceived.length})
          </h3>
          {pendingReceived.map((f) => (
            <div key={f.id} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 8px', background: '#0d1f3c', borderRadius: 4, marginBottom: 4,
            }}>
              <span style={{ flex: 1, fontSize: 13 }}>{f.friendName}</span>
              <button
                onClick={() => handleAccept(f)}
                style={{
                  background: '#1a4a2a', border: '1px solid #69db7c', color: '#69db7c',
                  padding: '2px 8px', borderRadius: 3, cursor: 'pointer', fontSize: 11,
                }}
              >
                Accept
              </button>
              <button
                onClick={() => handleRemove(f.friendId)}
                style={{
                  background: '#3a1a1a', border: '1px solid #ff6b6b', color: '#ff6b6b',
                  padding: '2px 8px', borderRadius: 3, cursor: 'pointer', fontSize: 11,
                }}
              >
                Decline
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Friends List */}
      <div style={{ marginBottom: 14 }}>
        <h3 style={{ color: '#4fc3f7', margin: '0 0 8px', fontSize: 13 }}>
          Friends ({accepted.length})
        </h3>
        {accepted.length === 0 && (
          <div style={{ color: '#4a6a8a', fontSize: 12 }}>No friends yet. Add one above!</div>
        )}
        {accepted.map((f) => (
          <div key={f.id} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 8px', background: '#0d1f3c', borderRadius: 4, marginBottom: 4,
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: f.online ? '#69db7c' : '#555',
              flexShrink: 0,
            }} title={f.online ? 'Online' : 'Offline'} />
            <span style={{ flex: 1, fontSize: 13 }}>{f.friendName}</span>
            <span style={{ fontSize: 10, color: f.online ? '#69db7c' : '#555' }}>
              {f.online ? 'online' : 'offline'}
            </span>
            <button
              onClick={() => { setMsgCompose({ friendId: f.friendId, friendName: f.friendName }); setMsgBody(''); setMsgError(null) }}
              title="Quick Message"
              style={{
                background: '#1a2a4a', border: '1px solid #4fc3f7', color: '#4fc3f7',
                padding: '2px 8px', borderRadius: 3, cursor: 'pointer', fontSize: 11,
              }}
            >
              Msg
            </button>
            <button
              onClick={() => handleRemove(f.friendId)}
              title="Remove Friend"
              style={{
                background: 'none', border: '1px solid #3a4a5a', color: '#4a6a8a',
                padding: '2px 6px', borderRadius: 3, cursor: 'pointer', fontSize: 11,
              }}
            >
              x
            </button>
          </div>
        ))}
      </div>

      {/* Pending Sent */}
      {pendingSent.length > 0 && (
        <div>
          <h3 style={{ color: '#868e96', margin: '0 0 8px', fontSize: 13 }}>
            Sent Requests ({pendingSent.length})
          </h3>
          {pendingSent.map((f) => (
            <div key={f.id} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 8px', background: '#0d1f3c', borderRadius: 4, marginBottom: 4,
            }}>
              <span style={{ flex: 1, fontSize: 13, color: '#868e96' }}>{f.friendName}</span>
              <span style={{ fontSize: 10, color: '#555' }}>pending</span>
              <button
                onClick={() => handleRemove(f.friendId)}
                style={{
                  background: 'none', border: '1px solid #3a4a5a', color: '#4a6a8a',
                  padding: '2px 6px', borderRadius: 3, cursor: 'pointer', fontSize: 11,
                }}
              >
                Cancel
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Quick Message Compose */}
      {msgCompose && (
        <div style={{
          marginTop: 16, padding: 12, background: '#0d1f3c',
          border: '1px solid #1a3a5c', borderRadius: 6,
        }}>
          <div style={{ fontSize: 12, marginBottom: 6, color: '#4fc3f7' }}>
            Message to {msgCompose.friendName}
          </div>
          <textarea
            value={msgBody}
            onChange={(e) => setMsgBody(e.target.value)}
            rows={3}
            placeholder="Type your message..."
            style={{
              width: '100%', background: '#0a1628', border: '1px solid #1a3a5c',
              color: '#a0c4ff', padding: '6px 8px', borderRadius: 4,
              fontFamily: 'monospace', fontSize: 12, resize: 'vertical', boxSizing: 'border-box',
            }}
          />
          {msgError && <div style={{ color: '#ff6b6b', fontSize: 11, marginTop: 4 }}>{msgError}</div>}
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <button
              onClick={handleSendMessage}
              disabled={msgSending || !msgBody.trim()}
              style={{
                background: '#1a3a5c', border: '1px solid #4fc3f7', color: '#4fc3f7',
                padding: '4px 14px', borderRadius: 4, cursor: 'pointer', fontFamily: 'monospace', fontSize: 12,
              }}
            >
              {msgSending ? 'Sending...' : 'Send'}
            </button>
            <button
              onClick={() => setMsgCompose(null)}
              style={{
                background: 'none', border: '1px solid #3a4a5a', color: '#4a6a8a',
                padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontFamily: 'monospace', fontSize: 12,
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
