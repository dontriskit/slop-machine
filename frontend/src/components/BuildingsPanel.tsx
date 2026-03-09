import { useState, useEffect, useCallback } from 'react'
import { GameStore } from '../store/gameStore'

// ---------------------------------------------------------------------------
// Building definitions
// ---------------------------------------------------------------------------

const BUILDINGS = [
  { id: 1,  key: 'metalMine',       label: 'Metal Mine',       img: 'metal_mine_small.jpg' },
  { id: 2,  key: 'crystalMine',     label: 'Crystal Mine',     img: 'crystal_mine_small.jpg' },
  { id: 3,  key: 'deutSynth',       label: 'Deut Synth',       img: 'deuterium_synthesizer_small.jpg' },
  { id: 4,  key: 'solarPlant',      label: 'Solar Plant',      img: 'solar_plant_small.jpg' },
  { id: 12, key: 'fusionReactor',   label: 'Fusion Reactor',   img: 'fusion_plant_small.jpg' },
  { id: 14, key: 'roboticsFactory', label: 'Robotics Factory', img: 'robot_factory_small.jpg' },
  { id: 15, key: 'naniteFactory',   label: 'Nanite Factory',   img: 'nanite_factory_small.jpg' },
  { id: 21, key: 'shipyard',        label: 'Shipyard',         img: 'shipyard_small.jpg' },
  { id: 22, key: 'metalStorage',    label: 'Metal Storage',    img: 'metal_store_small.jpg' },
  { id: 23, key: 'crystalStorage',  label: 'Crystal Storage',  img: 'crystal_store_small.jpg' },
  { id: 24, key: 'deutTank',        label: 'Deut Tank',        img: 'deuterium_store_small.jpg' },
  { id: 31, key: 'researchLab',     label: 'Research Lab',     img: 'research_lab_small.jpg' },
  { id: 33, key: 'allianceDepot',   label: 'Alliance Depot',   img: 'alliance_depot_small.jpg' },
  { id: 34, key: 'missileSilo',     label: 'Missile Silo',     img: 'missile_silo_small.jpg' },
] as const

type BuildingKey = typeof BUILDINGS[number]['key']

// ---------------------------------------------------------------------------
// OGame upgrade cost formulas
// ---------------------------------------------------------------------------

const BASE_COSTS: Record<string, [number, number]> = {
  metalMine:       [60, 15],
  crystalMine:     [48, 24],
  deutSynth:       [225, 75],
  solarPlant:      [75, 30],
  fusionReactor:   [900, 360],
  roboticsFactory: [400, 120],
  naniteFactory:   [1_000_000, 500_000],
  shipyard:        [400, 200],
  researchLab:     [200, 400],
  metalStorage:    [1000, 500],
  crystalStorage:  [1000, 500],
  deutTank:        [1000, 500],
  allianceDepot:   [20_000, 40_000],
  missileSilo:     [20_000, 20_000],
}

function upgradeCost(key: string, level: number) {
  const [baseM, baseC] = BASE_COSTS[key] ?? [1000, 500]
  const factor = Math.pow(1.5, level)
  return { metal: Math.round(baseM * factor), crystal: Math.round(baseC * factor) }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(Math.floor(n))
}

// Placeholder card colours by building id
const CARD_COLORS: Record<number, string> = {
  1: '#7c4a2d', 2: '#2d5e7c', 3: '#1a4a3a', 4: '#7a6520',
  12: '#4a1a7a', 14: '#3a3a3a', 15: '#1a1a5a', 21: '#2a4a6a',
  22: '#5a3a1a', 23: '#1a3a5a', 24: '#1a3a2a', 31: '#4a2a5a',
  33: '#2a4a2a', 34: '#5a2a2a',
}

// ---------------------------------------------------------------------------
// BuildingCard
// ---------------------------------------------------------------------------

interface BuildingCardProps {
  id: number
  bkey: string
  label: string
  img: string
  level: number
  resources: { metal: number; crystal: number; deuterium: number }
  production: { metalPerHour: number; crystalPerHour: number; deutPerHour: number }
  onUpgrade: (key: string) => Promise<void>
  upgrading: boolean
}

function BuildingCard({
  id, bkey, label, img, level, resources, production, onUpgrade, upgrading,
}: BuildingCardProps) {
  const [imgErr, setImgErr] = useState(false)
  const [hovered, setHovered] = useState(false)

  const cost = upgradeCost(bkey, level)
  const canAfford = resources.metal >= cost.metal && resources.crystal >= cost.crystal

  // Per-building production rate label
  let prodLabel = ''
  if (bkey === 'metalMine' || bkey === 'metalStorage') {
    prodLabel = `+${fmt(production.metalPerHour)} metal/hr`
  } else if (bkey === 'crystalMine' || bkey === 'crystalStorage') {
    prodLabel = `+${fmt(production.crystalPerHour)} crystal/hr`
  } else if (bkey === 'deutSynth' || bkey === 'deutTank') {
    prodLabel = `+${fmt(production.deutPerHour)} deut/hr`
  } else if (bkey === 'solarPlant' || bkey === 'fusionReactor') {
    prodLabel = 'Energy producer'
  } else if (bkey === 'shipyard') {
    prodLabel = 'Ship construction'
  } else if (bkey === 'researchLab') {
    prodLabel = 'Technology research'
  } else if (bkey === 'roboticsFactory') {
    prodLabel = 'Build speed boost'
  } else if (bkey === 'naniteFactory') {
    prodLabel = 'Max build speed'
  } else if (bkey === 'allianceDepot') {
    prodLabel = 'Alliance support'
  } else if (bkey === 'missileSilo') {
    prodLabel = 'Missile storage'
  }

  const progressPct = Math.min(100, (level % 10) * 10)

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: `1px solid ${hovered ? 'rgba(91,156,246,0.4)' : 'rgba(91,156,246,0.15)'}`,
        borderRadius: 10,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        transform: hovered ? 'translateY(-2px)' : 'none',
        transition: 'border-color 0.2s, transform 0.2s, box-shadow 0.2s',
        boxShadow: hovered ? '0 8px 32px rgba(91,156,246,0.15)' : '0 2px 8px rgba(0,0,0,0.3)',
        cursor: 'default',
        minWidth: 0,
      }}
    >
      {/* Image section */}
      <div style={{ position: 'relative', height: 120, flexShrink: 0, overflow: 'hidden' }}>
        {imgErr ? (
          <div style={{
            width: '100%', height: '100%',
            background: CARD_COLORS[id] ?? '#333',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 40, fontWeight: 700, color: 'rgba(255,255,255,0.3)',
            fontFamily: 'Inter, sans-serif',
          }}>
            {label[0]}
          </div>
        ) : (
          <img
            src={`/img/objects/buildings/${img}`}
            alt={label}
            onError={() => setImgErr(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        )}
        {/* Gradient overlay at bottom of image */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: 50,
          background: 'linear-gradient(transparent, rgba(4,8,20,0.85))',
        }} />
        {/* Level badge */}
        <div style={{
          position: 'absolute', top: 8, right: 8,
          background: '#5b9cf6',
          color: '#fff',
          fontSize: 11,
          fontWeight: 700,
          fontFamily: 'Inter, sans-serif',
          padding: '2px 8px',
          borderRadius: 20,
          letterSpacing: 0.5,
        }}>
          Lv {level}
        </div>
        {/* Progress bar at bottom of image */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: 4,
          background: 'rgba(255,255,255,0.08)',
        }}>
          <div style={{
            height: '100%',
            width: `${progressPct}%`,
            background: '#5b9cf6',
            transition: 'width 0.4s',
          }} />
        </div>
      </div>

      {/* Info section */}
      <div style={{ padding: '10px 12px 6px', flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        }}>
          <span style={{
            fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: 13,
            color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {label}
          </span>
        </div>

        {prodLabel && (
          <div style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'Inter, sans-serif' }}>
            {prodLabel}
          </div>
        )}

        <div style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'Inter, sans-serif', marginTop: 2 }}>
          <span style={{ color: '#cd9d6a' }}>Cost: </span>
          <span style={{ color: '#b0bec5' }}>
            <span style={{ color: '#e57373' }}>🔩</span>{fmt(cost.metal)}
          </span>
          {' '}
          <span style={{ color: '#b0bec5' }}>
            <span style={{ color: '#64b5f6' }}>💎</span>{fmt(cost.crystal)}
          </span>
        </div>
      </div>

      {/* Upgrade button */}
      <div style={{ padding: '0 12px 12px' }}>
        <button
          onClick={() => onUpgrade(bkey)}
          disabled={upgrading || !canAfford}
          style={{
            width: '100%',
            padding: '8px 0',
            background: canAfford ? '#5b9cf6' : 'rgba(239,68,68,0.18)',
            border: canAfford ? 'none' : '1px solid rgba(239,68,68,0.4)',
            borderRadius: 6,
            color: canAfford ? '#fff' : '#f87171',
            fontFamily: 'Inter, sans-serif',
            fontWeight: 600,
            fontSize: 12,
            letterSpacing: 0.5,
            cursor: upgrading || !canAfford ? 'not-allowed' : 'pointer',
            opacity: upgrading ? 0.5 : canAfford ? 1 : 0.7,
            transition: 'opacity 0.2s, background 0.2s',
          }}
        >
          {upgrading ? '...' : canAfford ? '▲ UPGRADE' : '▲ UPGRADE'}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// BuildingsPanel (full-screen)
// ---------------------------------------------------------------------------

interface BuildingsPanelProps {
  onClose: () => void
}

export default function BuildingsPanel({ onClose }: BuildingsPanelProps) {
  const buildings = GameStore((s) => s.buildings)
  const resources  = GameStore((s) => s.resources)
  const production = GameStore((s) => s.production)

  const [upgrading, setUpgrading] = useState<string | null>(null)
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)

  const handleUpgrade = useCallback(async (key: string) => {
    const planetId = localStorage.getItem('og_planet_id')
    if (!planetId) {
      setMessage({ text: 'No planet selected', ok: false })
      return
    }
    setUpgrading(key)
    try {
      const res = await fetch(`/api/planet/${planetId}/upgrade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buildingType: key }),
      })
      if (res.ok) {
        setMessage({ text: `Upgrade started!`, ok: true })
      } else {
        const data = await res.json().catch(() => ({}))
        setMessage({ text: (data as Record<string, string>).error ?? 'Upgrade failed', ok: false })
      }
    } catch {
      setMessage({ text: 'Network error', ok: false })
    } finally {
      setUpgrading(null)
      setTimeout(() => setMessage(null), 3000)
    }
  }, [])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const buildingLevels = buildings as unknown as Record<BuildingKey, number>

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(4,8,20,0.97)',
        backdropFilter: 'blur(20px)',
        zIndex: 400,
        overflowY: 'auto',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      {/* Header */}
      <div style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        background: 'rgba(4,8,20,0.92)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(91,156,246,0.15)',
        padding: '18px 32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 600, color: '#e2e8f0', letterSpacing: 2 }}>
            FACILITIES
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
            Press I to toggle  •  ESC to close
          </div>
        </div>
        {message && (
          <div style={{
            padding: '8px 16px',
            borderRadius: 8,
            background: message.ok ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
            border: `1px solid ${message.ok ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)'}`,
            color: message.ok ? '#4ade80' : '#f87171',
            fontSize: 13,
            fontWeight: 500,
          }}>
            {message.text}
          </div>
        )}
        <button
          onClick={onClose}
          aria-label="Close buildings panel"
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.12)',
            color: '#94a3b8',
            borderRadius: 8,
            width: 36,
            height: 36,
            fontSize: 18,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 0.15s',
            flexShrink: 0,
          }}
        >
          ✕
        </button>
      </div>

      {/* Grid */}
      <div style={{
        padding: '28px 32px 48px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
        gap: 20,
        maxWidth: 1400,
        margin: '0 auto',
      }}>
        {BUILDINGS.map((b) => (
          <BuildingCard
            key={b.key}
            id={b.id}
            bkey={b.key}
            label={b.label}
            img={b.img}
            level={buildingLevels[b.key as BuildingKey] ?? 0}
            resources={resources}
            production={production}
            onUpgrade={handleUpgrade}
            upgrading={upgrading === b.key}
          />
        ))}
      </div>
    </div>
  )
}
