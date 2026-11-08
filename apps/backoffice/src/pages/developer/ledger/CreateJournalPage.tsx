import { ApiError, type JournalFormOptions, type JournalView } from '@repo/contracts';
import { Button, dynamicT, ErrorState, IconButton, InlineAlert, Money, NotFoundState, PageHeader, Panel, PlainTextField, SelectControl, useApiQuery, useKeyedCreate, useNavigation, useQueryParam, useT, useToast } from '@repo/ui';
import { Plus, Save, Send, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Loading, ProblemAlert } from '../../society/kit';
import { DateInput, fieldErrorKey, useFieldError } from '../../society/hr/hkit';
import { ACC, Blocked, EntityBar, LedgerNav, ProvisionalNotice, useAccountName, useEntityParam, WRAP } from './lkit';

/**
 * ACC-004 Create journal (PARTIAL, Gate E.7 Wave 1). A manual journal of one legal entity: dated in an
 * open period, two to twenty lines, each on one side only, debits equal to credits to the paisa. The
 * live totals say whether it balances before anything is sent; the server checks everything again.
 * Saved as a draft or submitted for approval by someone else; posting is a later step by someone other
 * than the maker. Cash at bank and revenue accounts are locked (E-17, E-15). `?record=` edits a draft.
 */
interface Line {
  key: number;
  accountId: string | null;
  debit: string;
  credit: string;
  memo: string;
  costCentreId: string | null;
}

const blank = (key: number): Line => ({ key, accountId: null, debit: '', credit: '', memo: '', costCentreId: null });
const AMOUNT = /^\d{1,9}(\.\d{1,2})?$/;
const paisa = (v: string): bigint | null => {
  const s = v.trim().replace(/,/g, '');
  if (!s) return 0n;
  if (!AMOUNT.test(s)) return null;
  const [w, f = ''] = s.split('.');
  return BigInt(w!) * 100n + BigInt((f + '00').slice(0, 2));
};
const money = (p: bigint) => ({ amount: `${p < 0n ? '-' : ''}${(p < 0n ? -p : p) / 100n}.${String((p < 0n ? -p : p) % 100n).padStart(2, '0')}`, currency: 'PKR' as const });

export default function CreateJournalPage() {
  const [record] = useQueryParam('record');
  return record ? <EditJournal id={record} /> : <NewJournal />;
}

function NewJournal() {
  const [entity, setEntity] = useEntityParam();
  const q = useApiQuery<JournalFormOptions>({ method: 'GET', path: '/ledger/journal-form', query: entity ? { entity } : {} });
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={8} />;
  return <JournalForm key={q.data.entity.id} options={q.data} onEntity={setEntity} />;
}

function EditJournal({ id }: { id: string }) {
  const { t } = useT();
  const j = useApiQuery<JournalView>({ method: 'GET', path: `/ledger/journals/${id}` });
  const entity = j.data?.entity.id;
  const q = useApiQuery<JournalFormOptions>(entity ? { method: 'GET', path: '/ledger/journal-form', query: { entity } } : null);
  if (j.error instanceof ApiError && j.error.problem.status === 404) return <NotFoundState headingLevel={1} />;
  if (j.isError) return <ErrorState error={j.error} onRetry={() => void j.refetch()} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!j.data || !q.data) return <Loading lines={8} />;
  if (!j.data.actions.edit) {
    return (
      <div className="space-y-5" data-testid="journal-not-editable">
        <PageHeader title={t('ledger:create.editTitle', { ref: j.data.ref })} />
        <InlineAlert tone="warning" title={t('ledger:create.notEditableTitle')}>
          {t(j.data.state === 'posted' ? 'ledger:create.notEditablePosted' : 'ledger:create.notEditable')}
        </InlineAlert>
      </div>
    );
  }
  return <JournalForm options={q.data} existing={j.data} />;
}

function JournalForm({ options, existing, onEntity }: { options: JournalFormOptions; existing?: JournalView; onEntity?: (id: string) => void }) {
  const { t } = useT();
  const dt = dynamicT(t);
  const toast = useToast();
  const { navigate } = useNavigation();
  const name = useAccountName();
  const [date, setDate] = useState(existing?.date ?? options.today);
  const [memo, setMemo] = useState(existing?.memo ?? '');
  const [lines, setLines] = useState<Line[]>(() =>
    existing
      ? existing.lines.map((l, i) => ({ key: i + 1, accountId: l.accountId, debit: l.debit.amount === '0.00' ? '' : l.debit.amount, credit: l.credit.amount === '0.00' ? '' : l.credit.amount, memo: l.memo ?? '', costCentreId: l.costCentreId ?? null }))
      : [blank(1), blank(2)],
  );
  const [error, setError] = useState<unknown>(null);
  const save = useKeyedCreate<JournalView>(existing ? 'jnl-edit' : 'jnl-new');
  const submitAfterEdit = useKeyedCreate<JournalView>('jnl-submit');
  const fieldError = useFieldError(error);

  const accountOptions = useMemo(
    () => options.accounts.map((a) => ({ id: a.id, label: `${a.code} · ${name(a)}`, ...(a.lock ? { isDisabled: true, description: t(`ledger:lock.${a.lock}`) } : {}) })),
    [options.accounts, name, t],
  );
  const ccOptions = useMemo(() => [{ id: '', label: t('ledger:create.noCostCentre') }, ...options.costCentres.map((c) => ({ id: c.id, label: `${c.code} · ${dt(c.labelKey)}` }))], [options.costCentres, t, dt]);

  const totals = useMemo(() => {
    let debit = 0n;
    let credit = 0n;
    let bad = false;
    for (const l of lines) {
      const d = paisa(l.debit);
      const c = paisa(l.credit);
      if (d === null || c === null) bad = true;
      else {
        debit += d;
        credit += c;
      }
    }
    return { debit, credit, bad };
  }, [lines]);
  const filled = lines.filter((l) => l.accountId && (paisa(l.debit) ?? 0n) + (paisa(l.credit) ?? 0n) > 0n).length;
  const balanced = !totals.bad && totals.debit === totals.credit && totals.debit > 0n;
  const why = totals.bad ? 'ledger:create.why.amount' : filled < 2 ? 'ledger:create.why.lines' : !balanced ? 'ledger:create.why.unbalanced' : !options.openPeriods.includes(date.slice(0, 7)) ? 'ledger:create.why.period' : null;

  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const body = (submit: boolean) => ({
    entityId: options.entity.id,
    date,
    memo,
    submit,
    lines: lines.filter((l) => l.accountId || l.debit || l.credit).map((l) => ({ accountId: l.accountId ?? '', debit: l.debit, credit: l.credit, ...(l.memo ? { memo: l.memo } : {}), ...(l.costCentreId ? { costCentreId: l.costCentreId } : {}) })),
  });
  const send = async (submit: boolean) => {
    setError(null);
    try {
      let v: JournalView;
      if (existing) {
        v = await save.send({ method: 'POST', path: `/ledger/journals/${existing.id}/edit`, body: body(false) });
        if (submit) v = await submitAfterEdit.send({ method: 'POST', path: `/ledger/journals/${existing.id}/submit`, body: {} });
      } else v = await save.send({ method: 'POST', path: '/ledger/journals', body: body(submit) });
      toast.success(t(submit ? 'ledger:create.submitted' : 'ledger:create.saved', { ref: v.ref }));
      navigate(ACC.journal(v.id));
    } catch (e) {
      setError(e);
    }
  };
  const lineError = (i: number, f: string) => fieldErrorKey(error, `lines.${i}.${f}`);
  const pending = save.isPending || submitAfterEdit.isPending;

  return (
    <div className="@container space-y-5" data-testid="journal-form" data-mode={existing ? 'edit' : 'new'}>
      <PageHeader title={existing ? t('ledger:create.editTitle', { ref: existing.ref }) : t('ledger:create.title')} description={t('ledger:create.intro')} />
      <LedgerNav current={existing ? null : 'create'} entity={options.entity.id} />
      <ProvisionalNotice screen="create" />
      {onEntity ? <EntityBar scope={options} onChange={onEntity} /> : null}
      {error ? <ProblemAlert error={error} /> : null}
      <Panel title={t('ledger:create.headerTitle')}>
        <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-2">
          <DateInput id="journal-date" label={t('ledger:create.date')} value={date} onChange={setDate} max={options.today} testId="journal-date" description={fieldError('date') ?? t('ledger:create.dateHint')} />
          <PlainTextField label={t('ledger:create.memo')} value={memo} onChange={setMemo} errorKey={fieldErrorKey(error, 'memo')} testId="journal-memo" description={t('ledger:create.memoHint')} />
        </div>
      </Panel>
      <Panel title={t('ledger:create.linesTitle')} description={t('ledger:create.linesHint')}>
        <ol className="space-y-4" data-testid="journal-form-lines">
          {lines.map((l, i) => (
            <li key={l.key} className="space-y-3 rounded-tile border border-border/70 p-3" data-testid="journal-form-line">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold">{t('ledger:create.lineN', { n: i + 1 })}</p>
                {lines.length > 2 && <IconButton icon={Trash2} label={t('ledger:create.removeLine', { n: i + 1 })} onPress={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} />}
              </div>
              <div className="grid grid-cols-1 gap-3 @3xl:grid-cols-2">
                <SelectControl label={t('ledger:create.account')} options={accountOptions} value={l.accountId} onChange={(id) => update(l.key, { accountId: id })} errorKey={lineError(i, 'accountId')} testId={`journal-line-${i}-account`} placeholder={t('ledger:create.chooseAccount')} />
                <SelectControl label={t('ledger:create.costCentre')} options={ccOptions} value={l.costCentreId ?? ''} onChange={(id) => update(l.key, { costCentreId: id || null })} optional testId={`journal-line-${i}-cc`} />
                <PlainTextField label={t('ledger:journal.debit')} value={l.debit} onChange={(v) => update(l.key, { debit: v })} inputMode="decimal" dir="ltr" errorKey={lineError(i, 'debit') ?? lineError(i, 'amount')} testId={`journal-line-${i}-debit`} />
                <PlainTextField label={t('ledger:journal.credit')} value={l.credit} onChange={(v) => update(l.key, { credit: v })} inputMode="decimal" dir="ltr" errorKey={lineError(i, 'credit')} testId={`journal-line-${i}-credit`} />
                <PlainTextField label={t('ledger:create.lineMemo')} value={l.memo} onChange={(v) => update(l.key, { memo: v })} optional className="@3xl:col-span-2" testId={`journal-line-${i}-memo`} />
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-3">
          <Button icon={Plus} isDisabled={lines.length >= 20} onPress={() => setLines((ls) => [...ls, blank(Math.max(...ls.map((x) => x.key)) + 1)])} data-testid="journal-add-line">
            {t('ledger:create.addLine')}
          </Button>
        </div>
      </Panel>
      <Panel title={t('ledger:create.totalsTitle')}>
        <dl className="grid grid-cols-1 gap-2 text-sm @xl:grid-cols-3" aria-live="polite" data-testid="journal-totals" data-balanced={balanced}>
          <div>
            <dt className="text-muted">{t('ledger:create.totalDebit')}</dt>
            <dd className="font-semibold" data-testid="journal-total-debit">
              <Money value={money(totals.debit)} />
            </dd>
          </div>
          <div>
            <dt className="text-muted">{t('ledger:create.totalCredit')}</dt>
            <dd className="font-semibold" data-testid="journal-total-credit">
              <Money value={money(totals.credit)} />
            </dd>
          </div>
          <div>
            <dt className="text-muted">{t('ledger:create.difference')}</dt>
            <dd className="font-semibold" data-testid="journal-difference">
              {balanced ? t('ledger:create.balanced') : <Money value={money(totals.debit - totals.credit)} />}
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-muted">{t('ledger:create.policy', { version: options.policy.version })}</p>
      </Panel>
      <div className="flex flex-wrap gap-2">
        <Button className={WRAP} icon={Save} isDisabled={!!why} isPending={pending} onPress={() => void send(false)} data-testid="journal-save" {...(why ? { disabledReason: t(why) } : {})}>
          {t('ledger:create.save')}
        </Button>
        <Button className={WRAP} variant="primary" icon={Send} isDisabled={!!why} isPending={pending} onPress={() => void send(true)} data-testid="journal-send" {...(why ? { disabledReason: t(why) } : {})}>
          {t('ledger:create.submit')}
        </Button>
      </div>
      {why && <Blocked testId="journal-why">{t(why)}</Blocked>}
    </div>
  );
}
