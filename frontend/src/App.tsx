import { Canvas } from '@react-three/fiber'
import { PerspectiveCamera, OrbitControls } from '@react-three/drei'
import { Suspense } from 'react'
import Galaxy from './components/Galaxy'
import HUD from './components/HUD'
import { GameStore } from './store/gameStore'

export default function App() {
  const selectedGalaxy = GameStore((state) => state.selectedGalaxy)

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

      {/* UI Overlay */}
      <HUD />
    </div>
  )
}
