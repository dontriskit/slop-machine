/**
 * BattleReport.tsx
 *
 * Full battle report viewer for Cosmic Protocol.
 * Displays:
 *   - Header: attacker vs defender, coordinates, outcome
 *   - Round-by-round breakdown (up to 6 rounds)
 *   - Casualties table: ships lost per type, both sides
 *   - Debris field: metal + crystal generated
 *   - Loot: resources stolen (metal, crystal, deuterium)
 *   - Moon chance percentage
 *
 * Green retro-terminal aesthetic matching HUD.tsx.
 */

import { useState } from 'react'

// ---------------------------------------------------------------------------
// Types (matching worker/src/game/services/battleService.ts)
// ---------------------------------------------------------------------------

export interface Resources {
  metal: number
  crystal: number
  deuterium: number
}

export interface Ships {
  lightFighter?: number
  heavyFighter?: number
  cruiser?: number
  battleship?: number
  battlecruiser?: number
  bomber?: number
  destroyer?: number
  deathStar?: number
  smallCargo?: number
  largeCargo?: number
  colonyShip?: number
  recycler?: number
  espionageProbe?: number
  solarSatellite?: number
}

export interface BattleRoundSide {
  ships: Ships
  defenses?: Record<string, number>
  shipsDestroyed: Ships
  defensesDestroyed?: Record<string, number>
}

export interface BattleRound {
  round: number
  attacker: BattleRoundSide
  defender: BattleRoundSide
  attackerCasualties: Ships
  defenderCasualties: Ships
}

export interface BattleReport {
  id: string
  attackerId: string
  defenderId: string
  attackerName?: string
  defenderName?: string
  coordinates?: { galaxy: number; system: number; position: number }
  rounds: BattleRound[]
  winner: 'attacker' | 'defender' | 'draw'
  attackerLosses: Resources
  defenderLosses: Resources
  debrisField: Resources
  loot: Resources
  timestamp: number
  moonChance?: number
  // DB flat fields (from battle_reports table)
  attacker_id?: string
  defender_id?: string
  rounds_fought?: number
  attacker_loss_metal?: number
  attacker_loss_crystal?: number
  attacker_loss_deuterium?: number
  defender_loss_metal?: number
  defender_loss_crystal?: number
  defender_loss_deuterium?: number
  loot_metal?: number
  loot_crystal?: number
  loot_deuterium?: number
  created_at?: number
  battle_data?: { rounds?: BattleRound[] }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SHIP_LABELS: Record<string, string> = {
  lightFighter: 'Light Fighter',
  heavyFighter: 'Heavy Fighter',
  cruiser: 'Cruiser',
  battleship: 'Battleship',
  battlecruiser: 'Battlecruiser',
  bomber: 'Bomber',
  destroyer: 'Destroyer',
  deathStar: 'Death Star',
  smallCargo: 'Small Cargo',
  largeCargo: 'Large Cargo',
  colonyShip: 'Colony Ship',
  recycler: 'Recycler',
  espionageProbe: 'Espionage Probe',
  solarSatellite: 'Solar Satellite',
}

function fmt(n: number | undefined | null): string {
  if (n == null || isNaN(n)) return '0'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(Math.floor(n))
}

function fmtDate(ts: number): string {
  const d = new Date(ts > 1e12 ? ts : ts * 1000)
  return d.toLocaleString()
}

function moonChanceFromDebris(debrisMetal: number, debrisCrystal: number): number {
  const total = (debrisMetal + debrisCrystal) / 100_000
  return Math.min(20, Math.floor(total))
}

function totalShips(ships: Ships): number {
  return Object.values(ships).reduce((s, v) => s + (v ?? 0), 0)
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function OutcomeBadge({ winner }: { winner: 'attacker' | 'defender' | 'draw' }) {
  const styles: Record<string, React.CSSProperties> = {
    attacker: { color: '#00ff00', border: '1px solid #00ff00', background: 'rgba(0,255,0,0.1)' },
    defender: { color: '#ff4444', border: '1px solid #ff4444', background: 'rgba(255,68,68,0.1)' },
    draw:     { color: '#ffff00', border: '1px solid #ffff00', background: 'rgba(255,255,0,0.1)' },
  }
  const labels = { attacker: 'ATTACKER WINS', defender: 'DEFENDER WINS', draw: 'DRAW' }
  return (
    <span style={{
      ...styles[winner],
      padding: '2px 10px',
      borderRadius: 3,
      fontWeight: 'bold',
      fontSize: 13,
      letterSpacing: 2,
    }}>
      {labels[winner]}
    </span>
  )
}

function ResourceRow({ label, metal, crystal, deut }: {
  label: string; metal: number; crystal: number; deut?: number
}) {
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 6 }}>
      <span style={{ opacity: 0.7, minWidth: 120, fontSize: 12 }}>{label}</span>
      <span style={{ color: '#a0a0a0', fontSize: 12 }}>
        <span style={{ color: '#e0e0e0' }}>Fe</span> {fmt(metal)}
      </span>
      <span style={{ color: '#64b4ff', fontSize: 12 }}>
        <span style={{ color: '#64b4ff' }}>Si</span> {fmt(crystal)}
      </span>
      {deut !== undefined && (
        <span style={{ color: '#80ffff', fontSize: 12 }}>
          <span style={{ color: '#80ffff' }}>D</span> {fmt(deut)}
        </span>
      )}
    </div>
  )
}

function CasualtiesTable({ attackerLost, defenderLost }: {
  attackerLost: Ships; defenderLost: Ships
}) {
  const allKeys = Array.from(new Set([
    ...Object.keys(attackerLost),
    ...Object.keys(defenderLost),
  ])).filter((k) => (attackerLost[k as keyof Ships] ?? 0) > 0 || (defenderLost[k as keyof Ships] ?? 0) > 0)

  if (allKeys.length === 0) {
    return <p style={{ opacity: 0.5, fontSize: 12, fontStyle: 'italic' }}>No casualties recorded.</p>
  }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <thead>
        <tr>
          <th style={thStyle}>Ship Type</th>
          <th style={{ ...thStyle, color: '#ff8800' }}>Attacker Lost</th>
          <th style={{ ...thStyle, color: '#44aaff' }}>Defender Lost</th>
        </tr>
      </thead>
      <tbody>
        {allKeys.map((k) => {
          const aLost = attackerLost[k as keyof Ships] ?? 0
          const dLost = defenderLost[k as keyof Ships] ?? 0
          return (
            <tr key={k} style={{ borderBottom: '1px solid rgba(0,255,0,0.1)' }}>
              <td style={tdStyle}>{SHIP_LABELS[k] ?? k}</td>
              <td style={{ ...tdStyle, color: aLost > 0 ? '#ff6666' : '#444' }}>
                {aLost > 0 ? fmt(aLost) : '-'}
              </td>
              <td style={{ ...tdStyle, color: dLost > 0 ? '#ff6666' : '#444' }}>
                {dLost > 0 ? fmt(dLost) : '-'}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '4px 8px',
  borderBottom: '1px solid rgba(0,255,0,0.3)',
  color: '#00ff00',
  fontWeight: 'bold',
  fontSize: 11,
  letterSpacing: 1,
}

const tdStyle: React.CSSProperties = {
  padding: '3px 8px',
  color: '#ccc',
}

function RoundBreakdown({ rounds }: { rounds: BattleRound[] }) {
  const [openRound, setOpenRound] = useState<number | null>(null)

  if (!rounds || rounds.length === 0) {
    return <p style={{ opacity: 0.5, fontSize: 12, fontStyle: 'italic' }}>No round data available.</p>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {rounds.map((r) => {
        const isOpen = openRound === r.round
        const aCasualties = totalShips(r.attackerCasualties ?? {})
        const dCasualties = totalShips(r.defenderCasualties ?? {})
        const aRemaining = totalShips(r.attacker?.ships ?? {})
        const dRemaining = totalShips(r.defender?.ships ?? {})
        return (
          <div key={r.round} style={{
            border: '1px solid rgba(0,255,0,0.25)',
            borderRadius: 3,
            background: 'rgba(0,255,0,0.03)',
          }}>
            <button
              onClick={() => setOpenRound(isOpen ? null : r.round)}
              style={{
                width: '100%',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#00ff00',
                fontFamily: 'Courier New, monospace',
                fontSize: 12,
                padding: '6px 10px',
                textAlign: 'left',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span style={{ fontWeight: 'bold', letterSpacing: 1 }}>Round {r.round}</span>
              <span style={{ opacity: 0.7, gap: 16, display: 'flex' }}>
                <span style={{ color: '#ff8800' }}>ATK lost: {fmt(aCasualties)}</span>
                <span style={{ color: '#44aaff' }}>DEF lost: {fmt(dCasualties)}</span>
                <span style={{ color: isOpen ? '#ffff00' : '#00ff00' }}>{isOpen ? '[-]' : '[+]'}</span>
              </span>
            </button>
            {isOpen && (
              <div style={{ padding: '6px 10px 10px', borderTop: '1px solid rgba(0,255,0,0.15)' }}>
                <div style={{ display: 'flex', gap: 24, fontSize: 12, marginBottom: 8 }}>
                  <div>
                    <div style={{ color: '#ff8800', fontWeight: 'bold', marginBottom: 4 }}>ATTACKER</div>
                    <div style={{ opacity: 0.8 }}>Ships remaining: <span style={{ color: '#00ffff' }}>{fmt(aRemaining)}</span></div>
                    <div style={{ opacity: 0.8 }}>Ships lost this round: <span style={{ color: '#ff6666' }}>{fmt(aCasualties)}</span></div>
                  </div>
                  <div>
                    <div style={{ color: '#44aaff', fontWeight: 'bold', marginBottom: 4 }}>DEFENDER</div>
                    <div style={{ opacity: 0.8 }}>Ships remaining: <span style={{ color: '#00ffff' }}>{fmt(dRemaining)}</span></div>
                    <div style={{ opacity: 0.8 }}>Ships lost this round: <span style={{ color: '#ff6666' }}>{fmt(dCasualties)}</span></div>
                  </div>
                </div>
                {(aCasualties > 0 || dCasualties > 0) && (
                  <CasualtiesTable
                    attackerLost={r.attackerCasualties ?? {}}
                    defenderLost={r.defenderCasualties ?? {}}
                  />
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div style={{
      color: '#ffff00',
      fontSize: 12,
      fontWeight: 'bold',
      letterSpacing: 2,
      borderBottom: '1px solid rgba(255,255,0,0.3)',
      paddingBottom: 4,
      marginBottom: 10,
      textShadow: '0 0 8px #ffff00',
    }}>
      {title}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface BattleReportProps {
  report: BattleReport
  onClose: () => void
}

export default function BattleReportViewer({ report, onClose }: BattleReportProps) {
  // Normalize flat DB fields to structured fields
  const attackerLosses: Resources = report.attackerLosses ?? {
    metal: report.attacker_loss_metal ?? 0,
    crystal: report.attacker_loss_crystal ?? 0,
    deuterium: report.attacker_loss_deuterium ?? 0,
  }
  const defenderLosses: Resources = report.defenderLosses ?? {
    metal: report.defender_loss_metal ?? 0,
    crystal: report.defender_loss_crystal ?? 0,
    deuterium: report.defender_loss_deuterium ?? 0,
  }
  const loot: Resources = report.loot ?? {
    metal: report.loot_metal ?? 0,
    crystal: report.loot_crystal ?? 0,
    deuterium: report.loot_deuterium ?? 0,
  }
  const debris: Resources = report.debrisField ?? { metal: 0, crystal: 0, deuterium: 0 }
  const rounds: BattleRound[] = report.rounds ?? report.battle_data?.rounds ?? []
  const timestamp = report.timestamp ?? report.created_at ?? 0
  const roundsFought = report.rounds_fought ?? rounds.length

  // Aggregate total casualties across all rounds for the casualties table
  const totalAttackerCasualties: Ships = {}
  const totalDefenderCasualties: Ships = {}
  for (const r of rounds) {
    for (const [k, v] of Object.entries(r.attackerCasualties ?? {})) {
      totalAttackerCasualties[k as keyof Ships] = (totalAttackerCasualties[k as keyof Ships] ?? 0) + (v ?? 0)
    }
    for (const [k, v] of Object.entries(r.defenderCasualties ?? {})) {
      totalDefenderCasualties[k as keyof Ships] = (totalDefenderCasualties[k as keyof Ships] ?? 0) + (v ?? 0)
    }
  }

  const moonChance = report.moonChance ?? moonChanceFromDebris(debris.metal, debris.crystal)

  const attackerName = report.attackerName ?? report.attacker_id ?? report.attackerId ?? 'Attacker'
  const defenderName = report.defenderName ?? report.defender_id ?? report.defenderId ?? 'Defender'

  return (
    <div style={{
      background: 'rgba(0,8,20,0.97)',
      border: '2px solid #00ff00',
      borderRadius: 6,
      padding: 24,
      width: 680,
      maxWidth: '95vw',
      maxHeight: '85vh',
      overflowY: 'auto',
      fontFamily: 'Courier New, monospace',
      color: '#00ff00',
      boxShadow: '0 0 30px rgba(0,255,0,0.3)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <h2 style={{
            margin: '0 0 6px 0',
            fontSize: 18,
            color: '#ffff00',
            textShadow: '0 0 10px #ffff00',
            letterSpacing: 3,
          }}>
            BATTLE REPORT
          </h2>
          <div style={{ fontSize: 11, opacity: 0.6 }}>{fmtDate(timestamp)} — ID: {report.id}</div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: '1px solid #00ff00',
            color: '#00ff00',
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

      {/* Combatants + outcome */}
      <div style={{
        background: 'rgba(0,255,0,0.05)',
        border: '1px solid rgba(0,255,0,0.3)',
        borderRadius: 4,
        padding: '12px 16px',
        marginBottom: 16,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 10,
      }}>
        <div style={{ fontSize: 15 }}>
          <span style={{ color: '#ff8800', fontWeight: 'bold' }}>{attackerName}</span>
          <span style={{ opacity: 0.5, margin: '0 10px' }}>VS</span>
          <span style={{ color: '#44aaff', fontWeight: 'bold' }}>{defenderName}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <OutcomeBadge winner={report.winner} />
          {report.coordinates && (
            <span style={{ fontSize: 11, opacity: 0.6 }}>
              [{report.coordinates.galaxy}:{report.coordinates.system}:{report.coordinates.position}]
            </span>
          )}
          <span style={{ fontSize: 11, opacity: 0.6 }}>Rounds: {roundsFought}</span>
        </div>
      </div>

      {/* Round-by-round breakdown */}
      <div style={{ marginBottom: 18 }}>
        <SectionHeader title="ROUND-BY-ROUND BREAKDOWN" />
        <RoundBreakdown rounds={rounds} />
      </div>

      {/* Total casualties table */}
      <div style={{ marginBottom: 18 }}>
        <SectionHeader title="TOTAL CASUALTIES" />
        <CasualtiesTable
          attackerLost={totalAttackerCasualties}
          defenderLost={totalDefenderCasualties}
        />
      </div>

      {/* Losses in resources */}
      <div style={{ marginBottom: 18 }}>
        <SectionHeader title="FLEET LOSSES (RESOURCE VALUE)" />
        <ResourceRow label="Attacker losses:" metal={attackerLosses.metal} crystal={attackerLosses.crystal} deut={attackerLosses.deuterium} />
        <ResourceRow label="Defender losses:" metal={defenderLosses.metal} crystal={defenderLosses.crystal} deut={defenderLosses.deuterium} />
      </div>

      {/* Loot */}
      <div style={{ marginBottom: 18 }}>
        <SectionHeader title="LOOT" />
        <ResourceRow label="Resources stolen:" metal={loot.metal} crystal={loot.crystal} deut={loot.deuterium} />
        {(loot.metal + loot.crystal + loot.deuterium) === 0 && (
          <p style={{ opacity: 0.5, fontSize: 12, fontStyle: 'italic', margin: 0 }}>No resources looted.</p>
        )}
      </div>

      {/* Debris field */}
      <div style={{ marginBottom: 18 }}>
        <SectionHeader title="DEBRIS FIELD" />
        <ResourceRow label="Debris generated:" metal={debris.metal} crystal={debris.crystal} />
        {(debris.metal + debris.crystal) === 0 && (
          <p style={{ opacity: 0.5, fontSize: 12, fontStyle: 'italic', margin: 0 }}>No debris generated.</p>
        )}
      </div>

      {/* Moon chance */}
      <div>
        <SectionHeader title="MOON CHANCE" />
        <div style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 120,
            height: 12,
            background: 'rgba(0,255,0,0.1)',
            border: '1px solid rgba(0,255,0,0.3)',
            borderRadius: 6,
            overflow: 'hidden',
          }}>
            <div style={{
              height: '100%',
              width: `${Math.min(100, moonChance * 5)}%`,
              background: moonChance >= 20 ? '#ffff00' : '#00ff00',
              transition: 'width 0.5s',
            }} />
          </div>
          <span style={{
            color: moonChance >= 20 ? '#ffff00' : '#00ff00',
            fontWeight: 'bold',
            fontSize: 15,
          }}>
            {moonChance}%
          </span>
          {moonChance >= 20 && (
            <span style={{ color: '#ffff00', fontSize: 11, opacity: 0.8 }}>MAX</span>
          )}
        </div>
        <p style={{ fontSize: 11, opacity: 0.5, margin: '6px 0 0 0' }}>
          Based on {fmt(debris.metal + debris.crystal)} total debris ({moonChance}% chance, max 20%)
        </p>
      </div>
    </div>
  )
}
