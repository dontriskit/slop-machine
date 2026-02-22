// Service exports for game logic

export { CoordinateService, coordinateService } from './coordinateService';
export type { FleetMissionPlan, FleetStats } from './fleetService';
export { FleetService, fleetService } from './fleetService';
export { PlanetPlacementService, planetPlacementService } from './planetPlacementService';
export type { PlacementAttempt } from './planetPlacementService';
export type { BattleRound, BattleReport, Combatant } from './battleService';
export { BattleService, battleService } from './battleService';
export type { MissionPreparation, MissionArrival } from './missionService';
export { MissionService, missionService } from './missionService';
export type {
  DebrisField,
  SlotPlanet,
  SystemSlot,
  SystemView,
  GalaxySummaryEntry,
  ColonizeRequest,
  ColonizeResult,
} from './galaxyService';
export {
  GalaxyService,
  getTemperatureForPosition,
  getFieldsForPosition,
  getTemperatureRange,
  getFieldsRange,
} from './galaxyService';
