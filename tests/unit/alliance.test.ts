/**
 * Unit tests for AllianceService
 *
 * Uses a purpose-built in-memory D1 mock. The mock handles exactly the SQL
 * patterns produced by allianceService.ts — it is NOT a general SQL engine.
 *
 * Key design decisions:
 *  - INSERT parsing handles mixed literal-string and ? VALUES
 *  - WHERE parser handles table-aliased columns (am.role, p.id, etc.)
 *  - WHERE parser handles `col != 'literal'` and `col != ?`
 *  - UPDATE SET handles `member_count = member_count + 1`, `col = NULL`, `col = 'literal'`
 *  - SELECT JOIN merges secondary table columns under player_name alias
 *  - LIKE uses stripped-percent substring match
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
  searchAlliances,
  getAllianceApplications,
} from '../../worker/src/game/services/allianceService';

// ============================================================================
// D1 MOCK
// ============================================================================

type Row = Record<string, unknown>;
type DB = Record<string, Row[]>;

/**
 * Strip a table alias prefix from a column name.
 * e.g. "am.role" → "role", "pl.name" → "name"
 */
function stripAlias(col: string): string {
  return col.includes('.') ? col.split('.').pop()! : col;
}

/**
 * Parse VALUES clause tokens — handles SQL strings like `'founder'` and `?`.
 * Returns an array of { isLiteral, value } pairs aligned with the column list.
 */
function parseValues(valuesClause: string, params: unknown[]): unknown[] {
  // Tokenise the VALUES(…) content
  const tokens: unknown[] = [];
  let pIdx = 0;
  // Match either 'single-quoted string' or ?  or numeric literal
  const tokenRe = /'([^']*)'|\?|(\d+(?:\.\d+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(valuesClause)) !== null) {
    if (m[0] === '?') {
      tokens.push(params[pIdx++]);
    } else if (m[1] !== undefined) {
      // 'string literal'
      tokens.push(m[1]);
    } else {
      // numeric literal
      tokens.push(Number(m[2]));
    }
  }
  return tokens;
}

/**
 * Build a predicate function from a WHERE clause string + bound params.
 * Handles AND, =, !=, LIKE, literal strings, table alias prefixes.
 */
function makePredicate(whereClause: string, params: unknown[]): (row: Row) => boolean {
  // Handle OR at top level (used in LIKE search: "name LIKE ? OR tag LIKE ?")
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

  // Split on AND
  const andParts = whereClause.split(/\bAND\b/i).map((s) => s.trim());
  let pIdx = 0;

  const fns = andParts.map((part): ((row: Row) => boolean) => {
    // col LIKE ?
    const likeM = part.match(/^(\S+)\s+LIKE\s+\?$/i);
    if (likeM) {
      const col = stripAlias(likeM[1].toLowerCase());
      const rawPat = String(params[pIdx++]);
      const needle = rawPat.replace(/%/g, '').toLowerCase();
      return (row) => String(row[col] ?? '').toLowerCase().includes(needle);
    }
    // col != 'literal'
    const neqLitM = part.match(/^(\S+)\s*!=\s*'([^']*)'$/);
    if (neqLitM) {
      const col = stripAlias(neqLitM[1].toLowerCase());
      const val = neqLitM[2];
      return (row) => row[col] !== val;
    }
    // col != ?
    const neqM = part.match(/^(\S+)\s*!=\s*\?$/);
    if (neqM) {
      const col = stripAlias(neqM[1].toLowerCase());
      const val = params[pIdx++];
      return (row) => row[col] !== val;
    }
    // col = 'literal'
    const eqLitM = part.match(/^(\S+)\s*=\s*'([^']*)'$/);
    if (eqLitM) {
      const col = stripAlias(eqLitM[1].toLowerCase());
      const val = eqLitM[2];
      return (row) => row[col] === val;
    }
    // col = ?
    const eqM = part.match(/^(\S+)\s*=\s*\?$/);
    if (eqM) {
      const col = stripAlias(eqM[1].toLowerCase());
      const val = params[pIdx++];
      return (row) => row[col] === val;
    }
    // Unrecognised — pass all (safe for test purposes)
    return () => true;
  });

  return (row) => fns.every((fn) => fn(row));
}

function makeDb(): D1Database {
  const db: DB = {
    players: [],
    alliances: [],
    alliance_members: [],
    alliance_applications: [],
  };

  // ---- SELECT ----

  function executeSelect(sql: string, params: unknown[]): Row[] {
    // Determine base table
    const fromM = sql.match(/\bFROM\s+(\w+)(?:\s+\w+)?/i);
    if (!fromM) return [];
    const baseTable = fromM[1];
    let rows: Row[] = (db[baseTable] ?? []).map((r) => ({ ...r }));

    // ---- INNER JOINs ----
    // Pattern: JOIN tableName alias ON alias.col1 = alias2.col2
    const joinRe = /\bJOIN\s+(\w+)\s+(\w+)\s+ON\s+(\w+)\.(\w+)\s*=\s*(\w+)\.(\w+)/gi;
    let jm: RegExpExecArray | null;
    while ((jm = joinRe.exec(sql)) !== null) {
      const [, joinTable, , la, lc, ra, rc] = jm;
      const secondary = db[joinTable] ?? [];
      rows = rows.flatMap((base) => {
        // Determine which side is the base table and which is the join table
        // by checking which alias is associated with which column in the merged row.
        const leftVal = base[lc];
        const rightVal = base[rc];
        const matches = secondary.filter((s) => {
          // Try left join condition: base.lc = secondary.rc
          if (leftVal !== undefined && s[rc] === leftVal) return true;
          // Try right join condition: secondary.lc = base.rc
          if (rightVal !== undefined && s[lc] === rightVal) return true;
          // Try left col matches secondary left col
          if (leftVal !== undefined && s[lc] === leftVal) return true;
          return false;
        });
        if (matches.length === 0) return [];
        return matches.map((sec) => {
          const merged: Row = { ...base };
          // Add secondary columns if not already present
          for (const [k, v] of Object.entries(sec)) {
            if (!(k in merged)) merged[k] = v;
          }
          // Expose name as player_name for JOIN players alias
          if (joinTable === 'players' && sec.name !== undefined) {
            merged['player_name'] = sec.name;
          }
          return merged;
        });
      });
    }

    // ---- WHERE ----
    // Extract WHERE clause, stopping at ORDER/LIMIT
    const whereM = sql.match(/\bWHERE\s+([\s\S]+?)(?:\bORDER\b|\bLIMIT\b|$)/i);
    if (whereM) {
      // Remove sub-SELECT IN (…) before parsing simple conditions
      const clause = whereM[1].trim().replace(/\bIN\s*\(SELECT[\s\S]*?\)/gi, '').trim();
      if (clause) {
        const pred = makePredicate(clause, params);
        rows = rows.filter(pred);
      }
    }

    // ---- ORDER BY ----
    const orderM = sql.match(/\bORDER\s+BY\s+([\s\S]+?)(?:\bLIMIT\b|$)/i);
    if (orderM) {
      const clause = orderM[1].trim();
      if (/CASE/i.test(clause)) {
        const roleRank: Record<string, number> = {
          founder: 0, officer: 1, member: 2, applicant: 3,
        };
        rows.sort((a, b) => {
          const ra = roleRank[String(a.role ?? '')] ?? 99;
          const rb = roleRank[String(b.role ?? '')] ?? 99;
          if (ra !== rb) return ra - rb;
          return Number(a.joined_at ?? 0) - Number(b.joined_at ?? 0);
        });
      } else {
        const parts = clause.split(',').map((p) => p.trim());
        rows.sort((a, b) => {
          for (const part of parts) {
            const tokens = part.split(/\s+/);
            const col = stripAlias(tokens[0].toLowerCase());
            const dir = (tokens[1] ?? 'ASC').toUpperCase();
            const va = a[col] ?? 0;
            const vb = b[col] ?? 0;
            const cmp =
              typeof va === 'number' && typeof vb === 'number'
                ? va - vb
                : String(va).localeCompare(String(vb));
            if (cmp !== 0) return dir === 'DESC' ? -cmp : cmp;
          }
          return 0;
        });
      }
    }

    // ---- LIMIT ----
    const limitM = sql.match(/\bLIMIT\s+(\d+)/i);
    if (limitM) rows = rows.slice(0, parseInt(limitM[1], 10));

    return rows;
  }

  // ---- INSERT ----

  function executeInsert(sql: string, params: unknown[]): number {
    const tableM = sql.match(/\bINTO\s+(\w+)/i);
    if (!tableM) return 0;
    const tableName = tableM[1];
    if (!db[tableName]) db[tableName] = [];
    const rows = db[tableName];

    const colM = sql.match(/\(([^)]+)\)\s*VALUES/i);
    const valM = sql.match(/\bVALUES\s*\(([^)]+)\)/i);
    if (!colM || !valM) return 0;

    const cols = colM[1].split(',').map((c) => c.trim().toLowerCase());
    const values = parseValues(valM[1], params);

    const row: Row = {};
    cols.forEach((col, i) => { row[col] = values[i]; });

    // Enforce UNIQUE / PK constraints
    if (row.id !== undefined && rows.some((r) => r.id === row.id)) {
      throw new Error(`UNIQUE constraint failed: ${tableName}.id`);
    }
    if (tableName === 'alliances') {
      if (rows.some((r) => r.name === row.name)) {
        throw new Error('UNIQUE constraint failed: alliances.name');
      }
      if (rows.some((r) => r.tag === row.tag)) {
        throw new Error('UNIQUE constraint failed: alliances.tag');
      }
    }
    if (tableName === 'alliance_members') {
      if (rows.some((r) => r.player_id === row.player_id && r.alliance_id === row.alliance_id)) {
        throw new Error('UNIQUE constraint failed: alliance_members PK');
      }
    }

    rows.push(row);
    return 1;
  }

  // ---- UPDATE ----

  function executeUpdate(sql: string, params: unknown[]): number {
    const tableM = sql.match(/\bUPDATE\s+(\w+)\s+SET/i);
    if (!tableM) return 0;
    const tableName = tableM[1];

    const setM = sql.match(/\bSET\s+([\s\S]+?)\s+WHERE\b/i);
    const whereM = sql.match(/\bWHERE\s+([\s\S]+?)(?:$)/i);
    if (!setM || !whereM) return 0;

    const setClause = setM[1].trim();
    const whereClause = whereM[1].trim();

    // Count placeholders in SET clause to determine param split
    const setPlaceholderCount = (setClause.match(/\?/g) ?? []).length;
    const setParams = params.slice(0, setPlaceholderCount);
    const whereParams = params.slice(setPlaceholderCount);

    const pred = makePredicate(whereClause, whereParams);
    let changes = 0;

    for (const row of db[tableName] ?? []) {
      if (!pred(row)) continue;

      let pIdx = 0;
      for (const assign of setClause.split(',').map((a) => a.trim())) {
        // col = col + ?  (increment by param)
        const incrParamM = assign.match(/^(\w+)\s*=\s*\w+\s*\+\s*\?$/i);
        if (incrParamM) {
          const col = incrParamM[1].toLowerCase();
          row[col] = Number(row[col] ?? 0) + Number(setParams[pIdx++]);
          continue;
        }
        // col = col + N  (increment by literal number, e.g. member_count = member_count + 1)
        const incrLitM = assign.match(/^(\w+)\s*=\s*\w+\s*\+\s*(\d+)$/i);
        if (incrLitM) {
          const col = incrLitM[1].toLowerCase();
          row[col] = Number(row[col] ?? 0) + Number(incrLitM[2]);
          continue;
        }
        // col = col - ?  (decrement by param)
        const decrM = assign.match(/^(\w+)\s*=\s*\w+\s*-\s*\?$/i);
        if (decrM) {
          const col = decrM[1].toLowerCase();
          row[col] = Number(row[col] ?? 0) - Number(setParams[pIdx++]);
          continue;
        }
        // col = col - N  (decrement by literal number)
        const decrLitM = assign.match(/^(\w+)\s*=\s*\w+\s*-\s*(\d+)$/i);
        if (decrLitM) {
          const col = decrLitM[1].toLowerCase();
          row[col] = Number(row[col] ?? 0) - Number(decrLitM[2]);
          continue;
        }
        // col = NULL
        const nullM = assign.match(/^(\w+)\s*=\s*NULL$/i);
        if (nullM) {
          row[nullM[1].toLowerCase()] = null;
          continue;
        }
        // col = 'literal'
        const litM = assign.match(/^(\w+)\s*=\s*'([^']*)'$/);
        if (litM) {
          row[litM[1].toLowerCase()] = litM[2];
          continue;
        }
        // col = ?
        const eqM = assign.match(/^(\w+)\s*=\s*\?$/);
        if (eqM) {
          row[eqM[1].toLowerCase()] = setParams[pIdx++];
          continue;
        }
      }
      changes++;
    }
    return changes;
  }

  // ---- DELETE ----

  function executeDelete(sql: string, params: unknown[]): number {
    const tableM = sql.match(/\bDELETE\s+FROM\s+(\w+)/i);
    if (!tableM) return 0;
    const tableName = tableM[1];
    const rows = db[tableName];
    if (!rows) return 0;

    // WHERE col IN (SELECT sub_col FROM sub_table WHERE …)
    const inSubM = sql.match(
      /\bWHERE\s+(\w+)\s+IN\s*\(\s*SELECT\s+(\w+)\s+FROM\s+(\w+)(?:\s+WHERE\s+([\s\S]+?))?\s*\)/i,
    );
    if (inSubM) {
      const [, outerCol, subCol, subTable, subWhere] = inSubM;
      let subRows = db[subTable] ?? [];
      if (subWhere) {
        const pred = makePredicate(subWhere.trim(), params);
        subRows = subRows.filter(pred);
      }
      const ids = new Set(subRows.map((r) => r[subCol.toLowerCase()]));
      const before = rows.length;
      db[tableName] = rows.filter((r) => !ids.has(r[outerCol.toLowerCase()]));
      return before - db[tableName].length;
    }

    const whereM = sql.match(/\bWHERE\s+([\s\S]+?)(?:$)/i);
    if (!whereM) return 0;

    const pred = makePredicate(whereM[1].trim(), params);
    const before = rows.length;
    db[tableName] = rows.filter((r) => !pred(r));
    return before - db[tableName].length;
  }

  // ---- Statement builder ----

  function makeStatement(sql: string, params: unknown[]) {
    const upper = sql.trimStart().toUpperCase();

    const run = () => {
      let changes = 0;
      if (upper.startsWith('INSERT')) changes = executeInsert(sql, params);
      else if (upper.startsWith('UPDATE')) changes = executeUpdate(sql, params);
      else if (upper.startsWith('DELETE')) changes = executeDelete(sql, params);
      return { meta: { changes } };
    };

    const first = <T = Row>(): T | null => {
      const rows = executeSelect(sql, params);
      return (rows[0] as T) ?? null;
    };

    const all = <T = Row>() => ({
      results: executeSelect(sql, params) as T[],
    });

    return { run, first, all };
  }

  // ---- D1Database-shaped proxy ----
  const mock = {
    prepare(sql: string) {
      let _params: unknown[] = [];
      const stmt = {
        bind(...p: unknown[]) { _params = p; return stmt; },
        run()            { return makeStatement(sql, _params).run(); },
        first<T = Row>() { return makeStatement(sql, _params).first<T>(); },
        all<T = Row>()   { return makeStatement(sql, _params).all<T>(); },
      };
      return stmt;
    },
  } as unknown as D1Database;

  return mock;
}

// ============================================================================
// SEED HELPERS
// ============================================================================

function seedPlayers(db: D1Database, players: { id: string; name: string }[]): void {
  for (const p of players) {
    db.prepare('INSERT INTO players (id, name) VALUES (?, ?)').bind(p.id, p.name).run();
  }
}

// ============================================================================
// TEST SUITE
// ============================================================================

describe('Alliance System', () => {
  let db: D1Database;

  beforeEach(() => {
    db = makeDb();
    seedPlayers(db, [
      { id: 'p1', name: 'Alice' },
      { id: 'p2', name: 'Bob' },
      { id: 'p3', name: 'Carol' },
      { id: 'p4', name: 'Dave' },
    ]);
  });

  // --------------------------------------------------------------------------
  // CREATE ALLIANCE
  // --------------------------------------------------------------------------

  describe('createAlliance', () => {
    test('creates alliance with valid inputs', async () => {
      const alliance = await createAlliance('p1', 'Star Empire', 'SEM', 'We rule stars', db);

      expect(alliance.id).toMatch(/^alliance-/);
      expect(alliance.name).toBe('Star Empire');
      expect(alliance.tag).toBe('SEM');
      expect(alliance.founderId).toBe('p1');
      expect(alliance.memberCount).toBe(1);
      expect(alliance.createdAt).toBeGreaterThan(0);
    });

    test('normalises tag to uppercase', async () => {
      const alliance = await createAlliance('p1', 'Lower Tag', 'abc', '', db);
      expect(alliance.tag).toBe('ABC');
    });

    test('rejects name shorter than 3 chars', async () => {
      await expect(createAlliance('p1', 'AB', 'ABC', '', db)).rejects.toThrow('3–32 characters');
    });

    test('rejects tag shorter than 3 chars', async () => {
      await expect(createAlliance('p1', 'Valid Name', 'AB', '', db)).rejects.toThrow('3–8 uppercase');
    });

    test('rejects tag longer than 8 chars', async () => {
      await expect(
        createAlliance('p1', 'Valid Name', 'TOOLONGTAG', '', db),
      ).rejects.toThrow('3–8 uppercase');
    });

    test('rejects tag with special characters', async () => {
      await expect(
        createAlliance('p1', 'Valid Name', 'AB!', '', db),
      ).rejects.toThrow('3–8 uppercase');
    });

    test('throws if player does not exist', async () => {
      await expect(
        createAlliance('nobody', 'Orphan', 'ORP', '', db),
      ).rejects.toThrow('Player not found');
    });

    test('throws if player already in an alliance', async () => {
      await createAlliance('p1', 'First', 'FRS', '', db);
      await expect(createAlliance('p1', 'Second', 'SND', '', db)).rejects.toThrow(
        'already a member',
      );
    });

    test('founder is automatically added as member with founder role', async () => {
      const alliance = await createAlliance('p1', 'Star Empire', 'SEM', '', db);
      const members = await getAllianceMembers(alliance.id, db);

      expect(members).toHaveLength(1);
      expect(members[0].playerId).toBe('p1');
      expect(members[0].role).toBe('founder');
    });
  });

  // --------------------------------------------------------------------------
  // DISSOLVE ALLIANCE
  // --------------------------------------------------------------------------

  describe('dissolveAlliance', () => {
    test('founder can dissolve alliance', async () => {
      const alliance = await createAlliance('p1', 'Doomed', 'DMD', '', db);
      await dissolveAlliance(alliance.id, 'p1', db);

      const row = await db
        .prepare('SELECT id FROM alliances WHERE id = ?')
        .bind(alliance.id)
        .first();
      expect(row).toBeNull();
    });

    test('non-founder cannot dissolve', async () => {
      const alliance = await createAlliance('p1', 'Protected', 'PRT', '', db);
      await expect(dissolveAlliance(alliance.id, 'p2', db)).rejects.toThrow('Only the founder');
    });

    test('throws for unknown alliance id', async () => {
      await expect(dissolveAlliance('fake-id', 'p1', db)).rejects.toThrow('not found');
    });

    test('removes all members on dissolution', async () => {
      const alliance = await createAlliance('p1', 'Fleeting', 'FLT', '', db);
      await applyToAlliance('p2', alliance.id, '', db);
      await acceptApplication(alliance.id, 'p2', 'p1', db);

      await dissolveAlliance(alliance.id, 'p1', db);

      const members = await db
        .prepare('SELECT * FROM alliance_members WHERE alliance_id = ?')
        .bind(alliance.id)
        .all();
      expect(members.results).toHaveLength(0);
    });
  });

  // --------------------------------------------------------------------------
  // APPLICATION FLOW
  // --------------------------------------------------------------------------

  describe('applyToAlliance / acceptApplication / rejectApplication', () => {
    let allianceId: string;

    beforeEach(async () => {
      const a = await createAlliance('p1', 'Test Alliance', 'TST', '', db);
      allianceId = a.id;
    });

    test('player can apply', async () => {
      const app = await applyToAlliance('p2', allianceId, 'Please accept me', db);
      expect(app.playerId).toBe('p2');
      expect(app.allianceId).toBe(allianceId);
      expect(app.message).toBe('Please accept me');
    });

    test('duplicate application is rejected', async () => {
      await applyToAlliance('p2', allianceId, '', db);
      await expect(applyToAlliance('p2', allianceId, '', db)).rejects.toThrow(
        'already has a pending application',
      );
    });

    test('founder can accept application', async () => {
      await applyToAlliance('p2', allianceId, '', db);
      const member = await acceptApplication(allianceId, 'p2', 'p1', db);
      expect(member.role).toBe('member');
      expect(member.playerId).toBe('p2');
    });

    test('officer can accept application', async () => {
      // p2 joins and is promoted to officer
      await applyToAlliance('p2', allianceId, '', db);
      await acceptApplication(allianceId, 'p2', 'p1', db);
      await promoteToOfficer(allianceId, 'p2', 'p1', db);

      // p3 applies, officer p2 accepts
      await applyToAlliance('p3', allianceId, '', db);
      const member = await acceptApplication(allianceId, 'p3', 'p2', db);
      expect(member.role).toBe('member');
    });

    test('plain member cannot accept application', async () => {
      await applyToAlliance('p2', allianceId, '', db);
      await acceptApplication(allianceId, 'p2', 'p1', db);

      await applyToAlliance('p3', allianceId, '', db);
      await expect(acceptApplication(allianceId, 'p3', 'p2', db)).rejects.toThrow(
        'Only officers or founders',
      );
    });

    test('founder can reject application', async () => {
      await applyToAlliance('p2', allianceId, '', db);
      await rejectApplication(allianceId, 'p2', 'p1', db);

      const apps = await db
        .prepare('SELECT * FROM alliance_applications WHERE player_id = ?')
        .bind('p2')
        .all();
      expect(apps.results).toHaveLength(0);
    });

    test('rejecting non-existent application throws', async () => {
      await expect(rejectApplication(allianceId, 'p2', 'p1', db)).rejects.toThrow(
        'Application not found',
      );
    });

    test('member_count increases when application is accepted', async () => {
      await applyToAlliance('p2', allianceId, '', db);
      await acceptApplication(allianceId, 'p2', 'p1', db);

      const row = await db
        .prepare('SELECT member_count FROM alliances WHERE id = ?')
        .bind(allianceId)
        .first<{ member_count: number }>();
      expect(row?.member_count).toBe(2);
    });

    test('application is removed after acceptance', async () => {
      await applyToAlliance('p2', allianceId, '', db);
      await acceptApplication(allianceId, 'p2', 'p1', db);

      const apps = await getAllianceApplications(allianceId, db);
      expect(apps.map((a) => a.playerId)).not.toContain('p2');
    });
  });

  // --------------------------------------------------------------------------
  // KICK & LEAVE
  // --------------------------------------------------------------------------

  describe('kickMember / leaveAlliance', () => {
    let allianceId: string;

    beforeEach(async () => {
      const a = await createAlliance('p1', 'Kick Test', 'KCK', '', db);
      allianceId = a.id;
      await applyToAlliance('p2', allianceId, '', db);
      await acceptApplication(allianceId, 'p2', 'p1', db);
    });

    test('founder can kick a member', async () => {
      await kickMember(allianceId, 'p2', 'p1', db);

      const members = await getAllianceMembers(allianceId, db);
      expect(members.map((m) => m.playerId)).not.toContain('p2');
    });

    test('officer can kick a regular member', async () => {
      await promoteToOfficer(allianceId, 'p2', 'p1', db);

      await applyToAlliance('p3', allianceId, '', db);
      await acceptApplication(allianceId, 'p3', 'p1', db);

      await kickMember(allianceId, 'p3', 'p2', db);

      const members = await getAllianceMembers(allianceId, db);
      expect(members.map((m) => m.playerId)).not.toContain('p3');
    });

    test('officer cannot kick founder', async () => {
      await promoteToOfficer(allianceId, 'p2', 'p1', db);
      await expect(kickMember(allianceId, 'p1', 'p2', db)).rejects.toThrow('Cannot kick');
    });

    test('plain member cannot kick anyone', async () => {
      await applyToAlliance('p3', allianceId, '', db);
      await acceptApplication(allianceId, 'p3', 'p1', db);

      await expect(kickMember(allianceId, 'p3', 'p2', db)).rejects.toThrow(
        'Only officers or founders',
      );
    });

    test('member_count decreases after kick', async () => {
      await kickMember(allianceId, 'p2', 'p1', db);
      const row = await db
        .prepare('SELECT member_count FROM alliances WHERE id = ?')
        .bind(allianceId)
        .first<{ member_count: number }>();
      expect(row?.member_count).toBe(1);
    });

    test('member can leave alliance', async () => {
      await leaveAlliance('p2', allianceId, db);
      const members = await getAllianceMembers(allianceId, db);
      expect(members.map((m) => m.playerId)).not.toContain('p2');
    });

    test('founder cannot leave (must dissolve instead)', async () => {
      await expect(leaveAlliance('p1', allianceId, db)).rejects.toThrow('Founder cannot leave');
    });

    test('applicant can withdraw application via leaveAlliance', async () => {
      await applyToAlliance('p3', allianceId, '', db);
      await leaveAlliance('p3', allianceId, db);

      const apps = await db
        .prepare('SELECT * FROM alliance_applications WHERE player_id = ?')
        .bind('p3')
        .all();
      expect(apps.results).toHaveLength(0);
    });
  });

  // --------------------------------------------------------------------------
  // ROLE HIERARCHY — PROMOTE / DEMOTE
  // --------------------------------------------------------------------------

  describe('promoteToOfficer / demoteToMember', () => {
    let allianceId: string;

    beforeEach(async () => {
      const a = await createAlliance('p1', 'Promo Test', 'PRO', '', db);
      allianceId = a.id;
      await applyToAlliance('p2', allianceId, '', db);
      await acceptApplication(allianceId, 'p2', 'p1', db);
    });

    test('founder can promote member to officer', async () => {
      const updated = await promoteToOfficer(allianceId, 'p2', 'p1', db);
      expect(updated.role).toBe('officer');
    });

    test('non-founder cannot promote', async () => {
      await applyToAlliance('p3', allianceId, '', db);
      await acceptApplication(allianceId, 'p3', 'p1', db);

      await expect(promoteToOfficer(allianceId, 'p3', 'p2', db)).rejects.toThrow(
        'Only the founder',
      );
    });

    test('cannot promote an officer again', async () => {
      await promoteToOfficer(allianceId, 'p2', 'p1', db);
      await expect(promoteToOfficer(allianceId, 'p2', 'p1', db)).rejects.toThrow(
        'Cannot promote',
      );
    });

    test('founder can demote officer to member', async () => {
      await promoteToOfficer(allianceId, 'p2', 'p1', db);
      const updated = await demoteToMember(allianceId, 'p2', 'p1', db);
      expect(updated.role).toBe('member');
    });

    test('non-founder cannot demote', async () => {
      await promoteToOfficer(allianceId, 'p2', 'p1', db);

      await applyToAlliance('p3', allianceId, '', db);
      await acceptApplication(allianceId, 'p3', 'p1', db);
      await promoteToOfficer(allianceId, 'p3', 'p1', db);

      await expect(demoteToMember(allianceId, 'p2', 'p3', db)).rejects.toThrow(
        'Only the founder',
      );
    });

    test('cannot demote a plain member', async () => {
      await expect(demoteToMember(allianceId, 'p2', 'p1', db)).rejects.toThrow(
        "member is 'member', not 'officer'",
      );
    });

    test('getAllianceMembers orders founder first, then officers, then members', async () => {
      await promoteToOfficer(allianceId, 'p2', 'p1', db);

      await applyToAlliance('p3', allianceId, '', db);
      await acceptApplication(allianceId, 'p3', 'p1', db);

      const members = await getAllianceMembers(allianceId, db);
      expect(members[0].role).toBe('founder');
      expect(members[1].role).toBe('officer');
      expect(members[2].role).toBe('member');
    });
  });

  // --------------------------------------------------------------------------
  // PLAYER ALLIANCE LOOKUP
  // --------------------------------------------------------------------------

  describe('getPlayerAlliance', () => {
    test('returns null when player has no alliance', async () => {
      const result = await getPlayerAlliance('p1', db);
      expect(result).toBeNull();
    });

    test('returns alliance and founder role', async () => {
      const alliance = await createAlliance('p1', 'Query Test', 'QRY', '', db);
      const result = await getPlayerAlliance('p1', db);

      expect(result).not.toBeNull();
      expect(result!.alliance.id).toBe(alliance.id);
      expect(result!.role).toBe('founder');
    });

    test('returns correct role for officer', async () => {
      const alliance = await createAlliance('p1', 'Roles Test', 'RLS', '', db);
      await applyToAlliance('p2', alliance.id, '', db);
      await acceptApplication(alliance.id, 'p2', 'p1', db);
      await promoteToOfficer(alliance.id, 'p2', 'p1', db);

      const result = await getPlayerAlliance('p2', db);
      expect(result!.role).toBe('officer');
    });

    test('returns null for player with only a pending application', async () => {
      const alliance = await createAlliance('p1', 'Pending Test', 'PDT', '', db);
      await applyToAlliance('p2', alliance.id, '', db);

      // applicant role is excluded by getPlayerAlliance
      const result = await getPlayerAlliance('p2', db);
      expect(result).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // SEARCH
  // --------------------------------------------------------------------------

  describe('searchAlliances', () => {
    beforeEach(async () => {
      await createAlliance('p1', 'Dark Matter', 'DKM', '', db);
      await createAlliance('p2', 'Star Wolves', 'STW', '', db);
      await createAlliance('p3', 'Dark Riders', 'DRD', '', db);
    });

    test('finds alliances by name substring', async () => {
      const results = await searchAlliances('Dark', db);
      expect(results.length).toBe(2);
      const names = results.map((r) => r.name);
      expect(names).toContain('Dark Matter');
      expect(names).toContain('Dark Riders');
    });

    test('finds alliances by tag', async () => {
      const results = await searchAlliances('STW', db);
      expect(results.some((r) => r.name === 'Star Wolves')).toBe(true);
    });

    test('returns empty array for no matches', async () => {
      const results = await searchAlliances('Zzzzzzz', db);
      expect(results).toHaveLength(0);
    });

    test('throws for empty query', async () => {
      await expect(searchAlliances('', db)).rejects.toThrow('not be empty');
    });

    test('search results include name, tag, memberCount fields', async () => {
      const results = await searchAlliances('Dark Matter', db);
      const dm = results.find((r) => r.name === 'Dark Matter');
      expect(dm).toBeDefined();
      expect(dm!.tag).toBe('DKM');
      expect(typeof dm!.memberCount).toBe('number');
    });
  });
});
