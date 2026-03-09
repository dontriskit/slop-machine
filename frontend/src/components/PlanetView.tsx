import { useEffect, useState } from 'react'
import { DEFAULT_PLAYER_ID } from '../lib/config'
import { planetTypeFromPosition, positionFromCoords } from '../lib/planetUtils'

interface PlanetState {
  name?: string
  coordinates?: string
  position?: number
}

interface Buildings {
  metalMine?: number
  crystalMine?: number
  deutSynth?: number
  solarPlant?: number
  researchLab?: number
  roboticsFactory?: number
  shipyard?: number
  naniteFactory?: number
}

// Building key -> image ID mapping per spec
const ID_MAP: [keyof Buildings, number][] = [
  ['metalMine', 1],
  ['crystalMine', 2],
  ['deutSynth', 3],
  ['solarPlant', 4],
  ['researchLab', 12],
  ['roboticsFactory', 14],
  ['shipyard', 21],
  ['naniteFactory', 31],
]

function getPlanetOverviewImage(planetType: string, buildings: Buildings): string {
  const present = ID_MAP
    .filter(([key]) => (buildings[key] ?? 0) > 0)
    .map(([, id]) => id)
    .sort((a, b) => a - b)
  const suffix = present.length > 0 ? '_' + present.join('_') : ''
  return `/img/headers/overview/${planetType}${suffix}.jpg`
}

export default function PlanetView() {
  const [planetState, setPlanetState] = useState<PlanetState>({})
  const [buildings, setBuildings] = useState<Buildings>({})

  useEffect(() => {
    const planetId = localStorage.getItem('og_planet_id')
    if (!planetId) return

    const fetchAll = async () => {
      try {
        const [stateRes, buildingsRes] = await Promise.all([
          fetch(`/api/planet/${planetId}/state?player_id=${DEFAULT_PLAYER_ID}`),
          fetch(`/api/planet/${planetId}/buildings?player_id=${DEFAULT_PLAYER_ID}`),
        ])
        if (stateRes.ok) {
          const data = await stateRes.json() as Record<string, unknown>
          setPlanetState({
            name: (data.name as string) ?? undefined,
            coordinates: (data.coordinates as string) ?? undefined,
            position: (data.position as number) ?? undefined,
          })
        }
        if (buildingsRes.ok) {
          const data = await buildingsRes.json() as Buildings
          setBuildings(data)
        }
      } catch {
        // offline — ignore
      }
    }

    fetchAll()
    const interval = setInterval(fetchAll, 30_000)
    return () => clearInterval(interval)
  }, [])

  const coords = planetState.coordinates ?? ''
  const position = planetState.position ?? positionFromCoords(coords)
  const planetType = planetTypeFromPosition(position)
  const planetName = planetState.name ?? 'Home Planet'

  const overviewSrc = getPlanetOverviewImage(planetType, buildings)
  const baseSrc = `/img/headers/overview/${planetType}.jpg`
  const sphereSrc = `/img/planets/big/${planetType}_1.png`

  const coordLabel = coords ? `[${coords}]` : ''

  return (
    <div
      style={{
        background: 'rgba(8,14,28,0.88)',
        backdropFilter: 'blur(12px)',
        borderRadius: 8,
        border: '1px solid rgba(91,156,246,0.2)',
        overflow: 'hidden',
        width: '100%',
        maxWidth: 600,
        position: 'relative',
      }}
    >
      {/* Header image with gradient overlay */}
      <div style={{ position: 'relative', width: '100%', height: 240 }}>
        <img
          src={overviewSrc}
          onError={(e) => {
            const img = e.currentTarget
            if (img.src !== window.location.origin + baseSrc) {
              img.src = baseSrc
            }
          }}
          alt={`${planetType} planet`}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
          }}
        />

        {/* Bottom gradient */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(to bottom, transparent 40%, rgba(8,14,28,0.95) 100%)',
          }}
        />

        {/* Big planet sphere — top right */}
        <img
          src={sphereSrc}
          alt={planetType}
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            width: 80,
            height: 80,
            borderRadius: '50%',
            objectFit: 'cover',
            boxShadow: '0 0 16px rgba(91,156,246,0.4)',
          }}
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
        />

        {/* Planet info overlay — bottom of image */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            padding: '8px 14px 10px',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div
              style={{
                color: '#e8f0ff',
                fontSize: 16,
                fontWeight: 700,
                letterSpacing: '0.03em',
                textShadow: '0 1px 6px rgba(0,0,0,0.9)',
              }}
            >
              {planetName}
            </div>
            {coordLabel && (
              <div
                style={{
                  color: '#8ab4f8',
                  fontSize: 12,
                  marginTop: 2,
                  textShadow: '0 1px 4px rgba(0,0,0,0.8)',
                }}
              >
                {coordLabel}
              </div>
            )}
          </div>

          {/* Planet type badge */}
          <div
            style={{
              background: 'rgba(91,156,246,0.18)',
              border: '1px solid rgba(91,156,246,0.35)',
              borderRadius: 4,
              padding: '2px 8px',
              fontSize: 11,
              color: '#8ab4f8',
              textTransform: 'capitalize',
              letterSpacing: '0.05em',
            }}
          >
            {planetType}
          </div>
        </div>
      </div>
    </div>
  )
}
