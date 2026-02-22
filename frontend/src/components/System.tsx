import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import Planet from './Planet'
import { GameStore } from '../store/gameStore'

interface SystemData {
  id: string
  position: [number, number, number]
  planets: Array<{
    id: string
    position: number
    type: 'planet' | 'moon' | 'expedition'
    owner?: string
  }>
}

interface SystemProps {
  system: SystemData
}

export default function System({ system }: SystemProps) {
  const groupRef = useRef<THREE.Group>(null)
  const onSelectSystem = GameStore((state) => state.onSelectSystem)
  const orbitRingArray = useMemo(() => createOrbitRing(15), [])

  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.rotation.y += 0.0001
    }
  })

  const handleClick = () => {
    onSelectSystem(system.id)
  }

  return (
    <group ref={groupRef} position={system.position} onClick={handleClick}>
      {/* Star at center */}
      <mesh>
        <sphereGeometry args={[1.5, 32, 32]} />
        <meshBasicMaterial color="#FDB813" />
      </mesh>

      {/* Star glow effect */}
      <mesh>
        <sphereGeometry args={[2, 32, 32]} />
        <meshBasicMaterial
          color="#FDB813"
          transparent
          opacity={0.2}
          wireframe={false}
        />
      </mesh>

      {/* Orbital ring */}
      <line>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[orbitRingArray, 3]}
          />
        </bufferGeometry>
        <lineBasicMaterial color="#4A90E2" opacity={0.4} transparent />
      </line>

      {/* Planets orbiting */}
      {system.planets.map((planet, idx) => (
        <Planet
          key={planet.id}
          planet={planet}
          orbitRadius={10 + idx * 2}
          speed={0.01 - idx * 0.001}
        />
      ))}
    </group>
  )
}

function createOrbitRing(radius: number): Float32Array {
  const points = []
  const segments = 64
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2
    points.push(Math.cos(angle) * radius, 0, Math.sin(angle) * radius)
  }
  return new Float32Array(points)
}
