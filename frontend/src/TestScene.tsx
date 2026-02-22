// Minimal test to verify Three.js rendering works
export function TestScene() {
  return (
    <mesh position={[0, 0, 0]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial color="#00FF00" />
    </mesh>
  )
}
