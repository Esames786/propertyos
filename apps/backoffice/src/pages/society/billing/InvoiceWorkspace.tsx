import { ApiError, type CreditNote, type InvoiceDetail } from '@repo/contracts';
import { formatIban } from '@repo/i18n';
import { Badge, Breadcrumbs, Button, DateTime, Drawer, ErrorState, InlineAlert, Link, Money, NotFoundState, Panel, useAnnounce, useApiMutation, useApiQuery, useQueryParam, useT, useToast } from '@repo/ui';
import { BadgeCheck, FileMinus2, Lock, ScrollText } from 'lucide-react';
import { useState } from 'react';
import { Label, TextArea, TextField } from 'react-aria-components';
import { SOCIETY } from '../../../nav.config';
import { AmountInput, Loading, moneyMinus, ProblemAlert, ScrollRegion, SettlementBadge, useSocietyFormat } from '../kit';

/**
 * FIN-003 invoice workspace for a society invoice, with BILL-014 (credit note) as its drawer. A
 * posted invoice has no edit action (I-8): a wrong amount is corrected by a credit note against the
 * lines it concerns, with a reason, and the statement shows both. The payee is always the issuing
 * association's verified account, never the platform's (I-15).
 */
export default function InvoiceWorkspace({ invoiceId }: { invoiceId: string }) {
  const { t } = useT();
  const q = useApiQuery<InvoiceDetail>({ method: 'GET', path: `/billing/invoices/${invoiceId}` });
  if (q.isError && q.error instanceof ApiError && [403, 404].includes(q.error.problem.status)) {
    return (
      <div>
        <h1 id="page-title" className="sr-only">{t('billing:invoice.notFound')}</h1>
        <NotFoundState />
      </div>
    );
  }
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={10} />;
  return <Workspace data={q.data} />;
}

function Workspace({ data }: { data: InvoiceDetail }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const [drawer, setDrawer] = useState(false);
  const [drawerParam, setDrawerParam] = useQueryParam('drawer');
  const open = drawer || drawerParam === 'credit-note';
  const close = () => {
    setDrawer(false);
    if (drawerParam) setDrawerParam(null);
  };
  const { invoice } = data;
  return (
    <div className="@container space-y-6" data-testid="invoice-workspace" data-ref={invoice.ref} data-settlement={invoice.settlement}>
      <Breadcrumbs items={[{ label: t('nav:items.finance'), href: SOCIETY.invoices() }, { label: t('nav:pages.invoices'), href: SOCIETY.invoices() }]} />
      <section aria-labelledby="page-title" className="space-y-4 rounded-card border border-border/70 bg-panel p-5 shadow-card sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm text-muted">{t(`billing:source.${invoice.source}`)} · {fmt.period(invoice.period)} · <bdi>{invoice.legalEntityName}</bdi></p>
            <h1 id="page-title" className="mt-0.5 text-figure-sm leading-tight font-bold tracking-tight text-text outline-none sm:text-figure"><bdi dir="ltr">{invoice.ref}</bdi></h1>
            <p className="mt-1 text-sm text-muted">
              {t('billing:invoice.billedTo', { name: invoice.payerName })} · <Link href={SOCIETY.account(invoice.billingAccountId)}><bdi dir="ltr">{invoice.accountNo}</bdi></Link>
              {invoice.runId && <> · <Link href={SOCIETY.run(invoice.runId)}><bdi dir="ltr">{invoice.runRef}</bdi></Link></>}
            </p>
          </div>
          <SettlementBadge invoice={invoice} />
        </div>
        <dl className="grid gap-3 @xl:grid-cols-2 @4xl:grid-cols-4">
          <Metric label={t('billing:invoice.total')} value={<Money value={invoice.total} />} />
          <Metric label={t('billing:invoice.credited')} value={<Money value={invoice.credited} />} />
          <Metric label={t('billing:invoice.outstanding')} value={<Money value={invoice.outstanding} />} />
          <Metric label={t('billing:invoice.dates')} value={<><DateTime value={invoice.issuedOn} style="calendar" /> → <DateTime value={invoice.dueOn} style="calendar" /></>} />
        </dl>
        <div className="flex flex-wrap items-center gap-3 border-t border-border/80 pt-4">
          {data.actions.creditNote && (
            <Button variant="secondary" icon={FileMinus2} onPress={() => setDrawer(true)} data-testid="invoice-credit-note">{t('billing:invoice.issueCredit')}</Button>
          )}
          <Link href={SOCIETY.account(invoice.billingAccountId, 'statement')} className="inline-flex min-h-10 items-center gap-1.5 text-sm"><ScrollText aria-hidden className="size-4" />{t('billing:invoice.statement')}</Link>
          <p className="flex items-center gap-1.5 text-xs text-muted" data-testid="invoice-no-edit"><Lock aria-hidden className="size-3.5" />{t('billing:invoice.noEdit')}</p>
        </div>
      </section>

      <div className="grid gap-5 @5xl:grid-cols-[3fr_2fr]">
        <Panel title={t('billing:invoice.lines')}>
          <ScrollRegion label={t('billing:invoice.lines')}>
            <table className="w-full min-w-[30rem] text-sm" data-testid="invoice-lines">
              <caption className="sr-only">{t('billing:invoice.lines')}</caption>
              <thead>
                <tr className="border-b border-border text-xs text-muted">
                  <th scope="col" className="py-2 pe-3 text-start font-medium">{t('billing:invoice.line')}</th>
                  <th scope="col" className="py-2 pe-3 text-start font-medium">{t('billing:invoice.setBy')}</th>
                  <th scope="col" className="py-2 pe-3 text-end font-medium">{t('billing:invoice.amount')}</th>
                  <th scope="col" className="py-2 text-end font-medium">{t('billing:invoice.creditedCol')}</th>
                </tr>
              </thead>
              <tbody>
                {invoice.lines.map((l) => (
                  <tr key={l.id} className="border-b border-border/60">
                    <th scope="row" className="py-2 pe-3 text-start font-medium text-text">
                      {l.category ? t(`billing:categories.${l.category}`) : t('billing:statement.kinds.opening_balance')}
                      <span className="block text-xs font-normal text-muted"><bdi dir="ltr">{l.unitCode}</bdi> · <bdi>{l.payerName}</bdi></span>
                    </th>
                    <td className="py-2 pe-3 text-xs text-muted">{l.rule ? t('billing:rules.scopeLine', { level: t(`billing:scope.${l.rule.scope.level}`), name: l.rule.scopeName }) : t('billing:invoice.imported')}</td>
                    <td className="py-2 pe-3 text-end"><Money value={l.amount} /></td>
                    <td className="py-2 text-end">{l.credited.amount === '0.00' ? '—' : <Money value={l.credited} />}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row" colSpan={2} className="pt-3 text-start font-bold text-text">{t('billing:invoice.total')}</th>
                  <td className="pt-3 pe-3 text-end font-bold"><Money value={invoice.total} /></td>
                  <td className="pt-3 text-end font-semibold"><Money value={invoice.credited} /></td>
                </tr>
              </tfoot>
            </table>
          </ScrollRegion>
          {invoice.source === 'billing_run' && <p className="mt-3 text-xs text-muted">{t('billing:invoice.previousNote', { balance: fmt.money(data.accountBalance) })}</p>}
        </Panel>
        <div className="space-y-5">
          <Panel title={t('billing:invoice.creditNotes')}>
            {data.creditNotes.length === 0 ? (
              <p className="text-sm text-muted">{t('billing:invoice.noCreditNotes')}</p>
            ) : (
              <ul className="space-y-2" data-testid="invoice-credit-notes">
                {data.creditNotes.map((c) => (
                  <li key={c.id} className="rounded-tile border border-border px-3 py-2 text-sm">
                    <p className="flex justify-between gap-3 font-semibold text-text"><bdi dir="ltr">{c.ref}</bdi><Money value={c.amount} /></p>
                    <p className="text-xs text-muted"><bdi>{t('billing:quote', { text: c.reason })}</bdi> · {t('billing:invoice.creditBy', { name: c.createdByName })} · <DateTime value={c.on} style="calendar" /></p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          {data.payee && (
            <Panel title={t('billing:invoice.payee')} description={t('billing:invoice.payeeHint')}>
              <dl className="space-y-2 text-sm" data-testid="invoice-payee">
                <div className="flex justify-between gap-3"><dt className="text-muted">{t('sites:collection.title')}</dt><dd className="text-end font-medium"><bdi>{data.payee.accountTitle}</bdi></dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted">{t('sites:collection.bank')}</dt><dd>{data.payee.bankName}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted">{t('sites:collection.iban')}</dt><dd><bdi dir="ltr" className="ltr-ref font-mono">{formatIban(data.payee.iban)}</bdi></dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted">{t('sites:collection.status')}</dt><dd><Badge tone="success" icon={BadgeCheck}>{t('sites:collection.verified')}</Badge></dd></div>
              </dl>
            </Panel>
          )}
        </div>
      </div>
      {open && data.actions.creditNote && <CreditNoteDrawer data={data} onClose={close} />}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-tile bg-sunken/60 px-3 py-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold text-text">{value}</dd>
    </div>
  );
}

function CreditNoteDrawer({ data, onClose }: { data: InvoiceDetail; onClose: () => void }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const toast = useToast();
  const announce = useAnnounce();
  const save = useApiMutation<CreditNote>();
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const submit = async () => {
    try {
      const cn = await save.mutateAsync({ method: 'POST', path: `/billing/invoices/${data.invoice.id}/credit-notes`, body: { reason, lines: Object.entries(amounts).map(([lineId, amount]) => ({ lineId, amount })) } });
      const msg = t('billing:creditNote.done', { ref: cn.ref, amount: fmt.money(cn.amount) });
      toast.success(msg);
      announce(msg);
      onClose();
    } catch {
      /* shown below */
    }
  };
  return (
    <Drawer
      isOpen
      onOpenChange={(o) => !o && onClose()}
      title={t('billing:creditNote.title', { ref: data.invoice.ref })}
      subtitle={t('billing:creditNote.subtitle')}
      size="lg"
      testId="credit-note-drawer"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onPress={onClose}>{t('common:actions.cancel')}</Button>
          <Button variant="primary" icon={FileMinus2} onPress={() => void submit()} isPending={save.isPending} data-testid="credit-note-save">{t('billing:creditNote.issue')}</Button>
        </div>
      }
    >
      <div className="space-y-5">
        <InlineAlert tone="info">{t('billing:creditNote.rule')}</InlineAlert>
        <ul className="space-y-3">
          {data.invoice.lines.map((l) => (
            <li key={l.id} className="grid gap-2 rounded-tile border border-border p-3 @md:grid-cols-[1fr_12rem] @md:items-end" data-testid="credit-line" data-category={l.category ?? 'opening'}>
              <span className="text-sm">
                <span className="block font-semibold text-text">{l.category ? t(`billing:categories.${l.category}`) : t('billing:statement.kinds.opening_balance')} · <bdi dir="ltr">{l.unitCode}</bdi></span>
                <span className="block text-xs text-muted">{t('billing:creditNote.open', { amount: fmt.money(moneyMinus(l.amount, l.credited)), total: fmt.money(l.amount) })}</span>
              </span>
              <AmountInput label={t('billing:creditNote.amount')} value={amounts[l.id] ?? ''} onChange={(v) => setAmounts((a) => ({ ...a, [l.id]: v }))} testId={`credit-amount-${l.category ?? 'opening'}`} />
            </li>
          ))}
        </ul>
        <TextField value={reason} onChange={setReason} isRequired className="flex flex-col gap-1.5">
          <Label className="text-sm font-medium text-text">{t('billing:creditNote.reason')}</Label>
          <TextArea rows={3} className="rounded-control border border-border-control bg-panel px-3 py-2 text-sm text-text outline-none focus:outline-2 focus:outline-focus" data-testid="credit-reason" />
        </TextField>
        {save.isError && <ProblemAlert error={save.error} />}
      </div>
    </Drawer>
  );
}
