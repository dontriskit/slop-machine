import { useRef } from 'react'
import { useFrame, ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { GameStore } from '../store/gameStore'

interface PlanetData {
  id: string
  position: number
  type: 'planet' | 'moon' | 'expedition'
  owner?: string
}

interface PlanetProps {
  planet: PlanetData
  orbitRadius: number
  speed: number
}

const PLANET_COLORS: Record<string, string> = {
  planet: '#4A90E2',
  moon: '#A0A0A0',
  expedition: '#FF6B6B',
}

export default function Planet({
  planet,
  orbitRadius,
  speed,
}: PlanetProps) {
  const groupRef = useRef<THREE.Group>(null)
  const onSelectPlanet = GameStore((state) => state.onSelectPlanet)
  const angle = useRef(Math.random() * Math.PI * 2)

  useFrame(() => {
    if (groupRef.current) {
      angle.current += speed
      groupRef.current.position.x = Math.cos(angle.current) * orbitRadius
      groupRef.current.position.z = Math.sin(angle.current) * orbitRadius
      groupRef.current.rotation.y += 0.005
    }
  })

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    onSelectPlanet(planet.id)
  }

  const size =
    planet.type === 'moon' ? 0.4 : planet.type === 'expedition' ? 0.3 : 0.6
  const color = PLANET_COLORS[planet.type]

  return (
    <group ref={groupRef} onClick={handleClick}>
      {/* Planet sphere */}
      <mesh>
        <sphereGeometry args={[size, 32, 32]} />
        <meshPhongMaterial color={color} />
      </mesh>

      {/* Cartoonish outline */}
      <mesh>
        <sphereGeometry args={[size * 1.1, 32, 32]} />
        <meshBasicMaterial
          color="#000000"
          transparent
          opacity={0.3}
          wireframe={false}
        />
      </mesh>

      {/* Owner indicator (glow if owned) */}
      {planet.owner && (
        <mesh>
          <sphereGeometry args={[size * 1.3, 32, 32]} />
          <meshBasicMaterial
            color={planet.owner === 'player' ? '#00FF00' : '#FFD700'}
            transparent
            opacity={0.2}
            wireframe={false}
          />
        </mesh>
      )}
    </group>
  )
}
