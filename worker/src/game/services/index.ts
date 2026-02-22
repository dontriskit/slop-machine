// Service exports for game logic

export { CoordinateService, coordinateService } from './coordinateService';
export type {
  FleetMissionPlan,
  FleetStats,
  DispatchParams,
  DispatchValidation,
  FleetArrivalResult,
  FleetReturnResult,
  DefenderData,
  DebrisField,
} from './fleetService';
export {
  FleetService,
  fleetService,
  dispatchFleet,
  processFleetArrival,
  processFleetReturn,
  calculateFlightTime,
  calculateFuelCost,
} from './fleetService';
export { PlanetPlacementService, planetPlacementService } from './planetPlacementService';
export type { PlacementAttempt } from './planetPlacementService';
export type { BattleRound, BattleReport, BattleResult, BattleState, Combatant, TechLevels } from './battleService';
export { BattleService, battleService, simulateBattle } from './battleService';
export type { MissionPreparation, MissionArrival } from './missionService';
export { MissionService, missionService } from './missionService';
export type { TechDefinition, TechPrerequisite, TechEffect, TechEffectDetail } from './researchService';
export {
  TECH_DEFINITIONS,
  TECH_ID_TO_KEY,
  TECH_KEY_TO_ID,
  getEmptyTechLevels,
  getResearchCost,
  getResearchTime,
  canResearch,
  getTechEffect,
  startResearch,
  completeResearch,
  cancelResearch,
  ResearchService,
  researchService,
} from './researchService';
