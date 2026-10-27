import type { AttentionItem, AttentionKind } from '@repo/contracts';
import { cn, DirectionalIcon, Link, PillTabs, useT } from '@repo/ui';
import { ArrowRight, CalendarClock, ChevronRight, FileCheck2, Hourglass, ReceiptText, TriangleAlert } from 'lucide-react';
import { useId } from 'react';
import type { DashboardFormat } from './useDashboardFormat';

const ORDER: AttentionKind[] = ['verification', 'followUp', 'hold', 'overdue'];

const ICON = { verification: FileCheck2, followUp: CalendarClock, hold: Hourglass, overdue: ReceiptText };

const VIEW_ALL: Record<AttentionKind, string> = {
  verification: '/backoffice/fin/unverified-transfers-queue',
  followUp: '/backoffice/home/my-tasks',
  hold: '/backoffice/crm/hold-list',
  overdue: '/backoffice/col/receivables-list',
};

/**
 * Today's work, by kind, for the signed-in role (only kinds the persona may act on arrive).
 * Tabs carry counts; each row is one link to the record; urgency is an icon + word, not colour.
 * Proof rows restate the rule that evidence is "Awaiting verification", never paid by itself.
 */
export function ActionCentre({ attention, fmt }: { attention: Partial<Record<AttentionKind, AttentionItem[]>>; fmt: DashboardFormat }) {
  const { t } = useT();
  const titleId = useId();
  const kinds = ORDER.filter((k) => attention[k] !== undefined);
  if (!kinds.length) return null;
  const total = kinds.reduce((s, k) => s + (attention[k]?.length ?? 0), 0);
  return (
    <section aria-labelledby={titleId} className="flex min-w-0 flex-col rounded-card bg-panel p-5 shadow-card sm:p-6" data-testid="action-centre">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={titleId} className="text-lg font-bold tracking-tight text-text">
            {t('dashboard:attention.title')}
          </h2>
          <p className="mt-0.5 text-sm text-muted">{t('dashboard:attention.subtitle')}</p>
        </div>
        <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-pill bg-accent-soft font-display text-lg text-accent">
          {fmt.count(total)}
        </span>
      </div>
      <PillTabs
        label={t('dashboard:attention.tabs')}
        tabs={kinds.map((k) => ({ id: k, label: t(`dashboard:attention.kind.${k}`), count: attention[k]!.length }))}
        testId="attention-tabs"
      >
        {(kind) => <AttentionList kind={kind as AttentionKind} items={attention[kind as AttentionKind] ?? []} fmt={fmt} />}
      </PillTabs>
    </section>
  );
}

function AttentionList({ kind, items, fmt }: { kind: AttentionKind; items: AttentionItem[]; fmt: DashboardFormat }) {
  const { t } = useT();
  const Icon = ICON[kind];
  if (!items.length) return <p className="py-8 text-center text-sm text-muted">{t('dashboard:attention.empty')}</p>;
  return (
    <div>
      <ul aria-label={t(`dashboard:attention.listLabel.${kind}`)} className="-mx-2 divide-y divide-border">
        {items.slice(0, 4).map((item) => (
          <li key={item.id}>
            <Link
              href={item.href}
              variant="plain"
              className="group flex items-center gap-3 rounded-control px-2 py-2.5 transition-colors duration-[var(--motion-fast)] hover:bg-raised"
              data-testid="attention-item"
            >
              <span aria-hidden className={cn('grid size-9 shrink-0 place-items-center rounded-pill', item.urgent ? 'bg-warning-soft text-warning' : 'bg-primary-soft text-primary')}>
                <Icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1 space-y-0.5">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm font-medium text-text">
                    <bdi>{item.name}</bdi>
                  </span>
                  {item.amount && (
                    <bdi dir="ltr" className="ltr-ref shrink-0 text-sm font-semibold text-text">
                      {fmt.money(item.amount.amount, 1)}
                    </bdi>
                  )}
                </span>
                <span className="flex items-center justify-between gap-3 text-xs text-muted">
                  <span className="min-w-0 truncate">{t(`dashboard:attention.when.${kind}`, { time: fmt.relative(item.at) })}</span>
                  {item.urgent ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-pill bg-warning-soft px-1.5 py-px text-[11px] font-semibold text-warning">
                      <TriangleAlert aria-hidden className="size-3" />
                      {t('dashboard:attention.urgent')}
                    </span>
                  ) : (
                    item.ref !== item.name && (
                      <bdi dir="ltr" className="ltr-ref ref-mono shrink-0 text-[11px]">
                        {item.ref}
                      </bdi>
                    )
                  )}
                </span>
              </span>
              <DirectionalIcon icon={ChevronRight} className="size-4 shrink-0 text-muted transition-transform duration-[var(--motion-fast)] group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
            </Link>
          </li>
        ))}
      </ul>
      {kind === 'verification' && <p className="mt-3 rounded-tile bg-info-soft px-3 py-2 text-xs text-info">{t('dashboard:attention.verificationNote')}</p>}
      <Link href={VIEW_ALL[kind]} variant="plain" className="group mt-3 inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-primary">
        {t('dashboard:attention.viewAll')}
        <span className="sr-only">: {t(`dashboard:attention.listLabel.${kind}`)}</span>
        <DirectionalIcon icon={ArrowRight} className="size-4" />
      </Link>
    </div>
  );
}
