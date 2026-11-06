import { decide, type LandlordProperty, type LandlordView, type OwnerStatementView, type PartyLink } from '@repo/contracts';
import { notFound, permits, refused, requires, type Handler, type HandlerContext } from '../handler-types';
import { liabilityRecord } from '../portal';
import { money, monthOf, paisa, rentKey, shareOf, basisPoints, ZERO } from './rules';
import { rentalsState, type RentalsState, type StoredStatement } from './state';
import { isLet, leaseEnd, leaseSchedule, leaseStart, ownershipsOn, PENDING, seedIssued, siteName, totalsOf, memoOf, unitOf } from './views';

/**
 * PORTAL-037 "My rental properties" (Gate S.3), for a landlord in the resident app. **Rule R** (V3.2
 * revision 4), checked on every request and in this order:
 * 1. The transport: `resident_portal` + `portal.use` (an organisation that is suspended, or has
 *    withdrawn the portal, refuses here).
 * 2. A verified party link **in force today**, at a site holding `resident_portal` (a claimed link,
 *    a link that has ended — the flat was sold — or another site's link reaches nothing).
 * 3. A **verified landlord role**: the owner register names this person (or the company they sign
 *    for) as an owner of that unit today. A lessee's link is not a landlord role; a link is never
 *    turned into one.
 * 4. The `rentals` grant for **that same site** (Riverbend Villas has none).
 * Neither the link nor the grant alone opens anything. No landlord role at all is "not found"; a role
 * only on unlicensed sites gets the shared rule's refusal. A landlord sees, for their own units only:
 * the tenant's name and the rent status of the current period (never the tenant's other accounts),
 * the deposit agreed (held: nothing evidenced), their issued statements (never drafts) and their
 * payout instructions (none can be settled here).
 */

interface Landlord {
  st: RentalsState;
  ownerIds: string[];
  /** The landlord's units this request may show (Rule R passed for each). */
  properties: Array<{ link: PartyLink; unitId: string; siteId: string; ownerId: string; share: string }>;
}

function landlordOf(ctx: HandlerContext): Landlord {
  const persona = ctx.persona;
  if (!persona || persona.app !== 'customer' || !persona.partyId) notFound(ctx);
  const st = rentalsState(ctx, seedIssued);
  const ownerIds = st.owners.filter((o) => o.partyId === persona.partyId).map((o) => o.id);
  const scope = ctx.access?.scopes.find((x) => x.type === 'party');
  const links = scope && scope.type === 'party' ? scope.links : [];
  const candidates: Landlord['properties'] = [];
  for (const link of links) {
    // A verified link in force today, at a site with the resident portal (the shared rule).
    if (!permits(ctx, 'resident_portal', liabilityRecord(link, ctx.at))) continue;
    const unit = unitOf(st, link.unitId);
    if (!unit || unit.siteId !== link.siteId) continue;
    // A landlord role in the owner register today; nothing else counts as one.
    const owning = ownershipsOn(st, unit.id, ctx.at).find((o) => ownerIds.includes(o.ownerId));
    if (!owning || candidates.some((c) => c.unitId === unit.id)) continue;
    candidates.push({ link, unitId: unit.id, siteId: unit.siteId, ownerId: owning.ownerId, share: owning.share });
  }
  if (!candidates.length) notFound(ctx);
  const rentalsFor = (link: PartyLink) => (ctx.access ? decide(ctx.access, { module: 'rentals', record: liabilityRecord(link, ctx.at), at: ctx.at, suspension: ctx.suspension }) : ({ allowed: false, reason: 'permission_missing' } as const));
  const properties = candidates.filter((c) => rentalsFor(c.link).allowed);
  if (!properties.length) {
    const d = rentalsFor(candidates[0]!.link);
    refused(d.allowed ? { allowed: false, reason: 'out_of_scope' } : d, ctx.correlationId);
  }
  return { st, ownerIds: [...new Set(properties.map((p) => p.ownerId))], properties };
}

/** An issued statement as this landlord may see it: lines of their permitted sites only. */
function landlordStatement(l: Landlord, s: StoredStatement): OwnerStatementView {
  const sites = new Set(l.properties.map((p) => p.siteId));
  const allSites = Object.keys(s.openingBySite).every((x) => sites.has(x)) && s.body.lines.every((x) => x.siteId === '' || sites.has(x.siteId));
  // Owner-level lines (payout instructions) belong to the landlord; site lines follow the permitted sites.
  const lines = s.body.lines.filter((x) => x.siteId === '' || sites.has(x.siteId));
  const opening = Object.entries(s.openingBySite).filter(([x]) => sites.has(x)).reduce((t, [, v]) => t + BigInt(v), 0n);
  return {
    ...s.body,
    ...(allSites ? {} : { lines, totals: totalsOf(lines, s.body.model, opening), memo: memoOf(lines) }),
    id: s.id,
    ref: s.ref,
    state: 'issued',
    scopeLimited: !allSites,
    issuedByName: '',
    issuedAt: s.issuedAt,
    // The office's internal history (who issued it and when) stays with the office.
    history: [],
    actions: { issue: false },
  };
}

function landlordView(ctx: HandlerContext): LandlordView {
  const l = landlordOf(ctx);
  const period = monthOf(ctx.at);
  const roll = l.st.rolls.find((x) => x.period === period);
  const properties: LandlordProperty[] = l.properties.map((p) => {
    const unit = unitOf(l.st, p.unitId)!;
    const bp = basisPoints(p.share) ?? 0n;
    // The unit's lease running today where this owner is a landlord (else the most recent one).
    const leases = l.st.leases.filter((x) => x.unitId === p.unitId && isLet(x, ctx.at) && x.landlords.some((y) => y.ownerId === p.ownerId)).sort((a, b) => leaseStart(b).localeCompare(leaseStart(a)));
    const lease = leases.find((x) => leaseStart(x) <= ctx.at && leaseEnd(x) >= ctx.at) ?? leases[0];
    const line = lease ? leaseSchedule(lease).find((x) => x.period === period) : undefined;
    const inRoll = !!lease && !!line && !!roll?.lines.some((x) => x.key === rentKey(lease.id, period, line.version));
    return {
      unitId: unit.id,
      unitCode: unit.code,
      siteName: siteName(l.st, unit.siteId),
      share: p.share,
      ...(lease
        ? {
            lease: { ref: lease.ref, tenantName: lease.tenant.name, from: leaseStart(lease), to: leaseEnd(lease), rent: lease.versions.at(-1)!.rent, period, roll: inRoll ? roll!.state : 'not_prepared', settlement: 'not_settled' as const },
            deposit: { agreed: money(shareOf(paisa(lease.deposit), bp)), heldEvidenced: ZERO },
          }
        : {}),
    };
  });
  const statements = l.st.statements
    .filter((s) => l.ownerIds.includes(s.ownerId))
    .sort((a, b) => b.period.localeCompare(a.period))
    .map((s) => {
      const v = landlordStatement(l, s);
      return { id: s.id, ref: s.ref, period: s.period, closing: v.totals.closing, issuedAt: s.issuedAt };
    });
  return {
    name: ctx.persona!.displayName,
    properties,
    statements,
    payouts: { settled: [], pending: l.st.payouts.filter((p) => l.ownerIds.includes(p.ownerId) && PENDING.includes(p.state)).map((p) => ({ ref: p.ref, amount: p.amount, state: p.state })) },
    today: ctx.at,
  };
}

export const RENTALS_PORTAL_HANDLERS: Handler[] = [
  { method: 'GET', pattern: /^\/portal\/rentals$/, access: requires('resident_portal', 'portal.use', 'operational'), handle: (ctx): LandlordView => landlordView(ctx) },
  {
    method: 'GET',
    pattern: /^\/portal\/rentals\/statements\/(?<id>[\w-]+)$/,
    access: requires('resident_portal', 'portal.use', 'operational'),
    handle: (ctx): OwnerStatementView => {
      const l = landlordOf(ctx);
      // Their own owner's issued statement only: a draft, another owner's or a never-issued id is "not found".
      const s = l.st.statements.find((x) => x.id === ctx.params.id && l.ownerIds.includes(x.ownerId));
      if (!s) notFound(ctx);
      return landlordStatement(l, s);
    },
  },
];
