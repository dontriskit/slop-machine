import { create } from 'zustand'

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

interface GameState {
  selectedGalaxy: number
  selectedSystem: string | null
  selectedPlanet: string | null
  systems: System[]

  setSelectedGalaxy: (galaxy: number) => void
  onSelectSystem: (systemId: string) => void
  onSelectPlanet: (planetId: string) => void
}

export const GameStore = create<GameState>((set) => ({
  selectedGalaxy: 1,
  selectedSystem: null,
  selectedPlanet: null,
  systems: [],

  setSelectedGalaxy: (galaxy) =>
    set({
      selectedGalaxy: galaxy,
      selectedSystem: null,
      selectedPlanet: null,
    }),

  onSelectSystem: (systemId) =>
    set({
      selectedSystem: systemId,
      selectedPlanet: null,
    }),

  onSelectPlanet: (planetId) =>
    set({
      selectedPlanet: planetId,
    }),
}))
