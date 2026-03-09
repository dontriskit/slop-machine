/**
 * Derive planet image type from orbital position (1–15).
 *
 * Position ranges (matching OGame convention):
 *   1–3   → dry / desert (scorching inner orbits)
 *   4–6   → jungle       (warm inner habitable zone)
 *   7–9   → normal       (temperate zone)
 *   10–12 → water        (cool outer zone)
 *   13–15 → ice / gas    (frozen outer orbits)
 */
export function planetTypeFromPosition(position: number): string {
  if (position <= 3)  return 'dry'
  if (position <= 6)  return 'jungle'
  if (position <= 9)  return 'normal'
  if (position <= 12) return 'water'
  return 'ice'
}

/**
 * Return the public path to a small planet thumbnail.
 * Uses a deterministic but visually varied variant (1–10) derived from position.
 */
export function planetSmallImg(position: number): string {
  const type = planetTypeFromPosition(position)
  // Spread variants 1-10 across positions so adjacent slots look different
  const variant = ((position - 1) % 10) + 1
  return `/img/planets/small/${type}_${variant}.png`
}

/**
 * Parse position from a coordinate string like "1:123:7" → 7.
 * Returns 7 (temperate default) if parsing fails.
 */
export function positionFromCoords(coordinates: string): number {
  const parts = coordinates.split(':')
  if (parts.length === 3) {
    const pos = parseInt(parts[2], 10)
    if (!isNaN(pos) && pos >= 1 && pos <= 15) return pos
  }
  return 7
}
