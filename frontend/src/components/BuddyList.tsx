/**
 * BuddyList.tsx
 *
 * Buddy List & Spy Tracker panel.
 * - Shows marked players with color-coded relation badges (ally=green, enemy=red)
 * - Quick-spy button (sends espionage probe)
 * - Quick-message button
 * - Add/edit note per player
 * - Add new relation by player name search
 */

import { useState, useEffect, useCallback } from 'react'
import { GameStore } from '../store/gameStore'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RelationType = 'ally' | 'enemy' | 'neutral'

interface Relation {
  id: string
  target_id: string
  target_name: string
  relation_type: RelationType
  note: string | null
  created_at: number
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

const API_BASE = ''

async function fetchRelations(playerId: string): Promise<Relation[]> {
  try {
    const res = await fetch(`${API_BASE}/api/relations?player_id=${encodeURIComponent(playerId)}`)
    if (!res.ok) return []
    const data = await res.json() as { relations: Relation[] }
    return data.relations ?? []
  } catch {
    return []
  }
}

async function upsertRelation(
  playerId: string,
  targetId: string,
  relationType: RelationType,
  note?: string
): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/relations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player_id: playerId, target_id: targetId, relation_type: relationType, note }),
    })
    return res.ok
  } catch {
    return false
  }
}

async function deleteRelation(playerId: string, targetId: string): Promise<boolean> {
  try {
    const res = await fetch(
      `${API_BASE}/api/relations/${encodeURIComponent(targetId)}?player_id=${encodeURIComponent(playerId)}`,
      { method: 'DELETE' }
    )
    return res.ok
  } catch {
    return false
  }
}

async function sendEspionageProbe(playerId: string, targetId: string): Promise<string> {
  try {
    const res = await fetch(`${API_BASE}/api/espionage/probe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player_id: playerId, target_player_id: targetId, probes: 5 }),
    })
    if (!res.ok) return 'Probe failed'
    return 'Probe sent!'
  } catch {
    return 'Probe failed (network error)'
  }
}

// ---------------------------------------------------------------------------
// Relation badge colours
// ---------------------------------------------------------------------------

const BADGE_STYLE: Record<RelationType, React.CSSProperties> = {
  ally:    { background: '#0a3a0a', border: '1px solid #00cc44', color: '#00ff66' },
  enemy:   { background: '#3a0a0a', border: '1px solid #cc2200', color: '#ff4422' },
  neutral: { background: '#1a1a2e', border: '1px solid #444466', color: '#8888bb' },
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface BuddyListProps {
  onClose: () => void
  onOpenMessages?: (playerId: string) => void
}

export default function BuddyList({ onClose, onOpenMessages }: BuddyListProps) {
  const playerId = GameStore((s) => s.selectedPlanet) ?? 'player_1'

  const [relations, setRelations]       = useState<Relation[]>([])
  const [loading, setLoading]           = useState(true)
  const [statusMsg, setStatusMsg]       = useState<string>('')
  const [editingNote, setEditingNote]   = useState<string | null>(null) // target_id being edited
  const [noteText, setNoteText]         = useState('')
  const [addTargetId, setAddTargetId]   = useState('')
  const [addRelType, setAddRelType]     = useState<RelationType>('ally')

  const load = useCallback(async () => {
    setLoading(true)
    const data = await fetchRelations(playerId)
    setRelations(data)
    setLoading(false)
  }, [playerId])

  useEffect(() => { load() }, [load])

  const flash = (msg: string) => {
    setStatusMsg(msg)
    setTimeout(() => setStatusMsg(''), 3000)
  }

  const handleSpy = async (targetId: string, targetName: string) => {
    flash(`Sending probe to ${targetName}...`)
    const result = await sendEspionageProbe(playerId, targetId)
    flash(result)
  }

  const handleDelete = async (targetId: string) => {
    await deleteRelation(playerId, targetId)
    await load()
    flash('Removed from buddy list')
  }

  const handleRelationChange = async (targetId: string, newType: RelationType, note?: string | null) => {
    await upsertRelation(playerId, targetId, newType, note ?? undefined)
    await load()
  }

  const handleSaveNote = async (rel: Relation) => {
    await upsertRelation(playerId, rel.target_id, rel.relation_type, noteText)
    setEditingNote(null)
    await load()
    flash('Note saved')
  }

  const handleAdd = async () => {
    if (!addTargetId.trim()) return
    const ok = await upsertRelation(playerId, addTargetId.trim(), addRelType)
    if (ok) {
      setAddTargetId('')
      await load()
      flash('Player added to buddy list')
    } else {
      flash('Failed to add player — check the player ID')
    }
  }

  const allies  = relations.filter(r => r.relation_type === 'ally')
  const enemies = relations.filter(r => r.relation_type === 'enemy')
  const neutral = relations.filter(r => r.relation_type === 'neutral')

  return (
    <div style={{
      background: '#0b1120',
      border: '1px solid #00ff88',
      borderRadius: 8,
      padding: 24,
      minWidth: 480,
      maxWidth: 640,
      maxHeight: '80vh',
      overflowY: 'auto',
      fontFamily: 'monospace',
      color: '#cce8cc',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0, color: '#00ff88', fontSize: 18 }}>Buddy List &amp; Spy Tracker</h2>
        <button onClick={onClose} style={btnStyle('#333', '#aaa')}>Close</button>
      </div>

      {statusMsg && (
        <div style={{ background: '#162', border: '1px solid #0a4', padding: '6px 12px', borderRadius: 4, marginBottom: 12, color: '#0f6' }}>
          {statusMsg}
        </div>
      )}

      {/* Add player */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <input
          value={addTargetId}
          onChange={e => setAddTargetId(e.target.value)}
          placeholder="Player ID to add..."
          style={inputStyle}
          onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
        />
        <select
          value={addRelType}
          onChange={e => setAddRelType(e.target.value as RelationType)}
          style={{ ...inputStyle, flex: '0 0 auto' }}
        >
          <option value="ally">Ally</option>
          <option value="enemy">Enemy</option>
          <option value="neutral">Neutral</option>
        </select>
        <button onClick={handleAdd} style={btnStyle('#004422', '#00ff88')}>Add</button>
      </div>

      {loading && <p style={{ color: '#888' }}>Loading...</p>}

      {!loading && relations.length === 0 && (
        <p style={{ color: '#666', textAlign: 'center', padding: 20 }}>
          No players marked yet. Add a player above.
        </p>
      )}

      {[
        { label: 'Allies', list: allies, type: 'ally' as RelationType },
        { label: 'Enemies', list: enemies, type: 'enemy' as RelationType },
        { label: 'Neutral', list: neutral, type: 'neutral' as RelationType },
      ].map(({ label, list }) =>
        list.length > 0 && (
          <div key={label} style={{ marginBottom: 16 }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 13, color: '#99aacc', textTransform: 'uppercase', letterSpacing: 1 }}>
              {label} ({list.length})
            </h3>
            {list.map(rel => (
              <RelationRow
                key={rel.target_id}
                rel={rel}
                editingNote={editingNote}
                noteText={noteText}
                onSpy={() => handleSpy(rel.target_id, rel.target_name)}
                onMessage={() => onOpenMessages?.(rel.target_id)}
                onDelete={() => handleDelete(rel.target_id)}
                onRelationChange={(newType) => handleRelationChange(rel.target_id, newType, rel.note)}
                onEditNote={() => { setEditingNote(rel.target_id); setNoteText(rel.note ?? '') }}
                onNoteChange={setNoteText}
                onSaveNote={() => handleSaveNote(rel)}
                onCancelNote={() => setEditingNote(null)}
              />
            ))}
          </div>
        )
      )}

      <p style={{ marginTop: 16, fontSize: 11, color: '#446', textAlign: 'right' }}>
        Keyboard shortcut: B
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// RelationRow sub-component
// ---------------------------------------------------------------------------

interface RelationRowProps {
  rel: Relation
  editingNote: string | null
  noteText: string
  onSpy: () => void
  onMessage: () => void
  onDelete: () => void
  onRelationChange: (t: RelationType) => void
  onEditNote: () => void
  onNoteChange: (v: string) => void
  onSaveNote: () => void
  onCancelNote: () => void
}

function RelationRow({
  rel,
  editingNote,
  noteText,
  onSpy,
  onMessage,
  onDelete,
  onRelationChange,
  onEditNote,
  onNoteChange,
  onSaveNote,
  onCancelNote,
}: RelationRowProps) {
  const badge = BADGE_STYLE[rel.relation_type]
  return (
    <div style={{
      background: '#0d1826',
      border: '1px solid #1a2a3a',
      borderRadius: 5,
      padding: '8px 12px',
      marginBottom: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {/* Badge */}
        <span style={{ ...badge, borderRadius: 3, padding: '2px 7px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>
          {rel.relation_type}
        </span>

        {/* Name */}
        <span style={{ flex: 1, color: '#e0f0e0', fontSize: 14 }}>
          {rel.target_name}
          <span style={{ color: '#556', fontSize: 11, marginLeft: 6 }}>#{rel.target_id.slice(0, 8)}</span>
        </span>

        {/* Relation selector */}
        <select
          value={rel.relation_type}
          onChange={e => onRelationChange(e.target.value as RelationType)}
          style={{ ...inputStyle, flex: '0 0 auto', fontSize: 11, padding: '2px 4px' }}
          aria-label="Change relation type"
        >
          <option value="ally">Ally</option>
          <option value="enemy">Enemy</option>
          <option value="neutral">Neutral</option>
        </select>

        {/* Actions */}
        <button onClick={onSpy} style={btnStyle('#001133', '#4499ff')} title="Send espionage probe">
          Spy
        </button>
        <button onClick={onMessage} style={btnStyle('#110022', '#cc88ff')} title="Send message">
          Msg
        </button>
        <button onClick={onEditNote} style={btnStyle('#111', '#888')} title="Edit note">
          Note
        </button>
        <button onClick={onDelete} style={btnStyle('#330000', '#ff4422')} title="Remove">
          Remove
        </button>
      </div>

      {/* Note display */}
      {rel.note && editingNote !== rel.target_id && (
        <div style={{ fontSize: 12, color: '#778', marginTop: 5, paddingLeft: 4, fontStyle: 'italic' }}>
          {rel.note}
        </div>
      )}

      {/* Note editor */}
      {editingNote === rel.target_id && (
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <input
            value={noteText}
            onChange={e => onNoteChange(e.target.value)}
            placeholder="Add a note..."
            style={{ ...inputStyle, flex: 1 }}
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter') onSaveNote(); if (e.key === 'Escape') onCancelNote() }}
          />
          <button onClick={onSaveNote} style={btnStyle('#003300', '#00cc66')}>Save</button>
          <button onClick={onCancelNote} style={btnStyle('#333', '#aaa')}>Cancel</button>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------

const inputStyle: React.CSSProperties = {
  background: '#111827',
  border: '1px solid #334',
  borderRadius: 4,
  color: '#cce',
  padding: '5px 10px',
  fontSize: 13,
  fontFamily: 'monospace',
  flex: 1,
  minWidth: 120,
}

function btnStyle(bg: string, color: string): React.CSSProperties {
  return {
    background: bg,
    border: `1px solid ${color}`,
    borderRadius: 4,
    color,
    padding: '4px 10px',
    fontSize: 12,
    cursor: 'pointer',
    fontFamily: 'monospace',
  }
}
