import {
  Coordinate,
  Ships,
  Resources,
  FleetMission,
  FleetMissionType,
  FleetMissionStatus,
  PlanetState,
  SHIP_KEYS,
} from '../types';
import {
  calculateDistance,
  getSlowestSpeed,
  calculateDuration,
  calculateFuelConsumption,
  calculateCargoCapacity,
  canCarryResources,
  SHIP_FUEL,
  SHIP_SPEEDS,
  SHIP_CARGO,
} from '../formulas';
import { coordinateService } from './coordinateService';
import { battleService, BattleReport } from './battleService';
import { DefenseStructures } from '../defenses';

// ============================================================================
// TYPES
// ============================================================================

/** Pre-flight plan: everything needed to decide whether a dispatch is viable. */
export interface FleetMissionPlan {
  distance: number;
  slowestSpeed: number;
  durationSeconds: number;
  fuelRequired: number;
  cargoCapacity: number;
  canExecute: boolean;
  reason?: string;
}

/** Aggregate statistics for a fleet composition. */
export interface FleetStats {
  totalShips: number;
  cargoCapacity: number;
  slowestSpeed: number;
  totalFuel: number;
}

/** Input parameters for dispatching a fleet. */
export interface DispatchParams {
  missionId: string;
  playerId: string;
  fromPlanetId: string;
  toPlanetId: string | null;
  from: Coordinate;
  to: Coordinate;
  ships: Ships;
  resources: Resources;
  missionType: FleetMissionType;
  speedPercent: number;        // 10-100
  fleetSpeed?: number;         // universe fleet speed multiplier, default 1
  numGalaxies?: number;        // universe galaxy count, default 9
}

/** Validation result for a dispatch request. */
export interface DispatchValidation {
  valid: boolean;
  reason?: string;
}

/** Result of fleet arrival processing. */
export interface FleetArrivalResult {
  missionId: string;
  success: boolean;
  missionType: FleetMissionType;
  battle?: BattleReport;
  resourcesDelivered?: Resources;
  loot?: Resources;
  survivingShips: Ships;
  colonized?: boolean;
  intelGathered?: boolean;
  debrisCollected?: Resources;
  returnMission?: FleetMission;
}

/** Result of a fleet return trip completing. */
export interface FleetReturnResult {
  missionId: string;
  success: boolean;
  shipsReturned: Ships;
  resourcesReturned: Resources;
}

/** Defender planet data needed for combat resolution. */
export interface DefenderData {
  ships: Ships;
  defenses: DefenseStructures;
  resources: Resources;
  owner: string;
}

/** Debris field at a coordinate. */
export interface DebrisField {
  metal: number;
  crystal: number;
  deuterium: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const EMPTY_RESOURCES: Resources = { metal: 0, crystal: 0, deuterium: 0 };

/** Maximum loot fraction from an attack (50% of defender resources). */
const MAX_LOOT_FRACTION = 0.5;

// ============================================================================
// FLEET SERVICE
// ============================================================================

export class FleetService {

  // --------------------------------------------------------------------------
  // DISTANCE CALCULATION (donut topology)
  // --------------------------------------------------------------------------

  /**
   * Calculate distance between two coordinates.
   *
   * Galaxy distance : 20,000 per galaxy gap
   * System distance : 2,700 + (gap x 95)
   * Position distance: 1,000 + (gap x 5)
   * Same coords     : 5
   *
   * Uses coordinateService.getDistance internally which already implements
   * the canonical formula from formulas.ts with donut wrapping.
   */
  getDistance(from: Coordinate, to: Coordinate): number {
    return coordinateService.getDistance(from, to);
  }

  // --------------------------------------------------------------------------
  // TRAVEL DURATION
  // --------------------------------------------------------------------------

  /**
   * Calculate flight time in seconds.
   *
   * duration = round((35000 / speedPercent * sqrt(distance * 10 / slowestSpeed) + 10) / fleetSpeed)
   *
   * @param from         Source coordinate
   * @param to           Target coordinate
   * @param ships        Fleet composition (slowest ship determines speed)
   * @param speedPercent Speed setting 10-100
   * @param fleetSpeed   Universe fleet speed multiplier (default 1)
   */
  calculateFlightTime(
    from: Coordinate,
    to: Coordinate,
    ships: Ships,
    speedPercent: number = 100,
    fleetSpeed: number = 1.0,
  ): number {
    const distance = this.getDistance(from, to);
    const slowest = getSlowestSpeed(ships);
    return calculateDuration(distance, slowest, speedPercent, fleetSpeed);
  }

  // --------------------------------------------------------------------------
  // FUEL CONSUMPTION
  // --------------------------------------------------------------------------

  /**
   * Calculate total deuterium fuel cost for a one-way trip.
   *
   * Each ship type contributes:
   *   consumption += count * fuelRate * (distance / 35000) * ((speedFactor / 10) + 1)^2
   *
   * Where speedFactor = 35000 / (duration * fleetSpeed - 10) clamped to >= 0.5
   */
  calculateFuelCost(
    ships: Ships,
    distance: number,
    speedPercent: number = 100,
    fleetSpeed: number = 1.0,
  ): number {
    const slowest = getSlowestSpeed(ships);
    const duration = calculateDuration(distance, slowest, speedPercent, fleetSpeed);
    return calculateFuelConsumption(ships, distance, duration, 0, fleetSpeed);
  }

  // --------------------------------------------------------------------------
  // CARGO CAPACITY
  // --------------------------------------------------------------------------

  /** Total cargo capacity of a fleet. */
  getCargoCapacity(ships: Ships): number {
    return calculateCargoCapacity(ships);
  }

  // --------------------------------------------------------------------------
  // MISSION PLAN (pre-flight check)
  // --------------------------------------------------------------------------

  /**
   * Plan a fleet mission: compute distance, duration, fuel, cargo and
   * determine whether the mission can actually execute.
   */
  planMission(
    fromCoord: Coordinate,
    toCoord: Coordinate,
    ships: Ships,
    resources: Resources = EMPTY_RESOURCES,
    speedPercent: number = 100,
    fleetSpeed: number = 1.0,
    holdingHours: number = 0,
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

    const distance = this.getDistance(fromCoord, toCoord);
    const slowestSpeed = getSlowestSpeed(ships);
    const durationSeconds = calculateDuration(distance, slowestSpeed, speedPercent, fleetSpeed);
    const fuelRequired = calculateFuelConsumption(ships, distance, durationSeconds, holdingHours, fleetSpeed);
    const cargoCapacity = calculateCargoCapacity(ships);

    // Resources + fuel must fit in cargo
    const totalResources = resources.metal + resources.crystal + resources.deuterium;
    const totalNeeded = totalResources + fuelRequired;

    let canExecute = true;
    let reason: string | undefined;

    if (totalNeeded > cargoCapacity) {
      canExecute = false;
      reason = `Insufficient cargo capacity: need ${totalNeeded} (${totalResources} resources + ${fuelRequired} fuel), have ${cargoCapacity}`;
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

  // --------------------------------------------------------------------------
  // VALIDATION
  // --------------------------------------------------------------------------

  /**
   * Validate whether a dispatch can proceed.
   * Checks: ship availability, fuel capacity, coordinate validity,
   * mission-type requirements.
   */
  validateDispatch(
    params: DispatchParams,
    planetShips: Ships,
    planetDeuterium: number,
  ): DispatchValidation {
    const { from, to, ships, resources, missionType, speedPercent, fleetSpeed = 1.0 } = params;

    // 1. Valid coordinates
    if (!coordinateService.isValid(from) || !coordinateService.isValid(to)) {
      return { valid: false, reason: 'Invalid coordinates' };
    }

    // 2. Speed percent in range
    if (speedPercent < 10 || speedPercent > 100) {
      return { valid: false, reason: 'Speed percent must be between 10 and 100' };
    }

    // 3. At least one ship
    if (this.getTotalShips(ships) === 0) {
      return { valid: false, reason: 'No ships selected' };
    }

    // 4. Enough ships on planet
    if (!this.hasShips(planetShips, ships)) {
      return { valid: false, reason: 'Not enough ships on planet' };
    }

    // 5. Mission-specific ship requirements
    if (!this.meetsRequirements(ships, missionType)) {
      return { valid: false, reason: `Missing required ships for ${missionType} mission` };
    }

    // 6. Fuel check
    const plan = this.planMission(from, to, ships, resources, speedPercent, fleetSpeed);
    if (!plan.canExecute) {
      return { valid: false, reason: plan.reason };
    }

    // 7. Planet has enough deuterium for fuel (fuel is deducted from planet stock)
    if (plan.fuelRequired > planetDeuterium) {
      return {
        valid: false,
        reason: `Not enough deuterium for fuel: need ${plan.fuelRequired}, have ${planetDeuterium}`,
      };
    }

    // 8. Cannot deploy to own planet from same planet
    if (missionType === 'deploy' && coordinateService.isSame(from, to)) {
      return { valid: false, reason: 'Cannot deploy to same coordinates' };
    }

    // 9. Espionage requires at least one probe
    if (missionType === 'espionage' && ships.espionageProbe < 1) {
      return { valid: false, reason: 'Espionage requires at least 1 espionage probe' };
    }

    // 10. Harvest requires recycler
    if (missionType === 'harvest' && ships.recycler < 1) {
      return { valid: false, reason: 'Harvest requires at least 1 recycler' };
    }

    return { valid: true };
  }

  // --------------------------------------------------------------------------
  // FLEET DISPATCH
  // --------------------------------------------------------------------------

  /**
   * Dispatch a fleet from source planet to target coordinates.
   *
   * This is the primary entry point for sending fleets. It:
   * 1. Validates the dispatch (ships, fuel, coordinates, mission type)
   * 2. Calculates travel time from distance + slowest ship speed
   * 3. Deducts ships and fuel from source planet (mutates planetState)
   * 4. Creates and returns the FleetMission record
   *
   * @returns The created FleetMission, or null with reason if dispatch failed
   */
  dispatchFleet(
    params: DispatchParams,
    planetState: PlanetState,
  ): { mission: FleetMission | null; reason?: string } {
    const {
      missionId,
      playerId,
      fromPlanetId,
      toPlanetId,
      from,
      to,
      ships,
      resources,
      missionType,
      speedPercent,
      fleetSpeed = 1.0,
    } = params;

    // --- validation ---
    const validation = this.validateDispatch(params, planetState.ships, planetState.resources.deuterium);
    if (!validation.valid) {
      return { mission: null, reason: validation.reason };
    }

    // --- compute flight plan ---
    const plan = this.planMission(from, to, ships, resources, speedPercent, fleetSpeed);
    const nowSeconds = Math.floor(Date.now() / 1000);

    // --- deduct ships from planet ---
    planetState.ships = this.subtractFleets(planetState.ships, ships);

    // --- deduct fuel (deuterium) from planet ---
    planetState.resources.deuterium -= plan.fuelRequired;

    // --- deduct transported resources from planet ---
    planetState.resources.metal -= resources.metal;
    planetState.resources.crystal -= resources.crystal;
    planetState.resources.deuterium -= resources.deuterium;

    // --- create mission record ---
    const mission: FleetMission = {
      id: missionId,
      playerId,
      planetIdFrom: fromPlanetId,
      planetIdTo: toPlanetId,
      sourceCoordinate: { ...from },
      targetCoordinate: { ...to },
      missionType,
      missionStatus: 'in_transit',
      timeDeparture: nowSeconds,
      timeArrival: nowSeconds + plan.durationSeconds,
      holdTime: 0,
      speedPercent,
      resources: { ...resources },
      loot: { metal: 0, crystal: 0, deuterium: 0 },
      ships: { ...ships },
      fuelConsumed: plan.fuelRequired,
      createdAt: Date.now(),
    };

    return { mission };
  }

  // --------------------------------------------------------------------------
  // MISSION ARRIVAL PROCESSING
  // --------------------------------------------------------------------------

  /**
   * Process a fleet arriving at its destination.
   *
   * Handles each mission type:
   *   attack    -> battle -> loot (50% max) -> schedule return
   *   transport -> deliver resources -> schedule return (empty)
   *   deploy    -> station fleet permanently (no return)
   *   espionage -> gather intel -> schedule return
   *   harvest   -> collect debris -> schedule return
   *   colonize  -> create planet -> ships stay
   *
   * State transitions: in_transit -> arrived (then returning or completed)
   */
  processFleetArrival(
    mission: FleetMission,
    opts: {
      defenderData?: DefenderData;
      debrisField?: DebrisField;
      targetOccupied?: boolean;        // for colonize: is the slot taken?
      fleetSpeed?: number;
    } = {},
  ): FleetArrivalResult {
    const {
      defenderData,
      debrisField,
      targetOccupied = false,
      fleetSpeed = 1.0,
    } = opts;

    const nowSeconds = Math.floor(Date.now() / 1000);

    // Guard: only process missions that have actually arrived
    if (mission.missionStatus !== 'in_transit' || nowSeconds < mission.timeArrival) {
      return {
        missionId: mission.id,
        success: false,
        missionType: mission.missionType,
        survivingShips: mission.ships,
      };
    }

    // Mark arrived
    mission.missionStatus = 'arrived';

    switch (mission.missionType) {
      case 'attack':
        return this.processAttackArrival(mission, defenderData, fleetSpeed);

      case 'transport':
        return this.processTransportArrival(mission, fleetSpeed);

      case 'deploy':
        return this.processDeployArrival(mission);

      case 'espionage':
        return this.processEspionageArrival(mission, fleetSpeed);

      case 'harvest':
        return this.processHarvestArrival(mission, debrisField, fleetSpeed);

      case 'colonize':
        return this.processColonizeArrival(mission, targetOccupied);

      default:
        return {
          missionId: mission.id,
          success: false,
          missionType: mission.missionType,
          survivingShips: mission.ships,
        };
    }
  }

  // --------------------------------------------------------------------------
  // MISSION TYPE HANDLERS (arrival)
  // --------------------------------------------------------------------------

  /**
   * ATTACK: battle -> loot 50% max of defender resources -> return with survivors + loot
   */
  private processAttackArrival(
    mission: FleetMission,
    defenderData: DefenderData | undefined,
    fleetSpeed: number,
  ): FleetArrivalResult {
    if (!defenderData) {
      // No defender data means uninhabited -- fleet returns empty
      const returnMission = this.createReturnMission(mission, mission.ships, mission.resources, fleetSpeed);
      mission.missionStatus = 'returning';
      return {
        missionId: mission.id,
        success: false,
        missionType: 'attack',
        survivingShips: mission.ships,
        returnMission,
      };
    }

    // Run battle
    const battle = battleService.resolveBattle(
      { ships: mission.ships, name: `Fleet ${mission.id}` },
      { ships: defenderData.ships, defenses: defenderData.defenses, name: `Defender ${mission.planetIdTo}` },
    );

    // Determine surviving attacker ships from battle report
    const lastRound = battle.rounds[battle.rounds.length - 1];
    const survivingShips = lastRound ? { ...lastRound.attacker.ships } : this.getEmptyFleet();

    // Calculate loot (50% max of each defender resource, limited by cargo capacity)
    let loot: Resources = { metal: 0, crystal: 0, deuterium: 0 };
    if (battle.winner === 'attacker') {
      const cargoAvailable = this.getCargoCapacity(survivingShips);
      // Resources being carried take up space too
      const carriedTotal = mission.resources.metal + mission.resources.crystal + mission.resources.deuterium;
      const freeSpace = Math.max(0, cargoAvailable - carriedTotal);

      const maxMetal = Math.floor(defenderData.resources.metal * MAX_LOOT_FRACTION);
      const maxCrystal = Math.floor(defenderData.resources.crystal * MAX_LOOT_FRACTION);
      const maxDeut = Math.floor(defenderData.resources.deuterium * MAX_LOOT_FRACTION);
      const totalAvailable = maxMetal + maxCrystal + maxDeut;

      if (totalAvailable <= freeSpace) {
        loot = { metal: maxMetal, crystal: maxCrystal, deuterium: maxDeut };
      } else {
        // Proportional distribution of available cargo space
        const ratio = freeSpace / totalAvailable;
        loot = {
          metal: Math.floor(maxMetal * ratio),
          crystal: Math.floor(maxCrystal * ratio),
          deuterium: Math.floor(maxDeut * ratio),
        };
      }
    }

    mission.loot = { ...loot };

    // Calculate return resources = carried resources + loot
    const returnResources: Resources = {
      metal: mission.resources.metal + loot.metal,
      crystal: mission.resources.crystal + loot.crystal,
      deuterium: mission.resources.deuterium + loot.deuterium,
    };

    const returnMission = this.createReturnMission(mission, survivingShips, returnResources, fleetSpeed);
    mission.missionStatus = 'returning';

    return {
      missionId: mission.id,
      success: battle.winner === 'attacker',
      missionType: 'attack',
      battle,
      loot,
      survivingShips,
      returnMission,
    };
  }

  /**
   * TRANSPORT: deliver resources to target planet -> return empty
   */
  private processTransportArrival(
    mission: FleetMission,
    fleetSpeed: number,
  ): FleetArrivalResult {
    const delivered = { ...mission.resources };

    // Return trip carries nothing
    const returnResources: Resources = { metal: 0, crystal: 0, deuterium: 0 };
    const returnMission = this.createReturnMission(mission, mission.ships, returnResources, fleetSpeed);
    mission.missionStatus = 'returning';

    return {
      missionId: mission.id,
      success: true,
      missionType: 'transport',
      resourcesDelivered: delivered,
      survivingShips: mission.ships,
      returnMission,
    };
  }

  /**
   * DEPLOY: station fleet permanently at target (no return trip)
   */
  private processDeployArrival(
    mission: FleetMission,
  ): FleetArrivalResult {
    // Fleet and resources are added to target planet. No return trip.
    mission.missionStatus = 'completed';

    return {
      missionId: mission.id,
      success: true,
      missionType: 'deploy',
      resourcesDelivered: { ...mission.resources },
      survivingShips: mission.ships,
      // no returnMission -- fleet stays permanently
    };
  }

  /**
   * ESPIONAGE: gather intel on target planet -> return
   */
  private processEspionageArrival(
    mission: FleetMission,
    fleetSpeed: number,
  ): FleetArrivalResult {
    // Probes gather intelligence and return
    const returnResources: Resources = { metal: 0, crystal: 0, deuterium: 0 };
    const returnMission = this.createReturnMission(mission, mission.ships, returnResources, fleetSpeed);
    mission.missionStatus = 'returning';

    return {
      missionId: mission.id,
      success: true,
      missionType: 'espionage',
      intelGathered: true,
      survivingShips: mission.ships,
      returnMission,
    };
  }

  /**
   * HARVEST: collect debris from a debris field -> return with resources
   */
  private processHarvestArrival(
    mission: FleetMission,
    debrisField: DebrisField | undefined,
    fleetSpeed: number,
  ): FleetArrivalResult {
    let collected: Resources = { metal: 0, crystal: 0, deuterium: 0 };

    if (debrisField) {
      // Recyclers collect debris, limited by their cargo capacity
      const recyclerCapacity = mission.ships.recycler * SHIP_CARGO.recycler;
      const carriedTotal = mission.resources.metal + mission.resources.crystal + mission.resources.deuterium;
      const freeSpace = Math.max(0, recyclerCapacity - carriedTotal);

      const totalDebris = debrisField.metal + debrisField.crystal + debrisField.deuterium;

      if (totalDebris <= freeSpace) {
        collected = {
          metal: debrisField.metal,
          crystal: debrisField.crystal,
          deuterium: debrisField.deuterium,
        };
      } else {
        // Proportional collection
        const ratio = freeSpace / totalDebris;
        collected = {
          metal: Math.floor(debrisField.metal * ratio),
          crystal: Math.floor(debrisField.crystal * ratio),
          deuterium: Math.floor(debrisField.deuterium * ratio),
        };
      }
    }

    mission.loot = { ...collected };

    const returnResources: Resources = {
      metal: mission.resources.metal + collected.metal,
      crystal: mission.resources.crystal + collected.crystal,
      deuterium: mission.resources.deuterium + collected.deuterium,
    };

    const returnMission = this.createReturnMission(mission, mission.ships, returnResources, fleetSpeed);
    mission.missionStatus = 'returning';

    return {
      missionId: mission.id,
      success: true,
      missionType: 'harvest',
      debrisCollected: collected,
      survivingShips: mission.ships,
      returnMission,
    };
  }

  /**
   * COLONIZE: create a new planet at target coordinates, ships stay
   * Colony ship is consumed; remaining fleet stays at new planet.
   */
  private processColonizeArrival(
    mission: FleetMission,
    targetOccupied: boolean,
  ): FleetArrivalResult {
    if (targetOccupied) {
      // Position already taken -- mission fails, but ships are still there
      // In OGame the fleet returns; we model that here.
      mission.missionStatus = 'completed';
      return {
        missionId: mission.id,
        success: false,
        missionType: 'colonize',
        colonized: false,
        survivingShips: mission.ships,
      };
    }

    if (mission.ships.colonyShip < 1) {
      mission.missionStatus = 'completed';
      return {
        missionId: mission.id,
        success: false,
        missionType: 'colonize',
        colonized: false,
        survivingShips: mission.ships,
      };
    }

    // Colony ship is consumed
    const remainingShips = { ...mission.ships };
    remainingShips.colonyShip -= 1;

    mission.missionStatus = 'completed';

    return {
      missionId: mission.id,
      success: true,
      missionType: 'colonize',
      colonized: true,
      resourcesDelivered: { ...mission.resources },
      survivingShips: remainingShips,
    };
  }

  // --------------------------------------------------------------------------
  // FLEET RETURN PROCESSING
  // --------------------------------------------------------------------------

  /**
   * Process a returning fleet arriving back at its home planet.
   *
   * Adds surviving ships and carried resources (including loot) back to the
   * source planet.
   *
   * State transition: returning -> completed
   */
  processFleetReturn(
    mission: FleetMission,
    planetState: PlanetState,
  ): FleetReturnResult {
    const nowSeconds = Math.floor(Date.now() / 1000);

    // Guard: only process return missions that have actually arrived
    if (mission.missionStatus !== 'returning' && mission.missionType !== 'return') {
      return {
        missionId: mission.id,
        success: false,
        shipsReturned: this.getEmptyFleet(),
        resourcesReturned: { metal: 0, crystal: 0, deuterium: 0 },
      };
    }

    if (nowSeconds < mission.timeArrival) {
      return {
        missionId: mission.id,
        success: false,
        shipsReturned: this.getEmptyFleet(),
        resourcesReturned: { metal: 0, crystal: 0, deuterium: 0 },
      };
    }

    // Add ships back to planet
    planetState.ships = this.addFleets(planetState.ships, mission.ships);

    // Add resources (carried + loot) back to planet
    const totalResources: Resources = {
      metal: mission.resources.metal + mission.loot.metal,
      crystal: mission.resources.crystal + mission.loot.crystal,
      deuterium: mission.resources.deuterium + mission.loot.deuterium,
    };

    planetState.resources.metal += totalResources.metal;
    planetState.resources.crystal += totalResources.crystal;
    planetState.resources.deuterium += totalResources.deuterium;

    // Mark mission complete
    mission.missionStatus = 'completed';

    return {
      missionId: mission.id,
      success: true,
      shipsReturned: { ...mission.ships },
      resourcesReturned: totalResources,
    };
  }

  // --------------------------------------------------------------------------
  // RETURN MISSION CREATION
  // --------------------------------------------------------------------------

  /**
   * Create a return mission record for a fleet heading home.
   *
   * Uses the same duration calculation as the outbound trip:
   *   same distance, same slowest-ship speed, same speed percent.
   */
  createReturnMission(
    outboundMission: FleetMission,
    survivingShips: Ships,
    returnResources: Resources,
    fleetSpeed: number = 1.0,
  ): FleetMission {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const returnStartTime = Math.max(nowSeconds, outboundMission.timeArrival);

    // Calculate return duration (same route, reverse direction)
    const distance = this.getDistance(outboundMission.targetCoordinate, outboundMission.sourceCoordinate);
    const slowest = getSlowestSpeed(survivingShips);
    const returnDuration = calculateDuration(distance, slowest, outboundMission.speedPercent, fleetSpeed);
    const fuelCost = calculateFuelConsumption(survivingShips, distance, returnDuration, 0, fleetSpeed);

    return {
      id: `${outboundMission.id}-return`,
      playerId: outboundMission.playerId,
      planetIdFrom: outboundMission.planetIdTo ?? outboundMission.planetIdFrom,
      planetIdTo: outboundMission.planetIdFrom,
      sourceCoordinate: { ...outboundMission.targetCoordinate },
      targetCoordinate: { ...outboundMission.sourceCoordinate },
      missionType: 'return',
      missionStatus: 'in_transit',
      timeDeparture: returnStartTime,
      timeArrival: returnStartTime + returnDuration,
      holdTime: 0,
      speedPercent: outboundMission.speedPercent,
      resources: { ...returnResources },
      loot: { ...outboundMission.loot },
      ships: { ...survivingShips },
      fuelConsumed: fuelCost,
      createdAt: Date.now(),
    };
  }

  // --------------------------------------------------------------------------
  // MISSION LIFECYCLE QUERIES
  // --------------------------------------------------------------------------

  /** Check if mission should be processed (arrival time reached). */
  shouldProcess(mission: FleetMission, nowSeconds: number): boolean {
    return mission.missionStatus === 'in_transit' && nowSeconds >= mission.timeArrival;
  }

  /** Remaining flight duration in seconds. */
  getRemainingDuration(mission: FleetMission, nowSeconds: number): number {
    if (mission.missionStatus !== 'in_transit') return 0;
    return Math.max(0, mission.timeArrival - nowSeconds);
  }

  /** Mission progress as percentage (0-100). */
  getProgress(mission: FleetMission, nowSeconds: number): number {
    if (mission.missionStatus !== 'in_transit') {
      return mission.missionStatus === 'arrived' || mission.missionStatus === 'completed' ? 100 : 0;
    }
    const totalDuration = mission.timeArrival - mission.timeDeparture;
    if (totalDuration <= 0) return 0;
    const elapsed = nowSeconds - mission.timeDeparture;
    return Math.min(100, Math.max(0, Math.round((elapsed / totalDuration) * 100)));
  }

  // --------------------------------------------------------------------------
  // SHIP REQUIREMENT CHECKS
  // --------------------------------------------------------------------------

  /** Can this fleet colonize (has at least 1 colony ship)? */
  canColonize(ships: Ships): boolean {
    return ships.colonyShip >= 1;
  }

  /** Minimum ships required for each mission type. */
  getMinimumShipsForMission(missionType: FleetMissionType): Partial<Ships> {
    switch (missionType) {
      case 'attack':
        return { lightFighter: 1 };
      case 'transport':
        return { smallCargo: 1 };
      case 'deploy':
        return {}; // Any ship can deploy
      case 'espionage':
        return { espionageProbe: 1 };
      case 'harvest':
        return { recycler: 1 };
      case 'colonize':
        return { colonyShip: 1 };
      case 'expedition':
      case 'return':
      default:
        return {};
    }
  }

  /** Check if fleet meets minimum ship requirements for a mission type. */
  meetsRequirements(ships: Ships, missionType: FleetMissionType): boolean {
    const minRequired = this.getMinimumShipsForMission(missionType);
    for (const [key, required] of Object.entries(minRequired)) {
      if ((ships[key as keyof Ships] || 0) < (required as number)) {
        return false;
      }
    }
    return true;
  }

  // --------------------------------------------------------------------------
  // FLEET COMPOSITION UTILITIES
  // --------------------------------------------------------------------------

  /** Total number of ships. */
  getTotalShips(ships: Ships): number {
    return Object.values(ships).reduce((sum, count) => sum + count, 0);
  }

  /** Get fleet statistics. */
  getFleetStats(ships: Ships): FleetStats {
    return {
      totalShips: this.getTotalShips(ships),
      cargoCapacity: calculateCargoCapacity(ships),
      slowestSpeed: getSlowestSpeed(ships),
      totalFuel: calculateFuelConsumption(ships, 1, 1, 0, 1.0),
    };
  }

  /** All-zero fleet. */
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

  /** Add two fleets together. */
  addFleets(fleet1: Ships, fleet2: Ships): Ships {
    const result = { ...fleet1 };
    for (const key of SHIP_KEYS) {
      result[key] += fleet2[key];
    }
    return result;
  }

  /** Subtract fleet2 from fleet1 (floors at 0). */
  subtractFleets(fleet1: Ships, fleet2: Ships): Ships {
    const result = { ...fleet1 };
    for (const key of SHIP_KEYS) {
      result[key] = Math.max(0, result[key] - fleet2[key]);
    }
    return result;
  }

  /** Check if fleet1 has at least all ships from fleet2. */
  hasShips(fleet1: Ships, fleet2: Ships): boolean {
    for (const key of SHIP_KEYS) {
      if (fleet1[key] < fleet2[key]) {
        return false;
      }
    }
    return true;
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

export const fleetService = new FleetService();

// ============================================================================
// CONVENIENCE FUNCTION EXPORTS
// ============================================================================

/**
 * Dispatch a fleet from source to destination.
 *
 * @param from          Source coordinate
 * @param to            Destination coordinate
 * @param ships         Fleet composition to send
 * @param resources     Resources to carry
 * @param missionType   Mission type (attack, transport, deploy, espionage, harvest, colonize)
 * @param speedPercent  Speed setting (10-100, default 100)
 * @param planetState   Source planet state (will be mutated: ships & fuel deducted)
 * @param opts          Additional options (missionId, playerId, planetIds, fleetSpeed)
 */
export function dispatchFleet(
  from: Coordinate,
  to: Coordinate,
  ships: Ships,
  resources: Resources,
  missionType: FleetMissionType,
  speedPercent: number,
  planetState: PlanetState,
  opts: {
    missionId?: string;
    playerId?: string;
    fromPlanetId?: string;
    toPlanetId?: string | null;
    fleetSpeed?: number;
  } = {},
): { mission: FleetMission | null; reason?: string } {
  const params: DispatchParams = {
    missionId: opts.missionId ?? `fleet-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    playerId: opts.playerId ?? planetState.playerId,
    fromPlanetId: opts.fromPlanetId ?? planetState.planetId,
    toPlanetId: opts.toPlanetId ?? null,
    from,
    to,
    ships,
    resources,
    missionType,
    speedPercent,
    fleetSpeed: opts.fleetSpeed,
  };

  return fleetService.dispatchFleet(params, planetState);
}

/**
 * Process arrival of a fleet at its destination.
 */
export function processFleetArrival(
  mission: FleetMission,
  opts?: {
    defenderData?: DefenderData;
    debrisField?: DebrisField;
    targetOccupied?: boolean;
    fleetSpeed?: number;
  },
): FleetArrivalResult {
  return fleetService.processFleetArrival(mission, opts);
}

/**
 * Process a returning fleet arriving at its home planet.
 */
export function processFleetReturn(
  mission: FleetMission,
  planetState: PlanetState,
): FleetReturnResult {
  return fleetService.processFleetReturn(mission, planetState);
}

/**
 * Calculate flight time between two coordinates for a given fleet.
 */
export function calculateFlightTime(
  from: Coordinate,
  to: Coordinate,
  ships: Ships,
  speedPercent: number = 100,
  fleetSpeed: number = 1.0,
): number {
  return fleetService.calculateFlightTime(from, to, ships, speedPercent, fleetSpeed);
}

/**
 * Calculate fuel (deuterium) cost for a fleet trip.
 */
export function calculateFuelCost(
  ships: Ships,
  distance: number,
  speedPercent: number = 100,
  fleetSpeed: number = 1.0,
): number {
  return fleetService.calculateFuelCost(ships, distance, speedPercent, fleetSpeed);
}
