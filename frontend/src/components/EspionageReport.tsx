/**
 * EspionageReport.tsx
 *
 * Formatted espionage report viewer for Cosmic Protocol.
 * Displays:
 *   - Header: target player, coordinates, timestamp
 *   - Status: success/failure, detection chance, probes sent/lost
 *   - Resources section (always visible)
 *   - Fleet section (if info level >= 1)
 *   - Defenses section (if info level >= 2)
 *   - Buildings section (if info level >= 3)
 *   - Technologies section (if info level >= 4)
 *   - "Send Fleet" button that pre-fills fleet dispatch form
 *
 * Green retro-terminal aesthetic matching HUD.tsx / BattleReport.tsx.
 *
 * Fetches from GET /api/espionage/reports?player_id=X
 * or renders a single passed-in report directly.
 */

import { useState, useEffect, useCallback } from 'react'
import { DEFAULT_PLAYER_ID } from '../lib/config'

// ---------------------------------------------------------------------------
// Types (mirroring worker/src/game/services/espionageService.ts)
// ---------------------------------------------------------------------------

export enum InfoLevel {
  Resources = 0,
  Fleet = 1,
  Defenses = 2,
  Buildings = 3,
  Research = 4,
}

export interface Coordinate {
  galaxy: number
  system: number
  position: number
}

export interface Resources {
  metal: number
  crystal: number
  deuterium: number
}

export type ShipKey =
  | 'lightFighter'
  | 'heavyFighter'
  | 'cruiser'
  | 'battleship'
  | 'battlecruiser'
  | 'bomber'
  | 'destroyer'
  | 'deathStar'
  | 'smallCargo'
  | 'largeCargo'
  | 'colonyShip'
  | 'recycler'
  | 'espionageProbe'
  | 'solarSatellite'

export type DefenseKey =
  | 'rocketLauncher'
  | 'lightLaser'
  | 'heavyLaser'
  | 'gaussCannon'
  | 'ionCannon'
  | 'plasmaTurret'
  | 'smallShieldDome'
  | 'largeShieldDome'

export interface EspionageReport {
  id: string
  timestamp: number
  attackerId: string
  defenderId: string | null
  targetPlayerName: string
  targetCoordinate: Coordinate
  resources: Resources | null
  fleet: Partial<Record<ShipKey, number>> | null
  defenses: Partial<Record<DefenseKey, number>> | null
  buildings: Record<string, number> | null
  research: Record<string, number> | null
  counterChance: number
  probesLost: number
  probesSent: number
  infoLevel: InfoLevel
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

const SHIP_LABELS: Record<string, string> = {
  lightFighter:   'Light Fighter',
  heavyFighter:   'Heavy Fighter',
  cruiser:        'Cruiser',
  battleship:     'Battleship',
  battlecruiser:  'Battlecruiser',
  bomber:         'Bomber',
  destroyer:      'Destroyer',
  deathStar:      'Death Star',
  smallCargo:     'Small Cargo',
  largeCargo:     'Large Cargo',
  colonyShip:     'Colony Ship',
  recycler:       'Recycler',
  espionageProbe: 'Espionage Probe',
  solarSatellite: 'Solar Satellite',
}

const DEFENSE_LABELS: Record<string, string> = {
  rocketLauncher:  'Rocket Launcher',
  lightLaser:      'Light Laser',
  heavyLaser:      'Heavy Laser',
  gaussCannon:     'Gauss Cannon',
  ionCannon:       'Ion Cannon',
  plasmaTurret:    'Plasma Turret',
  smallShieldDome: 'Small Shield Dome',
  largeShieldDome: 'Large Shield Dome',
}

const BUILDING_LABELS: Record<string, string> = {
  metalMine:           'Metal Mine',
  crystalMine:         'Crystal Mine',
  deuteriumSynthesizer:'Deuterium Synthesizer',
  solarPlant:          'Solar Plant',
  fusionReactor:       'Fusion Reactor',
  roboticsFactory:     'Robotics Factory',
  naniteFactory:       'Nanite Factory',
  shipyard:            'Shipyard',
  metalStorage:        'Metal Storage',
  crystalStorage:      'Crystal Storage',
  deuteriumStorage:    'Deuterium Storage',
  researchLab:         'Research Lab',
  terraformer:         'Terraformer',
  allianceDepot:       'Alliance Depot',
  missileSilo:         'Missile Silo',
}

const TECH_LABELS: Record<string, string> = {
  espionageTech:      'Espionage',
  computerTech:       'Computer',
  weaponsTech:        'Weapons',
  shieldingTech:      'Shielding',
  armorTech:          'Armour',
  energyTech:         'Energy',
  hyperspaceTech:     'Hyperspace',
  combustionDrive:    'Combustion Drive',
  impulseDrive:       'Impulse Drive',
  hyperspaceDrive:    'Hyperspace Drive',
  laserTech:          'Laser',
  ionTech:            'Ion',
  plasmaTech:         'Plasma',
  intergalacticResearch: 'Intergalactic Research',
  gravitonTech:       'Graviton',
}

const INFO_LEVEL_LABELS: Record<InfoLevel, string> = {
  [InfoLevel.Resources]: 'Resources Only',
  [InfoLevel.Fleet]:     'Resources + Fleet',
  [InfoLevel.Defenses]:  'Resources + Fleet + Defenses',
  [InfoLevel.Buildings]: '+ Buildings',
  [InfoLevel.Research]:  '+ Research',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n: number | undefined | null): string {
  if (n == null || isNaN(n)) return '0'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M'
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K'
  return String(Math.floor(n))
}

function fmtDate(ts: number): string {
  const d = new Date(ts > 1e12 ? ts : ts * 1000)
  return d.toLocaleString()
}

function coordStr(c: Coordinate): string {
  return `[${c.galaxy}:${c.system}:${c.position}]`
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

async function apiFetchReports(playerId: string): Promise<EspionageReport[]> {
  try {
    const params = new URLSearchParams({ player_id: playerId })
    const res = await fetch(`/api/espionage/reports?${params}`)
    if (!res.ok) return []
    const data = await res.json()
    // API returns { reports: [...] } or array directly
    return Array.isArray(data) ? data : (data.reports ?? [])
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionHeader({ title, color = '#ffff00' }: { title: string; color?: string }) {
  return (
    <div style={{
      color,
      fontSize: 11,
      fontWeight: 'bold',
      letterSpacing: 2,
      borderBottom: `1px solid ${color}44`,
      paddingBottom: 4,
      marginBottom: 10,
      textShadow: `0 0 8px ${color}`,
    }}>
      {title}
    </div>
  )
}

function KVTable({ rows, labelColor = '#888' }: {
  rows: { label: string; value: string | number; valueColor?: string }[]
  labelColor?: string
}) {
  if (rows.length === 0) {
    return <p style={{ opacity: 0.4, fontSize: 11, fontStyle: 'italic', margin: 0 }}>None detected.</p>
  }
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <tbody>
        {rows.map(({ label, value, valueColor }) => (
          <tr key={label} style={{ borderBottom: '1px solid rgba(0,255,0,0.06)' }}>
            <td style={{ padding: '3px 8px', color: labelColor, width: '60%' }}>{label}</td>
            <td style={{ padding: '3px 8px', color: valueColor ?? '#00ff00', textAlign: 'right' }}>
              {value}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function DetectionBar({ chance }: { chance: number }) {
  const color = chance >= 75 ? '#ff4444' : chance >= 40 ? '#ff8800' : '#00ff00'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
      <div style={{
        flex: 1,
        height: 8,
        background: 'rgba(0,255,0,0.1)',
        border: '1px solid rgba(0,255,0,0.2)',
        borderRadius: 4,
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: `${Math.min(100, chance)}%`,
          background: color,
          transition: 'width 0.4s',
        }} />
      </div>
      <span style={{ color, fontWeight: 'bold', fontSize: 13, minWidth: 40, textAlign: 'right' }}>
        {chance.toFixed(0)}%
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Report viewer
// ---------------------------------------------------------------------------

interface EspionageReportViewerProps {
  report: EspionageReport
  onClose: () => void
  onSendFleet?: (coord: Coordinate) => void
}

function EspionageReportViewer({ report, onClose, onSendFleet }: EspionageReportViewerProps) {
  const detected = report.probesLost > 0

  // Build resource rows
  const resourceRows = report.resources
    ? [
        { label: 'Metal',      value: fmt(report.resources.metal),      valueColor: '#c0c0c0' },
        { label: 'Crystal',    value: fmt(report.resources.crystal),    valueColor: '#64b4ff' },
        { label: 'Deuterium',  value: fmt(report.resources.deuterium),  valueColor: '#80ffff' },
        { label: 'Total',      value: fmt(
            report.resources.metal + report.resources.crystal + report.resources.deuterium
          ), valueColor: '#ffff00' },
      ]
    : []

  // Build fleet rows
  const fleetRows = report.fleet
    ? Object.entries(report.fleet)
        .filter(([, count]) => (count ?? 0) > 0)
        .map(([key, count]) => ({
          label: SHIP_LABELS[key] ?? key,
          value: fmt(count),
          valueColor: '#44aaff',
        }))
    : null

  // Build defense rows
  const defenseRows = report.defenses
    ? Object.entries(report.defenses)
        .filter(([, count]) => (count ?? 0) > 0)
        .map(([key, count]) => ({
          label: DEFENSE_LABELS[key] ?? key,
          value: fmt(count),
          valueColor: '#ff8800',
        }))
    : null

  // Build building rows
  const buildingRows = report.buildings
    ? Object.entries(report.buildings)
        .filter(([, lvl]) => lvl > 0)
        .map(([key, lvl]) => ({
          label: BUILDING_LABELS[key] ?? key,
          value: `Lv ${lvl}`,
          valueColor: '#aa88ff',
        }))
    : null

  // Build research rows
  const researchRows = report.research
    ? Object.entries(report.research)
        .filter(([, lvl]) => lvl > 0)
        .map(([key, lvl]) => ({
          label: TECH_LABELS[key] ?? key,
          value: `Lv ${lvl}`,
          valueColor: '#ff44aa',
        }))
    : null

  return (
    <div style={{
      background: 'rgba(0,8,20,0.97)',
      border: '2px solid #ffaa00',
      borderRadius: 6,
      padding: 24,
      width: 620,
      maxWidth: '95vw',
      maxHeight: '85vh',
      overflowY: 'auto',
      fontFamily: 'Courier New, monospace',
      color: '#00ff00',
      boxShadow: '0 0 30px rgba(255,170,0,0.25)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <h2 style={{
            margin: '0 0 4px 0',
            fontSize: 17,
            color: '#ffaa00',
            textShadow: '0 0 10px #ffaa00',
            letterSpacing: 3,
          }}>
            ESPIONAGE REPORT
          </h2>
          <div style={{ fontSize: 11, opacity: 0.55 }}>
            {fmtDate(report.timestamp)} — ID: {report.id.slice(0, 24)}...
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: '1px solid #ffaa00',
            color: '#ffaa00',
            cursor: 'pointer',
            fontFamily: 'Courier New, monospace',
            fontSize: 14,
            padding: '2px 10px',
            borderRadius: 3,
          }}
        >
          [X]
        </button>
      </div>

      {/* Target info */}
      <div style={{
        background: 'rgba(255,170,0,0.06)',
        border: '1px solid rgba(255,170,0,0.3)',
        borderRadius: 4,
        padding: '12px 16px',
        marginBottom: 16,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 'bold', color: '#ffaa00' }}>
              Target: <span style={{ color: '#fff' }}>{report.targetPlayerName || 'Unknown'}</span>
            </div>
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>
              Coordinates: <span style={{ color: '#ffaa00' }}>{coordStr(report.targetCoordinate)}</span>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{
              fontSize: 11,
              color: detected ? '#ff4444' : '#00ff00',
              fontWeight: 'bold',
              letterSpacing: 1,
            }}>
              {detected ? 'DETECTED' : 'UNDETECTED'}
            </div>
            <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>
              Intel level: {INFO_LEVEL_LABELS[report.infoLevel as InfoLevel] ?? report.infoLevel}
            </div>
          </div>
        </div>

        {/* Probe stats */}
        <div style={{ marginTop: 10, fontSize: 12, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <span>Probes sent: <span style={{ color: '#ffaa00' }}>{report.probesSent}</span></span>
          <span>
            Probes lost:{' '}
            <span style={{ color: report.probesLost > 0 ? '#ff4444' : '#888' }}>
              {report.probesLost}
            </span>
          </span>
        </div>

        {/* Detection chance bar */}
        <div style={{ marginTop: 8, fontSize: 11, opacity: 0.8 }}>
          Chance of detection:
          <DetectionBar chance={report.counterChance} />
        </div>
      </div>

      {/* Resources */}
      <div style={{ marginBottom: 16 }}>
        <SectionHeader title="RESOURCES" color="#c0c0c0" />
        {report.resources ? (
          <KVTable rows={resourceRows} labelColor="#888" />
        ) : (
          <p style={{ opacity: 0.4, fontSize: 11, fontStyle: 'italic', margin: 0 }}>No data.</p>
        )}
      </div>

      {/* Fleet */}
      {report.fleet !== null && (
        <div style={{ marginBottom: 16 }}>
          <SectionHeader title="FLEET" color="#44aaff" />
          <KVTable rows={fleetRows ?? []} labelColor="#888" />
        </div>
      )}
      {report.fleet === null && report.infoLevel < InfoLevel.Fleet && (
        <div style={{ marginBottom: 16, opacity: 0.4, fontSize: 11, fontStyle: 'italic' }}>
          Fleet data: insufficient espionage tech.
        </div>
      )}

      {/* Defenses */}
      {report.defenses !== null && (
        <div style={{ marginBottom: 16 }}>
          <SectionHeader title="DEFENSES" color="#ff8800" />
          <KVTable rows={defenseRows ?? []} labelColor="#888" />
        </div>
      )}
      {report.defenses === null && report.infoLevel < InfoLevel.Defenses && report.infoLevel >= InfoLevel.Fleet && (
        <div style={{ marginBottom: 16, opacity: 0.4, fontSize: 11, fontStyle: 'italic' }}>
          Defense data: insufficient espionage tech.
        </div>
      )}

      {/* Buildings */}
      {report.buildings !== null && (
        <div style={{ marginBottom: 16 }}>
          <SectionHeader title="BUILDINGS" color="#aa88ff" />
          <KVTable rows={buildingRows ?? []} labelColor="#888" />
        </div>
      )}

      {/* Research / Technologies */}
      {report.research !== null && (
        <div style={{ marginBottom: 16 }}>
          <SectionHeader title="TECHNOLOGIES" color="#ff44aa" />
          <KVTable rows={researchRows ?? []} labelColor="#888" />
        </div>
      )}

      {/* Actions */}
      <div style={{
        display: 'flex',
        gap: 10,
        marginTop: 20,
        paddingTop: 14,
        borderTop: '1px solid rgba(255,170,0,0.2)',
        flexWrap: 'wrap',
      }}>
        {onSendFleet && (
          <button
            onClick={() => onSendFleet(report.targetCoordinate)}
            style={{
              background: 'rgba(255,68,68,0.12)',
              border: '1px solid #ff4444',
              color: '#ff4444',
              cursor: 'pointer',
              fontFamily: 'Courier New, monospace',
              fontSize: 12,
              padding: '6px 18px',
              borderRadius: 3,
              fontWeight: 'bold',
              letterSpacing: 1,
              boxShadow: '0 0 8px rgba(255,68,68,0.2)',
            }}
          >
            SEND FLEET
          </button>
        )}
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: '1px solid #444',
            color: '#666',
            cursor: 'pointer',
            fontFamily: 'Courier New, monospace',
            fontSize: 12,
            padding: '6px 16px',
            borderRadius: 3,
            marginLeft: 'auto',
          }}
        >
          Close
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Report list (fetches from API)
// ---------------------------------------------------------------------------

interface EspionageReportListProps {
  currentPlayerId?: string
  onClose?: () => void
  onSendFleet?: (coord: Coordinate) => void
}

export default function EspionageReportList({
  currentPlayerId = DEFAULT_PLAYER_ID,
  onClose,
  onSendFleet,
}: EspionageReportListProps) {
  const [reports, setReports]     = useState<EspionageReport[]>([])
  const [loading, setLoading]     = useState(false)
  const [selected, setSelected]   = useState<EspionageReport | null>(null)
  const [offline, setOffline]     = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const data = await apiFetchReports(currentPlayerId)
    if (data.length === 0) {
      // Offline/no reports — show mock
      setOffline(true)
      setReports(mockReports())
    } else {
      setOffline(false)
      setReports(data)
    }
    setLoading(false)
  }, [currentPlayerId])

  useEffect(() => { load() }, [load])

  if (selected) {
    return (
      <EspionageReportViewer
        report={selected}
        onClose={() => setSelected(null)}
        onSendFleet={onSendFleet}
      />
    )
  }

  return (
    <div style={{
      background: '#0a0a0a',
      border: '1px solid #ffaa00',
      borderRadius: 4,
      color: '#00ff00',
      fontFamily: "'Courier New', monospace",
      fontSize: 13,
      boxShadow: '0 0 20px rgba(255,170,0,0.15)',
      width: 680,
      maxHeight: '85vh',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 14px',
        borderBottom: '1px solid #ffaa0033',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            fontWeight: 'bold',
            fontSize: 13,
            letterSpacing: 2,
            color: '#ffaa00',
            textShadow: '0 0 8px #ffaa00',
          }}>
            // ESPIONAGE REPORTS
          </span>
          {offline && (
            <span style={{
              fontSize: 10,
              color: '#ff8800',
              border: '1px solid #ff8800',
              borderRadius: 2,
              padding: '1px 6px',
              letterSpacing: 1,
            }}>
              OFFLINE (mock)
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            style={{
              background: 'transparent',
              border: '1px solid #333',
              color: '#555',
              cursor: 'pointer',
              fontFamily: "'Courier New', monospace",
              fontSize: 16,
              padding: '2px 8px',
              borderRadius: 2,
            }}
            onClick={load}
            title="Refresh"
          >
            ↺
          </button>
          {onClose && (
            <button
              style={{
                background: 'transparent',
                border: '1px solid #ff4444',
                color: '#ff4444',
                cursor: 'pointer',
                fontFamily: "'Courier New', monospace",
                fontSize: 12,
                padding: '2px 8px',
                borderRadius: 2,
              }}
              onClick={onClose}
            >
              [X]
            </button>
          )}
        </div>
      </div>

      {/* List body */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ color: '#444', textAlign: 'center', padding: 30, fontSize: 12 }}>
            Loading reports...
          </div>
        ) : reports.length === 0 ? (
          <div style={{ color: '#444', textAlign: 'center', padding: 30, fontSize: 12 }}>
            No espionage reports.
          </div>
        ) : (
          reports.map((r) => {
            const detected = r.probesLost > 0
            const totalRes = r.resources
              ? r.resources.metal + r.resources.crystal + r.resources.deuterium
              : 0
            return (
              <div
                key={r.id}
                onClick={() => setSelected(r)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 14px',
                  borderBottom: '1px solid #ffaa0011',
                  cursor: 'pointer',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,170,0,0.06)' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
              >
                {/* Spy badge */}
                <span style={{
                  fontSize: 9,
                  border: '1px solid #ffaa0066',
                  borderRadius: 2,
                  padding: '1px 4px',
                  letterSpacing: 1,
                  color: '#ffaa00',
                  fontWeight: 'bold',
                  flexShrink: 0,
                }}>
                  SPY
                </span>

                {/* Detection dot */}
                <span
                  title={detected ? 'Detected' : 'Undetected'}
                  style={{
                    display: 'inline-block',
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: detected ? '#ff4444' : '#00ff00',
                    flexShrink: 0,
                    boxShadow: detected ? '0 0 4px #ff4444' : '0 0 4px #00ff00',
                  }}
                />

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 2,
                  }}>
                    <span style={{
                      color: '#ffaa00',
                      fontSize: 12,
                      fontWeight: 'bold',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {r.targetPlayerName || 'Unknown'} {coordStr(r.targetCoordinate)}
                    </span>
                    <span style={{ color: '#444', fontSize: 10, flexShrink: 0, marginLeft: 8 }}>
                      {fmtDate(r.timestamp)}
                    </span>
                  </div>
                  <div style={{ color: '#777', fontSize: 11, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    {r.resources && (
                      <span>
                        Resources: <span style={{ color: '#c0c0c0' }}>{fmt(totalRes)}</span>
                      </span>
                    )}
                    {r.fleet && Object.keys(r.fleet).length > 0 && (
                      <span>
                        Fleet: <span style={{ color: '#44aaff' }}>
                          {Object.values(r.fleet).reduce((a, b) => a + (b ?? 0), 0)} ships
                        </span>
                      </span>
                    )}
                    <span>
                      Detection: <span style={{
                        color: r.counterChance >= 50 ? '#ff4444' : '#00ff00',
                      }}>
                        {r.counterChance.toFixed(0)}%
                      </span>
                    </span>
                    <span style={{ color: '#555' }}>
                      Intel: {INFO_LEVEL_LABELS[r.infoLevel as InfoLevel]}
                    </span>
                  </div>
                </div>

                <span style={{ color: '#444', fontSize: 14, flexShrink: 0 }}>›</span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// Export the viewer for standalone modal usage
export { EspionageReportViewer }

// ---------------------------------------------------------------------------
// Mock data for offline / dev mode
// ---------------------------------------------------------------------------

function mockReports(): EspionageReport[] {
  return [
    {
      id: 'espionage-mock-1',
      timestamp: Date.now() - 120_000,
      attackerId: DEFAULT_PLAYER_ID,
      defenderId: 'player-2',
      targetPlayerName: 'Commander002',
      targetCoordinate: { galaxy: 1, system: 3, position: 7 },
      resources: { metal: 150_000, crystal: 80_000, deuterium: 25_000 },
      fleet: { lightFighter: 50, cruiser: 10, espionageProbe: 5 },
      defenses: { rocketLauncher: 20, lightLaser: 5 },
      buildings: null,
      research: null,
      counterChance: 12,
      probesLost: 0,
      probesSent: 5,
      infoLevel: InfoLevel.Defenses,
    },
    {
      id: 'espionage-mock-2',
      timestamp: Date.now() - 3_600_000,
      attackerId: DEFAULT_PLAYER_ID,
      defenderId: 'player-3',
      targetPlayerName: 'Commander003',
      targetCoordinate: { galaxy: 2, system: 1, position: 4 },
      resources: { metal: 400_000, crystal: 200_000, deuterium: 60_000 },
      fleet: null,
      defenses: null,
      buildings: null,
      research: null,
      counterChance: 64,
      probesLost: 2,
      probesSent: 3,
      infoLevel: InfoLevel.Resources,
    },
    {
      id: 'espionage-mock-3',
      timestamp: Date.now() - 86_400_000,
      attackerId: DEFAULT_PLAYER_ID,
      defenderId: 'player-4',
      targetPlayerName: 'Commander004',
      targetCoordinate: { galaxy: 1, system: 7, position: 2 },
      resources: { metal: 55_000, crystal: 30_000, deuterium: 8_000 },
      fleet: { battleship: 3, destroyer: 1 },
      defenses: { plasmaTurret: 2, largeShieldDome: 1 },
      buildings: { metalMine: 18, crystalMine: 16, shipyard: 9, researchLab: 8 },
      research: { weaponsTech: 10, shieldingTech: 8, armorTech: 9, espionageTech: 7 },
      counterChance: 4,
      probesLost: 0,
      probesSent: 10,
      infoLevel: InfoLevel.Research,
    },
  ]
}
