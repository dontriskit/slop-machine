import { useState, useEffect, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8787';

interface DetectedFleet {
  missionId: string;
  playerId: string;
  playerName: string;
  missionType: string;
  direction: 'incoming' | 'outgoing';
  timeArrival: number;
  ships: Record<string, number>;
}

interface ScanResult {
  moonId: string;
  targetCoordinate: { galaxy: number; system: number; position: number };
  phalanxLevel: number;
  range: number;
  deuteriumConsumed: number;
  detectedFleets: DetectedFleet[];
  scannedAt: number;
  scanId: string;
}

interface PhalanxRangeInfo {
  moonId: string;
  phalanxLevel: number;
  range: number;
}

interface Props {
  playerId: string;
  moonId: string;
}

function formatCountdown(arrivalUnix: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = arrivalUnix - now;
  if (diff <= 0) return 'Arrived';
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}

function shipLabel(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function FleetCard({ fleet }: { fleet: DetectedFleet }) {
  const [countdown, setCountdown] = useState(() => formatCountdown(fleet.timeArrival));

  useEffect(() => {
    const id = setInterval(() => setCountdown(formatCountdown(fleet.timeArrival)), 1000);
    return () => clearInterval(id);
  }, [fleet.timeArrival]);

  return (
    <div
      style={{
        border: `1px solid ${fleet.direction === 'incoming' ? '#ff6b6b' : '#6bcbff'}`,
        borderRadius: 6,
        padding: '10px 14px',
        marginBottom: 10,
        background: '#1a1a2e',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontWeight: 600, color: fleet.direction === 'incoming' ? '#ff6b6b' : '#6bcbff' }}>
          {fleet.direction === 'incoming' ? '↙ Incoming' : '↗ Outgoing'} — {fleet.missionType.toUpperCase()}
        </span>
        <span style={{ fontFamily: 'monospace', fontSize: 14 }}>{countdown}</span>
      </div>
      <div style={{ fontSize: 13, color: '#aaa', marginBottom: 6 }}>
        Player: <strong style={{ color: '#eee' }}>{fleet.playerName}</strong>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px', fontSize: 12 }}>
        {Object.entries(fleet.ships).map(([k, v]) => (
          <span key={k} style={{ color: '#ccc' }}>
            {shipLabel(k)}: <strong style={{ color: '#fff' }}>{v.toLocaleString()}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}

export default function PhalanxScanner({ playerId, moonId }: Props) {
  const [rangeInfo, setRangeInfo] = useState<PhalanxRangeInfo | null>(null);
  const [galaxy, setGalaxy] = useState(1);
  const [system, setSystem] = useState(1);
  const [position, setPosition] = useState(1);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Deuterium cost preview: 5000 * system²
  const deutCost = 5000 * system * system;

  const fetchRange = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/phalanx/range?moon_id=${encodeURIComponent(moonId)}`);
      if (res.ok) {
        const data: PhalanxRangeInfo = await res.json();
        setRangeInfo(data);
      }
    } catch {
      // ignore
    }
  }, [moonId]);

  useEffect(() => {
    fetchRange();
  }, [fetchRange]);

  const handleScan = async () => {
    setError(null);
    setResult(null);
    setScanning(true);

    try {
      const res = await fetch(`${API_BASE}/api/phalanx/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player_id: playerId,
          moon_id: moonId,
          target_galaxy: galaxy,
          target_system: system,
          target_position: position,
        }),
      });

      const data = await res.json<any>();

      if (!res.ok || data.error) {
        setError(data.error ?? 'Scan failed');
      } else {
        setResult(data as ScanResult);
      }
    } catch (e: any) {
      setError(e?.message ?? 'Network error');
    } finally {
      setScanning(false);
    }
  };

  return (
    <div
      style={{
        background: '#0d0d1a',
        border: '1px solid #333',
        borderRadius: 10,
        padding: 20,
        maxWidth: 540,
        color: '#eee',
        fontFamily: 'sans-serif',
      }}
    >
      <h2 style={{ margin: '0 0 4px', fontSize: 18, color: '#7dd3fc' }}>Sensor Phalanx Scanner</h2>

      {rangeInfo && (
        <p style={{ margin: '0 0 16px', fontSize: 13, color: '#888' }}>
          Phalanx Level <strong style={{ color: '#eee' }}>{rangeInfo.phalanxLevel}</strong> — Range:{' '}
          <strong style={{ color: '#eee' }}>{rangeInfo.range}</strong> system(s)
        </p>
      )}

      {!rangeInfo && (
        <p style={{ margin: '0 0 16px', fontSize: 13, color: '#888' }}>Loading phalanx info…</p>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
        {[
          { label: 'Galaxy', value: galaxy, set: setGalaxy, min: 1, max: 9 },
          { label: 'System', value: system, set: setSystem, min: 1, max: 499 },
          { label: 'Position', value: position, set: setPosition, min: 1, max: 15 },
        ].map(({ label, value, set, min, max }) => (
          <div key={label}>
            <label style={{ display: 'block', fontSize: 12, color: '#aaa', marginBottom: 4 }}>
              {label}
            </label>
            <input
              type="number"
              min={min}
              max={max}
              value={value}
              onChange={(e) => set(Math.max(min, Math.min(max, Number(e.target.value))))}
              style={{
                width: '100%',
                background: '#1a1a2e',
                border: '1px solid #444',
                borderRadius: 4,
                color: '#eee',
                padding: '6px 8px',
                fontSize: 14,
                boxSizing: 'border-box',
              }}
            />
          </div>
        ))}
      </div>

      <p style={{ margin: '0 0 12px', fontSize: 13, color: '#fbbf24' }}>
        Deuterium cost: <strong>{deutCost.toLocaleString()}</strong>
      </p>

      <button
        onClick={handleScan}
        disabled={scanning || !rangeInfo || rangeInfo.phalanxLevel < 1}
        style={{
          background: scanning ? '#333' : '#1d4ed8',
          color: '#fff',
          border: 'none',
          borderRadius: 6,
          padding: '10px 20px',
          fontSize: 14,
          cursor: scanning ? 'not-allowed' : 'pointer',
          marginBottom: 16,
          width: '100%',
        }}
      >
        {scanning ? 'Scanning…' : 'Scan Coordinate'}
      </button>

      {error && (
        <div
          style={{
            background: '#3b0000',
            border: '1px solid #ff4444',
            borderRadius: 6,
            padding: '10px 14px',
            color: '#ff8888',
            marginBottom: 12,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {result && (
        <div>
          <div style={{ marginBottom: 10, fontSize: 13, color: '#aaa' }}>
            Scanned{' '}
            <strong style={{ color: '#eee' }}>
              [{result.targetCoordinate.galaxy}:{result.targetCoordinate.system}:
              {result.targetCoordinate.position}]
            </strong>{' '}
            — {result.detectedFleets.length} fleet(s) detected — Cost:{' '}
            <span style={{ color: '#fbbf24' }}>{result.deuteriumConsumed.toLocaleString()} deut</span>
          </div>

          {result.detectedFleets.length === 0 ? (
            <div style={{ color: '#666', fontSize: 13, fontStyle: 'italic' }}>
              No fleets in transit at this coordinate.
            </div>
          ) : (
            result.detectedFleets.map((fleet) => (
              <FleetCard key={fleet.missionId} fleet={fleet} />
            ))
          )}
        </div>
      )}
    </div>
  );
}
