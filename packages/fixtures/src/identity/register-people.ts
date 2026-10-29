import type { PartyLink, PortalRole } from '@repo/contracts';
import { ALNOOR_ENTITY, ALNOOR_SITE, alnoorRegister } from '../society/alnoor';
import { buildSociety, factOn, type SocietyModel } from '../society/model';
import { FIXTURE_NOW } from '../seed';

/**
 * Everyone the Al-Noor register knows (Gate D.1): owners, occupants and payers in force today, with
 * their flats and whether their link to the flat is verified. Built from the same register rows as
 * the society model (C.1), so the party ids match it. Fictional people only.
 *
 * Verification: the committee's register counts as verified for owners and owner-occupiers. Two
 * tenants' agreements are not on file yet, so their links are unverified: they cannot be invited
 * until the office verifies them (an invitation is bound to a verified person, owner D.1).
 */
export const REGISTER_TODAY = FIXTURE_NOW.toISOString().slice(0, 10);

export interface RegisterFlatLink {
  flatId: string;
  flatCode: string;
  buildingId: string;
  accountId: string;
  roles: PortalRole[];
  from: string;
}

export interface RegisterPerson {
  partyId: string;
  name: string;
  phone?: string;
  email: string;
  flats: RegisterFlatLink[];
  verified: boolean;
}

/** Tenants whose tenancy agreement is not on file (their links are unverified). */
export const UNVERIFIED_OCCUPANTS: readonly string[] = ['B-307', 'A-503'];

const slug = (name: string, partyId: string) =>
  /^[A-Za-z .'-]+$/.test(name) ? `${name.toLowerCase().replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '')}@example.com` : `resident.${partyId.slice(-4)}@example.com`;

let cache: RegisterPerson[] | undefined;

/** People of the Al-Noor register with the roles in force today (the association itself excluded). */
export function alnoorRegisterPeople(): RegisterPerson[] {
  cache ??= peopleOf(buildSociety(alnoorRegister()), REGISTER_TODAY);
  return cache;
}

/**
 * The people of a society model with the roles in force on a date (the live model in the demo, so a
 * payer change or a moved-out tenant shows at once).
 */
export function peopleOf(model: SocietyModel, today: string): RegisterPerson[] {
  const flatById = new Map(model.flats.map((f) => [f.id, f]));
  const byParty = new Map<string, RegisterPerson>();
  for (const fact of model.facts) {
    if (!factOn(fact, today)) continue;
    const person = model.people.find((p) => p.id === fact.partyId);
    if (!person || person.kind === 'organisation' || person.displayName === ALNOOR_ENTITY.name) continue;
    const flat = flatById.get(fact.flatId)!;
    let entry = byParty.get(person.id);
    if (!entry) {
      entry = { partyId: person.id, name: person.displayName, ...(person.phone ? { phone: person.phone } : {}), email: slug(person.displayName, person.id), flats: [], verified: true };
      byParty.set(person.id, entry);
    }
    let link = entry.flats.find((l) => l.flatId === flat.id);
    if (!link) {
      link = { flatId: flat.id, flatCode: flat.code, buildingId: flat.buildingId, accountId: flat.billingAccountId, roles: [], from: fact.from };
      entry.flats.push(link);
    }
    const role: PortalRole = fact.role === 'payer' ? 'payer' : fact.role === 'owner' ? 'owner' : 'occupant';
    if (!link.roles.includes(role)) link.roles.push(role);
    if (fact.from < link.from) link.from = fact.from;
    if (fact.role === 'occupant' && fact.occupancyKind === 'tenant' && UNVERIFIED_OCCUPANTS.includes(flat.code)) entry.verified = false;
  }
  return [...byParty.values()].sort((a, b) => a.partyId.localeCompare(b.partyId));
}

/** The person's verified (or not) links as access links: flat, its billing account, site and entity. */
export function registerLinks(person: RegisterPerson): Array<PartyLink & { partyId: string }> {
  return person.flats.map((f) => ({
    partyId: person.partyId,
    unitId: f.flatId,
    billingAccountId: f.accountId,
    siteId: ALNOOR_SITE.id,
    legalEntityId: 'le_alnoor',
    verified: person.verified,
    from: f.from,
  }));
}

/** The persona id of a register person who can join the resident app by invitation. */
export const invitedPersonaId = (partyId: string) => `res_${partyId}` as const;
/** Their principal (one person, one identity, whatever app). */
export const invitedPrincipalId = (partyId: string) => `usr_${partyId}`;
