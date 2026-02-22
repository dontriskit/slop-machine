import { GameStore } from '../store/gameStore'
import './HUD.css'

interface HUDProps {
  onOpenGalaxyMap?: () => void
}

export default function HUD({ onOpenGalaxyMap }: HUDProps) {
  const selectedGalaxy = GameStore((state) => state.selectedGalaxy)
  const selectedSystem = GameStore((state) => state.selectedSystem)
  const selectedPlanet = GameStore((state) => state.selectedPlanet)
  const setSelectedGalaxy = GameStore((state) => state.setSelectedGalaxy)

  return (
    <div className="hud">
      {/* Top-left: Galaxy info */}
      <div className="hud-panel info-panel">
        <h2>Cosmic Protocol</h2>
        <div className="stat">
          <span className="label">Galaxy:</span>
          <span className="value">{selectedGalaxy}</span>
        </div>
        {selectedSystem && (
          <div className="stat">
            <span className="label">System:</span>
            <span className="value">{selectedSystem}</span>
          </div>
        )}
        {selectedPlanet && (
          <div className="stat">
            <span className="label">Planet:</span>
            <span className="value">{selectedPlanet}</span>
          </div>
        )}

        {/* Galaxy Map toggle */}
        {onOpenGalaxyMap && (
          <button
            className="galaxy-btn"
            style={{ marginTop: 14, width: '100%', letterSpacing: 1 }}
            onClick={onOpenGalaxyMap}
          >
            Galaxy Map
          </button>
        )}
      </div>

      {/* Bottom: Galaxy selector */}
      <div className="hud-panel galaxy-selector">
        <h3>Galaxies</h3>
        <div className="galaxy-buttons">
          {Array.from({ length: 9 }, (_, i) => i + 1).map((galaxy) => (
            <button
              key={galaxy}
              className={`galaxy-btn ${
                selectedGalaxy === galaxy ? 'active' : ''
              }`}
              onClick={() => setSelectedGalaxy(galaxy)}
            >
              {galaxy}
            </button>
          ))}
        </div>
      </div>

      {/* Right-side: Controls */}
      <div className="hud-panel controls-panel">
        <h3>Controls</h3>
        <p className="control-item">Drag to rotate</p>
        <p className="control-item">Scroll to zoom</p>
        <p className="control-item">Click system/planet</p>
        <p className="control-item">G — toggle galaxy map</p>
      </div>
    </div>
  )
}
