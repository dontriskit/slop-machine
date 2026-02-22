/**
 * Moon Service — Creation and State Management
 *
 * Moons are created from battle debris fields with probability-based spawning.
 * Each moon is assigned a random number of building fields (3000-9000).
 * Max 1 moon per planet position.
 *
 * Moon Creation Chance Formula:
 *   chance = min(totalDebrisUnits / 100000 * 20, 20)%
 *   - 0% chance if debris < 10,000 units (metal + crystal combined)
 *   - 20% max chance at 100k+ units
 */

import { Resources } from '../types';

export interface Moon {
  id: string;
  planetId: string;
  name: string;
  fields: number;        // Building fields (3000-9000)
  size: number;          // Moon diameter in km (decorative)
  createdAt: number;     // Unix timestamp
}

export interface CreateMoonInput {
  planetId: string;
  playerId: string;
  debrisMetalCost: number;   // Total metal cost of destroyed ships
  debisCrystalCost: number;  // Total crystal cost of destroyed ships
  db: D1Database;
}

/**
 * Calculate moon creation chance as percentage (0-20%)
 *
 * Formula: min((debris_units / 100000) * 20, 20)
 * where debris_units = metalDebris + crystalDebris (in resource units, not credits)
 */
export function calculateMoonChance(debrisMetalCost: number, debisCrystalCost: number): number {
  // Convert ship costs to approximate units (rough conversion)
  const totalDebrisUnits = Math.floor((debrisMetalCost + debisCrystalCost) / 500);

  // Minimum 10k units required for any chance
  if (totalDebrisUnits < 10_000) {
    return 0;
  }

  // Chance = (debrisUnits / 100_000) * 20, capped at 20%
  const chance = Math.min((totalDebrisUnits / 100_000) * 20, 20);
  return chance;
}

/**
 * Generate random moon size (fields) between 3000-9000
 */
export function generateMoonSize(): number {
  const baseSize = 3000;
  const maxAdditional = 6000;
  return baseSize + Math.floor(Math.random() * maxAdditional);
}

/**
 * Generate random moon diameter (km) for display purposes (5000-15000 km)
 */
export function generateMoonDiameter(): number {
  return 5000 + Math.floor(Math.random() * 10000);
}

/**
 * Attempt to create a moon from battle debris.
 *
 * Rolls a random chance against calculateMoonChance().
 * If successful and no moon exists for this planet, creates the moon.
 *
 * @returns Created moon if successful, null if chance failed or moon already exists
 */
export async function createMoonFromDebris(input: CreateMoonInput): Promise<Moon | null> {
  const { planetId, playerId, debrisMetalCost, debisCrystalCost, db } = input;

  // Check if moon already exists
  const existingMoon = await getMoonByPlanetId(planetId, db);
  if (existingMoon) {
    console.log(`[Moon] Moon already exists for planet ${planetId}, skipping creation`);
    return null;
  }

  // Calculate creation chance
  const chance = calculateMoonChance(debrisMetalCost, debisCrystalCost);
  const roll = Math.random() * 100;

  console.log(`[Moon] Debris chance for planet ${planetId}: ${chance.toFixed(1)}% (roll: ${roll.toFixed(1)})`);

  if (roll > chance) {
    console.log(`[Moon] Creation failed (rolled ${roll.toFixed(1)} vs ${chance.toFixed(1)}%)`);
    return null;
  }

  // Success! Create the moon
  const moonId = `moon_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const fields = generateMoonSize();
  const size = generateMoonDiameter();
  const now = Math.floor(Date.now() / 1000);

  try {
    await db
      .prepare(
        `INSERT INTO moons (id, planet_id, name, fields, size, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(moonId, planetId, 'Moon', fields, size, now)
      .run();

    console.log(`[Moon] Successfully created moon ${moonId} for planet ${planetId} (${fields} fields, ${size}km)`);

    return {
      id: moonId,
      planetId,
      name: 'Moon',
      fields,
      size,
      createdAt: now,
    };
  } catch (error) {
    console.error(`[Moon] Failed to create moon for planet ${planetId}:`, error);
    return null;
  }
}

/**
 * Get moon by planet ID
 */
export async function getMoonByPlanetId(planetId: string, db: D1Database): Promise<Moon | null> {
  try {
    const result = await db
      .prepare(`SELECT id, planet_id, name, fields, size, created_at FROM moons WHERE planet_id = ? LIMIT 1`)
      .bind(planetId)
      .first<any>();

    if (!result) {
      return null;
    }

    return {
      id: result.id,
      planetId: result.planet_id,
      name: result.name,
      fields: result.fields,
      size: result.size,
      createdAt: result.created_at,
    };
  } catch (error) {
    console.error(`[Moon] Error fetching moon for planet ${planetId}:`, error);
    return null;
  }
}

/**
 * Get moon by moon ID
 */
export async function getMoonById(moonId: string, db: D1Database): Promise<Moon | null> {
  try {
    const result = await db
      .prepare(`SELECT id, planet_id, name, fields, size, created_at FROM moons WHERE id = ? LIMIT 1`)
      .bind(moonId)
      .first<any>();

    if (!result) {
      return null;
    }

    return {
      id: result.id,
      planetId: result.planet_id,
      name: result.name,
      fields: result.fields,
      size: result.size,
      createdAt: result.created_at,
    };
  } catch (error) {
    console.error(`[Moon] Error fetching moon ${moonId}:`, error);
    return null;
  }
}

/**
 * Get all moons for a player
 */
export async function getMoonsByPlayerId(playerId: string, db: D1Database): Promise<Moon[]> {
  try {
    const results = await db
      .prepare(
        `SELECT m.id, m.planet_id, m.name, m.fields, m.size, m.created_at
         FROM moons m
         JOIN planets p ON m.planet_id = p.id
         WHERE p.player_id = ?
         ORDER BY m.created_at DESC`
      )
      .bind(playerId)
      .all<any>();

    return results.results?.map((row) => ({
      id: row.id,
      planetId: row.planet_id,
      name: row.name,
      fields: row.fields,
      size: row.size,
      createdAt: row.created_at,
    })) ?? [];
  } catch (error) {
    console.error(`[Moon] Error fetching moons for player ${playerId}:`, error);
    return [];
  }
}
