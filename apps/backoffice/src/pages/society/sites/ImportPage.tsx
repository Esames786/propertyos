import type { ImportCommitResult, ImportPreview, ImportRow, SiteSummary } from '@repo/contracts';
import { Badge, Breadcrumbs, Button, buttonClass, cn, dynamicT, InlineAlert, Link, PageHeader, Panel, useAnnounce, useApiMutation, useApiQuery, useQueryParams, useNavigation, useT, useToast } from '@repo/ui';
import { CheckCircle2, CircleAlert, Copy, Download, FileSpreadsheet, FileUp, Sparkles, Wand2 } from 'lucide-react';
import { useState } from 'react';
import { Checkbox, FileTrigger, Input, Label, TextField } from 'react-aria-components';
import { SOCIETY } from '../../../nav.config';
import { Loading, ProblemAlert, ScrollRegion, useSocietyFormat } from '../kit';

const COLUMNS = ['flat', 'block', 'floor', 'type', 'area_sqft', 'owner_name', 'owner_phone', 'owner_since', 'occupancy', 'occupant_name', 'occupant_phone', 'occupant_since', 'payer', 'account'] as const;
const TEMPLATE = `data:text/csv;charset=utf-8,${encodeURIComponent(`${COLUMNS.join(',')}\n`)}`;

/**
 * SITE-004 flat register import (A4 §1 step 3): upload → check every row → import. Every invalid
 * and duplicate row is listed with its reason; suggested fixes are offered, never applied silently;
 * the import is all-or-nothing and re-running the same file creates nothing. The import lives on
 * the server and in the address, so switching language or reloading keeps the work.
 */
export default function ImportPage({ siteId }: { siteId: string }) {
  const { t } = useT();
  const { location } = useNavigation();
  const params = new URLSearchParams(location.search);
  const importId = params.get('import');
  const done = params.get('done');
  const setParams = useQueryParams();
  const sites = useApiQuery<SiteSummary[]>({ method: 'GET', path: '/sites' });
  const site = sites.data?.find((s) => s.id === siteId);
  const preview = useApiQuery<ImportPreview>(importId && !done ? { method: 'GET', path: `/sites/${siteId}/flat-imports/${importId}` } : null);
  const step = done ? 3 : importId ? 2 : 1;

  return (
    <div className="@container mx-auto max-w-5xl space-y-6" data-testid="import-page" data-step={step}>
      <Breadcrumbs items={[{ label: t('nav:items.sites'), href: SOCIETY.sites }, { label: site?.name ?? '', href: SOCIETY.site(siteId) }]} />
      <PageHeader title={t('nav:pages.importFlats')} description={t('sites:import.intro')} />
      <ol className="grid grid-cols-3 gap-2" aria-label={t('sites:import.steps')}>
        {(['upload', 'check', 'import'] as const).map((s, i) => (
          <li key={s} aria-current={step === i + 1 ? 'step' : undefined} className="min-w-0">
            <span aria-hidden className={cn('block h-1.5 rounded-pill', i + 1 <= step ? 'bg-primary' : 'bg-sunken')} />
            <span className={cn('mt-1.5 block text-xs font-semibold', step === i + 1 ? 'text-text' : 'text-muted')}>{t(`sites:import.step.${s}`)}</span>
          </li>
        ))}
      </ol>
      {step === 1 && <UploadStep siteId={siteId} onStarted={(id) => setParams({ import: id }, { replace: false })} />}
      {step === 2 && (preview.isError ? <ProblemAlert error={preview.error} /> : !preview.data ? <Loading lines={8} /> : <ReviewStep siteId={siteId} data={preview.data} onDone={(r) => setParams({ done: String(r.created), unchanged: String(r.unchanged) }, { replace: false })} onRestart={() => setParams({ import: null })} />)}
      {step === 3 && <DoneStep siteId={siteId} created={Number(done)} unchanged={Number(params.get('unchanged') ?? 0)} />}
    </div>
  );
}

function UploadStep({ siteId, onStarted }: { siteId: string; onStarted: (importId: string) => void }) {
  const { t } = useT();
  const start = useApiMutation<ImportPreview>();
  const [readError, setReadError] = useState(false);
  const run = async (body: Record<string, unknown>) => {
    try {
      const p = await start.mutateAsync({ method: 'POST', path: `/sites/${siteId}/flat-imports`, body });
      onStarted(p.importId);
    } catch {
      /* shown below */
    }
  };
  const fromFile = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setReadError(false);
    file
      .text()
      .then((content) => run({ fileName: file.name, content }))
      .catch(() => setReadError(true));
  };
  return (
    <div className="grid gap-5 @3xl:grid-cols-[3fr_2fr]">
      <Panel title={t('sites:import.uploadTitle')} description={t('sites:import.uploadHint')}>
        <div className="flex flex-wrap gap-3">
          <Button variant="primary" icon={Sparkles} onPress={() => void run({ sample: true })} isPending={start.isPending} data-testid="import-sample">
            {t('sites:import.useSample')}
          </Button>
          <FileTrigger acceptedFileTypes={['.csv', 'text/csv']} onSelect={fromFile}>
            <Button variant="secondary" icon={FileUp} data-testid="import-choose">
              {t('sites:import.choose')}
            </Button>
          </FileTrigger>
        </div>
        <p className="mt-3 text-sm text-muted">{t('sites:import.sampleHint')}</p>
        {readError && <InlineAlert tone="error" role="alert" className="mt-3">{t('sites:import.readError')}</InlineAlert>}
        {start.isError && <ProblemAlert error={start.error} className="mt-3" />}
      </Panel>
      <Panel title={t('sites:import.columnsTitle')}>
        <ul className="space-y-1 text-sm">
          {COLUMNS.map((c) => (
            <li key={c} className="flex justify-between gap-3">
              <bdi dir="ltr" className="font-mono text-xs text-text">{c}</bdi>
              <span className="text-end text-xs text-muted">{t(`sites:import.columns.${c}`)}</span>
            </li>
          ))}
        </ul>
        <a href={TEMPLATE} download="flat-register-template.csv" className={cn(buttonClass('quiet', 'sm'), 'mt-3')}>
          <Download aria-hidden className="size-4" />
          {t('sites:import.template')}
        </a>
      </Panel>
    </div>
  );
}

function ReviewStep({ siteId, data, onDone, onRestart }: { siteId: string; data: ImportPreview; onDone: (r: ImportCommitResult) => void; onRestart: () => void }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const toast = useToast();
  const announce = useAnnounce();
  const suggestions = useApiMutation<ImportPreview>();
  const commit = useApiMutation<ImportCommitResult>();
  const [ack, setAck] = useState(false);
  const errors = data.rows.filter((r) => r.status === 'error');
  const duplicates = data.rows.filter((r) => r.status === 'duplicate');
  const valid = data.rows.filter((r) => r.status === 'valid');
  const withSuggestion = errors.filter((r) => r.suggestion);

  const applyAll = async () => {
    try {
      const p = await suggestions.mutateAsync({ method: 'POST', path: `/sites/${siteId}/flat-imports/${data.importId}/suggestions` });
      announce(t('sites:import.suggestionsApplied', { count: p.counts.errors }));
    } catch {
      /* shown below */
    }
  };
  const doCommit = async () => {
    try {
      const r = await commit.mutateAsync({ method: 'POST', path: `/sites/${siteId}/flat-imports/${data.importId}/commit`, body: { acknowledgeDuplicates: ack } });
      const msg = r.created ? t('sites:import.committed', { count: r.created }) : t('sites:import.nothingNew');
      toast.success(msg);
      announce(msg);
      onDone(r);
    } catch {
      /* shown below */
    }
  };
  const blockedReason = data.alreadyCommitted ? t('sites:import.alreadyShort') : errors.length ? t('sites:import.fixFirst', { count: errors.length }) : duplicates.some((d) => d.duplicateOf !== 'existing') && !ack ? t('sites:import.ackFirst') : !valid.length ? t('sites:import.nothingNew') : undefined;

  return (
    <div className="space-y-5" data-testid="import-review">
      <p className="text-sm text-muted">
        <FileSpreadsheet aria-hidden className="me-1 inline size-4 align-text-bottom" />
        <bdi dir="ltr" className="font-mono">{data.fileName}</bdi> · {t('sites:import.fingerprint', { hash: data.fileHash.slice(0, 8) })}
      </p>
      <dl className="grid gap-3 @lg:grid-cols-2 @3xl:grid-cols-5" data-testid="import-counts">
        <Count label={t('sites:import.counts.rows')} value={fmt.count(data.counts.rows)} />
        <Count label={t('sites:import.counts.valid')} value={fmt.count(data.counts.valid)} tone="success" testId="count-valid" />
        <Count label={t('sites:import.counts.errors')} value={fmt.count(data.counts.errors)} tone={data.counts.errors ? 'error' : undefined} testId="count-errors" />
        <Count label={t('sites:import.counts.duplicates')} value={fmt.count(data.counts.duplicates)} tone={data.counts.duplicates ? 'warning' : undefined} testId="count-duplicates" />
        <Count label={t('sites:import.counts.existing')} value={fmt.count(data.counts.existing)} testId="count-existing" />
      </dl>
      {data.alreadyCommitted && (
        <InlineAlert tone="info" title={t('sites:import.alreadyTitle')} role="status">
          <p data-testid="import-already">{t('sites:import.alreadyBody', { count: data.counts.existing })}</p>
        </InlineAlert>
      )}

      {errors.length > 0 && (
        <Panel
          title={t('sites:import.errorsTitle', { count: errors.length })}
          description={t('sites:import.errorsHint')}
          actions={
            withSuggestion.length > 0 ? (
              <Button variant="primary" size="sm" icon={Wand2} onPress={() => void applyAll()} isPending={suggestions.isPending} data-testid="import-apply-all">
                {t('sites:import.applyAll', { count: withSuggestion.length })}
              </Button>
            ) : undefined
          }
        >
          <ul className="space-y-3" data-testid="import-errors">
            {errors.map((r) => (
              <ErrorRow key={r.line} siteId={siteId} importId={data.importId} row={r} />
            ))}
          </ul>
          {suggestions.isError && <ProblemAlert error={suggestions.error} className="mt-3" />}
        </Panel>
      )}

      {duplicates.length > 0 && (
        <Panel title={t('sites:import.duplicatesTitle', { count: duplicates.length })} description={t('sites:import.duplicatesHint')}>
          <ul className="space-y-1.5 text-sm" data-testid="import-duplicates">
            {duplicates.slice(0, data.alreadyCommitted ? 6 : 50).map((r) => (
              <li key={r.line} className="flex flex-wrap items-center gap-2" data-line={r.line}>
                <Badge tone="warning" icon={Copy}>{t('sites:import.lineN', { line: r.line })}</Badge>
                <bdi dir="ltr" className="font-semibold">{r.values.flat}</bdi>
                <span className="text-muted">{r.duplicateOf === 'existing' ? t('sites:import.dupExisting') : t('sites:import.dupOf', { line: r.duplicateOf })}</span>
              </li>
            ))}
            {data.alreadyCommitted && duplicates.length > 6 && <li className="text-xs text-muted">{t('sites:import.andMore', { count: duplicates.length - 6 })}</li>}
          </ul>
        </Panel>
      )}

      {valid.length > 0 && (
        <Panel title={t('sites:import.validTitle', { count: valid.length })} description={t('sites:import.validHint')}>
          <ScrollRegion label={t('sites:import.validTitle', { count: valid.length })}>
            <table className="w-full min-w-[36rem] text-sm" data-testid="import-valid">
              <caption className="sr-only">{t('sites:import.validTitle', { count: valid.length })}</caption>
              <thead>
                <tr className="border-b border-border text-xs text-muted">
                  {(['flat', 'type', 'owner', 'occupancy', 'payer'] as const).map((c) => (
                    <th key={c} scope="col" className="py-2 pe-3 text-start font-medium">{t(`sites:structure.cols.${c}`)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {valid.slice(0, 8).map((r) => (
                  <tr key={r.line} className="border-b border-border/60">
                    <th scope="row" className="py-2 pe-3 text-start"><bdi dir="ltr">{r.values.flat}</bdi></th>
                    <td className="py-2 pe-3">{r.values.type}</td>
                    <td className="py-2 pe-3"><bdi>{r.values.owner_name}</bdi></td>
                    <td className="py-2 pe-3">{t(`sites:import.occupancyValue.${r.values.occupancy as 'owner'}`)}</td>
                    <td className="py-2 pe-3">{t(`sites:import.payerValue.${r.values.payer as 'owner'}`)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollRegion>
          {valid.length > 8 && <p className="mt-2 text-xs text-muted">{t('sites:import.andMore', { count: valid.length - 8 })}</p>}
        </Panel>
      )}

      <section aria-label={t('sites:import.commitTitle')} className="space-y-3 rounded-card border border-border/70 bg-panel p-5 shadow-card">
        <p className="text-sm text-text">{t('sites:import.allOrNothing')}</p>
        {duplicates.some((d) => d.duplicateOf !== 'existing') && !data.alreadyCommitted && (
          <Checkbox isSelected={ack} onChange={setAck} className="group flex items-start gap-2 text-sm text-text" data-testid="import-ack">
            <span aria-hidden className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-[0.3rem] border-2 border-border-control group-data-selected:border-primary group-data-selected:bg-primary group-data-focus-visible:outline-2 group-data-focus-visible:outline-focus">
              <CheckCircle2 className="size-3.5 text-on-primary opacity-0 group-data-selected:opacity-100" />
            </span>
            {t('sites:import.ack', { count: duplicates.filter((d) => d.duplicateOf !== 'existing').length })}
          </Checkbox>
        )}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <Button variant="quiet" onPress={onRestart} data-testid="import-restart">{t('sites:import.restart')}</Button>
          <Button variant="primary" icon={FileSpreadsheet} onPress={() => void doCommit()} isPending={commit.isPending} isDisabled={!!blockedReason} disabledReason={blockedReason} data-testid="import-commit">
            {t('sites:import.commit', { count: valid.length })}
          </Button>
        </div>
        {commit.isError && <ProblemAlert error={commit.error} />}
      </section>
    </div>
  );
}

function Count({ label, value, tone, testId }: { label: string; value: string; tone?: 'success' | 'error' | 'warning'; testId?: string }) {
  return (
    <div className={cn('rounded-tile border px-4 py-3', tone === 'error' ? 'border-error/30 bg-error-soft' : tone === 'warning' ? 'border-warning/30 bg-warning-soft' : tone === 'success' ? 'border-success/30 bg-success-soft' : 'border-border bg-panel')} data-testid={testId}>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-xl font-bold text-text">{value}</dd>
    </div>
  );
}

function ErrorRow({ siteId, importId, row }: { siteId: string; importId: string; row: ImportRow }) {
  const { t } = useT();
  const dt = dynamicT(t);
  const save = useApiMutation<ImportPreview>();
  const columns = [...new Set(row.problems.map((p) => p.column))];
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(columns.map((c) => [c, row.values[c] ?? ''])));
  const send = async (patch: Record<string, string>) => {
    try {
      await save.mutateAsync({ method: 'PATCH', path: `/sites/${siteId}/flat-imports/${importId}/rows/${row.line}`, body: { values: patch } });
    } catch {
      /* shown below */
    }
  };
  return (
    <li className="rounded-tile border border-error/30 p-3" data-testid="import-error-row" data-line={row.line} data-flat={row.values.flat}>
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <Badge tone="error" icon={CircleAlert}>{t('sites:import.lineN', { line: row.line })}</Badge>
        <bdi dir="ltr" className="font-semibold text-text">{row.values.flat || '—'}</bdi>
      </p>
      <ul className="mt-1.5 space-y-0.5 text-sm text-error">
        {row.problems.map((p, i) => (
          <li key={i}>{t('sites:import.problem', { column: t(`sites:import.columns.${p.column as 'flat'}`), problem: dt(`sites:import.problems.${p.code}`) })}</li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        {columns.map((c) => (
          <TextField key={c} value={values[c] ?? ''} onChange={(v) => setValues((s) => ({ ...s, [c]: v }))} className="flex min-w-36 flex-col gap-1">
            <Label className="text-xs font-medium text-text">{t(`sites:import.columns.${c as 'flat'}`)}</Label>
            <Input className="min-h-10 rounded-control border border-border-control bg-panel px-3 text-sm text-text outline-none focus:outline-2 focus:outline-focus" data-testid={`import-fix-${c}`} />
          </TextField>
        ))}
        <Button variant="secondary" size="sm" onPress={() => void send(values)} isPending={save.isPending} data-testid="import-fix-save">{t('sites:import.saveFix')}</Button>
        {row.suggestion && (
          <Button variant="quiet" size="sm" icon={Wand2} onPress={() => void send(row.suggestion!)} data-testid="import-use-suggestion">
            {t('sites:import.useSuggestion', { value: Object.values(row.suggestion).join(', ') })}
          </Button>
        )}
      </div>
      {save.isError && <ProblemAlert error={save.error} className="mt-2" />}
    </li>
  );
}

function DoneStep({ siteId, created, unchanged }: { siteId: string; created: number; unchanged: number }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  return (
    <Panel>
      <div className="flex flex-col items-start gap-4" data-testid="import-done" data-created={created}>
        <span className="flex items-center gap-3">
          <CheckCircle2 aria-hidden className="size-8 text-success" />
          <span className="text-xl font-bold text-text">{created ? t('sites:import.doneTitle', { count: created }) : t('sites:import.doneNothing')}</span>
        </span>
        <p className="text-sm text-muted">{created ? t('sites:import.doneBody') : t('sites:import.doneNothingBody', { count: fmt.count(unchanged) })}</p>
        <div className="flex flex-wrap gap-3">
          <Link href={SOCIETY.structure(siteId)} variant="plain" className={buttonClass('primary')} data-testid="import-open-structure">{t('sites:import.openStructure')}</Link>
          <Link href={SOCIETY.openingBalances(siteId)} variant="plain" className={buttonClass('secondary')}>{t('sites:import.nextOpening')}</Link>
          <Link href={SOCIETY.people()} variant="plain" className={buttonClass('secondary')}>{t('sites:import.openPeople')}</Link>
        </div>
      </div>
    </Panel>
  );
}
