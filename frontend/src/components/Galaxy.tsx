import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { generateGalaxy } from '../lib/galaxyGenerator'
import System from './System'
import { GameStore } from '../store/gameStore'

interface GalaxyProps {
  galaxyId: number
}

export default function Galaxy({ galaxyId }: GalaxyProps) {
  const groupRef = useRef<THREE.Group>(null)
  const systems = GameStore((state) => state.systems)

  useEffect(() => {
    // Generate or fetch systems for this galaxy
    const data = generateGalaxy(galaxyId)
    GameStore.setState({ systems: data.systems })
  }, [galaxyId])

  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.rotation.z += 0.0001
    }
  })

  return (
    <group ref={groupRef}>
      {/* Galactic core glow */}
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[2, 32, 32]} />
        <meshBasicMaterial
          color="#FFD700"
          transparent
          opacity={0.3}
          wireframe={false}
        />
      </mesh>

      {/* Render all systems */}
      {systems.map((system) => (
        <System key={system.id} system={system} />
      ))}

      {/* Galactic ring of stars */}
      <GalacticRing />
    </group>
  )
}

function GalacticRing() {
  const starCount = 5000
  const positionsRef = useRef<Float32Array | null>(null)

  if (!positionsRef.current) {
    positionsRef.current = new Float32Array(starCount * 3)
    for (let i = 0; i < starCount * 3; i += 3) {
      const angle = Math.random() * Math.PI * 2
      const distance = 50 + Math.random() * 30
      positionsRef.current[i] = Math.cos(angle) * distance
      positionsRef.current[i + 1] = (Math.random() - 0.5) * 10
      positionsRef.current[i + 2] = Math.sin(angle) * distance
    }
  }

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positionsRef.current, 3]}
        />
      </bufferGeometry>
      <pointsMaterial size={0.3} color="#FFFFFF" transparent opacity={0.6} />
    </points>
  )
}
