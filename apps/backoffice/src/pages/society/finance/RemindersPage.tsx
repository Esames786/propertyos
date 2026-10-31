import { REMINDER_CHANNELS, type PrintDocument, type PrintPack, type ReminderChannel, type ReminderOverview, type ReminderPreview, type ReminderSendResult, type ReminderStep } from '@repo/contracts';
import {
  Badge,
  Button,
  DateTime,
  Drawer,
  dynamicT,
  EmptyState,
  ErrorState,
  InlineAlert,
  Money,
  PageHeader,
  PlainCheckbox,
  PlainTextArea,
  PlainTextField,
  saveFile,
  SelectControl,
  UrlTabs,
  useApiMutation,
  useApiQuery,
  useT,
  useToast,
} from '@repo/ui';
import { useLocale } from '@repo/i18n';
import { BellRing, Download, FilePlus2, MessageSquare, Moon, Pause, Play, Printer, Send, Smartphone } from 'lucide-react';
import { useState } from 'react';
import { Loading, ProblemAlert, useSocietyFormat } from '../kit';
import { WRAP } from './fkit';

/**
 * COL-007 reminder rules and history, COL-009 send a reminder, and the printable packs (BILL-018 a
 * posted run's bills, COL-008 dues notices). Gate S.1. Every message is simulated: nothing leaves the
 * prototype. Only the liable payer is reminded; never one who has paid, whose proof or cheque is
 * pending, or who has no consent for the channel; SMS and WhatsApp wait outside quiet hours; at most
 * N a month; the same send key never sends twice (a double click returns the first result).
 */
export default function RemindersPage() {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const toast = useToast();
  const q = useApiQuery<ReminderOverview>({ method: 'GET', path: '/reminders' });
  const act = useApiMutation<ReminderOverview>();
  const [error, setError] = useState<unknown>(null);
  const [send, setSend] = useState(false);
  /** Resolves true when the change was saved (the caller may close its editor), false when refused. */
  const run = async (path: string, body: unknown, message: string) => {
    setError(null);
    try {
      await act.mutateAsync({ method: 'POST', path, body });
      toast.success(message);
      void q.refetch();
      return true;
    } catch (e) {
      setError(e);
      return false;
    }
  };
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={8} />;
  const d = q.data;
  return (
    <div className="@container space-y-6" data-testid="reminders-page">
      <PageHeader
        title={t('nav:pages.reminders')}
        description={t('governance:reminders.intro')}
        actions={
          d.actions.send && d.active ? (
            <Button variant="primary" icon={Send} onPress={() => setSend(true)} className={WRAP} data-testid="reminders-send-open">
              {t('governance:reminders.sendDue')}
            </Button>
          ) : undefined
        }
      />
      <InlineAlert tone="info" title={t('governance:reminders.simulatedTitle')}>
        <p>{t('governance:reminders.simulatedBody')}</p>
      </InlineAlert>
      <UrlTabs
        label={t('nav:pages.reminders')}
        items={[
          { id: 'rules', label: t('governance:reminders.tabs.rules') },
          { id: 'history', label: t('governance:reminders.tabs.history', { count: d.history.length }) },
        ]}
      >
        {(tab) =>
          tab === 'rules' ? (
            <div className="space-y-4 pt-4">
              {d.active ? (
                <section className="space-y-3 rounded-card bg-panel p-5 shadow-card" data-testid="reminder-active">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-lg font-bold text-text">{t('governance:reminders.active', { version: d.active.version })}</h2>
                    <Badge tone={d.active.status === 'active' ? 'success' : 'warning'}>{t(`governance:reminders.status.${d.active.status}`)}</Badge>
                  </div>
                  <StepList steps={d.active.steps} />
                  <p className="flex items-center gap-1.5 text-sm text-text">
                    <Moon aria-hidden className="size-4 text-muted" />
                    {t('governance:reminders.quiet', { from: d.active.quietHours.from, to: d.active.quietHours.to })}
                  </p>
                  <p className="text-sm text-text">{t('governance:reminders.cap', { count: d.active.monthlyCap })}</p>
                  <p className="text-sm text-muted">{t('governance:reminders.never')}</p>
                  <p className="text-sm text-muted">{t('governance:reminders.activatedBy', { name: d.active.activatedByName ?? d.active.createdByName })}</p>
                  {d.actions.manage && (
                    <Button variant="secondary" size="sm" icon={Pause} onPress={() => void run(`/reminders/policies/${d.active!.id}/pause`, {}, t('governance:reminders.paused'))} data-testid="reminder-pause">
                      {t('governance:reminders.pause')}
                    </Button>
                  )}
                </section>
              ) : (
                <InlineAlert tone="warning" title={t('governance:reminders.noneActive')}>
                  {d.actions.manage &&
                    d.policies
                      .filter((p) => p.status === 'paused')
                      .map((p) => (
                        <Button key={p.id} variant="secondary" size="sm" icon={Play} onPress={() => void run(`/reminders/policies/${p.id}/resume`, {}, t('governance:reminders.resumed'))} data-testid="reminder-resume">
                          {t('governance:reminders.resume', { version: p.version })}
                        </Button>
                      ))}
                </InlineAlert>
              )}
              <section className="space-y-2 rounded-card bg-panel p-5 shadow-card" aria-label={t('governance:reminders.channels')}>
                <h2 className="text-base font-bold text-text">{t('governance:reminders.channels')}</h2>
                <ul className="flex flex-wrap gap-2">
                  {REMINDER_CHANNELS.map((c) => (
                    <li key={c}>
                      <Badge tone={d.channels[c] ? 'success' : 'neutral'} icon={c === 'in_app' ? BellRing : c === 'sms' ? Smartphone : MessageSquare}>
                        {`${t(`governance:reminders.channel.${c}`)} · ${t(d.channels[c] ? 'governance:reminders.licensed' : 'governance:reminders.notLicensed')}`}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </section>
              {d.actions.manage && <NewVersion key={(d.active ?? d.policies[0]!).id} current={d.active ?? d.policies[0]!} onRun={run} />}
              <section className="space-y-2" aria-label={t('governance:reminders.versions')}>
                <h2 className="text-base font-bold text-text">{t('governance:reminders.versions')}</h2>
                <ul className="space-y-2" data-testid="reminder-versions">
                  {d.policies.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-tile border border-border/70 bg-panel p-3 text-sm" data-status={p.status}>
                      <span>
                        {t('governance:reminders.version', { version: p.version })} · {p.createdByName} · <DateTime value={p.createdAt} style="date" /> · <bdi>{p.note}</bdi>
                      </span>
                      <span className="flex items-center gap-2">
                        <Badge tone={p.status === 'active' ? 'success' : p.status === 'draft' ? 'info' : 'neutral'}>{t(`governance:reminders.status.${p.status}`)}</Badge>
                        {d.actions.manage && p.status === 'draft' && (
                          <Button variant="secondary" size="sm" onPress={() => void run(`/reminders/policies/${p.id}/activate`, {}, t('governance:reminders.activated'))} data-testid="reminder-activate">
                            {t('governance:reminders.activate')}
                          </Button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
              {error ? <ProblemAlert error={error} /> : null}
            </div>
          ) : (
            <div className="space-y-3 pt-4">
              <p className="text-sm text-muted">{t('governance:reminders.counts', { sent: d.counts.sent, skipped: d.counts.skipped, deferred: d.counts.deferred })}</p>
              {d.history.length === 0 ? (
                <EmptyState title={t('governance:reminders.noHistory')} />
              ) : (
                <ul className="space-y-2" data-testid="reminder-history">
                  {d.history.slice(0, 120).map((e) => (
                    <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-tile border border-border/70 bg-panel p-3 text-sm" data-testid="reminder-event" data-outcome={e.outcome} data-skip={e.skip ?? ''}>
                      <span className="min-w-0">
                        <span className="block font-medium text-text">
                          <bdi>{e.payerName}</bdi> · <bdi dir="ltr" className="ltr-ref">{e.flats.join(', ')}</bdi>
                        </span>
                        <span className="block text-xs text-muted">
                          {t(`governance:reminders.channel.${e.channel}`)} · {t(`governance:reminders.outcome.${e.outcome}`)}
                          {e.skip ? ` · ${t(`governance:reminders.skip.${e.skip}`)}` : ''} · {fmt.date(e.at)} · {e.byName}
                        </span>
                      </span>
                      <Money value={e.amount} className="font-semibold" />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        }
      </UrlTabs>
      <SendReminderDrawer isOpen={send} onClose={() => setSend(false)} onDone={() => void q.refetch()} />
    </div>
  );
}

function StepList({ steps }: { steps: ReminderStep[] }) {
  const { t } = useT();
  return (
    <ol className="space-y-1 text-sm text-text" data-testid="reminder-steps">
      {steps.map((s) => (
        <li key={s.offsetDays}>
          {s.offsetDays < 0 ? t('governance:reminders.before', { count: -s.offsetDays }) : s.offsetDays === 0 ? t('governance:reminders.onDue') : t('governance:reminders.after', { count: s.offsetDays })} · {s.channels.map((c) => t(`governance:reminders.channel.${c}`)).join(', ')}
        </li>
      ))}
    </ol>
  );
}

function NewVersion({ current, onRun }: { current: ReminderOverview['policies'][number]; onRun: (path: string, body: unknown, message: string) => Promise<boolean> }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [steps, setSteps] = useState<ReminderStep[]>(current.steps);
  const [from, setFrom] = useState(current.quietHours.from);
  const [to, setTo] = useState(current.quietHours.to);
  const [cap, setCap] = useState(String(current.monthlyCap));
  const [note, setNote] = useState('');
  if (!open)
    return (
      <Button variant="secondary" icon={FilePlus2} onPress={() => setOpen(true)} className={WRAP} data-testid="reminder-new-version">
        {t('governance:reminders.newVersion')}
      </Button>
    );
  return (
    <section className="space-y-3 rounded-card border border-border/70 bg-panel p-5" aria-label={t('governance:reminders.newVersion')} data-testid="reminder-editor">
      <h2 className="text-base font-bold text-text">{t('governance:reminders.newVersion')}</h2>
      {steps.map((s, i) => (
        <div key={i} className="flex flex-wrap items-end gap-3 rounded-tile bg-sunken/40 p-3">
          <PlainTextField label={t('governance:reminders.offset')} value={String(s.offsetDays)} onChange={(v) => setSteps(steps.map((x, j) => (j === i ? { ...x, offsetDays: Number(v.replace(/[^\d-]/g, '')) || 0 } : x)))} dir="ltr" />
          {REMINDER_CHANNELS.map((c) => (
            <PlainCheckbox key={c} isDisabled={c === 'in_app'} isSelected={s.channels.includes(c)} onChange={(on) => setSteps(steps.map((x, j) => (j === i ? { ...x, channels: on ? [...x.channels, c] : x.channels.filter((y) => y !== c) } : x)))}>
              {t(`governance:reminders.channel.${c}`)}
            </PlainCheckbox>
          ))}
        </div>
      ))}
      <div className="grid grid-cols-1 gap-3 @md:grid-cols-3">
        <PlainTextField label={t('governance:reminders.quietFrom')} value={from} onChange={setFrom} dir="ltr" />
        <PlainTextField label={t('governance:reminders.quietTo')} value={to} onChange={setTo} dir="ltr" />
        <PlainTextField label={t('governance:reminders.capLabel')} value={cap} onChange={setCap} inputMode="numeric" dir="ltr" testId="reminder-cap" />
      </div>
      <PlainTextArea label={t('governance:reminders.note')} value={note} onChange={setNote} testId="reminder-note" />
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" isDisabled={note.trim().length < 5} onPress={() => void onRun('/reminders/policies', { steps, quietHours: { from, to }, monthlyCap: Number(cap), note, activate: false }, t('governance:reminders.drafted')).then((saved) => saved && setOpen(false))} data-testid="reminder-save-draft">
          {t('governance:reminders.saveDraft')}
        </Button>
        <Button variant="primary" isDisabled={note.trim().length < 5} onPress={() => void onRun('/reminders/policies', { steps, quietHours: { from, to }, monthlyCap: Number(cap), note, activate: true }, t('governance:reminders.activated')).then((saved) => saved && setOpen(false))} data-testid="reminder-save-activate">
          {t('governance:reminders.saveActivate')}
        </Button>
      </div>
    </section>
  );
}

const CLOCKS = ['09:30', '11:00', '17:45', '22:30'];

/**
 * COL-009: who would receive a reminder now and why everyone else is skipped, then a simulated send.
 * One send key per opening of the drawer: pressing send twice never sends twice.
 */
export function SendReminderDrawer({ isOpen, onClose, onDone, accounts }: { isOpen: boolean; onClose: () => void; onDone?: () => void; accounts?: string[] }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const toast = useToast();
  const [clock, setClock] = useState('11:00');
  const [key, setKey] = useState(() => `rem-${Date.now().toString(36)}`);
  // The query mirrors the body so the preview is fetched again when the time or the accounts change.
  const preview = useApiQuery<ReminderPreview>({ method: 'POST', path: '/reminders/preview', query: { clock, accounts: accounts?.join(',') }, body: { clock, ...(accounts ? { accounts } : {}) } }, { enabled: isOpen });
  const send = useApiMutation<ReminderSendResult>();
  const [done, setDone] = useState<ReminderSendResult | null>(null);
  const [error, setError] = useState<unknown>(null);
  const close = () => {
    setDone(null);
    setError(null);
    setKey(`rem-${Date.now().toString(36)}`);
    onClose();
  };
  const p = preview.data;
  return (
    <Drawer
      isOpen={isOpen}
      onOpenChange={(o) => !o && close()}
      size="lg"
      title={accounts ? t('governance:reminders.sendOne') : t('governance:reminders.sendDue')}
      subtitle={t('governance:reminders.sendSubtitle')}
      testId="send-reminder-drawer"
      footer={
        done ? (
          <Button variant="primary" onPress={close}>{t('common:actions.done')}</Button>
        ) : (
          <>
            <Button variant="quiet" onPress={close}>{t('common:actions.cancel')}</Button>
            <Button
              variant="primary"
              icon={Send}
              isPending={send.isPending}
              isDisabled={!p || p.counts.send + p.counts.defer === 0}
              onPress={async () => {
                setError(null);
                try {
                  const r = await send.mutateAsync({ method: 'POST', path: '/reminders/send', body: { clock, sendKey: key, ...(accounts ? { accounts } : {}) } });
                  setDone(r);
                  toast.success(t('governance:reminders.sentToast', { count: r.sent }));
                  onDone?.();
                } catch (e) {
                  setError(e);
                }
              }}
              data-testid="reminder-send"
            >
              {t('governance:reminders.send', { count: p?.counts.send ?? 0 })}
            </Button>
          </>
        )
      }
    >
      <div className="space-y-4">
        <SelectControl label={t('governance:reminders.clock')} description={t('governance:reminders.clockHint')} value={clock} onChange={(k) => setClock(k ?? '11:00')} options={CLOCKS.map((c) => ({ id: c, label: c }))} testId="reminder-clock" />
        {done ? (
          <div className="space-y-2" role="status" data-testid="reminder-done" data-replayed={done.replayed}>
            <p className="text-base font-semibold text-text">{done.replayed ? t('governance:reminders.replayed') : t('governance:reminders.done', { sent: done.sent, skipped: done.skipped, deferred: done.deferred })}</p>
          </div>
        ) : !p ? (
          <Loading lines={5} />
        ) : (
          <>
            {p.quietNow && (
              <InlineAlert tone="info" title={t('governance:reminders.quietNow')} data-testid="reminder-quiet">
                <p>{t('governance:reminders.quietNowBody')}</p>
              </InlineAlert>
            )}
            <p className="text-sm text-text" data-testid="reminder-counts">
              {t('governance:reminders.previewCounts', { send: p.counts.send, skip: p.counts.skip, defer: p.counts.defer })}
            </p>
            {p.rows.length === 0 ? (
              <EmptyState title={t('governance:reminders.nobody')} />
            ) : (
              <ul className="space-y-2" data-testid="reminder-preview">
                {p.rows.map((r) => (
                  <li key={`${r.billingAccountId}-${r.partyId}`} className="space-y-1 rounded-tile border border-border/70 p-3 text-sm" data-testid="reminder-row" data-account={r.accountNo}>
                    <p className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-text">
                        <bdi>{r.payerName}</bdi> · <bdi dir="ltr" className="ltr-ref">{r.flats.join(', ')}</bdi>
                      </span>
                      <span className="text-muted">{t('governance:reminders.owes', { amount: fmt.money(r.amount), overdue: fmt.money(r.overdue) })}</span>
                    </p>
                    <ul className="flex flex-wrap gap-1.5">
                      {r.channels.map((c) => (
                        <li key={c.channel}>
                          <Badge tone={c.outcome === 'send' ? 'success' : c.outcome === 'defer' ? 'info' : 'neutral'} data-testid="reminder-channel" data-channel={c.channel} data-outcome={c.outcome} data-skip={c.skip ?? ''}>
                            {`${t(`governance:reminders.channel.${c.channel as ReminderChannel}`)}: ${c.skip ? t(`governance:reminders.skip.${c.skip}`) : t(`governance:reminders.outcome.${c.outcome === 'send' ? 'sent' : 'deferred'}`)}`}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {error ? <ProblemAlert error={error} /> : null}
      </div>
    </Drawer>
  );
}

// ---------------------------------------------------------------------------------------------
// Printing (BILL-018, COL-008): a preview, then print or download (generated in the browser)
// ---------------------------------------------------------------------------------------------

function escape(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

/** The pack as a standalone printable document (A4, page break per document, the reader's language). */
function packHtml(pack: PrintPack, docs: readonly PrintDocument[], render: (d: PrintDocument) => string, lang: string, dir: string, title: string) {
  return `<!doctype html><html lang="${lang}" dir="${dir}"><head><meta charset="utf-8"><title>${escape(title)}</title><style>
body{font-family:'Noto Nastaliq Urdu','Inter',system-ui,sans-serif;color:#1f2a24;margin:0}
.doc{padding:24mm 18mm;page-break-after:always;line-height:1.7}
h1{font-size:18pt;margin:0 0 4pt}h2{font-size:12pt;margin:12pt 0 4pt}
table{width:100%;border-collapse:collapse;font-size:10pt}td,th{border-bottom:1px solid #ccd;padding:4pt;text-align:start}
.n{text-align:end;font-variant-numeric:tabular-nums}.muted{color:#556}.demo{border:1px solid #b45;color:#b45;padding:2pt 6pt;display:inline-block;font-size:9pt}
bdi{unicode-bidi:isolate}@page{size:A4;margin:0}
</style></head><body>${docs.map(render).join('')}</body></html>`;
}

export function PrintPackDrawer({ isOpen, onClose, path, testId = 'print-drawer' }: { isOpen: boolean; onClose: () => void; path: string; testId?: string }) {
  const { t } = useT();
  const tr = dynamicT(t);
  const fmt = useSocietyFormat();
  const { locale, dir } = useLocale();
  const q = useApiQuery<PrintPack>({ method: 'GET', path }, { enabled: isOpen });
  const [one, setOne] = useState<string | null>(null);
  const pack = q.data;
  const docs = pack ? (one ? pack.documents.filter((d) => d.id === one) : pack.documents) : [];
  const title = pack ? (pack.kind === 'billing_run' ? t('governance:print.runTitle', { ref: pack.title }) : t('governance:print.noticesTitle')) : '';
  const lineLabel = (l: PrintDocument['lines'][number]) => (l.category ? tr(`billing:categories.${l.category}`) : t('billing:statement.kinds.opening_balance'));
  const render = (d: PrintDocument) =>
    `<section class="doc"><span class="demo">${escape(t('governance:print.demo'))}</span><h1>${escape(d.kind === 'invoice' ? t('governance:print.invoice', { ref: d.ref }) : t('governance:print.notice'))}</h1>` +
    `<p class="muted">${escape(pack!.legalEntityName)} · ${escape(pack!.siteName)}</p>` +
    `<p>${escape(t('governance:print.to', { name: d.payerName, account: d.accountNo, flats: d.flats.join(', ') }))}</p>` +
    `<p class="muted">${escape(t('governance:print.dates', { issued: fmt.date(d.issuedOn), due: d.dueOn ? fmt.date(d.dueOn) : '—' }))}</p>` +
    `<table><thead><tr><th>${escape(t('governance:print.line'))}</th><th>${escape(t('governance:print.flat'))}</th><th class="n">${escape(t('governance:print.amount'))}</th><th class="n">${escape(t('governance:print.open'))}</th></tr></thead><tbody>` +
    d.lines.map((l) => `<tr><td>${escape(lineLabel(l))} · ${escape(fmt.period(l.period))}</td><td><bdi>${escape(l.unitCode)}</bdi></td><td class="n">${escape(fmt.money(l.amount))}</td><td class="n">${escape(fmt.money(l.open))}</td></tr>`).join('') +
    `</tbody></table><h2>${escape(t('governance:print.totalOpen', { amount: fmt.money(d.open) }))}</h2>` +
    (d.payee ? `<p>${escape(t('governance:print.payee', { bank: d.payee.bankName, title: d.payee.accountTitle, iban: d.payee.iban, reference: d.payee.reference }))}</p>` : '') +
    `<p class="muted">${escape(t('governance:print.footer'))}</p></section>`;
  const html = pack ? packHtml(pack, docs, render, locale, dir, title) : '';
  return (
    <Drawer
      isOpen={isOpen}
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title={title || t('governance:print.loading')}
      subtitle={pack ? t('governance:print.subtitle', { count: pack.documents.length, total: fmt.money(pack.total) }) : undefined}
      testId={testId}
      footer={
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            icon={Printer}
            isDisabled={!pack || !docs.length}
            onPress={() => {
              const w = window.open('', '_blank', 'noopener=no');
              if (!w) return;
              w.document.write(html);
              w.document.close();
              w.focus();
              w.print();
            }}
            data-testid="print-open"
          >
            {t('governance:print.print')}
          </Button>
          <Button variant="secondary" icon={Download} isDisabled={!pack || !docs.length} onPress={() => saveFile({ fileName: `${(pack?.title ?? 'pack').replace(/[^\w-]+/g, '-')}${one ? '-1' : ''}.html`, mime: 'text/html', content: html })} data-testid="print-download">
            {t('governance:print.download')}
          </Button>
          <Button variant="quiet" onPress={onClose}>{t('common:actions.close')}</Button>
        </div>
      }
    >
      {!pack ? (
        q.isError ? <ErrorState error={q.error} /> : <Loading lines={6} />
      ) : (
        <div className="space-y-4">
          {pack.run && (
            <p className="text-sm text-text" data-testid="print-run-count" data-invoices={pack.run.invoices} data-documents={pack.documents.length}>
              {t('governance:print.runCount', { count: pack.run.invoices, period: fmt.period(pack.run.period) })}
            </p>
          )}
          <SelectControl label={t('governance:print.which')} value={one ?? 'all'} onChange={(k) => setOne(k && k !== 'all' ? k : null)} options={[{ id: 'all', label: t('governance:print.all', { count: pack.documents.length }) }, ...pack.documents.map((d) => ({ id: d.id, label: `${d.accountNo} · ${d.payerName} · ${d.flats.join(', ')}` }))]} testId="print-which" />
          <ul className="space-y-3" data-testid="print-preview" aria-label={t('governance:print.preview')}>
            {docs.slice(0, 12).map((d) => (
              <li key={d.id} className="space-y-2 rounded-tile border border-border bg-panel p-4 text-sm shadow-card" data-testid="print-document" data-kind={d.kind}>
                <p className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-text">{d.kind === 'invoice' ? t('governance:print.invoice', { ref: d.ref }) : t('governance:print.notice')}</span>
                  <Badge tone="demo">{t('governance:print.demo')}</Badge>
                </p>
                <p className="text-text">{t('governance:print.to', { name: d.payerName, account: d.accountNo, flats: d.flats.join(', ') })}</p>
                <ul className="space-y-0.5 text-muted">
                  {d.lines.map((l, i) => (
                    <li key={i} className="flex justify-between gap-2">
                      <span>
                        {lineLabel(l)} · {fmt.period(l.period)} · <bdi dir="ltr" className="ltr-ref">{l.unitCode}</bdi>
                      </span>
                      <Money value={l.open} />
                    </li>
                  ))}
                </ul>
                <p className="font-semibold text-text">{t('governance:print.totalOpen', { amount: fmt.money(d.open) })}</p>
                {d.payee && <p className="text-xs text-muted">{t('governance:print.payee', { bank: d.payee.bankName, title: d.payee.accountTitle, iban: d.payee.iban, reference: d.payee.reference })}</p>}
              </li>
            ))}
          </ul>
          {docs.length > 12 && <p className="text-sm text-muted">{t('governance:print.more', { count: docs.length - 12 })}</p>}
        </div>
      )}
    </Drawer>
  );
}

/** A button that opens a print pack's preview (BILL-018 from a posted run, COL-008 from aging). */
export function PrintPackButton({ path, label, testId }: { path: string; label: string; testId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" icon={Printer} onPress={() => setOpen(true)} data-testid={testId}>
        {label}
      </Button>
      <PrintPackDrawer isOpen={open} onClose={() => setOpen(false)} path={path} />
    </>
  );
}

/** COL-009 from an account or the aging page: the send drawer behind a button. */
export function SendReminderButton({ accounts, label, testId }: { accounts?: string[]; label: string; testId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" icon={BellRing} onPress={() => setOpen(true)} data-testid={testId}>
        {label}
      </Button>
      <SendReminderDrawer isOpen={open} onClose={() => setOpen(false)} {...(accounts ? { accounts } : {})} />
    </>
  );
}
