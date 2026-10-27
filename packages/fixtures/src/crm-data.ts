import type { ActivityEvent, Lead, Party, Project, SiteVisit, UnitSummary, UnitDetail, Unit } from '@repo/contracts';
import type { TenantDataset } from './dataset-types';
import { PERSONAS } from './people';
import { createRandom, daysFromNow, pad, percentOf, FIXTURE_NOW } from './seed';

/**
 * Deterministic CRM fixtures for Sales home: site visits and a believable per-lead history.
 * Everything is fictional and generated from fixed seeds (screenshots and tests stay stable).
 * Every helper takes the tenant's own dataset, never another tenant's records.
 */

export const ownerName = (personaId: string) => PERSONAS.find((p) => p.id === personaId)?.displayName ?? 'Nadia Rahman';
export const projectName = (d: Pick<TenantDataset, 'projects'>, projectId: string) => d.projects.find((p) => p.id === projectId)?.name ?? projectId;
export const partyOf = (d: Pick<TenantDataset, 'parties'>, partyId: string) => d.parties.find((p) => p.id === partyId);

/** Karachi local hour (UTC+5) → ISO instant `days` from the fixture clock. */
const localAt = (days: number, localHour: number, minute = 0) => {
  const iso = daysFromNow(days, localHour - 5);
  return minute ? iso.replace(':00:00', `:${pad(minute, 2)}:00`) : iso;
};

/** Fictional site visits for one tenant's leads. */
export function generateVisits(g: { seed: number; leads: readonly Lead[]; units: readonly Unit[]; parties: readonly Party[]; projects: readonly Project[]; count: number; idPrefix: string }): SiteVisit[] {
  const rnd = createRandom(g.seed);
  const candidates = g.leads.filter((l) => ['contacted', 'qualified', 'converted'].includes(l.status));
  return candidates.slice(0, g.count).map((lead, i) => {
    const party = g.parties.find((p) => p.id === lead.partyId)!;
    const days = i < 4 ? 0 : i < 14 ? rnd.int(1, 7) : -rnd.int(1, 12);
    const at = localAt(days, rnd.pick([10, 11, 12, 14, 15, 16, 17] as const), rnd.pick([0, 30] as const));
    const past = days < 0;
    const unit = g.units.find((u) => u.projectId === lead.projectId && u.status === 'available' && Number(u.price.amount) <= Number(lead.budget.amount) * 1.15);
    return {
      id: `${g.idPrefix}${pad(i + 1, 3)}`,
      leadId: lead.id,
      leadRef: lead.ref,
      displayName: party.displayName,
      phone: party.phone,
      projectId: lead.projectId,
      projectName: projectName(g, lead.projectId),
      ...(unit ? { unitRef: unit.ref } : {}),
      at,
      status: past ? (lead.status === 'converted' || rnd.chance(0.8) ? 'completed' : 'no_show') : rnd.chance(0.55) ? 'confirmed' : 'scheduled',
      ownerName: ownerName(lead.ownerPersonaId),
    } satisfies SiteVisit;
  });
}

const hours = (iso: string, h: number) => new Date(new Date(iso).getTime() + h * 3_600_000).toISOString();

/** A plausible history for a fixture lead, newest first. */
export function leadHistory(d: Pick<TenantDataset, 'visits'>, lead: Lead): ActivityEvent[] {
  const owner = ownerName(lead.ownerPersonaId);
  const events: ActivityEvent[] = [
    { id: `${lead.id}_h1`, at: lead.createdAt, actorName: 'System', messageKey: 'activity.created', params: { source: lead.source }, kind: 'system' },
  ];
  if (lead.status !== 'new') {
    events.push({ id: `${lead.id}_h2`, at: hours(lead.createdAt, 2), actorName: 'Nadia Rahman', messageKey: 'activity.assigned', params: { name: owner }, kind: 'status' });
  }
  if (['contacted', 'qualified', 'converted'].includes(lead.status)) {
    events.push({ id: `${lead.id}_h3`, at: hours(lead.createdAt, 26), actorName: owner, messageKey: 'activity.callAnswered', params: {}, kind: 'call' });
  }
  if (['dormant', 'lost', 'unqualified'].includes(lead.status)) {
    events.push({ id: `${lead.id}_h3`, at: hours(lead.createdAt, 26), actorName: owner, messageKey: 'activity.callNoAnswer', params: {}, kind: 'call' });
    events.push({ id: `${lead.id}_h4`, at: hours(lead.createdAt, 98), actorName: owner, messageKey: 'activity.statusChanged', params: { status: lead.status }, kind: 'status' });
  }
  if (['qualified', 'converted'].includes(lead.status)) {
    events.push({ id: `${lead.id}_h4`, at: hours(lead.createdAt, 50), actorName: owner, messageKey: 'activity.statusChanged', params: { status: 'qualified' }, kind: 'status' });
  }
  const visit = d.visits.find((v) => v.leadId === lead.id);
  if (visit) {
    events.push({ id: `${lead.id}_h5`, at: hours(lead.createdAt, 52), actorName: owner, messageKey: 'activity.visitBooked', params: { at: visit.at }, kind: 'visit' });
    if (visit.status === 'completed') events.push({ id: `${lead.id}_h6`, at: hours(visit.at, 1), actorName: owner, messageKey: 'activity.visitCompleted', params: {}, kind: 'visit' });
  }
  if (lead.status === 'converted') {
    events.push({ id: `${lead.id}_h7`, at: hours(lead.createdAt, 200), actorName: owner, messageKey: 'activity.statusChanged', params: { status: 'converted' }, kind: 'status' });
  }
  const now = FIXTURE_NOW.getTime();
  return events.filter((e) => new Date(e.at).getTime() <= now).sort((a, b) => b.at.localeCompare(a.at));
}

export function unitSummary(d: Pick<TenantDataset, 'towers' | 'floors' | 'projects'>, unit: Unit, holds: Record<string, { leadRef: string; until: string }> = {}): UnitSummary {
  const tower = unit.towerId ? d.towers.find((t) => t.id === unit.towerId) : undefined;
  const floor = unit.floorId ? d.floors.find((f) => f.id === unit.floorId) : undefined;
  const hold = holds[unit.id];
  return {
    id: unit.id,
    ref: unit.ref,
    projectId: unit.projectId,
    projectName: projectName(d, unit.projectId),
    ...(tower ? { towerName: tower.name } : {}),
    ...(floor ? { floor: floor.level } : {}),
    ...(unit.block ? { block: unit.block } : {}),
    type: unit.type,
    areaSqft: unit.areaSqft,
    price: unit.price,
    status: hold ? 'held' : unit.status,
    ...(hold ? { hold: { leadRef: hold.leadRef, until: hold.until } } : {}),
  };
}

/** Standard demo payment plan: 10 % down, the rest over 36 monthly instalments. */
export function unitDetail(d: Pick<TenantDataset, 'towers' | 'floors' | 'projects'>, unit: Unit, holds: Record<string, { leadRef: string; until: string }> = {}): UnitDetail {
  const down = percentOf(unit.price.amount, 10);
  const remaining = (BigInt(unit.price.amount.replace('.', '')) - BigInt(down.replace('.', ''))) / 36n;
  const per = remaining.toString().padStart(3, '0');
  const kind = d.projects.find((p) => p.id === unit.projectId)?.kind;
  return {
    ...unitSummary(d, unit, holds),
    plan: {
      downPaymentPercent: 10,
      installments: 36,
      downPayment: { amount: down, currency: 'PKR' },
      perInstallment: { amount: `${per.slice(0, -2)}.${per.slice(-2)}`, currency: 'PKR' },
    },
    imageKey: kind === 'plots' ? 'gardens-residences' : unit.type === 'penthouse' || unit.type === 'shop' ? 'interior-living-bright' : 'heights-dusk',
  };
}
