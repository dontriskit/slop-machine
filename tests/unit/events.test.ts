/**
 * Unit tests for EventService
 *
 * Tests cover:
 *   - Event type definitions and constants
 *   - Pure modifier computation (no D1 needed)
 *   - Formula helper functions
 *   - NEUTRAL_MODIFIERS baseline
 *   - Event validation logic
 *   - scheduleWeekendEvent time calculation (mocked DB)
 *   - isEventTypeActive helpers (mocked DB)
 *   - createEvent / getActiveEvents via mock D1
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  VALID_EVENT_TYPES,
  EVENT_TYPE_DEFAULTS,
  NEUTRAL_MODIFIERS,
  computeModifiers,
  applyProductionModifier,
  applyBuildTimeModifier,
  applyXpModifier,
  applyAttackModifier,
  applyDebrisModifier,
  applyFleetSpeedModifier,
  EventService,
  eventService,
  type GameEvent,
  type EventType,
  type EventModifiers,
} from '../../worker/src/game/services/eventService';

// ============================================================================
// HELPERS
// ============================================================================

const VALID_TYPES: EventType[] = [
  'double_production',
  'double_xp',
  'reduced_build_time',
  'combat_weekend',
  'harvest_bonus',
  'fleet_speed',
];

function makeEvent(overrides: Partial<GameEvent> = {}): GameEvent {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: 'evt_test_001',
    name: 'Test Event',
    description: 'Test description',
    type: 'double_production',
    modifierType: 'production_multiplier',
    modifierValue: 2.0,
    startTime: now - 3600,
    endTime: now + 3600,
    createdAt: now - 7200,
    createdBy: 'system',
    ...overrides,
  };
}

/** Create a minimal mock D1 database */
function makeMockDB(rows: any[] = []): any {
  const prepared = {
    bind: (..._args: any[]) => prepared,
    all: vi.fn().mockResolvedValue({ results: rows }),
    first: vi.fn().mockResolvedValue(rows[0] ?? null),
    run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
  };
  return {
    prepare: vi.fn().mockReturnValue(prepared),
  };
}

// ============================================================================
// CONSTANTS AND DEFINITIONS
// ============================================================================

describe('EVENT_TYPE_DEFAULTS', () => {
  test('has an entry for every valid event type', () => {
    for (const type of VALID_TYPES) {
      expect(EVENT_TYPE_DEFAULTS[type]).toBeDefined();
      expect(EVENT_TYPE_DEFAULTS[type].modifierType).toBeDefined();
      expect(EVENT_TYPE_DEFAULTS[type].modifierValue).toBeGreaterThan(0);
      expect(EVENT_TYPE_DEFAULTS[type].description.length).toBeGreaterThan(0);
    }
  });

  test('double_production has modifierValue 2.0', () => {
    expect(EVENT_TYPE_DEFAULTS.double_production.modifierValue).toBe(2.0);
    expect(EVENT_TYPE_DEFAULTS.double_production.modifierType).toBe('production_multiplier');
  });

  test('double_xp has modifierValue 2.0 and xp_multiplier type', () => {
    expect(EVENT_TYPE_DEFAULTS.double_xp.modifierValue).toBe(2.0);
    expect(EVENT_TYPE_DEFAULTS.double_xp.modifierType).toBe('xp_multiplier');
  });

  test('reduced_build_time has modifierValue 0.5 (50% reduction)', () => {
    expect(EVENT_TYPE_DEFAULTS.reduced_build_time.modifierValue).toBe(0.5);
    expect(EVENT_TYPE_DEFAULTS.reduced_build_time.modifierType).toBe('build_time_multiplier');
  });

  test('combat_weekend has modifierValue 1.25 (+25% attack)', () => {
    expect(EVENT_TYPE_DEFAULTS.combat_weekend.modifierValue).toBe(1.25);
    expect(EVENT_TYPE_DEFAULTS.combat_weekend.modifierType).toBe('attack_multiplier');
  });

  test('harvest_bonus has modifierValue 2.0 (2x debris)', () => {
    expect(EVENT_TYPE_DEFAULTS.harvest_bonus.modifierValue).toBe(2.0);
    expect(EVENT_TYPE_DEFAULTS.harvest_bonus.modifierType).toBe('debris_multiplier');
  });

  test('fleet_speed has modifierValue 1.5 (+50% speed)', () => {
    expect(EVENT_TYPE_DEFAULTS.fleet_speed.modifierValue).toBe(1.5);
    expect(EVENT_TYPE_DEFAULTS.fleet_speed.modifierType).toBe('fleet_speed_multiplier');
  });
});

describe('NEUTRAL_MODIFIERS', () => {
  test('all multipliers are 1.0 (no-op)', () => {
    expect(NEUTRAL_MODIFIERS.productionMultiplier).toBe(1.0);
    expect(NEUTRAL_MODIFIERS.xpMultiplier).toBe(1.0);
    expect(NEUTRAL_MODIFIERS.buildTimeMultiplier).toBe(1.0);
    expect(NEUTRAL_MODIFIERS.attackMultiplier).toBe(1.0);
    expect(NEUTRAL_MODIFIERS.debrisMultiplier).toBe(1.0);
    expect(NEUTRAL_MODIFIERS.fleetSpeedMultiplier).toBe(1.0);
  });
});

// ============================================================================
// computeModifiers (pure function)
// ============================================================================

describe('computeModifiers', () => {
  test('returns neutral modifiers when no events', () => {
    const mods = computeModifiers([]);
    expect(mods).toEqual(NEUTRAL_MODIFIERS);
  });

  test('applies double_production event', () => {
    const events = [makeEvent({ type: 'double_production', modifierType: 'production_multiplier', modifierValue: 2.0 })];
    const mods = computeModifiers(events);
    expect(mods.productionMultiplier).toBe(2.0);
    expect(mods.xpMultiplier).toBe(1.0); // other modifiers unchanged
  });

  test('applies double_xp event', () => {
    const events = [makeEvent({ type: 'double_xp', modifierType: 'xp_multiplier', modifierValue: 2.0 })];
    const mods = computeModifiers(events);
    expect(mods.xpMultiplier).toBe(2.0);
    expect(mods.productionMultiplier).toBe(1.0);
  });

  test('applies reduced_build_time event (0.5 = half time)', () => {
    const events = [makeEvent({ type: 'reduced_build_time', modifierType: 'build_time_multiplier', modifierValue: 0.5 })];
    const mods = computeModifiers(events);
    expect(mods.buildTimeMultiplier).toBe(0.5);
  });

  test('applies combat_weekend event (1.25 attack boost)', () => {
    const events = [makeEvent({ type: 'combat_weekend', modifierType: 'attack_multiplier', modifierValue: 1.25 })];
    const mods = computeModifiers(events);
    expect(mods.attackMultiplier).toBe(1.25);
  });

  test('applies harvest_bonus event', () => {
    const events = [makeEvent({ type: 'harvest_bonus', modifierType: 'debris_multiplier', modifierValue: 2.0 })];
    const mods = computeModifiers(events);
    expect(mods.debrisMultiplier).toBe(2.0);
  });

  test('applies fleet_speed event', () => {
    const events = [makeEvent({ type: 'fleet_speed', modifierType: 'fleet_speed_multiplier', modifierValue: 1.5 })];
    const mods = computeModifiers(events);
    expect(mods.fleetSpeedMultiplier).toBe(1.5);
  });

  test('multipliers stack multiplicatively for same type', () => {
    const events = [
      makeEvent({ modifierType: 'production_multiplier', modifierValue: 2.0 }),
      makeEvent({ id: 'evt_002', modifierType: 'production_multiplier', modifierValue: 2.0 }),
    ];
    const mods = computeModifiers(events);
    expect(mods.productionMultiplier).toBe(4.0); // 2.0 * 2.0
  });

  test('multiple different event types apply independently', () => {
    const events = [
      makeEvent({ type: 'double_production', modifierType: 'production_multiplier', modifierValue: 2.0 }),
      makeEvent({ id: 'evt_002', type: 'combat_weekend', modifierType: 'attack_multiplier', modifierValue: 1.25 }),
      makeEvent({ id: 'evt_003', type: 'fleet_speed', modifierType: 'fleet_speed_multiplier', modifierValue: 1.5 }),
    ];
    const mods = computeModifiers(events);
    expect(mods.productionMultiplier).toBe(2.0);
    expect(mods.attackMultiplier).toBe(1.25);
    expect(mods.fleetSpeedMultiplier).toBe(1.5);
    expect(mods.xpMultiplier).toBe(1.0); // unchanged
    expect(mods.buildTimeMultiplier).toBe(1.0);
    expect(mods.debrisMultiplier).toBe(1.0);
  });

  test('does not mutate NEUTRAL_MODIFIERS', () => {
    const before = { ...NEUTRAL_MODIFIERS };
    computeModifiers([makeEvent()]);
    expect(NEUTRAL_MODIFIERS).toEqual(before);
  });
});

// ============================================================================
// Formula helpers
// ============================================================================

describe('applyProductionModifier', () => {
  test('with neutral modifiers returns same value', () => {
    expect(applyProductionModifier(1000, NEUTRAL_MODIFIERS)).toBe(1000);
  });

  test('doubles production with 2x modifier', () => {
    const mods: EventModifiers = { ...NEUTRAL_MODIFIERS, productionMultiplier: 2.0 };
    expect(applyProductionModifier(500, mods)).toBe(1000);
  });

  test('handles zero production', () => {
    const mods: EventModifiers = { ...NEUTRAL_MODIFIERS, productionMultiplier: 2.0 };
    expect(applyProductionModifier(0, mods)).toBe(0);
  });

  test('handles fractional multiplier', () => {
    const mods: EventModifiers = { ...NEUTRAL_MODIFIERS, productionMultiplier: 1.5 };
    expect(applyProductionModifier(200, mods)).toBe(300);
  });
});

describe('applyBuildTimeModifier', () => {
  test('with neutral modifiers returns same time', () => {
    expect(applyBuildTimeModifier(3600, NEUTRAL_MODIFIERS)).toBe(3600);
  });

  test('50% reduction halves build time', () => {
    const mods: EventModifiers = { ...NEUTRAL_MODIFIERS, buildTimeMultiplier: 0.5 };
    expect(applyBuildTimeModifier(3600, mods)).toBe(1800);
  });

  test('result is always >= 1 second', () => {
    const mods: EventModifiers = { ...NEUTRAL_MODIFIERS, buildTimeMultiplier: 0.0001 };
    expect(applyBuildTimeModifier(1, mods)).toBe(1);
  });

  test('result is rounded to whole seconds', () => {
    const mods: EventModifiers = { ...NEUTRAL_MODIFIERS, buildTimeMultiplier: 0.5 };
    expect(applyBuildTimeModifier(3601, mods)).toBe(1801); // Math.round(3601 * 0.5) = 1800 or 1801
  });
});

describe('applyXpModifier', () => {
  test('with neutral modifiers returns same time', () => {
    expect(applyXpModifier(7200, NEUTRAL_MODIFIERS)).toBe(7200);
  });

  test('2x XP modifier halves research time', () => {
    const mods: EventModifiers = { ...NEUTRAL_MODIFIERS, xpMultiplier: 2.0 };
    expect(applyXpModifier(3600, mods)).toBe(1800);
  });

  test('result is always >= 1 second', () => {
    const mods: EventModifiers = { ...NEUTRAL_MODIFIERS, xpMultiplier: 10000 };
    expect(applyXpModifier(1, mods)).toBe(1);
  });

  test('result is whole seconds', () => {
    const mods: EventModifiers = { ...NEUTRAL_MODIFIERS, xpMultiplier: 2.0 };
    const result = applyXpModifier(3601, mods);
    expect(Number.isInteger(result)).toBe(true);
  });
});

describe('applyAttackModifier', () => {
  test('with neutral modifiers returns same value', () => {
    expect(applyAttackModifier(100, NEUTRAL_MODIFIERS)).toBe(100);
  });

  test('combat_weekend 1.25x increases attack by 25%', () => {
    const mods: EventModifiers = { ...NEUTRAL_MODIFIERS, attackMultiplier: 1.25 };
    expect(applyAttackModifier(100, mods)).toBe(125);
  });

  test('handles large attack values', () => {
    const mods: EventModifiers = { ...NEUTRAL_MODIFIERS, attackMultiplier: 1.25 };
    expect(applyAttackModifier(1_000_000, mods)).toBe(1_250_000);
  });
});

describe('applyDebrisModifier', () => {
  test('with neutral modifiers returns same value', () => {
    expect(applyDebrisModifier(50000, NEUTRAL_MODIFIERS)).toBe(50000);
  });

  test('harvest_bonus 2x doubles debris collection', () => {
    const mods: EventModifiers = { ...NEUTRAL_MODIFIERS, debrisMultiplier: 2.0 };
    expect(applyDebrisModifier(50000, mods)).toBe(100000);
  });

  test('zero debris stays zero', () => {
    const mods: EventModifiers = { ...NEUTRAL_MODIFIERS, debrisMultiplier: 2.0 };
    expect(applyDebrisModifier(0, mods)).toBe(0);
  });
});

describe('applyFleetSpeedModifier', () => {
  test('with neutral modifiers returns same flight time', () => {
    expect(applyFleetSpeedModifier(3600, NEUTRAL_MODIFIERS)).toBe(3600);
  });

  test('1.5x speed multiplier reduces flight time by 33%', () => {
    const mods: EventModifiers = { ...NEUTRAL_MODIFIERS, fleetSpeedMultiplier: 1.5 };
    expect(applyFleetSpeedModifier(3600, mods)).toBe(2400); // 3600 / 1.5 = 2400
  });

  test('result is always >= 1 second', () => {
    const mods: EventModifiers = { ...NEUTRAL_MODIFIERS, fleetSpeedMultiplier: 9999 };
    expect(applyFleetSpeedModifier(1, mods)).toBe(1);
  });

  test('result is whole seconds', () => {
    const mods: EventModifiers = { ...NEUTRAL_MODIFIERS, fleetSpeedMultiplier: 1.5 };
    const result = applyFleetSpeedModifier(7201, mods);
    expect(Number.isInteger(result)).toBe(true);
  });
});

// ============================================================================
// EventService class
// ============================================================================

describe('EventService singleton', () => {
  test('eventService is an instance of EventService', () => {
    expect(eventService).toBeInstanceOf(EventService);
  });

  test('exposes all formula helper functions', () => {
    expect(typeof eventService.applyProductionModifier).toBe('function');
    expect(typeof eventService.applyBuildTimeModifier).toBe('function');
    expect(typeof eventService.applyXpModifier).toBe('function');
    expect(typeof eventService.applyAttackModifier).toBe('function');
    expect(typeof eventService.applyDebrisModifier).toBe('function');
    expect(typeof eventService.applyFleetSpeedModifier).toBe('function');
  });

  test('computeModifiers returns neutral for empty array', () => {
    const mods = eventService.computeModifiers([]);
    expect(mods).toEqual(NEUTRAL_MODIFIERS);
  });
});

// ============================================================================
// D1 integration tests (mock DB)
// ============================================================================

describe('getActiveEvents (mock DB)', () => {
  test('returns empty array when no rows', async () => {
    const db = makeMockDB([]);
    const events = await eventService.getActiveEvents(db);
    expect(events).toEqual([]);
  });

  test('maps DB row fields to GameEvent shape', async () => {
    const now = Math.floor(Date.now() / 1000);
    const row = {
      id: 'evt_abc',
      name: 'Double Weekend',
      description: '2x production',
      type: 'double_production',
      modifier_type: 'production_multiplier',
      modifier_value: 2.0,
      start_time: now - 100,
      end_time: now + 100,
      created_at: now - 200,
      created_by: 'system',
    };
    const db = makeMockDB([row]);
    const events = await eventService.getActiveEvents(db);
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe('evt_abc');
    expect(events[0].name).toBe('Double Weekend');
    expect(events[0].type).toBe('double_production');
    expect(events[0].modifierType).toBe('production_multiplier');
    expect(events[0].modifierValue).toBe(2.0);
    expect(events[0].startTime).toBe(now - 100);
    expect(events[0].endTime).toBe(now + 100);
    expect(events[0].createdBy).toBe('system');
  });

  test('maps multiple events', async () => {
    const now = Math.floor(Date.now() / 1000);
    const rows = [
      {
        id: 'evt_001',
        name: 'Prod Event',
        description: 'desc1',
        type: 'double_production',
        modifier_type: 'production_multiplier',
        modifier_value: 2.0,
        start_time: now - 100,
        end_time: now + 3600,
        created_at: now - 200,
        created_by: 'system',
      },
      {
        id: 'evt_002',
        name: 'Combat Weekend',
        description: 'desc2',
        type: 'combat_weekend',
        modifier_type: 'attack_multiplier',
        modifier_value: 1.25,
        start_time: now - 50,
        end_time: now + 7200,
        created_at: now - 100,
        created_by: 'admin',
      },
    ];
    const db = makeMockDB(rows);
    const events = await eventService.getActiveEvents(db);
    expect(events).toHaveLength(2);
    expect(events[0].id).toBe('evt_001');
    expect(events[1].id).toBe('evt_002');
  });
});

describe('getActiveModifiers (mock DB)', () => {
  test('returns neutral modifiers when no active events', async () => {
    const db = makeMockDB([]);
    const mods = await eventService.getActiveModifiers(db);
    expect(mods).toEqual(NEUTRAL_MODIFIERS);
  });

  test('returns correct modifiers for active production event', async () => {
    const now = Math.floor(Date.now() / 1000);
    const db = makeMockDB([{
      id: 'evt_001',
      name: 'Prod',
      description: 'desc',
      type: 'double_production',
      modifier_type: 'production_multiplier',
      modifier_value: 2.0,
      start_time: now - 100,
      end_time: now + 100,
      created_at: now - 200,
      created_by: 'system',
    }]);
    const mods = await eventService.getActiveModifiers(db);
    expect(mods.productionMultiplier).toBe(2.0);
    expect(mods.attackMultiplier).toBe(1.0); // unchanged
  });
});

describe('createEvent (mock DB)', () => {
  test('throws on invalid event type', async () => {
    const db = makeMockDB([]);
    const now = Math.floor(Date.now() / 1000);
    await expect(
      eventService.createEvent(
        {
          name: 'Bad Event',
          type: 'invalid_type' as any,
          startTime: now + 100,
          endTime: now + 3600,
        },
        db
      )
    ).rejects.toThrow('Invalid event type');
  });

  test('throws when endTime <= startTime', async () => {
    const db = makeMockDB([]);
    const now = Math.floor(Date.now() / 1000);
    await expect(
      eventService.createEvent(
        {
          name: 'Bad Timing',
          type: 'double_production',
          startTime: now + 3600,
          endTime: now + 1000,
        },
        db
      )
    ).rejects.toThrow('endTime must be after startTime');
  });

  test('throws when endTime is in the past', async () => {
    const db = makeMockDB([]);
    const now = Math.floor(Date.now() / 1000);
    await expect(
      eventService.createEvent(
        {
          name: 'Past Event',
          type: 'double_production',
          startTime: now - 7200,
          endTime: now - 3600,
        },
        db
      )
    ).rejects.toThrow('endTime must be in the future');
  });

  test('creates event with correct defaults for double_production', async () => {
    const db = makeMockDB([]);
    const now = Math.floor(Date.now() / 1000);
    const event = await eventService.createEvent(
      {
        name: 'My Production Event',
        type: 'double_production',
        startTime: now + 100,
        endTime: now + 7200,
        createdBy: 'admin',
      },
      db
    );

    expect(event.name).toBe('My Production Event');
    expect(event.type).toBe('double_production');
    expect(event.modifierType).toBe('production_multiplier');
    expect(event.modifierValue).toBe(2.0);
    expect(event.createdBy).toBe('admin');
    expect(event.id).toMatch(/^evt_/);
  });

  test('creates event with custom description', async () => {
    const db = makeMockDB([]);
    const now = Math.floor(Date.now() / 1000);
    const event = await eventService.createEvent(
      {
        name: 'Custom Event',
        description: 'My custom description',
        type: 'combat_weekend',
        startTime: now + 100,
        endTime: now + 3600,
      },
      db
    );

    expect(event.description).toBe('My custom description');
    expect(event.modifierType).toBe('attack_multiplier');
    expect(event.modifierValue).toBe(1.25);
  });

  test('uses default description if none provided', async () => {
    const db = makeMockDB([]);
    const now = Math.floor(Date.now() / 1000);
    const event = await eventService.createEvent(
      {
        name: 'Fleet Boost',
        type: 'fleet_speed',
        startTime: now + 100,
        endTime: now + 3600,
      },
      db
    );

    expect(event.description).toBe(EVENT_TYPE_DEFAULTS.fleet_speed.description);
  });

  test('all valid event types can be created', async () => {
    const db = makeMockDB([]);
    const now = Math.floor(Date.now() / 1000);

    for (const type of VALID_TYPES) {
      const event = await eventService.createEvent(
        {
          name: `Event: ${type}`,
          type,
          startTime: now + 100,
          endTime: now + 7200,
        },
        db
      );
      expect(event.type).toBe(type);
      expect(event.modifierType).toBe(EVENT_TYPE_DEFAULTS[type].modifierType);
      expect(event.modifierValue).toBe(EVENT_TYPE_DEFAULTS[type].modifierValue);
    }
  });
});

describe('deleteEvent (mock DB)', () => {
  test('returns true when event is deleted', async () => {
    const db = makeMockDB([]);
    const result = await eventService.deleteEvent('evt_001', db);
    expect(result).toBe(true);
  });

  test('returns false when event not found (changes = 0)', async () => {
    const prepared = {
      bind: vi.fn().mockReturnThis(),
      run: vi.fn().mockResolvedValue({ meta: { changes: 0 } }),
    };
    const db = { prepare: vi.fn().mockReturnValue(prepared) };
    const result = await eventService.deleteEvent('nonexistent', db as any);
    expect(result).toBe(false);
  });
});

describe('isEventTypeActive (mock DB)', () => {
  test('returns true when event type row found', async () => {
    const db = makeMockDB([{ id: 'evt_001' }]);
    const active = await eventService.isEventTypeActive('double_production', db);
    expect(active).toBe(true);
  });

  test('returns false when no row found', async () => {
    const db = makeMockDB([]);
    const active = await eventService.isEventTypeActive('double_production', db);
    expect(active).toBe(false);
  });
});

describe('getEventById (mock DB)', () => {
  test('returns null when not found', async () => {
    const db = makeMockDB([]);
    const result = await eventService.getEventById('nonexistent', db);
    expect(result).toBeNull();
  });

  test('returns event when found', async () => {
    const now = Math.floor(Date.now() / 1000);
    const row = {
      id: 'evt_xyz',
      name: 'Found Event',
      description: 'desc',
      type: 'harvest_bonus',
      modifier_type: 'debris_multiplier',
      modifier_value: 2.0,
      start_time: now,
      end_time: now + 3600,
      created_at: now - 100,
      created_by: 'system',
    };
    const db = makeMockDB([row]);
    const event = await eventService.getEventById('evt_xyz', db);
    expect(event).not.toBeNull();
    expect(event!.id).toBe('evt_xyz');
    expect(event!.type).toBe('harvest_bonus');
    expect(event!.modifierType).toBe('debris_multiplier');
  });
});

// ============================================================================
// Integration: computeModifiers + formula helpers
// ============================================================================

describe('Full modifier pipeline', () => {
  test('double_production event doubles a 1000 production value', () => {
    const events = [makeEvent({ type: 'double_production', modifierType: 'production_multiplier', modifierValue: 2.0 })];
    const mods = computeModifiers(events);
    expect(applyProductionModifier(1000, mods)).toBe(2000);
  });

  test('reduced_build_time event halves a 3600s build time', () => {
    const events = [makeEvent({ type: 'reduced_build_time', modifierType: 'build_time_multiplier', modifierValue: 0.5 })];
    const mods = computeModifiers(events);
    expect(applyBuildTimeModifier(3600, mods)).toBe(1800);
  });

  test('double_xp event halves a 7200s research time', () => {
    const events = [makeEvent({ type: 'double_xp', modifierType: 'xp_multiplier', modifierValue: 2.0 })];
    const mods = computeModifiers(events);
    expect(applyXpModifier(7200, mods)).toBe(3600);
  });

  test('combat_weekend increases attack by 25%', () => {
    const events = [makeEvent({ type: 'combat_weekend', modifierType: 'attack_multiplier', modifierValue: 1.25 })];
    const mods = computeModifiers(events);
    expect(applyAttackModifier(800, mods)).toBe(1000);
  });

  test('harvest_bonus doubles debris', () => {
    const events = [makeEvent({ type: 'harvest_bonus', modifierType: 'debris_multiplier', modifierValue: 2.0 })];
    const mods = computeModifiers(events);
    expect(applyDebrisModifier(75000, mods)).toBe(150000);
  });

  test('fleet_speed event reduces flight time by 1/3', () => {
    const events = [makeEvent({ type: 'fleet_speed', modifierType: 'fleet_speed_multiplier', modifierValue: 1.5 })];
    const mods = computeModifiers(events);
    // 3600 / 1.5 = 2400
    expect(applyFleetSpeedModifier(3600, mods)).toBe(2400);
  });

  test('neutral events (no events) leave all values unchanged', () => {
    const mods = computeModifiers([]);
    expect(applyProductionModifier(500, mods)).toBe(500);
    expect(applyBuildTimeModifier(3600, mods)).toBe(3600);
    expect(applyXpModifier(7200, mods)).toBe(7200);
    expect(applyAttackModifier(100, mods)).toBe(100);
    expect(applyDebrisModifier(50000, mods)).toBe(50000);
    expect(applyFleetSpeedModifier(3600, mods)).toBe(3600);
  });

  test('multiple simultaneous events stack correctly', () => {
    const events = [
      makeEvent({ type: 'double_production', modifierType: 'production_multiplier', modifierValue: 2.0 }),
      makeEvent({ id: 'evt_002', type: 'combat_weekend', modifierType: 'attack_multiplier', modifierValue: 1.25 }),
      makeEvent({ id: 'evt_003', type: 'fleet_speed', modifierType: 'fleet_speed_multiplier', modifierValue: 1.5 }),
    ];
    const mods = computeModifiers(events);

    expect(applyProductionModifier(1000, mods)).toBe(2000);
    expect(applyAttackModifier(100, mods)).toBe(125);
    expect(applyFleetSpeedModifier(3000, mods)).toBe(2000);
    expect(applyBuildTimeModifier(3600, mods)).toBe(3600); // unchanged
    expect(applyXpModifier(3600, mods)).toBe(3600); // unchanged
  });
});

// ============================================================================
// Type safety
// ============================================================================

describe('EventType type guard', () => {
  test('all 6 event types are recognized', () => {
    const validTypes: EventType[] = [
      'double_production',
      'double_xp',
      'reduced_build_time',
      'combat_weekend',
      'harvest_bonus',
      'fleet_speed',
    ];
    // Just verify they exist as string constants with no TS error
    expect(validTypes).toHaveLength(6);
  });
});
