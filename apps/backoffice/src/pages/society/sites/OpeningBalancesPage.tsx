import type { ImportPreview, OpeningBalanceBatch, SiteSummary } from '@repo/contracts';
import { Badge, Breadcrumbs, Button, ConfirmDialog, DateTime, dynamicT, EmptyState, ErrorState, FilterPills, InlineAlert, Link, Money, PageHeader, Panel, useAnnounce, useApiMutation, useApiQuery, useQueryParam, useSession, useT, useToast } from '@repo/ui';
import { BadgeCheck, CircleAlert, FileUp, Hourglass, Send, Sparkles, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { FileTrigger } from 'react-aria-components';
import { SOCIETY } from '../../../nav.config';
import { Loading, ProblemAlert, ScrollRegion, useSocietyFormat } from '../kit';

/** A validated decimal string with exactly two places (money is never a float). */
const decimal = (v: string) => (v.includes('.') ? v.padEnd(v.indexOf('.') + 3, '0') : `${v}.00`);

/**
 * SITE-007 opening balances (A4 §1 step 5). Arrears carried over from the old register are
 * imported, their total is shown, and someone other than the importer approves them; only then do
 * they become opening-balance invoices on each account, dated as of go-live.
 */
export default function OpeningBalancesPage({ siteId }: { siteId: string }) {
  const { t } = useT();
  const { can, persona } = useSession();
  const [importId, setImportId] = useQueryParam('import');
  const sites = useApiQuery<SiteSummary[]>({ method: 'GET', path: '/sites' });
  const site = sites.data?.find((s) => s.id === siteId);
  const batches = useApiQuery<{ batches: OpeningBalanceBatch[]; asOf: string; flats: number }>({ method: 'GET', path: `/sites/${siteId}/opening-balances` });
  if (batches.isError) return <ErrorState error={batches.error} onRetry={() => void batches.refetch()} />;
  if (!batches.data) return <Loading lines={8} />;
  const list = batches.data.batches;
  const open = list.some((b) => b.state === 'pending_approval' || b.state === 'approved');
  const canImport = can('opening_balance.import') && !open && batches.data.flats > 0;

  return (
    <div className="@container mx-auto max-w-5xl space-y-6" data-testid="opening-page">
      <Breadcrumbs items={[{ label: t('nav:items.sites'), href: SOCIETY.sites }, { label: site?.name ?? '', href: SOCIETY.site(siteId) }]} />
      <PageHeader title={t('nav:pages.openingBalances')} description={t('sites:opening.intro')} />
      {batches.data.flats === 0 && (
        <InlineAlert tone="info">
          {t('sites:opening.noFlats')} <Link href={SOCIETY.importFlats(siteId)}>{t('sites:structure.import')}</Link>
        </InlineAlert>
      )}
      {list.length === 0 && !canImport && batches.data.flats > 0 && <EmptyState title={t('sites:opening.emptyTitle')} body={t('sites:opening.emptyBody')} />}
      {list.map((b) => (
        <BatchCard key={b.id} batch={b} me={persona?.principalId ?? ''} canApprove={can('opening_balance.approve')} />
      ))}
      {canImport && <ImportPanel siteId={siteId} importId={importId} setImportId={setImportId} />}
    </div>
  );
}

function BatchCard({ batch, me, canApprove }: { batch: OpeningBalanceBatch; me: string; canApprove: boolean }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const toast = useToast();
  const announce = useAnnounce();
  const decide = useApiMutation<OpeningBalanceBatch>();
  const [confirm, setConfirm] = useState<null | 'approve' | 'return'>(null);
  const mine = batch.importedBy === me;
  const act = async (decision: 'approve' | 'return', note?: string) => {
    try {
      await decide.mutateAsync({ method: 'POST', path: `/opening-balances/${batch.id}/${decision}`, body: note ? { note } : {} });
      const msg = t(decision === 'approve' ? 'sites:opening.approvedToast' : 'sites:opening.returnedToast', { total: fmt.money(batch.total) });
      toast.success(msg);
      announce(msg);
    } catch {
      /* shown below */
    }
  };
  const tone = batch.state === 'approved' ? 'success' : batch.state === 'returned' ? 'neutral' : 'warning';
  const Icon = batch.state === 'approved' ? BadgeCheck : batch.state === 'returned' ? Undo2 : Hourglass;
  return (
    <Panel
      title={t('sites:opening.batchTitle', { file: batch.fileName })}
      description={t('sites:opening.batchMeta', { name: batch.importedByName, accounts: fmt.count(batch.accounts) })}
      actions={<Badge tone={tone} icon={Icon}>{t(`sites:opening.state.${batch.state}`)}</Badge>}
    >
      <div className="space-y-4" data-testid="opening-batch" data-state={batch.state}>
        <p className="text-sm text-text">
          {t('sites:opening.total')} <Money value={batch.total} className="text-lg font-bold" />
        </p>
        <ScrollRegion label={t('sites:opening.batchTitle', { file: batch.fileName })}>
          <table className="w-full min-w-[26rem] text-sm">
            <caption className="sr-only">{t('sites:opening.batchTitle', { file: batch.fileName })}</caption>
            <thead>
              <tr className="border-b border-border text-xs text-muted">
                <th scope="col" className="py-2 pe-3 text-start font-medium">{t('sites:opening.account')}</th>
                <th scope="col" className="py-2 pe-3 text-start font-medium">{t('sites:opening.flat')}</th>
                <th scope="col" className="py-2 text-end font-medium">{t('sites:opening.amount')}</th>
              </tr>
            </thead>
            <tbody>
              {batch.rows.map((r) => (
                <tr key={`${r.accountId}-${r.flatCode}`} className="border-b border-border/60">
                  <th scope="row" className="py-2 pe-3 text-start font-medium">
                    {batch.state === 'approved' ? <Link href={SOCIETY.account(r.accountId)}><bdi dir="ltr">{r.accountNo}</bdi></Link> : <bdi dir="ltr">{r.accountNo}</bdi>}
                  </th>
                  <td className="py-2 pe-3"><bdi dir="ltr">{r.flatCode}</bdi></td>
                  <td className="py-2 text-end"><Money value={r.amount} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollRegion>
        {batch.decidedByName && (
          <p className="text-sm text-muted">
            {t(batch.state === 'approved' ? 'sites:opening.approvedBy' : 'sites:opening.returnedBy', { name: batch.decidedByName })}
            {batch.decidedAt && <> · <DateTime value={batch.decidedAt} style="dateTime" /></>}
            {batch.note && <> · <bdi>{t('billing:quote', { text: batch.note })}</bdi></>}
          </p>
        )}
        {batch.state === 'pending_approval' &&
          (canApprove && !mine ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" icon={BadgeCheck} onPress={() => setConfirm('approve')} isPending={decide.isPending} data-testid="opening-approve">{t('sites:opening.approve')}</Button>
              <Button variant="secondary" icon={Undo2} onPress={() => setConfirm('return')} data-testid="opening-return">{t('sites:opening.return')}</Button>
            </div>
          ) : (
            <InlineAlert tone="info" role="status">
              <span data-testid="opening-waiting">{mine ? t('sites:opening.waitingMine') : t('sites:opening.waiting')}</span>
            </InlineAlert>
          ))}
        {decide.isError && <ProblemAlert error={decide.error} />}
      </div>
      <ConfirmDialog
        isOpen={confirm === 'approve'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={t('sites:opening.confirmTitle')}
        effect={t('sites:opening.confirmEffect', { total: fmt.money(batch.total), accounts: fmt.count(batch.accounts) })}
        confirmLabel={t('sites:opening.approve')}
        onConfirm={() => act('approve')}
      />
      <ConfirmDialog
        isOpen={confirm === 'return'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={t('sites:opening.returnTitle')}
        effect={t('sites:opening.returnEffect', { name: batch.importedByName })}
        confirmLabel={t('sites:opening.return')}
        reasonLabel={t('billing:run.confirm.comment')}
        onConfirm={(note) => act('return', note)}
      />
    </Panel>
  );
}

function ImportPanel({ siteId, importId, setImportId }: { siteId: string; importId: string | null; setImportId: (id: string | null) => void }) {
  const { t } = useT();
  const dt = dynamicT(t);
  const fmt = useSocietyFormat();
  const toast = useToast();
  const start = useApiMutation<ImportPreview>();
  const submit = useApiMutation<OpeningBalanceBatch>();
  const preview = useApiQuery<ImportPreview>(importId ? { method: 'GET', path: `/sites/${siteId}/opening-imports/${importId}` } : null);
  const [show, setShow] = useState<'all' | 'error'>('all');
  const run = async (body: Record<string, unknown>) => {
    try {
      const p = await start.mutateAsync({ method: 'POST', path: `/sites/${siteId}/opening-imports`, body });
      setImportId(p.importId);
    } catch {
      /* shown below */
    }
  };
  const send = async () => {
    try {
      const b = await submit.mutateAsync({ method: 'POST', path: `/sites/${siteId}/opening-imports/${importId}/submit` });
      toast.success(t('sites:opening.submitted', { total: fmt.money(b.total) }));
      setImportId(null);
    } catch {
      /* shown below */
    }
  };
  const p = preview.data;
  const rows = p?.rows.filter((r) => show === 'all' || r.status !== 'valid') ?? [];
  return (
    <Panel title={t('sites:opening.importTitle')} description={t('sites:opening.importHint')}>
      {!importId ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-3">
            <Button variant="primary" icon={Sparkles} onPress={() => void run({ sample: true })} isPending={start.isPending} data-testid="opening-sample">{t('sites:opening.useSample')}</Button>
            <FileTrigger acceptedFileTypes={['.csv', 'text/csv']} onSelect={(files) => { const f = files?.[0]; if (f) void f.text().then((content) => run({ fileName: f.name, content })); }}>
              <Button variant="secondary" icon={FileUp}>{t('sites:import.choose')}</Button>
            </FileTrigger>
          </div>
          <p className="text-xs text-muted">{t('sites:opening.columns')}</p>
          {start.isError && <ProblemAlert error={start.error} />}
        </div>
      ) : !p ? (
        <Loading lines={4} />
      ) : (
        <div className="space-y-4" data-testid="opening-preview">
          <p className="text-sm text-text">
            {t('sites:opening.previewTotal', { accounts: fmt.count(p.counts.valid) })} <Money value={p.total ?? { amount: '0.00', currency: 'PKR' }} className="text-lg font-bold" />
          </p>
          {p.counts.errors > 0 && <FilterPills label={t('billing:run.items.show')} value={show} onChange={(v) => setShow(v as 'all' | 'error')} options={[{ id: 'all', label: t('billing:run.items.filters.all') }, { id: 'error', label: t('sites:opening.problems') }]} />}
          <ul className="divide-y divide-border rounded-tile border border-border text-sm">
            {rows.map((r) => (
              <li key={r.line} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2" data-status={r.status}>
                <span><bdi dir="ltr" className="font-semibold">{r.values.account}</bdi> · <bdi dir="ltr">{r.values.flat}</bdi></span>
                {r.status === 'valid' ? (
                  <Money value={{ amount: decimal(r.values.amount ?? '0'), currency: 'PKR' }} />
                ) : (
                  <span className="flex items-center gap-1 text-error"><CircleAlert aria-hidden className="size-4" />{r.problems.map((x) => dt(`sites:import.problems.${x.code}`)).join(' · ') || t('sites:import.dupOf', { line: r.duplicateOf })}</span>
                )}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap justify-between gap-3">
            <Button variant="quiet" onPress={() => setImportId(null)}>{t('sites:import.restart')}</Button>
            <Button variant="primary" icon={Send} onPress={() => void send()} isPending={submit.isPending} isDisabled={!p.canCommit} disabledReason={p.alreadyCommitted ? t('sites:import.alreadyShort') : p.counts.errors ? t('sites:import.fixFirst', { count: p.counts.errors }) : undefined} data-testid="opening-submit">
              {t('sites:opening.submit')}
            </Button>
          </div>
          {submit.isError && <ProblemAlert error={submit.error} />}
        </div>
      )}
    </Panel>
  );
}
