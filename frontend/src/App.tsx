import { Canvas } from '@react-three/fiber'
import { PerspectiveCamera, OrbitControls } from '@react-three/drei'
import { Suspense, useState, useEffect, useCallback } from 'react'
import Galaxy from './components/Galaxy'
import HUD from './components/HUD'
import GalaxyMap from './components/GalaxyMap'
import { GameStore } from './store/gameStore'

export default function App() {
  const selectedGalaxy = GameStore((state) => state.selectedGalaxy)
  const [showGalaxyMap, setShowGalaxyMap] = useState(false)

  const openMap = useCallback(() => setShowGalaxyMap(true), [])
  const closeMap = useCallback(() => setShowGalaxyMap(false), [])

  // Global keyboard shortcut: G toggles galaxy map
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore when typing in inputs
      const tag = (e.target as HTMLElement).tagName.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return
      if (e.key === 'g' || e.key === 'G') setShowGalaxyMap((v) => !v)
      if (e.key === 'Escape') setShowGalaxyMap(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <Canvas
        style={{ display: 'block' }}
        camera={{ position: [0, 50, 50], fov: 75 }}
      >
        <PerspectiveCamera makeDefault position={[0, 50, 50]} fov={75} />
        <OrbitControls makeDefault />

        {/* Lighting */}
        <ambientLight intensity={0.5} />
        <pointLight position={[100, 100, 100]} intensity={1} />

        {/* Space background */}
        <color attach="background" args={['#000814']} />

        {/* Galaxy visualization */}
        <Suspense fallback={null}>
          <Galaxy galaxyId={selectedGalaxy} />
        </Suspense>
      </Canvas>

      {/* HUD Overlay */}
      <HUD onOpenGalaxyMap={openMap} />

      {/* Galaxy Map modal overlay */}
      {showGalaxyMap && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 500,
          }}
          onClick={closeMap}
        >
          {/* Stop clicks inside the map from closing it */}
          <div onClick={(e) => e.stopPropagation()}>
            <GalaxyMap onClose={closeMap} />
          </div>
        </div>
      )}
    </div>
  )
}
