import { Coordinate, PlanetState, QueueItem, BuildingLevels, Resources, Ships, TechLevels } from '../game/types';
import { calculateProduction, BASE_PRODUCTION, calculateBuildTime, calculateEnergyProduction, calculateEnergyConsumption, calculateProductionMultiplier } from '../game/formulas';
import {
  ShipyardQueue,
  ShipBuildOrder,
  buildShips,
  processShipyardQueue,
  cancelShipOrder,
  createEmptyQueue,
  getNextCompletionTime,
  getAvailableShips,
  getAllShipInfo,
  getShipCost,
  getShipBuildTime,
  SHIP_NAMES,
} from '../game/services/shipyardService';

/**
 * PlanetDO — Durable Object for per-planet game state
 *
 * Stores and manages:
 * - Building levels
 * - Resources (metal, crystal, deuterium)
 * - Build queue (up to 3-10 items depending on queue size)
 * - Alarm for next queue completion
 *
 * All state is persisted in DO storage automatically.
 * Alarms trigger processQueue() when queue item completes.
 */

interface PlanetDOState {
  planetId: string;
  playerId: string;
  coordinate: Coordinate;
  temperature: number;
  universeSpeed: number;
  buildings: BuildingLevels;
  resources: Resources;
  ships: Ships;
  queue: QueueItem[];
  shipQueue: ShipyardQueue;  // Shipyard build queue
  techLevels: TechLevels;    // Player's tech levels (synced from D1)
  lastTickAt: number; // unix ms
  alarmAt: number | null;
}

const STORAGE_KEY = 'planet-state';
const TICK_INTERVAL = 60000; // Update resources every 60 seconds

export class PlanetDO implements DurableObject {
  state: DurableObjectState;
  env: any;
  planetState: PlanetDOState | null = null;

  constructor(state: DurableObjectState, env: any) {
    this.state = state;
    this.env = env;
  }

  /**
   * Initialize planet state from storage or defaults
   */
  async initializeState(): Promise<void> {
    if (this.planetState) return;

    const stored = await this.state.storage.get<PlanetDOState>(STORAGE_KEY);
    if (stored) {
      this.planetState = stored;
      // Migration: add shipQueue if missing (pre-shipyard-system state)
      if (!this.planetState.shipQueue) {
        this.planetState.shipQueue = createEmptyQueue();
      }
      // Migration: add techLevels if missing
      if (!this.planetState.techLevels) {
        this.planetState.techLevels = {
          energyTech: 0, laserTech: 0, ionTech: 0, hyperspaceTech: 0,
          plasmaTech: 0, combustionDrive: 0, impulseDrive: 0, hyperspaceDrive: 0,
          espionageTech: 0, computerTech: 0, astrophysics: 0,
          weaponTech: 0, shieldingTech: 0, armorTech: 0, gravitonTech: 0,
        };
      }
    } else {
      // Default new planet state
      this.planetState = {
        planetId: 'unknown',
        playerId: 'unknown',
        coordinate: { galaxy: 1, system: 1, position: 1 },
        temperature: 30,
        universeSpeed: 1,
        buildings: {
          metalMine: 1,
          crystalMine: 1,
          deutSynth: 0,
          solarPlant: 1,
          fusionReactor: 0,
          roboticsFactory: 0,
          naniteFactory: 0,
          shipyard: 0,
          researchLab: 0,
          metalStorage: 1,
          crystalStorage: 1,
          deutTank: 1,
        },
        resources: { metal: 500, crystal: 300, deuterium: 100 },
        ships: {
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
          solarSatellite: 0,
        },
        queue: [],
        shipQueue: createEmptyQueue(),
        techLevels: {
          energyTech: 0,
          laserTech: 0,
          ionTech: 0,
          hyperspaceTech: 0,
          plasmaTech: 0,
          combustionDrive: 0,
          impulseDrive: 0,
          hyperspaceDrive: 0,
          espionageTech: 0,
          computerTech: 0,
          astrophysics: 0,
          weaponTech: 0,
          shieldingTech: 0,
          armorTech: 0,
          gravitonTech: 0,
        },
        lastTickAt: Date.now(),
        alarmAt: null,
      };
      await this.persistState();
    }

    // Set up alarm if one is pending
    if (this.planetState.alarmAt) {
      await this.state.storage.setAlarm(new Date(this.planetState.alarmAt));
    }
  }

  /**
   * Persist current state to storage
   */
  async persistState(): Promise<void> {
    if (!this.planetState) return;
    await this.state.storage.put(STORAGE_KEY, this.planetState);
  }

  /**
   * Main request handler
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      await this.initializeState();

      // Route handlers
      if (path === '/tick' && request.method === 'POST') {
        return await this.handleTick();
      } else if (path === '/state' && request.method === 'GET') {
        return await this.handleGetState();
      } else if (path === '/queue/add' && request.method === 'POST') {
        return await this.handleAddQueue(request);
      } else if (path === '/queue/list' && request.method === 'GET') {
        return await this.handleGetQueue();
      } else if (path === '/resources' && request.method === 'GET') {
        return await this.handleGetResources();
      } else if (path === '/buildings' && request.method === 'GET') {
        return await this.handleGetBuildings();
      } else if (path === '/initialize' && request.method === 'POST') {
        return await this.handleInitialize(request);
      } else if (path === '/fleet-deduct' && request.method === 'POST') {
        return await this.handleFleetDeduct(request);
      } else if (path === '/ships' && request.method === 'GET') {
        return await this.handleGetShips();
      } else if (path === '/ships/add' && request.method === 'POST') {
        return await this.handleAddShips(request);
      } else if (path === '/ships/build' && request.method === 'POST') {
        return await this.handleBuildShips(request);
      } else if (path === '/ships/queue' && request.method === 'GET') {
        return await this.handleGetShipQueue();
      } else if (path === '/ships/cancel' && request.method === 'POST') {
        return await this.handleCancelShipOrder(request);
      } else if (path === '/ships/available' && request.method === 'GET') {
        return await this.handleGetAvailableShips();
      } else if (path === '/tech-levels' && request.method === 'POST') {
        return await this.handleSetTechLevels(request);
      } else if (path === '/cheat-resources' && request.method === 'POST') {
        const body = await request.json() as any;
        if (this.planetState) {
          this.planetState.resources.metal = body.metal ?? this.planetState.resources.metal;
          this.planetState.resources.crystal = body.crystal ?? this.planetState.resources.crystal;
          this.planetState.resources.deuterium = body.deuterium ?? this.planetState.resources.deuterium;
          await this.ctx.storage.put('state', this.planetState);
        }
        return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
      } else {
        return new Response('Not Found', { status: 404 });
      }
    } catch (error) {
      console.error('PlanetDO error:', error);
      return new Response(JSON.stringify({ error: String(error) }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  /**
   * POST /tick
   * Update resources since last tick
   * Called every minute by Cron or on-demand
   */
  private async handleTick(): Promise<Response> {
    if (!this.planetState) throw new Error('State not initialized');

    const nowMs = Date.now();
    const deltaMs = nowMs - this.planetState.lastTickAt;
    const deltaHours = deltaMs / (1000 * 60 * 60);

    // Calculate energy balance for production multiplier
    const energyProduced = calculateEnergyProduction(
      this.planetState.buildings.solarPlant,
      this.planetState.buildings.fusionReactor,
      this.planetState.ships.solarSatellite ?? 0,
      this.planetState.techLevels.energyTech,
      this.planetState.temperature
    );
    const energyConsumed = calculateEnergyConsumption(
      this.planetState.buildings.metalMine,
      this.planetState.buildings.crystalMine,
      this.planetState.buildings.deutSynth
    );
    const productionMultiplier = calculateProductionMultiplier(energyProduced, energyConsumed);

    // Update resources from production (scaled by energy multiplier)
    const metalProd = calculateProduction(
      BASE_PRODUCTION.metal,
      this.planetState.buildings.metalMine,
      this.planetState.temperature
    );
    const crystalProd = calculateProduction(
      BASE_PRODUCTION.crystal,
      this.planetState.buildings.crystalMine,
      this.planetState.temperature
    );
    const deutProd = calculateProduction(
      BASE_PRODUCTION.deuterium,
      this.planetState.buildings.deutSynth,
      this.planetState.temperature
    );

    this.planetState.resources.metal += Math.floor(metalProd * productionMultiplier * deltaHours);
    this.planetState.resources.crystal += Math.floor(crystalProd * productionMultiplier * deltaHours);
    this.planetState.resources.deuterium += Math.floor(deutProd * productionMultiplier * deltaHours);

    this.planetState.lastTickAt = nowMs;

    // Check if building queue head completed
    if (this.planetState.queue.length > 0) {
      const head = this.planetState.queue[0];
      if (nowMs >= head.timeEnd) {
        await this.completeQueueItem();
      }
    }

    // Process shipyard queue — complete any finished ship builds
    if (this.planetState.shipQueue.currentOrder || this.planetState.shipQueue.orders.length > 0) {
      processShipyardQueue(this.planetState.shipQueue, this.planetState.ships, nowMs);
      await this.updateShipyardAlarm();
    }

    await this.persistState();

    return new Response(
      JSON.stringify({
        resources: this.planetState.resources,
        deltaMs,
        production: { metalProd, crystalProd, deutProd },
        energy: {
          produced: energyProduced,
          consumed: energyConsumed,
          balance: energyProduced - energyConsumed,
          multiplier: productionMultiplier,
        },
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  }

  /**
   * POST /queue/add
   * Add building to queue if resources available
   * Body: { buildingId, targetLevel }
   */
  private async handleAddQueue(request: Request): Promise<Response> {
    if (!this.planetState) throw new Error('State not initialized');

    const body = await request.json<{ buildingId: number; targetLevel: number }>();
    const { buildingId, targetLevel } = body;

    // Get current level
    const buildingNames: Record<number, keyof BuildingLevels> = {
      1: 'metalMine',
      2: 'crystalMine',
      3: 'deutSynth',
      4: 'solarPlant',
      12: 'fusionReactor',
      14: 'roboticsFactory',
      15: 'naniteFactory',
      21: 'shipyard',
      31: 'researchLab',
      22: 'metalStorage',
      23: 'crystalStorage',
      24: 'deutTank',
    };

    const buildingKey = buildingNames[buildingId];
    if (!buildingKey) {
      return new Response(JSON.stringify({ error: 'Unknown building' }), { status: 400 });
    }

    const currentLevel = this.planetState.buildings[buildingKey];
    const nextLevel = currentLevel + 1;

    if (nextLevel > targetLevel) {
      return new Response(JSON.stringify({ error: 'Already at or above target level' }), {
        status: 400,
      });
    }

    // Calculate cost for next level
    // TODO: Get from game/formulas
    const costMetal = Math.floor(60 * Math.pow(1.5, nextLevel - 1));
    const costCrystal = Math.floor(15 * Math.pow(1.5, nextLevel - 1));
    const costDeuterium = 0;

    // Check resources
    if (
      this.planetState.resources.metal < costMetal ||
      this.planetState.resources.crystal < costCrystal ||
      this.planetState.resources.deuterium < costDeuterium
    ) {
      return new Response(JSON.stringify({ error: 'Insufficient resources' }), { status: 400 });
    }

    // Deduct resources
    this.planetState.resources.metal -= costMetal;
    this.planetState.resources.crystal -= costCrystal;
    this.planetState.resources.deuterium -= costDeuterium;

    // Calculate build time
    const buildTime = calculateBuildTime(
      costMetal,
      costCrystal,
      nextLevel,
      this.planetState.buildings.roboticsFactory,
      this.planetState.buildings.naniteFactory,
      this.planetState.universeSpeed
    );

    const nowMs = Date.now();
    const queueItem: QueueItem = {
      buildingId,
      targetLevel: nextLevel,
      timeStart: nowMs,
      timeEnd: nowMs + buildTime * 1000,
      costMetal,
      costCrystal,
      costDeuterium,
    };

    this.planetState.queue.push(queueItem);

    // Set alarm for when this item completes
    if (this.planetState.queue.length === 1) {
      this.planetState.alarmAt = queueItem.timeEnd;
      await this.state.storage.setAlarm(new Date(queueItem.timeEnd));
    }

    await this.persistState();

    return new Response(
      JSON.stringify({
        queueItem,
        resources: this.planetState.resources,
        queue: this.planetState.queue,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  }

  /**
   * Complete the head queue item
   * Upgrade building, remove from queue, set next alarm
   */
  private async completeQueueItem(): Promise<void> {
    if (!this.planetState || this.planetState.queue.length === 0) return;

    const completed = this.planetState.queue.shift()!;

    // Upgrade building
    const buildingNames: Record<number, keyof BuildingLevels> = {
      1: 'metalMine',
      2: 'crystalMine',
      3: 'deutSynth',
      4: 'solarPlant',
      12: 'fusionReactor',
      14: 'roboticsFactory',
      15: 'naniteFactory',
      21: 'shipyard',
      31: 'researchLab',
      22: 'metalStorage',
      23: 'crystalStorage',
      24: 'deutTank',
    };

    const buildingKey = buildingNames[completed.buildingId];
    if (buildingKey) {
      this.planetState.buildings[buildingKey] = completed.targetLevel;
    }

    // Set alarm for next queue item
    if (this.planetState.queue.length > 0) {
      const nextItem = this.planetState.queue[0];
      this.planetState.alarmAt = nextItem.timeEnd;
      await this.state.storage.setAlarm(new Date(nextItem.timeEnd));
    } else {
      this.planetState.alarmAt = null;
    }

    await this.persistState();
  }

  /**
   * Alarm handler
   * Called automatically when alarm time is reached
   */
  async alarm(): Promise<void> {
    await this.initializeState();
    if (this.planetState) {
      const nowMs = Date.now();

      // Process building queue
      await this.completeQueueItem();

      // Process shipyard queue
      if (this.planetState.shipQueue.currentOrder || this.planetState.shipQueue.orders.length > 0) {
        processShipyardQueue(this.planetState.shipQueue, this.planetState.ships, nowMs);
        await this.updateShipyardAlarm();
        await this.persistState();
      }
    }
  }

  /**
   * GET /state
   * Get current full planet state
   */
  private async handleGetState(): Promise<Response> {
    if (!this.planetState) throw new Error('State not initialized');

    // Tick to get current resources
    const nowMs = Date.now();
    const deltaMs = nowMs - this.planetState.lastTickAt;
    const deltaHours = deltaMs / (1000 * 60 * 60);

    const currentResources = {
      metal: Math.floor(
        this.planetState.resources.metal +
          calculateProduction(
            BASE_PRODUCTION.metal,
            this.planetState.buildings.metalMine,
            this.planetState.temperature
          ) *
            deltaHours
      ),
      crystal: Math.floor(
        this.planetState.resources.crystal +
          calculateProduction(
            BASE_PRODUCTION.crystal,
            this.planetState.buildings.crystalMine,
            this.planetState.temperature
          ) *
            deltaHours
      ),
      deuterium: Math.floor(
        this.planetState.resources.deuterium +
          calculateProduction(
            BASE_PRODUCTION.deuterium,
            this.planetState.buildings.deutSynth,
            this.planetState.temperature
          ) *
            deltaHours
      ),
    };

    const state: PlanetState = {
      planetId: this.planetState.planetId,
      playerId: this.planetState.playerId,
      coordinate: this.planetState.coordinate,
      planetType: 'planet',
      name: 'Planet',
      temperature: this.planetState.temperature,
      fields: 163,
      universeSpeed: this.planetState.universeSpeed,
      buildings: this.planetState.buildings,
      resources: currentResources,
      ships: this.planetState.ships,
      queue: this.planetState.queue,
      lastTickAt: nowMs,
    };

    return new Response(JSON.stringify(state), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /**
   * GET /queue/list
   * Get current build queue
   */
  private async handleGetQueue(): Promise<Response> {
    if (!this.planetState) throw new Error('State not initialized');

    return new Response(JSON.stringify(this.planetState.queue), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /**
   * GET /resources
   * Get current resources (with live calculation)
   */
  private async handleGetResources(): Promise<Response> {
    if (!this.planetState) throw new Error('State not initialized');

    const nowMs = Date.now();
    const deltaMs = nowMs - this.planetState.lastTickAt;
    const deltaHours = deltaMs / (1000 * 60 * 60);

    // Calculate energy balance
    const energyProduced = calculateEnergyProduction(
      this.planetState.buildings.solarPlant,
      this.planetState.buildings.fusionReactor,
      this.planetState.ships.solarSatellite ?? 0,
      this.planetState.techLevels.energyTech,
      this.planetState.temperature
    );
    const energyConsumed = calculateEnergyConsumption(
      this.planetState.buildings.metalMine,
      this.planetState.buildings.crystalMine,
      this.planetState.buildings.deutSynth
    );
    const productionMultiplier = calculateProductionMultiplier(energyProduced, energyConsumed);

    const metalPerHour = calculateProduction(
      BASE_PRODUCTION.metal,
      this.planetState.buildings.metalMine,
      this.planetState.temperature
    );
    const crystalPerHour = calculateProduction(
      BASE_PRODUCTION.crystal,
      this.planetState.buildings.crystalMine,
      this.planetState.temperature
    );
    const deutPerHour = calculateProduction(
      BASE_PRODUCTION.deuterium,
      this.planetState.buildings.deutSynth,
      this.planetState.temperature
    );

    const current = {
      metal: Math.floor(
        this.planetState.resources.metal + metalPerHour * productionMultiplier * deltaHours
      ),
      crystal: Math.floor(
        this.planetState.resources.crystal + crystalPerHour * productionMultiplier * deltaHours
      ),
      deuterium: Math.floor(
        this.planetState.resources.deuterium + deutPerHour * productionMultiplier * deltaHours
      ),
    };

    const production = {
      metalPerHour: Math.floor(metalPerHour * productionMultiplier),
      crystalPerHour: Math.floor(crystalPerHour * productionMultiplier),
      deutPerHour: Math.floor(deutPerHour * productionMultiplier),
    };

    const energy = {
      produced: energyProduced,
      consumed: energyConsumed,
      balance: energyProduced - energyConsumed,
      multiplier: productionMultiplier,
    };

    return new Response(JSON.stringify({ resources: current, production, energy }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /**
   * GET /buildings
   * Get building levels
   */
  private async handleGetBuildings(): Promise<Response> {
    if (!this.planetState) throw new Error('State not initialized');

    return new Response(JSON.stringify(this.planetState.buildings), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /**
   * POST /initialize
   * Initialize planet with data from request
   * Body: { planetId, playerId, coordinate, temperature, universeSpeed, buildings, resources }
   */
  private async handleInitialize(request: Request): Promise<Response> {
    const body = await request.json<Partial<PlanetDOState>>();

    if (!this.planetState) throw new Error('State not initialized');

    // Update state with provided data
    if (body.planetId) this.planetState.planetId = body.planetId;
    if (body.playerId) this.planetState.playerId = body.playerId;
    if (body.coordinate) this.planetState.coordinate = body.coordinate;
    if (body.temperature !== undefined) this.planetState.temperature = body.temperature;
    if (body.universeSpeed !== undefined) this.planetState.universeSpeed = body.universeSpeed;
    if (body.buildings) this.planetState.buildings = body.buildings;
    if (body.resources) this.planetState.resources = body.resources;
    if (body.ships) this.planetState.ships = body.ships;

    this.planetState.lastTickAt = Date.now();

    await this.persistState();

    return new Response(JSON.stringify({ initialized: true, state: this.planetState }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /**
   * POST /fleet-deduct
   * Update planet ships and resources after fleet dispatch.
   * Called by the fleet/send API after fleetService.dispatchFleet mutates the state.
   * Body: { ships: Ships, resources: Resources }
   */
  private async handleFleetDeduct(request: Request): Promise<Response> {
    if (!this.planetState) throw new Error('State not initialized');

    const body = await request.json<{ ships: Ships; resources: Resources }>();

    this.planetState.ships = body.ships;
    this.planetState.resources = body.resources;

    await this.persistState();

    return new Response(
      JSON.stringify({ deducted: true, ships: this.planetState.ships, resources: this.planetState.resources }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  }

  /**
   * GET /ships
   * Get current ship counts on this planet
   */
  private async handleGetShips(): Promise<Response> {
    if (!this.planetState) throw new Error('State not initialized');

    return new Response(JSON.stringify(this.planetState.ships), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /**
   * POST /ships/add
   * Add ships back to the planet (used when a fleet returns).
   * Body: { ships: Ships, resources?: Resources }
   */
  private async handleAddShips(request: Request): Promise<Response> {
    if (!this.planetState) throw new Error('State not initialized');

    const body = await request.json<{ ships: Ships; resources?: Resources }>();

    // Add ships
    for (const key of Object.keys(body.ships) as (keyof Ships)[]) {
      this.planetState.ships[key] = (this.planetState.ships[key] || 0) + (body.ships[key] || 0);
    }

    // Add resources if provided (e.g., returning fleet with loot)
    if (body.resources) {
      this.planetState.resources.metal += body.resources.metal || 0;
      this.planetState.resources.crystal += body.resources.crystal || 0;
      this.planetState.resources.deuterium += body.resources.deuterium || 0;
    }

    await this.persistState();

    return new Response(
      JSON.stringify({ added: true, ships: this.planetState.ships, resources: this.planetState.resources }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  }

  // ==========================================================================
  // SHIPYARD ENDPOINTS
  // ==========================================================================

  /**
   * POST /ships/build
   * Build ships and add to shipyard queue.
   * Body: { shipType: keyof Ships, count: number }
   */
  private async handleBuildShips(request: Request): Promise<Response> {
    if (!this.planetState) throw new Error('State not initialized');

    const body = await request.json<{ shipType: keyof Ships; count: number }>();
    const { shipType, count } = body;

    if (!shipType || !count || count <= 0) {
      return new Response(
        JSON.stringify({ error: 'shipType and count (> 0) are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // Process any completed ships first
    const nowMs = Date.now();
    processShipyardQueue(this.planetState.shipQueue, this.planetState.ships, nowMs);

    try {
      const order = buildShips(
        shipType,
        count,
        this.planetState.buildings,
        this.planetState.techLevels,
        this.planetState.resources,
        this.planetState.universeSpeed,
      );

      // Add order to queue
      if (!this.planetState.shipQueue.currentOrder && this.planetState.shipQueue.orders.length === 0) {
        // Queue is empty, start building immediately
        this.planetState.shipQueue.currentOrder = order;
        this.planetState.shipQueue.currentProgress = 0;
        this.planetState.shipQueue.startedAt = nowMs;
      } else {
        // Append to queue
        this.planetState.shipQueue.orders.push(order);
      }

      await this.updateShipyardAlarm();
      await this.persistState();

      return new Response(
        JSON.stringify({
          order,
          resources: this.planetState.resources,
          shipQueue: this.planetState.shipQueue,
        }),
        { headers: { 'Content-Type': 'application/json' } },
      );
    } catch (err) {
      return new Response(
        JSON.stringify({ error: String(err) }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }
  }

  /**
   * GET /ships/queue
   * Get current shipyard build queue
   */
  private async handleGetShipQueue(): Promise<Response> {
    if (!this.planetState) throw new Error('State not initialized');

    // Process any completed ships before returning
    const nowMs = Date.now();
    processShipyardQueue(this.planetState.shipQueue, this.planetState.ships, nowMs);
    await this.persistState();

    return new Response(
      JSON.stringify(this.planetState.shipQueue),
      { headers: { 'Content-Type': 'application/json' } },
    );
  }

  /**
   * POST /ships/cancel
   * Cancel a queued ship build order.
   * Body: { orderIndex: number }
   */
  private async handleCancelShipOrder(request: Request): Promise<Response> {
    if (!this.planetState) throw new Error('State not initialized');

    const body = await request.json<{ orderIndex: number }>();
    const { orderIndex } = body;

    if (orderIndex === undefined || orderIndex === null) {
      return new Response(
        JSON.stringify({ error: 'orderIndex is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const cancelled = cancelShipOrder(
      this.planetState.shipQueue,
      orderIndex,
      this.planetState.resources,
    );

    if (!cancelled) {
      return new Response(
        JSON.stringify({ error: 'Invalid order index or order not found' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    await this.updateShipyardAlarm();
    await this.persistState();

    return new Response(
      JSON.stringify({
        cancelled,
        resources: this.planetState.resources,
        shipQueue: this.planetState.shipQueue,
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  }

  /**
   * GET /ships/available
   * List all buildable ships with costs, build times, and requirements
   */
  private async handleGetAvailableShips(): Promise<Response> {
    if (!this.planetState) throw new Error('State not initialized');

    const shipInfo = getAllShipInfo(
      this.planetState.buildings,
      this.planetState.techLevels,
      this.planetState.buildings.naniteFactory,
      this.planetState.universeSpeed,
    );

    return new Response(JSON.stringify(shipInfo), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /**
   * POST /tech-levels
   * Sync technology levels from D1 into the Durable Object.
   * Called when tech levels change (research completion).
   * Body: TechLevels
   */
  private async handleSetTechLevels(request: Request): Promise<Response> {
    if (!this.planetState) throw new Error('State not initialized');

    const techLevels = await request.json<TechLevels>();
    this.planetState.techLevels = techLevels;

    await this.persistState();

    return new Response(
      JSON.stringify({ updated: true, techLevels: this.planetState.techLevels }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  }

  // ==========================================================================
  // SHIPYARD ALARM HELPER
  // ==========================================================================

  /**
   * Update the alarm to fire when the next shipyard unit completes,
   * if that's sooner than the existing building-queue alarm.
   */
  private async updateShipyardAlarm(): Promise<void> {
    if (!this.planetState) return;

    const nextShipTime = getNextCompletionTime(this.planetState.shipQueue);

    // Determine the earliest alarm needed (building queue or shipyard queue)
    let earliestAlarm = this.planetState.alarmAt;

    if (nextShipTime !== null) {
      if (earliestAlarm === null || nextShipTime < earliestAlarm) {
        earliestAlarm = nextShipTime;
      }
    }

    if (earliestAlarm !== null && earliestAlarm !== this.planetState.alarmAt) {
      this.planetState.alarmAt = earliestAlarm;
      await this.state.storage.setAlarm(new Date(earliestAlarm));
    }
  }
}
