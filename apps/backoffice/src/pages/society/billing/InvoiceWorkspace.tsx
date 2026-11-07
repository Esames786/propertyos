import { ApiError, type CreditNote, type InvoiceDetail } from '@repo/contracts';
import { formatIban } from '@repo/i18n';
import { Badge, Breadcrumbs, Button, DateTime, Drawer, dynamicT, ErrorState, InlineAlert, isKeyReused, Link, Money, NotFoundState, Panel, useAnnounce, useApiQuery, useKeyedCreate, useQueryParam, useT, useToast } from '@repo/ui';
import { BadgeCheck, FileMinus2, Lock, ScrollText } from 'lucide-react';
import { useState } from 'react';
import { Label, TextArea, TextField } from 'react-aria-components';
import { SOCIETY } from '../../../nav.config';
import { AmountInput, Loading, ProblemAlert, ScrollRegion, SettlementBadge, useSocietyFormat } from '../kit';

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
  return <Workspace data={q.data} refresh={() => void q.refetch()} />;
}

function Workspace({ data, refresh }: { data: InvoiceDetail; refresh: () => void }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const [drawer, setDrawer] = useState(false);
  const [drawerParam, setDrawerParam] = useQueryParam('drawer');
  const open = drawer || drawerParam === 'credit-note';
  // Issue #21: once shown, the drawer stays until it is closed, also when a refresh (after the server
  // refused a reused key) leaves nothing to credit: it then says why, line by line.
  const [shown, setShown] = useState(false);
  const showDrawer = open && (data.actions.creditNote || shown);
  if (showDrawer !== shown) setShown(showDrawer);
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
      {showDrawer && <CreditNoteDrawer data={data} onClose={close} onRefresh={refresh} />}
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

/** No answer arrived (network, or the service did not respond): the credit note may or may not have been issued. */
const outcomeUnknown = (e: unknown) => !(e instanceof ApiError) || e.problem.status === 0 || e.problem.status >= 500;

function CreditNoteDrawer({ data, onClose, onRefresh }: { data: InvoiceDetail; onClose: () => void; onRefresh: () => void }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const toast = useToast();
  const announce = useAnnounce();
  // GitHub Issue #21: one request key for the credit note written in this drawer. Pressing "Issue" again
  // after a failure sends the same key, so if the first attempt went through, the answer is that credit
  // note (shown as issued), never a second one. A new key after a success, after the server refused the
  // key, and whenever the drawer opens again (a new adjustment).
  const save = useKeyedCreate<CreditNote>('cn');
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const submit = async () => {
    try {
      const cn = await save.send({ method: 'POST', path: `/billing/invoices/${data.invoice.id}/credit-notes`, body: { reason, lines: Object.entries(amounts).map(([lineId, amount]) => ({ lineId, amount })) } });
      const msg = t('billing:creditNote.done', { ref: cn.ref, amount: fmt.money(cn.amount) });
      toast.success(msg);
      announce(msg);
      onClose();
    } catch (e) {
      // An earlier attempt from this drawer went through with other details: show the invoice as it is now.
      if (isKeyReused(e)) onRefresh();
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
        // Issue #21 (320 px, 200 % text): the buttons wrap instead of pushing "Cancel" off screen.
        <div className="flex min-w-0 flex-wrap justify-end gap-2">
          <Button variant="secondary" onPress={onClose} className="max-w-full whitespace-normal">{t('common:actions.cancel')}</Button>
          <Button variant="primary" icon={FileMinus2} onPress={() => void submit()} isPending={save.isPending} className="max-w-full whitespace-normal" data-testid="credit-note-save">{t('billing:creditNote.issue')}</Button>
        </div>
      }
    >
      <div className="space-y-5">
        <InlineAlert tone="info">{t('billing:creditNote.rule')}</InlineAlert>
        <ul className="space-y-3">
          {data.invoice.lines.map((l) => {
            // UX B1 (COL-01): the server's own figure per line: billed − paid − already credited.
            const c = data.creditable.find((x) => x.lineId === l.id);
            const open = c ? Number(c.open.amount) : 0;
            const lineError = save.error instanceof ApiError ? save.error.problem.errors?.[`lines.${l.id}`]?.[0] : undefined;
            return (
              <li key={l.id} className="grid gap-2 rounded-tile border border-border p-3 @md:grid-cols-[1fr_12rem] @md:items-end" data-testid="credit-line" data-category={l.category ?? 'opening'} data-open={c?.open.amount ?? '0.00'}>
                <span className="text-sm">
                  <span className="block font-semibold text-text">{l.category ? t(`billing:categories.${l.category}`) : t('billing:statement.kinds.opening_balance')} · <bdi dir="ltr" className="whitespace-nowrap">{l.unitCode}</bdi></span>
                  {c && (
                    <span className="block text-xs text-muted" data-testid="credit-line-breakdown">
                      {t('billing:creditNote.breakdown', { billed: fmt.money(c.billed), paid: fmt.money(c.paid), credited: fmt.money(c.credited), open: fmt.money(c.open) })}
                    </span>
                  )}
                </span>
                {open > 0 ? (
                  <AmountInput label={t('billing:creditNote.amount')} value={amounts[l.id] ?? ''} onChange={(v) => setAmounts((a) => ({ ...a, [l.id]: v }))} testId={`credit-amount-${l.category ?? 'opening'}`} error={lineError ? dynamicT(t)(lineError.code, { ...lineError.params, ...(lineError.params?.open ? { open: fmt.money({ amount: lineError.params.open, currency: 'PKR' }) } : {}) }) : undefined} />
                ) : (
                  <span className="text-sm text-muted" data-testid="credit-line-closed">{t('billing:creditNote.nothingOpen')}</span>
                )}
              </li>
            );
          })}
        </ul>
        <TextField value={reason} onChange={setReason} isRequired className="flex flex-col gap-1.5">
          <Label className="text-sm font-medium text-text">{t('billing:creditNote.reason')}</Label>
          <TextArea rows={3} className="rounded-control border border-border-control bg-panel px-3 py-2 text-sm text-text outline-none focus:outline-2 focus:outline-focus" data-testid="credit-reason" />
        </TextField>
        {save.isError &&
          (isKeyReused(save.error) ? (
            <InlineAlert tone="warning" role="alert" data-testid="credit-note-key-reused">{t('billing:creditNote.keyReused')}</InlineAlert>
          ) : outcomeUnknown(save.error) ? (
            <InlineAlert tone="error" role="alert" data-testid="credit-note-outcome-unknown">{t('billing:creditNote.retrySame')}</InlineAlert>
          ) : (
            <ProblemAlert error={save.error} />
          ))}
      </div>
    </Drawer>
  );
}
