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
export type { BattleRound, BattleReport, Combatant } from './battleService';
export { BattleService, battleService } from './battleService';
export type { MissionPreparation, MissionArrival } from './missionService';
export { MissionService, missionService } from './missionService';
