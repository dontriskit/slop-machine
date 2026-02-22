/**
 * FleetDispatch.tsx
 *
 * Fleet dispatch interface for Cosmic Protocol:
 * - Ship selector: checkboxes + quantity input for each ship type on planet
 * - Target coordinates: 3 inputs (galaxy:system:position)
 * - Mission type dropdown: attack, transport, deploy, espionage, colonize, harvest, expedition
 * - Speed slider: 10%-100% in 10% steps
 * - ETA display calculated from distance + speed + slowest ship
 * - Fuel cost display
 * - Cargo capacity display (for transport)
 * - "Launch" button -> POST /api/fleet/dispatch
 * - Active missions panel showing in-flight missions with countdown + recall button
 * - Keyboard shortcut 'F' for fleet (registered in App.tsx)
 * - Green retro-terminal HUD aesthetic
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { DEFAULT_PLANET_ID, DEFAULT_PLAYER_ID } from '../lib/config'
import { GameStore } from '../store/gameStore'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ShipType =
  | 'lightFighter'
  | 'heavyFighter'
  | 'cruiser'
  | 'battleship'
  | 'battlecruiser'
  | 'bomber'
  | 'destroyer'
  | 'deathstar'
  | 'smallCargo'
  | 'largeCargo'
  | 'colonyShip'
  | 'recycler'
  | 'espionageProbe'

type FleetMissionType =
  | 'attack'
  | 'transport'
  | 'deploy'
  | 'espionage'
  | 'colonize'
  | 'harvest'
  | 'expedition'

interface Ships {
  lightFighter: number
  heavyFighter: number
  cruiser: number
  battleship: number
  battlecruiser: number
  bomber: number
  destroyer: number
  deathstar: number
  smallCargo: number
  largeCargo: number
  colonyShip: number
  recycler: number
  espionageProbe: number
}

interface Coordinate {
  galaxy: number
  system: number
  position: number
}

interface Resources {
  metal: number
  crystal: number
  deuterium: number
}

interface FleetMission {
  id: string
  playerId: string
  planetIdFrom: string
  planetIdTo: string | null
  sourceCoordinate: Coordinate
  targetCoordinate: Coordinate
  missionType: FleetMissionType | 'return'
  missionStatus: string
  timeDeparture: number
  timeArrival: number
  speedPercent: number
  resources: Resources
  ships: Ships
  fuelConsumed: number
  createdAt: number
}

// ---------------------------------------------------------------------------
// Constants (mirrors worker/src/game/formulas.ts)
// ---------------------------------------------------------------------------

const SHIP_SPEEDS: Record<ShipType, number> = {
  lightFighter: 12500,
  heavyFighter: 10000,
  cruiser: 15000,
  battleship: 10000,
  battlecruiser: 10000,
  bomber: 5000,
  destroyer: 5000,
  deathstar: 100,
  smallCargo: 20000,
  largeCargo: 5000,
  colonyShip: 2500,
  recycler: 2000,
  espionageProbe: 100000000,
}

const SHIP_FUEL: Record<ShipType, number> = {
  lightFighter: 20,
  heavyFighter: 50,
  cruiser: 48,
  battleship: 500,
  battlecruiser: 250,
  bomber: 100,
  destroyer: 1000,
  deathstar: 1,
  smallCargo: 10,
  largeCargo: 50,
  colonyShip: 100,
  recycler: 20,
  espionageProbe: 1,
}

const SHIP_CARGO: Record<ShipType, number> = {
  lightFighter: 0,
  heavyFighter: 0,
  cruiser: 0,
  battleship: 0,
  battlecruiser: 0,
  bomber: 0,
  destroyer: 0,
  deathstar: 0,
  smallCargo: 5000,
  largeCargo: 25000,
  colonyShip: 7500,
  recycler: 20000,
  espionageProbe: 0,
}

const SHIP_NAMES: Record<ShipType, string> = {
  lightFighter: 'Light Fighter',
  heavyFighter: 'Heavy Fighter',
  cruiser: 'Cruiser',
  battleship: 'Battleship',
  battlecruiser: 'Battlecruiser',
  bomber: 'Bomber',
  destroyer: 'Destroyer',
  deathstar: 'Deathstar',
  smallCargo: 'Small Cargo',
  largeCargo: 'Large Cargo',
  colonyShip: 'Colony Ship',
  recycler: 'Recycler',
  espionageProbe: 'Espionage Probe',
}

const SHIP_ORDER: ShipType[] = [
  'lightFighter', 'heavyFighter', 'cruiser', 'battleship', 'battlecruiser',
  'bomber', 'destroyer', 'deathstar',
  'smallCargo', 'largeCargo', 'colonyShip', 'recycler', 'espionageProbe',
]

const MISSION_NAMES: Record<FleetMissionType, string> = {
  attack: 'Attack',
  transport: 'Transport',
  deploy: 'Deploy',
  espionage: 'Espionage',
  colonize: 'Colonize',
  harvest: 'Harvest',
  expedition: 'Expedition',
}

const MISSION_TYPES: FleetMissionType[] = [
  'attack', 'transport', 'deploy', 'espionage', 'colonize', 'harvest', 'expedition',
]

// ---------------------------------------------------------------------------
// Formula helpers (mirrors worker/src/game/formulas.ts)
// ---------------------------------------------------------------------------

function calculateDistance(from: Coordinate, to: Coordinate): number {
  if (from.galaxy !== to.galaxy) {
    const diff1 = Math.abs(from.galaxy - to.galaxy)
    const diff2 = Math.abs(diff1 - 9) // 9 galaxies
    return Math.min(diff1, diff2) * 20000
  }
  if (from.system !== to.system) {
    const diff1 = Math.abs(from.system - to.system)
    const diff2 = Math.abs(diff1 - 499)
    const distance = Math.max(Math.min(diff1, diff2), 1)
    return 2700 + distance * 19 * 5
  }
  if (from.position !== to.position) {
    return 1000 + Math.abs(from.position - to.position) * 5
  }
  return 5
}

function getSlowestSpeed(ships: Partial<Record<ShipType, number>>): number {
  let slowest = Infinity
  for (const [key, count] of Object.entries(ships)) {
    if (count && count > 0) {
      slowest = Math.min(slowest, SHIP_SPEEDS[key as ShipType])
    }
  }
  return slowest === Infinity ? 35000 : slowest
}

function calculateDuration(
  distance: number,
  slowestSpeed: number,
  speedPercent: number = 100,
  fleetSpeed: number = 1.0,
): number {
  const numerator = (35000 / speedPercent) * Math.sqrt((distance * 10) / slowestSpeed) + 10
  return Math.max(Math.round(numerator / fleetSpeed), 1)
}

function calculateFuelConsumption(
  ships: Partial<Record<ShipType, number>>,
  distance: number,
  duration: number,
  fleetSpeed: number = 1.0,
): number {
  const speedValue = Math.max(0.5, duration * fleetSpeed - 10)
  let consumption = 0

  for (const [key, count] of Object.entries(ships)) {
    if (count && count > 0) {
      const fuel = SHIP_FUEL[key as ShipType]
      const speed = SHIP_SPEEDS[key as ShipType]
      const shipSpeedValue = (35000 / speedValue) * Math.sqrt((distance * 10) / speed)
      const shipConsumption = Math.max(
        fuel * count * ((distance / 35000) * Math.pow(shipSpeedValue / 10 + 1, 2)),
        1,
      ) / count
      consumption += Math.max(shipConsumption * count, 1)
    }
  }

  return Math.round(consumption)
}

function calculateCargoCapacity(ships: Partial<Record<ShipType, number>>): number {
  let capacity = 0
  for (const [key, count] of Object.entries(ships)) {
    if (count && count > 0) {
      capacity += SHIP_CARGO[key as ShipType] * count
    }
  }
  return capacity
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(Math.floor(n))
}

function fmtDuration(seconds: number): string {
  if (seconds <= 0) return '< 1s'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function fmtCountdown(targetUnixSec: number): string {
  const remaining = Math.max(0, targetUnixSec - Math.floor(Date.now() / 1000))
  if (remaining <= 0) return 'Arrived'
  return fmtDuration(remaining)
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function apiGetShips(planetId: string): Promise<Ships | null> {
  try {
    const res = await fetch(`/api/planet/${encodeURIComponent(planetId)}/state`)
    if (!res.ok) return null
    const data = await res.json()
    return data.ships ?? null
  } catch {
    return null
  }
}

async function apiDispatchFleet(params: {
  playerId: string
  planetIdFrom: string
  from: Coordinate
  to: Coordinate
  ships: Partial<Record<ShipType, number>>
  resources: Resources
  missionType: FleetMissionType
  speedPercent: number
}): Promise<{ success: boolean; error?: string; mission?: FleetMission }> {
  try {
    const res = await fetch('/api/fleet/dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerId: params.playerId,
        planetIdFrom: params.planetIdFrom,
        from: params.from,
        to: params.to,
        ships: params.ships,
        resources: params.resources,
        missionType: params.missionType,
        speedPercent: params.speedPercent,
      }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
      return { success: false, error: body.error ?? `HTTP ${res.status}` }
    }
    const data = await res.json()
    return { success: true, mission: data }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Network error' }
  }
}

async function apiGetMissions(playerId: string): Promise<FleetMission[]> {
  try {
    const res = await fetch(`/api/fleet/missions?playerId=${encodeURIComponent(playerId)}`)
    if (!res.ok) return []
    const data = await res.json()
    return data.missions ?? data ?? []
  } catch {
    return []
  }
}

async function apiRecallMission(missionId: string, playerId: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/fleet/missions/${encodeURIComponent(missionId)}/recall`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId }),
    })
    return res.ok
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface FleetDispatchProps {
  onClose?: () => void
  planetId?: string
  playerId?: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function FleetDispatch({ onClose, planetId, playerId }: FleetDispatchProps) {
  const activePlanetId = GameStore((s) => s.activePlanetId)
  const storeResources = GameStore((s) => s.resources)
  const planetState = GameStore((s) => s.planetState)

  const pid = planetId ?? activePlanetId ?? DEFAULT_PLANET_ID
  const pId = playerId ?? DEFAULT_PLAYER_ID

  // Parse source coordinate from planet ID (format "g:s:p")
  const sourceCoord = useMemo<Coordinate>(() => {
    if (planetState?.coordinate) return planetState.coordinate
    const parts = pid.split(':').map(Number)
    if (parts.length === 3 && parts.every((n) => !isNaN(n))) {
      return { galaxy: parts[0], system: parts[1], position: parts[2] }
    }
    return { galaxy: 1, system: 1, position: 1 }
  }, [pid, planetState])

  // Ship selection
  const [availableShips, setAvailableShips] = useState<Ships | null>(null)
  const [selectedShips, setSelectedShips] = useState<Partial<Record<ShipType, number>>>({})
  const [checkedShips, setCheckedShips] = useState<Partial<Record<ShipType, boolean>>>({})

  // Target coordinates
  const [targetGalaxy, setTargetGalaxy] = useState(1)
  const [targetSystem, setTargetSystem] = useState(1)
  const [targetPosition, setTargetPosition] = useState(1)

  // Mission configuration
  const [missionType, setMissionType] = useState<FleetMissionType>('attack')
  const [speedPercent, setSpeedPercent] = useState(100)

  // Resources to carry (for transport/deploy)
  const [cargoMetal, setCargoMetal] = useState(0)
  const [cargoCrystal, setCargoCrystal] = useState(0)
  const [cargoDeuterium, setCargoDeuterium] = useState(0)

  // Active missions
  const [missions, setMissions] = useState<FleetMission[]>([])

  // UI state
  const [loading, setLoading] = useState(false)
  const [launching, setLaunching] = useState(false)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const [statusType, setStatusType] = useState<'success' | 'error' | 'info'>('info')
  const [tick, setTick] = useState(0)
  const [activeTab, setActiveTab] = useState<'dispatch' | 'missions'>('dispatch')

  // Countdown ticker (1 second intervals)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  // Load available ships and active missions
  const loadData = useCallback(async () => {
    setLoading(true)
    const [ships, missionData] = await Promise.all([
      apiGetShips(pid),
      apiGetMissions(pId),
    ])
    if (ships) setAvailableShips(ships)
    setMissions(missionData)
    setLoading(false)
  }, [pid, pId])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Refresh missions periodically
  useEffect(() => {
    const id = setInterval(async () => {
      const m = await apiGetMissions(pId)
      setMissions(m)
    }, 10000)
    return () => clearInterval(id)
  }, [pId])

  // ---------- Computed values ----------

  const targetCoord: Coordinate = { galaxy: targetGalaxy, system: targetSystem, position: targetPosition }

  const totalSelectedShips = useMemo(() => {
    let total = 0
    for (const [, count] of Object.entries(selectedShips)) {
      if (count && count > 0) total += count
    }
    return total
  }, [selectedShips])

  const distance = useMemo(
    () => calculateDistance(sourceCoord, targetCoord),
    [sourceCoord, targetCoord],
  )

  const slowestSpeed = useMemo(
    () => getSlowestSpeed(selectedShips),
    [selectedShips],
  )

  const durationSeconds = useMemo(
    () => (totalSelectedShips > 0 ? calculateDuration(distance, slowestSpeed, speedPercent) : 0),
    [distance, slowestSpeed, speedPercent, totalSelectedShips],
  )

  const fuelCost = useMemo(
    () => (totalSelectedShips > 0 ? calculateFuelConsumption(selectedShips, distance, durationSeconds) : 0),
    [selectedShips, distance, durationSeconds, totalSelectedShips],
  )

  const cargoCapacity = useMemo(
    () => calculateCargoCapacity(selectedShips),
    [selectedShips],
  )

  const totalCargo = cargoMetal + cargoCrystal + cargoDeuterium

  const canLaunch = useMemo(() => {
    if (totalSelectedShips === 0) return false
    if (targetGalaxy < 1 || targetGalaxy > 9) return false
    if (targetSystem < 1 || targetSystem > 499) return false
    if (targetPosition < 1 || targetPosition > 16) return false
    if (storeResources.deuterium < fuelCost) return false
    if (totalCargo > cargoCapacity) return false
    // Cannot send to same location (except for expedition which goes to pos 16)
    if (missionType === 'expedition') {
      // Expedition always targets position 16
    } else if (
      targetGalaxy === sourceCoord.galaxy &&
      targetSystem === sourceCoord.system &&
      targetPosition === sourceCoord.position
    ) {
      return false
    }
    return true
  }, [
    totalSelectedShips, targetGalaxy, targetSystem, targetPosition,
    storeResources, fuelCost, totalCargo, cargoCapacity, missionType, sourceCoord,
  ])

  // ---------- Handlers ----------

  function showStatus(msg: string, type: 'success' | 'error' | 'info' = 'info') {
    setStatusMsg(msg)
    setStatusType(type)
    setTimeout(() => setStatusMsg(null), 5000)
  }

  function toggleShip(shipType: ShipType) {
    const wasChecked = checkedShips[shipType] ?? false
    setCheckedShips((prev) => ({ ...prev, [shipType]: !wasChecked }))
    if (wasChecked) {
      setSelectedShips((prev) => {
        const next = { ...prev }
        delete next[shipType]
        return next
      })
    } else {
      // Default to max available
      const maxCount = availableShips ? availableShips[shipType] : 0
      if (maxCount > 0) {
        setSelectedShips((prev) => ({ ...prev, [shipType]: maxCount }))
      }
    }
  }

  function setShipCount(shipType: ShipType, count: number) {
    const maxCount = availableShips ? availableShips[shipType] : 0
    const clamped = Math.max(0, Math.min(maxCount, count))
    if (clamped === 0) {
      setCheckedShips((prev) => ({ ...prev, [shipType]: false }))
      setSelectedShips((prev) => {
        const next = { ...prev }
        delete next[shipType]
        return next
      })
    } else {
      setCheckedShips((prev) => ({ ...prev, [shipType]: true }))
      setSelectedShips((prev) => ({ ...prev, [shipType]: clamped }))
    }
  }

  function selectAll() {
    if (!availableShips) return
    const newChecked: Partial<Record<ShipType, boolean>> = {}
    const newSelected: Partial<Record<ShipType, number>> = {}
    for (const shipType of SHIP_ORDER) {
      const count = availableShips[shipType]
      if (count > 0) {
        newChecked[shipType] = true
        newSelected[shipType] = count
      }
    }
    setCheckedShips(newChecked)
    setSelectedShips(newSelected)
  }

  function selectNone() {
    setCheckedShips({})
    setSelectedShips({})
  }

  async function handleLaunch() {
    if (!canLaunch) return

    // Auto-set position 16 for expeditions
    const finalTarget: Coordinate = missionType === 'expedition'
      ? { galaxy: targetGalaxy, system: targetSystem, position: 16 }
      : targetCoord

    setLaunching(true)
    const result = await apiDispatchFleet({
      playerId: pId,
      planetIdFrom: pid,
      from: sourceCoord,
      to: finalTarget,
      ships: selectedShips,
      resources: { metal: cargoMetal, crystal: cargoCrystal, deuterium: cargoDeuterium },
      missionType,
      speedPercent,
    })
    setLaunching(false)

    if (result.success) {
      showStatus(`Fleet dispatched! Mission: ${MISSION_NAMES[missionType]}`, 'success')
      // Reset selection
      setCheckedShips({})
      setSelectedShips({})
      setCargoMetal(0)
      setCargoCrystal(0)
      setCargoDeuterium(0)
      // Refresh data
      loadData()
    } else {
      showStatus(`Launch failed: ${result.error}`, 'error')
    }
  }

  async function handleRecall(missionId: string) {
    const ok = await apiRecallMission(missionId, pId)
    if (ok) {
      showStatus('Fleet recalled.', 'success')
      loadData()
    } else {
      showStatus('Recall failed.', 'error')
    }
  }

  // Force re-render for countdown — suppress unused warning
  void tick

  // Filter active (non-completed) missions
  const activeMissions = missions.filter(
    (m) => m.missionStatus !== 'completed' && m.missionStatus !== 'canceled',
  )

  // ---------- Render ----------

  return (
    <div style={s.container}>
      {/* Header */}
      <div style={s.header}>
        <span style={s.title}>// FLEET DISPATCH</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={s.coordBadge}>
            [{sourceCoord.galaxy}:{sourceCoord.system}:{sourceCoord.position}]
          </span>
          {onClose && (
            <button style={s.closeBtn} onClick={onClose}>[X]</button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={s.tabBar}>
        <button
          style={{ ...s.tabBtn, ...(activeTab === 'dispatch' ? s.tabBtnActive : {}) }}
          onClick={() => setActiveTab('dispatch')}
        >
          DISPATCH
        </button>
        <button
          style={{ ...s.tabBtn, ...(activeTab === 'missions' ? s.tabBtnActive : {}) }}
          onClick={() => setActiveTab('missions')}
        >
          ACTIVE MISSIONS ({activeMissions.length})
        </button>
      </div>

      {/* Status message */}
      {statusMsg && (
        <div style={{
          ...s.statusMsg,
          color: statusType === 'error' ? '#ff4444' : statusType === 'success' ? '#00ff00' : '#ffff00',
          borderColor: statusType === 'error' ? '#ff444433' : statusType === 'success' ? '#00ff0033' : '#ffff0033',
        }}>
          {statusMsg}
        </div>
      )}

      {/* Dispatch Tab */}
      {activeTab === 'dispatch' && (
        <div style={s.body}>
          {/* Left column: Ship selector */}
          <div style={s.leftCol}>
            <div style={s.sectionHeader}>
              <span style={s.sectionLabel}>SELECT SHIPS</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button style={s.miniBtn} onClick={selectAll}>All</button>
                <button style={s.miniBtn} onClick={selectNone}>None</button>
              </div>
            </div>

            {loading ? (
              <div style={s.loadingMsg}>Loading fleet data...</div>
            ) : (
              <div style={s.shipList}>
                {SHIP_ORDER.map((shipType) => {
                  const available = availableShips ? availableShips[shipType] : 0
                  const isChecked = checkedShips[shipType] ?? false
                  const count = selectedShips[shipType] ?? 0

                  return (
                    <div
                      key={shipType}
                      style={{
                        ...s.shipRow,
                        ...(available === 0 ? s.shipRowDisabled : {}),
                        ...(isChecked ? s.shipRowSelected : {}),
                      }}
                    >
                      {/* Checkbox */}
                      <input
                        type="checkbox"
                        checked={isChecked}
                        disabled={available === 0}
                        onChange={() => toggleShip(shipType)}
                        style={s.checkbox}
                      />

                      {/* Ship name + available count */}
                      <div style={s.shipInfo}>
                        <span style={s.shipName}>{SHIP_NAMES[shipType]}</span>
                        <span style={s.shipAvailable}>({available})</span>
                      </div>

                      {/* Ship stats */}
                      <div style={s.shipStats}>
                        <span style={s.statSpeed} title="Speed">
                          {fmt(SHIP_SPEEDS[shipType])}
                        </span>
                        {SHIP_CARGO[shipType] > 0 && (
                          <span style={s.statCargo} title="Cargo capacity">
                            {fmt(SHIP_CARGO[shipType])}
                          </span>
                        )}
                      </div>

                      {/* Quantity input */}
                      {available > 0 && (
                        <div style={s.qtyGroup}>
                          <input
                            type="number"
                            min={0}
                            max={available}
                            value={isChecked ? count : 0}
                            onChange={(e) => setShipCount(shipType, parseInt(e.target.value) || 0)}
                            style={s.qtyInput}
                          />
                          <button
                            style={s.maxBtn}
                            onClick={() => setShipCount(shipType, available)}
                            title="Select max"
                          >
                            MAX
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Right column: Mission config + stats */}
          <div style={s.rightCol}>
            {/* Target coordinates */}
            <div style={s.configSection}>
              <div style={s.sectionLabel}>TARGET COORDINATES</div>
              <div style={s.coordInputRow}>
                <div style={s.coordGroup}>
                  <label style={s.coordLabel}>Galaxy</label>
                  <input
                    type="number"
                    min={1}
                    max={9}
                    value={targetGalaxy}
                    onChange={(e) => setTargetGalaxy(Math.max(1, Math.min(9, parseInt(e.target.value) || 1)))}
                    style={s.coordInput}
                  />
                </div>
                <span style={s.coordSep}>:</span>
                <div style={s.coordGroup}>
                  <label style={s.coordLabel}>System</label>
                  <input
                    type="number"
                    min={1}
                    max={499}
                    value={targetSystem}
                    onChange={(e) => setTargetSystem(Math.max(1, Math.min(499, parseInt(e.target.value) || 1)))}
                    style={s.coordInput}
                  />
                </div>
                <span style={s.coordSep}>:</span>
                <div style={s.coordGroup}>
                  <label style={s.coordLabel}>Position</label>
                  <input
                    type="number"
                    min={1}
                    max={16}
                    value={targetPosition}
                    onChange={(e) => setTargetPosition(Math.max(1, Math.min(16, parseInt(e.target.value) || 1)))}
                    style={s.coordInput}
                  />
                </div>
              </div>
            </div>

            {/* Mission type */}
            <div style={s.configSection}>
              <div style={s.sectionLabel}>MISSION TYPE</div>
              <select
                value={missionType}
                onChange={(e) => setMissionType(e.target.value as FleetMissionType)}
                style={s.missionSelect}
              >
                {MISSION_TYPES.map((mt) => (
                  <option key={mt} value={mt}>{MISSION_NAMES[mt]}</option>
                ))}
              </select>
            </div>

            {/* Speed slider */}
            <div style={s.configSection}>
              <div style={s.sectionLabel}>FLEET SPEED</div>
              <div style={s.speedRow}>
                <input
                  type="range"
                  min={10}
                  max={100}
                  step={10}
                  value={speedPercent}
                  onChange={(e) => setSpeedPercent(parseInt(e.target.value))}
                  style={s.speedSlider}
                />
                <span style={s.speedValue}>{speedPercent}%</span>
              </div>
              <div style={s.speedTicks}>
                {Array.from({ length: 10 }, (_, i) => (i + 1) * 10).map((v) => (
                  <span
                    key={v}
                    style={{
                      ...s.speedTick,
                      color: v <= speedPercent ? '#00ff00' : '#333',
                    }}
                  >
                    {v}
                  </span>
                ))}
              </div>
            </div>

            {/* Cargo (for transport/deploy) */}
            {(missionType === 'transport' || missionType === 'deploy') && (
              <div style={s.configSection}>
                <div style={s.sectionLabel}>CARGO ({fmt(totalCargo)} / {fmt(cargoCapacity)})</div>
                <div style={s.cargoInputs}>
                  <div style={s.cargoRow}>
                    <span style={s.cargoIcon}>Fe</span>
                    <input
                      type="number"
                      min={0}
                      value={cargoMetal}
                      onChange={(e) => setCargoMetal(Math.max(0, parseInt(e.target.value) || 0))}
                      style={s.cargoInput}
                    />
                  </div>
                  <div style={s.cargoRow}>
                    <span style={{ ...s.cargoIcon, color: '#64b4ff' }}>Si</span>
                    <input
                      type="number"
                      min={0}
                      value={cargoCrystal}
                      onChange={(e) => setCargoCrystal(Math.max(0, parseInt(e.target.value) || 0))}
                      style={s.cargoInput}
                    />
                  </div>
                  <div style={s.cargoRow}>
                    <span style={{ ...s.cargoIcon, color: '#80ffb0' }}>D</span>
                    <input
                      type="number"
                      min={0}
                      value={cargoDeuterium}
                      onChange={(e) => setCargoDeuterium(Math.max(0, parseInt(e.target.value) || 0))}
                      style={s.cargoInput}
                    />
                  </div>
                  {totalCargo > cargoCapacity && (
                    <div style={s.cargoWarn}>Exceeds cargo capacity!</div>
                  )}
                </div>
              </div>
            )}

            {/* Flight stats */}
            <div style={s.statsBox}>
              <div style={s.sectionLabel}>FLIGHT STATS</div>
              <div style={s.statRow}>
                <span style={s.statLabel}>Ships:</span>
                <span style={s.statValue}>{totalSelectedShips}</span>
              </div>
              <div style={s.statRow}>
                <span style={s.statLabel}>Distance:</span>
                <span style={s.statValue}>{fmt(distance)} units</span>
              </div>
              <div style={s.statRow}>
                <span style={s.statLabel}>Slowest ship:</span>
                <span style={s.statValue}>
                  {totalSelectedShips > 0 ? fmt(slowestSpeed) + '/h' : '--'}
                </span>
              </div>
              <div style={{ ...s.statRow, ...s.statHighlight }}>
                <span style={s.statLabel}>ETA:</span>
                <span style={{ ...s.statValue, color: '#ffff00' }}>
                  {totalSelectedShips > 0 ? fmtDuration(durationSeconds) : '--'}
                </span>
              </div>
              <div style={{ ...s.statRow, ...s.statHighlight }}>
                <span style={s.statLabel}>Fuel cost:</span>
                <span style={{
                  ...s.statValue,
                  color: storeResources.deuterium >= fuelCost ? '#80ffb0' : '#ff4444',
                }}>
                  {totalSelectedShips > 0 ? fmt(fuelCost) + ' D' : '--'}
                </span>
              </div>
              <div style={s.statRow}>
                <span style={s.statLabel}>Cargo cap:</span>
                <span style={s.statValue}>
                  {cargoCapacity > 0 ? fmt(cargoCapacity) : '--'}
                </span>
              </div>
            </div>

            {/* Launch button */}
            <button
              style={{
                ...s.launchBtn,
                ...((!canLaunch || launching) ? s.launchBtnDisabled : {}),
              }}
              onClick={handleLaunch}
              disabled={!canLaunch || launching}
            >
              {launching ? '[ DISPATCHING... ]' : '[ LAUNCH FLEET ]'}
            </button>

            {/* Fuel warning */}
            {totalSelectedShips > 0 && storeResources.deuterium < fuelCost && (
              <div style={s.fuelWarn}>
                Insufficient deuterium! Need {fmt(fuelCost)}, have {fmt(storeResources.deuterium)}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Missions Tab */}
      {activeTab === 'missions' && (
        <div style={s.missionsBody}>
          <div style={s.sectionHeader}>
            <span style={s.sectionLabel}>ACTIVE FLEET MISSIONS</span>
            <button style={s.miniBtn} onClick={loadData}>Refresh</button>
          </div>

          {activeMissions.length === 0 ? (
            <div style={s.emptyState}>No active fleet missions.</div>
          ) : (
            <div style={s.missionList}>
              {activeMissions.map((mission) => {
                const isOutbound = mission.missionStatus === 'dispatched' || mission.missionStatus === 'in_transit'
                const isReturning = mission.missionStatus === 'returning'
                const arrivalTime = mission.timeArrival
                const countdown = fmtCountdown(arrivalTime)
                const progressPct = Math.min(
                  100,
                  Math.max(
                    0,
                    ((Date.now() / 1000 - mission.timeDeparture) /
                      Math.max(1, arrivalTime - mission.timeDeparture)) *
                      100,
                  ),
                )

                // Count total ships in mission
                let missionShipCount = 0
                if (mission.ships) {
                  for (const [, c] of Object.entries(mission.ships)) {
                    if (typeof c === 'number') missionShipCount += c
                  }
                }

                const missionTypeName = MISSION_NAMES[mission.missionType as FleetMissionType] ?? mission.missionType

                return (
                  <div key={mission.id} style={s.missionCard}>
                    <div style={s.missionHeader}>
                      <span style={{
                        ...s.missionType,
                        color: isReturning ? '#ffff00' : '#00ffff',
                      }}>
                        {isReturning ? 'RETURN' : missionTypeName.toUpperCase()}
                      </span>
                      <span style={s.missionStatus}>
                        {mission.missionStatus}
                      </span>
                    </div>

                    <div style={s.missionRoute}>
                      <span style={s.missionCoord}>
                        [{mission.sourceCoordinate?.galaxy ?? '?'}:
                        {mission.sourceCoordinate?.system ?? '?'}:
                        {mission.sourceCoordinate?.position ?? '?'}]
                      </span>
                      <span style={s.missionArrow}>
                        {isReturning ? ' <<< ' : ' >>> '}
                      </span>
                      <span style={s.missionCoord}>
                        [{mission.targetCoordinate?.galaxy ?? '?'}:
                        {mission.targetCoordinate?.system ?? '?'}:
                        {mission.targetCoordinate?.position ?? '?'}]
                      </span>
                    </div>

                    <div style={s.missionDetails}>
                      <span style={s.missionShips}>{missionShipCount} ships</span>
                      <span style={s.missionFuel}>Fuel: {fmt(mission.fuelConsumed)} D</span>
                      <span style={s.missionSpeed}>{mission.speedPercent}% speed</span>
                    </div>

                    {/* Carried resources */}
                    {mission.resources && (mission.resources.metal > 0 || mission.resources.crystal > 0 || mission.resources.deuterium > 0) && (
                      <div style={s.missionCargo}>
                        {mission.resources.metal > 0 && <span style={s.cargoTagMetal}>Fe {fmt(mission.resources.metal)}</span>}
                        {mission.resources.crystal > 0 && <span style={s.cargoTagCrystal}>Si {fmt(mission.resources.crystal)}</span>}
                        {mission.resources.deuterium > 0 && <span style={s.cargoTagDeut}>D {fmt(mission.resources.deuterium)}</span>}
                      </div>
                    )}

                    {/* Progress bar */}
                    <div style={s.progressBarWrap}>
                      <div
                        style={{
                          ...s.progressBar,
                          width: `${progressPct}%`,
                          background: isReturning ? '#ffff00' : '#00ff00',
                          boxShadow: isReturning ? '0 0 6px #ffff00' : '0 0 6px #00ff00',
                        }}
                      />
                    </div>

                    {/* Countdown + recall */}
                    <div style={s.missionFooter}>
                      <span style={s.missionCountdown}>{countdown}</span>
                      {isOutbound && (
                        <button
                          style={s.recallBtn}
                          onClick={() => handleRecall(mission.id)}
                        >
                          RECALL
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Styles — green retro-terminal matching HUD.tsx / ShipyardPanel.tsx
// ---------------------------------------------------------------------------

const s: Record<string, React.CSSProperties> = {
  container: {
    background: 'rgba(0, 8, 20, 0.97)',
    border: '2px solid #00ff00',
    borderRadius: 4,
    color: '#00ff00',
    fontFamily: "'Courier New', monospace",
    fontSize: 13,
    boxShadow: '0 0 20px rgba(0, 255, 0, 0.3)',
    width: 960,
    maxWidth: '95vw',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    textShadow: '0 0 6px #00ff00',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 16px',
    borderBottom: '1px solid #00ff0033',
    flexShrink: 0,
  },
  title: {
    fontWeight: 'bold',
    fontSize: 14,
    letterSpacing: 2,
    textShadow: '0 0 10px #00ff00',
    color: '#ffff00',
  },
  coordBadge: {
    fontSize: 11,
    color: '#00ffff',
    border: '1px solid #00ffff44',
    borderRadius: 2,
    padding: '1px 6px',
    textShadow: '0 0 4px #00ffff',
  },
  closeBtn: {
    background: 'transparent',
    border: '1px solid #ff4444',
    color: '#ff4444',
    cursor: 'pointer',
    fontFamily: "'Courier New', monospace",
    fontSize: 12,
    padding: '2px 8px',
    borderRadius: 2,
    textShadow: 'none',
  },

  // Tabs
  tabBar: {
    display: 'flex',
    borderBottom: '1px solid #00ff0033',
    flexShrink: 0,
  },
  tabBtn: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    borderBottom: '2px solid transparent',
    color: '#006600',
    cursor: 'pointer',
    fontFamily: "'Courier New', monospace",
    fontSize: 12,
    letterSpacing: 1,
    padding: '8px 16px',
    transition: 'all 0.2s',
    textShadow: 'none',
  },
  tabBtnActive: {
    color: '#00ff00',
    borderBottomColor: '#00ff00',
    textShadow: '0 0 6px #00ff00',
  },

  // Status
  statusMsg: {
    padding: '6px 16px',
    fontSize: 12,
    borderBottom: '1px solid',
    flexShrink: 0,
    textShadow: 'none',
  },

  // Body
  body: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
    gap: 0,
  },

  // Left column: ship selector
  leftCol: {
    flex: 1,
    overflowY: 'auto',
    padding: 14,
    borderRight: '1px solid #00ff0022',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  sectionLabel: {
    color: '#006600',
    fontSize: 10,
    letterSpacing: 2,
    textShadow: 'none',
  },
  miniBtn: {
    background: 'rgba(0,255,0,0.08)',
    border: '1px solid #00ff0044',
    color: '#00ff00',
    cursor: 'pointer',
    fontFamily: "'Courier New', monospace",
    fontSize: 10,
    padding: '2px 8px',
    borderRadius: 2,
    textShadow: 'none',
  },
  loadingMsg: {
    color: '#006600',
    textAlign: 'center',
    padding: 30,
  },

  // Ship list
  shipList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
  },
  shipRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '5px 8px',
    border: '1px solid #00ff0015',
    borderRadius: 3,
    background: 'rgba(0,255,0,0.01)',
    transition: 'border-color 0.15s',
  },
  shipRowDisabled: {
    opacity: 0.35,
  },
  shipRowSelected: {
    borderColor: '#00ffff44',
    background: 'rgba(0,255,255,0.04)',
  },
  checkbox: {
    accentColor: '#00ff00',
    cursor: 'pointer',
    width: 14,
    height: 14,
    flexShrink: 0,
  },
  shipInfo: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  shipName: {
    color: '#00ffff',
    fontSize: 12,
    fontWeight: 'bold',
    textShadow: '0 0 4px #00ffff',
    whiteSpace: 'nowrap',
  },
  shipAvailable: {
    color: '#006600',
    fontSize: 10,
    textShadow: 'none',
  },
  shipStats: {
    display: 'flex',
    gap: 6,
    flexShrink: 0,
  },
  statSpeed: {
    color: '#555',
    fontSize: 10,
    textShadow: 'none',
  },
  statCargo: {
    color: '#554400',
    fontSize: 10,
    textShadow: 'none',
  },
  qtyGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 3,
    flexShrink: 0,
  },
  qtyInput: {
    background: 'rgba(0,8,0,0.8)',
    border: '1px solid #006600',
    color: '#00ff00',
    fontFamily: "'Courier New', monospace",
    fontSize: 12,
    width: 56,
    textAlign: 'center',
    borderRadius: 2,
    outline: 'none',
    padding: '3px 4px',
    textShadow: 'none',
  },
  maxBtn: {
    background: 'rgba(0,255,0,0.08)',
    border: '1px solid #00ff0044',
    color: '#006600',
    cursor: 'pointer',
    fontFamily: "'Courier New', monospace",
    fontSize: 9,
    padding: '3px 5px',
    borderRadius: 2,
    textShadow: 'none',
  },

  // Right column
  rightCol: {
    width: 310,
    flexShrink: 0,
    padding: 14,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    overflowY: 'auto',
  },

  // Config sections
  configSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },

  // Coordinate inputs
  coordInputRow: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: 4,
  },
  coordGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    flex: 1,
  },
  coordLabel: {
    color: '#006600',
    fontSize: 9,
    letterSpacing: 1,
    textShadow: 'none',
  },
  coordInput: {
    background: 'rgba(0,8,0,0.8)',
    border: '1px solid #006600',
    color: '#00ffff',
    fontFamily: "'Courier New', monospace",
    fontSize: 14,
    textAlign: 'center',
    borderRadius: 2,
    outline: 'none',
    padding: '4px 6px',
    width: '100%',
    textShadow: '0 0 4px #00ffff',
    boxSizing: 'border-box',
  },
  coordSep: {
    color: '#006600',
    fontSize: 18,
    paddingBottom: 4,
    textShadow: 'none',
  },

  // Mission select
  missionSelect: {
    background: 'rgba(0,8,0,0.8)',
    border: '1px solid #006600',
    color: '#00ff00',
    fontFamily: "'Courier New', monospace",
    fontSize: 13,
    padding: '6px 8px',
    borderRadius: 2,
    outline: 'none',
    cursor: 'pointer',
    textShadow: 'none',
    width: '100%',
    appearance: 'auto',
  },

  // Speed slider
  speedRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  speedSlider: {
    flex: 1,
    accentColor: '#00ff00',
    cursor: 'pointer',
    height: 4,
  },
  speedValue: {
    color: '#ffff00',
    fontWeight: 'bold',
    fontSize: 14,
    minWidth: 40,
    textAlign: 'right',
    textShadow: '0 0 6px #ffff00',
  },
  speedTicks: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '0 2px',
  },
  speedTick: {
    fontSize: 8,
    textShadow: 'none',
  },

  // Cargo inputs
  cargoInputs: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  cargoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  cargoIcon: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 22,
    height: 22,
    borderRadius: 3,
    fontSize: 10,
    fontWeight: 'bold',
    background: 'rgba(160,160,160,0.2)',
    border: '1px solid #555',
    color: '#e0e0e0',
    textShadow: 'none',
    flexShrink: 0,
  },
  cargoInput: {
    flex: 1,
    background: 'rgba(0,8,0,0.8)',
    border: '1px solid #006600',
    color: '#00ff00',
    fontFamily: "'Courier New', monospace",
    fontSize: 12,
    padding: '3px 6px',
    borderRadius: 2,
    outline: 'none',
    textShadow: 'none',
  },
  cargoWarn: {
    color: '#ff4444',
    fontSize: 10,
    textShadow: '0 0 4px #ff4444',
  },

  // Flight stats box
  statsBox: {
    border: '1px solid #00ff0033',
    borderRadius: 3,
    padding: '10px 12px',
    background: 'rgba(0,255,0,0.02)',
    display: 'flex',
    flexDirection: 'column',
    gap: 5,
  },
  statRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 12,
  },
  statHighlight: {
    padding: '2px 0',
  },
  statLabel: {
    color: '#006600',
    textShadow: 'none',
  },
  statValue: {
    color: '#00ffff',
    fontWeight: 'bold',
    textShadow: '0 0 4px #00ffff',
  },

  // Launch button
  launchBtn: {
    background: 'rgba(0,255,0,0.15)',
    border: '2px solid #00ff00',
    color: '#00ff00',
    cursor: 'pointer',
    fontFamily: "'Courier New', monospace",
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 3,
    padding: '10px 16px',
    borderRadius: 3,
    boxShadow: '0 0 15px rgba(0,255,0,0.3)',
    transition: 'all 0.2s',
    textShadow: '0 0 8px #00ff00',
    marginTop: 'auto',
  },
  launchBtnDisabled: {
    background: 'rgba(0,0,0,0.3)',
    border: '2px solid #333',
    color: '#444',
    cursor: 'not-allowed',
    boxShadow: 'none',
    textShadow: 'none',
  },
  fuelWarn: {
    color: '#ff4444',
    fontSize: 11,
    textAlign: 'center',
    textShadow: '0 0 4px #ff4444',
    marginTop: 4,
  },

  // Missions tab
  missionsBody: {
    flex: 1,
    padding: 14,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  emptyState: {
    color: '#444',
    fontSize: 13,
    textAlign: 'center',
    padding: '40px 0',
    textShadow: 'none',
  },
  missionList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  missionCard: {
    border: '1px solid #00ff0033',
    borderRadius: 3,
    padding: '10px 14px',
    background: 'rgba(0,255,0,0.02)',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  missionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  missionType: {
    fontWeight: 'bold',
    fontSize: 13,
    letterSpacing: 1,
  },
  missionStatus: {
    fontSize: 10,
    color: '#006600',
    textShadow: 'none',
    border: '1px solid #00ff0022',
    borderRadius: 2,
    padding: '1px 6px',
  },
  missionRoute: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 12,
  },
  missionCoord: {
    color: '#00ffff',
    textShadow: '0 0 4px #00ffff',
  },
  missionArrow: {
    color: '#006600',
    textShadow: 'none',
  },
  missionDetails: {
    display: 'flex',
    gap: 12,
    fontSize: 11,
    color: '#006600',
    textShadow: 'none',
  },
  missionShips: {},
  missionFuel: {},
  missionSpeed: {},
  missionCargo: {
    display: 'flex',
    gap: 6,
    fontSize: 10,
  },
  cargoTagMetal: {
    color: '#a0a0a0',
    background: 'rgba(160,160,160,0.1)',
    padding: '1px 5px',
    borderRadius: 2,
    textShadow: 'none',
  },
  cargoTagCrystal: {
    color: '#64b4ff',
    background: 'rgba(100,180,255,0.1)',
    padding: '1px 5px',
    borderRadius: 2,
    textShadow: 'none',
  },
  cargoTagDeut: {
    color: '#80ffb0',
    background: 'rgba(0,200,100,0.1)',
    padding: '1px 5px',
    borderRadius: 2,
    textShadow: 'none',
  },
  progressBarWrap: {
    background: 'rgba(0,255,0,0.1)',
    borderRadius: 2,
    height: 4,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    transition: 'width 0.5s linear',
  },
  missionFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  missionCountdown: {
    color: '#ffff00',
    fontWeight: 'bold',
    fontSize: 13,
    textShadow: '0 0 6px #ffff00',
  },
  recallBtn: {
    background: 'rgba(255,68,68,0.1)',
    border: '1px solid #ff4444',
    color: '#ff4444',
    cursor: 'pointer',
    fontFamily: "'Courier New', monospace",
    fontSize: 10,
    letterSpacing: 1,
    padding: '3px 10px',
    borderRadius: 2,
    textShadow: 'none',
    transition: 'all 0.2s',
  },
}
