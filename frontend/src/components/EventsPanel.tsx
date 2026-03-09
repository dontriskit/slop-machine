/**
 * EventsPanel — Weekly Events & Active Modifiers
 *
 * Shows active game events with their modifiers and upcoming scheduled events.
 * Key: E
 */

import { useState, useEffect } from 'react'

interface GameEvent {
  id: string
  name: string
  description: string
  type: string
  modifierType: string
  modifierValue: number
  startTime: number
  endTime: number
}

interface EventsPanelProps {
  onClose: () => void
}

const EVENT_TYPE_ICONS: Record<string, string> = {
  double_production: '⚡',
  double_xp: '🔬',
  reduced_build_time: '🔨',
  combat_weekend: '⚔️',
  harvest_bonus: '♻️',
  fleet_speed: '🚀',
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  double_production: 'Double Production',
  double_xp: 'Double XP',
  reduced_build_time: 'Build Blitz',
  combat_weekend: 'Combat Weekend',
  harvest_bonus: 'Harvest Bonus',
  fleet_speed: 'Fleet Speed',
}

function formatTimeLeft(endTimeSec: number): string {
  const nowSec = Math.floor(Date.now() / 1000)
  const diff = endTimeSec - nowSec
  if (diff <= 0) return 'Ended'
  const h = Math.floor(diff / 3600)
  const m = Math.floor((diff % 3600) / 60)
  if (h > 24) return `${Math.floor(h / 24)}d ${h % 24}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function formatStartsIn(startTimeSec: number): string {
  const nowSec = Math.floor(Date.now() / 1000)
  const diff = startTimeSec - nowSec
  if (diff <= 0) return 'Starting...'
  const h = Math.floor(diff / 3600)
  const m = Math.floor((diff % 3600) / 60)
  if (h > 24) return `${Math.floor(h / 24)}d ${h % 24}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function formatModifier(modifierType: string, modifierValue: number): string {
  switch (modifierType) {
    case 'production_multiplier': return `${modifierValue}x Production`
    case 'xp_multiplier': return `${modifierValue}x Research Speed`
    case 'build_time_multiplier': return `${Math.round((1 - modifierValue) * 100)}% Faster Builds`
    case 'attack_multiplier': return `+${Math.round((modifierValue - 1) * 100)}% Attack Power`
    case 'debris_multiplier': return `${modifierValue}x Debris Collection`
    case 'fleet_speed_multiplier': return `+${Math.round((modifierValue - 1) * 100)}% Fleet Speed`
    default: return `${modifierValue}x modifier`
  }
}

export default function EventsPanel({ onClose }: EventsPanelProps) {
  const [activeEvents, setActiveEvents] = useState<GameEvent[]>([])
  const [upcomingEvents, setUpcomingEvents] = useState<GameEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchEvents = async () => {
      setLoading(true)
      setError(null)
      try {
        const [activeRes, upcomingRes] = await Promise.all([
          fetch('/api/events/active'),
          fetch('/api/events/upcoming?limit=5'),
        ])
        if (!activeRes.ok || !upcomingRes.ok) throw new Error('Failed to fetch events')
        const activeData = await activeRes.json() as { events: GameEvent[] }
        const upcomingData = await upcomingRes.json() as { events: GameEvent[] }
        setActiveEvents(activeData.events || [])
        setUpcomingEvents(upcomingData.events || [])
      } catch (err) {
        setError(String(err))
      } finally {
        setLoading(false)
      }
    }
    fetchEvents()
  }, [])

  const panelStyle: React.CSSProperties = {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    background: '#0a0a0f',
    border: '1px solid #1e3a5f',
    borderRadius: 12,
    padding: 24,
    width: 520,
    maxWidth: '95vw',
    maxHeight: '80vh',
    overflowY: 'auto',
    color: '#e2e8f0',
    fontFamily: 'monospace',
    zIndex: 1000,
    boxShadow: '0 0 40px rgba(0, 100, 255, 0.2)',
  }

  return (
    <div style={panelStyle}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ margin: 0, color: '#60a5fa', fontSize: 18, letterSpacing: 2, textTransform: 'uppercase' }}>
          ⚡ Universe Events
        </h2>
        <button
          onClick={onClose}
          style={{
            background: 'none', border: '1px solid #374151', borderRadius: 6,
            color: '#9ca3af', padding: '4px 10px', cursor: 'pointer', fontSize: 14,
          }}
        >
          ESC
        </button>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', color: '#6b7280', padding: 40 }}>
          Loading events...
        </div>
      )}

      {error && (
        <div style={{ color: '#f87171', background: '#1f1b1b', borderRadius: 6, padding: 12, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {!loading && !error && (
        <>
          {/* Active Events */}
          <section style={{ marginBottom: 24 }}>
            <h3 style={{ color: '#34d399', fontSize: 13, letterSpacing: 2, textTransform: 'uppercase', margin: '0 0 12px' }}>
              Active Now
            </h3>
            {activeEvents.length === 0 ? (
              <div style={{
                background: '#111827', borderRadius: 8, padding: 16,
                color: '#6b7280', textAlign: 'center', fontSize: 13,
              }}>
                No active events — check back soon!
              </div>
            ) : (
              activeEvents.map(evt => (
                <div key={evt.id} style={{
                  background: 'linear-gradient(135deg, #0f2027, #162032)',
                  border: '1px solid #1e40af',
                  borderLeft: '3px solid #34d399',
                  borderRadius: 8,
                  padding: '12px 16px',
                  marginBottom: 10,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 20 }}>{EVENT_TYPE_ICONS[evt.type] || '🌟'}</span>
                      <div>
                        <div style={{ fontWeight: 'bold', color: '#f0f9ff', fontSize: 15 }}>{evt.name}</div>
                        <div style={{ color: '#93c5fd', fontSize: 12, marginTop: 2 }}>
                          {EVENT_TYPE_LABELS[evt.type] || evt.type}
                        </div>
                      </div>
                    </div>
                    <div style={{
                      background: '#14532d', borderRadius: 6, padding: '3px 10px',
                      fontSize: 11, color: '#86efac', whiteSpace: 'nowrap',
                    }}>
                      {formatTimeLeft(evt.endTime)} left
                    </div>
                  </div>
                  <div style={{ marginTop: 10, fontSize: 13, color: '#94a3b8' }}>{evt.description}</div>
                  <div style={{
                    marginTop: 8, display: 'inline-block',
                    background: '#1e3a5f', borderRadius: 5, padding: '3px 10px',
                    fontSize: 12, color: '#60a5fa', fontWeight: 'bold',
                  }}>
                    {formatModifier(evt.modifierType, evt.modifierValue)}
                  </div>
                </div>
              ))
            )}
          </section>

          {/* Upcoming Events */}
          {upcomingEvents.length > 0 && (
            <section>
              <h3 style={{ color: '#fbbf24', fontSize: 13, letterSpacing: 2, textTransform: 'uppercase', margin: '0 0 12px' }}>
                Upcoming
              </h3>
              {upcomingEvents.map(evt => (
                <div key={evt.id} style={{
                  background: '#0f1117',
                  border: '1px solid #292d3a',
                  borderLeft: '3px solid #fbbf24',
                  borderRadius: 8,
                  padding: '10px 14px',
                  marginBottom: 8,
                  opacity: 0.85,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 16 }}>{EVENT_TYPE_ICONS[evt.type] || '🌟'}</span>
                      <div>
                        <div style={{ fontWeight: 'bold', color: '#e2e8f0', fontSize: 14 }}>{evt.name}</div>
                        <div style={{ color: '#9ca3af', fontSize: 11, marginTop: 1 }}>
                          {formatModifier(evt.modifierType, evt.modifierValue)}
                        </div>
                      </div>
                    </div>
                    <div style={{ color: '#fcd34d', fontSize: 11 }}>
                      in {formatStartsIn(evt.startTime)}
                    </div>
                  </div>
                </div>
              ))}
            </section>
          )}
        </>
      )}

      <div style={{ marginTop: 20, fontSize: 11, color: '#374151', textAlign: 'center' }}>
        Press E to close
      </div>
    </div>
  )
}
