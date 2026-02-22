import { Coordinate, FleetMission, FleetMissionType, Ships, Resources } from '../types';
import { fleetService } from './fleetService';
import { battleService, BattleReport } from './battleService';

/**
 * Mission Service
 * Handles fleet mission lifecycle: creation, processing, arrival, battle, return
 *
 * NOTE: For full fleet dispatch/arrival/return logic, prefer the exported functions
 * from fleetService.ts (dispatchFleet, processFleetArrival, processFleetReturn).
 * This service provides supplementary mission management utilities.
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
    resources: Resources = { metal: 0, crystal: 0, deuterium: 0 },
    speedPercent: number = 100,
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
    const plan = fleetService.planMission(fromCoord, toCoord, ships, resources, speedPercent);

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
   * Create a new fleet mission record (low-level, does not deduct resources/ships)
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
    speedPercent: number = 100,
    nowSeconds: number = Math.floor(Date.now() / 1000),
  ): FleetMission {
    const plan = fleetService.planMission(fromCoord, toCoord, ships, resources, speedPercent);

    return {
      id: missionId,
      playerId,
      planetIdFrom: fromPlanetId,
      planetIdTo: toPlanetId,
      sourceCoordinate: { ...fromCoord },
      targetCoordinate: { ...toCoord },
      missionType,
      missionStatus: 'in_transit',
      timeDeparture: nowSeconds,
      timeArrival: nowSeconds + plan.durationSeconds,
      holdTime: 0,
      speedPercent,
      resources,
      loot: { metal: 0, crystal: 0, deuterium: 0 },
      ships,
      fuelConsumed: plan.fuelRequired,
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
   * Process mission arrival (simplified -- for full logic use fleetService.processFleetArrival)
   */
  processMissionArrival(
    mission: FleetMission,
    defenderPlanetData?: {
      defenseStructures: any;
      resources: Resources;
      owner: string;
    },
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
   */
  private processAttackMission(
    mission: FleetMission,
    defenderData?: any,
  ): MissionArrival {
    const nowSeconds = Math.floor(Date.now() / 1000);

    if (!defenderData) {
      return {
        missionId: mission.id,
        arrivedAt: nowSeconds,
        success: false,
      };
    }

    const battle = battleService.resolveBattle(
      { ships: mission.ships, name: `Fleet ${mission.id}` },
      {
        ships: defenderData.ships || {},
        defenses: defenderData.defenseStructures,
        name: `Defender ${mission.planetIdTo}`,
      },
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
   */
  private processColonizeMission(mission: FleetMission): MissionArrival {
    const nowSeconds = Math.floor(Date.now() / 1000);

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
   */
  private processExpeditionMission(mission: FleetMission): MissionArrival {
    const nowSeconds = Math.floor(Date.now() / 1000);
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
    nowSeconds: number = Math.floor(Date.now() / 1000),
  ): FleetMission {
    return fleetService.createReturnMission(
      outboundMission,
      outboundMission.ships,
      outboundMission.resources,
    );
  }

  /**
   * Recall a mission (return immediately)
   * Only works if fleet is still in transit
   */
  recallMission(mission: FleetMission, nowSeconds: number): FleetMission | null {
    if (mission.missionStatus !== 'in_transit') {
      return null;
    }

    return {
      ...mission,
      id: `${mission.id}-recalled`,
      missionType: 'return',
      sourceCoordinate: { ...mission.targetCoordinate },
      targetCoordinate: { ...mission.sourceCoordinate },
      timeDeparture: nowSeconds,
      timeArrival: nowSeconds, // Immediate
      loot: { metal: 0, crystal: 0, deuterium: 0 },
      fuelConsumed: 0,
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
      return mission.missionStatus === 'arrived' || mission.missionStatus === 'completed' ? 100 : 0;
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
      case 'dispatched':
        return 'Dispatched';
      case 'in_transit':
        return 'In Transit';
      case 'arrived':
        return 'Arrived';
      case 'returning':
        return 'Returning';
      case 'completed':
        return 'Completed';
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
      case 'deploy':
        return 'Deploy';
      case 'espionage':
        return 'Espionage';
      case 'harvest':
        return 'Harvest';
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
