import { Canvas } from '@react-three/fiber'
import { PerspectiveCamera, OrbitControls } from '@react-three/drei'
import { Suspense, useState, useEffect, useCallback } from 'react'
import Galaxy from './components/Galaxy'
import HUD from './components/HUD'
import GalaxyMap from './components/GalaxyMap'
import Leaderboard from './components/Leaderboard'
import PlayerProfile from './components/PlayerProfile'
import ResourceTrader from './components/ResourceTrader'
import ResearchTree from './components/ResearchTree'
import FleetDispatch from './components/FleetDispatch'
import ResourceChart from './components/ResourceChart'
import { GameStore } from './store/gameStore'

// ---------------------------------------------------------------------------
// Modal overlay wrapper — closes on backdrop click
// ---------------------------------------------------------------------------

function ModalOverlay({
  onClose,
  children,
}: {
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div
      className="modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.78)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 500,
        overflowY: 'auto',
        padding: '8px',
      }}
      onClick={onClose}
    >
      <div
        className="modal-inner"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '100%' }}
      >
        {children}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

type Panel = 'galaxy-map' | 'leaderboard' | 'trader' | 'profile' | 'research' | 'fleet' | 'chart' | null

export default function App() {
  const selectedGalaxy = GameStore((state) => state.selectedGalaxy)

  const [activePanel, setActivePanel]       = useState<Panel>(null)
  const [profilePlayerId, setProfilePlayerId] = useState<string | null>(null)

  const closePanel = useCallback(() => {
    setActivePanel(null)
    setProfilePlayerId(null)
  }, [])

  const openProfile = useCallback((playerId: string) => {
    setProfilePlayerId(playerId)
    setActivePanel('profile')
  }, [])

  // Global keyboard shortcuts:
  //   G — Galaxy Map
  //   L — Leaderboard
  //   T — Trader
  //   R — Research Tree
  //   F — Fleet Dispatch
  //   C — Resource Chart
  //   Escape — close any open panel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return

      if (e.key === 'Escape') {
        setActivePanel(null)
        setProfilePlayerId(null)
        return
      }
      if (e.key === 'g' || e.key === 'G') {
        setActivePanel((p) => (p === 'galaxy-map' ? null : 'galaxy-map'))
      }
      if (e.key === 'l' || e.key === 'L') {
        setActivePanel((p) => (p === 'leaderboard' ? null : 'leaderboard'))
      }
      if (e.key === 't' || e.key === 'T') {
        setActivePanel((p) => (p === 'trader' ? null : 'trader'))
      }
      if (e.key === 'r' || e.key === 'R') {
        setActivePanel((p) => (p === 'research' ? null : 'research'))
      }
      if (e.key === 'f' || e.key === 'F') {
        setActivePanel((p) => (p === 'fleet' ? null : 'fleet'))
      }
      if (e.key === 'c' || e.key === 'C') {
        setActivePanel((p) => (p === 'chart' ? null : 'chart'))
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

      {/* HUD Overlay — passes callbacks for opening panels */}
      <HUD
        onOpenGalaxyMap={() => setActivePanel('galaxy-map')}
        onOpenLeaderboard={() => setActivePanel('leaderboard')}
        onOpenTrader={() => setActivePanel('trader')}
        onOpenResearch={() => setActivePanel('research')}
        onOpenFleet={() => setActivePanel('fleet')}
        onOpenChart={() => setActivePanel('chart')}
      />

      {/* Galaxy Map modal */}
      {activePanel === 'galaxy-map' && (
        <ModalOverlay onClose={closePanel}>
          <GalaxyMap onClose={closePanel} />
        </ModalOverlay>
      )}

      {/* Leaderboard modal */}
      {activePanel === 'leaderboard' && (
        <ModalOverlay onClose={closePanel}>
          <Leaderboard
            onClose={closePanel}
            onSelectPlayer={(playerId) => openProfile(playerId)}
          />
        </ModalOverlay>
      )}

      {/* Resource Trader modal */}
      {activePanel === 'trader' && (
        <ModalOverlay onClose={closePanel}>
          <ResourceTrader onClose={closePanel} />
        </ModalOverlay>
      )}

      {/* Research Tree modal */}
      {activePanel === 'research' && (
        <ModalOverlay onClose={closePanel}>
          <ResearchTree onClose={closePanel} />
        </ModalOverlay>
      )}

      {/* Fleet Dispatch modal */}
      {activePanel === 'fleet' && (
        <ModalOverlay onClose={closePanel}>
          <FleetDispatch onClose={closePanel} />
        </ModalOverlay>
      )}

      {/* Resource Chart modal */}
      {activePanel === 'chart' && (
        <ModalOverlay onClose={closePanel}>
          <ResourceChart onClose={closePanel} />
        </ModalOverlay>
      )}

      {/* Player Profile modal — opened from Leaderboard or elsewhere */}
      {activePanel === 'profile' && profilePlayerId && (
        <ModalOverlay onClose={closePanel}>
          <PlayerProfile playerId={profilePlayerId} onClose={closePanel} />
        </ModalOverlay>
      )}
    </div>
  )
}
