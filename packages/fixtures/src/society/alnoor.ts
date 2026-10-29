import type { Beneficiary, ChargeCategoryKey, FlatImportColumn, MethodRule, RuleScope } from '@repo/contracts';
import { FIRST_NAMES, LAST_NAMES, URDU_NAMES } from '../names';
import { pad } from '../seed';

/**
 * Al-Noor Residency (Demo): the Gate C society (A7 §C.2). Entirely fictional. One site, Block A and
 * Block B, five floors of eight flats each (A-101 … B-508). The top floor of each block is the
 * Penthouse type. 63 flats are owner-occupied, 12 rented, 4 vacant and A-108 is the association's
 * office: registered 80, occupied 76, eligible 80, invoiced 79 (A-108 is exempt).
 *
 * The flat register below is the society's own spreadsheet. The demo either starts with it imported
 * ("ready") or empty, so the building manager imports it from the sample file ("fresh"); both paths
 * build the same model from the same rows (`model.ts`).
 */
export const ALNOOR = { id: 'tnt_alnoor', name: 'Al-Noor Residency (Demo)' } as const;
export const ALNOOR_SITE = { id: 'site_alnoor', name: 'Al-Noor Residency', city: 'Lahore', declaredFlats: 80 } as const;
export const ALNOOR_ENTITY = { id: 'le_alnoor', name: 'Al-Noor Residency Owners’ Association (Demo)' } as const;
/** The association's short code at this site: the numbering scheme's {code} (configurable, never hard-coded in engines). */
export const ALNOOR_CODE = 'ANR';

/** The society's staff in the demo (principal ids decide maker-checker, never names). */
export const ALNOOR_STAFF = {
  manager: { principalId: 'usr_anr_0001', name: 'Imran Qureshi' },
  treasurer: { principalId: 'usr_anr_0002', name: 'Ayesha Malik' },
  guard: { principalId: 'usr_anr_0003', name: 'Shahid Hussain' },
  accounts: { principalId: 'usr_anr_0004', name: 'Saba Javed' },
} as const;

export const BLOCKS = ['A', 'B'] as const;
export const FLOORS = 5;
export const FLATS_PER_FLOOR = 8;

/** The first period billed in PropertyOS (the society went live in October 2026). */
export const FIRST_PERIOD = '2026-11';
export const ISSUE_DAY = 1;
export const DUE_DAY = 10;
/** Balances carried over from the committee's old register. */
export const OPENING_AS_OF = '2026-10-20';
/** When the register was imported in the "ready" demo. */
export const IMPORTED_AT = '2026-10-15T10:30:00Z';

export const UNIT_TYPES = [
  { id: 'utp_anr_standard', code: 'standard', name: 'Standard', areaSqft: 1150 },
  { id: 'utp_anr_penthouse', code: 'penthouse', name: 'Penthouse', areaSqft: 2200 },
] as const;

/** One row of the society's flat register, as text (the CSV columns, A4 §1 step 3–4). */
export type FlatRow = Record<FlatImportColumn, string>;

export const OFFICE_FLAT = 'A-108';
const RENTED = ['A-102', 'A-202', 'A-306', 'A-404', 'A-503', 'B-105', 'B-204', 'B-301', 'B-307', 'B-402', 'B-406', 'B-505'];
/** Rented flats whose tenant pays (8 of 12); the owners of the other four still pay. */
const TENANT_PAYS = ['A-102', 'A-202', 'A-306', 'A-404', 'B-105', 'B-301', 'B-402', 'B-505'];
const VACANT = ['A-407', 'B-203', 'B-308', 'B-507'];

/** People the storyline names (A7 §C.3): kept stable so tests and the guided tour can rely on them. */
const NAMED: Record<string, Partial<FlatRow>> = {
  'A-101': { owner_name: 'Kamran Siddiqui', owner_since: '2017-04-01' },
  // A-102: owner Mr Tariq Mehmood; occupant and payer Ms Sana Iqbal since March 2026 (I-4).
  'A-102': { owner_name: 'Tariq Mehmood', owner_since: '2019-06-01', occupant_name: 'Sana Iqbal', occupant_since: '2026-03-01' },
  // One owner, two flats, one account; A-202 is rented and its tenant pays for A-202 only (A2 §4.5).
  'A-201': { owner_name: 'Rabia Hashmi', owner_since: '2018-09-01', account: 'ANR-A201' },
  'A-202': { owner_name: 'Rabia Hashmi', owner_since: '2020-02-01', occupant_name: 'Junaid Akhtar', occupant_since: '2025-08-01', account: 'ANR-A201' },
  // Rented, owner pays today; the storyline moves liability to the tenant from November.
  'B-204': { owner_name: 'Faisal Chaudhry', owner_since: '2016-11-01', occupant_name: 'Hina Rana', occupant_since: '2025-05-01' },
};

export const flatCodes = (): string[] => BLOCKS.flatMap((b) => Array.from({ length: FLOORS }, (_, f) => Array.from({ length: FLATS_PER_FLOOR }, (_, n) => `${b}-${f + 1}${pad(n + 1, 2)}`)).flat());

const phoneOf = (n: number) => `+923995${pad(100000 + n * 389, 6)}`;

/** A deterministic, unique fictional name for the k-th generated person. */
function nameGenerator(reserved: Iterable<string>) {
  const used = new Set(reserved);
  let k = 0;
  return () => {
    for (;;) {
      k += 1;
      const urdu = k % 9 === 4 ? URDU_NAMES[Math.floor(k / 9) % URDU_NAMES.length] : undefined;
      const name = urdu ?? `${FIRST_NAMES[(k * 7 + 3) % FIRST_NAMES.length]} ${LAST_NAMES[(k * 11 + 5) % LAST_NAMES.length]}`;
      if (!used.has(name)) {
        used.add(name);
        return name;
      }
    }
  };
}

/** The society's register, flat by flat (80 rows). Same input, same rows, every time. */
export function alnoorRegister(): FlatRow[] {
  const reserved = Object.values(NAMED).flatMap((r) => [r.owner_name, r.occupant_name].filter((s): s is string => !!s));
  const nextName = nameGenerator(reserved);
  const phones = new Map<string, string>();
  const phone = (name: string) => {
    if (!phones.has(name)) phones.set(name, phoneOf(phones.size + 1));
    return phones.get(name)!;
  };
  phone(ALNOOR_ENTITY.name);
  return flatCodes().map((code, i) => {
    const [block, rest] = code.split('-') as [string, string];
    const floor = Number(rest[0]);
    const position = Number(rest.slice(1));
    const penthouse = floor === FLOORS;
    const corner = position === 1 || position === FLATS_PER_FLOOR;
    const named = NAMED[code] ?? {};
    const office = code === OFFICE_FLAT;
    const rented = RENTED.includes(code);
    const ownerName = office ? ALNOOR_ENTITY.name : (named.owner_name ?? nextName());
    const occupantName = rented ? (named.occupant_name ?? nextName()) : '';
    return {
      flat: code,
      block,
      floor: String(floor),
      type: penthouse ? 'Penthouse' : 'Standard',
      area_sqft: String(penthouse ? (corner ? 2400 : 2200) : corner ? 1250 : 1150),
      owner_name: ownerName,
      owner_phone: phone(ownerName),
      owner_since: named.owner_since ?? (office ? '2012-01-01' : `${2012 + ((i * 7) % 13)}-${pad(1 + ((i * 5) % 12), 2)}-01`),
      occupancy: office ? 'office' : rented ? 'tenant' : VACANT.includes(code) ? 'vacant' : 'owner',
      occupant_name: occupantName,
      occupant_phone: occupantName ? phone(occupantName) : '',
      occupant_since: rented ? (named.occupant_since ?? `2025-${pad(1 + ((i * 7) % 12), 2)}-01`) : '',
      payer: TENANT_PAYS.includes(code) ? 'occupant' : 'owner',
      account: named.account ?? '',
    };
  });
}


export const FLAT_COLUMNS: readonly FlatImportColumn[] = [
  'flat', 'block', 'floor', 'type', 'area_sqft', 'owner_name', 'owner_phone', 'owner_since',
  'occupancy', 'occupant_name', 'occupant_phone', 'occupant_since', 'payer', 'account',
];

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
export const toCsv = (columns: readonly string[], rows: ReadonlyArray<Record<string, string>>) =>
  [columns.join(','), ...rows.map((r) => columns.map((c) => csvCell(r[c] ?? '')).join(','))].join('\n');

/**
 * The sample file the building manager imports in the "fresh" demo: the register with three rows
 * that need fixing (a missing type, a zero area, a floor the block does not have) and two rows
 * repeated (one identical, one with a different phone). 82 rows, 80 flats.
 */
export function sampleFlatFile(): { fileName: string; content: string } {
  const rows: FlatRow[] = [];
  for (const row of alnoorRegister()) {
    if (row.flat === 'A-305') rows.push({ ...row, type: '' });
    else if (row.flat === 'B-207') rows.push({ ...row, area_sqft: '0' });
    else if (row.flat === 'B-406') rows.push({ ...row, floor: '6' });
    else rows.push(row);
    if (row.flat === 'A-206') rows.push({ ...row });
    if (row.flat === 'B-408') rows.push({ ...row, owner_phone: '+923995999001' });
  }
  return { fileName: 'al-noor-flat-register.csv', content: toCsv(FLAT_COLUMNS, rows) };
}

export const OPENING_COLUMNS = ['account', 'flat', 'amount', 'as_of'] as const;

/** Ten accounts in arrears at go-live (A7 §C.2), including A-101: PKR 1,000. Total PKR 49,100. */
export const OPENING_BALANCES: ReadonlyArray<{ account: string; flat: string; amount: string }> = [
  { account: 'ANR-A101', flat: 'A-101', amount: '1000.00' },
  { account: 'ANR-A201', flat: 'A-201', amount: '3000.00' },
  { account: 'ANR-A305', flat: 'A-305', amount: '4200.00' },
  { account: 'ANR-A404', flat: 'A-404', amount: '8400.00' },
  { account: 'ANR-A502', flat: 'A-502', amount: '6000.00' },
  { account: 'ANR-B102', flat: 'B-102', amount: '2500.00' },
  { account: 'ANR-B204', flat: 'B-204', amount: '4200.00' },
  { account: 'ANR-B306', flat: 'B-306', amount: '12600.00' },
  { account: 'ANR-B403', flat: 'B-403', amount: '1500.00' },
  { account: 'ANR-B501', flat: 'B-501', amount: '5700.00' },
];

export function sampleOpeningFile(): { fileName: string; content: string } {
  return {
    fileName: 'al-noor-opening-balances.csv',
    content: toCsv(OPENING_COLUMNS, OPENING_BALANCES.map((b) => ({ ...b, as_of: OPENING_AS_OF }))),
  };
}

/** Site defaults and the penthouse override (A4 §2), as the building manager sets them up. */
export const SEED_RULES: ReadonlyArray<{ ruleId: string; category: ChargeCategoryKey; scope: RuleScope; scopeName: string; amount: string }> = [
  { ruleId: 'rul_anr_maintenance', category: 'maintenance', scope: { level: 'site' }, scopeName: ALNOOR_SITE.name, amount: '3000.00' },
  { ruleId: 'rul_anr_security', category: 'security', scope: { level: 'site' }, scopeName: ALNOOR_SITE.name, amount: '500.00' },
  { ruleId: 'rul_anr_lift', category: 'lift', scope: { level: 'site' }, scopeName: ALNOOR_SITE.name, amount: '300.00' },
  { ruleId: 'rul_anr_water', category: 'water', scope: { level: 'site' }, scopeName: ALNOOR_SITE.name, amount: '400.00' },
  { ruleId: 'rul_anr_maintenance_ph', category: 'maintenance', scope: { level: 'unit_type', id: 'utp_anr_penthouse' }, scopeName: 'Penthouse', amount: '4500.00' },
];

export const OFFICE_EXEMPTION_REASON = 'Association office (committee resolution 7/2026)';

/** The association's verified collection account (fictional bank code DEMO; I-15: never the platform's). */
export const ALNOOR_PAYEE: Beneficiary = {
  id: 'ben_anr_main',
  siteId: ALNOOR_SITE.id,
  legalEntityId: ALNOOR_ENTITY.id,
  legalEntityName: ALNOOR_ENTITY.name,
  bankName: 'Demo Bank',
  branch: 'Gulberg, Lahore',
  accountTitle: ALNOOR_ENTITY.name,
  iban: 'PK36DEMO0000001234567890',
  referenceFormat: 'ANR-{flat}-{period}',
  status: 'verified',
  verifiedOn: '2026-10-09',
  activeFrom: '2026-10-12',
};

/** The committee's old account, retired when the association's own account took over (12 Oct). */
export const ALNOOR_OLD_PAYEE: Beneficiary = {
  id: 'ben_anr_committee',
  siteId: ALNOOR_SITE.id,
  legalEntityId: ALNOOR_ENTITY.id,
  legalEntityName: ALNOOR_ENTITY.name,
  bankName: 'Demo Bank',
  branch: 'Model Town, Lahore',
  accountTitle: 'Al-Noor Residency Welfare Committee (Demo)',
  iban: 'PK70DEMO0000000987654321',
  referenceFormat: 'ANR-{flat}-{period}',
  status: 'retired',
  verifiedOn: '2024-01-15',
  activeFrom: '2024-01-15',
  activeTo: '2026-10-12',
};

/** Days between approving a new collection account and residents being shown it (D-13). */
export const COOLING_OFF_DAYS = 3;

/** Method rules at go-live: transfers only; office cash allowed only once the committee turns it on. */
export const ALNOOR_METHODS: MethodRule[] = [
  { method: 'bank_transfer', enabled: true },
  { method: 'office_cash', enabled: false, maxAmount: { amount: '50000.00', currency: 'PKR' }, counter: 'Society office, Block A ground floor · Mon–Sat 10:00–17:00' },
  { method: 'cheque', enabled: false, gate: 'E' },
  { method: 'online', enabled: false, gate: 'D' },
];
