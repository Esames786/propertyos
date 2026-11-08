import type { AccessTarget, JournalState, LedgerEntityRef, LedgerEvent, LedgerScope } from '@repo/contracts';
import { AccessOutcomeView, Badge, cn, DateTime, dynamicT, InlineAlert, Link, SelectControl, useQueryParam, useSession, useT, type StatusTone } from '@repo/ui';
import { Ban, BadgeCheck, CircleDashed, FlaskConical, Hourglass, Lock, PencilLine, ShieldCheck, Undo2, XCircle, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { LINKS } from '../../../nav.config';
import { unbroken } from '../../society/hr/hkit';
import { useSocietyFormat } from '../../society/kit';

/**
 * Gate E.7 (provisional, Wave 1): shared pieces of the developer ledger and bank-import screens.
 * Section navigation between the eleven screens, the legal-entity switcher (every read is for one
 * entity), journal states that never rely on colour alone and never call anything "paid" or
 * "settled", the access gate (the Gate B outcome page for a person without the permission), and the
 * provisional notice every screen carries while it is PARTIAL.
 */
export const GL_VIEW: AccessTarget = { module: 'accounting', permission: 'gl.view', suspension: 'history_read' };
export const GL_POST: AccessTarget = { module: 'accounting', permission: 'gl.post' };
export const BANK_VIEW: AccessTarget = { module: 'banking', permission: 'bank.view', suspension: 'history_read' };

/** A list keeps showing what it had while a new search, filter or month loads (no flash of the whole screen). */
export const KEEP = { placeholderData: <T,>(previous: T | undefined) => previous };

/** A button whose label wraps (320 px with 200 % text, long Urdu labels). */
export const WRAP = 'max-w-full whitespace-normal text-center';

const withQuery = (path: string, params: Record<string, string | undefined | null>) => {
  const q = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => !!e[1])).toString();
  return q ? `${path}?${q}` : path;
};

export const ACC = {
  chart: (entity?: string) => withQuery('/backoffice/acc/chart-of-accounts', { entity }),
  account: (id: string) => withQuery('/backoffice/acc/account-workspace', { record: id }),
  journals: (p: { entity?: string; filter?: string; record?: string } = {}) => withQuery('/backoffice/acc/journal-entries', p),
  journal: (id: string) => withQuery('/backoffice/acc/journal-entries', { record: id }),
  create: (entity?: string) => withQuery('/backoffice/acc/create-journal', { entity }),
  edit: (id: string) => withQuery('/backoffice/acc/create-journal', { record: id }),
  reverse: (id?: string) => withQuery('/backoffice/acc/reverse-journal', { record: id }),
  trialBalance: (p: { entity?: string; period?: string } = {}) => withQuery('/backoffice/acc/trial-balance', p),
  profitAndLoss: (p: { entity?: string; period?: string } = {}) => withQuery('/backoffice/acc/profit-and-loss', p),
  balanceSheet: (p: { entity?: string; period?: string } = {}) => withQuery('/backoffice/acc/balance-sheet', p),
  periods: (entity?: string) => withQuery('/backoffice/acc/accounting-periods', { entity }),
  rules: (entity?: string) => withQuery('/backoffice/acc/posting-rules', { entity }),
  bankImport: (p: { entity?: string; record?: string } = {}) => withQuery('/backoffice/bank/bank-import', p),
};

/** The person may open the screen, or sees the Gate B outcome page saying why not. */
export function LedgerGate({ target, children }: { target: AccessTarget; children: ReactNode }) {
  const { decide, tenant, can } = useSession();
  const d = decide(target);
  if (d.allowed) return <>{children}</>;
  return <AccessOutcomeView reason={d.reason} {...(target.module ? { module: target.module } : {})} organisation={tenant.name} startHref={LINKS.start} {...(can('admin.view') ? { planHref: LINKS.plan } : {})} />;
}

type Section = 'chart' | 'journals' | 'create' | 'trialBalance' | 'profitAndLoss' | 'balanceSheet' | 'periods' | 'rules' | 'bank';

const SECTIONS: Array<{ id: Section; href: (entity?: string) => string; target: AccessTarget }> = [
  { id: 'journals', href: (e) => ACC.journals({ ...(e ? { entity: e } : {}) }), target: GL_VIEW },
  { id: 'create', href: (e) => ACC.create(e), target: GL_POST },
  { id: 'chart', href: (e) => ACC.chart(e), target: GL_VIEW },
  { id: 'trialBalance', href: (e) => ACC.trialBalance({ ...(e ? { entity: e } : {}) }), target: GL_VIEW },
  { id: 'profitAndLoss', href: (e) => ACC.profitAndLoss({ ...(e ? { entity: e } : {}) }), target: GL_VIEW },
  { id: 'balanceSheet', href: (e) => ACC.balanceSheet({ ...(e ? { entity: e } : {}) }), target: GL_VIEW },
  { id: 'periods', href: (e) => ACC.periods(e), target: GL_VIEW },
  { id: 'rules', href: (e) => ACC.rules(e), target: GL_VIEW },
  { id: 'bank', href: (e) => ACC.bankImport({ ...(e ? { entity: e } : {}) }), target: BANK_VIEW },
];

/** Every ledger screen one step from every other the person may open (no menu entry until E.0). */
export function LedgerNav({ current, entity }: { current: Section | null; entity?: string }) {
  const { t } = useT();
  const { allows } = useSession();
  const shown = SECTIONS.filter((s) => allows(s.target));
  if (shown.length < 2) return null;
  return (
    <nav aria-label={t('ledger:nav.label')} className="-mt-2 mb-5" data-testid="ledger-nav">
      <ul className="flex flex-wrap gap-1.5">
        {shown.map((s) => (
          <li key={s.id}>
            <Link
              href={s.href(entity)}
              variant="plain"
              aria-current={s.id === current ? 'page' : undefined}
              className={cn(
                'inline-flex min-h-9 items-center rounded-pill border px-3 text-sm font-medium outline-none focus-visible:outline-2 focus-visible:outline-focus',
                s.id === current ? 'border-primary bg-primary text-on-primary' : 'border-border bg-panel text-text hover:bg-raised',
              )}
              data-testid={`ledger-nav-${s.id}`}
            >
              {t(`ledger:nav.${s.id}`)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** The entity the screen is for (`?entity=`; the server answers for the reader's first one by default). */
export function useEntityParam(): [string | undefined, (id: string) => void] {
  const [entity, setEntity] = useQueryParam('entity');
  return [entity ?? undefined, (id) => setEntity(id)];
}

/** Which legal entity: a choice when the reader has several, a plain statement otherwise (E-37: set by administration). */
export function EntityBar({ scope, onChange }: { scope: LedgerScope; onChange: (id: string) => void }) {
  const { t } = useT();
  return (
    <div className="flex flex-wrap items-end gap-3" data-testid="ledger-entity" data-entity={scope.entity.id}>
      {scope.entities.length > 1 ? (
        <div className="w-full max-w-sm">
          <SelectControl label={t('ledger:entity.label')} options={scope.entities.map((e: LedgerEntityRef) => ({ id: e.id, label: e.name }))} value={scope.entity.id} onChange={(id) => id && onChange(id)} testId="ledger-entity-select" />
        </div>
      ) : (
        <p className="text-sm">
          <span className="text-muted">{t('ledger:entity.label')}:</span> <bdi className="font-semibold">{scope.entity.name}</bdi>
        </p>
      )}
      <p className="text-xs text-muted">{t('ledger:entity.configured')}</p>
    </div>
  );
}

/** Every screen is PARTIAL in this wave: the notice names what waits and why. */
export function ProvisionalNotice({ screen }: { screen: 'chart' | 'account' | 'journals' | 'create' | 'reverse' | 'reports' | 'periods' | 'rules' | 'bank' }) {
  const { t } = useT();
  return (
    <InlineAlert tone="info" title={t('ledger:provisional.title')} data-testid="ledger-provisional">
      <p className="break-words">{t(`ledger:provisional.${screen}`)}</p>
      <p className="mt-1 text-xs break-words text-muted">{t('ledger:provisional.fictional')}</p>
    </InlineAlert>
  );
}

const JOURNAL: Record<JournalState | 'reversed', [StatusTone, LucideIcon]> = {
  draft: ['neutral', PencilLine],
  submitted: ['info', Hourglass],
  approved: ['warning', ShieldCheck],
  posted: ['success', BadgeCheck],
  rejected: ['neutral', XCircle],
  cancelled: ['neutral', Ban],
  reversed: ['neutral', Undo2],
};

/** "Proposed — not posted" until posted; a posted journal with a posted reversal reads "Posted · reversed". */
export function JournalBadge({ state, reversed = false }: { state: JournalState; reversed?: boolean }) {
  const { t } = useT();
  const key = state === 'posted' && reversed ? 'reversed' : state;
  const [tone, icon] = JOURNAL[key];
  return (
    <Badge tone={tone} icon={icon} data-testid="journal-state" data-state={key}>
      {t(`ledger:journalState.${key}`)}
    </Badge>
  );
}

export function DemoBadge() {
  const { t } = useT();
  return (
    <Badge tone="demo" icon={FlaskConical} data-testid="journal-demo">
      {t('ledger:journal.demo')}
    </Badge>
  );
}

/** An account's name in the reader's language (seeded accounts are translated; drafted ones as entered). */
export function useAccountName() {
  const { t } = useT();
  const dt = dynamicT(t);
  return (a: { name?: string; labelKey?: string; accountName?: string; accountLabelKey?: string }) => {
    const key = a.labelKey ?? a.accountLabelKey;
    return key ? dt(key) : (a.accountName ?? a.name ?? '');
  };
}

export function AccountRef({ code, name, href, testId }: { code: string; name: string; href?: string; testId?: string }) {
  const content = (
    <>
      <bdi dir="ltr" className="font-mono text-xs">
        {code}
      </bdi>{' '}
      <bdi className="break-words">{name}</bdi>
    </>
  );
  return href ? (
    <Link href={href} data-testid={testId}>
      {content}
    </Link>
  ) : (
    <span data-testid={testId}>{content}</span>
  );
}

/** A locked account's reason (E-15 / E-17), always in words. */
export function LockBadge({ lock }: { lock: 'cash_evidence' | 'revenue_policy' }) {
  const { t } = useT();
  return (
    <Badge tone="neutral" icon={Lock} data-testid="account-lock" data-lock={lock}>
      {t(`ledger:lock.${lock}`)}
    </Badge>
  );
}

export function Ref({ value }: { value: string }) {
  return (
    <bdi dir="ltr" className="ltr-ref">
      {unbroken(value)}
    </bdi>
  );
}

/** Record history: who did what and when (names of colleagues of the same entity only). */
export function History({ events, testId }: { events: LedgerEvent[]; testId?: string }) {
  const { t } = useT();
  const dt = dynamicT(t);
  const fmt = useSocietyFormat();
  const shown = (values: Record<string, string> = {}) =>
    Object.fromEntries(Object.entries(values).map(([k, v]) => [k, /^-?\d+\.\d{2}$/.test(v) ? fmt.money({ amount: v, currency: 'PKR' }) : /^\d{4}-\d{2}-\d{2}$/.test(v) ? fmt.date(v) : unbroken(v)]));
  if (!events.length) return <p className="text-sm text-muted">{t('ledger:history.none')}</p>;
  return (
    <ol className="space-y-2" data-testid={testId}>
      {[...events].reverse().map((h, i) => (
        <li key={i} className="border-s-2 border-border ps-3 text-sm">
          {dt(`ledger:history.${h.action}`, { defaultValue: h.action, ...shown(h.values) })}
          <span className="block text-xs text-muted">
            <bdi>{h.byName}</bdi> ·{' '}
            <bdi>
              <DateTime value={h.at} style="dateTime" />
            </bdi>
          </span>
          {h.note && <span className="block text-xs break-words text-muted">“{h.note}”</span>}
        </li>
      ))}
    </ol>
  );
}

/** A blocked action, with the reason in words next to it (never an unexplained dead button). */
export function Blocked({ children, testId = 'ledger-blocked' }: { children: string; testId?: string }) {
  return (
    <p className="flex items-start gap-1.5 text-sm text-muted" data-testid={testId}>
      <CircleDashed aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0 break-words">{children}</span>
    </p>
  );
}

/** Period "YYYY-MM" in the reader's language. */
export function usePeriodName() {
  const fmt = useSocietyFormat();
  return (p: string) => fmt.period(p);
}
