import { Coordinate, FleetMission, FleetMissionType, Ships, Resources } from '../types';
import { fleetService } from './fleetService';
import { battleService, BattleReport } from './battleService';

/**
 * Mission Service
 * Handles fleet mission lifecycle: creation, processing, arrival, battle, return
 */

export interface MissionPreparation {
  canLaunch: boolean;
  reason?: string;
  fuelRequired: number;
  duration: number;
  cargoCapacity: number;
}

export interface MissionArrival {
  missionId: string;
  arrivedAt: number;
  battle?: BattleReport;
  success: boolean;
}

export class MissionService {
  /**
   * Prepare and validate a mission launch
   */
  prepareMission(
    fromCoord: Coordinate,
    toCoord: Coordinate,
    ships: Ships,
    missionType: FleetMissionType,
    resources: Resources = { metal: 0, crystal: 0, deuterium: 0 }
  ): MissionPreparation {
    // Validate ships for mission type
    if (!fleetService.meetsRequirements(ships, missionType)) {
      return {
        canLaunch: false,
        reason: `Insufficient ships for ${missionType} mission`,
        fuelRequired: 0,
        duration: 0,
        cargoCapacity: 0,
      };
    }

    // Plan the mission
    const plan = fleetService.planMission(fromCoord, toCoord, ships, resources);

    if (!plan.canExecute) {
      return {
        canLaunch: false,
        reason: plan.reason,
        fuelRequired: plan.fuelRequired,
        duration: plan.durationSeconds,
        cargoCapacity: plan.cargoCapacity,
      };
    }

    return {
      canLaunch: true,
      fuelRequired: plan.fuelRequired,
      duration: plan.durationSeconds,
      cargoCapacity: plan.cargoCapacity,
    };
  }

  /**
   * Create a new fleet mission
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
    nowSeconds: number = Math.floor(Date.now() / 1000)
  ): FleetMission {
    const plan = fleetService.planMission(fromCoord, toCoord, ships, resources);

    return {
      id: missionId,
      playerId,
      planetIdFrom: fromPlanetId,
      planetIdTo: toPlanetId,
      targetCoordinate: toCoord,
      missionType,
      missionStatus: 'in_transit',
      timeDeparture: nowSeconds,
      timeArrival: nowSeconds + plan.durationSeconds,
      holdTime: 0,
      resources,
      ships,
      createdAt: Date.now(),
    };
  }

  /**
   * Check if mission has arrived
   */
  hasArrived(mission: FleetMission, nowSeconds: number): boolean {
    return (
      mission.missionStatus === 'in_transit' && nowSeconds >= mission.timeArrival
    );
  }

  /**
   * Process mission arrival
   * Handles battle, looting, colonization, etc.
   */
  processMissionArrival(
    mission: FleetMission,
    defenderPlanetData?: {
      defenseStructures: any;
      resources: Resources;
      owner: string;
    }
  ): MissionArrival {
    const nowSeconds = Math.floor(Date.now() / 1000);

    if (!this.hasArrived(mission, nowSeconds)) {
      return {
        missionId: mission.id,
        arrivedAt: nowSeconds,
        success: false,
      };
    }

    // Different handling per mission type
    switch (mission.missionType) {
      case 'attack':
        return this.processAttackMission(mission, defenderPlanetData);

      case 'transport':
        return this.processTransportMission(mission);

      case 'colonize':
        return this.processColonizeMission(mission);

      case 'expedition':
        return this.processExpeditionMission(mission);

      default:
        return {
          missionId: mission.id,
          arrivedAt: nowSeconds,
          success: false,
        };
    }
  }

  /**
   * Process attack mission
   * Fleet battles defender, loots resources if successful
   */
  private processAttackMission(
    mission: FleetMission,
    defenderData?: any
  ): MissionArrival {
    const nowSeconds = Math.floor(Date.now() / 1000);

    if (!defenderData) {
      return {
        missionId: mission.id,
        arrivedAt: nowSeconds,
        success: false,
      };
    }

    // Run battle
    const battle = battleService.resolveBattle(
      {
        ships: mission.ships,
        name: `Fleet ${mission.id}`,
      },
      {
        ships: defenderData.ships || {},
        defenses: defenderData.defenseStructures,
        name: `Defender ${mission.planetIdTo}`,
      }
    );

    return {
      missionId: mission.id,
      arrivedAt: nowSeconds,
      battle,
      success: battle.winner === 'attacker',
    };
  }

  /**
   * Process transport mission
   * Delivers resources to target planet
   */
  private processTransportMission(mission: FleetMission): MissionArrival {
    const nowSeconds = Math.floor(Date.now() / 1000);

    return {
      missionId: mission.id,
      arrivedAt: nowSeconds,
      success: true,
    };
  }

  /**
   * Process colonization mission
   * Establishes new planet at target coordinate
   */
  private processColonizeMission(mission: FleetMission): MissionArrival {
    const nowSeconds = Math.floor(Date.now() / 1000);

    // Check if fleet has colony ship
    if (mission.ships.colonyShip === 0) {
      return {
        missionId: mission.id,
        arrivedAt: nowSeconds,
        success: false,
      };
    }

    return {
      missionId: mission.id,
      arrivedAt: nowSeconds,
      success: true,
    };
  }

  /**
   * Process expedition mission
   * Explore space slot (position 16)
   */
  private processExpeditionMission(mission: FleetMission): MissionArrival {
    const nowSeconds = Math.floor(Date.now() / 1000);

    // Expedition can find resources, ships, or nothing
    const randomResult = Math.random();

    if (randomResult < 0.3) {
      // 30% chance to find resources
      return {
        missionId: mission.id,
        arrivedAt: nowSeconds,
        success: true,
      };
    } else if (randomResult < 0.6) {
      // 30% chance to find ships (small amount)
      return {
        missionId: mission.id,
        arrivedAt: nowSeconds,
        success: true,
      };
    }

    // 40% chance to find nothing
    return {
      missionId: mission.id,
      arrivedAt: nowSeconds,
      success: true,
    };
  }

  /**
   * Create a return mission (fleet returns home)
   */
  createReturnMission(
    outboundMission: FleetMission,
    nowSeconds: number = Math.floor(Date.now() / 1000)
  ): FleetMission {
    const returnStartTime = outboundMission.timeArrival + outboundMission.holdTime * 3600;
    const plan = fleetService.planMission(
      outboundMission.targetCoordinate,
      {
        galaxy: 0,
        system: 0,
        position: 0,
      }, // Placeholder - will be from planet
      outboundMission.ships,
      outboundMission.resources
    );

    return {
      id: `${outboundMission.id}-return`,
      playerId: outboundMission.playerId,
      planetIdFrom: outboundMission.planetIdTo,
      planetIdTo: outboundMission.planetIdFrom,
      targetCoordinate: {
        galaxy: 0,
        system: 0,
        position: 0,
      }, // Placeholder
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
   * Recall a mission (return immediately)
   * Only works if fleet is still in transit
   */
  recallMission(mission: FleetMission, nowSeconds: number): FleetMission | null {
    if (mission.missionStatus !== 'in_transit') {
      return null; // Can't recall if not in transit
    }

    // Create immediate return mission
    return {
      ...mission,
      id: `${mission.id}-recalled`,
      missionType: 'return',
      timeDeparture: nowSeconds,
      timeArrival: nowSeconds, // Immediate
      createdAt: Date.now(),
    };
  }

  /**
   * Get remaining mission time in seconds
   */
  getRemainingTime(mission: FleetMission, nowSeconds: number): number {
    if (mission.missionStatus !== 'in_transit') return 0;
    return Math.max(0, mission.timeArrival - nowSeconds);
  }

  /**
   * Get mission progress as percentage
   */
  getProgress(mission: FleetMission, nowSeconds: number): number {
    if (mission.missionStatus !== 'in_transit') {
      return mission.missionStatus === 'arrived' ? 100 : 0;
    }

    const totalDuration = mission.timeArrival - mission.timeDeparture;
    const elapsed = nowSeconds - mission.timeDeparture;

    if (totalDuration <= 0) return 0;
    return Math.min(100, Math.round((elapsed / totalDuration) * 100));
  }

  /**
   * Get mission status label
   */
  getStatusLabel(mission: FleetMission): string {
    switch (mission.missionStatus) {
      case 'in_transit':
        return 'In Transit';
      case 'arrived':
        return 'Arrived';
      case 'returned':
        return 'Returned';
      case 'canceled':
        return 'Canceled';
      default:
        return 'Unknown';
    }
  }

  /**
   * Get mission type label
   */
  getMissionTypeLabel(missionType: FleetMissionType): string {
    switch (missionType) {
      case 'attack':
        return 'Attack';
      case 'transport':
        return 'Transport';
      case 'colonize':
        return 'Colonize';
      case 'expedition':
        return 'Expedition';
      case 'return':
        return 'Return';
      default:
        return 'Unknown';
    }
  }
}

/**
 * Singleton instance
 */
export const missionService = new MissionService();
