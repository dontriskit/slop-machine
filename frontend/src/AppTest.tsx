import { Canvas } from '@react-three/fiber'
import { TestScene } from './TestScene'

// Minimal test version - renders a green cube to verify canvas works
export function AppTest() {
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <Canvas
        style={{ display: 'block', width: '100%', height: '100%' }}
        camera={{ position: [0, 0, 5] }}
      >
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} />
        <color attach="background" args={['#000000']} />
        <TestScene />
      </Canvas>
    </div>
  )
}
