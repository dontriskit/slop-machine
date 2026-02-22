// ============================================================================
// COORDINATE SYSTEM
// ============================================================================

export interface Coordinate {
  galaxy: number;   // 1 to N (typically 2-9)
  system: number;   // 1 to 499 (wraps around)
  position: number; // 1 to 15 (planets), 16 (expedition slot)
}

export type PlanetType = 'planet' | 'moon' | 'expedition';

// ============================================================================
// RESOURCES & BUILDINGS
// ============================================================================

export interface Resources {
  metal: number;
  crystal: number;
  deuterium: number;
}

export interface BuildingLevels {
  // Production
  metalMine: number;       // 1
  crystalMine: number;     // 2
  deutSynth: number;       // 3
  solarPlant: number;      // 4
  fusionReactor: number;   // 12
  // Facilities
  roboticsFactory: number; // 14
  naniteFactory: number;   // 15
  shipyard: number;        // 21
  researchLab: number;     // 31
  // Storage
  metalStorage: number;    // 22
  crystalStorage: number;  // 23
  deutTank: number;        // 24
}

export const BUILDING_ID: Record<keyof BuildingLevels, number> = {
  metalMine: 1,
  crystalMine: 2,
  deutSynth: 3,
  solarPlant: 4,
  fusionReactor: 12,
  roboticsFactory: 14,
  naniteFactory: 15,
  shipyard: 21,
  researchLab: 31,
  metalStorage: 22,
  crystalStorage: 23,
  deutTank: 24,
};

export const BUILDING_NAME: Record<number, string> = Object.fromEntries(
  Object.entries(BUILDING_ID).map(([name, id]) => [id, name])
);

// ============================================================================
// MOON BUILDINGS (Special buildings only available on moons)
// ============================================================================

export type MoonBuildingType = 'lunarBase' | 'sensorPhalanx' | 'jumpGate';

export interface MoonBuildingLevels {
  lunarBase: number;        // Provides +3 fields per level
  sensorPhalanx: number;    // Scans fleets at range = level²
  jumpGate: number;         // Instant transfer between moons
}

export const MOON_BUILDING_ID: Record<MoonBuildingType, number> = {
  lunarBase: 41,
  sensorPhalanx: 42,
  jumpGate: 43,
};

export const MOON_BUILDING_NAME: Record<number, string> = {
  41: 'lunarBase',
  42: 'sensorPhalanx',
  43: 'jumpGate',
};

// Ship type keys for database column naming
export const SHIP_KEYS: (keyof Ships)[] = [
  'lightFighter',
  'heavyFighter',
  'cruiser',
  'battleship',
  'battlecruiser',
  'bomber',
  'destroyer',
  'deathstar',
  'smallCargo',
  'largeCargo',
  'colonyShip',
  'recycler',
  'espionageProbe',
];

// Convert between database column names (snake_case) and TypeScript names (camelCase)
const SNAKE_TO_CAMEL: Record<string, keyof Ships> = {
  light_fighter: 'lightFighter',
  heavy_fighter: 'heavyFighter',
  cruiser: 'cruiser',
  battleship: 'battleship',
  battlecruiser: 'battlecruiser',
  bomber: 'bomber',
  destroyer: 'destroyer',
  deathstar: 'deathstar',
  small_cargo: 'smallCargo',
  large_cargo: 'largeCargo',
  colony_ship: 'colonyShip',
  recycler: 'recycler',
  espionage_probe: 'espionageProbe',
};

const CAMEL_TO_SNAKE: Record<keyof Ships, string> = {
  lightFighter: 'light_fighter',
  heavyFighter: 'heavy_fighter',
  cruiser: 'cruiser',
  battleship: 'battleship',
  battlecruiser: 'battlecruiser',
  bomber: 'bomber',
  destroyer: 'destroyer',
  deathstar: 'deathstar',
  smallCargo: 'small_cargo',
  largeCargo: 'large_cargo',
  colonyShip: 'colony_ship',
  recycler: 'recycler',
  espionageProbe: 'espionage_probe',
};

export function snakeToCamelShip(key: string): keyof Ships | undefined {
  return SNAKE_TO_CAMEL[key as keyof typeof SNAKE_TO_CAMEL];
}

export function camelToSnakeShip(key: keyof Ships): string {
  return CAMEL_TO_SNAKE[key];
}

export interface QueueItem {
  buildingId: number;
  targetLevel: number;
  timeStart: number; // unix ms
  timeEnd: number;   // unix ms
  costMetal: number;
  costCrystal: number;
  costDeuterium: number;
}

// ============================================================================
// FLEET & SHIPS
// ============================================================================

export interface Ships {
  lightFighter: number;    // Combat ship (fast, cheap)
  heavyFighter: number;    // Combat ship (slow, expensive)
  cruiser: number;         // Combat ship (fast, medium)
  battleship: number;      // Capital ship (slow, powerful)
  battlecruiser: number;   // Capital ship (fast, powerful)
  bomber: number;          // Specialized (vs defenses)
  destroyer: number;       // Anti-fighter
  deathstar: number;       // Super weapon
  smallCargo: number;      // Transport (fast, 5k capacity)
  largeCargo: number;      // Transport (slow, 25k capacity)
  colonyShip: number;      // Colonization (must have at least 1)
  recycler: number;        // Resource collection
  espionageProbe: number;  // Scouting
}

export interface Fleet {
  id: string;
  planetId: string;
  playerId: string;
  ships: Ships;
  updatedAt: number; // unix ms
}

export type FleetMissionType =
  | 'attack'
  | 'transport'
  | 'deploy'
  | 'espionage'
  | 'harvest'
  | 'colonize'
  | 'expedition'
  | 'return';

export type FleetMissionStatus =
  | 'dispatched'
  | 'in_transit'
  | 'arrived'
  | 'returning'
  | 'completed'
  | 'canceled';

export interface FleetMission {
  id: string;
  playerId: string;
  planetIdFrom: string;
  planetIdTo: string | null;       // null if colonizing to empty coords
  sourceCoordinate: Coordinate;    // Where the fleet departed from
  targetCoordinate: Coordinate;    // Where the fleet is going
  missionType: FleetMissionType;
  missionStatus: FleetMissionStatus;
  timeDeparture: number;  // unix seconds
  timeArrival: number;    // unix seconds
  holdTime: number;       // hours at target before returning
  speedPercent: number;   // 10-100, mission speed setting
  resources: Resources;   // resources being carried
  loot: Resources;        // resources looted (populated after arrival for attack/harvest)
  ships: Ships;
  fuelConsumed: number;   // deuterium consumed for the trip
  createdAt: number;      // unix ms
}

// ============================================================================
// PLANET STATE
// ============================================================================

export interface PlanetState {
  planetId: string;
  playerId: string;
  coordinate: Coordinate;
  planetType: PlanetType;
  name: string;
  temperature: number;
  fields: number;
  universeSpeed: number;
  buildings: BuildingLevels;
  resources: Resources;
  ships: Ships;
  queue: QueueItem[];
  lastTickAt: number; // unix ms
}

export interface StrategyStep {
  buildingId: number;
  targetLevel: number;
}

export interface Strategy {
  id: string;
  playerId: string;
  name: string;
  steps: StrategyStep[];
}

export interface AgentDecision {
  action: 'build' | 'wait';
  buildingId?: number;
  reason: string;
}

// ============================================================================
// RESEARCH & TECHNOLOGY
// ============================================================================

export interface TechLevels {
  energyTech: number;        // 113
  laserTech: number;         // 120
  ionTech: number;           // 121
  hyperspaceTech: number;    // 114
  plasmaTech: number;        // 122
  combustionDrive: number;   // 115
  impulseDrive: number;      // 117
  hyperspaceDrive: number;   // 118
  espionageTech: number;     // 106
  computerTech: number;      // 108
  astrophysics: number;      // 124
  weaponTech: number;        // 109
  shieldingTech: number;     // 110
  armorTech: number;         // 111
  gravitonTech: number;      // 199
}

export interface ResearchQueueItem {
  techId: number;
  level: number;       // The level being researched (current + 1)
  timeStart: number;   // unix ms
  timeEnd: number;     // unix ms
}
