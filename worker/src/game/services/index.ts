// Service exports for game logic

export { CoordinateService, coordinateService } from './coordinateService';
export type { FleetMissionPlan, FleetStats } from './fleetService';
export { FleetService, fleetService } from './fleetService';
export { PlanetPlacementService, planetPlacementService } from './planetPlacementService';
export type { PlacementAttempt } from './planetPlacementService';
export type { BattleRound, BattleReport, BattleResult, BattleState, Combatant, TechLevels } from './battleService';
export { BattleService, battleService, simulateBattle } from './battleService';
export type { MissionPreparation, MissionArrival } from './missionService';
export { MissionService, missionService } from './missionService';
