/**
 * ResearchTree.tsx
 *
 * Visual technology tree for Cosmic Protocol:
 * - Grid layout by category: Military, Economy, Drive, Defense
 * - Dependency lines between tech nodes
 * - Color coding: teal=researched, amber=available, gray=locked
 * - Click node: detail panel with level, cost, effects, research button
 * - Active research progress bar with countdown
 * - Keyboard shortcut 'R' registered in App.tsx
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { DEFAULT_PLANET_ID, DEFAULT_PLAYER_ID } from '../lib/config'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Resources {
  metal: number
  crystal: number
  deuterium: number
}

interface TechPrerequisite {
  buildings?: Record<string, number>
  techs?: Record<string, number>
  energyProduction?: number
}

interface TechDefinition {
  id: number
  name: string
  key: string
  baseCost: Resources
  factor: number
  prerequisites: TechPrerequisite
  description: string
  category: 'military' | 'economy' | 'drive' | 'defense'
  gridCol: number
  gridRow: number
}

interface TechLevels {
  energyTech: number
  laserTech: number
  ionTech: number
  hyperspaceTech: number
  plasmaTech: number
  combustionDrive: number
  impulseDrive: number
  hyperspaceDrive: number
  espionageTech: number
  computerTech: number
  astrophysics: number
  weaponTech: number
  shieldingTech: number
  armorTech: number
  gravitonTech: number
}

interface ResearchQueueItem {
  techId: number
  level: number
  timeStart: number
  timeEnd: number
}

interface ResearchStateResponse {
  techLevels: TechLevels
  queue: ResearchQueueItem[]
  availableTechs: number[]
}

// ---------------------------------------------------------------------------
// Tech definitions with categories and grid positions
// ---------------------------------------------------------------------------

const TECH_DEFS: TechDefinition[] = [
  // Military category
  {
    id: 109, name: 'Weapon Technology', key: 'weaponTech',
    baseCost: { metal: 800, crystal: 200, deuterium: 0 }, factor: 2.0,
    prerequisites: { buildings: { researchLab: 4 } },
    description: 'Improves attack power of all ships and defenses. +10% attack per level.',
    category: 'military', gridCol: 0, gridRow: 0,
  },
  {
    id: 120, name: 'Laser Technology', key: 'laserTech',
    baseCost: { metal: 200, crystal: 100, deuterium: 0 }, factor: 2.0,
    prerequisites: { buildings: { researchLab: 1 }, techs: { energyTech: 2 } },
    description: 'Focused light beam weaponry. Prerequisite for Ion and Plasma technologies.',
    category: 'military', gridCol: 0, gridRow: 1,
  },
  {
    id: 121, name: 'Ion Technology', key: 'ionTech',
    baseCost: { metal: 1000, crystal: 300, deuterium: 100 }, factor: 2.0,
    prerequisites: { buildings: { researchLab: 1 }, techs: { laserTech: 5, energyTech: 4 } },
    description: 'Charged particle beam technology. Required for Plasma Technology and advanced ships.',
    category: 'military', gridCol: 0, gridRow: 2,
  },
  {
    id: 122, name: 'Plasma Technology', key: 'plasmaTech',
    baseCost: { metal: 2000, crystal: 4000, deuterium: 1000 }, factor: 2.0,
    prerequisites: { buildings: { researchLab: 1 }, techs: { energyTech: 8, laserTech: 10, ionTech: 5 } },
    description: 'High-energy plasma weapon systems. Boosts resource production: +1% metal, +0.66% crystal, +0.33% deuterium per level.',
    category: 'military', gridCol: 0, gridRow: 3,
  },
  {
    id: 199, name: 'Graviton Technology', key: 'gravitonTech',
    baseCost: { metal: 0, crystal: 0, deuterium: 0 }, factor: 3.0,
    prerequisites: { buildings: { researchLab: 12 }, energyProduction: 300000 },
    description: 'Graviton field generator. Enables construction of the Deathstar. Requires 300,000 energy production.',
    category: 'military', gridCol: 0, gridRow: 4,
  },

  // Economy category
  {
    id: 113, name: 'Energy Technology', key: 'energyTech',
    baseCost: { metal: 0, crystal: 800, deuterium: 400 }, factor: 2.0,
    prerequisites: { buildings: { researchLab: 1 } },
    description: 'Advances in energy management. Required for most advanced technologies. Improves fusion reactor output.',
    category: 'economy', gridCol: 1, gridRow: 0,
  },
  {
    id: 108, name: 'Computer Technology', key: 'computerTech',
    baseCost: { metal: 0, crystal: 400, deuterium: 600 }, factor: 2.0,
    prerequisites: { buildings: { researchLab: 1 } },
    description: 'Improves fleet command systems. +1 fleet slot per level.',
    category: 'economy', gridCol: 1, gridRow: 1,
  },
  {
    id: 106, name: 'Espionage Technology', key: 'espionageTech',
    baseCost: { metal: 200, crystal: 1000, deuterium: 200 }, factor: 2.0,
    prerequisites: { buildings: { researchLab: 3 } },
    description: 'Advanced intelligence-gathering. Higher levels reveal more planet data in espionage reports.',
    category: 'economy', gridCol: 1, gridRow: 2,
  },
  {
    id: 124, name: 'Astrophysics', key: 'astrophysics',
    baseCost: { metal: 4000, crystal: 8000, deuterium: 4000 }, factor: 1.75,
    prerequisites: { buildings: { researchLab: 1 }, techs: { espionageTech: 4, impulseDrive: 3 } },
    description: 'Study of celestial bodies. Unlocks additional colony slots every 2 levels.',
    category: 'economy', gridCol: 1, gridRow: 3,
  },
  {
    id: 114, name: 'Hyperspace Technology', key: 'hyperspaceTech',
    baseCost: { metal: 0, crystal: 4000, deuterium: 2000 }, factor: 2.0,
    prerequisites: { buildings: { researchLab: 1 }, techs: { energyTech: 5, shieldingTech: 5 } },
    description: 'Mastery of hyperspace physics. Improves cargo capacity (+5% per level) and unlocks Hyperspace Drive.',
    category: 'economy', gridCol: 1, gridRow: 4,
  },

  // Drive category
  {
    id: 115, name: 'Combustion Drive', key: 'combustionDrive',
    baseCost: { metal: 400, crystal: 0, deuterium: 600 }, factor: 2.0,
    prerequisites: { buildings: { researchLab: 1 }, techs: { energyTech: 1 } },
    description: 'Basic propulsion for small vessels. +10% speed per level for: Small Cargo, Light Fighter, Recycler.',
    category: 'drive', gridCol: 2, gridRow: 0,
  },
  {
    id: 117, name: 'Impulse Drive', key: 'impulseDrive',
    baseCost: { metal: 2000, crystal: 4000, deuterium: 600 }, factor: 2.0,
    prerequisites: { buildings: { researchLab: 1 }, techs: { energyTech: 1 } },
    description: 'Advanced ion propulsion. +20% speed per level for: Bomber, Cruiser, Heavy Fighter, Colony Ship.',
    category: 'drive', gridCol: 2, gridRow: 1,
  },
  {
    id: 118, name: 'Hyperspace Drive', key: 'hyperspaceDrive',
    baseCost: { metal: 10000, crystal: 20000, deuterium: 6000 }, factor: 2.0,
    prerequisites: { buildings: { researchLab: 1 }, techs: { hyperspaceTech: 3 } },
    description: '+30% speed per level for capital ships: Battlecruiser, Battleship, Destroyer, Deathstar.',
    category: 'drive', gridCol: 2, gridRow: 2,
  },

  // Defense category
  {
    id: 110, name: 'Shielding Technology', key: 'shieldingTech',
    baseCost: { metal: 200, crystal: 600, deuterium: 0 }, factor: 2.0,
    prerequisites: { buildings: { researchLab: 6 }, techs: { energyTech: 3 } },
    description: 'Advances in defensive shielding. +10% shield strength per level for all units.',
    category: 'defense', gridCol: 3, gridRow: 0,
  },
  {
    id: 111, name: 'Armor Technology', key: 'armorTech',
    baseCost: { metal: 1000, crystal: 0, deuterium: 0 }, factor: 2.0,
    prerequisites: { buildings: { researchLab: 2 } },
    description: 'Stronger hull materials. +10% hull integrity per level for all ships and defenses.',
    category: 'defense', gridCol: 3, gridRow: 1,
  },
]

const RESEARCH_IMAGES: Record<string, string> = {
  weaponTech:       '/img/objects/research/weapons_technology_small.jpg',
  laserTech:        '/img/objects/research/laser_technology_small.jpg',
  ionTech:          '/img/objects/research/ion_technology_small.jpg',
  plasmaTech:       '/img/objects/research/plasma_technology_small.jpg',
  gravitonTech:     '/img/objects/research/graviton_technology_small.jpg',
  energyTech:       '/img/objects/research/energy_technology_small.jpg',
  computerTech:     '/img/objects/research/computer_technology_small.jpg',
  espionageTech:    '/img/objects/research/espionage_technology_small.jpg',
  astrophysics:     '/img/objects/research/astrophysics_technology_small.jpg',
  hyperspaceTech:   '/img/objects/research/hyperspace_technology_small.jpg',
  combustionDrive:  '/img/objects/research/combustion_drive_small.jpg',
  impulseDrive:     '/img/objects/research/impulse_drive_small.jpg',
  hyperspaceDrive:  '/img/objects/research/hyperspace_drive_small.jpg',
  shieldingTech:    '/img/objects/research/shielding_technology_small.jpg',
  armorTech:        '/img/objects/research/armor_technology_small.jpg',
}

const CATEGORY_LABELS: Record<string, string> = {
  military: 'Military',
  economy: 'Economy',
  drive: 'Drive',
  defense: 'Defense',
}

const CATEGORY_COLORS: Record<string, string> = {
  military: '#f87171',
  economy:  '#5b9cf6',
  drive:    '#f59e0b',
  defense:  '#34d399',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(Math.floor(n))
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'Done'
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function calcCost(def: TechDefinition, level: number): Resources {
  const multiplier = Math.pow(def.factor, level - 1)
  return {
    metal: Math.floor(def.baseCost.metal * multiplier),
    crystal: Math.floor(def.baseCost.crystal * multiplier),
    deuterium: Math.floor(def.baseCost.deuterium * multiplier),
  }
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

async function apiGetResearchState(planetId: string): Promise<ResearchStateResponse | null> {
  try {
    const res = await fetch(`/api/research/${encodeURIComponent(planetId)}`)
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

async function apiStartResearch(
  planetId: string,
  playerId: string,
  techId: number,
): Promise<{ success: boolean; error?: string } | null> {
  try {
    const res = await fetch('/api/research/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planetId, playerId, techId }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
      return { success: false, error: (body as { error?: string }).error ?? `HTTP ${res.status}` }
    }
    return { success: true }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

// ---------------------------------------------------------------------------
// Mock fallback data (used when API unreachable)
// ---------------------------------------------------------------------------

const MOCK_TECH_LEVELS: TechLevels = {
  energyTech: 3,
  laserTech: 1,
  ionTech: 0,
  hyperspaceTech: 0,
  plasmaTech: 0,
  combustionDrive: 2,
  impulseDrive: 1,
  hyperspaceDrive: 0,
  espionageTech: 2,
  computerTech: 1,
  astrophysics: 0,
  weaponTech: 1,
  shieldingTech: 0,
  armorTech: 1,
  gravitonTech: 0,
}

// ---------------------------------------------------------------------------
// ResearchTree component
// ---------------------------------------------------------------------------

interface ResearchTreeProps {
  onClose: () => void
  planetId?: string
  playerId?: string
}

export default function ResearchTree({
  onClose,
  planetId = DEFAULT_PLANET_ID,
  playerId = DEFAULT_PLAYER_ID,
}: ResearchTreeProps) {
  const [techLevels, setTechLevels] = useState<TechLevels>(MOCK_TECH_LEVELS)
  const [queue, setQueue] = useState<ResearchQueueItem[]>([])
  const [availableTechs, setAvailableTechs] = useState<number[]>([])
  const [selectedTech, setSelectedTech] = useState<TechDefinition | null>(null)
  const [researching, setResearching] = useState(false)
  const [researchError, setResearchError] = useState<string | null>(null)
  const [countdown, setCountdown] = useState<number>(0)
  const [isMock, setIsMock] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Determine which techs are locally available (based on current levels)
  const getLocalAvailable = useCallback((levels: TechLevels): number[] => {
    return TECH_DEFS
      .filter((def) => {
        // Check tech prerequisites
        if (def.prerequisites.techs) {
          for (const [k, minLevel] of Object.entries(def.prerequisites.techs)) {
            if ((levels[k as keyof TechLevels] ?? 0) < minLevel) return false
          }
        }
        // Graviton special case — skip energy production check, mark as potentially available
        return true
      })
      .map((d) => d.id)
  }, [])

  const loadResearchState = useCallback(async () => {
    const data = await apiGetResearchState(planetId)
    if (data) {
      setTechLevels(data.techLevels)
      setQueue(data.queue)
      setAvailableTechs(data.availableTechs)
      setIsMock(false)
    } else {
      // Mock fallback
      setTechLevels(MOCK_TECH_LEVELS)
      setQueue([])
      setAvailableTechs(getLocalAvailable(MOCK_TECH_LEVELS))
      setIsMock(true)
    }
  }, [planetId, getLocalAvailable])

  useEffect(() => {
    loadResearchState()
    // Poll every 5s
    const interval = setInterval(loadResearchState, 5000)
    return () => clearInterval(interval)
  }, [loadResearchState])

  // Countdown timer for active research
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (queue.length > 0) {
      const update = () => {
        const remaining = queue[0].timeEnd - Date.now()
        setCountdown(Math.max(0, remaining))
      }
      update()
      timerRef.current = setInterval(update, 1000)
    } else {
      setCountdown(0)
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [queue])

  const handleStartResearch = useCallback(async () => {
    if (!selectedTech) return
    setResearching(true)
    setResearchError(null)
    const result = await apiStartResearch(planetId, playerId, selectedTech.id)
    setResearching(false)
    if (!result || !result.success) {
      setResearchError(result?.error ?? 'Failed to start research')
    } else {
      await loadResearchState()
    }
  }, [selectedTech, planetId, playerId, loadResearchState])

  // Determine status of each tech
  const getTechStatus = useCallback(
    (def: TechDefinition): 'researched' | 'available' | 'locked' => {
      const level = techLevels[def.key as keyof TechLevels] ?? 0
      if (level > 0) return 'researched'
      if (availableTechs.includes(def.id)) return 'available'
      // Fallback: check locally
      if (getLocalAvailable(techLevels).includes(def.id)) return 'available'
      return 'locked'
    },
    [techLevels, availableTechs, getLocalAvailable],
  )

  const activeResearch = queue[0] ?? null
  const activeResearchDef = activeResearch
    ? TECH_DEFS.find((d) => d.id === activeResearch.techId) ?? null
    : null

  // Group techs by category
  const categories = ['military', 'economy', 'drive', 'defense'] as const

  // Compute next level cost for selected tech
  const selectedLevel = selectedTech
    ? (techLevels[selectedTech.key as keyof TechLevels] ?? 0)
    : 0
  const nextLevel = selectedLevel + 1
  const nextCost = selectedTech ? calcCost(selectedTech, nextLevel) : null
  const selectedStatus = selectedTech ? getTechStatus(selectedTech) : null

  const canResearch =
    selectedTech !== null &&
    selectedStatus !== 'locked' &&
    !activeResearch

  return (
    <div style={styles.container}>
      {/* Banner image */}
      <div style={styles.bannerWrap}>
        <img src="/img/headers/research/research.jpg" alt="Research" style={styles.bannerImg} />
        <span style={styles.bannerTitle}>Research</span>
      </div>

      {/* Header */}
      <div style={styles.header}>
        <span style={styles.title}>Research Tree</span>
        {isMock && (
          <span style={styles.mockBadge}>MOCK DATA</span>
        )}
        <button style={styles.closeBtn} onClick={onClose}>
          ✕
        </button>
      </div>

      {/* Active research bar */}
      {activeResearch && activeResearchDef && (
        <div style={styles.activeBar}>
          <span style={styles.activeLabel}>
            Researching: {activeResearchDef.name} Lv{activeResearch.level}
          </span>
          <div style={styles.progressTrack}>
            <div
              style={{
                ...styles.progressFill,
                width: `${Math.max(0, Math.min(100,
                  100 - (countdown / (activeResearch.timeEnd - activeResearch.timeStart)) * 100
                ))}%`,
              }}
            />
          </div>
          <span style={styles.countdownText}>{formatCountdown(countdown)}</span>
        </div>
      )}

      <div style={styles.body}>
        {/* Tech tree grid */}
        <div style={styles.treeArea}>
          {categories.map((cat) => {
            const catTechs = TECH_DEFS.filter((d) => d.category === cat)
            return (
              <div key={cat} style={styles.categoryColumn}>
                <div
                  style={{
                    ...styles.categoryHeader,
                    borderColor: CATEGORY_COLORS[cat],
                    color: CATEGORY_COLORS[cat],
                  }}
                >
                  {CATEGORY_LABELS[cat]}
                </div>
                <div style={styles.techStack}>
                  {catTechs.map((def, idx) => {
                    const status = getTechStatus(def)
                    const level = techLevels[def.key as keyof TechLevels] ?? 0
                    const isActive = activeResearch?.techId === def.id
                    const isSelected = selectedTech?.id === def.id

                    const nodeColor =
                      isActive ? '#f59e0b' :
                      status === 'researched' ? '#34d399' :
                      status === 'available' ? '#5b9cf6' :
                      '#334155'

                    const borderColor =
                      isSelected ? 'rgba(255,255,255,0.5)' :
                      isActive ? 'rgba(245,158,11,0.6)' :
                      nodeColor + '88'

                    return (
                      <div key={def.id} style={{ position: 'relative' }}>
                        {/* Connector line from previous tech in same category */}
                        {idx > 0 && (
                          <div
                            style={{
                              position: 'absolute',
                              top: -12,
                              left: '50%',
                              width: 2,
                              height: 12,
                              background: 'rgba(91,156,246,0.2)',
                              transform: 'translateX(-50%)',
                            }}
                          />
                        )}
                        <button
                          style={{
                            ...styles.techNode,
                            borderColor,
                            background: isSelected
                              ? 'rgba(255,255,255,0.05)'
                              : status === 'researched'
                              ? 'rgba(52,211,153,0.08)'
                              : status === 'available'
                              ? 'rgba(91,156,246,0.08)'
                              : 'rgba(0,0,0,0.2)',
                          }}
                          onClick={() => setSelectedTech(isSelected ? null : def)}
                        >
                          {RESEARCH_IMAGES[def.key] && (
                            <img
                              src={RESEARCH_IMAGES[def.key]}
                              alt={def.name}
                              width={40}
                              height={40}
                              style={styles.techThumb}
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                            />
                          )}
                          <div style={{ ...styles.nodeStatus, color: nodeColor }}>
                            {isActive ? 'RES' : status === 'researched' ? 'OK' : status === 'available' ? 'AVL' : 'LCK'}
                          </div>
                          <div style={styles.nodeName}>{def.name}</div>
                          <div style={{ ...styles.nodeLevel, color: nodeColor }}>
                            {level > 0 ? `Lv ${level}` : '—'}
                          </div>
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {/* Detail panel */}
        <div style={styles.detailPanel}>
          {selectedTech ? (
            <>
              <div style={styles.detailName}>{selectedTech.name}</div>
              <div
                style={{
                  ...styles.detailStatus,
                  color:
                    selectedStatus === 'researched' ? '#34d399' :
                    selectedStatus === 'available' ? '#5b9cf6' : '#64748b',
                }}
              >
                {selectedStatus === 'researched'
                  ? `Researched — Level ${selectedLevel}`
                  : selectedStatus === 'available'
                  ? 'Available'
                  : 'Locked — Prerequisites not met'}
              </div>
              <div style={styles.detailDesc}>{selectedTech.description}</div>

              <div style={styles.detailSection}>Prerequisites</div>
              {Object.keys(selectedTech.prerequisites).length === 0 ? (
                <div style={styles.prereqRow}>None</div>
              ) : (
                <>
                  {selectedTech.prerequisites.buildings &&
                    Object.entries(selectedTech.prerequisites.buildings).map(([k, v]) => (
                      <div key={k} style={styles.prereqRow}>
                        Building: {k} Lv{v}
                      </div>
                    ))}
                  {selectedTech.prerequisites.techs &&
                    Object.entries(selectedTech.prerequisites.techs).map(([k, v]) => {
                      const dep = TECH_DEFS.find((d) => d.key === k)
                      const met = (techLevels[k as keyof TechLevels] ?? 0) >= v
                      return (
                        <div
                          key={k}
                          style={{ ...styles.prereqRow, color: met ? '#34d399' : '#f87171' }}
                        >
                          {dep?.name ?? k} Lv{v} {met ? '✓' : '✗'}
                        </div>
                      )
                    })}
                  {selectedTech.prerequisites.energyProduction !== undefined && (
                    <div style={styles.prereqRow}>
                      Energy Production: {formatNumber(selectedTech.prerequisites.energyProduction)}
                    </div>
                  )}
                </>
              )}

              <div style={styles.detailSection}>Next Level: {nextLevel}</div>
              {nextCost && (
                <div style={styles.costGrid}>
                  <div style={styles.costItem}>
                    <span style={{ color: '#94a3b8' }}>Metal</span>
                    <span style={{ color: '#e2e8f0' }}>{formatNumber(nextCost.metal)}</span>
                  </div>
                  <div style={styles.costItem}>
                    <span style={{ color: '#94a3b8' }}>Crystal</span>
                    <span style={{ color: '#e2e8f0' }}>{formatNumber(nextCost.crystal)}</span>
                  </div>
                  <div style={styles.costItem}>
                    <span style={{ color: '#94a3b8' }}>Deut</span>
                    <span style={{ color: '#e2e8f0' }}>{formatNumber(nextCost.deuterium)}</span>
                  </div>
                </div>
              )}

              {activeResearch && (
                <div style={styles.queueNote}>
                  Research slot occupied. Wait for current research to finish.
                </div>
              )}

              {researchError && (
                <div style={styles.errorMsg}>{researchError}</div>
              )}

              <button
                style={{
                  ...styles.researchBtn,
                  opacity: canResearch ? 1 : 0.4,
                  cursor: canResearch ? 'pointer' : 'not-allowed',
                }}
                disabled={!canResearch || researching}
                onClick={handleStartResearch}
              >
                {researching
                  ? 'Starting...'
                  : selectedStatus === 'locked'
                  ? 'Locked'
                  : activeResearch
                  ? 'Queue Full'
                  : `Research Lv${nextLevel}`}
              </button>
            </>
          ) : (
            <div style={styles.selectHint}>
              Select a technology node to view details
            </div>
          )}

          {/* Queue section */}
          <div style={{ marginTop: 24 }}>
            <div style={styles.detailSection}>Research Queue</div>
            {queue.length === 0 ? (
              <div style={{ color: '#64748b', fontSize: 12 }}>No active research</div>
            ) : (
              queue.map((item) => {
                const def = TECH_DEFS.find((d) => d.id === item.techId)
                const remaining = item.timeEnd - Date.now()
                return (
                  <div key={item.techId} style={styles.queueItem}>
                    <span style={{ color: '#e2e8f0' }}>{def?.name ?? `Tech #${item.techId}`} Lv{item.level}</span>
                    <span style={{ color: '#f59e0b' }}>{formatCountdown(remaining)}</span>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div style={styles.legend}>
        <span style={{ color: '#34d399' }}>Researched</span>
        <span style={{ color: '#5b9cf6', marginLeft: 16 }}>Available</span>
        <span style={{ color: '#64748b', marginLeft: 16 }}>Locked</span>
        <span style={{ color: '#f59e0b', marginLeft: 16 }}>Researching</span>
        <span style={{ color: '#334155', marginLeft: 16, fontSize: 11 }}>
          Press R or click ✕ to close
        </span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  container: {
    background: 'rgba(8,14,28,0.95)',
    backdropFilter: 'blur(16px)',
    border: '1px solid rgba(91,156,246,0.2)',
    borderRadius: 10,
    padding: '0 20px 20px 20px',
    color: '#e2e8f0',
    fontFamily: "'Inter', system-ui, sans-serif",
    width: 900,
    maxWidth: '96vw',
    maxHeight: '90vh',
    overflowY: 'auto',
  },
  bannerWrap: {
    position: 'relative' as const,
    height: 200,
    margin: '0 -20px 16px -20px',
    overflow: 'hidden',
    borderRadius: '10px 10px 0 0',
  },
  bannerImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
    display: 'block',
    filter: 'brightness(0.5)',
  },
  bannerTitle: {
    position: 'absolute' as const,
    bottom: 16,
    left: 20,
    fontSize: 28,
    fontWeight: 600,
    letterSpacing: 2,
    color: '#e2e8f0',
    textShadow: '0 2px 16px rgba(0,0,0,0.8)',
    fontFamily: "'Inter', system-ui, sans-serif",
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    borderBottom: '1px solid rgba(91,156,246,0.15)',
    paddingBottom: 10,
  },
  title: {
    fontSize: 17,
    fontWeight: 600,
    color: '#5b9cf6',
  },
  mockBadge: {
    fontSize: 10,
    background: 'rgba(248,113,113,0.1)',
    color: '#f87171',
    border: '1px solid rgba(248,113,113,0.3)',
    padding: '2px 8px',
    borderRadius: 4,
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
  activeBar: {
    background: 'rgba(245,158,11,0.06)',
    border: '1px solid rgba(245,158,11,0.2)',
    borderRadius: 6,
    padding: '8px 12px',
    marginBottom: 12,
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  activeLabel: {
    color: '#f59e0b',
    fontSize: 12,
    fontWeight: 600,
    minWidth: 200,
  },
  progressTrack: {
    flex: 1,
    height: 6,
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 4,
    overflow: 'hidden',
    minWidth: 100,
  },
  progressFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #5b9cf6, #34d399)',
    transition: 'width 1s linear',
  },
  countdownText: {
    color: '#f59e0b',
    fontSize: 12,
    minWidth: 80,
    textAlign: 'right' as const,
  },
  body: {
    display: 'flex',
    gap: 20,
    minHeight: 400,
  },
  treeArea: {
    display: 'flex',
    gap: 12,
    flex: 1,
    overflowX: 'auto',
  },
  categoryColumn: {
    display: 'flex',
    flexDirection: 'column' as const,
    minWidth: 140,
  },
  categoryHeader: {
    textAlign: 'center' as const,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 1,
    borderBottom: '1px solid',
    paddingBottom: 6,
    marginBottom: 10,
  },
  techStack: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 12,
  },
  techNode: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    padding: '8px 6px',
    border: '1px solid',
    borderRadius: 6,
    cursor: 'pointer',
    fontFamily: "'Inter', system-ui, sans-serif",
    width: '100%',
    textAlign: 'center' as const,
    transition: 'all 0.15s ease',
  },
  techThumb: {
    width: 40,
    height: 40,
    objectFit: 'cover' as const,
    borderRadius: 4,
    marginBottom: 4,
    border: '1px solid rgba(91,156,246,0.2)',
  },
  nodeStatus: {
    fontSize: 9,
    letterSpacing: 1,
    marginBottom: 2,
    fontWeight: 600,
  },
  nodeName: {
    fontSize: 10,
    color: '#94a3b8',
    lineHeight: 1.3,
    marginBottom: 2,
  },
  nodeLevel: {
    fontSize: 11,
    fontWeight: 600,
  },
  detailPanel: {
    width: 260,
    minWidth: 240,
    borderLeft: '1px solid rgba(91,156,246,0.15)',
    paddingLeft: 16,
    flexShrink: 0,
  },
  detailName: {
    fontSize: 14,
    fontWeight: 600,
    color: '#5b9cf6',
    marginBottom: 6,
    lineHeight: 1.3,
  },
  detailStatus: {
    fontSize: 11,
    fontWeight: 600,
    marginBottom: 8,
  },
  detailDesc: {
    fontSize: 11,
    color: '#94a3b8',
    lineHeight: 1.5,
    marginBottom: 12,
    borderBottom: '1px solid rgba(91,156,246,0.12)',
    paddingBottom: 10,
  },
  detailSection: {
    fontSize: 10,
    color: '#5b9cf6',
    fontWeight: 600,
    letterSpacing: 1,
    marginBottom: 6,
    marginTop: 10,
    borderBottom: '1px solid rgba(91,156,246,0.12)',
    paddingBottom: 3,
  },
  prereqRow: {
    fontSize: 11,
    color: '#94a3b8',
    marginBottom: 3,
    paddingLeft: 8,
  },
  costGrid: {
    display: 'flex',
    gap: 8,
    marginTop: 4,
  },
  costItem: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    fontSize: 11,
    gap: 2,
  },
  researchBtn: {
    marginTop: 14,
    width: '100%',
    padding: '10px 0',
    background: 'rgba(91,156,246,0.12)',
    border: '1px solid rgba(91,156,246,0.3)',
    color: '#93c5fd',
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: 12,
    fontWeight: 600,
    borderRadius: 6,
    transition: 'all 0.15s',
  },
  queueNote: {
    marginTop: 8,
    fontSize: 10,
    color: '#f59e0b',
    fontStyle: 'italic',
  },
  errorMsg: {
    marginTop: 6,
    fontSize: 11,
    color: '#f87171',
    background: 'rgba(248,113,113,0.07)',
    border: '1px solid rgba(248,113,113,0.2)',
    padding: '4px 8px',
    borderRadius: 4,
  },
  queueItem: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 11,
    color: '#94a3b8',
    padding: '3px 0',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
  },
  selectHint: {
    color: '#334155',
    fontSize: 12,
    marginTop: 40,
    textAlign: 'center' as const,
    fontStyle: 'italic',
  },
  legend: {
    borderTop: '1px solid rgba(91,156,246,0.15)',
    paddingTop: 10,
    marginTop: 16,
    fontSize: 11,
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap' as const,
    gap: 4,
  },
}
