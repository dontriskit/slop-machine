import { Canvas } from '@react-three/fiber'
import { PerspectiveCamera, OrbitControls } from '@react-three/drei'
import { Suspense, useState, useEffect, useCallback } from 'react'
import Galaxy from './components/Galaxy'
import HUD from './components/HUD'
import GalaxyMap from './components/GalaxyMap'
import WalletConnect from './components/WalletConnect'
import AssetMinter from './components/AssetMinter'
import NFTGallery from './components/NFTGallery'
import { GameStore } from './store/gameStore'

export default function App() {
  const selectedGalaxy = GameStore((state) => state.selectedGalaxy)
  const [showGalaxyMap, setShowGalaxyMap] = useState(false)
  const [showAssetStudio, setShowAssetStudio] = useState(false)

  const openMap = useCallback(() => setShowGalaxyMap(true), [])
  const closeMap = useCallback(() => setShowGalaxyMap(false), [])
  const toggleAssetStudio = useCallback(() => setShowAssetStudio((v) => !v), [])

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return
      if (e.key === 'g' || e.key === 'G') setShowGalaxyMap((v) => !v)
      if (e.key === 'a' || e.key === 'A') setShowAssetStudio((v) => !v)
      if (e.key === 'Escape') {
        setShowGalaxyMap(false)
        setShowAssetStudio(false)
      }
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

      {/* Wallet connect — top-center */}
      <div
        style={{
          position: 'fixed',
          top: 20,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 200,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <WalletConnect />
        <button
          onClick={toggleAssetStudio}
          style={{
            fontFamily: "'Courier New', monospace",
            fontSize: 11,
            padding: '6px 12px',
            border: '1px solid #ffaa00',
            background: showAssetStudio
              ? 'rgba(255, 170, 0, 0.3)'
              : 'rgba(255, 170, 0, 0.1)',
            color: '#ffaa00',
            cursor: 'pointer',
            borderRadius: 3,
            transition: 'all 0.2s',
            textShadow: '0 0 8px rgba(255, 170, 0, 0.6)',
            boxShadow: showAssetStudio
              ? '0 0 12px rgba(255, 170, 0, 0.4)'
              : 'none',
          }}
        >
          Asset Studio (A)
        </button>
      </div>

      {/* Galaxy Map modal */}
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
          <div onClick={(e) => e.stopPropagation()}>
            <GalaxyMap onClose={closeMap} />
          </div>
        </div>
      )}

      {/* Asset Studio modal */}
      {showAssetStudio && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            paddingTop: 80,
            gap: 20,
            zIndex: 500,
            overflowY: 'auto',
          }}
          onClick={toggleAssetStudio}
        >
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
            onClick={(e) => e.stopPropagation()}
          >
            <AssetMinter />
            <NFTGallery />
          </div>
        </div>
      )}
    </div>
  )
}
