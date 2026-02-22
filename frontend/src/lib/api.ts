/**
 * Typed API client for the Cosmic Protocol Cloudflare Worker.
 *
 * Every function retries once on network failure (not on HTTP errors).
 * All responses are typed to match the Worker's actual return shapes.
 */

import { API_BASE_URL } from './config'

// ---------------------------------------------------------------------------
// Types (mirroring worker/src/game/types.ts)
// ---------------------------------------------------------------------------

export interface Resources {
  metal: number
  crystal: number
  deuterium: number
}

export interface BuildingLevels {
  metalMine: number
  crystalMine: number
  deutSynth: number
  solarPlant: number
  fusionReactor: number
  roboticsFactory: number
  naniteFactory: number
  shipyard: number
  researchLab: number
  metalStorage: number
  crystalStorage: number
  deutTank: number
}

export interface QueueItem {
  buildingId: number
  targetLevel: number
  timeStart: number
  timeEnd: number
  costMetal: number
  costCrystal: number
  costDeuterium: number
}

export interface Coordinate {
  galaxy: number
  system: number
  position: number
}

export interface PlanetState {
  planetId: string
  playerId: string
  coordinate: Coordinate
  planetType: string
  name: string
  temperature: number
  fields: number
  universeSpeed: number
  buildings: BuildingLevels
  resources: Resources
  queue: QueueItem[]
  lastTickAt: number
}

export interface ResourcesResponse {
  resources: Resources
  production: {
    metalPerHour: number
    crystalPerHour: number
    deutPerHour: number
  }
}

export interface AddQueueResponse {
  queueItem: QueueItem
  resources: Resources
  queue: QueueItem[]
}

export interface AgentDecision {
  action: 'build' | 'wait'
  buildingId?: number
  reason: string
}

export interface AgentRunResponse {
  decision: AgentDecision
}

export interface AgentToggleResponse {
  agent_enabled: boolean
}

export interface StrategyStep {
  buildingId: number
  targetLevel: number
}

export interface Strategy {
  id: string
  playerId?: string
  name: string
  steps: StrategyStep[] | string
}

export interface ApiError {
  error: string
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

class ApiClientError extends Error {
  status: number
  body: ApiError

  constructor(status: number, body: ApiError) {
    super(body.error ?? `HTTP ${status}`)
    this.name = 'ApiClientError'
    this.status = status
    this.body = body
  }
}

async function request<T>(
  path: string,
  init?: RequestInit,
  retriesLeft = 1,
): Promise<T> {
  const url = `${API_BASE_URL}${path}`
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    })

    if (!res.ok) {
      let body: ApiError
      try {
        body = (await res.json()) as ApiError
      } catch {
        body = { error: `HTTP ${res.status} ${res.statusText}` }
      }
      throw new ApiClientError(res.status, body)
    }

    return (await res.json()) as T
  } catch (err) {
    // Retry on network failure (TypeError from fetch), not on HTTP errors
    if (err instanceof TypeError && retriesLeft > 0) {
      return request<T>(path, init, retriesLeft - 1)
    }
    throw err
  }
}

// ---------------------------------------------------------------------------
// Planet endpoints
// ---------------------------------------------------------------------------

export function getPlanetState(planetId: string): Promise<PlanetState> {
  return request<PlanetState>(`/api/planet/${encodeURIComponent(planetId)}/state`)
}

export function getPlanetResources(
  planetId: string,
): Promise<ResourcesResponse> {
  return request<ResourcesResponse>(
    `/api/planet/${encodeURIComponent(planetId)}/resources`,
  )
}

export function getPlanetBuildings(
  planetId: string,
): Promise<BuildingLevels> {
  return request<BuildingLevels>(
    `/api/planet/${encodeURIComponent(planetId)}/buildings`,
  )
}

// ---------------------------------------------------------------------------
// Queue endpoints
// ---------------------------------------------------------------------------

export function addToQueue(
  planetId: string,
  buildingId: number,
  targetLevel: number,
): Promise<AddQueueResponse> {
  return request<AddQueueResponse>(
    `/api/planet/${encodeURIComponent(planetId)}/queue`,
    {
      method: 'POST',
      body: JSON.stringify({ buildingId, targetLevel }),
    },
  )
}

export function getQueue(planetId: string): Promise<QueueItem[]> {
  return request<QueueItem[]>(
    `/api/planet/${encodeURIComponent(planetId)}/queue`,
  )
}

// ---------------------------------------------------------------------------
// Agent endpoints
// ---------------------------------------------------------------------------

export function runAgent(planetId: string): Promise<AgentRunResponse> {
  return request<AgentRunResponse>(
    `/api/planet/${encodeURIComponent(planetId)}/agent/run`,
    { method: 'POST' },
  )
}

export function enableAgent(
  planetId: string,
): Promise<AgentToggleResponse> {
  return request<AgentToggleResponse>(
    `/api/planet/${encodeURIComponent(planetId)}/agent/enable`,
    { method: 'POST' },
  )
}

export function disableAgent(
  planetId: string,
): Promise<AgentToggleResponse> {
  return request<AgentToggleResponse>(
    `/api/planet/${encodeURIComponent(planetId)}/agent/disable`,
    { method: 'POST' },
  )
}

// ---------------------------------------------------------------------------
// Strategy endpoints
// ---------------------------------------------------------------------------

export function getStrategies(playerId: string): Promise<Strategy[]> {
  return request<Strategy[]>(
    `/api/strategies?player_id=${encodeURIComponent(playerId)}`,
  )
}

export function createStrategy(
  playerId: string,
  name: string,
  steps: StrategyStep[],
): Promise<Strategy & { id: string }> {
  return request<Strategy & { id: string }>('/api/strategies', {
    method: 'POST',
    body: JSON.stringify({ playerId, name, steps }),
  })
}

// Re-export the error class so consumers can check for API errors
export { ApiClientError }
