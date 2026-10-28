import type { ImportProblem, ImportRow } from '@repo/contracts';
import { FLATS_PER_FLOOR, FLOORS, FLAT_COLUMNS, OPENING_COLUMNS, type FlatRow } from './alnoor';
import { BUILDINGS, typeByName } from './model';

/**
 * CSV import validation (A4 §1 step 3 and 5): every invalid and duplicate row is listed with its
 * reason, nothing is merged silently, and a commit is all-or-nothing. Pure functions; the mock
 * server keeps the import session, so a language switch or reload keeps the work.
 */

/** FNV-1a, 2 × 32 bits: a stable fingerprint for files and idempotency keys (not cryptographic). */
export function fingerprint(text: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x5bd1e995) >>> 0;
  }
  return `${a.toString(16).padStart(8, '0')}${b.toString(16).padStart(8, '0')}`;
}

/** RFC 4180 CSV (quoted fields, doubled quotes, CRLF or LF). The first line is the header. */
export function parseCsv(text: string): { header: string[]; lines: Array<{ line: number; cells: string[] }> } {
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const records: Array<{ line: number; cells: string[] }> = [];
  let cells: string[] = [];
  let field = '';
  let quoted = false;
  let line = 1;
  let start = 1;
  const end = () => {
    cells.push(field);
    if (cells.some((c) => c.trim() !== '')) records.push({ line: start, cells });
    cells = [];
    field = '';
  };
  for (let i = 0; i < body.length; i++) {
    const c = body[i]!;
    if (quoted) {
      if (c === '"' && body[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else {
        if (c === '\n') line++;
        field += c;
      }
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      cells.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && body[i + 1] === '\n') i++;
      end();
      line++;
      start = line;
    } else field += c;
  }
  if (field !== '' || cells.length) end();
  const [header, ...rest] = records;
  return { header: (header?.cells ?? []).map((h) => h.trim().toLowerCase()), lines: rest };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const PHONE = /^\+92\d{10}$/;
const CODE = /^([A-Z])-(\d)(\d{2})$/;

/** Records keyed by column (missing columns read as empty). */
export function rowsOf(text: string, columns: readonly string[]): { missing: string[]; rows: Array<{ line: number; values: Record<string, string> }> } {
  const { header, lines } = parseCsv(text);
  const missing = columns.filter((c) => !header.includes(c));
  return {
    missing,
    rows: lines.map(({ line, cells }) => ({ line, values: Object.fromEntries(columns.map((c) => [c, (cells[header.indexOf(c)] ?? '').trim()])) })),
  };
}

/**
 * Validate flat register rows against the site's structure and the flats already registered.
 * Duplicates (same flat code) are flagged against the first row, or 'existing' when the flat is
 * already registered; an existing flat is never changed by an import.
 */
export function validateFlats(rows: ReadonlyArray<{ line: number; values: Record<string, string> }>, existing: ReadonlySet<string>, today: string): ImportRow[] {
  const firstLine = new Map<string, number>();
  const result: ImportRow[] = rows.map(({ line, values }) => {
    const code = values.flat ?? '';
    const problems: ImportProblem[] = [];
    const suggestion: Record<string, string> = {};
    const add = (column: string, problem: string) => problems.push({ column, code: problem });

    if (existing.has(code)) return { line, values, status: 'duplicate', problems: [], duplicateOf: 'existing' };
    if (firstLine.has(code)) return { line, values, status: 'duplicate', problems: [], duplicateOf: firstLine.get(code)! };
    if (code) firstLine.set(code, line);

    const m = CODE.exec(code);
    const building = BUILDINGS.find((b) => b.code === values.block);
    if (!code) add('flat', 'required');
    else if (!m) add('flat', 'flatFormat');
    else if (Number(m[3]) < 1 || Number(m[3]) > FLATS_PER_FLOOR || Number(m[2]) < 1 || Number(m[2]) > FLOORS) add('flat', 'flatPosition');
    if (!values.block) add('block', 'required');
    else if (!building) add('block', 'blockUnknown');
    else if (m && m[1] !== values.block) add('block', 'blockMismatch');

    const floor = Number(values.floor);
    if (!values.floor) add('floor', 'required');
    else if (!Number.isInteger(floor) || floor < 1 || floor > (building?.floors ?? FLOORS)) {
      add('floor', 'floorUnknown');
      if (m) suggestion.floor = m[2]!;
    } else if (m && Number(m[2]) !== floor) {
      add('floor', 'floorMismatch');
      suggestion.floor = m[2]!;
    }

    if (!values.type) {
      add('type', 'required');
      if (m) suggestion.type = Number(m[2]) === FLOORS ? 'Penthouse' : 'Standard';
    } else if (!typeByName(values.type)) add('type', 'typeUnknown');

    const area = Number(values.area_sqft);
    if (!values.area_sqft) add('area_sqft', 'required');
    else if (!Number.isFinite(area) || area <= 0) {
      add('area_sqft', 'areaPositive');
      const t = typeByName(values.type ?? '') ?? (m && Number(m[2]) === FLOORS ? typeByName('Penthouse') : typeByName('Standard'));
      if (t) suggestion.area_sqft = String(t.areaSqft);
    }

    if (!values.owner_name) add('owner_name', 'required');
    if (!values.owner_phone) add('owner_phone', 'required');
    else if (!PHONE.test(values.owner_phone)) add('owner_phone', 'phoneFormat');
    if (!DATE.test(values.owner_since ?? '')) add('owner_since', 'dateFormat');
    else if (values.owner_since! > today) add('owner_since', 'dateFuture');

    const occupancy = values.occupancy;
    if (!['owner', 'tenant', 'vacant', 'office'].includes(occupancy ?? '')) add('occupancy', 'occupancyUnknown');
    if (occupancy === 'tenant') {
      if (!values.occupant_name) add('occupant_name', 'required');
      if (!values.occupant_phone) add('occupant_phone', 'required');
      else if (!PHONE.test(values.occupant_phone)) add('occupant_phone', 'phoneFormat');
      if (!DATE.test(values.occupant_since ?? '')) add('occupant_since', 'dateFormat');
      else if (values.occupant_since! > today) add('occupant_since', 'dateFuture');
    }
    if (!['owner', 'occupant'].includes(values.payer ?? '')) add('payer', 'payerUnknown');
    else if (values.payer === 'occupant' && occupancy === 'vacant') add('payer', 'payerVacant');
    if (values.account && !/^ANR-[A-Z0-9]+$/.test(values.account)) add('account', 'accountFormat');

    return { line, values, status: problems.length ? 'error' : 'valid', problems, ...(Object.keys(suggestion).length ? { suggestion } : {}) };
  });

  // One account, one holder: rows that share an account number must name the same owner.
  const holders = new Map<string, string>();
  for (const r of result) {
    if (r.status === 'duplicate' || !r.values.account) continue;
    const owner = r.values.owner_phone ?? '';
    const holder = holders.get(r.values.account);
    if (holder === undefined) holders.set(r.values.account, owner);
    else if (holder !== owner) {
      r.problems.push({ column: 'account', code: 'accountHolder' });
      r.status = 'error';
    }
  }
  return result;
}

/** The register rows of an import that may be committed (valid, not duplicated). */
export const committable = (rows: readonly ImportRow[]): FlatRow[] =>
  rows.filter((r) => r.status === 'valid').map((r) => Object.fromEntries(FLAT_COLUMNS.map((c) => [c, r.values[c] ?? ''])) as FlatRow);

const AMOUNT = /^\d{1,12}(\.\d{1,2})?$/;

/** Opening balances: the account exists, the flat is on it, the amount is positive money. */
export function validateOpening(
  rows: ReadonlyArray<{ line: number; values: Record<string, string> }>,
  accounts: ReadonlyMap<string, readonly string[]>,
  asOf: string,
): ImportRow[] {
  const seen = new Map<string, number>();
  return rows.map(({ line, values }) => {
    const problems: ImportProblem[] = [];
    const key = `${values.account}|${values.flat}`;
    if (seen.has(key)) return { line, values, status: 'duplicate', problems, duplicateOf: seen.get(key)! };
    seen.set(key, line);
    const flats = accounts.get(values.account ?? '');
    if (!values.account) problems.push({ column: 'account', code: 'required' });
    else if (!flats) problems.push({ column: 'account', code: 'accountUnknown' });
    if (flats && !flats.includes(values.flat ?? '')) problems.push({ column: 'flat', code: 'flatNotOnAccount' });
    if (!AMOUNT.test(values.amount ?? '') || Number(values.amount) <= 0) problems.push({ column: 'amount', code: 'amountFormat' });
    if (values.as_of !== asOf) problems.push({ column: 'as_of', code: 'asOfDate' });
    return { line, values, status: problems.length ? 'error' : 'valid', problems };
  });
}

export { FLAT_COLUMNS, OPENING_COLUMNS };
