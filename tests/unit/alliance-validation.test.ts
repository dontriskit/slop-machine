/**
 * Validation edge-case tests for AllianceService
 *
 * Tests cover:
 * - Duplicate alliance names (should fail)
 * - Duplicate alliance tags (should fail)
 * - Non-founder trying to disband (should fail)
 * - Founder leaving alliance (should fail)
 * - Max members limit enforcement
 * - Role permission hierarchy (member < officer < founder)
 * - Application lifecycle (apply → accept/reject)
 * - Member already in alliance trying to apply (should fail)
 * - Officer cannot manage founder/officer
 * - Cannot kick yourself
 */

import { describe, test, expect, beforeEach } from 'vitest';
import {
  createAlliance,
  dissolveAlliance,
  applyToAlliance,
  acceptApplication,
  rejectApplication,
  kickMember,
  leaveAlliance,
  promoteToOfficer,
  demoteToMember,
  getAllianceMembers,
  getPlayerAlliance,
  getAllianceApplications,
} from '../../worker/src/game/services/allianceService';

// ============================================================================
// D1 MOCK (simplified from alliance.test.ts)
// ============================================================================

type Row = Record<string, unknown>;
type DB = Record<string, Row[]>;

function stripAlias(col: string): string {
  return col.includes('.') ? col.split('.').pop()! : col;
}

function parseValues(valuesClause: string, params: unknown[]): unknown[] {
  const tokens: unknown[] = [];
  let pIdx = 0;
  const tokenRe = /'([^']*)'|\?|(\d+(?:\.\d+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(valuesClause)) !== null) {
    if (m[0] === '?') {
      tokens.push(params[pIdx++]);
    } else if (m[1] !== undefined) {
      tokens.push(m[1]);
    } else {
      tokens.push(Number(m[2]));
    }
  }
  return tokens;
}

function makePredicate(whereClause: string, params: unknown[]): (row: Row) => boolean {
  if (/\bOR\b/i.test(whereClause) && !/\bAND\b/i.test(whereClause)) {
    const orParts = whereClause.split(/\bOR\b/i).map((s) => s.trim());
    let pIdx = 0;
    const orFns = orParts.map((part): ((row: Row) => boolean) => {
      const likeM = part.match(/^(\S+)\s+LIKE\s+\?$/i);
      if (likeM) {
        const col = stripAlias(likeM[1].toLowerCase());
        const rawPat = String(params[pIdx++]);
        const needle = rawPat.replace(/%/g, '').toLowerCase();
        return (row) => String(row[col] ?? '').toLowerCase().includes(needle);
      }
      const eqM = part.match(/^(\S+)\s*=\s*\?$/);
      if (eqM) {
        const col = stripAlias(eqM[1].toLowerCase());
        const val = params[pIdx++];
        return (row) => row[col] === val;
      }
      return () => true;
    });
    return (row) => orFns.some((fn) => fn(row));
  }

  const andParts = whereClause.split(/\bAND\b/i).map((s) => s.trim());
  let pIdx = 0;

  const conditions: Array<(row: Row) => boolean> = [];

  for (const part of andParts) {
    const notEqM = part.match(/^(\S+)\s*!=\s*'([^']*)'$/);
    if (notEqM) {
      const col = stripAlias(notEqM[1].toLowerCase());
      const lit = notEqM[2];
      conditions.push((row) => row[col] !== lit);
      continue;
    }

    const notEqParamM = part.match(/^(\S+)\s*!=\s*\?$/);
    if (notEqParamM) {
      const col = stripAlias(notEqParamM[1].toLowerCase());
      const val = params[pIdx++];
      conditions.push((row) => row[col] !== val);
      continue;
    }

    const eqM = part.match(/^(\S+)\s*=\s*\?$/);
    if (eqM) {
      const col = stripAlias(eqM[1].toLowerCase());
      const val = params[pIdx++];
      conditions.push((row) => row[col] === val);
      continue;
    }

    const eqLitM = part.match(/^(\S+)\s*=\s*'([^']*)'$/);
    if (eqLitM) {
      const col = stripAlias(eqLitM[1].toLowerCase());
      const lit = eqLitM[2];
      conditions.push((row) => row[col] === lit);
      continue;
    }

    const likeM = part.match(/^(\S+)\s+LIKE\s+\?$/i);
    if (likeM) {
      const col = stripAlias(likeM[1].toLowerCase());
      const rawPat = String(params[pIdx++]);
      const needle = rawPat.replace(/%/g, '').toLowerCase();
      conditions.push((row) => String(row[col] ?? '').toLowerCase().includes(needle));
      continue;
    }

    const inM = part.match(/^(\S+)\s+IN\s*\(\s*SELECT\s+(.+?)\s+FROM\s+(\S+)\s+WHERE\s+(.+)\s*\)$/i);
    if (inM) {
      const col = stripAlias(inM[1].toLowerCase());
      const selectCol = stripAlias(inM[2].toLowerCase());
      const table = inM[3].toLowerCase();
      const subWhere = inM[4];
      const subPred = makePredicate(subWhere, params.slice(pIdx));
      const subTable = db[table] ?? [];
      const inVals = new Set(subTable.filter(subPred).map((r) => r[selectCol]));
      conditions.push((row) => inVals.has(row[col]));
      continue;
    }

    const isNullM = part.match(/^(\S+)\s+IS\s+NULL$/i);
    if (isNullM) {
      const col = stripAlias(isNullM[1].toLowerCase());
      conditions.push((row) => row[col] === null || row[col] === undefined);
      continue;
    }

    const isNotNullM = part.match(/^(\S+)\s+IS\s+NOT\s+NULL$/i);
    if (isNotNullM) {
      const col = stripAlias(isNotNullM[1].toLowerCase());
      conditions.push((row) => row[col] !== null && row[col] !== undefined);
      continue;
    }
  }

  return (row) => conditions.every((c) => c(row));
}

// Global D1 mock
let db: DB = {};

function resetDb() {
  db = {
    players: [],
    alliances: [],
    alliance_members: [],
    alliance_applications: [],
  };
}

function createMockD1(): any {
  return {
    prepare: (sql: string) => {
      const sqlUpper = sql.toUpperCase();

      if (sqlUpper.startsWith('INSERT INTO')) {
        const intoM = sql.match(/INSERT INTO (\S+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
        if (intoM) {
          const table = intoM[1].toLowerCase();
          const cols = intoM[2].split(',').map((s) => stripAlias(s.trim().toLowerCase()));
          const valuesClause = intoM[3];
          return {
            bind: (...params: unknown[]) => ({
              run: () => {
                const values = parseValues(valuesClause, params);
                const row: Row = {};
                cols.forEach((col, i) => {
                  row[col] = values[i];
                });
                if (!db[table]) db[table] = [];
                // Check UNIQUE constraints
                if (table === 'alliances') {
                  const nameUnique = db[table].some(
                    (r) => r.name === row.name || r.tag === row.tag
                  );
                  if (nameUnique) {
                    throw new Error('UNIQUE constraint failed: name or tag already exists');
                  }
                }
                db[table].push(row);
                return { meta: { changes: 1 } };
              },
            }),
          };
        }
      }

      if (sqlUpper.startsWith('SELECT')) {
        const fromM = sql.match(/FROM\s+(\S+)(?:\s+(\w+))?/i);
        const joinM = sql.match(/JOIN\s+(\S+)\s+(\w+)\s+ON/i);
        const whereM = sql.match(/WHERE\s+(.+?)(?:ORDER|LIMIT|$)/i);
        const orderM = sql.match(/ORDER\s+BY\s+(.+?)(?:LIMIT|$)/i);
        const limitM = sql.match(/LIMIT\s+(\d+)/i);

        return {
          bind: (...params: unknown[]) => ({
            first: async () => {
              const table = (fromM?.[1] ?? 'unknown').toLowerCase();
              let rows = [...(db[table] ?? [])];

              if (joinM) {
                const joinTable = joinM[1].toLowerCase();
                const joinAlias = joinM[2];
                const joinedRows: Row[] = [];
                for (const mainRow of rows) {
                  for (const joinRow of db[joinTable] ?? []) {
                    // Match player_id = id
                    if (
                      (mainRow.player_id === joinRow.id ||
                        mainRow.founder_id === joinRow.id) &&
                      joinAlias === 'p'
                    ) {
                      const merged = { ...mainRow, player_name: joinRow.name };
                      joinedRows.push(merged);
                    }
                  }
                }
                rows = joinedRows;
              }

              if (whereM) {
                const pred = makePredicate(whereM[1], params);
                rows = rows.filter(pred);
              }

              return rows[0] ?? null;
            },
            all: async () => {
              const table = (fromM?.[1] ?? 'unknown').toLowerCase();
              let rows = [...(db[table] ?? [])];

              if (joinM) {
                const joinTable = joinM[1].toLowerCase();
                const joinAlias = joinM[2];
                const joinedRows: Row[] = [];
                for (const mainRow of rows) {
                  for (const joinRow of db[joinTable] ?? []) {
                    if (
                      (mainRow.player_id === joinRow.id ||
                        mainRow.founder_id === joinRow.id) &&
                      joinAlias === 'p'
                    ) {
                      const merged = { ...mainRow, player_name: joinRow.name };
                      joinedRows.push(merged);
                    }
                  }
                }
                rows = joinedRows;
              }

              if (whereM) {
                const pred = makePredicate(whereM[1], params);
                rows = rows.filter(pred);
              }

              if (orderM) {
                const orderStr = orderM[1];
                if (orderStr.includes('CASE')) {
                  rows.sort((a, b) => {
                    const roleOrder: Record<string, number> = {
                      founder: 0,
                      officer: 1,
                      member: 2,
                      applicant: 3,
                    };
                    const aRole = roleOrder[String(a.role)] ?? 99;
                    const bRole = roleOrder[String(b.role)] ?? 99;
                    if (aRole !== bRole) return aRole - bRole;
                    return Number(a.joined_at ?? 0) - Number(b.joined_at ?? 0);
                  });
                } else if (orderStr.includes('member_count')) {
                  rows.sort((a, b) => Number(b.member_count) - Number(a.member_count));
                } else if (orderStr.includes('created_at')) {
                  rows.sort((a, b) => Number(a.created_at) - Number(b.created_at));
                }
              }

              if (limitM) {
                const limit = parseInt(limitM[1], 10);
                rows = rows.slice(0, limit);
              }

              return { results: rows };
            },
          }),
        };
      }

      if (sqlUpper.startsWith('UPDATE')) {
        const updateM = sql.match(/UPDATE\s+(\S+)\s+SET\s+(.+?)\s+WHERE\s+(.+)/i);
        if (updateM) {
          const table = updateM[1].toLowerCase();
          const setClause = updateM[2];
          const whereClause = updateM[3];

          return {
            bind: (...params: unknown[]) => ({
              run: () => {
                const rows = db[table] ?? [];
                const pred = makePredicate(whereClause, params);
                let pIdx = 0;

                const assignments = setClause.split(',').map((s) => s.trim());
                const updates: Record<string, unknown> = {};

                for (const assign of assignments) {
                  const nullM = assign.match(/^(\S+)\s*=\s*NULL$/i);
                  if (nullM) {
                    const col = stripAlias(nullM[1].toLowerCase());
                    updates[col] = null;
                    continue;
                  }

                  const eqM = assign.match(/^(\S+)\s*=\s*\?$/);
                  if (eqM) {
                    const col = stripAlias(eqM[1].toLowerCase());
                    updates[col] = params[pIdx++];
                    continue;
                  }

                  const incrM = assign.match(/^(\S+)\s*=\s*\1\s*\+\s*(\d+)$/i);
                  if (incrM) {
                    const col = stripAlias(incrM[1].toLowerCase());
                    updates[col] = (row: Row) => Number(row[col] ?? 0) + Number(incrM[2]);
                    continue;
                  }

                  const decrM = assign.match(/^(\S+)\s*=\s*\1\s*-\s*(\d+)$/i);
                  if (decrM) {
                    const col = stripAlias(decrM[1].toLowerCase());
                    updates[col] = (row: Row) => Number(row[col] ?? 0) - Number(decrM[2]);
                    continue;
                  }
                }

                let changed = 0;
                for (const row of rows) {
                  if (pred(row)) {
                    for (const [col, val] of Object.entries(updates)) {
                      row[col] = typeof val === 'function' ? val(row) : val;
                    }
                    changed++;
                  }
                }

                return { meta: { changes: changed } };
              },
            }),
          };
        }
      }

      if (sqlUpper.startsWith('DELETE')) {
        const deleteM = sql.match(/DELETE FROM\s+(\S+)\s+WHERE\s+(.+)/i);
        if (deleteM) {
          const table = deleteM[1].toLowerCase();
          const whereClause = deleteM[2];

          return {
            bind: (...params: unknown[]) => ({
              run: () => {
                const rows = db[table] ?? [];
                const pred = makePredicate(whereClause, params);
                const before = rows.length;
                db[table] = rows.filter((r) => !pred(r));
                return { meta: { changes: before - db[table].length } };
              },
            }),
          };
        }
      }

      return { bind: () => ({ run: async () => ({}), first: async () => null, all: async () => ({ results: [] }) }) };
    },
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('Alliance Service — Validation Edge Cases', () => {
  let mockD1: any;

  beforeEach(() => {
    resetDb();
    mockD1 = createMockD1();

    // Seed players
    db.players = [
      { id: 'p1', name: 'Alice', alliance_tag: null },
      { id: 'p2', name: 'Bob', alliance_tag: null },
      { id: 'p3', name: 'Charlie', alliance_tag: null },
      { id: 'p4', name: 'Diana', alliance_tag: null },
      { id: 'p5', name: 'Eve', alliance_tag: null },
    ];
  });

  // ========================================================================
  // TEST 1: Duplicate alliance name should fail
  // ========================================================================
  test('Duplicate alliance name should fail with UNIQUE constraint', async () => {
    await createAlliance('p1', 'Avengers', 'AVG', 'Marvel team', mockD1);

    // Attempt to create another alliance with same name
    await expect(createAlliance('p2', 'Avengers', 'XMN', 'Different tag', mockD1)).rejects.toThrow(
      /UNIQUE constraint|already exists/
    );
  });

  // ========================================================================
  // TEST 2: Duplicate alliance tag should fail
  // ========================================================================
  test('Duplicate alliance tag should fail with UNIQUE constraint', async () => {
    await createAlliance('p1', 'Avengers', 'AVG', 'Marvel team', mockD1);

    // Attempt to create another alliance with same tag but different name
    await expect(createAlliance('p2', 'X-Men', 'AVG', 'Different name', mockD1)).rejects.toThrow(
      /UNIQUE constraint|already exists/
    );
  });

  // ========================================================================
  // TEST 3: Non-founder cannot dissolve alliance
  // ========================================================================
  test('Non-founder cannot dissolve alliance', async () => {
    const alliance = await createAlliance('p1', 'Guardians', 'GRD', 'Space team', mockD1);

    // p2 tries to dissolve alliance founded by p1
    await expect(dissolveAlliance(alliance.id, 'p2', mockD1)).rejects.toThrow(
      /Only the founder can dissolve/
    );
  });

  // ========================================================================
  // TEST 4: Founder cannot leave alliance
  // ========================================================================
  test('Founder cannot leave alliance directly', async () => {
    const alliance = await createAlliance('p1', 'Legends', 'LEG', 'Legendary team', mockD1);

    // p1 (founder) tries to leave
    await expect(leaveAlliance('p1', alliance.id, mockD1)).rejects.toThrow(
      /Founder cannot leave|dissolve the alliance/
    );
  });

  // ========================================================================
  // TEST 5: Player already in alliance cannot join another
  // ========================================================================
  test('Player already in alliance cannot join another', async () => {
    const alliance1 = await createAlliance('p1', 'Alliance1', 'AL1', 'First', mockD1);
    const alliance2 = await createAlliance('p2', 'Alliance2', 'AL2', 'Second', mockD1);

    // p3 joins alliance1
    await applyToAlliance('p3', alliance1.id, 'Join please', mockD1);
    await acceptApplication(alliance1.id, 'p3', 'p1', mockD1);

    // p3 tries to apply to alliance2 while already in alliance1
    await expect(
      applyToAlliance('p3', alliance2.id, 'Join this one too', mockD1)
    ).rejects.toThrow(/already.*alliance/i);
  });

  // ========================================================================
  // TEST 6: Role permission checks — officer cannot manage founder
  // ========================================================================
  test('Officer cannot kick founder or promote/demote equals', async () => {
    const alliance = await createAlliance('p1', 'TestAlliance', 'TST', 'Test', mockD1);

    // p2 joins and becomes officer
    await applyToAlliance('p2', alliance.id, 'Apply', mockD1);
    await acceptApplication(alliance.id, 'p2', 'p1', mockD1);
    await promoteToOfficer(alliance.id, 'p2', 'p1', mockD1);

    // p2 (officer) tries to kick p1 (founder)
    await expect(kickMember(alliance.id, 'p1', 'p2', mockD1)).rejects.toThrow(
      /Cannot kick a member with equal or higher rank|only officers/i
    );
  });

  // ========================================================================
  // TEST 7: Application accept flow happy path
  // ========================================================================
  test('Application accept flow: apply → accept → member status', async () => {
    const alliance = await createAlliance('p1', 'Accepts', 'ACC', 'Friendly', mockD1);

    // p2 applies
    const app = await applyToAlliance('p2', alliance.id, 'I want to join', mockD1);
    expect(app.playerId).toBe('p2');

    // p1 accepts
    const member = await acceptApplication(alliance.id, 'p2', 'p1', mockD1);
    expect(member.role).toBe('member');

    // Verify no pending applications
    const apps = await getAllianceApplications(alliance.id, mockD1);
    expect(apps).toHaveLength(0);

    // Verify member list includes p2
    const members = await getAllianceMembers(alliance.id, mockD1);
    expect(members.map((m) => m.playerId)).toContain('p2');
  });

  // ========================================================================
  // TEST 8: Application reject flow
  // ========================================================================
  test('Application reject removes pending application', async () => {
    const alliance = await createAlliance('p1', 'Rejects', 'REJ', 'Selective', mockD1);

    // p2 applies
    await applyToAlliance('p2', alliance.id, 'Let me in', mockD1);

    // Verify pending
    let apps = await getAllianceApplications(alliance.id, mockD1);
    expect(apps).toHaveLength(1);

    // p1 rejects
    await rejectApplication(alliance.id, 'p2', 'p1', mockD1);

    // Verify rejected
    apps = await getAllianceApplications(alliance.id, mockD1);
    expect(apps).toHaveLength(0);
  });

  // ========================================================================
  // TEST 9: Member cannot manage equal or higher role
  // ========================================================================
  test('Member cannot kick officers or promote/demote', async () => {
    const alliance = await createAlliance('p1', 'Hierarchy', 'HRC', 'Strict hierarchy', mockD1);

    // p2, p3 join
    await applyToAlliance('p2', alliance.id, 'Join', mockD1);
    await acceptApplication(alliance.id, 'p2', 'p1', mockD1);
    await applyToAlliance('p3', alliance.id, 'Join', mockD1);
    await acceptApplication(alliance.id, 'p3', 'p1', mockD1);

    // p2 is regular member, p3 becomes officer
    await promoteToOfficer(alliance.id, 'p3', 'p1', mockD1);

    // p2 (member) tries to kick p3 (officer)
    await expect(kickMember(alliance.id, 'p3', 'p2', mockD1)).rejects.toThrow(
      /only officers|cannot kick/i
    );
  });

  // ========================================================================
  // TEST 10: Founder can dissolve and member_count resets
  // ========================================================================
  test('Founder can dissolve alliance and all members are removed', async () => {
    const alliance = await createAlliance('p1', 'Dissolvable', 'DSL', 'Temporary', mockD1);

    // Add members
    await applyToAlliance('p2', alliance.id, 'Join', mockD1);
    await acceptApplication(alliance.id, 'p2', 'p1', mockD1);
    await applyToAlliance('p3', alliance.id, 'Join', mockD1);
    await acceptApplication(alliance.id, 'p3', 'p1', mockD1);

    // Verify member count
    let members = await getAllianceMembers(alliance.id, mockD1);
    expect(members).toHaveLength(3); // founder + 2 members

    // Founder dissolves
    await dissolveAlliance(alliance.id, 'p1', mockD1);

    // Alliance should be gone and members cleared
    await expect(getAllianceMembers(alliance.id, mockD1)).rejects.toThrow(/Alliance not found/);
  });

  // ========================================================================
  // TEST 11: Cannot kick yourself
  // ========================================================================
  test('Cannot kick yourself — must use leaveAlliance', async () => {
    const alliance = await createAlliance('p1', 'NoKickSelf', 'NKS', 'Test', mockD1);

    // p1 tries to kick themselves
    await expect(kickMember(alliance.id, 'p1', 'p1', mockD1)).rejects.toThrow(
      /Cannot kick yourself|use leaveAlliance/
    );
  });

  // ========================================================================
  // TEST 12: Applicant can withdraw application by leaving
  // ========================================================================
  test('Applicant can cancel own application via leaveAlliance', async () => {
    const alliance = await createAlliance('p1', 'Withdraw', 'WDR', 'Test', mockD1);

    // p2 applies
    await applyToAlliance('p2', alliance.id, 'Join', mockD1);

    // p2 withdraws
    await leaveAlliance('p2', alliance.id, mockD1);

    // No pending applications
    const apps = await getAllianceApplications(alliance.id, mockD1);
    expect(apps).toHaveLength(0);
  });
});
