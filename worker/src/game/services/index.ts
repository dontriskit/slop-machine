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
export type { BattleRound, BattleReport, BattleResult, BattleState, Combatant, CombatTechLevels } from './battleService';
export { BattleService, battleService, simulateBattle, toCombatTech } from './battleService';
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
export type {
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
export type {
  EspionageReport,
  CounterEspionageResult,
  EspionageNotification,
  EspionageParams,
} from './espionageService';
export {
  EspionageService,
  espionageService,
  InfoLevel,
  generateEspionageReport,
  calculateCounterChance,
  calculateEffectiveSpyDiff,
} from './espionageService';

export * from './messageService';
export type {
  ExpeditionEventType,
  ExpeditionEvent,
  ExpeditionResult,
  NPCFleetOptions,
} from './expeditionService';
export {
  EXPEDITION_EVENTS,
  resolveExpedition,
  generateNPCFleet,
  calculateExpeditionLoot,
  calculateFleetValue,
  ExpeditionService,
  expeditionService,
} from './expeditionService';
