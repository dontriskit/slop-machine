import { create } from 'zustand'
import * as api from '../lib/api'
import {
  RESOURCE_POLL_INTERVAL_MS,
  RESOURCE_INTERPOLATION_INTERVAL_MS,
  getPlanetId,
} from '../lib/config'

// ---------------------------------------------------------------------------
// Marketplace types (kept here so components can import from store)
// ---------------------------------------------------------------------------

export type LeaderboardType = 'points' | 'fleet' | 'research' | 'economy'
export type TradeResource = 'metal' | 'crystal' | 'deuterium'

export interface LeaderboardEntry {
  rank: number
  playerId: string
  playerName: string
  allianceTag: string | null
  score: number
  economyScore: number
  researchScore: number
  fleetScore: number
  planetCount: number
}

export interface LeaderboardPage {
  type: LeaderboardType
  page: number
  limit: number
  total: number
  entries: LeaderboardEntry[]
}

export interface TradeOffer {
  id: string
  playerId: string
  playerName: string
  allianceTag: string | null
  planetId: string
  offerResource: TradeResource
  offerAmount: number
  wantResource: TradeResource
  wantAmount: number
  status: 'open' | 'accepted' | 'cancelled'
  createdAt: number
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

/** Mock fallback data when API is unreachable */
const MOCK_RESOURCES: api.Resources = {
  metal: 500,
  crystal: 300,
  deuterium: 100,
}

const MOCK_PRODUCTION = {
  metalPerHour: 30,
  crystalPerHour: 20,
  deutPerHour: 10,
}

const MOCK_BUILDINGS: api.BuildingLevels = {
  metalMine: 1,
  crystalMine: 1,
  deutSynth: 0,
  solarPlant: 1,
  fusionReactor: 0,
  roboticsFactory: 0,
  naniteFactory: 0,
  shipyard: 0,
  researchLab: 0,
  metalStorage: 1,
  crystalStorage: 1,
  deutTank: 1,
}

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

interface GameState {
  // Galaxy / navigation
  selectedGalaxy: number
  selectedSystem: string | null
  selectedPlanet: string | null
  activePlanetId: string
  systems: System[]

  // Planet data from API
  planetState: api.PlanetState | null
  resources: api.Resources
  production: { metalPerHour: number; crystalPerHour: number; deutPerHour: number }
  buildings: api.BuildingLevels
  queue: api.QueueItem[]

  // Agent
  agentEnabled: boolean
  agentRunning: boolean
  lastAgentDecision: api.AgentDecision | null

  // Loading / error
  loading: boolean
  error: string | null
  apiReachable: boolean

  // Leaderboard
  leaderboard: LeaderboardPage | null
  leaderboardLoading: boolean

  // Trades
  trades: TradeOffer[]
  tradesLoading: boolean

  // Actions
  setSelectedGalaxy: (galaxy: number) => void
  onSelectSystem: (systemId: string) => void
  onSelectPlanet: (planetId: string) => void
  setActivePlanet: (planetId: string) => void

  // API actions
  fetchPlanetState: () => Promise<void>
  fetchResources: () => Promise<void>
  fetchBuildings: () => Promise<void>
  fetchQueue: () => Promise<void>
  addToQueue: (buildingId: number, targetLevel: number) => Promise<void>
  toggleAgent: () => Promise<void>
  runAgentNow: () => Promise<void>

  // Marketplace actions
  fetchLeaderboard: (type: LeaderboardType, page: number, limit: number) => Promise<void>
  fetchTrades: (filter?: TradeResource) => Promise<void>
  createTrade: (
    planetId: string,
    offerResource: TradeResource,
    offerAmount: number,
    wantResource: TradeResource,
    wantAmount: number,
    playerId: string
  ) => Promise<boolean>
  acceptTrade: (tradeId: string, playerId: string, planetId: string) => Promise<boolean>
  cancelTrade: (tradeId: string, playerId: string) => Promise<boolean>

  // Polling / interpolation
  _startPolling: () => void
  _stopPolling: () => void
  _interpolateResources: () => void
}

// Timer handles stored outside Zustand to avoid serialization issues
let _pollTimer: ReturnType<typeof setInterval> | null = null
let _interpTimer: ReturnType<typeof setInterval> | null = null
let _lastResourceFetchMs = 0

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const GameStore = create<GameState>((set, get) => ({
  // Galaxy / navigation
  selectedGalaxy: 1,
  selectedSystem: null,
  selectedPlanet: null,
  activePlanetId: getPlanetId(),
  systems: [],

  // Planet data
  planetState: null,
  resources: { ...MOCK_RESOURCES },
  production: { ...MOCK_PRODUCTION },
  buildings: { ...MOCK_BUILDINGS },
  queue: [],

  // Agent
  agentEnabled: false,
  agentRunning: false,
  lastAgentDecision: null,

  // Loading / error
  loading: false,
  error: null,
  apiReachable: true,

  // Leaderboard
  leaderboard: null,
  leaderboardLoading: false,

  // Trades
  trades: [],
  tradesLoading: false,

  // ------- Navigation -------

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
    set({ selectedPlanet: planetId }),

  setActivePlanet: (planetId) => {
    set({ activePlanetId: planetId, loading: true, error: null })
    get().fetchPlanetState()
  },

  // ------- API actions -------

  fetchPlanetState: async () => {
    const { activePlanetId } = get()
    set({ loading: true, error: null })
    try {
      const state = await api.getPlanetState(activePlanetId)
      _lastResourceFetchMs = Date.now()
      set({
        planetState: state,
        resources: { ...state.resources },
        buildings: { ...state.buildings },
        queue: [...state.queue],
        production: { metalPerHour: 0, crystalPerHour: 0, deutPerHour: 0 },
        loading: false,
        apiReachable: true,
      })
      // Also fetch production rates
      get().fetchResources()
    } catch (err) {
      console.warn('[GameStore] fetchPlanetState failed, falling back to mock data:', err)
      set({
        loading: false,
        error: err instanceof Error ? err.message : String(err),
        apiReachable: false,
      })
    }
  },

  fetchResources: async () => {
    const { activePlanetId } = get()
    try {
      const data = await api.getPlanetResources(activePlanetId)
      _lastResourceFetchMs = Date.now()
      set({
        resources: { ...data.resources },
        production: { ...data.production },
        apiReachable: true,
        error: null,
      })
    } catch (err) {
      console.warn('[GameStore] fetchResources failed:', err)
      set({
        apiReachable: false,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  },

  fetchBuildings: async () => {
    const { activePlanetId } = get()
    try {
      const data = await api.getPlanetBuildings(activePlanetId)
      set({ buildings: { ...data }, apiReachable: true })
    } catch (err) {
      console.warn('[GameStore] fetchBuildings failed:', err)
    }
  },

  fetchQueue: async () => {
    const { activePlanetId } = get()
    try {
      const data = await api.getQueue(activePlanetId)
      set({ queue: [...data], apiReachable: true })
    } catch (err) {
      console.warn('[GameStore] fetchQueue failed:', err)
    }
  },

  addToQueue: async (buildingId, targetLevel) => {
    const { activePlanetId } = get()
    set({ loading: true, error: null })
    try {
      const data = await api.addToQueue(activePlanetId, buildingId, targetLevel)
      _lastResourceFetchMs = Date.now()
      set({
        resources: { ...data.resources },
        queue: [...data.queue],
        loading: false,
        apiReachable: true,
      })
      // Refresh buildings since queue completion may have updated them
      get().fetchBuildings()
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  },

  toggleAgent: async () => {
    const { activePlanetId, agentEnabled } = get()
    try {
      if (agentEnabled) {
        await api.disableAgent(activePlanetId)
        set({ agentEnabled: false, apiReachable: true })
      } else {
        await api.enableAgent(activePlanetId)
        set({ agentEnabled: true, apiReachable: true })
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    }
  },

  runAgentNow: async () => {
    const { activePlanetId } = get()
    set({ agentRunning: true, error: null })
    try {
      const data = await api.runAgent(activePlanetId)
      set({
        agentRunning: false,
        lastAgentDecision: data.decision,
        apiReachable: true,
      })
      // Refresh state after agent decision
      get().fetchPlanetState()
    } catch (err) {
      set({
        agentRunning: false,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  },

  // ------- Marketplace actions -------

  fetchLeaderboard: async (type, page, limit) => {
    set({ leaderboardLoading: true })
    try {
      const res = await fetch(`/api/leaderboard?type=${type}&page=${page}&limit=${limit}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: LeaderboardPage = await res.json()
      set({ leaderboard: data, leaderboardLoading: false })
    } catch (err) {
      console.warn('[GameStore] fetchLeaderboard failed:', err)
      set({ leaderboardLoading: false })
    }
  },

  fetchTrades: async (filter) => {
    set({ tradesLoading: true })
    try {
      const params = new URLSearchParams({ limit: '20' })
      if (filter) params.set('resource', filter)
      const res = await fetch(`/api/trades?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: { trades: TradeOffer[] } = await res.json()
      set({ trades: data.trades, tradesLoading: false })
    } catch (err) {
      console.warn('[GameStore] fetchTrades failed:', err)
      set({ tradesLoading: false })
    }
  },

  createTrade: async (planetId, offerResource, offerAmount, wantResource, wantAmount, playerId) => {
    try {
      const res = await fetch('/api/trades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId, planetId, offerResource, offerAmount, wantResource, wantAmount }),
      })
      if (!res.ok) return false
      await get().fetchTrades()
      return true
    } catch (err) {
      console.warn('[GameStore] createTrade failed:', err)
      return false
    }
  },

  acceptTrade: async (tradeId, playerId, planetId) => {
    try {
      const res = await fetch(`/api/trades/${encodeURIComponent(tradeId)}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId, planetId }),
      })
      if (!res.ok) return false
      set((state) => ({ trades: state.trades.filter((t) => t.id !== tradeId) }))
      return true
    } catch (err) {
      console.warn('[GameStore] acceptTrade failed:', err)
      return false
    }
  },

  cancelTrade: async (tradeId, playerId) => {
    try {
      const res = await fetch(
        `/api/trades/${encodeURIComponent(tradeId)}?playerId=${encodeURIComponent(playerId)}`,
        { method: 'DELETE' }
      )
      if (!res.ok) return false
      set((state) => ({ trades: state.trades.filter((t) => t.id !== tradeId) }))
      return true
    } catch (err) {
      console.warn('[GameStore] cancelTrade failed:', err)
      return false
    }
  },

  // ------- Polling / interpolation -------

  _startPolling: () => {
    // Stop existing timers first
    get()._stopPolling()

    // Initial load
    get().fetchPlanetState()

    // Resource polling every N seconds
    _pollTimer = setInterval(() => {
      get().fetchResources()
      get().fetchQueue()
    }, RESOURCE_POLL_INTERVAL_MS)

    // Client-side interpolation every second
    _interpTimer = setInterval(() => {
      get()._interpolateResources()
    }, RESOURCE_INTERPOLATION_INTERVAL_MS)
  },

  _stopPolling: () => {
    if (_pollTimer) {
      clearInterval(_pollTimer)
      _pollTimer = null
    }
    if (_interpTimer) {
      clearInterval(_interpTimer)
      _interpTimer = null
    }
  },

  _interpolateResources: () => {
    const { resources, production, apiReachable } = get()
    if (!apiReachable) return

    const elapsedMs = Date.now() - _lastResourceFetchMs
    const elapsedHours = elapsedMs / (1000 * 60 * 60)

    set({
      resources: {
        metal: Math.floor(resources.metal + production.metalPerHour * elapsedHours),
        crystal: Math.floor(resources.crystal + production.crystalPerHour * elapsedHours),
        deuterium: Math.floor(resources.deuterium + production.deutPerHour * elapsedHours),
      },
    })

    // Reset the reference point so we don't double-count
    _lastResourceFetchMs = Date.now()
  },
}))
