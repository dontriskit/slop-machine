import { Coordinate, Ships, Resources, FleetMission, FleetMissionType, FleetMissionStatus } from '../types';
import {
  calculateDistance,
  getSlowestSpeed,
  calculateDuration,
  calculateFuelConsumption,
  calculateCargoCapacity,
  canCarryResources,
} from '../formulas';
import { coordinateService } from './coordinateService';

/**
 * Fleet Service
 * Handles fleet movement calculations, mission planning, and logistics
 */

export interface FleetMissionPlan {
  distance: number;
  slowestSpeed: number;
  durationSeconds: number;
  fuelRequired: number;
  cargoCapacity: number;
  canExecute: boolean;
  reason?: string; // If canExecute is false, explanation why
}

export interface FleetStats {
  totalShips: number;
  cargoCapacity: number;
  slowestSpeed: number;
  totalFuel: number; // Assuming all cargo slots filled with fuel
}

export class FleetService {
  /**
   * Plan a fleet mission
   * Calculates distance, duration, fuel requirements
   */
  planMission(
    fromCoord: Coordinate,
    toCoord: Coordinate,
    ships: Ships,
    resources: Resources = { metal: 0, crystal: 0, deuterium: 0 },
    holdingHours: number = 0,
    universeNumGalaxies: number = 9
  ): FleetMissionPlan {
    // Validate coordinates
    if (!coordinateService.isValid(fromCoord) || !coordinateService.isValid(toCoord)) {
      return {
        distance: 0,
        slowestSpeed: 0,
        durationSeconds: 0,
        fuelRequired: 0,
        cargoCapacity: 0,
        canExecute: false,
        reason: 'Invalid coordinate',
      };
    }

    // Check if empty fleet
    const totalShips = this.getTotalShips(ships);
    if (totalShips === 0) {
      return {
        distance: 0,
        slowestSpeed: 0,
        durationSeconds: 0,
        fuelRequired: 0,
        cargoCapacity: 0,
        canExecute: false,
        reason: 'No ships in fleet',
      };
    }

    // Calculate logistics
    const distance = coordinateService.getDistance(fromCoord, toCoord);
    const slowestSpeed = getSlowestSpeed(ships);
    const durationSeconds = calculateDuration(distance, slowestSpeed, 10, 1.0); // 10% speed, 1x universe multiplier
    const fuelRequired = calculateFuelConsumption(ships, distance, durationSeconds, holdingHours, 1.0);
    const cargoCapacity = calculateCargoCapacity(ships);

    // Validate resources fit in cargo
    const totalResources = resources.metal + resources.crystal + resources.deuterium;
    let canExecute = true;
    let reason: string | undefined;

    if (totalResources > cargoCapacity) {
      canExecute = false;
      reason = `Insufficient cargo capacity: need ${totalResources}, have ${cargoCapacity}`;
    }

    if (fuelRequired > ships.largeCargo * 25000 + ships.smallCargo * 5000) {
      // Rough check - if fuel requirement exceeds cargo capacity
      canExecute = false;
      reason = `Insufficient fuel capacity`;
    }

    return {
      distance,
      slowestSpeed,
      durationSeconds,
      fuelRequired,
      cargoCapacity,
      canExecute,
      reason,
    };
  }

  /**
   * Get total number of ships in fleet
   */
  getTotalShips(ships: Ships): number {
    return Object.values(ships).reduce((sum, count) => sum + count, 0);
  }

  /**
   * Get fleet statistics
   */
  getFleetStats(ships: Ships): FleetStats {
    return {
      totalShips: this.getTotalShips(ships),
      cargoCapacity: calculateCargoCapacity(ships),
      slowestSpeed: getSlowestSpeed(ships),
      totalFuel: calculateFuelConsumption(ships, 1, 1, 0, 1.0), // Base fuel cost per unit distance
    };
  }

  /**
   * Create a fleet mission record
   */
  createMission(
    missionId: string,
    playerId: string,
    fromCoord: Coordinate,
    toCoord: Coordinate,
    fromPlanetId: string,
    toPlanetId: string | null,
    missionType: FleetMissionType,
    ships: Ships,
    resources: Resources,
    plan: FleetMissionPlan,
    nowSeconds: number = Math.floor(Date.now() / 1000)
  ): FleetMission {
    const timeDeparture = nowSeconds;
    const timeArrival = nowSeconds + plan.durationSeconds;

    return {
      id: missionId,
      playerId,
      planetIdFrom: fromPlanetId,
      planetIdTo: toPlanetId,
      targetCoordinate: toCoord,
      missionType,
      missionStatus: 'in_transit' as FleetMissionStatus,
      timeDeparture,
      timeArrival,
      holdTime: 0,
      resources,
      ships,
      createdAt: Date.now(),
    };
  }

  /**
   * Calculate return mission
   * When fleet returns from target, it retraces same route
   */
  calculateReturnMission(
    outboundMission: FleetMission,
    nowSeconds: number = Math.floor(Date.now() / 1000)
  ): FleetMission {
    const holdTime = outboundMission.holdTime;
    const returnStartTime = outboundMission.timeArrival + holdTime * 3600; // Convert hours to seconds

    const plan = this.planMission(
      outboundMission.targetCoordinate,
      outboundMission.targetCoordinate, // Placeholder - in DB we have the from coord
      outboundMission.ships,
      outboundMission.resources,
      0
    );

    return {
      id: `${outboundMission.id}-return`,
      playerId: outboundMission.playerId,
      planetIdFrom: outboundMission.planetIdTo,
      planetIdTo: outboundMission.planetIdFrom,
      targetCoordinate: outboundMission.targetCoordinate, // Same as from
      missionType: 'return',
      missionStatus: 'in_transit',
      timeDeparture: returnStartTime,
      timeArrival: returnStartTime + plan.durationSeconds,
      holdTime: 0,
      resources: outboundMission.resources,
      ships: outboundMission.ships,
      createdAt: Date.now(),
    };
  }

  /**
   * Check if mission should be processed (arrival time reached)
   */
  shouldProcess(mission: FleetMission, nowSeconds: number): boolean {
    return mission.missionStatus === 'in_transit' && nowSeconds >= mission.timeArrival;
  }

  /**
   * Get mission remaining duration in seconds
   */
  getRemainingDuration(mission: FleetMission, nowSeconds: number): number {
    if (mission.missionStatus !== 'in_transit') return 0;
    return Math.max(0, mission.timeArrival - nowSeconds);
  }

  /**
   * Get mission progress as percentage (0-100)
   */
  getProgress(mission: FleetMission, nowSeconds: number): number {
    if (mission.missionStatus !== 'in_transit') {
      return mission.missionStatus === 'arrived' ? 100 : 0;
    }

    const totalDuration = mission.timeArrival - mission.timeDeparture;
    const elapsed = nowSeconds - mission.timeDeparture;

    if (totalDuration <= 0) return 0;
    return Math.round((elapsed / totalDuration) * 100);
  }

  /**
   * Calculate required colony ships for colonization
   * At least 1 required per OGame rules
   */
  canColonize(ships: Ships): boolean {
    return ships.colonyShip >= 1;
  }

  /**
   * Get minimum ships required for specific mission type
   */
  getMinimumShipsForMission(missionType: FleetMissionType): Record<keyof Ships, number> {
    const empty = this.getEmptyFleet();

    switch (missionType) {
      case 'colonize':
        return { ...empty, colonyShip: 1 };
      case 'transport':
        return { ...empty, smallCargo: 1 };
      case 'attack':
        return { ...empty, lightFighter: 1 }; // At least 1 combat ship
      case 'expedition':
        return empty; // No minimum
      case 'return':
        return empty; // Return missions use outbound fleet
      default:
        return empty;
    }
  }

  /**
   * Check if fleet meets mission requirements
   */
  meetsRequirements(ships: Ships, missionType: FleetMissionType): boolean {
    const minRequired = this.getMinimumShipsForMission(missionType);
    for (const [key, required] of Object.entries(minRequired)) {
      if ((ships[key as keyof Ships] || 0) < required) {
        return false;
      }
    }
    return true;
  }

  /**
   * Get empty fleet (all zeros)
   */
  getEmptyFleet(): Ships {
    return {
      lightFighter: 0,
      heavyFighter: 0,
      cruiser: 0,
      battleship: 0,
      battlecruiser: 0,
      bomber: 0,
      destroyer: 0,
      deathstar: 0,
      smallCargo: 0,
      largeCargo: 0,
      colonyShip: 0,
      recycler: 0,
      espionageProbe: 0,
    };
  }

  /**
   * Sum two fleets together
   */
  addFleets(fleet1: Ships, fleet2: Ships): Ships {
    const result = { ...fleet1 };
    for (const [key, count] of Object.entries(fleet2)) {
      result[key as keyof Ships] += count;
    }
    return result;
  }

  /**
   * Subtract fleet2 from fleet1
   */
  subtractFleets(fleet1: Ships, fleet2: Ships): Ships {
    const result = { ...fleet1 };
    for (const [key, count] of Object.entries(fleet2)) {
      result[key as keyof Ships] = Math.max(0, result[key as keyof Ships] - count);
    }
    return result;
  }

  /**
   * Check if fleet1 has all ships from fleet2
   */
  hasShips(fleet1: Ships, fleet2: Ships): boolean {
    for (const [key, required] of Object.entries(fleet2)) {
      if ((fleet1[key as keyof Ships] || 0) < required) {
        return false;
      }
    }
    return true;
  }
}

/**
 * Singleton instance for global use
 */
export const fleetService = new FleetService();
