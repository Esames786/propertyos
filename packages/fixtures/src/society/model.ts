import type { FlatFact, OccupancyStatus, SiteBuilding, SiteFloor, SiteUnitType, SocietyFlat, SocietyPerson, UnitTypeCode } from '@repo/contracts';
import { pad } from '../seed';
import { ALNOOR_ENTITY, ALNOOR_SITE, BLOCKS, FLATS_PER_FLOOR, FLOORS, UNIT_TYPES, type FlatRow } from './alnoor';

/**
 * The society model built from register rows: flats, people and the effective-dated facts that link
 * them (ownership, occupancy, liability), and billing accounts. Pure: the "ready" demo and a fresh
 * import of the sample file produce the same model from the same rows.
 */
export interface SocietyAccount {
  id: string;
  accountNo: string;
  holderPartyId: string;
  holderName: string;
  flatIds: string[];
}

export interface SocietyModel {
  buildings: SiteBuilding[];
  floors: SiteFloor[];
  types: SiteUnitType[];
  flats: SocietyFlat[];
  people: SocietyPerson[];
  facts: FlatFact[];
  accounts: SocietyAccount[];
}

/** The site's structure exists before any flat is imported (set up when the site was licensed). */
export const BUILDINGS: readonly SiteBuilding[] = BLOCKS.map((code) => ({
  id: `bld_anr_${code.toLowerCase()}`,
  siteId: ALNOOR_SITE.id,
  code,
  name: `Block ${code}`,
  floors: FLOORS,
  flatsPerFloor: FLATS_PER_FLOOR,
}));

export const SITE_FLOORS: readonly SiteFloor[] = BUILDINGS.flatMap((b) => Array.from({ length: b.floors }, (_, i) => ({ id: `flr_anr_${b.code.toLowerCase()}_${i + 1}`, buildingId: b.id, level: i + 1 })));

export const flatIdOf = (code: string) => `unt_anr_${code.replace('-', '').toLowerCase()}`;
export const accountIdOf = (accountNo: string) => `ba_${accountNo.replace(/-/g, '_').toLowerCase()}`;
export const defaultAccountNo = (code: string) => `ANR-${code.replace('-', '')}`;
export const typeByName = (name: string) => UNIT_TYPES.find((t) => t.name.toLocaleLowerCase('en') === name.trim().toLocaleLowerCase('en'));

const OCCUPANCY: Record<string, OccupancyStatus> = { owner: 'owner_occupied', tenant: 'tenant_occupied', vacant: 'vacant', office: 'association_use' };

/** Build the society from valid register rows (rows are assumed validated by the import). */
export function buildSociety(rows: readonly FlatRow[]): SocietyModel {
  const sorted = [...rows].sort((a, b) => a.flat.localeCompare(b.flat));
  const people: SocietyPerson[] = [];
  const byPhone = new Map<string, SocietyPerson>();
  const person = (name: string, phone: string): SocietyPerson => {
    const key = phone || name;
    let p = byPhone.get(key);
    if (!p) {
      const n = people.length + 1;
      const organisation = name === ALNOOR_ENTITY.name;
      p = {
        id: `pty_anr_${pad(n, 4)}`,
        ref: `ANR-P-${pad(n, 4)}`,
        kind: organisation ? 'organisation' : 'individual',
        displayName: name,
        ...(phone ? { phone } : {}),
        ...(organisation ? { email: 'committee@example.com' } : {}),
      };
      byPhone.set(key, p);
      people.push(p);
    }
    return p;
  };

  const flats: SocietyFlat[] = [];
  const facts: FlatFact[] = [];
  const accounts = new Map<string, SocietyAccount>();
  const counter = new Map<string, number>();
  const fact = (f: Omit<FlatFact, 'id'>): void => {
    const key = `${f.role}_${f.flatId}`;
    const n = (counter.get(key) ?? 0) + 1;
    counter.set(key, n);
    facts.push({ id: `fct_${f.role}_${f.flatId.slice(4)}_${n}`, ...f });
  };

  for (const row of sorted) {
    const id = flatIdOf(row.flat);
    const building = BUILDINGS.find((b) => b.code === row.block)!;
    const floor = SITE_FLOORS.find((f) => f.buildingId === building.id && f.level === Number(row.floor))!;
    const type = typeByName(row.type)!;
    const owner = person(row.owner_name, row.owner_phone);
    const occupancy = OCCUPANCY[row.occupancy] ?? 'vacant';
    const accountNo = row.account.trim() || defaultAccountNo(row.flat);
    const accountId = accountIdOf(accountNo);
    if (!accounts.has(accountId)) accounts.set(accountId, { id: accountId, accountNo, holderPartyId: owner.id, holderName: owner.displayName, flatIds: [] });
    accounts.get(accountId)!.flatIds.push(id);
    flats.push({ id, siteId: ALNOOR_SITE.id, buildingId: building.id, floorId: floor.id, code: row.flat, typeId: type.id, areaSqft: Number(row.area_sqft), occupancy, billingAccountId: accountId });

    const base = { flatId: id, flatCode: row.flat };
    fact({ ...base, role: 'owner', partyId: owner.id, partyName: owner.displayName, from: row.owner_since, sharePct: '100' });
    const tenant = row.occupancy === 'tenant' ? person(row.occupant_name, row.occupant_phone) : undefined;
    if (tenant) fact({ ...base, role: 'occupant', partyId: tenant.id, partyName: tenant.displayName, from: row.occupant_since, occupancyKind: 'tenant' });
    else if (row.occupancy === 'owner') fact({ ...base, role: 'occupant', partyId: owner.id, partyName: owner.displayName, from: row.owner_since, occupancyKind: 'owner' });
    else if (row.occupancy === 'office') fact({ ...base, role: 'occupant', partyId: owner.id, partyName: owner.displayName, from: row.owner_since, occupancyKind: 'association' });

    // Liability per flat (A2 §4.5). A tenant who pays took over from the owner when they moved in.
    const payer = { ...base, role: 'payer' as const, liability: 'primary_payer' as const, billingAccountId: accountId };
    if (tenant && row.payer === 'occupant') {
      if (row.occupant_since > row.owner_since) fact({ ...payer, partyId: owner.id, partyName: owner.displayName, from: row.owner_since, to: row.occupant_since });
      fact({ ...payer, partyId: tenant.id, partyName: tenant.displayName, from: row.occupant_since });
    } else {
      fact({ ...payer, partyId: owner.id, partyName: owner.displayName, from: row.owner_since });
    }
  }

  const types: SiteUnitType[] = UNIT_TYPES.map((t) => ({ id: t.id, siteId: ALNOOR_SITE.id, code: t.code as UnitTypeCode, name: t.name, areaSqft: t.areaSqft, flats: flats.filter((f) => f.typeId === t.id).length }));
  return { buildings: [...BUILDINGS], floors: [...SITE_FLOORS], types, flats, people, facts, accounts: [...accounts.values()] };
}

/** A fact in force on a calendar date (from ≤ on < to). */
export const factOn = (f: FlatFact, on: string) => f.from <= on && (f.to === undefined || on < f.to);

/** The party liable for a flat on a date (per unit, never by account-wide share). */
export const payerOn = (facts: readonly FlatFact[], flatId: string, on: string) => facts.find((f) => f.role === 'payer' && f.flatId === flatId && factOn(f, on));

/** First calendar day of a billing period (YYYY-MM). */
export const periodStart = (period: string) => `${period}-01`;
