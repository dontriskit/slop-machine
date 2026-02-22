/**
 * H2M (Human-to-Machine) Protocol Tests
 *
 * Tests the full learning pipeline:
 * - Override detection
 * - Classification logic
 * - Pattern analysis
 * - Strategy generation
 * - Metrics calculation
 * - Adoption rate tracking
 * - Report generation
 * - Strategy comparison
 */
import { describe, test, expect, beforeEach, vi } from 'vitest';
import {
  detectOverrides,
  classifyOverride,
  analyzePlayerPatterns,
  getOverrideRate,
  getTopOverrideReasons,
  generateImprovedStrategy,
  compareStrategies,
  applyLearnedStrategy,
  getH2MMetrics,
  getAdoptionRate,
  generateH2MReport,
  runH2MLearningCycle,
  storeOverrides,
  OVERRIDE_WINDOW_SECONDS,
  PRODUCTION_BUILDINGS,
  TECH_BUILDINGS,
  FLEET_BUILDINGS,
  STORAGE_BUILDINGS,
  INFRASTRUCTURE_BUILDINGS,
} from '../../worker/src/agents/h2mProtocol';
import { BUILDING_ID, BUILDING_NAME } from '../../worker/src/game/types';
import type {
  Override,
  OverrideClassification,
  StrategyStep,
} from '../../worker/src/game/types';

// ============================================================================
// D1 DATABASE MOCK
// ============================================================================

interface MockRow {
  [key: string]: unknown;
}

/**
 * In-memory mock of Cloudflare D1 database.
 * Stores data in arrays, supports basic prepare/bind/run/first/all queries.
 */
function createMockDB() {
  const tables: Record<string, MockRow[]> = {
    build_history: [],
    override_analysis: [],
    strategy_history: [],
    build_strategies: [],
    planets: [],
  };

  function parseWhere(sql: string, bindings: unknown[]): { table: string; filter: (row: MockRow) => boolean } {
    // Extract table name from FROM clause
    const fromMatch = sql.match(/FROM\s+(\w+)/i);
    const table = fromMatch ? fromMatch[1]! : '';

    // Build filter from WHERE clause
    const whereMatch = sql.match(/WHERE\s+(.+?)(?:ORDER|GROUP|LIMIT|$)/is);
    if (!whereMatch) return { table, filter: () => true };

    const whereClause = whereMatch[1]!.trim();
    let bindIdx = 0;

    return {
      table,
      filter: (row: MockRow) => {
        // Reset bind index for each row evaluation
        let localBindIdx = bindIdx;
        let result = true;

        // Split on AND
        const conditions = whereClause.split(/\s+AND\s+/i);
        localBindIdx = 0;

        for (const cond of conditions) {
          const trimmed = cond.trim();

          // Handle subquery: column IN (SELECT ...)
          if (/IN\s*\(SELECT/i.test(trimmed)) {
            const colMatch = trimmed.match(/(\w+)\s+IN\s*\(SELECT\s+(\w+)\s+FROM\s+(\w+)/i);
            if (colMatch) {
              const [, col, selectCol, subTable] = colMatch;
              // For subqueries, get all values from the sub-table
              const subRows = tables[subTable!] || [];

              // Check if there's a WHERE in the subquery
              const subWhereMatch = trimmed.match(/WHERE\s+(\w+)\s*=\s*\?/i);
              let filteredSubRows = subRows;
              if (subWhereMatch) {
                const subCol = subWhereMatch[1]!;
                const subVal = bindings[localBindIdx++];
                filteredSubRows = subRows.filter((sr) => sr[subCol] === subVal);
              }

              const subValues = filteredSubRows.map((sr) => sr[selectCol!]);
              if (!subValues.includes(row[col!])) {
                result = false;
              }
            }
            continue;
          }

          // Handle: column = ? (bind param)
          const eqMatch = trimmed.match(/^(\w+)\s*=\s*\?$/);
          if (eqMatch) {
            const col = eqMatch[1]!;
            const val = bindings[localBindIdx++];
            if (row[col] !== val) result = false;
            continue;
          }

          // Handle: column = 'literal' (SQL string literal)
          const eqLiteralMatch = trimmed.match(/^(\w+)\s*=\s*'([^']*)'$/);
          if (eqLiteralMatch) {
            const col = eqLiteralMatch[1]!;
            const val = eqLiteralMatch[2]!;
            if (row[col] !== val) result = false;
            continue;
          }

          // Handle: column = N (SQL integer literal)
          const eqIntLiteralMatch = trimmed.match(/^(\w+)\s*=\s*(\d+)$/);
          if (eqIntLiteralMatch) {
            const col = eqIntLiteralMatch[1]!;
            const val = parseInt(eqIntLiteralMatch[2]!, 10);
            if (row[col] !== val) result = false;
            continue;
          }

          // Handle: column >= ?
          const gteMatch = trimmed.match(/^(\w+)\s*>=\s*\?$/);
          if (gteMatch) {
            const col = gteMatch[1]!;
            const val = bindings[localBindIdx++] as number;
            if ((row[col] as number) < val) result = false;
            continue;
          }

          // Handle: column < ?
          const ltMatch = trimmed.match(/^(\w+)\s*<\s*\?$/);
          if (ltMatch) {
            const col = ltMatch[1]!;
            const val = bindings[localBindIdx++] as number;
            if ((row[col] as number) >= val) result = false;
            continue;
          }
        }

        // Update outer bindIdx to track consumption
        bindIdx = localBindIdx;
        return result;
      },
    };
  }

  const db = {
    prepare(sql: string) {
      let bindings: unknown[] = [];
      const normalizedSql = sql.replace(/\s+/g, ' ').trim();

      return {
        bind(...args: unknown[]) {
          bindings = args;
          return this;
        },
        async run() {
          // INSERT
          if (/^INSERT/i.test(normalizedSql)) {
            const tableMatch = normalizedSql.match(/INSERT\s+INTO\s+(\w+)/i);
            const table = tableMatch ? tableMatch[1]! : '';

            // Extract column names
            const colsMatch = normalizedSql.match(/\(([^)]+)\)\s*VALUES/i);
            if (colsMatch) {
              const cols = colsMatch[1]!.split(',').map((c) => c.trim());
              // Extract value tokens (may be ? or 'literal')
              const valuesMatch = normalizedSql.match(/VALUES\s*\(([^)]+)\)/i);
              const valueTokens = valuesMatch
                ? valuesMatch[1]!.split(',').map((v) => v.trim())
                : cols.map(() => '?');

              const row: MockRow = {};
              let bindIdx = 0;
              cols.forEach((col, idx) => {
                const token = valueTokens[idx] || '?';
                if (token === '?') {
                  row[col] = bindings[bindIdx] !== undefined ? bindings[bindIdx] : null;
                  bindIdx++;
                } else {
                  // SQL literal like 'learned' — strip quotes
                  row[col] = token.replace(/^'|'$/g, '');
                }
              });
              if (!tables[table]) tables[table] = [];
              tables[table]!.push(row);
            }

            return { success: true, meta: { changes: 1 } };
          }

          // UPDATE
          if (/^UPDATE/i.test(normalizedSql)) {
            const tableMatch = normalizedSql.match(/UPDATE\s+(\w+)/i);
            const table = tableMatch ? tableMatch[1]! : '';
            const rows = tables[table] || [];

            // Extract SET clause
            const setMatch = normalizedSql.match(/SET\s+(.+?)\s+WHERE/i);
            const whereMatch = normalizedSql.match(/WHERE\s+(\w+)\s*=\s*\?/i);

            if (setMatch && whereMatch) {
              const setCol = setMatch[1]!.match(/(\w+)\s*=\s*\?/)?.[1];
              const whereCol = whereMatch[1]!;
              // bindings: [setVal, whereVal]
              const setVal = bindings[0];
              const whereVal = bindings[1];

              for (const row of rows) {
                if (row[whereCol] === whereVal && setCol) {
                  row[setCol] = setVal;
                }
              }
            }

            return { success: true, meta: { changes: 1 } };
          }

          return { success: true, meta: { changes: 0 } };
        },
        async first() {
          // SELECT COUNT
          if (/COUNT\(\*\)/i.test(normalizedSql)) {
            const { table, filter } = parseWhere(normalizedSql, bindings);
            const rows = (tables[table] || []).filter(filter);
            return { cnt: rows.length };
          }

          // SELECT *
          const { table, filter } = parseWhere(normalizedSql, bindings);
          const rows = (tables[table] || []).filter(filter);

          // Handle ORDER BY ... DESC LIMIT 1
          if (/ORDER BY\s+\w+\s+DESC/i.test(normalizedSql)) {
            const orderMatch = normalizedSql.match(/ORDER BY\s+(\w+)\s+DESC/i);
            if (orderMatch) {
              const col = orderMatch[1]!;
              rows.sort((a, b) => (b[col] as number) - (a[col] as number));
            }
          }

          return rows[0] || null;
        },
        async all() {
          // Handle SELECT DISTINCT
          const isDistinct = /SELECT\s+DISTINCT/i.test(normalizedSql);

          const { table, filter } = parseWhere(normalizedSql, bindings);
          let rows = (tables[table] || []).filter(filter);

          if (isDistinct) {
            const colMatch = normalizedSql.match(/SELECT\s+DISTINCT\s+(\w+)/i);
            if (colMatch) {
              const col = colMatch[1]!;
              const seen = new Set<unknown>();
              rows = rows.filter((r) => {
                if (seen.has(r[col])) return false;
                seen.add(r[col]);
                return true;
              });
            }
          }

          // ORDER BY
          if (/ORDER BY/i.test(normalizedSql)) {
            const orderMatch = normalizedSql.match(/ORDER BY\s+(\w+)\s+(ASC|DESC)?/i);
            if (orderMatch) {
              const col = orderMatch[1]!;
              const dir = (orderMatch[2] || 'ASC').toUpperCase();
              rows = [...rows].sort((a, b) =>
                dir === 'DESC'
                  ? (b[col] as number) - (a[col] as number)
                  : (a[col] as number) - (b[col] as number)
              );
            }
          }

          // GROUP BY (for override reasons)
          if (/GROUP BY/i.test(normalizedSql)) {
            const groupMatch = normalizedSql.match(/GROUP BY\s+(\w+)/i);
            if (groupMatch) {
              const groupCol = groupMatch[1]!;
              const groups = new Map<unknown, number>();
              for (const row of rows) {
                const key = row[groupCol];
                groups.set(key, (groups.get(key) || 0) + 1);
              }
              const grouped = Array.from(groups.entries()).map(
                ([classification, cnt]) => ({
                  classification,
                  cnt,
                })
              );
              // Sort by cnt DESC
              grouped.sort((a, b) => b.cnt - a.cnt);

              // LIMIT
              const limitMatch = normalizedSql.match(/LIMIT\s+(\d+|\?)/i);
              if (limitMatch) {
                const limit = limitMatch[1] === '?' ? (bindings[bindings.length - 1] as number) : parseInt(limitMatch[1]!);
                return { results: grouped.slice(0, limit) };
              }
              return { results: grouped };
            }
          }

          // LIMIT / OFFSET
          const limitMatch = normalizedSql.match(/LIMIT\s+(\d+|\?)/i);
          if (limitMatch) {
            // Find the limit and offset from bindings
            const limitVal = limitMatch[1] === '?' ? 1000 : parseInt(limitMatch[1]!);
            rows = rows.slice(0, limitVal);
          }

          return { results: rows };
        },
      };
    },
    // Helper to directly insert rows for testing
    _insert(table: string, row: MockRow) {
      if (!tables[table]) tables[table] = [];
      tables[table]!.push(row);
    },
    _getAll(table: string) {
      return tables[table] || [];
    },
    _clear() {
      for (const key of Object.keys(tables)) {
        tables[key] = [];
      }
    },
  };

  return db;
}

// ============================================================================
// TEST HELPERS
// ============================================================================

function createBuildHistoryRow(
  planetId: string,
  buildingId: number,
  level: number,
  source: 'agent' | 'manual',
  createdAt: number,
  aiReason: string | null = null
): MockRow {
  return {
    id: `bh-${planetId}-${createdAt}-${Math.random().toString(36).slice(2, 8)}`,
    planet_id: planetId,
    building_id: buildingId,
    level,
    source,
    ai_reason: aiReason,
    created_at: createdAt,
  };
}

function createPlanetRow(
  id: string,
  playerId: string,
  agentEnabled: number = 1,
  strategyId: string | null = null
): MockRow {
  return {
    id,
    player_id: playerId,
    name: 'TestPlanet',
    galaxy: 1,
    system: 1,
    position: 1,
    planet_type: 'planet',
    temperature: 30,
    fields: 163,
    universe_speed: 1,
    agent_enabled: agentEnabled,
    strategy_id: strategyId,
    created_at: 1000000,
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('H2M Protocol', () => {
  let db: ReturnType<typeof createMockDB>;
  const now = Math.floor(Date.now() / 1000);

  beforeEach(() => {
    db = createMockDB();
  });

  // --------------------------------------------------------------------------
  // Override Detection
  // --------------------------------------------------------------------------

  describe('Override Detection', () => {
    test('detects manual build after agent build within window', async () => {
      const planetId = 'planet-1';
      db._insert('planets', createPlanetRow(planetId, 'player-1'));

      // Agent builds metal mine at T=100
      db._insert(
        'build_history',
        createBuildHistoryRow(planetId, BUILDING_ID.metalMine, 5, 'agent', now - 500, 'Strategy step')
      );
      // Human overrides with crystal mine at T=200 (100s later)
      db._insert(
        'build_history',
        createBuildHistoryRow(planetId, BUILDING_ID.crystalMine, 4, 'manual', now - 400)
      );

      const overrides = await detectOverrides(db as any, planetId, now - 1000);

      expect(overrides).toHaveLength(1);
      expect(overrides[0]!.agentBuildingId).toBe(BUILDING_ID.metalMine);
      expect(overrides[0]!.manualBuildingId).toBe(BUILDING_ID.crystalMine);
      expect(overrides[0]!.timeDelta).toBe(100);
    });

    test('does NOT detect manual build outside the window', async () => {
      const planetId = 'planet-2';
      db._insert('planets', createPlanetRow(planetId, 'player-1'));

      // Agent builds at T=100
      db._insert(
        'build_history',
        createBuildHistoryRow(planetId, BUILDING_ID.metalMine, 5, 'agent', now - 1000)
      );
      // Human builds 700s later (outside 600s window)
      db._insert(
        'build_history',
        createBuildHistoryRow(planetId, BUILDING_ID.crystalMine, 4, 'manual', now - 300)
      );

      const overrides = await detectOverrides(db as any, planetId, now - 2000);

      expect(overrides).toHaveLength(0);
    });

    test('does NOT count consecutive agent builds as overrides', async () => {
      const planetId = 'planet-3';
      db._insert('planets', createPlanetRow(planetId, 'player-1'));

      // Two agent builds in a row
      db._insert(
        'build_history',
        createBuildHistoryRow(planetId, BUILDING_ID.metalMine, 5, 'agent', now - 500)
      );
      db._insert(
        'build_history',
        createBuildHistoryRow(planetId, BUILDING_ID.crystalMine, 4, 'agent', now - 400)
      );

      const overrides = await detectOverrides(db as any, planetId, now - 1000);

      expect(overrides).toHaveLength(0);
    });

    test('detects multiple overrides in sequence', async () => {
      const planetId = 'planet-4';
      db._insert('planets', createPlanetRow(planetId, 'player-1'));

      // First override pair
      db._insert(
        'build_history',
        createBuildHistoryRow(planetId, BUILDING_ID.metalMine, 5, 'agent', now - 800)
      );
      db._insert(
        'build_history',
        createBuildHistoryRow(planetId, BUILDING_ID.shipyard, 3, 'manual', now - 750)
      );

      // Second override pair
      db._insert(
        'build_history',
        createBuildHistoryRow(planetId, BUILDING_ID.crystalMine, 4, 'agent', now - 400)
      );
      db._insert(
        'build_history',
        createBuildHistoryRow(planetId, BUILDING_ID.researchLab, 2, 'manual', now - 350)
      );

      const overrides = await detectOverrides(db as any, planetId, now - 1000);

      expect(overrides).toHaveLength(2);
    });

    test('respects sinceTimestamp parameter', async () => {
      const planetId = 'planet-5';
      db._insert('planets', createPlanetRow(planetId, 'player-1'));

      // Old override (before sinceTimestamp)
      db._insert(
        'build_history',
        createBuildHistoryRow(planetId, BUILDING_ID.metalMine, 5, 'agent', now - 2000)
      );
      db._insert(
        'build_history',
        createBuildHistoryRow(planetId, BUILDING_ID.crystalMine, 4, 'manual', now - 1900)
      );

      // New override (after sinceTimestamp)
      db._insert(
        'build_history',
        createBuildHistoryRow(planetId, BUILDING_ID.deutSynth, 3, 'agent', now - 500)
      );
      db._insert(
        'build_history',
        createBuildHistoryRow(planetId, BUILDING_ID.solarPlant, 5, 'manual', now - 450)
      );

      const overrides = await detectOverrides(db as any, planetId, now - 1000);

      expect(overrides).toHaveLength(1);
      expect(overrides[0]!.agentBuildingId).toBe(BUILDING_ID.deutSynth);
    });
  });

  // --------------------------------------------------------------------------
  // Classification
  // --------------------------------------------------------------------------

  describe('Override Classification', () => {
    test('classifies same building as correction', () => {
      const result = classifyOverride(
        { agentBuildingId: BUILDING_ID.metalMine, manualBuildingId: BUILDING_ID.metalMine },
        null
      );
      expect(result).toBe('correction');
    });

    test('classifies production -> shipyard as fleet_focus', () => {
      const result = classifyOverride(
        { agentBuildingId: BUILDING_ID.metalMine, manualBuildingId: BUILDING_ID.shipyard },
        null
      );
      expect(result).toBe('fleet_focus');
    });

    test('classifies anything -> research lab as tech_rush', () => {
      const result = classifyOverride(
        { agentBuildingId: BUILDING_ID.metalMine, manualBuildingId: BUILDING_ID.researchLab },
        null
      );
      expect(result).toBe('tech_rush');
    });

    test('classifies production -> production as resource_priority', () => {
      const result = classifyOverride(
        { agentBuildingId: BUILDING_ID.metalMine, manualBuildingId: BUILDING_ID.crystalMine },
        null
      );
      expect(result).toBe('resource_priority');
    });

    test('classifies anything -> storage as resource_priority', () => {
      const result = classifyOverride(
        { agentBuildingId: BUILDING_ID.shipyard, manualBuildingId: BUILDING_ID.metalStorage },
        null
      );
      expect(result).toBe('resource_priority');
    });

    test('classifies non-production -> production as resource_priority', () => {
      const result = classifyOverride(
        { agentBuildingId: BUILDING_ID.researchLab, manualBuildingId: BUILDING_ID.metalMine },
        null
      );
      expect(result).toBe('resource_priority');
    });

    test('classifies production -> infrastructure as strategy_shift', () => {
      const result = classifyOverride(
        { agentBuildingId: BUILDING_ID.metalMine, manualBuildingId: BUILDING_ID.roboticsFactory },
        null
      );
      expect(result).toBe('strategy_shift');
    });

    test('classifies non-production -> shipyard as fleet_focus', () => {
      const result = classifyOverride(
        { agentBuildingId: BUILDING_ID.researchLab, manualBuildingId: BUILDING_ID.shipyard },
        null
      );
      expect(result).toBe('fleet_focus');
    });
  });

  // --------------------------------------------------------------------------
  // Building Categories
  // --------------------------------------------------------------------------

  describe('Building Categories', () => {
    test('production buildings are correct', () => {
      expect(PRODUCTION_BUILDINGS).toContain(BUILDING_ID.metalMine);
      expect(PRODUCTION_BUILDINGS).toContain(BUILDING_ID.crystalMine);
      expect(PRODUCTION_BUILDINGS).toContain(BUILDING_ID.deutSynth);
      expect(PRODUCTION_BUILDINGS).toContain(BUILDING_ID.solarPlant);
      expect(PRODUCTION_BUILDINGS).toContain(BUILDING_ID.fusionReactor);
    });

    test('tech buildings contain research lab', () => {
      expect(TECH_BUILDINGS).toContain(BUILDING_ID.researchLab);
    });

    test('fleet buildings contain shipyard', () => {
      expect(FLEET_BUILDINGS).toContain(BUILDING_ID.shipyard);
    });

    test('storage buildings are correct', () => {
      expect(STORAGE_BUILDINGS).toContain(BUILDING_ID.metalStorage);
      expect(STORAGE_BUILDINGS).toContain(BUILDING_ID.crystalStorage);
      expect(STORAGE_BUILDINGS).toContain(BUILDING_ID.deutTank);
    });

    test('infrastructure buildings are correct', () => {
      expect(INFRASTRUCTURE_BUILDINGS).toContain(BUILDING_ID.roboticsFactory);
      expect(INFRASTRUCTURE_BUILDINGS).toContain(BUILDING_ID.naniteFactory);
    });
  });

  // --------------------------------------------------------------------------
  // Pattern Analysis
  // --------------------------------------------------------------------------

  describe('Pattern Analysis', () => {
    test('analyzePlayerPatterns returns profile with correct totals', async () => {
      const playerId = 'player-1';
      db._insert('planets', createPlanetRow('planet-1', playerId));

      // Add some build history
      for (let i = 0; i < 10; i++) {
        db._insert(
          'build_history',
          createBuildHistoryRow('planet-1', BUILDING_ID.metalMine, i + 1, 'agent', now - 1000 + i * 10)
        );
      }
      for (let i = 0; i < 5; i++) {
        db._insert(
          'build_history',
          createBuildHistoryRow('planet-1', BUILDING_ID.crystalMine, i + 1, 'manual', now - 500 + i * 10)
        );
      }

      // Add some override analysis
      db._insert('override_analysis', {
        id: 'ovr-1',
        planet_id: 'planet-1',
        player_id: playerId,
        agent_build_id: 'ab-1',
        agent_building_id: BUILDING_ID.metalMine,
        agent_level: 5,
        agent_reason: null,
        manual_build_id: 'mb-1',
        manual_building_id: BUILDING_ID.shipyard,
        manual_level: 3,
        time_delta: 60,
        classification: 'fleet_focus',
        created_at: now - 500,
      });
      db._insert('override_analysis', {
        id: 'ovr-2',
        planet_id: 'planet-1',
        player_id: playerId,
        agent_build_id: 'ab-2',
        agent_building_id: BUILDING_ID.crystalMine,
        agent_level: 4,
        agent_reason: null,
        manual_build_id: 'mb-2',
        manual_building_id: BUILDING_ID.researchLab,
        manual_level: 2,
        time_delta: 30,
        classification: 'tech_rush',
        created_at: now - 300,
      });

      const profile = await analyzePlayerPatterns(db as any, playerId);

      expect(profile.playerId).toBe(playerId);
      expect(profile.totalDecisions).toBe(15); // 10 agent + 5 manual
      expect(profile.totalOverrides).toBe(2);
      expect(profile.classificationBreakdown.fleet_focus).toBe(1);
      expect(profile.classificationBreakdown.tech_rush).toBe(1);
      expect(profile.preferredBuildings).toHaveLength(2);
      expect(profile.rejectedBuildings).toHaveLength(2);
    });

    test('getOverrideRate returns 0 when no agent builds', async () => {
      db._insert('planets', createPlanetRow('planet-1', 'player-1'));

      const rate = await getOverrideRate(db as any, 'planet-1');
      expect(rate).toBe(0);
    });

    test('getOverrideRate returns correct ratio', async () => {
      db._insert('planets', createPlanetRow('planet-1', 'player-1'));

      // 4 agent builds
      for (let i = 0; i < 4; i++) {
        db._insert(
          'build_history',
          createBuildHistoryRow('planet-1', BUILDING_ID.metalMine, i + 1, 'agent', now - 400 + i * 10)
        );
      }

      // 2 overrides
      db._insert('override_analysis', {
        id: 'ovr-1',
        planet_id: 'planet-1',
        player_id: 'player-1',
        classification: 'fleet_focus',
        created_at: now - 300,
        agent_build_id: 'ab-1',
        agent_building_id: 1,
        agent_level: 1,
        agent_reason: null,
        manual_build_id: 'mb-1',
        manual_building_id: 21,
        manual_level: 1,
        time_delta: 30,
      });
      db._insert('override_analysis', {
        id: 'ovr-2',
        planet_id: 'planet-1',
        player_id: 'player-1',
        classification: 'tech_rush',
        created_at: now - 200,
        agent_build_id: 'ab-2',
        agent_building_id: 1,
        agent_level: 2,
        agent_reason: null,
        manual_build_id: 'mb-2',
        manual_building_id: 31,
        manual_level: 1,
        time_delta: 20,
      });

      const rate = await getOverrideRate(db as any, 'planet-1');
      expect(rate).toBe(0.5); // 2 overrides / 4 agent builds
    });

    test('getTopOverrideReasons returns sorted results', async () => {
      const playerId = 'player-1';
      db._insert('planets', createPlanetRow('planet-1', playerId));

      // 3 fleet_focus, 2 tech_rush, 1 correction
      for (let i = 0; i < 3; i++) {
        db._insert('override_analysis', {
          id: `ovr-ff-${i}`,
          planet_id: 'planet-1',
          player_id: playerId,
          classification: 'fleet_focus',
          created_at: now - 300 + i * 10,
          agent_build_id: `ab-ff-${i}`,
          agent_building_id: 1,
          agent_level: 1,
          agent_reason: null,
          manual_build_id: `mb-ff-${i}`,
          manual_building_id: 21,
          manual_level: 1,
          time_delta: 30,
        });
      }
      for (let i = 0; i < 2; i++) {
        db._insert('override_analysis', {
          id: `ovr-tr-${i}`,
          planet_id: 'planet-1',
          player_id: playerId,
          classification: 'tech_rush',
          created_at: now - 200 + i * 10,
          agent_build_id: `ab-tr-${i}`,
          agent_building_id: 1,
          agent_level: 1,
          agent_reason: null,
          manual_build_id: `mb-tr-${i}`,
          manual_building_id: 31,
          manual_level: 1,
          time_delta: 20,
        });
      }
      db._insert('override_analysis', {
        id: 'ovr-co-0',
        planet_id: 'planet-1',
        player_id: playerId,
        classification: 'correction',
        created_at: now - 100,
        agent_build_id: 'ab-co-0',
        agent_building_id: 1,
        agent_level: 1,
        agent_reason: null,
        manual_build_id: 'mb-co-0',
        manual_building_id: 1,
        manual_level: 2,
        time_delta: 10,
      });

      const reasons = await getTopOverrideReasons(db as any, playerId, 3);

      expect(reasons).toHaveLength(3);
      expect(reasons[0]!.classification).toBe('fleet_focus');
      expect(reasons[0]!.count).toBe(3);
      expect(reasons[1]!.classification).toBe('tech_rush');
      expect(reasons[1]!.count).toBe(2);
      expect(reasons[2]!.classification).toBe('correction');
      expect(reasons[2]!.count).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // Strategy Generation & Comparison
  // --------------------------------------------------------------------------

  describe('Strategy Learning', () => {
    test('generateImprovedStrategy returns a valid strategy', async () => {
      const playerId = 'player-1';
      db._insert('planets', createPlanetRow('planet-1', playerId));

      // Minimal data for strategy generation
      db._insert(
        'build_history',
        createBuildHistoryRow('planet-1', BUILDING_ID.metalMine, 5, 'agent', now - 500)
      );

      const strategy = await generateImprovedStrategy(db as any, playerId);

      expect(strategy).toBeInstanceOf(Array);
      expect(strategy.length).toBeGreaterThan(0);

      // Each step should have buildingId and targetLevel
      for (const step of strategy) {
        expect(step).toHaveProperty('buildingId');
        expect(step).toHaveProperty('targetLevel');
        expect(typeof step.buildingId).toBe('number');
        expect(typeof step.targetLevel).toBe('number');
        expect(step.targetLevel).toBeGreaterThan(0);
      }
    });

    test('generateImprovedStrategy prioritizes shipyard when fleet_focus overrides are high', async () => {
      const playerId = 'player-2';
      db._insert('planets', createPlanetRow('planet-2', playerId));

      db._insert(
        'build_history',
        createBuildHistoryRow('planet-2', BUILDING_ID.metalMine, 5, 'agent', now - 500)
      );

      // Add 4 fleet_focus overrides
      for (let i = 0; i < 4; i++) {
        db._insert('override_analysis', {
          id: `ovr-${i}`,
          planet_id: 'planet-2',
          player_id: playerId,
          classification: 'fleet_focus',
          created_at: now - 300 + i * 10,
          agent_build_id: `ab-${i}`,
          agent_building_id: BUILDING_ID.metalMine,
          agent_level: i + 1,
          agent_reason: null,
          manual_build_id: `mb-${i}`,
          manual_building_id: BUILDING_ID.shipyard,
          manual_level: i + 1,
          time_delta: 30,
        });
      }

      const strategy = await generateImprovedStrategy(db as any, playerId);

      // Shipyard should appear earlier and with higher levels
      const shipyardSteps = strategy.filter((s) => s.buildingId === BUILDING_ID.shipyard);
      expect(shipyardSteps.length).toBeGreaterThanOrEqual(2);
      expect(Math.max(...shipyardSteps.map((s) => s.targetLevel))).toBeGreaterThanOrEqual(6);
    });

    test('compareStrategies detects added buildings', () => {
      const oldStrategy: StrategyStep[] = [
        { buildingId: BUILDING_ID.metalMine, targetLevel: 5 },
        { buildingId: BUILDING_ID.crystalMine, targetLevel: 4 },
      ];
      const newStrategy: StrategyStep[] = [
        { buildingId: BUILDING_ID.metalMine, targetLevel: 5 },
        { buildingId: BUILDING_ID.crystalMine, targetLevel: 4 },
        { buildingId: BUILDING_ID.shipyard, targetLevel: 3 },
      ];

      const diff = compareStrategies(oldStrategy, newStrategy);
      expect(diff).toContain('shipyard');
    });

    test('compareStrategies detects increased levels', () => {
      const oldStrategy: StrategyStep[] = [
        { buildingId: BUILDING_ID.metalMine, targetLevel: 5 },
      ];
      const newStrategy: StrategyStep[] = [
        { buildingId: BUILDING_ID.metalMine, targetLevel: 5 },
        { buildingId: BUILDING_ID.metalMine, targetLevel: 10 },
      ];

      const diff = compareStrategies(oldStrategy, newStrategy);
      expect(diff).toContain('metalMine');
      expect(diff).toContain('10');
    });

    test('compareStrategies returns no changes for identical strategies', () => {
      const strategy: StrategyStep[] = [
        { buildingId: BUILDING_ID.metalMine, targetLevel: 5 },
      ];

      const diff = compareStrategies(strategy, [...strategy]);
      expect(diff).toBe('No significant changes');
    });

    test('applyLearnedStrategy creates strategy and updates planet', async () => {
      const playerId = 'player-1';
      const planetId = 'planet-1';
      db._insert('planets', createPlanetRow(planetId, playerId));

      const strategy: StrategyStep[] = [
        { buildingId: BUILDING_ID.metalMine, targetLevel: 10 },
        { buildingId: BUILDING_ID.shipyard, targetLevel: 5 },
      ];

      const result = await applyLearnedStrategy(db as any, planetId, strategy);

      expect(result.applied).toBe(true);
      expect(result.strategyId).toContain('strat-learned');

      // Check strategy was stored
      const strategies = db._getAll('build_strategies');
      expect(strategies.length).toBe(1);
      expect(JSON.parse(strategies[0]!.steps as string)).toEqual(strategy);

      // Check strategy history was logged
      const history = db._getAll('strategy_history');
      expect(history.length).toBe(1);
      expect(history[0]!.source).toBe('learned');
    });
  });

  // --------------------------------------------------------------------------
  // Metrics & Reporting
  // --------------------------------------------------------------------------

  describe('Metrics', () => {
    test('getH2MMetrics returns correct metrics', async () => {
      const playerId = 'player-1';
      db._insert('planets', createPlanetRow('planet-1', playerId));

      // 8 agent builds, 4 manual builds
      for (let i = 0; i < 8; i++) {
        db._insert(
          'build_history',
          createBuildHistoryRow('planet-1', BUILDING_ID.metalMine, i + 1, 'agent', now - 800 + i * 10)
        );
      }
      for (let i = 0; i < 4; i++) {
        db._insert(
          'build_history',
          createBuildHistoryRow('planet-1', BUILDING_ID.crystalMine, i + 1, 'manual', now - 400 + i * 10)
        );
      }

      // 2 overrides
      db._insert('override_analysis', {
        id: 'ovr-1',
        planet_id: 'planet-1',
        player_id: playerId,
        classification: 'fleet_focus',
        created_at: now - 300,
        agent_build_id: 'ab-1',
        agent_building_id: 1,
        agent_level: 1,
        agent_reason: null,
        manual_build_id: 'mb-1',
        manual_building_id: 21,
        manual_level: 1,
        time_delta: 30,
      });
      db._insert('override_analysis', {
        id: 'ovr-2',
        planet_id: 'planet-1',
        player_id: playerId,
        classification: 'tech_rush',
        created_at: now - 200,
        agent_build_id: 'ab-2',
        agent_building_id: 1,
        agent_level: 2,
        agent_reason: null,
        manual_build_id: 'mb-2',
        manual_building_id: 31,
        manual_level: 1,
        time_delta: 20,
      });

      const metrics = await getH2MMetrics(db as any, playerId);

      expect(metrics.playerId).toBe(playerId);
      expect(metrics.totalAgentDecisions).toBe(8);
      expect(metrics.totalManualDecisions).toBe(4);
      expect(metrics.totalOverrides).toBe(2);
      expect(metrics.overrideRate).toBe(0.25); // 2/8
      expect(metrics.adoptionRate).toBe(0.75); // 1 - 0.25
      expect(metrics.planetBreakdown).toHaveLength(1);
      expect(metrics.planetBreakdown[0]!.planetId).toBe('planet-1');
    });

    test('getH2MMetrics handles player with no data', async () => {
      const metrics = await getH2MMetrics(db as any, 'nonexistent');

      expect(metrics.totalAgentDecisions).toBe(0);
      expect(metrics.totalManualDecisions).toBe(0);
      expect(metrics.totalOverrides).toBe(0);
      expect(metrics.overrideRate).toBe(0);
      expect(metrics.adoptionRate).toBe(1); // No overrides = perfect adoption
    });
  });

  describe('Adoption Rate', () => {
    test('getAdoptionRate returns correct rate for time window', async () => {
      const playerId = 'player-1';
      db._insert('planets', createPlanetRow('planet-1', playerId));

      // 5 recent agent builds (within 7 days)
      for (let i = 0; i < 5; i++) {
        db._insert(
          'build_history',
          createBuildHistoryRow('planet-1', BUILDING_ID.metalMine, i + 1, 'agent', now - 100 + i * 10)
        );
      }

      // 1 recent override
      db._insert('override_analysis', {
        id: 'ovr-1',
        planet_id: 'planet-1',
        player_id: playerId,
        classification: 'fleet_focus',
        created_at: now - 50,
        agent_build_id: 'ab-1',
        agent_building_id: 1,
        agent_level: 1,
        agent_reason: null,
        manual_build_id: 'mb-1',
        manual_building_id: 21,
        manual_level: 1,
        time_delta: 30,
      });

      const result = await getAdoptionRate(db as any, playerId, 7);

      expect(result.agentDecisions).toBe(5);
      expect(result.overrides).toBe(1);
      expect(result.adoptionRate).toBe(0.8); // 1 - 1/5
      expect(result.windowDays).toBe(7);
    });

    test('getAdoptionRate returns 1.0 when no overrides', async () => {
      const playerId = 'player-1';
      db._insert('planets', createPlanetRow('planet-1', playerId));

      // Agent builds with no overrides
      for (let i = 0; i < 3; i++) {
        db._insert(
          'build_history',
          createBuildHistoryRow('planet-1', BUILDING_ID.metalMine, i + 1, 'agent', now - 100 + i * 10)
        );
      }

      const result = await getAdoptionRate(db as any, playerId, 7);

      expect(result.adoptionRate).toBe(1);
    });

    test('getAdoptionRate returns 1.0 when no agent decisions', async () => {
      const result = await getAdoptionRate(db as any, 'player-no-data', 7);
      expect(result.adoptionRate).toBe(1);
      expect(result.agentDecisions).toBe(0);
    });
  });

  describe('H2M Report', () => {
    test('generateH2MReport returns comprehensive report', async () => {
      const playerId = 'player-1';
      db._insert('planets', createPlanetRow('planet-1', playerId));

      // Some build history
      for (let i = 0; i < 5; i++) {
        db._insert(
          'build_history',
          createBuildHistoryRow('planet-1', BUILDING_ID.metalMine, i + 1, 'agent', now - 500 + i * 10)
        );
      }

      const report = await generateH2MReport(db as any, playerId);

      expect(report.playerId).toBe(playerId);
      expect(report.generatedAt).toBeGreaterThan(0);
      expect(report.metrics).toBeDefined();
      expect(report.profile).toBeDefined();
      expect(report.topOverrideReasons).toBeInstanceOf(Array);
      expect(report.recommendations).toBeInstanceOf(Array);
      expect(report.recommendations.length).toBeGreaterThan(0);
      expect(report.adoptionHistory).toBeInstanceOf(Array);
      expect(report.adoptionHistory).toHaveLength(4); // 4 weekly buckets
    });
  });

  // --------------------------------------------------------------------------
  // Store Overrides
  // --------------------------------------------------------------------------

  describe('Store Overrides', () => {
    test('storeOverrides persists new overrides', async () => {
      const overrides: Override[] = [
        {
          id: 'ovr-new-1',
          planetId: 'planet-1',
          playerId: 'player-1',
          agentBuildId: 'ab-1',
          agentBuildingId: BUILDING_ID.metalMine,
          agentLevel: 5,
          agentReason: 'Strategy step',
          manualBuildId: 'mb-1',
          manualBuildingId: BUILDING_ID.shipyard,
          manualLevel: 3,
          timeDelta: 60,
          classification: 'fleet_focus',
          detectedAt: now,
        },
      ];

      const stored = await storeOverrides(db as any, overrides);

      expect(stored).toBe(1);
      expect(db._getAll('override_analysis')).toHaveLength(1);
    });

    test('storeOverrides skips duplicates', async () => {
      const override: Override = {
        id: 'ovr-dup-1',
        planetId: 'planet-1',
        playerId: 'player-1',
        agentBuildId: 'ab-1',
        agentBuildingId: BUILDING_ID.metalMine,
        agentLevel: 5,
        agentReason: null,
        manualBuildId: 'mb-1',
        manualBuildingId: BUILDING_ID.shipyard,
        manualLevel: 3,
        timeDelta: 60,
        classification: 'fleet_focus',
        detectedAt: now,
      };

      // Store once
      await storeOverrides(db as any, [override]);
      // Store again — should skip
      const stored = await storeOverrides(db as any, [override]);

      expect(stored).toBe(0);
      expect(db._getAll('override_analysis')).toHaveLength(1);
    });
  });

  // --------------------------------------------------------------------------
  // OVERRIDE_WINDOW_SECONDS constant
  // --------------------------------------------------------------------------

  describe('Constants', () => {
    test('OVERRIDE_WINDOW_SECONDS is 600 (10 minutes)', () => {
      expect(OVERRIDE_WINDOW_SECONDS).toBe(600);
    });
  });

  // --------------------------------------------------------------------------
  // Learning Cycle (integration-style)
  // --------------------------------------------------------------------------

  describe('Learning Cycle', () => {
    test('runH2MLearningCycle processes players with agent-enabled planets', async () => {
      const playerId = 'player-1';
      db._insert('planets', createPlanetRow('planet-1', playerId, 1));

      // Agent build followed by manual build (override)
      db._insert(
        'build_history',
        createBuildHistoryRow('planet-1', BUILDING_ID.metalMine, 5, 'agent', now - 300, 'Strategy')
      );
      db._insert(
        'build_history',
        createBuildHistoryRow('planet-1', BUILDING_ID.shipyard, 3, 'manual', now - 250)
      );
      db._insert(
        'build_history',
        createBuildHistoryRow('planet-1', BUILDING_ID.crystalMine, 4, 'agent', now - 200, 'Strategy')
      );
      db._insert(
        'build_history',
        createBuildHistoryRow('planet-1', BUILDING_ID.researchLab, 2, 'manual', now - 150)
      );
      db._insert(
        'build_history',
        createBuildHistoryRow('planet-1', BUILDING_ID.deutSynth, 3, 'agent', now - 100, 'Strategy')
      );
      db._insert(
        'build_history',
        createBuildHistoryRow('planet-1', BUILDING_ID.solarPlant, 5, 'manual', now - 50)
      );

      const result = await runH2MLearningCycle(db as any);

      expect(result.playersProcessed).toBe(1);
      expect(result.overridesDetected).toBe(3);
      expect(result.strategiesUpdated).toBe(1); // >= 3 overrides triggers strategy update
    });

    test('runH2MLearningCycle returns zeros when no agent-enabled planets', async () => {
      // Planet with agent_enabled = 0
      db._insert('planets', createPlanetRow('planet-1', 'player-1', 0));

      const result = await runH2MLearningCycle(db as any);

      expect(result.playersProcessed).toBe(0);
      expect(result.overridesDetected).toBe(0);
      expect(result.strategiesUpdated).toBe(0);
    });
  });
});
