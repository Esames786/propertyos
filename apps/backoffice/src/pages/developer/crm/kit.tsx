import type { OpportunityStage, SalesPerson } from '@repo/contracts';
import { Badge, InlineAlert, Link, useT, type StatusTone } from '@repo/ui';
import { CalendarCheck2, CircleDashed, FileText, Flag, Handshake, Lock, Trophy, XCircle, type LucideIcon } from 'lucide-react';
import { formatCalendarDate } from '@repo/i18n';
import type { ReactNode } from 'react';
import { useCrmFormat } from '../../crm/format';
import { unbroken } from '../../society/hr/hkit';

/**
 * Gate E.1 shared pieces: addresses, stage badges and the notes every pipeline screen carries.
 * Links go only to screens that exist: Lead 360 (CRM-003), the unit quick view on Lead 360 (INV-002,
 * PARTIAL) and the project's register address (PRJ-002, which shows its planned page until Gate E.2
 * lands, and says so in the link's own text).
 */

const qs = (params: Record<string, string | undefined | null>) => {
  const s = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => !!e[1])).toString();
  return s ? `?${s}` : '';
};

export const E1 = {
  pipeline: (params: Record<string, string | undefined | null> = {}) => `/backoffice/crm/opportunities-pipeline${qs(params)}`,
  assignment: (lead?: string) => `/backoffice/crm/lead-assignment${qs({ lead })}`,
  opportunity: (id: string, tab?: string) => `/backoffice/crm/opportunity-360-workspace${qs({ record: id, tab })}`,
  calendar: (params: Record<string, string | undefined | null> = {}) => `/backoffice/crm/site-visits-calendar${qs(params)}`,
  visit: (id: string) => `/backoffice/crm/visit-workspace${qs({ record: id })}`,
  lead: (id: string, tab?: string) => `/backoffice/crm/lead-360-workspace${qs({ record: id, tab })}`,
  /** The unit quick view (INV-002) opens over the lead it was shown to. */
  unit: (leadId: string, unitId: string) => `/backoffice/crm/lead-360-workspace${qs({ record: leadId, tab: 'units', unit: unitId })}`,
  /** PRJ-002 is built by Gate E.2; until then its register address shows the planned page. */
  project: (id: string) => `/backoffice/prj/project-360-workspace${qs({ record: id })}`,
};

/** Opens a drawer or dialog over the current page (deep-linkable). */
export const withDrawer = (pathname: string, search: string, drawer: string, extra: Record<string, string> = {}) => {
  const p = new URLSearchParams(search);
  p.set('drawer', drawer);
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  return `${pathname}?${p}`;
};

export const STAGE_ICON: Record<OpportunityStage, LucideIcon> = {
  qualified: Flag,
  visit: CalendarCheck2,
  quotation: FileText,
  negotiation: Handshake,
  reservation: Lock,
  won: Trophy,
  lost: XCircle,
};

const STAGE_TONE: Record<OpportunityStage, StatusTone> = {
  qualified: 'info',
  visit: 'info',
  quotation: 'warning',
  negotiation: 'warning',
  reservation: 'success',
  won: 'success',
  lost: 'neutral',
};

/** A stage as icon and words (never colour alone). */
export function StageBadge({ stage, className }: { stage: OpportunityStage; className?: string }) {
  const { t } = useT();
  return (
    <Badge tone={STAGE_TONE[stage]} icon={STAGE_ICON[stage] ?? CircleDashed} className={className} data-stage={stage}>
      {t(`sales:stage.${stage}`)}
    </Badge>
  );
}

/** A record reference that never breaks at its dashes and keeps its order in Urdu. */
export const Ref = ({ value, className }: { value: string; className?: string }) => (
  <bdi dir="ltr" className={className}>
    {unbroken(value)}
  </bdi>
);

export function OwnerText({ owner }: { owner: SalesPerson }) {
  const { t } = useT();
  return (
    <span>
      {t('sales:common.owner')}: <bdi>{owner.name}</bdi>
    </span>
  );
}

/** The project's page (planned until Gate E.2): the link says where it goes. */
export function ProjectLink({ id, name, testId }: { id: string; name: string; testId?: string }) {
  const { t } = useT();
  return (
    <Link href={E1.project(id)} className="font-medium" data-testid={testId}>
      {t('sales:common.projectLink', { project: name })}
    </Link>
  );
}

/** What this person sees under decision E-05's default (not approved). */
export function ScopeNote({ scope, testId = 'e1-scope-note' }: { scope: 'project' | 'assigned'; testId?: string }) {
  const { t } = useT();
  if (scope === 'project') return null;
  return (
    <InlineAlert tone="info" data-testid={testId}>
      {t('sales:common.scopeAssigned')}
    </InlineAlert>
  );
}

/** Pipeline stages are conversation stages: nothing here is a quotation, hold, reservation, booking or payment. */
export function TruthNote({ children }: { children?: ReactNode }) {
  const { t } = useT();
  return (
    <p className="text-sm text-muted" data-testid="e1-truth-note">
      {t('sales:common.truth')}
      {children}
    </p>
  );
}

export function useSalesFormat() {
  const f = useCrmFormat();
  return {
    ...f,
    /** A plain date (YYYY-MM-DD) in the locale, read as a calendar date (no time zone shift). */
    day: (date: string) => formatCalendarDate(date, f.locale),
  };
}

export type SalesFormat = ReturnType<typeof useSalesFormat>;

/** Karachi wall-clock date (YYYY-MM-DD) of an instant (Pakistan has no daylight saving). */
export const localDate = (iso: string) => new Date(Date.parse(iso) + 5 * 3_600_000).toISOString().slice(0, 10);
/** Karachi wall-clock date + time → an instant. */
export const toInstant = (date: string, time: string) => new Date(`${date}T${time}:00+05:00`).toISOString();
export const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Half-hour appointment times 09:00–19:00 (the server's rule). */
export const SLOTS = Array.from({ length: 21 }, (_, i) => `${String(9 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);

/** A button whose label wraps instead of running off a 320 px screen at 200 % text (S.2a/S.2b lesson). */
export const WRAP = 'max-w-full whitespace-normal text-center';
