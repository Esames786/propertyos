import type { Party, Persona } from '@repo/contracts';
import { tenantRole } from './role-templates';
import { createRandom, pad } from './seed';

/**
 * Entirely fictional people and companies. Rules (enforced by fixtures.test.ts):
 * - mobile numbers use the unallocated +92 399 prefix;
 * - CNICs start with 9 (not a province code);
 * - e-mail domains are RFC 2606 example.com.
 */
export const TENANT = { id: 'tnt_larkspur', name: 'Larkspur Estates (Demo)' } as const;
/** The owner's maintenance-only client (see tenant-directory.ts). */
export const SHALIMAR = { id: 'tnt_shalimar', name: 'Shalimar Court Residents (Demo)' } as const;
/** A developer with two sites licensed differently (CP2 security correction 2). */
export const CRESCENT_BAY = { id: 'tnt_crescent', name: 'Crescent Bay Developers (Demo)' } as const;
/** A suspended co-operative: financial history readable, everything else paused (CP2 correction 4). */
export const CEDAR_HILLS = { id: 'tnt_cedar', name: 'Cedar Hills Co-operative (Demo)' } as const;

const FIRST_NAMES = [
  'Ahmed', 'Bilal', 'Faisal', 'Hamza', 'Imran', 'Kamran', 'Omar', 'Saad', 'Usman', 'Zain',
  'Adeel', 'Haris', 'Junaid', 'Shahid', 'Waqar', 'Ayesha', 'Fatima', 'Hina', 'Iqra', 'Mahnoor',
  'Maryam', 'Nida', 'Rabia', 'Sana', 'Zara', 'Amna', 'Saba', 'Komal', 'Mehwish', 'Sadia',
] as const;
const LAST_NAMES = [
  'Khan', 'Malik', 'Qureshi', 'Siddiqui', 'Butt', 'Chaudhry', 'Sheikh', 'Raza', 'Hussain',
  'Akhtar', 'Javed', 'Iqbal', 'Rana', 'Mirza', 'Abbasi', 'Hashmi',
] as const;
/** Some customers' names were entered in Urdu script; free text is never transliterated. */
const URDU_NAMES = [
  'عائشہ ملک', 'حمزہ قریشی', 'مریم صدیقی', 'عمر خان', 'ثنا رضا', 'فیصل بٹ', 'زارا اقبال', 'بلال عباسی',
  'نادیہ ہاشمی', 'سعد چوہدری', 'رابعہ شیخ', 'حارث مرزا', 'آمنہ جاوید', 'زین اختر', 'ہنا حسین',
] as const;
const COMPANY_PARTS = [
  ['Silverline', 'Northgate', 'Bluewater', 'Evergreen', 'Summit', 'Crescentview', 'Riverbend', 'Oakfield'],
  ['Traders', 'Holdings', 'Enterprises', 'Associates', 'Ventures', 'Builders'],
] as const;
export const CITIES = ['Lahore', 'Karachi', 'Islamabad', 'Rawalpindi', 'Faisalabad', 'Multan', 'Peshawar', 'Sialkot'] as const;

function demoPhone(n: number): string {
  return `+92399${pad(1000000 + n * 7919 % 9000000, 7)}`;
}

function demoCnic(n: number): string {
  return `9${pad(1000 + (n * 37) % 9000, 4)}-${pad(1000000 + n * 104729 % 9000000, 7)}-${n % 10}`;
}

/** Fictional parties for one tenant; the same seed and prefix always give the same people. */
export function generateParties({ seed, count, idPrefix, refPrefix, firstResident }: { seed: number; count: number; idPrefix: string; refPrefix: string; firstResident?: readonly [string, string] }): Party[] {
  const rnd = createRandom(seed);
  const parties: Party[] = [];
  for (let i = 1; i <= count; i++) {
    const id = `${idPrefix}${pad(i, 4)}`;
    const ref = `${refPrefix}${pad(10000 + i, 5)}`;
    const city = rnd.pick(CITIES);
    if (i % 12 === 0) {
      const name = `${rnd.pick(COMPANY_PARTS[0])} ${rnd.pick(COMPANY_PARTS[1])} (Pvt) Ltd`;
      parties.push({
        id, ref, kind: 'company', displayName: name, city,
        phone: demoPhone(i), email: `accounts${i}@example.com`,
      });
      continue;
    }
    const urdu = i % 10 === 3;
    const first = rnd.pick(FIRST_NAMES);
    const last = rnd.pick(LAST_NAMES);
    // Party 1 is the demo resident persona (Usman Tariq): the backoffice and the portal must agree.
    const [given, family] = i === 1 && firstResident ? firstResident : [first, last];
    parties.push({
      id, ref, kind: 'individual',
      displayName: urdu ? URDU_NAMES[(i / 10) % URDU_NAMES.length | 0]! : `${given} ${family}`,
      phone: demoPhone(i),
      email: `${given.toLowerCase()}.${family.toLowerCase()}${i}@example.com`,
      cnic: demoCnic(i),
      city,
    });
  }
  return parties;
}

export const PARTIES: readonly Party[] = generateParties({ seed: 20261026, count: 150, idPrefix: 'pty_', refPrefix: 'CUS-', firstResident: ['Usman', 'Tariq'] });

/** A staff identity's role in its tenant: the role's title and permissions are the person's. */
const holds = (tenantId: string, roleId: string) => {
  const role = tenantRole(tenantId, roleId);
  return { roleId: role.id, roleKey: role.labelKey, permissions: role.permissions };
};

export const PERSONAS: readonly Persona[] = [
  {
    id: 'manager',
    tenantId: TENANT.id,
    principalId: 'usr_lsp_0001',
    app: 'backoffice',
    displayName: 'Nadia Rahman',
    email: 'nadia.rahman@example.com',
    ...holds(TENANT.id, 'administration'),
    projectScope: 'all',
  },
  {
    id: 'sales',
    tenantId: TENANT.id,
    principalId: 'usr_lsp_0002',
    app: 'backoffice',
    displayName: 'Bilal Ahmed',
    email: 'bilal.ahmed@example.com',
    ...holds(TENANT.id, 'sales'),
    projectScope: ['prj_heights'],
  },
  {
    id: 'finance',
    tenantId: TENANT.id,
    principalId: 'usr_lsp_0003',
    app: 'backoffice',
    displayName: 'Farah Javed',
    email: 'farah.javed@example.com',
    ...holds(TENANT.id, 'finance'),
    projectScope: 'all',
  },
  {
    id: 'resident',
    tenantId: TENANT.id,
    principalId: 'usr_lsp_c0001',
    app: 'customer',
    displayName: 'Usman Tariq',
    roleKey: 'common:persona.resident',
    email: 'usman.tariq@example.com',
    permissions: ['portal.use'],
    projectScope: ['prj_heights'],
    partyId: 'pty_0001',
  },
  // Shalimar Court Residents (Demo) licenses only core + maintenance (Gate B checkpoint 2). Its own
  // "Facility manager" role is generous on purpose: licensing, not the role, keeps developer modules away.
  {
    id: 'facility_manager',
    tenantId: SHALIMAR.id,
    principalId: 'usr_shc_0001',
    app: 'backoffice',
    displayName: 'Saima Akram',
    email: 'saima.akram@example.com',
    ...holds(SHALIMAR.id, 'facility_manager'),
    projectScope: 'all',
  },
  // Crescent Bay Developers (Demo): its administration role; the per-site licence decides what each
  // site shows (Plaza inventory is never reachable, whatever the role).
  {
    id: 'cb_manager',
    tenantId: CRESCENT_BAY.id,
    principalId: 'usr_cbd_0001',
    app: 'backoffice',
    displayName: 'Zain Abbasi',
    email: 'zain.abbasi@example.com',
    ...holds(CRESCENT_BAY.id, 'administration'),
    projectScope: 'all',
  },
  // Cedar Hills Co-operative (Demo) is suspended: its treasurer can still read financial history.
  {
    id: 'cedar_treasurer',
    tenantId: CEDAR_HILLS.id,
    principalId: 'usr_chc_0001',
    app: 'backoffice',
    displayName: 'Haris Mirza',
    email: 'haris.mirza@example.com',
    ...holds(CEDAR_HILLS.id, 'treasurer'),
    projectScope: 'all',
  },
  {
    id: 'society_admin',
    tenantId: SHALIMAR.id,
    principalId: 'usr_shc_0002',
    app: 'backoffice',
    displayName: 'Adnan Malik',
    email: 'adnan.malik@example.com',
    ...holds(SHALIMAR.id, 'administrator'),
    projectScope: 'all',
  },
];

/** Tenants that have backoffice demo identities. */
export const BACKOFFICE_TENANTS = [TENANT, CRESCENT_BAY, SHALIMAR, CEDAR_HILLS] as const;

export function findPersona(id: string | null | undefined): Persona | undefined {
  return PERSONAS.find((p) => p.id === id);
}
