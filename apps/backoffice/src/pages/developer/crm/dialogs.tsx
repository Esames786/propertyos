import { LOST_REASONS, OPEN_STAGES, type LostReason, type OpenStage, type Opportunity } from '@repo/contracts';
import { ApiError } from '@repo/contracts';
import { Button, Dialog, InlineAlert, MenuButton, PlainTextArea, SelectControl, useAnnounce, useApiMutation, useApiQuery, useKeyedCreate, useNavigation, useT, useToast } from '@repo/ui';
import { ArrowRightLeft, ChevronDown, Sparkles, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { ACCESS_DATE } from '../../../nav.config';
import { DateInput, SearchSelect, useFieldError } from '../../society/hr/hkit';
import { ProblemAlert } from '../../society/kit';
import { E1, STAGE_ICON, WRAP } from './kit';

/**
 * Gate E.1 dialogs: convert a qualified lead (one key per logical create, `useKeyedCreate`, so a second
 * press or a retry never opens a second opportunity), mark an opportunity lost with a reason, reopen it
 * with a note, and the "Move to stage" menu (the keyboard and screen-reader alternative to dragging a
 * card). Every change names the record version it was made on; a stale one is refused and refreshed.
 */

export const triggerClass =
  'inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-control border border-border-control bg-panel px-3 text-sm font-medium text-text outline-none data-hovered:bg-sunken data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus pointer-coarse:min-h-11';

interface Convertible {
  id: string;
  ref: string;
  displayName: string;
  projectName: string;
  owner: { name: string };
}

export function ConvertDialog({ isOpen, onClose, presetLeadId }: { isOpen: boolean; onClose: () => void; presetLeadId?: string | null }) {
  const { t } = useT();
  const toast = useToast();
  const announce = useAnnounce();
  const { navigate } = useNavigation();
  const leads = useApiQuery<{ items: Convertible[] }>(isOpen ? { method: 'GET', path: '/crm/convertible-leads' } : null);
  const create = useKeyedCreate<Opportunity>('convert');
  const [leadId, setLeadId] = useState<string | null>(presetLeadId ?? null);
  const [close, setClose] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [tried, setTried] = useState(false);
  const fieldError = useFieldError(error);
  const options = (leads.data?.items ?? []).map((l) => ({ id: l.id, label: `${l.displayName} · ${l.ref}`, hint: t('sales:convert.leadHint', { project: l.projectName, owner: l.owner.name }) }));
  const presetMissing = !!presetLeadId && !!leads.data && !leads.data.items.some((l) => l.id === presetLeadId);

  const submit = async () => {
    setTried(true);
    if (!leadId) return;
    setError(null);
    try {
      const o = await create.send({ method: 'POST', path: `/leads/${leadId}/opportunities`, body: { note: note.trim(), expectedCloseOn: close } });
      const message = t('sales:convert.done', { ref: o.ref, name: o.displayName });
      onClose();
      toast.success(message);
      announce(message);
      navigate(E1.opportunity(o.id));
    } catch (e) {
      setError(e);
      announce(e instanceof ApiError ? t('sales:common.refused') : t('errors:network.unavailable'));
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={(o) => !o && onClose()}
      title={t('sales:convert.title')}
      description={t('sales:convert.intro')}
      footer={
        <>
          <Button className={WRAP} variant="secondary" onPress={onClose}>
            {t('common:actions.cancel')}
          </Button>
          <Button className={WRAP} variant="primary" icon={Sparkles} onPress={() => void submit()} isPending={create.isPending} data-testid="convert-submit">
            {t('sales:convert.submit')}
          </Button>
        </>
      }
    >
      <div className="space-y-4" data-testid="convert-dialog">
        {!!error && <ProblemAlert error={error} />}
        {presetMissing && (
          <InlineAlert tone="warning" data-testid="convert-preset-unavailable">
            {t('sales:convert.presetUnavailable')}
          </InlineAlert>
        )}
        {leads.data && leads.data.items.length === 0 ? (
          <InlineAlert tone="info" data-testid="convert-none">
            {t('sales:convert.none')}
          </InlineAlert>
        ) : (
          <SearchSelect
            label={t('sales:convert.lead')}
            options={options}
            value={leadId}
            onChange={setLeadId}
            testId="convert-lead"
            description={t('sales:convert.leadDescription')}
            errorText={tried && !leadId ? t('sales:convert.leadRequired') : undefined}
          />
        )}
        <DateInput id="convert-close" label={t('sales:convert.close')} value={close} onChange={setClose} min={ACCESS_DATE} testId="convert-close" description={fieldError('expectedCloseOn') ?? t('sales:convert.closeHint')} />
        <PlainTextArea label={t('sales:convert.note')} value={note} onChange={setNote} optional testId="convert-note" errorKey={error instanceof ApiError && error.problem.errors?.note ? 'sales:errors.checkLength' : undefined} />
      </div>
    </Dialog>
  );
}

export function LostDialog({ opportunity, onClose, onDone }: { opportunity: Opportunity | null; onClose: () => void; onDone?: (o: Opportunity) => void }) {
  const { t } = useT();
  const toast = useToast();
  const announce = useAnnounce();
  const mutation = useApiMutation<Opportunity>();
  const [reason, setReason] = useState<LostReason | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [tried, setTried] = useState(false);
  const close = () => {
    setReason(null);
    setNote('');
    setError(null);
    setTried(false);
    onClose();
  };
  const submit = async () => {
    if (!opportunity) return;
    setTried(true);
    if (!reason || (reason === 'other' && !note.trim())) return;
    try {
      const o = await mutation.mutateAsync({ method: 'POST', path: `/opportunities/${opportunity.id}/lost`, body: { reason, note: note.trim(), version: opportunity.version } });
      const message = t('sales:lost.done', { name: o.displayName, reason: t(`sales:lostReason.${reason}`) });
      close();
      toast.success(message);
      announce(message);
      onDone?.(o);
    } catch (e) {
      setError(e);
    }
  };
  return (
    <Dialog
      isOpen={!!opportunity}
      onOpenChange={(o) => !o && close()}
      title={opportunity ? t('sales:lost.title', { name: opportunity.displayName }) : ''}
      description={t('sales:lost.intro')}
      footer={
        <>
          <Button className={WRAP} variant="secondary" onPress={close}>
            {t('common:actions.cancel')}
          </Button>
          <Button className={WRAP} variant="danger" icon={XCircle} onPress={() => void submit()} isPending={mutation.isPending} data-testid="lost-submit">
            {t('sales:lost.submit')}
          </Button>
        </>
      }
    >
      <div className="space-y-4" data-testid="lost-dialog">
        {!!error && <ProblemAlert error={error} />}
        <SelectControl
          label={t('sales:lost.reason')}
          value={reason}
          onChange={(v) => setReason((v as LostReason) ?? null)}
          options={LOST_REASONS.map((r) => ({ id: r, label: t(`sales:lostReason.${r}`) }))}
          placeholder={t('sales:lost.reasonPlaceholder')}
          isInvalid={tried && !reason}
          errorKey={tried && !reason ? 'sales:errors.reasonRequired' : undefined}
          testId="lost-reason"
        />
        <PlainTextArea
          label={t('sales:lost.note')}
          value={note}
          onChange={setNote}
          optional={reason !== 'other'}
          description={t('sales:lost.noteHint')}
          errorKey={tried && reason === 'other' && !note.trim() ? 'sales:errors.noteRequired' : undefined}
          testId="lost-note"
        />
      </div>
    </Dialog>
  );
}

export function ReopenDialog({ opportunity, onClose, onDone }: { opportunity: Opportunity | null; onClose: () => void; onDone?: (o: Opportunity) => void }) {
  const { t } = useT();
  const toast = useToast();
  const announce = useAnnounce();
  const mutation = useApiMutation<Opportunity>();
  const [note, setNote] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [tried, setTried] = useState(false);
  const close = () => {
    setNote('');
    setError(null);
    setTried(false);
    onClose();
  };
  const submit = async () => {
    if (!opportunity) return;
    setTried(true);
    if (note.trim().length < 3) return;
    try {
      const o = await mutation.mutateAsync({ method: 'POST', path: `/opportunities/${opportunity.id}/reopen`, body: { note: note.trim(), version: opportunity.version } });
      const message = t('sales:reopen.done', { name: o.displayName, stage: t(`sales:stage.${o.stage}`) });
      close();
      toast.success(message);
      announce(message);
      onDone?.(o);
    } catch (e) {
      setError(e);
    }
  };
  return (
    <Dialog
      isOpen={!!opportunity}
      onOpenChange={(o) => !o && close()}
      title={opportunity ? t('sales:reopen.title', { name: opportunity.displayName }) : ''}
      description={t('sales:reopen.intro')}
      footer={
        <>
          <Button className={WRAP} variant="secondary" onPress={close}>
            {t('common:actions.cancel')}
          </Button>
          <Button className={WRAP} variant="primary" onPress={() => void submit()} isPending={mutation.isPending} data-testid="reopen-submit">
            {t('sales:reopen.submit')}
          </Button>
        </>
      }
    >
      <div className="space-y-4" data-testid="reopen-dialog">
        {!!error && <ProblemAlert error={error} />}
        <PlainTextArea label={t('sales:reopen.note')} value={note} onChange={setNote} errorKey={tried && note.trim().length < 3 ? 'sales:errors.noteRequired' : undefined} testId="reopen-note" />
      </div>
    </Dialog>
  );
}

/** Move an opportunity to another open stage; a stale version is reported and the caller refreshes. */
export function useStageMove(onStale: () => void) {
  const { t } = useT();
  const toast = useToast();
  const announce = useAnnounce();
  const mutation = useApiMutation<Opportunity>();
  const move = async (o: Opportunity, stage: OpenStage): Promise<Opportunity | null> => {
    try {
      const moved = await mutation.mutateAsync({ method: 'POST', path: `/opportunities/${o.id}/stage`, body: { stage, version: o.version } });
      const message = t('sales:pipeline.moved', { name: o.displayName, stage: t(`sales:stage.${stage}`) });
      toast.success(message);
      announce(message);
      return moved;
    } catch (e) {
      const stale = e instanceof ApiError && e.problem.code === 'stale_version';
      const message = stale ? t('sales:pipeline.stale') : e instanceof ApiError ? t(e.problem.messageKey as 'sales:problems.stale_version') : t('errors:network.unavailable');
      toast.error(message);
      announce(message);
      onStale();
      return null;
    }
  };
  return { move, isPending: mutation.isPending };
}

/** "Move to stage": the keyboard and screen-reader way to do what dragging a card does. */
export function MoveMenu({ opportunity, onMove, onLose, testId }: { opportunity: Opportunity; onMove: (stage: OpenStage) => void; onLose: () => void; testId?: string }) {
  const { t } = useT();
  const stages = OPEN_STAGES.filter((s) => s !== opportunity.stage);
  return (
    <MenuButton
      label={t('sales:pipeline.moveMenu', { name: opportunity.displayName })}
      placement="bottom start"
      onAction={(id) => (id === 'lost' ? onLose() : onMove(id as OpenStage))}
      groups={[
        { id: 'stages', title: t('sales:pipeline.moveTo'), items: stages.map((s) => ({ id: s, label: t(`sales:stage.${s}`), icon: STAGE_ICON[s], testId: `move-to-${s}` })) },
        { id: 'end', items: [{ id: 'lost', label: t('sales:pipeline.markLost'), icon: XCircle, tone: 'danger', testId: 'move-to-lost' }] },
      ]}
      trigger={
        <AriaButton aria-label={t('sales:pipeline.moveMenu', { name: opportunity.displayName })} className={triggerClass} data-testid={testId ?? 'opp-move'}>
          <ArrowRightLeft aria-hidden className="size-4 shrink-0" />
          <span>{t('sales:pipeline.move')}</span>
          <ChevronDown aria-hidden className="size-4 shrink-0" />
        </AriaButton>
      }
    />
  );
}
