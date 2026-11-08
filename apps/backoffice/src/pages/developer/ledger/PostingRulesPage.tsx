import type { JournalFormOptions, PostingRulePreview, PostingRulesView, PostingRuleView } from '@repo/contracts';
import { Badge, Button, Drawer, dynamicT, ErrorState, InlineAlert, PageHeader, PlainTextField, SelectControl, useApiQuery, useKeyedCreate, useSession, useT, useToast } from '@repo/ui';
import { Eye, FilePlus2, Hourglass, Play, Scale } from 'lucide-react';
import { useState } from 'react';
import { Loading, ProblemAlert, useSocietyFormat } from '../../society/kit';
import { DateInput, fieldErrorKey, useFieldError } from '../../society/hr/hkit';
import { JournalLines } from './JournalsPage';
import { AccountRef, EntityBar, GL_POST, History, LedgerNav, ProvisionalNotice, Ref, useAccountName, useEntityParam, WRAP, KEEP } from './lkit';

/**
 * ACC-010 Posting rules (PARTIAL, Gate E.7 Wave 1; decisions E-15, E-16, E-17, E-18, E-33). Versioned
 * rules per entity that say which accounts a source event would post to. They are proposals: no source
 * slice exists yet (E.6, E.8, E.14) and an accounting adviser must decide revenue recognition, the
 * chart and automatic posting first. A person may preview what a version would propose for an amount
 * (computed, never stored) and draft a new version (still proposed). "Apply" is shown, disabled, with
 * the reason; the server refuses it too. No journal is ever created from a rule here.
 */
export default function PostingRulesPage() {
  const { t } = useT();
  const [entity, setEntity] = useEntityParam();
  const q = useApiQuery<PostingRulesView>({ method: 'GET', path: '/ledger/posting-rules', query: entity ? { entity } : {} }, KEEP);
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={8} />;
  const d = q.data;
  return (
    <div className="@container space-y-5" data-testid="ledger-rules">
      <PageHeader title={t('ledger:rules.title')} description={t('ledger:rules.intro')} />
      <LedgerNav current="rules" entity={entity} />
      <ProvisionalNotice screen="rules" />
      <InlineAlert tone="warning" title={t('ledger:rules.blockedTitle')} data-testid="rules-blocked">
        {t('ledger:rules.blocked')}
      </InlineAlert>
      <EntityBar scope={d} onChange={setEntity} />
      <p className="text-sm" data-testid="rules-events" data-count={d.proposedEvents}>
        {t('ledger:rules.events', { count: d.proposedEvents })}
      </p>
      <ul className="space-y-4">
        {d.rules.map((r) => (
          <Rule key={r.id} r={r} entityId={d.entity.id} today={d.today} />
        ))}
      </ul>
    </div>
  );
}

function Rule({ r, entityId, today }: { r: PostingRuleView; entityId: string; today: string }) {
  const { t } = useT();
  const dt = dynamicT(t);
  const fmt = useSocietyFormat();
  const name = useAccountName();
  const { allows } = useSession();
  const [previewing, setPreviewing] = useState(false);
  const [drafting, setDrafting] = useState(false);
  return (
    <li className="space-y-3 rounded-card bg-panel p-4 shadow-card" data-testid="posting-rule" data-ref={r.ref} data-event={r.event}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <h2 className="flex flex-wrap items-center gap-2 text-base font-bold">
            <Ref value={r.ref} />
            <span>{t(`ledger:rules.event.${r.event}`)}</span>
            <Badge tone="info" icon={Hourglass} data-testid="rule-state" data-state="proposed">
              {t('ledger:rules.proposed')}
            </Badge>
          </h2>
          <p className="text-sm text-muted">{t('ledger:rules.source', { slice: r.sourceSlice })}</p>
          <p className="flex flex-wrap items-center gap-1.5 text-sm" data-testid="rule-decisions">
            <Scale aria-hidden className="size-4 text-muted" />
            {t('ledger:rules.waitingFor')}{' '}
            {r.blockedBy.map((dcs) => (
              <Badge key={dcs} tone="warning" data-decision={dcs}>
                {dt(`ledger:rules.decision.${dcs.replace('-', '')}`)}
              </Badge>
            ))}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button className={WRAP} icon={Eye} onPress={() => setPreviewing(true)} data-testid="rule-preview-open">
            {t('ledger:rules.preview')}
          </Button>
          {allows(GL_POST) && r.actions.draftVersion && (
            <Button className={WRAP} icon={FilePlus2} onPress={() => setDrafting(true)} data-testid="rule-draft-open">
              {t('ledger:rules.draftVersion')}
            </Button>
          )}
          <Button className={WRAP} icon={Play} isDisabled disabledReason={t('ledger:rules.applyBlocked', { decisions: r.blockedBy.join(', ') })} data-testid="rule-apply">
            {t('ledger:rules.apply')}
          </Button>
        </div>
      </div>
      <ol className="space-y-2" data-testid="rule-versions">
        {r.versions.map((v) => (
          <li key={v.n} className="rounded-tile border border-border/70 p-3 text-sm" data-testid="rule-version" data-n={v.n} data-today={r.versionToday === v.n}>
            <p className="flex flex-wrap items-center gap-2 font-semibold">
              <span>{t('ledger:rules.version', { n: v.n, date: fmt.date(v.effectiveFrom) })}</span>
              {r.versionToday === v.n && <Badge tone="neutral">{t('ledger:rules.wouldApplyToday', { date: fmt.date(today) })}</Badge>}
            </p>
            <p>
              {t('ledger:rules.debit')}: <AccountRef code={v.debit.code} name={name(v.debit)} />
            </p>
            <p>
              {t('ledger:rules.credit')}: <AccountRef code={v.credit.code} name={name(v.credit)} />
            </p>
            <p className="text-xs text-muted">
              {t('ledger:rules.draftedBy', { name: v.draftedByName })}
              {v.note ? ` · “${v.note}”` : ''}
            </p>
          </li>
        ))}
      </ol>
      <details className="text-sm">
        <summary className="cursor-pointer text-muted">{t('ledger:rules.historyTitle')}</summary>
        <div className="mt-2">
          <History events={r.history} />
        </div>
      </details>
      {previewing && <PreviewDrawer r={r} onClose={() => setPreviewing(false)} />}
      {drafting && <DraftVersionDrawer r={r} entityId={entityId} onClose={() => setDrafting(false)} />}
    </li>
  );
}

function PreviewDrawer({ r, onClose }: { r: PostingRuleView; onClose: () => void }) {
  const { t } = useT();
  const [amount, setAmount] = useState('100000.00');
  const [version, setVersion] = useState(String(r.versionToday ?? r.versions[0]!.n));
  const [shown, setShown] = useState<{ amount: string; version: string } | null>(null);
  const q = useApiQuery<PostingRulePreview>(shown ? { method: 'GET', path: `/ledger/posting-rules/${r.id}/preview`, query: shown } : null);
  return (
    <Drawer isOpen onOpenChange={(o) => !o && onClose()} title={t('ledger:rules.previewTitle', { ref: r.ref })} size="lg" testId="rule-preview">
      <div className="@container space-y-4">
        <SelectControl label={t('ledger:rules.versionLabel')} options={r.versions.map((v) => ({ id: String(v.n), label: t('ledger:rules.versionShort', { n: v.n }) }))} value={version} onChange={(v) => v && setVersion(v)} testId="rule-preview-version" />
        <PlainTextField label={t('ledger:rules.amount')} value={amount} onChange={setAmount} inputMode="decimal" dir="ltr" testId="rule-preview-amount" />
        <Button icon={Eye} onPress={() => setShown({ amount, version })} data-testid="rule-preview-run">
          {t('ledger:rules.previewRun')}
        </Button>
        {q.isError && <ProblemAlert error={q.error} />}
        {q.data && (
          <div className="space-y-2" data-testid="rule-preview-result">
            <p className="text-sm font-semibold">{t('ledger:rules.previewOnly')}</p>
            <JournalLines view={{ lines: q.data.lines, totals: { debit: q.data.amount, credit: q.data.amount } }} testId="rule-preview-lines" />
          </div>
        )}
      </div>
    </Drawer>
  );
}

function DraftVersionDrawer({ r, entityId, onClose }: { r: PostingRuleView; entityId: string; onClose: () => void }) {
  const { t } = useT();
  const toast = useToast();
  const name = useAccountName();
  const opts = useApiQuery<JournalFormOptions>({ method: 'GET', path: '/ledger/journal-form', query: { entity: entityId } });
  const [from, setFrom] = useState('');
  const [debit, setDebit] = useState<string | null>(null);
  const [credit, setCredit] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<unknown>(null);
  const draft = useKeyedCreate<PostingRuleView>('prl-version');
  const fieldError = useFieldError(error);
  const accounts = (opts.data?.accounts ?? []).map((a) => ({ id: a.id, label: `${a.code} · ${name(a)}` }));
  return (
    <Drawer
      isOpen
      onOpenChange={(o) => !o && onClose()}
      title={t('ledger:rules.draftTitle', { ref: r.ref })}
      testId="rule-draft"
      footer={
        <Button
          className={WRAP}
          variant="primary"
          isPending={draft.isPending}
          onPress={async () => {
            setError(null);
            try {
              await draft.send({ method: 'POST', path: `/ledger/posting-rules/${r.id}/versions`, body: { effectiveFrom: from, debitAccountId: debit ?? '', creditAccountId: credit ?? '', note } });
              toast.success(t('ledger:rules.drafted', { ref: r.ref }));
              onClose();
            } catch (e) {
              setError(e);
            }
          }}
          data-testid="rule-draft-save"
        >
          {t('ledger:rules.draftSave')}
        </Button>
      }
    >
      {opts.isError ? (
        <ErrorState error={opts.error} />
      ) : !opts.data ? (
        <Loading lines={4} />
      ) : (
        <div className="space-y-4">
          {error ? <ProblemAlert error={error} /> : null}
          <DateInput id="rule-from" label={t('ledger:rules.effectiveFrom')} value={from} onChange={setFrom} testId="rule-from" description={fieldError('effectiveFrom') ?? t('ledger:rules.effectiveHint')} />
          <SelectControl label={t('ledger:rules.debit')} options={accounts} value={debit} onChange={setDebit} errorKey={fieldErrorKey(error, 'debitAccountId')} testId="rule-debit" placeholder={t('ledger:create.chooseAccount')} />
          <SelectControl label={t('ledger:rules.credit')} options={accounts} value={credit} onChange={setCredit} errorKey={fieldErrorKey(error, 'creditAccountId')} testId="rule-credit" placeholder={t('ledger:create.chooseAccount')} />
          <PlainTextField label={t('ledger:rules.note')} value={note} onChange={setNote} optional errorKey={fieldErrorKey(error, 'note')} testId="rule-note" />
          <p className="text-xs text-muted">{t('ledger:rules.draftEffect')}</p>
        </div>
      )}
    </Drawer>
  );
}
