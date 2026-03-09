/**
 * ResourceChart.tsx
 *
 * Line chart showing metal, crystal, deuterium production rates over last 24h.
 * - Data points simulated from current production rates (no historical DB yet)
 * - Toggle between: production/hour, production/day, cumulative
 * - Responsive container for mobile
 * - Keyboard shortcut 'C' registered in App.tsx
 */

import { useState, useMemo } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { GameStore } from '../store/gameStore'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ViewMode = 'per_hour' | 'per_day' | 'cumulative'

interface DataPoint {
  time: string
  metal: number
  crystal: number
  deuterium: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(Math.floor(n))
}

/**
 * Generate 24 hourly data points simulated from current production rates.
 * Adds slight noise so the chart looks realistic rather than a flat line.
 * In the future these can be replaced with real timeseries data from the DB.
 */
function generateSimulatedData(
  metalPerHour: number,
  crystalPerHour: number,
  deutPerHour: number,
  mode: ViewMode,
): DataPoint[] {
  const points: DataPoint[] = []
  const now = new Date()

  // Seed-based pseudo-noise so data is stable within a session
  const noise = (base: number, hour: number, seed: number) => {
    const factor = 1 + 0.08 * Math.sin((hour + seed) * 1.7) + 0.04 * Math.cos(hour * 0.9 + seed)
    return Math.max(0, base * factor)
  }

  for (let h = 23; h >= 0; h--) {
    const t = new Date(now.getTime() - h * 3600 * 1000)
    const label = t.getHours().toString().padStart(2, '0') + ':00'

    const metalH = noise(metalPerHour, h, 1)
    const crystalH = noise(crystalPerHour, h, 3)
    const deutH = noise(deutPerHour, h, 7)

    const idx = 23 - h

    if (mode === 'per_hour') {
      points.push({ time: label, metal: metalH, crystal: crystalH, deuterium: deutH })
    } else if (mode === 'per_day') {
      points.push({ time: label, metal: metalH * 24, crystal: crystalH * 24, deuterium: deutH * 24 })
    } else {
      // cumulative — sum from earliest to current hour
      const prevMetal = idx > 0 ? points[idx - 1].metal : 0
      const prevCrystal = idx > 0 ? points[idx - 1].crystal : 0
      const prevDeut = idx > 0 ? points[idx - 1].deuterium : 0
      points.push({
        time: label,
        metal: prevMetal + metalH,
        crystal: prevCrystal + crystalH,
        deuterium: prevDeut + deutH,
      })
    }
  }

  return points
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ResourceChartProps {
  onClose: () => void
}

export default function ResourceChart({ onClose }: ResourceChartProps) {
  const production = GameStore((s) => s.production)
  const [mode, setMode] = useState<ViewMode>('per_hour')

  const data = useMemo(
    () =>
      generateSimulatedData(
        production.metalPerHour,
        production.crystalPerHour,
        production.deutPerHour,
        mode,
      ),
    [production.metalPerHour, production.crystalPerHour, production.deutPerHour, mode],
  )

  const modeLabels: Record<ViewMode, string> = {
    per_hour: 'Per Hour',
    per_day: 'Per Day',
    cumulative: 'Cumulative (24h)',
  }

  return (
    <div
      style={{
        background: '#0a0a1a',
        border: '1px solid #1e3a5f',
        borderRadius: 12,
        padding: '24px 20px',
        width: 'min(90vw, 760px)',
        maxHeight: '90vh',
        overflowY: 'auto',
        color: '#c8d8e8',
        fontFamily: 'monospace',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0, color: '#7ec8e3', fontSize: 18 }}>Resource Production Chart</h2>
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: '1px solid #334',
            color: '#aaa',
            borderRadius: 6,
            padding: '4px 10px',
            cursor: 'pointer',
            fontSize: 16,
          }}
        >
          ✕
        </button>
      </div>

      {/* Current rates summary */}
      <div
        style={{
          display: 'flex',
          gap: 16,
          marginBottom: 16,
          flexWrap: 'wrap',
        }}
      >
        {[
          { label: 'Metal', value: production.metalPerHour, color: '#b87333' },
          { label: 'Crystal', value: production.crystalPerHour, color: '#7ec8e3' },
          { label: 'Deuterium', value: production.deutPerHour, color: '#4fc3f7' },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            style={{
              background: '#111827',
              border: `1px solid ${color}44`,
              borderRadius: 8,
              padding: '8px 14px',
              flex: '1 1 140px',
            }}
          >
            <div style={{ color, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
            <div style={{ color: '#fff', fontSize: 18, fontWeight: 700, marginTop: 2 }}>
              {formatNumber(value)}<span style={{ fontSize: 11, color: '#888', marginLeft: 4 }}>/h</span>
            </div>
          </div>
        ))}
      </div>

      {/* View mode toggles */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {(Object.keys(modeLabels) as ViewMode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              border: `1px solid ${mode === m ? '#7ec8e3' : '#334'}`,
              background: mode === m ? '#1e3a5f' : 'transparent',
              color: mode === m ? '#7ec8e3' : '#778899',
              cursor: 'pointer',
              fontSize: 12,
              fontFamily: 'monospace',
              transition: 'all 0.15s',
            }}
          >
            {modeLabels[m]}
          </button>
        ))}
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e2a3a" />
          <XAxis
            dataKey="time"
            tick={{ fill: '#556', fontSize: 10 }}
            interval={3}
            stroke="#223"
          />
          <YAxis
            tickFormatter={formatNumber}
            tick={{ fill: '#556', fontSize: 10 }}
            stroke="#223"
            width={52}
          />
          <Tooltip
            contentStyle={{
              background: '#0d1b2a',
              border: '1px solid #1e3a5f',
              borderRadius: 8,
              color: '#c8d8e8',
              fontFamily: 'monospace',
              fontSize: 12,
            }}
            formatter={(value: number, name: string) => [formatNumber(value), name]}
            labelStyle={{ color: '#7ec8e3', marginBottom: 4 }}
          />
          <Legend
            wrapperStyle={{ fontSize: 12, color: '#778899', paddingTop: 8 }}
          />
          <Line
            type="monotone"
            dataKey="metal"
            stroke="#b87333"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            name="Metal"
          />
          <Line
            type="monotone"
            dataKey="crystal"
            stroke="#7ec8e3"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            name="Crystal"
          />
          <Line
            type="monotone"
            dataKey="deuterium"
            stroke="#4fc3f7"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            name="Deuterium"
          />
        </LineChart>
      </ResponsiveContainer>

      <p style={{ color: '#445', fontSize: 11, margin: '12px 0 0', textAlign: 'center' }}>
        Simulated from current production rates · Historical data coming soon · Press C to close
      </p>
    </div>
  )
}
