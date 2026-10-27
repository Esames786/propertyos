import type { Party, Persona } from '@repo/contracts';
import { createRandom, pad } from './seed';

/**
 * Entirely fictional people and companies. Rules (enforced by fixtures.test.ts):
 * - mobile numbers use the unallocated +92 399 prefix;
 * - CNICs start with 9 (not a province code);
 * - e-mail domains are RFC 2606 example.com.
 */
export const TENANT = { id: 'tnt_larkspur', name: 'Larkspur Estates (Demo)' } as const;

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

function generateParties(): Party[] {
  const rnd = createRandom(20261026);
  const parties: Party[] = [];
  for (let i = 1; i <= 150; i++) {
    const id = `pty_${pad(i, 4)}`;
    const ref = `CUS-${pad(10000 + i, 5)}`;
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
    const [given, family] = i === 1 ? ['Usman', 'Tariq'] : [first, last];
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

export const PARTIES: readonly Party[] = generateParties();

const ALL_STAFF = [
  'project.context.use', 'quickcreate.use', 'lead.view', 'lead.create', 'visit.schedule', 'unit.view',
  'unit.hold', 'quote.create', 'customer.view', 'booking.view', 'invoice.view', 'payment.receive',
  'finance.evidence.review', 'expense.create', 'supplier.view', 'procurement.view', 'hr.view',
  'operations.view', 'residents.view', 'reports.view', 'admin.view',
] as const;

export const PERSONAS: readonly Persona[] = [
  {
    id: 'manager',
    tenantId: TENANT.id,
    principalId: 'usr_lsp_0001',
    app: 'backoffice',
    displayName: 'Nadia Rahman',
    roleKey: 'common:persona.manager',
    email: 'nadia.rahman@example.com',
    permissions: ALL_STAFF,
    projectScope: 'all',
  },
  {
    id: 'sales',
    tenantId: TENANT.id,
    principalId: 'usr_lsp_0002',
    app: 'backoffice',
    displayName: 'Bilal Ahmed',
    roleKey: 'common:persona.sales',
    email: 'bilal.ahmed@example.com',
    permissions: [
      'project.context.use', 'quickcreate.use', 'lead.view', 'lead.create', 'visit.schedule',
      'unit.view', 'unit.hold', 'quote.create', 'customer.view', 'booking.view',
    ],
    projectScope: ['prj_heights'],
  },
  {
    id: 'finance',
    tenantId: TENANT.id,
    principalId: 'usr_lsp_0003',
    app: 'backoffice',
    displayName: 'Farah Javed',
    roleKey: 'common:persona.finance',
    email: 'farah.javed@example.com',
    permissions: [
      'project.context.use', 'quickcreate.use', 'customer.view', 'booking.view', 'invoice.view',
      'payment.receive', 'finance.evidence.review', 'expense.create', 'supplier.view', 'reports.view',
    ],
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
];

export function findPersona(id: string | null | undefined): Persona | undefined {
  return PERSONAS.find((p) => p.id === id);
}
