import { ApiError, EXPORT_DATASETS, type ExportDataset, type ExportPreview, type ExportRequest } from '@repo/contracts';
import { Badge, Button, Drawer, InlineAlert, PlainCheckbox, PlainTextArea, SegmentedControl, Skeleton, useAnnounce, useApiMutation, useApiQuery, useT, useToast } from '@repo/ui';
import { Check, ShieldAlert, X } from 'lucide-react';
import { useState } from 'react';

/** Personal and financial flags, as words with an icon (never colour alone). */
export function DataFlags({ personal, financial }: { personal: boolean; financial: boolean }) {
  const { t } = useT();
  return (
    <>
      {personal && (
        <Badge tone="warning" icon={ShieldAlert}>
          {t('identity:export.personal')}
        </Badge>
      )}
      {financial && <Badge tone="info">{t('identity:export.financial')}</Badge>}
    </>
  );
}

/**
 * ADM-024 new export. The server says, per dataset, whether this requester could open it themselves
 * (licence, role, sites) and how many rows they would get; what they cannot open is shown with the
 * reason and cannot be chosen. Anything personal or financial goes to an approver first.
 */
export function NewExportDrawer({ isOpen, onOpenChange }: { isOpen: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useT();
  const toast = useToast();
  const announce = useAnnounce();
  const preview = useApiQuery<ExportPreview>({ method: 'POST', path: '/data-exports/preview', body: { datasets: EXPORT_DATASETS } }, { enabled: isOpen });
  const create = useApiMutation<ExportRequest>();
  const [chosen, setChosen] = useState<ExportDataset[]>([]);
  const [format, setFormat] = useState<'csv' | 'json'>('csv');
  const [purpose, setPurpose] = useState('');
  const [errors, setErrors] = useState<{ datasets?: string; purpose?: string; problem?: string }>({});
  const items = preview.data?.datasets ?? [];
  const picked = items.filter((d) => d.included && chosen.includes(d.dataset));
  const needsApproval = picked.some((d) => d.personalData || d.financialData);
  const close = (open: boolean) => {
    onOpenChange(open);
    if (!open) {
      setChosen([]);
      setPurpose('');
      setErrors({});
    }
  };

  const submit = () => {
    const next: typeof errors = {};
    if (!picked.length) next.datasets = 'forms:errors.selectOne';
    if (purpose.trim().length < 10) next.purpose = 'identity:export.errors.purpose';
    setErrors(next);
    if (next.datasets || next.purpose) {
      announce(t((next.datasets ?? next.purpose) as 'forms:errors.selectOne'), 'assertive');
      return;
    }
    create.mutate(
      { method: 'POST', path: '/data-exports', body: { datasets: picked.map((d) => d.dataset), purpose, format } },
      {
        onSuccess: (r) => {
          const msg = r.state === 'ready' ? t('identity:export.createdReady', { ref: r.reference }) : t('identity:export.created', { ref: r.reference });
          toast.success(msg);
          announce(msg);
          close(false);
        },
        onError: (err) => {
          if (!(err instanceof ApiError)) return;
          const f = err.problem.errors;
          setErrors({ purpose: f?.purpose?.[0]?.code, datasets: f?.datasets?.[0]?.code, ...(f ? {} : { problem: err.problem.messageKey }) });
        },
      },
    );
  };

  return (
    <Drawer
      isOpen={isOpen}
      onOpenChange={close}
      title={t('identity:export.newTitle')}
      subtitle={t('identity:export.newSubtitle')}
      size="lg"
      testId="export-new"
      footer={
        <Button variant="primary" isPending={create.isPending} onPress={submit} data-testid="export-submit">
          {needsApproval || !picked.length ? t('identity:export.submit') : t('identity:export.submitReady')}
        </Button>
      }
    >
      <div className="space-y-6">
        <fieldset className="space-y-2" aria-describedby={errors.datasets ? 'export-datasets-error' : undefined}>
          <legend className="mb-1 text-sm font-semibold text-text">{t('identity:export.datasetsLabel')}</legend>
          {!preview.data ? (
            <>
              <p className="sr-only" role="status">
                {t('identity:export.previewLoading')}
              </p>
              <Skeleton className="h-48 w-full" />
            </>
          ) : (
            <ul className="space-y-2" data-testid="export-datasets">
              {items.map((d) => (
                <li key={d.dataset} className={`rounded-tile border p-3 ${d.included ? 'border-border' : 'border-dashed border-border bg-sunken/40'}`} data-dataset={d.dataset} data-included={d.included}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <PlainCheckbox
                      isSelected={chosen.includes(d.dataset)}
                      isDisabled={!d.included}
                      onChange={(v) => {
                        setChosen((cur) => (v ? [...cur, d.dataset] : cur.filter((x) => x !== d.dataset)));
                        setErrors((e) => ({ ...e, datasets: undefined }));
                      }}
                      testId={`export-pick-${d.dataset}`}
                    >
                      <span className="font-medium">{t(`identity:export.datasets.${d.dataset}`)}</span>
                      <span className="block text-xs text-muted">{d.included ? t('identity:export.rows', { count: d.rows }) : t(`identity:export.reason.${d.reason ?? 'permission_missing'}`)}</span>
                    </PlainCheckbox>
                    <span className="flex flex-wrap gap-1.5">
                      <DataFlags personal={d.personalData} financial={d.financialData} />
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {errors.datasets && (
            <p id="export-datasets-error" className="text-sm text-error">
              {t(errors.datasets as 'forms:errors.selectOne')}
            </p>
          )}
        </fieldset>

        <SegmentedControl<'csv' | 'json'>
          label={t('identity:export.format')}
          value={format}
          onChange={setFormat}
          options={[
            { id: 'csv', label: t('identity:export.csv') },
            { id: 'json', label: t('identity:export.json') },
          ]}
          testId="export-format"
        />
        <PlainTextArea label={t('identity:export.purpose')} description={t('identity:export.purposeHint')} value={purpose} onChange={(v) => {
            setPurpose(v);
            if (errors.purpose && v.trim().length >= 10) setErrors((e) => ({ ...e, purpose: undefined }));
          }} errorKey={errors.purpose} testId="export-purpose" />

        {picked.length > 0 && (
          <InlineAlert tone={needsApproval ? 'warning' : 'success'} data-testid="export-approval-note">
            {needsApproval ? t('identity:export.needsApproval') : t('identity:export.noApproval')}
          </InlineAlert>
        )}
        {errors.problem && <InlineAlert tone="error">{t(errors.problem as 'identity:export.errors.nothing')}</InlineAlert>}
      </div>
    </Drawer>
  );
}

/**
 * ADM-024 approval (maker-checker, D-40): someone with approval rights who did not ask for it
 * approves all of it, removes datasets, or declines with a reason. The server refuses adding a
 * dataset and refuses the requester deciding their own export.
 */
export function DecideExportDrawer({ request, onClose }: { request: ExportRequest | null; onClose: () => void }) {
  const { t } = useT();
  const toast = useToast();
  const announce = useAnnounce();
  const decide = useApiMutation<ExportRequest>();
  const included = request?.datasets.filter((d) => d.included) ?? [];
  const [keep, setKeep] = useState<ExportDataset[] | null>(null);
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState<string | undefined>();
  const kept = keep ?? included.map((d) => d.dataset);
  const done = (msg: string) => {
    toast.success(msg);
    announce(msg);
    setKeep(null);
    setNote('');
    setNoteError(undefined);
    onClose();
  };
  const send = (decision: 'approve' | 'reject') => {
    if (!request) return;
    if (decision === 'reject' && note.trim().length < 5) {
      setNoteError('forms:errors.reasonRequired');
      announce(t('forms:errors.reasonRequired'), 'assertive');
      return;
    }
    decide.mutate(
      { method: 'POST', path: `/data-exports/${request.id}/decide`, body: { decision, ...(decision === 'approve' ? { keep: kept } : {}), ...(note.trim() ? { note } : {}) } },
      {
        onSuccess: () => done(decision === 'approve' ? t('identity:export.approved', { ref: request.reference }) : t('identity:export.rejected', { ref: request.reference })),
        onError: (err) => toast.error(err instanceof ApiError ? t(err.problem.messageKey as 'identity:export.errors.cannotWiden') : t('identity:export.failed')),
      },
    );
  };
  return (
    <Drawer
      isOpen={!!request}
      onOpenChange={(open) => !open && onClose()}
      title={request ? t('identity:export.decideTitle', { ref: request.reference }) : ''}
      subtitle={request ? t('identity:export.decideSubtitle', { name: request.requestedByName }) : undefined}
      testId="export-decide"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" icon={X} isPending={decide.isPending} onPress={() => send('reject')} data-testid="export-reject">
            {t('identity:export.reject')}
          </Button>
          <Button variant="primary" icon={Check} isDisabled={!kept.length} isPending={decide.isPending} onPress={() => send('approve')} data-testid="export-approve">
            {kept.length < included.length ? t('identity:export.approveSome', { count: kept.length, total: included.length }) : t('identity:export.approve')}
          </Button>
        </div>
      }
    >
      {request && (
        <div className="space-y-5">
          <p className="rounded-tile bg-sunken/60 p-3 text-sm text-text">{t('identity:export.purposeLine', { text: request.purpose })}</p>
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-semibold text-text">{t('identity:export.keep')}</legend>
            {included.map((d) => (
              <div key={d.dataset} className="flex flex-wrap items-start justify-between gap-2 rounded-tile border border-border p-3">
                <PlainCheckbox isSelected={kept.includes(d.dataset)} onChange={(v) => setKeep(v ? [...kept, d.dataset] : kept.filter((x) => x !== d.dataset))} testId={`export-keep-${d.dataset}`}>
                  <span className="font-medium">{t(`identity:export.datasets.${d.dataset}`)}</span>
                  <span className="block text-xs text-muted">{t('identity:export.rows', { count: d.rows })}</span>
                </PlainCheckbox>
                <span className="flex flex-wrap gap-1.5">
                  <DataFlags personal={d.personalData} financial={d.financialData} />
                </span>
              </div>
            ))}
          </fieldset>
          <PlainTextArea label={t('identity:export.note')} description={t('identity:export.noteHint')} value={note} onChange={setNote} optional errorKey={noteError} testId="export-note" />
        </div>
      )}
    </Drawer>
  );
}
