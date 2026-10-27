import { ApiError, type ConfigChange, type ConfigKind, type ConfigOverview, type ConfigPayload, type ConfigVersion } from '@repo/contracts';
import { Badge, Button, ConfirmDialog, dynamicT, InlineAlert, Panel, useAnnounce, useApiMutation, useApiQuery, useSession, useT, useToast, type StatusTone } from '@repo/ui';
import { CheckCircle2, CornerUpLeft, FilePen, Send, Undo2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useHqFormat } from '../lib/format';
import { Expandable } from './Expandable';
import { DateInput, TextInput } from './inputs';

/**
 * Versioned commercial configuration in Platform HQ (rate cards, commercial policy, catalogue,
 * signup policy). Supreme Admin prepares a new version, a different approver approves it, and it
 * applies from its effective date; every step is in the audit trail. The mock server validates and
 * decides everything; these components only show what it answers.
 */

export const useConfig = (kind: ConfigKind) => useApiQuery<ConfigOverview>({ method: 'GET', path: `/platform/config/${kind}` });

const TONE: Record<ConfigVersion['status'], StatusTone> = {
  draft: 'neutral',
  pending_approval: 'warning',
  returned: 'warning',
  withdrawn: 'neutral',
  scheduled: 'info',
  in_force: 'success',
  superseded: 'neutral',
};

export function ConfigStatus({ version }: { version: ConfigVersion }) {
  const { t } = useT();
  return (
    <Badge tone={TONE[version.status]}>{t(`platform:config.status.${version.status}`)}</Badge>
  );
}

/** Field-by-field differences, readable (paths are shown as written, values left-to-right isolated). */
export function ChangeList({ changes, testId }: { changes: readonly ConfigChange[]; testId?: string }) {
  const { t } = useT();
  if (!changes.length) return <p className="text-sm text-muted">{t('platform:config.noChanges')}</p>;
  return (
    <div className="overflow-x-auto" role="region" aria-label={t('platform:config.changes')} tabIndex={0}>
      <table className="w-full min-w-[28rem] text-sm" data-testid={testId}>
        <thead>
          <tr className="border-b border-border text-xs text-muted">
            <th scope="col" className="py-1.5 pe-3 text-start font-medium">{t('platform:config.field')}</th>
            <th scope="col" className="py-1.5 pe-3 text-start font-medium">{t('platform:config.before')}</th>
            <th scope="col" className="py-1.5 text-start font-medium">{t('platform:config.after')}</th>
          </tr>
        </thead>
        <tbody>
          {changes.map((c) => (
            <tr key={c.path} className="border-b border-border/60 last:border-0 align-top">
              <th scope="row" className="py-1.5 pe-3 text-start font-normal">
                <bdi dir="ltr" className="font-mono text-xs break-all">{c.path}</bdi>
              </th>
              <td className="py-1.5 pe-3 text-muted">
                <bdi dir="ltr">{c.before}</bdi>
              </td>
              <td className="py-1.5 font-medium text-text">
                <bdi dir="ltr">{c.after}</bdi>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Server problems of a refused request as readable lines (field codes translate with their params). */
export function problemLines(t: ReturnType<typeof useT>['t'], error: unknown): string[] {
  if (!(error instanceof ApiError)) return [];
  const tr = dynamicT(t);
  const errs = error.problem.errors ?? {};
  const lines = Object.entries(errs).flatMap(([field, list]) => (list ?? []).map((e) => `${field}: ${tr(e.code, (e as { params?: Record<string, string> }).params ?? {})}`));
  return lines.length ? lines : [tr(error.problem.messageKey)];
}

export function ProblemSummary({ error, testId = 'config-problems' }: { error: unknown; testId?: string }) {
  const { t } = useT();
  const lines = problemLines(t, error);
  if (!lines.length) return null;
  return (
    <InlineAlert tone="error" title={t('platform:config.refused')} role="alert">
      <ul className="list-disc space-y-0.5 ps-5" data-testid={testId}>
        {lines.map((l) => (
          <li key={l}>
            <bdi>{l}</bdi>
          </li>
        ))}
      </ul>
    </InlineAlert>
  );
}

/** The versions of one kind, newest first, with the actions the signed-in person may take. */
export function ConfigVersions({ overview, onEdit, testId = 'config-versions' }: { overview: ConfigOverview; onEdit: (id: string) => void; testId?: string }) {
  const { t } = useT();
  const fmt = useHqFormat();
  const { persona } = useSession();
  const toast = useToast();
  const announce = useAnnounce();
  const act = useApiMutation<ConfigVersion>();
  const [dialog, setDialog] = useState<{ id: string; kind: 'approve' | 'return' | 'withdraw' } | null>(null);
  const [error, setError] = useState<unknown>(null);

  const run = async (path: string, body: unknown, message: string) => {
    setError(null);
    try {
      await act.mutateAsync({ method: 'POST', path, body });
      toast.success(message);
      announce(message);
    } catch (e) {
      setError(e);
      throw e;
    }
  };
  const current = dialog ? overview.versions.find((v) => v.id === dialog.id) : undefined;

  return (
    <Panel title={t('platform:config.versionsTitle')} description={t('platform:config.versionsHint')}>
      {error !== null && <ProblemSummary error={error} />}
      <ol className="space-y-3" data-testid={testId}>
        {overview.versions.map((v) => {
          const mine = persona?.principalId === v.createdById;
          const editable = overview.canManage && (v.state === 'draft' || v.state === 'returned');
          const decidable = overview.canApprove && v.state === 'pending_approval' && !mine;
          const withdrawable = overview.canManage && (['draft', 'pending_approval', 'returned'].includes(v.state) || v.status === 'scheduled');
          return (
            <li key={v.id} className="rounded-tile border border-border/70 p-3" data-testid={`config-version-${v.version}`} data-status={v.status}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-text">
                  <bdi dir="ltr">{v.label}</bdi> <span className="text-sm font-normal text-muted">· {t('platform:config.version', { n: v.version })}</span>
                </p>
                <ConfigStatus version={v} />
              </div>
              <p className="mt-1 text-sm text-muted">
                {t('platform:config.effective', { date: fmt.date(v.effectiveFrom) })} · {t('platform:config.by', { name: v.createdBy })}
                {v.decidedBy ? ` · ${t(v.state === 'returned' ? 'platform:config.returnedBy' : 'platform:config.approvedBy', { name: v.decidedBy })}` : ''}
              </p>
              {v.reason && <p className="mt-1 text-sm text-text">{v.reason}</p>}
              {v.comment && <p className="mt-1 text-sm text-warning">“{v.comment}”</p>}
              {v.changes.length > 0 && (
                <div className="mt-2">
                  <Expandable title={t('platform:config.changesCount', { count: v.changes.length })} testId={`config-changes-${v.version}`}>
                    <ChangeList changes={v.changes} />
                  </Expandable>
                </div>
              )}
              {(editable || decidable || withdrawable || (v.state === 'pending_approval' && mine)) && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {editable && (
                    <Button variant="secondary" icon={FilePen} onPress={() => onEdit(v.id)} data-testid={`config-edit-${v.version}`}>
                      {t('platform:config.edit')}
                    </Button>
                  )}
                  {decidable && (
                    <>
                      <Button variant="primary" icon={CheckCircle2} onPress={() => setDialog({ id: v.id, kind: 'approve' })} data-testid={`config-approve-${v.version}`}>
                        {t('platform:approval.approve')}
                      </Button>
                      <Button variant="secondary" icon={CornerUpLeft} onPress={() => setDialog({ id: v.id, kind: 'return' })} data-testid={`config-return-${v.version}`}>
                        {t('platform:approval.return')}
                      </Button>
                    </>
                  )}
                  {v.state === 'pending_approval' && mine && <p className="text-sm text-muted">{t('platform:config.waitingForApprover')}</p>}
                  {withdrawable && (
                    <Button variant="quiet" icon={Undo2} onPress={() => setDialog({ id: v.id, kind: 'withdraw' })} data-testid={`config-withdraw-${v.version}`}>
                      {t('platform:config.withdraw')}
                    </Button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {current && (
        <>
          <ConfirmDialog
            isOpen={dialog?.kind === 'approve'}
            onOpenChange={(o) => !o && setDialog(null)}
            title={t('platform:config.approveTitle', { label: current.label })}
            effect={t('platform:config.approveEffect', { date: fmt.date(current.effectiveFrom) })}
            confirmLabel={t('platform:approval.approve')}
            onConfirm={() => run(`/platform/config/versions/${current.id}/decide`, { decision: 'approve' }, t('platform:config.approvedToast', { label: current.label }))}
          />
          <ConfirmDialog
            isOpen={dialog?.kind === 'return'}
            onOpenChange={(o) => !o && setDialog(null)}
            title={t('platform:config.returnTitle', { label: current.label })}
            effect={t('platform:config.returnEffect')}
            confirmLabel={t('platform:approval.return')}
            reasonLabel={t('platform:approval.returnReason')}
            onConfirm={(reason) => run(`/platform/config/versions/${current.id}/decide`, { decision: 'return', comment: reason }, t('platform:config.returnedToast', { label: current.label }))}
          />
          <ConfirmDialog
            isOpen={dialog?.kind === 'withdraw'}
            onOpenChange={(o) => !o && setDialog(null)}
            title={t('platform:config.withdrawTitle', { label: current.label })}
            effect={t('platform:config.withdrawEffect')}
            confirmLabel={t('platform:config.withdraw')}
            destructive
            onConfirm={() => run(`/platform/config/versions/${current.id}/withdraw`, {}, t('platform:config.withdrawnToast', { label: current.label }))}
          />
        </>
      )}
    </Panel>
  );
}

/**
 * Editing a draft version: the payload editor of the kind, the effective date and the reason.
 * "Save draft" stores it; "Submit for approval" stores and submits it. The server re-validates
 * both and its refusals are listed field by field.
 */
export function DraftEditor<P extends ConfigPayload>({
  version,
  children,
  onClose,
}: {
  version: ConfigVersion & { payload: P };
  children: (payload: P, set: (next: P) => void) => ReactNode;
  onClose: () => void;
}) {
  const { t } = useT();
  const toast = useToast();
  const announce = useAnnounce();
  const save = useApiMutation<ConfigVersion>();
  const [payload, setPayload] = useState<P>(version.payload);
  const [effectiveFrom, setEffectiveFrom] = useState(version.effectiveFrom);
  const [reason, setReason] = useState(version.reason);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const persist = async (submit: boolean) => {
    setError(null);
    setBusy(true);
    try {
      await save.mutateAsync({ method: 'PATCH', path: `/platform/config/versions/${version.id}`, body: { payload, effectiveFrom, reason } });
      if (submit) await save.mutateAsync({ method: 'POST', path: `/platform/config/versions/${version.id}/submit` });
      const message = submit ? t('platform:config.submittedToast', { label: version.label }) : t('platform:config.savedToast', { label: version.label });
      toast.success(message);
      announce(message);
      if (submit) onClose();
    } catch (e) {
      setError(e);
      announce(t('platform:config.refused'), 'assertive');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title={t('platform:config.draftTitle', { label: version.label })} description={t('platform:config.draftHint')}>
      <div className="space-y-5" data-testid="config-draft">
        {error !== null && <ProblemSummary error={error} />}
        <div className="grid gap-4 @2xl:grid-cols-2">
          <DateInput label={t('platform:config.effectiveFrom')} value={effectiveFrom} onChange={setEffectiveFrom} description={t('platform:config.effectiveHint')} testId="config-effective" />
          <TextInput label={t('platform:config.reason')} value={reason} onChange={setReason} description={t('platform:config.reasonHint')} testId="config-reason" />
        </div>
        {children(payload, setPayload)}
        <div className="flex flex-wrap gap-2 border-t border-border/70 pt-4">
          <Button variant="primary" icon={Send} isPending={busy} onPress={() => void persist(true)} data-testid="config-submit">
            {t('platform:config.submit')}
          </Button>
          <Button variant="secondary" isDisabled={busy} onPress={() => void persist(false)} data-testid="config-save">
            {t('platform:config.save')}
          </Button>
          <Button variant="quiet" onPress={onClose} data-testid="config-close">
            {t('platform:config.close')}
          </Button>
        </div>
      </div>
    </Panel>
  );
}

/** "Prepare a new version" for Supreme Admin: creates a draft copied from the version in force. */
export function NewVersionButton({ kind, onCreated }: { kind: ConfigKind; onCreated: (id: string) => void }) {
  const { t } = useT();
  const create = useApiMutation<ConfigVersion>();
  const [error, setError] = useState<unknown>(null);
  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        variant="primary"
        icon={FilePen}
        isPending={create.isPending}
        onPress={async () => {
          setError(null);
          try {
            const v = await create.mutateAsync({ method: 'POST', path: `/platform/config/${kind}/versions`, body: {} });
            onCreated(v.id);
          } catch (e) {
            setError(e);
          }
        }}
        data-testid="config-new"
      >
        {t('platform:config.newVersion')}
      </Button>
      {error !== null && <ProblemSummary error={error} />}
    </div>
  );
}

/** The version in force, in one line. */
export function InForce({ version }: { version: ConfigVersion }) {
  const { t } = useT();
  const fmt = useHqFormat();
  return (
    <p className="text-sm text-muted" data-testid="config-in-force">
      {t('platform:config.inForce', { label: version.label, date: fmt.date(version.effectiveFrom), by: version.decidedBy ?? '' })}
    </p>
  );
}
