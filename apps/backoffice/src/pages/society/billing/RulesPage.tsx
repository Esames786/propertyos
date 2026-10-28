import { C1_CATEGORIES, type ChargeCategoryKey, type ChargeRule, type Money as MoneyValue, type ResolvedCharge, type RuleScope, type SiteOverview, type SiteSummary } from '@repo/contracts';
import { Badge, Button, Drawer, ErrorState, Link, Money, PageHeader, Panel, SegmentedControl, useAnnounce, useApiMutation, useApiQuery, useQueryParam, useSession, useT, useToast } from '@repo/ui';
import { CalendarClock, Check, Clock3, Layers, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { SOCIETY } from '../../../nav.config';
import { AmountInput, FlatSelect, Loading, ProblemAlert, useSocietyFormat } from '../kit';
import { ChargesTable, ChoiceCards } from '../parts';

const addMonths = (period: string, n: number) => {
  const d = new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5, 7)) - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};
const SUGGESTED: Record<string, string> = { maintenance: '3000', security: '500', lift: '300', water: '400' };

/**
 * BILL-004 charge rules and overrides (A4 §2). Site defaults first, then more specific rules: a
 * block, a flat type (penthouse) or one flat. The most specific rule in force wins, and "Which rule
 * wins" shows it for any flat, with the rules it overrode. Rules are versioned from a month; a
 * version is never edited, and a change after a preview makes that preview out of date.
 */
export default function RulesPage() {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const { can } = useSession();
  const [flatParam, setFlat] = useQueryParam('flat');
  const sites = useApiQuery<SiteSummary[]>({ method: 'GET', path: '/sites' });
  const siteId = sites.data?.[0]?.id;
  const overview = useApiQuery<SiteOverview>(siteId ? { method: 'GET', path: `/sites/${siteId}` } : null);
  const q = useApiQuery<{ rules: ChargeRule[]; period: string; categories: ChargeCategoryKey[] }>({ method: 'GET', path: '/charges/rules' });
  const [drawer, setDrawer] = useState<null | { kind: 'override' } | { kind: 'version'; rule: ChargeRule }>(null);
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data || !sites.data) return <Loading lines={8} />;
  const manage = can('charges.manage');
  const rules = q.data.rules;
  const open = q.data.period;
  const status = (r: ChargeRule) => (r.to !== undefined && r.to <= open ? 'ended' : r.from > open ? 'scheduled' : 'inForce');
  const flatId = flatParam ?? 'unt_anr_a501';

  return (
    <div className="@container space-y-6" data-testid="rules-page">
      <PageHeader
        title={t('nav:pages.rules')}
        description={t('billing:rules.intro')}
        actions={manage && rules.length > 0 ? <Button variant="primary" icon={Plus} onPress={() => setDrawer({ kind: 'override' })} data-testid="rules-add">{t('billing:rules.add')}</Button> : undefined}
      />
      {rules.length === 0 ? (
        manage && siteId ? <DefaultsPanel period={open} /> : <Panel><p className="text-sm text-muted">{t('billing:rules.none')}</p></Panel>
      ) : (
        <Panel title={t('billing:rules.listTitle')} description={t('billing:rules.listHint', { period: fmt.period(open) })}>
          <ul className="space-y-4" data-testid="rules-list">
            {C1_CATEGORIES.filter((c) => rules.some((r) => r.category === c)).map((c) => (
              <li key={c}>
                <h3 className="mb-2 text-sm font-bold text-text">{t(`billing:categories.${c}`)}</h3>
                <ul className="divide-y divide-border rounded-tile border border-border">
                  {rules
                    .filter((r) => r.category === c)
                    .sort((a, b) => a.scope.level.localeCompare(b.scope.level) || b.version - a.version)
                    .map((r) => {
                      const s = status(r);
                      return (
                        <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5" data-testid="rule-row" data-rule={r.ruleId} data-status={s}>
                          <span className="min-w-0 flex-1 basis-56">
                            <span className="block font-medium text-text">{t('billing:rules.scopeLine', { level: t(`billing:scope.${r.scope.level}`), name: r.scopeName })}</span>
                            <span className="block text-xs text-muted">
                              {t('billing:rules.versionLine', { version: r.version, from: fmt.period(r.from) })}
                              {r.to && <> · {t('billing:rules.until', { to: fmt.period(r.to) })}</>}
                            </span>
                          </span>
                          <Money value={r.amount} className="font-semibold" />
                          <Badge tone={s === 'inForce' ? 'success' : s === 'scheduled' ? 'info' : 'neutral'} icon={s === 'inForce' ? Check : s === 'scheduled' ? CalendarClock : Clock3}>{t(`billing:rules.status.${s}`)}</Badge>
                          {manage && s !== 'ended' && r.to === undefined && (
                            <Button variant="quiet" size="sm" icon={Pencil} onPress={() => setDrawer({ kind: 'version', rule: r })} aria-label={t('billing:rules.changeFor', { name: `${t(`billing:categories.${c}`)} · ${r.scopeName}` })} data-testid="rule-change">
                              {t('billing:rules.change')}
                            </Button>
                          )}
                        </li>
                      );
                    })}
                </ul>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      {siteId && (overview.data?.site.flats ?? 0) > 0 && (
        <WhichRuleWins siteId={siteId} flatId={flatId} onFlat={(id) => setFlat(id)} period={open} />
      )}
      {drawer?.kind === 'override' && overview.data && <OverrideDrawer overview={overview.data} period={open} onClose={() => setDrawer(null)} />}
      {drawer?.kind === 'version' && <VersionDrawer rule={drawer.rule} period={open} onClose={() => setDrawer(null)} />}
    </div>
  );
}

function DefaultsPanel({ period }: { period: string }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const toast = useToast();
  const announce = useAnnounce();
  const save = useApiMutation<ChargeRule[]>();
  const [amounts, setAmounts] = useState<Record<string, string>>({ ...SUGGESTED });
  const submit = async () => {
    try {
      const r = await save.mutateAsync({ method: 'POST', path: '/charges/defaults', body: { amounts, from: period } });
      const msg = t('billing:rules.defaultsSaved', { count: r.length });
      toast.success(msg);
      announce(msg);
    } catch {
      /* shown below */
    }
  };
  return (
    <Panel title={t('billing:rules.defaultsTitle')} description={t('billing:rules.defaultsHint', { period: fmt.period(period) })}>
      <div className="grid gap-4 @2xl:grid-cols-4" data-testid="rules-defaults">
        {C1_CATEGORIES.map((c) => (
          <AmountInput key={c} label={t(`billing:categories.${c}`)} value={amounts[c] ?? ''} onChange={(v) => setAmounts((a) => ({ ...a, [c]: v }))} testId={`default-${c}`} />
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">{t('billing:rules.suggestedNote')}</p>
      <div className="mt-4 flex justify-end">
        <Button variant="primary" onPress={() => void submit()} isPending={save.isPending} data-testid="rules-defaults-save">{t('billing:rules.defaultsSave')}</Button>
      </div>
      {save.isError && <ProblemAlert error={save.error} className="mt-3" />}
    </Panel>
  );
}

function OverrideDrawer({ overview, period, onClose }: { overview: SiteOverview; period: string; onClose: () => void }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const toast = useToast();
  const save = useApiMutation<ChargeRule>();
  const [category, setCategory] = useState<ChargeCategoryKey>('maintenance');
  const [level, setLevel] = useState<RuleScope['level']>('unit_type');
  const [target, setTarget] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [from, setFrom] = useState(period);
  const targets = level === 'building' ? overview.buildings.map((b) => ({ id: b.id, title: b.name })) : level === 'unit_type' ? overview.types.map((ty) => ({ id: ty.id, title: ty.name, detail: t('sites:site.typeLine', { flats: fmt.count(ty.flats), area: fmt.count(ty.areaSqft) }) })) : [];
  const submit = async () => {
    try {
      await save.mutateAsync({ method: 'POST', path: '/charges/rules', body: { category, scope: { level, id: target }, amount, from } });
      toast.success(t('billing:rules.added'));
      onClose();
    } catch {
      /* shown below */
    }
  };
  return (
    <Drawer
      isOpen
      onOpenChange={(o) => !o && onClose()}
      title={t('billing:rules.addTitle')}
      subtitle={t('billing:rules.addHint')}
      testId="rule-drawer"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onPress={onClose}>{t('common:actions.cancel')}</Button>
          <Button variant="primary" onPress={() => void submit()} isPending={save.isPending} isDisabled={!target || !amount} data-testid="rule-save">{t('billing:rules.save')}</Button>
        </div>
      }
    >
      <div className="space-y-5">
        <SegmentedControl label={t('billing:rules.category')} value={category} onChange={(v) => setCategory(v as ChargeCategoryKey)} options={C1_CATEGORIES.map((c) => ({ id: c, label: t(`billing:categories.${c}`) }))} testId="rule-category" />
        <ChoiceCards
          label={t('billing:rules.appliesTo')}
          value={level}
          onChange={(v) => {
            setLevel(v);
            setTarget(null);
          }}
          testId="rule-level"
          options={(['unit_type', 'building', 'unit'] as const).map((l) => ({ id: l, title: t(`billing:scope.${l}`), detail: t(`billing:rules.levelHint.${l}`) }))}
        />
        {level === 'unit' ? (
          <FlatSelect siteId={overview.site.id} value={target} onChange={setTarget} label={t('billing:rules.flat')} testId="rule-flat" />
        ) : (
          <ChoiceCards label={t(`billing:rules.target.${level as 'building' | 'unit_type'}`)} value={target} onChange={setTarget} testId="rule-target" options={targets} />
        )}
        <AmountInput label={t('billing:rules.amount')} value={amount} onChange={setAmount} testId="rule-amount" />
        <ChoiceCards label={t('billing:rules.from')} value={from} onChange={setFrom} testId="rule-from" options={[period, addMonths(period, 1)].map((p) => ({ id: p, title: fmt.period(p) }))} />
        {save.isError && <ProblemAlert error={save.error} />}
      </div>
    </Drawer>
  );
}

function VersionDrawer({ rule, period, onClose }: { rule: ChargeRule; period: string; onClose: () => void }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const toast = useToast();
  const save = useApiMutation<ChargeRule>();
  const [amount, setAmount] = useState('');
  const [from, setFrom] = useState(rule.from > period ? rule.from : period);
  const submit = async () => {
    try {
      await save.mutateAsync({ method: 'POST', path: `/charges/rules/${rule.ruleId}/versions`, body: { amount, from } });
      toast.success(t('billing:rules.versioned', { from: fmt.period(from) }));
      onClose();
    } catch {
      /* shown below */
    }
  };
  return (
    <Drawer
      isOpen
      onOpenChange={(o) => !o && onClose()}
      title={t('billing:rules.changeTitle', { category: t(`billing:categories.${rule.category}`), name: rule.scopeName })}
      subtitle={t('billing:rules.current', { amount: fmt.money(rule.amount) })}
      testId="version-drawer"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onPress={onClose}>{t('common:actions.cancel')}</Button>
          <Button variant="primary" onPress={() => void submit()} isPending={save.isPending} isDisabled={!amount} data-testid="version-save">{t('billing:rules.saveVersion')}</Button>
        </div>
      }
    >
      <div className="space-y-5">
        <p className="text-sm text-muted">{t('billing:rules.versionHint')}</p>
        <AmountInput label={t('billing:rules.newAmount')} value={amount} onChange={setAmount} testId="version-amount" />
        <ChoiceCards label={t('billing:rules.from')} value={from} onChange={setFrom} testId="version-from" options={[period, addMonths(period, 1)].map((p) => ({ id: p, title: fmt.period(p) }))} />
        {save.isError && <ProblemAlert error={save.error} />}
      </div>
    </Drawer>
  );
}

function WhichRuleWins({ siteId, flatId, onFlat, period }: { siteId: string; flatId: string; onFlat: (id: string) => void; period: string }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const q = useApiQuery<{ flatCode: string; lines: ResolvedCharge[]; total: MoneyValue }>({ method: 'GET', path: '/charges/resolve', query: { flat: flatId, period } });
  return (
    <Panel title={t('billing:rules.whichTitle')} description={t('billing:rules.whichHint', { period: fmt.period(period) })}>
      <div className="@container space-y-4" data-testid="which-rule-wins" data-flat={q.data?.flatCode}>
        <div className="flex flex-wrap items-end gap-4">
          <div className="w-full max-w-xs">
            <FlatSelect siteId={siteId} value={flatId} onChange={onFlat} label={t('billing:rules.flat')} testId="which-flat" />
          </div>
          {q.data && (
            <p className="text-sm text-text">
              <Layers aria-hidden className="me-1 inline size-4 text-muted" />
              {t('billing:rules.whichTotal', { flat: q.data.flatCode })} <Money value={q.data.total} className="font-bold" />
            </p>
          )}
        </div>
        {q.isError ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : q.data ? <ChargesTable lines={q.data.lines} /> : <Loading lines={4} />}
        <Link href={SOCIETY.flat(siteId, flatId, 'charges')} className="text-sm">{t('billing:rules.openFlat', { flat: q.data?.flatCode ?? '' })}</Link>
      </div>
    </Panel>
  );
}
