import { ApiError, type BankImportRowStatus, type BankImportsView, type BankImportView } from '@repo/contracts';
import { Badge, Button, ConfirmDialog, dynamicT, EmptyState, ErrorState, InlineAlert, Link, Money, NotFoundState, PageHeader, Panel, PlainTextArea, SelectControl, useApiQuery, useKeyedCreate, useQueryParam, useQueryParams, useT, useToast, type StatusTone } from '@repo/ui';
import { BadgeCheck, Ban, CircleAlert, Copy, Eye, FileWarning, Hourglass, Landmark, PlusCircle, Send, ShieldCheck, Trash2, XCircle, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { Loading, ProblemAlert, ScrollRegion, useSocietyFormat } from '../../society/kit';
import { fieldErrorKey, useProblemToast } from '../../society/hr/hkit';
import { ACC, Blocked, EntityBar, History, LedgerNav, ProvisionalNotice, Ref, useEntityParam, WRAP, KEEP } from './lkit';

/**
 * BANK-005 Bank import (PARTIAL, Gate E.7 Wave 1). Only holders of the bank permission reach it (the
 * shell and the server refuse anyone else). A labelled sample statement (or a pasted CSV) is checked
 * on the server for one of the entity's verified accounts: every row is validated, a transaction seen
 * earlier in the file or already imported for that account is flagged, nothing is stored yet. The
 * uploader submits the preview; someone else with bank.reconcile approves it, and only the new rows
 * become **unmatched statement lines**: never receipts, never payments, never settlements, and no
 * journal is created from them. An unknown, other-entity or unverified account gets one refusal.
 */
const ROW: Record<BankImportRowStatus, [StatusTone, LucideIcon]> = { new: ['success', PlusCircle], duplicate_in_file: ['warning', Copy], duplicate_prior: ['neutral', Copy], invalid: ['error', FileWarning] };
const STATE: Record<BankImportView['state'], [StatusTone, LucideIcon]> = { preview: ['info', Eye], awaiting_approval: ['warning', Hourglass], committed: ['success', ShieldCheck], rejected: ['neutral', XCircle], discarded: ['neutral', Ban] };

export default function BankImportPage() {
  const { t } = useT();
  const [entity, setEntity] = useEntityParam();
  const [record] = useQueryParam('record');
  const q = useApiQuery<BankImportsView>({ method: 'GET', path: '/bank/imports', query: entity ? { entity } : {} }, KEEP);
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={10} />;
  const d = q.data;
  return (
    <div className="@container space-y-5" data-testid="bank-import">
      <PageHeader title={t('ledger:bank.title')} description={t('ledger:bank.intro')} />
      <LedgerNav current="bank" entity={entity} />
      <ProvisionalNotice screen="bank" />
      <InlineAlert tone="warning" title={t('ledger:bank.boundaryTitle')} data-testid="bank-boundary">
        {t('ledger:bank.boundary')}
      </InlineAlert>
      <EntityBar scope={d} onChange={setEntity} />
      <Panel title={t('ledger:bank.accountsTitle')}>
        <ul className="divide-y divide-border/70" data-testid="bank-accounts">
          {d.accounts.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm" data-testid="bank-account" data-account={a.id} data-verified={a.verified}>
              <span className="min-w-0">
                <Landmark aria-hidden className="me-1 inline size-4 text-muted" />
                <bdi className="font-semibold">{a.name}</bdi> · <bdi>{a.bankName}</bdi> · <bdi dir="ltr">{a.ibanMasked}</bdi>
              </span>
              <Badge tone={a.verified ? 'success' : 'neutral'} icon={a.verified ? BadgeCheck : CircleAlert}>
                {t(a.verified ? 'ledger:bank.verified' : 'ledger:bank.unverified')}
              </Badge>
            </li>
          ))}
        </ul>
      </Panel>
      {d.canImport ? <NewImport d={d} /> : <Blocked testId="bank-no-import">{t('ledger:bank.noImport')}</Blocked>}
      {record && <ImportDetail id={record} />}
      <Panel title={t('ledger:bank.importsTitle')}>
        {d.imports.length === 0 ? (
          <EmptyState title={t('ledger:bank.noImports')} />
        ) : (
          <ul className="divide-y divide-border/70" data-testid="bank-imports">
            {d.imports.map((i) => {
              const [tone, icon] = STATE[i.state];
              return (
                <li key={i.id} className="flex flex-wrap items-start justify-between gap-2 py-3 text-sm" data-testid="bank-import-row" data-ref={i.ref} data-state={i.state}>
                  <span className="min-w-0 space-y-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <Link href={ACC.bankImport({ entity: d.entity.id, record: i.id })}>
                        <Ref value={i.ref} />
                      </Link>
                      <Badge tone={tone} icon={icon}>
                        {t(`ledger:bank.state.${i.state}`)}
                      </Badge>
                    </span>
                    <span className="block break-words text-muted">
                      <bdi dir="ltr">{i.fileName}</bdi> · <bdi>{i.account.name}</bdi>
                    </span>
                    <span className="block text-xs text-muted">{t('ledger:bank.counts', { rows: i.counts.rows, fresh: i.counts.new, dupes: i.counts.duplicateInFile + i.counts.duplicatePrior, invalid: i.counts.invalid })}</span>
                  </span>
                  <span className="text-end text-xs text-muted">{t('ledger:bank.preparedBy', { name: i.preparedByName })}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
      <Panel title={t('ledger:bank.linesTitle', { count: d.lines.length })}>
        <p className="mb-3 text-sm text-muted">{t('ledger:bank.linesIntro')}</p>
        {d.lines.length === 0 ? (
          <EmptyState title={t('ledger:bank.noLines')} />
        ) : (
          <ul className="divide-y divide-border/70" data-testid="bank-lines">
            {d.lines.map((l) => (
              <li key={l.id} className="flex flex-wrap items-start justify-between gap-2 py-2 text-sm" data-testid="bank-line" data-txn={l.bankTxnId}>
                <span className="min-w-0">
                  <bdi dir="ltr" className="font-mono text-xs">{l.bankTxnId}</bdi> · <LineDate date={l.valueDate} />
                  <span className="block break-words text-muted">
                    {l.narration} · <bdi>{l.reference}</bdi> · <bdi>{l.counterpartyName}</bdi>
                  </span>
                  <Badge tone="neutral" icon={CircleAlert} data-testid="bank-line-state" data-state={l.state}>
                    {t('ledger:bank.unmatched')}
                  </Badge>
                </span>
                <span className="text-end">
                  <Money value={l.direction === 'debit' ? { ...l.amount, amount: `-${l.amount.amount}` } : l.amount} />
                  <span className="block text-xs text-muted">{t(`ledger:bank.direction.${l.direction}`)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function LineDate({ date }: { date: string }) {
  const fmt = useSocietyFormat();
  return <bdi>{fmt.date(date)}</bdi>;
}

function NewImport({ d }: { d: BankImportsView }) {
  const { t } = useT();
  const dt = dynamicT(t);
  const toast = useToast();
  const setParams = useQueryParams();
  const verified = d.accounts.filter((a) => a.verified);
  const [account, setAccount] = useState<string | null>(d.samples[0]?.accountId ?? verified[0]?.id ?? null);
  const [source, setSource] = useState<string>(d.samples[0] ? `sample-${d.samples[0].n}` : 'paste');
  const [content, setContent] = useState('');
  const [error, setError] = useState<unknown>(null);
  const preview = useKeyedCreate<BankImportView>('bim-preview');
  const sample = d.samples.find((s) => `sample-${s.n}` === source);
  return (
    <Panel title={t('ledger:bank.newTitle')} description={t('ledger:bank.newIntro')}>
      <div className="space-y-4" data-testid="bank-new">
        {error ? <ProblemAlert error={error} /> : null}
        <SelectControl
          label={t('ledger:bank.account')}
          options={d.accounts.map((a) => ({ id: a.id, label: `${a.name} · ${a.ibanMasked}`, ...(a.verified ? {} : { description: t('ledger:bank.unverified') }) }))}
          value={account}
          onChange={setAccount}
          errorKey={fieldErrorKey(error, 'accountId')}
          description={t('ledger:bank.accountHint')}
          testId="bank-account-select"
        />
        <SelectControl
          label={t('ledger:bank.file')}
          options={[...d.samples.map((s) => ({ id: `sample-${s.n}`, label: dt(s.labelKey) })), { id: 'paste', label: t('ledger:bank.paste') }]}
          value={source}
          onChange={(v) => {
            setSource(v ?? 'paste');
            const s = d.samples.find((x) => `sample-${x.n}` === v);
            if (s) setAccount(s.accountId);
          }}
          errorKey={fieldErrorKey(error, 'file')}
          testId="bank-file-select"
        />
        {sample ? (
          <details className="text-sm" data-testid="bank-sample-content">
            <summary className="cursor-pointer text-muted">{t('ledger:bank.showFile', { name: sample.fileName })}</summary>
            <ScrollRegion label={t('ledger:bank.showFile', { name: sample.fileName })} className="mt-2">
              <pre dir="ltr" className="rounded-tile bg-sunken p-3 text-xs whitespace-pre">{sample.content}</pre>
            </ScrollRegion>
          </details>
        ) : (
          <PlainTextArea label={t('ledger:bank.pasteLabel')} value={content} onChange={setContent} rows={6} description={t('ledger:bank.pasteHint')} testId="bank-paste" />
        )}
        <Button
          className={WRAP}
          variant="primary"
          icon={Eye}
          isPending={preview.isPending}
          onPress={async () => {
            setError(null);
            try {
              const v = await preview.send({ method: 'POST', path: '/bank/imports', body: { entityId: d.entity.id, accountId: account ?? '', ...(sample ? { sample: sample.n } : { content, fileName: 'pasted-statement.csv' }) } });
              toast.success(t('ledger:bank.previewed', { ref: v.ref }));
              setParams({ record: v.id });
            } catch (e) {
              setError(e);
            }
          }}
          data-testid="bank-preview"
        >
          {t('ledger:bank.previewButton')}
        </Button>
      </div>
    </Panel>
  );
}

function ImportDetail({ id }: { id: string }) {
  const { t } = useT();
  const q = useApiQuery<BankImportView>({ method: 'GET', path: `/bank/imports/${id}` });
  if (q.error instanceof ApiError && q.error.problem.status === 404) return <NotFoundState />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={6} />;
  const v = q.data;
  const [tone, icon] = STATE[v.state];
  return (
    <Panel title={t('ledger:bank.detailTitle', { ref: v.ref })}>
      <div className="space-y-4" data-testid="bank-import-detail" data-ref={v.ref} data-state={v.state}>
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <Badge tone={tone} icon={icon} data-testid="bank-import-state" data-state={v.state}>
            {t(`ledger:bank.state.${v.state}`)}
          </Badge>
          <bdi dir="ltr">{v.fileName}</bdi> · <bdi>{v.account.name}</bdi> · <bdi dir="ltr">{v.account.ibanMasked}</bdi>
          {v.sample && <Badge tone="demo">{t('ledger:bank.sample')}</Badge>}
        </p>
        <dl className="grid grid-cols-1 gap-2 text-sm @xl:grid-cols-3 @4xl:grid-cols-5" data-testid="bank-import-counts" data-new={v.counts.new} data-dup-file={v.counts.duplicateInFile} data-dup-prior={v.counts.duplicatePrior} data-invalid={v.counts.invalid}>
          {(
            [
              ['rows', v.counts.rows],
              ['new', v.counts.new],
              ['duplicateInFile', v.counts.duplicateInFile],
              ['duplicatePrior', v.counts.duplicatePrior],
              ['invalid', v.counts.invalid],
            ] as const
          ).map(([k, n]) => (
            <div key={k} className="rounded-tile border border-border/70 p-2">
              <dt className="text-xs text-muted">{t(`ledger:bank.count.${k}`)}</dt>
              <dd className="text-lg font-semibold">{n}</dd>
            </div>
          ))}
        </dl>
        <p className="text-sm">
          {t('ledger:bank.newTotals')} <Money value={v.credits} /> · <Money value={{ ...v.debits, amount: v.debits.amount === '0.00' ? '0.00' : `-${v.debits.amount}` }} />
        </p>
        <ol className="space-y-2" data-testid="bank-import-rows">
          {v.rows.map((r) => {
            const [rt, ri] = ROW[r.status];
            return (
              <li key={r.n} className="rounded-tile border border-border/70 p-3 text-sm" data-testid="bank-import-line" data-status={r.status} data-txn={r.bankTxnId}>
                <p className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted">{t('ledger:bank.rowN', { n: r.n })}</span>
                    <bdi dir="ltr" className="font-mono text-xs">{r.bankTxnId || '—'}</bdi>
                    <Badge tone={rt} icon={ri}>
                      {t(`ledger:bank.rowStatus.${r.status}`)}
                    </Badge>
                  </span>
                  <Money value={r.direction === 'debit' ? { ...r.amount, amount: `-${r.amount.amount}` } : r.amount} />
                </p>
                <p className="break-words text-muted">
                  <bdi dir="ltr">{r.valueDate}</bdi> · {r.narration} · <bdi>{r.reference}</bdi> · <bdi>{r.counterparty}</bdi>
                </p>
                {r.problems.length > 0 && <p className="text-error">{r.problems.map((p) => t(`ledger:bank.problem.${p}`)).join(' · ')}</p>}
              </li>
            );
          })}
        </ol>
        <ImportActions v={v} />
        <details className="text-sm">
          <summary className="cursor-pointer text-muted">{t('ledger:bank.historyTitle')}</summary>
          <div className="mt-2">
            <History events={v.history} />
          </div>
        </details>
      </div>
    </Panel>
  );
}

function ImportActions({ v }: { v: BankImportView }) {
  const { t } = useT();
  const toast = useToast();
  const problem = useProblemToast();
  const keyed = {
    submit: useKeyedCreate<BankImportView>('bim-submit'),
    approve: useKeyedCreate<BankImportView>('bim-approve'),
    reject: useKeyedCreate<BankImportView>('bim-reject'),
    discard: useKeyedCreate<BankImportView>('bim-discard'),
  };
  const [confirm, setConfirm] = useState<keyof typeof keyed | null>(null);
  const pending = Object.values(keyed).some((k) => k.isPending);
  const run = async (step: keyof typeof keyed, reason?: string) => {
    try {
      const r = await keyed[step].send({ method: 'POST', path: `/bank/imports/${v.id}/${step}`, body: reason ? { reason } : {} });
      toast.success(t(`ledger:bank.done.${step}`, { ref: r.ref, count: r.committedLines ?? 0 }));
      return true;
    } catch (e) {
      problem(e);
      return false;
    }
  };
  const a = v.actions;
  return (
    <div className="space-y-2" data-testid="bank-import-actions">
      <div className="flex flex-wrap gap-2">
        {a.submit && (
          <Button className={WRAP} variant="primary" icon={Send} isPending={pending} isDisabled={v.counts.new === 0} disabledReason={t('ledger:bank.nothingNew')} onPress={() => void run('submit')} data-testid="bank-import-submit">
            {t('ledger:bank.submit')}
          </Button>
        )}
        {a.approve && (
          <Button className={WRAP} variant="primary" icon={BadgeCheck} onPress={() => setConfirm('approve')} data-testid="bank-import-approve">
            {t('ledger:bank.approve')}
          </Button>
        )}
        {a.reject && (
          <Button className={WRAP} variant="quiet" icon={XCircle} onPress={() => setConfirm('reject')} data-testid="bank-import-reject">
            {t('ledger:bank.reject')}
          </Button>
        )}
        {a.discard && (
          <Button className={WRAP} variant="quiet" icon={Trash2} onPress={() => setConfirm('discard')} data-testid="bank-import-discard">
            {t('ledger:bank.discard')}
          </Button>
        )}
      </div>
      {v.blocked && <Blocked testId="bank-import-blocked">{t(`ledger:bank.blocked.${v.blocked}`)}</Blocked>}
      {v.state === 'committed' && <p className="text-sm text-muted">{t('ledger:bank.committedNote', { count: v.committedLines ?? 0 })}</p>}
      <ConfirmDialog
        isOpen={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm ? t(`ledger:bank.confirm.${confirm}`, { ref: v.ref }) : ''}
        effect={confirm ? t(`ledger:bank.effect.${confirm}`, { count: v.counts.new }) : ''}
        confirmLabel={confirm ? t(`ledger:bank.${confirm}`) : ''}
        destructive={confirm !== 'approve' && confirm !== 'submit'}
        {...(confirm === 'reject' ? { reasonLabel: t('ledger:journal.reason') } : {})}
        onConfirm={async (reason) => {
          if (!confirm) return;
          const ok = await run(confirm, reason);
          if (ok) setConfirm(null);
          return ok;
        }}
      />
    </div>
  );
}
