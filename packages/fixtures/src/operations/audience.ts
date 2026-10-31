import type { AudiencePreview, AudienceRole, FlatFact, NoticeAudience, NoticeRecipient } from '@repo/contracts';
import { factOn } from '../society/model';
import type { OpsSite } from './site';

/**
 * Who an official notice or message reaches (RES-005, NOT-003). The audience is a part of the site
 * (all, blocks, floors or flats) and a relationship to the flat (owner, occupant, liable payer),
 * resolved from the register's facts in force on the day: never from a free list of names. The same
 * rule is applied again whenever a resident reads or opens a notice, so someone who has moved out
 * (their occupancy ended) no longer sees what was sent to occupants. The association itself is never
 * a recipient. Pure.
 */
export interface Member {
  partyId: string;
  name: string;
  flatIds: string[];
  flatCodes: string[];
  roles: AudienceRole[];
}

export function flatsInScope(site: OpsSite, audience: NoticeAudience): Set<string> {
  const ids = new Set(audience.ids);
  const floorOf = new Map(site.floors.map((f) => [f.id, f]));
  return new Set(
    site.flats
      .filter((f) => {
        switch (audience.scope) {
          case 'site':
            return true;
          case 'blocks':
            return ids.has(f.buildingId);
          case 'floors':
            return [...ids].some((id) => {
              const floor = floorOf.get(id);
              return floor !== undefined && floor.buildingId === f.buildingId && floor.level === f.floor;
            });
          case 'units':
            return ids.has(f.id);
        }
      })
      .map((f) => f.id),
  );
}

const isAssociation = (site: OpsSite, partyId: string) => site.society?.view.model.people.find((p) => p.id === partyId)?.kind === 'organisation';

export function members(site: OpsSite, facts: readonly FlatFact[], audience: NoticeAudience, on: string): Member[] {
  const scope = flatsInScope(site, audience);
  const roles = new Set(audience.roles);
  const byParty = new Map<string, Member>();
  for (const f of facts) {
    if (!scope.has(f.flatId) || !roles.has(f.role) || !factOn(f, on)) continue;
    if (f.role === 'occupant' && f.occupancyKind === 'association') continue;
    if (isAssociation(site, f.partyId)) continue;
    let m = byParty.get(f.partyId);
    if (!m) byParty.set(f.partyId, (m = { partyId: f.partyId, name: f.partyName, flatIds: [], flatCodes: [], roles: [] }));
    if (!m.flatIds.includes(f.flatId)) {
      m.flatIds.push(f.flatId);
      m.flatCodes.push(f.flatCode);
    }
    if (!m.roles.includes(f.role)) m.roles.push(f.role);
  }
  return [...byParty.values()].sort((a, b) => a.flatCodes[0]!.localeCompare(b.flatCodes[0]!) || a.partyId.localeCompare(b.partyId));
}

/** Whether a person is in a notice's audience on a date (the check made on every read and open). */
export const inAudience = (site: OpsSite, facts: readonly FlatFact[], audience: NoticeAudience, partyId: string, on: string) => members(site, facts, audience, on).some((m) => m.partyId === partyId);

/**
 * The audience's places as codes ("A", "B-3", "A-101"; empty for the whole site). The screens put
 * them into words in the reader's language with the roles (operations:audience.*).
 */
export function audienceLabel(site: OpsSite, audience: NoticeAudience): string {
  switch (audience.scope) {
    case 'site':
      return '';
    case 'blocks':
      return site.buildings.filter((b) => audience.ids.includes(b.id)).map((b) => b.code).join(', ');
    case 'floors':
      return site.floors
        .filter((f) => audience.ids.includes(f.id))
        .map((f) => `${site.buildings.find((b) => b.id === f.buildingId)?.code ?? ''}-${f.level}`)
        .join(', ');
    case 'units':
      return site.flats.filter((f) => audience.ids.includes(f.id)).map((f) => f.code).join(', ');
  }
}

export interface ContactFacts {
  hasAccount: (partyId: string) => boolean;
  consented: (partyId: string, channel: 'sms' | 'whatsapp') => boolean;
}

export function previewOf(site: OpsSite, facts: readonly FlatFact[], audience: NoticeAudience, on: string, contacts: ContactFacts): AudiencePreview {
  const list = members(site, facts, audience, on);
  const flats = [...new Set(list.flatMap((m) => m.flatCodes))].sort();
  const byRole: Record<AudienceRole, number> = { owner: 0, occupant: 0, payer: 0 };
  for (const m of list) for (const r of m.roles) byRole[r] += 1;
  return {
    label: audienceLabel(site, audience),
    households: flats.length,
    people: list.length,
    byRole,
    withAppAccount: list.filter((m) => contacts.hasAccount(m.partyId)).length,
    smsConsent: list.filter((m) => contacts.consented(m.partyId, 'sms')).length,
    whatsappConsent: list.filter((m) => contacts.consented(m.partyId, 'whatsapp')).length,
    flats,
  };
}

/** Recipients at publication: in-app when the person has an active app account; message copies only with consent. */
export function recipientsOf(list: readonly Member[], channels: { sms: boolean; whatsapp: boolean }, licensed: { sms: boolean; whatsapp: boolean }, contacts: ContactFacts): NoticeRecipient[] {
  const copy = (chosen: boolean, isLicensed: boolean, partyId: string, channel: 'sms' | 'whatsapp') => (!chosen ? 'not_chosen' : !isLicensed ? 'not_licensed' : contacts.consented(partyId, channel) ? 'sent_simulated' : 'no_consent') as NoticeRecipient['sms'];
  return list.map((m) => ({
    partyId: m.partyId,
    name: m.name,
    flatCodes: [...m.flatCodes],
    roles: [...m.roles],
    inApp: contacts.hasAccount(m.partyId) ? 'delivered' : 'no_app_account',
    sms: copy(channels.sms, licensed.sms, m.partyId, 'sms'),
    whatsapp: copy(channels.whatsapp, licensed.whatsapp, m.partyId, 'whatsapp'),
  }));
}
