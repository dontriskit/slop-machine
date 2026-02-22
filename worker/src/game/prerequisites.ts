import { BuildingLevels, TechLevels } from './types';

/**
 * Building Prerequisites — Canonical OGame tech tree for buildings
 *
 * Each building may require other buildings and/or technologies at specific levels.
 * These are checked before allowing a building upgrade.
 */

export interface BuildingPrerequisite {
  buildings?: Partial<Record<keyof BuildingLevels, number>>;
  techs?: Partial<Record<keyof TechLevels, number>>;
}

/**
 * Building prerequisites following canonical OGame rules:
 *
 * | Building          | Requirements                                      |
 * |-------------------|--------------------------------------------------|
 * | Metal Mine        | (none)                                            |
 * | Crystal Mine      | (none)                                            |
 * | Deuterium Synth   | (none)                                            |
 * | Solar Plant       | (none)                                            |
 * | Fusion Reactor    | Deuterium Synth 5, Energy Tech 3                  |
 * | Robotics Factory  | (none)                                            |
 * | Nanite Factory    | Robotics Factory 10, Computer Tech 10             |
 * | Shipyard          | Robotics Factory 2                                |
 * | Research Lab      | (none)                                            |
 * | Metal Storage     | (none)                                            |
 * | Crystal Storage   | (none)                                            |
 * | Deuterium Tank    | (none)                                            |
 */
export const BUILDING_PREREQUISITES: Record<keyof BuildingLevels, BuildingPrerequisite> = {
  metalMine: {},
  crystalMine: {},
  deutSynth: {},
  solarPlant: {},
  fusionReactor: {
    buildings: { deutSynth: 5 },
    techs: { energyTech: 3 },
  },
  roboticsFactory: {},
  naniteFactory: {
    buildings: { roboticsFactory: 10 },
    techs: { computerTech: 10 },
  },
  shipyard: {
    buildings: { roboticsFactory: 2 },
  },
  researchLab: {},
  metalStorage: {},
  crystalStorage: {},
  deutTank: {},
};

export interface PrerequisiteCheckResult {
  met: boolean;
  missing: string[];
}

/**
 * Check whether all prerequisites are met for a building upgrade.
 *
 * @param buildingKey - The building to check prerequisites for
 * @param buildings   - Current building levels on the planet
 * @param techLevels  - Player's current technology levels
 * @returns PrerequisiteCheckResult with met flag and list of missing prerequisites
 */
export function checkBuildingPrerequisites(
  buildingKey: keyof BuildingLevels,
  buildings: BuildingLevels,
  techLevels: TechLevels,
): PrerequisiteCheckResult {
  const prereq = BUILDING_PREREQUISITES[buildingKey];
  if (!prereq) {
    return { met: true, missing: [] };
  }

  const missing: string[] = [];

  // Check building prerequisites
  if (prereq.buildings) {
    for (const [reqBuilding, reqLevel] of Object.entries(prereq.buildings)) {
      const currentLevel = buildings[reqBuilding as keyof BuildingLevels] ?? 0;
      if (currentLevel < (reqLevel as number)) {
        missing.push(`${reqBuilding} level ${reqLevel} required (current: ${currentLevel})`);
      }
    }
  }

  // Check tech prerequisites
  if (prereq.techs) {
    for (const [reqTech, reqLevel] of Object.entries(prereq.techs)) {
      const currentLevel = techLevels[reqTech as keyof TechLevels] ?? 0;
      if (currentLevel < (reqLevel as number)) {
        missing.push(`${reqTech} level ${reqLevel} required (current: ${currentLevel})`);
      }
    }
  }

  return {
    met: missing.length === 0,
    missing,
  };
}

/**
 * BUILDING_ID_TO_KEY mapping (same as in PlanetDO but exported for reuse)
 */
export const BUILDING_ID_TO_KEY: Record<number, keyof BuildingLevels> = {
  1: 'metalMine',
  2: 'crystalMine',
  3: 'deutSynth',
  4: 'solarPlant',
  12: 'fusionReactor',
  14: 'roboticsFactory',
  15: 'naniteFactory',
  21: 'shipyard',
  31: 'researchLab',
  22: 'metalStorage',
  23: 'crystalStorage',
  24: 'deutTank',
};
