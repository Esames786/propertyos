import { C1_CATEGORIES, CHARGE_CATEGORIES, type ChargeCategoryKey, type ChargeRule } from '@repo/contracts';
import { Badge, ErrorState, Link, Money, PageHeader, Panel, useApiQuery, useT } from '@repo/ui';
import { CalendarClock } from 'lucide-react';
import { SOCIETY } from '../../../nav.config';
import { LaterBadge, Loading, useSocietyFormat } from '../kit';

/** Gates in which charge categories beyond C.1 arrive (A7 §C.7); others are simply not set up here. */
const LATER: Partial<Record<ChargeCategoryKey, string>> = { late_fee: 'G', parking: 'G' };

/**
 * BILL-003 charge categories and rate versions. The four categories Al-Noor bills in C.1, each
 * with its rate history by month; the others are listed as not set up, or with the gate that
 * brings them (late fees and parking). Rates are changed as new versions from a month (BILL-004).
 */
export default function ChargesPage() {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const q = useApiQuery<{ rules: ChargeRule[]; period: string }>({ method: 'GET', path: '/charges/rules' });
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={8} />;
  const others = CHARGE_CATEGORIES.filter((c) => !C1_CATEGORIES.includes(c));
  return (
    <div className="@container space-y-6" data-testid="charges-page">
      <PageHeader title={t('nav:pages.charges')} description={t('billing:charges.intro')} />
      <ul className="grid gap-4 @3xl:grid-cols-2">
        {C1_CATEGORIES.map((c) => {
          const versions = q.data!.rules.filter((r) => r.category === c).sort((a, b) => a.scope.level.localeCompare(b.scope.level) || a.from.localeCompare(b.from) || a.version - b.version);
          return (
            <li key={c}>
              <Panel title={t(`billing:categories.${c}`)} actions={<Link href={SOCIETY.rules()} className="inline-flex min-h-10 items-center text-sm">{t('billing:charges.openRules')}</Link>}>
                {versions.length === 0 ? (
                  <p className="text-sm text-muted">{t('billing:charges.notSet')}</p>
                ) : (
                  <ol className="space-y-2" data-testid={`versions-${c}`}>
                    {versions.map((v) => (
                      <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 rounded-tile border border-border px-3 py-2 text-sm">
                        <span className="min-w-0">
                          <span className="block font-medium text-text">{t('billing:rules.scopeLine', { level: t(`billing:scope.${v.scope.level}`), name: v.scopeName })}</span>
                          <span className="block text-xs text-muted">
                            {t('billing:rules.versionLine', { version: v.version, from: fmt.period(v.from) })}
                            {v.to && <> · {t('billing:rules.until', { to: fmt.period(v.to) })}</>} · {t('billing:charges.by', { name: v.createdByName })}
                          </span>
                        </span>
                        <Money value={v.amount} className="font-semibold" />
                      </li>
                    ))}
                  </ol>
                )}
              </Panel>
            </li>
          );
        })}
      </ul>
      <Panel title={t('billing:charges.otherTitle')} description={t('billing:charges.otherHint')}>
        <ul className="flex flex-wrap gap-2">
          {others.map((c) => (
            <li key={c} className="inline-flex items-center gap-2 rounded-pill bg-sunken px-3 py-1.5 text-xs text-text">
              {t(`billing:categories.${c}`)}
              {LATER[c] ? <LaterBadge gate={LATER[c]!} /> : <Badge tone="neutral" icon={CalendarClock}>{t('billing:charges.notSetUp')}</Badge>}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
