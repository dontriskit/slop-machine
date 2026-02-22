/**
 * Environment configuration for the frontend.
 *
 * In dev mode, Vite proxies /api requests to localhost:8787 (see vite.config.ts),
 * so we use a relative path. In production, set VITE_API_BASE_URL to the
 * deployed Worker URL.
 */

const isDev = import.meta.env.DEV

export const API_BASE_URL: string =
  import.meta.env.VITE_API_BASE_URL ?? (isDev ? '' : '')

// When API_BASE_URL is '' the browser fetches /api/... which Vite proxies in
// dev and is served by the same origin in production (typical CF Pages + Worker
// setup). Override via .env:
//   VITE_API_BASE_URL=https://my-worker.myname.workers.dev

export const RESOURCE_POLL_INTERVAL_MS = 5000
export const RESOURCE_INTERPOLATION_INTERVAL_MS = 1000
export const DEFAULT_PLANET_ID = '1:1:1'
export const DEFAULT_PLAYER_ID = 'player-1'
