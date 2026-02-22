/**
 * MoonDO — Durable Object for per-moon game state
 *
 * Similar to PlanetDO but for moons. Stores and manages:
 * - Moon building levels (Lunar Base, Sensor Phalanx, Jump Gate)
 * - Build queue (up to 5 items)
 * - Active sensor scans
 * - Jump gate cooldown state
 * - Alarm for next queue completion
 *
 * All state is persisted in DO storage automatically.
 * Alarms trigger processQueue() when queue item completes.
 */

import { QueueItem, Resources, Coordinate } from '../game/types';
import { MoonBuildingLevels, MoonBuildingType } from '../game/types';
import { calculateMoonBuildingBuildTime, calculateMoonBuildingCost } from '../game/services/moonBuildingService';

interface MoonDOState {
  moonId: string;
  planetId: string;
  playerId: string;
  coordinate: Coordinate;
  fields: number; // Total moon building fields
  buildings: MoonBuildingLevels;
  queue: QueueItem[];
  activeScans: SensorScan[];
  jumpGateCooldownUntil: number | null; // Unix timestamp
  lastTickAt: number; // Unix ms
  alarmAt: number | null;
}

interface SensorScan {
  moonId: string;
  targetGalaxy: number;
  targetSystem: number;
  targetPosition: number;
  targetPlayerId: string;
  level: number; // Phalanx level when scan was made
  createdAt: number;
  expiresAt: number; // 24 hours later
}

const STORAGE_KEY = 'moon-state';
const TICK_INTERVAL = 60000; // Resource production every 60 seconds (minimal for moons)

export class MoonDO implements DurableObject {
  state: DurableObjectState;
  env: any;
  moonState: MoonDOState | null = null;

  constructor(state: DurableObjectState, env: any) {
    this.state = state;
    this.env = env;
  }

  /**
   * Initialize moon state from storage or defaults
   */
  async initializeState(): Promise<void> {
    if (this.moonState) return;

    const stored = await this.state.storage.get<MoonDOState>(STORAGE_KEY);
    if (stored) {
      this.moonState = stored;
    } else {
      // Default new moon state
      this.moonState = {
        moonId: 'unknown',
        planetId: 'unknown',
        playerId: 'unknown',
        coordinate: { galaxy: 1, system: 1, position: 1 },
        fields: 5000, // Default moon size
        buildings: {
          lunarBase: 0,
          sensorPhalanx: 0,
          jumpGate: 0,
        },
        queue: [],
        activeScans: [],
        jumpGateCooldownUntil: null,
        lastTickAt: Date.now(),
        alarmAt: null,
      };
    }
  }

  /**
   * Persist state to DO storage
   */
  async saveState(): Promise<void> {
    if (!this.moonState) return;
    await this.state.storage.put<MoonDOState>(STORAGE_KEY, this.moonState);
  }

  /**
   * HTTP request handler
   */
  async fetch(request: Request): Promise<Response> {
    try {
      await this.initializeState();
      const url = new URL(request.url);
      const path = url.pathname;

      if (path === '/state' && request.method === 'GET') {
        return this.handleGetState();
      } else if (path === '/buildings' && request.method === 'GET') {
        return this.handleGetBuildings();
      } else if (path === '/queue/add' && request.method === 'POST') {
        return await this.handleAddQueue(request);
      } else if (path === '/queue/cancel' && request.method === 'POST') {
        return await this.handleCancelQueue(request);
      } else if (path === '/initialize' && request.method === 'POST') {
        return await this.handleInitialize(request);
      } else if (path === '/scan/activate' && request.method === 'POST') {
        return await this.handleActivateScan(request);
      } else if (path === '/scans' && request.method === 'GET') {
        return this.handleGetScans();
      } else if (path === '/jump-gate/transfer' && request.method === 'POST') {
        return await this.handleJumpGateTransfer(request);
      } else {
        return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
      }
    } catch (error) {
      console.error('[MoonDO] fetch error:', error);
      return new Response(JSON.stringify({ error: String(error) }), { status: 500 });
    }
  }

  /**
   * GET /state — Return full moon state
   */
  private handleGetState(): Response {
    if (!this.moonState) {
      return new Response(JSON.stringify({ error: 'Uninitialized' }), { status: 400 });
    }

    return new Response(
      JSON.stringify({
        moonId: this.moonState.moonId,
        planetId: this.moonState.planetId,
        playerId: this.moonState.playerId,
        coordinate: this.moonState.coordinate,
        fields: this.moonState.fields,
        buildings: this.moonState.buildings,
        queue: this.moonState.queue,
        activeScans: this.moonState.activeScans,
        jumpGateCooldownUntil: this.moonState.jumpGateCooldownUntil,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  /**
   * GET /buildings — Return building levels
   */
  private handleGetBuildings(): Response {
    if (!this.moonState) {
      return new Response(JSON.stringify({ error: 'Uninitialized' }), { status: 400 });
    }

    return new Response(JSON.stringify(this.moonState.buildings), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /**
   * POST /queue/add — Add building to queue
   * Body: { buildingType: MoonBuildingType, targetLevel: number }
   */
  private async handleAddQueue(request: Request): Promise<Response> {
    if (!this.moonState) {
      return new Response(JSON.stringify({ error: 'Uninitialized' }), { status: 400 });
    }

    try {
      const body = (await request.json()) as {
        buildingType: MoonBuildingType;
        targetLevel: number;
        roboticsLevel?: number;
        naniteLevel?: number;
      };

      const { buildingType, targetLevel, roboticsLevel = 0, naniteLevel = 0 } = body;

      if (!buildingType || targetLevel < 1) {
        return new Response(JSON.stringify({ error: 'Invalid buildingType or targetLevel' }), { status: 400 });
      }

      // Calculate cost and build time
      const cost = calculateMoonBuildingCost(buildingType, targetLevel);
      const buildTime = calculateMoonBuildingBuildTime(buildingType, targetLevel, roboticsLevel, naniteLevel);

      const now = Date.now();
      const queueItem: QueueItem = {
        buildingId: 40 + ['lunarBase', 'sensorPhalanx', 'jumpGate'].indexOf(buildingType) + 1,
        targetLevel,
        timeStart: now,
        timeEnd: now + buildTime * 1000,
        costMetal: cost.metal,
        costCrystal: cost.crystal,
        costDeuterium: cost.deuterium,
      };

      this.moonState.queue.push(queueItem);
      await this.saveState();

      // Set alarm for next completion
      if (!this.moonState.alarmAt || this.moonState.alarmAt > queueItem.timeEnd) {
        this.state.storage.setAlarm(new Date(queueItem.timeEnd));
        this.moonState.alarmAt = queueItem.timeEnd;
      }

      return new Response(JSON.stringify({ queued: queueItem }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      console.error('[MoonDO] handleAddQueue error:', error);
      return new Response(JSON.stringify({ error: String(error) }), { status: 500 });
    }
  }

  /**
   * POST /queue/cancel — Cancel queued building
   * Body: { buildingType: MoonBuildingType }
   */
  private async handleCancelQueue(request: Request): Promise<Response> {
    if (!this.moonState) {
      return new Response(JSON.stringify({ error: 'Uninitialized' }), { status: 400 });
    }

    try {
      const body = (await request.json()) as { buildingType: MoonBuildingType };

      if (!body.buildingType) {
        return new Response(JSON.stringify({ error: 'Missing buildingType' }), { status: 400 });
      }

      const buildingId = 40 + ['lunarBase', 'sensorPhalanx', 'jumpGate'].indexOf(body.buildingType) + 1;

      const index = this.moonState.queue.findIndex((q) => q.buildingId === buildingId);
      if (index === -1) {
        return new Response(JSON.stringify({ error: 'Building not in queue' }), { status: 404 });
      }

      const removed = this.moonState.queue.splice(index, 1)[0];
      await this.saveState();

      return new Response(JSON.stringify({ canceled: removed }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      console.error('[MoonDO] handleCancelQueue error:', error);
      return new Response(JSON.stringify({ error: String(error) }), { status: 500 });
    }
  }

  /**
   * POST /initialize — Initialize moon (admin endpoint)
   * Body: { moonId, planetId, playerId, coordinate, fields }
   */
  private async handleInitialize(request: Request): Promise<Response> {
    try {
      const body = (await request.json()) as Partial<MoonDOState>;

      if (!body.moonId || !body.planetId || !body.playerId) {
        return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400 });
      }

      this.moonState = {
        moonId: body.moonId,
        planetId: body.planetId,
        playerId: body.playerId,
        coordinate: body.coordinate || { galaxy: 1, system: 1, position: 1 },
        fields: body.fields || 5000,
        buildings: body.buildings || {
          lunarBase: 0,
          sensorPhalanx: 0,
          jumpGate: 0,
        },
        queue: [],
        activeScans: [],
        jumpGateCooldownUntil: null,
        lastTickAt: Date.now(),
        alarmAt: null,
      };

      await this.saveState();

      return new Response(JSON.stringify({ initialized: this.moonState }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      console.error('[MoonDO] handleInitialize error:', error);
      return new Response(JSON.stringify({ error: String(error) }), { status: 500 });
    }
  }

  /**
   * POST /scan/activate — Activate sensor phalanx scan
   * Body: { targetGalaxy, targetSystem, targetPosition, targetPlayerId }
   */
  private async handleActivateScan(request: Request): Promise<Response> {
    if (!this.moonState) {
      return new Response(JSON.stringify({ error: 'Uninitialized' }), { status: 400 });
    }

    try {
      const body = (await request.json()) as {
        targetGalaxy: number;
        targetSystem: number;
        targetPosition: number;
        targetPlayerId: string;
      };

      const phalanxLevel = this.moonState.buildings.sensorPhalanx;
      if (phalanxLevel < 1) {
        return new Response(JSON.stringify({ error: 'Sensor Phalanx not built' }), { status: 400 });
      }

      const now = Math.floor(Date.now() / 1000);
      const scan: SensorScan = {
        moonId: this.moonState.moonId,
        targetGalaxy: body.targetGalaxy,
        targetSystem: body.targetSystem,
        targetPosition: body.targetPosition,
        targetPlayerId: body.targetPlayerId,
        level: phalanxLevel,
        createdAt: now,
        expiresAt: now + 86400, // 24 hours
      };

      // Remove old scan for this target (max 1 per moon)
      this.moonState.activeScans = this.moonState.activeScans.filter(
        (s) => !(s.targetGalaxy === scan.targetGalaxy && s.targetSystem === scan.targetSystem)
      );

      this.moonState.activeScans.push(scan);
      await this.saveState();

      return new Response(JSON.stringify({ scan }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      console.error('[MoonDO] handleActivateScan error:', error);
      return new Response(JSON.stringify({ error: String(error) }), { status: 500 });
    }
  }

  /**
   * GET /scans — List active sensor scans
   */
  private handleGetScans(): Response {
    if (!this.moonState) {
      return new Response(JSON.stringify({ error: 'Uninitialized' }), { status: 400 });
    }

    // Filter out expired scans
    const now = Math.floor(Date.now() / 1000);
    const activeScans = this.moonState.activeScans.filter((s) => s.expiresAt > now);

    return new Response(JSON.stringify({ scans: activeScans }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /**
   * POST /jump-gate/transfer — Transfer fleet via jump gate
   * Body: { targetMoonId, fleetId }
   * Checks: moon has jump gate, cooldown expired, same player
   */
  private async handleJumpGateTransfer(request: Request): Promise<Response> {
    if (!this.moonState) {
      return new Response(JSON.stringify({ error: 'Uninitialized' }), { status: 400 });
    }

    try {
      const body = (await request.json()) as {
        targetMoonId: string;
        fleetId: string;
      };

      const jumpGateLevel = this.moonState.buildings.jumpGate;
      if (jumpGateLevel < 1) {
        return new Response(JSON.stringify({ error: 'Jump Gate not built' }), { status: 400 });
      }

      // Check cooldown
      const now = Math.floor(Date.now() / 1000);
      if (this.moonState.jumpGateCooldownUntil !== null && this.moonState.jumpGateCooldownUntil > now) {
        const remaining = this.moonState.jumpGateCooldownUntil - now;
        return new Response(
          JSON.stringify({
            error: 'Jump Gate on cooldown',
            cooldownUntil: this.moonState.jumpGateCooldownUntil,
            remainingSeconds: remaining,
          }),
          { status: 429 }
        );
      }

      // Set cooldown (1 hour)
      this.moonState.jumpGateCooldownUntil = now + 3600;
      await this.saveState();

      return new Response(
        JSON.stringify({
          transferred: {
            fleetId: body.fleetId,
            targetMoonId: body.targetMoonId,
            from: this.moonState.moonId,
            cooldownUntil: this.moonState.jumpGateCooldownUntil,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    } catch (error) {
      console.error('[MoonDO] handleJumpGateTransfer error:', error);
      return new Response(JSON.stringify({ error: String(error) }), { status: 500 });
    }
  }

  /**
   * Process alarm — Called by Cloudflare when alarm time reaches
   * Completes queue items and reschedules next alarm
   */
  async alarm(): Promise<void> {
    try {
      await this.initializeState();
      if (!this.moonState) return;

      const now = Date.now();

      // Complete all queue items ready
      const completedIndices: number[] = [];
      for (let i = 0; i < this.moonState.queue.length; i++) {
        const item = this.moonState.queue[i];
        if (item.timeEnd <= now) {
          completedIndices.push(i);
          this.moonState.buildings[
            ['lunarBase', 'sensorPhalanx', 'jumpGate'][item.buildingId - 41] as MoonBuildingType
          ]++;
        }
      }

      // Remove completed items (in reverse to preserve indices)
      for (let i = completedIndices.length - 1; i >= 0; i--) {
        this.moonState.queue.splice(completedIndices[i], 1);
      }

      // Schedule next alarm
      if (this.moonState.queue.length > 0) {
        const nextCompletion = Math.min(...this.moonState.queue.map((q) => q.timeEnd));
        this.state.storage.setAlarm(new Date(nextCompletion));
        this.moonState.alarmAt = nextCompletion;
      } else {
        this.moonState.alarmAt = null;
      }

      await this.saveState();
    } catch (error) {
      console.error('[MoonDO] alarm error:', error);
    }
  }
}
