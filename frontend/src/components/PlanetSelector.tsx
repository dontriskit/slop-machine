import { useEffect, useState, useCallback } from 'react'
import { GameStore } from '../store/gameStore'
import { DEFAULT_PLAYER_ID } from '../lib/config'

interface Planet {
  id: string
  name: string
  coordinates: string
  is_homeworld: boolean
}

export default function PlanetSelector() {
  const activePlanetId = GameStore((s) => s.activePlanetId)
  const setActivePlanet = GameStore((s) => s.setActivePlanet)

  const [planets, setPlanets] = useState<Planet[]>([])
  const [open, setOpen] = useState(false)

  const fetchPlanets = useCallback(async () => {
    try {
      const res = await fetch(`/api/planets?player_id=${DEFAULT_PLAYER_ID}`)
      if (res.ok) {
        const data: Planet[] = await res.json()
        if (Array.isArray(data) && data.length > 0) {
          setPlanets(data)
        }
      }
    } catch {
      // offline — ignore
    }
  }, [])

  useEffect(() => {
    fetchPlanets()
  }, [fetchPlanets])

  const activePlanet = planets.find((p) => p.id === activePlanetId)

  if (planets.length === 0) return null

  return (
    <div className="planet-selector" style={{ marginTop: 10, position: 'relative' }}>
      <div
        className="stat"
        style={{ cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setOpen((v) => !v)}
        title="Switch planet"
      >
        <span className="label">Colony:</span>
        <span className="value" style={{ color: '#00ff41', display: 'flex', alignItems: 'center', gap: 4 }}>
          {activePlanet
            ? `${activePlanet.name} [${activePlanet.coordinates}]`
            : activePlanetId}
          <span style={{ fontSize: 9, opacity: 0.7 }}>{open ? '▲' : '▼'}</span>
        </span>
      </div>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            background: 'rgba(0, 8, 20, 0.97)',
            border: '1px solid #00ff41',
            borderRadius: 3,
            zIndex: 100,
            maxHeight: 180,
            overflowY: 'auto',
          }}
        >
          {planets.map((planet) => {
            const isActive = planet.id === activePlanetId
            return (
              <div
                key={planet.id}
                onClick={() => {
                  setActivePlanet(planet.id)
                  setOpen(false)
                }}
                style={{
                  padding: '6px 10px',
                  cursor: 'pointer',
                  fontSize: 11,
                  color: isActive ? '#ffff00' : '#00ff41',
                  background: isActive ? 'rgba(0,255,65,0.1)' : 'transparent',
                  borderBottom: '1px solid rgba(0,255,65,0.15)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'rgba(0,255,65,0.07)'
                }}
                onMouseLeave={(e) => {
                  if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'transparent'
                }}
              >
                <span>
                  {planet.name}
                  {planet.is_homeworld && (
                    <span style={{ fontSize: 9, marginLeft: 4, color: '#ffff00', opacity: 0.8 }}>HW</span>
                  )}
                </span>
                <span style={{ opacity: 0.7, fontSize: 10 }}>[{planet.coordinates}]</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
