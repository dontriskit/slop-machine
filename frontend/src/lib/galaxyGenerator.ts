/**
 * Procedurally generate galaxy layout
 * Maps game coordinates to 3D space for visualization
 */

interface System {
  id: string
  position: [number, number, number]
  planets: Array<{
    id: string
    position: number
    type: 'planet' | 'moon' | 'expedition'
    owner?: string
  }>
}

interface GalaxyData {
  systems: System[]
}

export function generateGalaxy(galaxyId: number): GalaxyData {
  const systems: System[] = []

  // Generate 499 systems in a spiral pattern
  const systemsCount = 499
  const spiralTightness = 0.02

  for (let systemNum = 1; systemNum <= systemsCount; systemNum++) {
    const angle = systemNum * spiralTightness
    const radius = 2 + (systemNum / systemsCount) * 40

    const x = Math.cos(angle) * radius
    const z = Math.sin(angle) * radius
    const y = (Math.sin(systemNum * 0.01) * 3) // slight vertical variation

    const systemId = `${galaxyId}:${systemNum}`

    // Each system has 1-15 planets + 1 expedition slot
    const planetCount = 5 + Math.floor(Math.random() * 11)
    const planets = Array.from({ length: planetCount }, (_, i) => ({
      id: `${systemId}:${i + 1}`,
      position: i + 1,
      type: (Math.random() > 0.7 ? 'moon' : 'planet') as
        | 'planet'
        | 'moon'
        | 'expedition',
      owner: Math.random() > 0.7 ? 'player' : undefined,
    }))

    systems.push({
      id: systemId,
      position: [x, y, z],
      planets,
    })
  }

  return { systems }
}

/**
 * Convert game coordinates to 3D position
 */
export function coordinateTo3D(
  galaxy: number,
  system: number,
  position: number,
  offset: number = 0,
): [number, number, number] {
  const systemAngle = (system / 499) * Math.PI * 2
  const systemRadius = 2 + (system / 499) * 40
  const systemX = Math.cos(systemAngle) * systemRadius
  const systemZ = Math.sin(systemAngle) * systemRadius
  const systemY = Math.sin(system * 0.01) * 3

  // Position within system (planets orbit)
  const posAngle = (position / 15) * Math.PI * 2 + offset
  const posRadius = 10 + (position - 1) * 2
  const x = systemX + Math.cos(posAngle) * posRadius
  const z = systemZ + Math.sin(posAngle) * posRadius
  const y = systemY

  return [x, y, z]
}
