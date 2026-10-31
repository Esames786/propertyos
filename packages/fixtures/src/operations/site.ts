import { decide, type AccessRecord, type AudienceRole, type CommonArea, type FeatureKey, type FlatFact, type ModuleKey, type OpsFlat, type PartyLink } from '@repo/contracts';
import type { HandlerContext } from '../handler-types';
import { notFound, permits, refused } from '../handler-types';
import { liabilityRecord } from '../portal';
import { pad } from '../seed';
import { society, type Society } from '../society/handlers';
import { factOn } from '../society/model';

/**
 * Gate D.2: the site the operations screens work on. A society's site comes from its register (the
 * same flats, blocks and floors as Flat 360); Shalimar Court, the maintenance-only client, has no
 * register in PropertyOS, so its two blocks and common areas are a small fixed structure. Only the
 * signed-in person's own organisation is ever read.
 */
export interface OpsSite {
  tenantId: string;
  siteId: string;
  legalEntityId: string;
  name: string;
  /** Short code used in references (ANR-MR-0001). */
  code: string;
  buildings: Array<{ id: string; code: string }>;
  floors: Array<{ id: string; buildingId: string; level: number }>;
  flats: OpsFlat[];
  areas: CommonArea[];
  /** The society (register, people and their links); absent for a maintenance-only client. */
  society?: Society;
}

const SITE_AREAS = ['main_gate', 'parking', 'generator', 'water_tank', 'rooftop', 'garden', 'boundary_wall'] as const;
const BLOCK_AREAS = ['lobby', 'lift', 'stairs', 'corridor'] as const;

export function areasOf(prefix: string, buildings: ReadonlyArray<{ id: string; code: string }>): CommonArea[] {
  return [
    ...SITE_AREAS.map((key) => ({ id: `area_${prefix}_${key}`, key })),
    ...buildings.flatMap((b) => BLOCK_AREAS.map((key) => ({ id: `area_${prefix}_${b.code.toLowerCase()}_${key}`, key, buildingId: b.id, buildingCode: b.code }))),
  ];
}

/** Shalimar Court Residents (Demo): two blocks of four floors, eight flats a floor (64, as licensed). */
function shalimarSite(): OpsSite {
  const buildings = ['N', 'S'].map((code) => ({ id: `bld_shc_${code.toLowerCase()}`, code }));
  const floors = buildings.flatMap((b) => [1, 2, 3, 4].map((level) => ({ id: `flr_shc_${b.code.toLowerCase()}_${level}`, buildingId: b.id, level })));
  const flats: OpsFlat[] = floors.flatMap((f) => {
    const b = buildings.find((x) => x.id === f.buildingId)!;
    return Array.from({ length: 8 }, (_, i) => {
      const code = `${b.code}-${f.level}${pad(i + 1, 2)}`;
      return { id: `unt_shc_${code.replace('-', '').toLowerCase()}`, code, buildingId: b.id, buildingCode: b.code, floor: f.level };
    });
  });
  return { tenantId: 'tnt_shalimar', siteId: 'site_shalimar', legalEntityId: 'le_shalimar', name: 'Shalimar Court', code: 'SHC', buildings, floors, flats, areas: areasOf('shc', buildings) };
}

const SHALIMAR = shalimarSite();

/** The organisation's operations site, or 404 for an organisation without one in the demo. */
export function opsSite(ctx: HandlerContext): OpsSite {
  if (ctx.tenantId === SHALIMAR.tenantId) return SHALIMAR;
  if (!ctx.data.society) notFound(ctx);
  const s = society(ctx);
  const buildings = s.view.model.buildings.map((b) => ({ id: b.id, code: b.code }));
  const floors = s.view.model.floors.map((f) => ({ id: f.id, buildingId: f.buildingId, level: f.level }));
  const flats: OpsFlat[] = s.view.model.flats.map((f) => {
    const b = buildings.find((x) => x.id === f.buildingId)!;
    return { id: f.id, code: f.code, buildingId: f.buildingId, buildingCode: b.code, floor: floors.find((x) => x.id === f.floorId)?.level ?? 0 };
  });
  return { tenantId: ctx.tenantId!, siteId: s.siteId, legalEntityId: s.legalEntityId, name: 'Al-Noor Residency', code: 'ANR', buildings, floors, flats, areas: areasOf('anr', buildings), society: s };
}

/** The site as an access record (site-scoped modules are checked against it). */
export const siteRecord = (site: OpsSite, extra: AccessRecord = {}): AccessRecord => ({ siteId: site.siteId, legalEntityId: site.legalEntityId, ...extra });

/** Roles a person holds on a flat on a date, from the live facts (moves and payer changes applied). */
export function rolesOn(facts: readonly FlatFact[], partyId: string, flatId: string, on: string): AudienceRole[] {
  const roles = new Set<AudienceRole>();
  for (const f of facts) if (f.partyId === partyId && f.flatId === flatId && factOn(f, on)) roles.add(f.role);
  return (['owner', 'occupant', 'payer'] as const).filter((r) => roles.has(r));
}

/** Households living on the site today (a flat with a current occupant that is not the association). */
export function householdsOn(facts: readonly FlatFact[], on: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const f of facts) if (f.role === 'occupant' && f.occupancyKind !== 'association' && factOn(f, on)) out.set(f.flatId, f.partyId);
  return out;
}

export interface ResidentFlat {
  flat: OpsFlat;
  roles: AudienceRole[];
  link: PartyLink;
}

export interface ResidentOps {
  site: OpsSite;
  s: Society;
  partyId: string;
  principalId: string;
  name: string;
  /** Flats the person is linked to today, each with the roles in force (owner, occupant, payer). */
  flats: ResidentFlat[];
}

export interface ServiceGate {
  module: ModuleKey;
  feature?: FeatureKey;
}

/**
 * Rule R (V3.2 revision 4) for every resident operations endpoint. The transport already checked
 * `resident_portal` + `portal.use`. Here: the resident's verified link must be in force today, at a
 * site holding `resident_portal`, and the person must still hold a role on that flat in the live
 * register (a moved-out occupant holds none); then the service module (and its feature) must be
 * licensed for the same site and flat. Neither check alone opens anything; a refused request reads
 * and changes nothing. A person with no current flat gets "not found", never someone else's records.
 */
export function residentOps(ctx: HandlerContext, service?: ServiceGate): ResidentOps {
  const persona = ctx.persona;
  if (!persona || persona.app !== 'customer' || !persona.partyId) notFound(ctx);
  if (!ctx.data.society) notFound(ctx);
  const site = opsSite(ctx);
  const s = site.society!;
  const scope = ctx.access?.scopes.find((x) => x.type === 'party');
  const links = scope && scope.type === 'party' ? scope.links : [];
  const flats: ResidentFlat[] = [];
  for (const link of links) {
    if (!permits(ctx, 'resident_portal', liabilityRecord(link, ctx.at))) continue;
    const flat = site.flats.find((f) => f.id === link.unitId);
    if (!flat || flats.some((x) => x.flat.id === flat.id)) continue;
    const roles = rolesOn(s.view.facts, persona.partyId, flat.id, ctx.at);
    if (roles.length) flats.push({ flat, roles, link });
  }
  if (!flats.length) notFound(ctx);
  if (service) {
    const allowed = flats.filter((f) => serviceAllows(ctx, service, f));
    if (!allowed.length) {
      // The first flat's reason (site_not_licensed, feature_not_licensed …), as the transport would say it.
      const d = serviceDecision(ctx, service, flats[0]!);
      refused(d.allowed ? { allowed: false, reason: 'out_of_scope' } : d, ctx.correlationId);
    }
    return { site, s, partyId: persona.partyId, principalId: persona.principalId, name: persona.displayName, flats: allowed };
  }
  return { site, s, partyId: persona.partyId, principalId: persona.principalId, name: persona.displayName, flats };
}

function serviceDecision(ctx: HandlerContext, service: ServiceGate, f: ResidentFlat) {
  if (!ctx.access) return { allowed: false as const, reason: 'permission_missing' as const };
  return decide(ctx.access, { module: service.module, ...(service.feature ? { feature: service.feature } : {}), record: liabilityRecord(f.link, ctx.at), at: ctx.at, suspension: ctx.suspension });
}

/** The service module (and feature) licensed for this flat's site and reachable through its link. */
export const serviceAllows = (ctx: HandlerContext, service: ServiceGate, f: ResidentFlat) => serviceDecision(ctx, service, f).allowed;

/** Occupants of a flat today (only they are asked at the gate; an owner who lives elsewhere is not). */
export function occupantsOf(facts: readonly FlatFact[], flatId: string, on: string): string[] {
  return [...new Set(facts.filter((f) => f.role === 'occupant' && f.flatId === flatId && f.occupancyKind !== 'association' && factOn(f, on)).map((f) => f.partyId))];
}

/** A person's name from the register (staff screens only). */
export const personName = (site: OpsSite, partyId: string) => site.society?.view.model.people.find((p) => p.id === partyId)?.displayName ?? '';
