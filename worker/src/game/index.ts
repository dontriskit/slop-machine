// Game module exports
// Types, formulas, and services for OGame simulation

// Types
export type {
  Coordinate,
  PlanetType,
  Resources,
  BuildingLevels,
  QueueItem,
  Ships,
  Fleet,
  FleetMission,
  FleetMissionType,
  FleetMissionStatus,
  PlanetState,
  StrategyStep,
  Strategy,
  AgentDecision,
} from './types';

export { BUILDING_ID, BUILDING_NAME, SHIP_KEYS } from './types';

// Defenses
export type { DefenseStructure, DefenseStructures, TechLevels } from './defenses';
export {
  DefenseType,
  DEFENSE_STATS,
  DEFENSE_COSTS,
  DEFENSE_REQUIREMENTS,
  DEFENSE_SPECS,
  DEFENSE_ID,
  DEFENSE_NAME,
  canBuildDefense,
  getDefenseBuildTime,
  calculateMissileAttack,
  repairDefenses,
  getMissileSiloCapacity,
  getStoredMissileCount,
  getDefensePower,
  getDefenseHull,
  getDefenseShield,
  getDefenseCost,
  getEmptyDefenses,
} from './defenses';

// Formulas
export {
  UNIVERSE_CONFIG,
  SHIP_SPEEDS,
  SHIP_FUEL,
  SHIP_CARGO,
  BASE_PRODUCTION,
  BUILDING_FACTORS,
  BUILDING_COSTS,
  normalizeCoordinate,
  isValidCoordinate,
  calculateDistance,
  getSlowestSpeed,
  calculateDuration,
  calculateFuelConsumption,
  calculateCargoCapacity,
  canCarryResources,
  calculateProduction,
  calculateBuildingCost,
  calculateBuildTime,
} from './formulas';

// Services
export * from './services';
