import { useState, type ReactNode } from 'react';
import { Label, TextArea, TextField } from 'react-aria-components';
import { useT } from '../lib/useT';
import { Button } from '../primitives/Button';
import { Dialog } from './Dialog';

/**
 * Confirmation for significant or destructive actions: says exactly what will happen and can
 * require a reason (blueprint 01 §2, 07 Critical feedback). Not used for ordinary saves.
 * A caller whose action can be refused may resolve `onConfirm` to `false`: the dialog then stays
 * open with the typed reason, and `problem` (the refusal) is shown inside it (OPS-01).
 */
export function ConfirmDialog({
  isOpen,
  onOpenChange,
  title,
  effect,
  confirmLabel,
  destructive = false,
  reasonLabel,
  onConfirm,
  problem,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Plain statement of the exact effect. */
  effect: string;
  confirmLabel: string;
  destructive?: boolean;
  /** When set, a reason is required before confirming. */
  reasonLabel?: string;
  /** Resolve to `false` when the action was refused: the dialog stays open and keeps the reason. */
  onConfirm: (reason?: string) => Promise<void | boolean> | void | boolean;
  /** Shown inside the dialog, above the reason: why the last attempt was refused (announced by the caller). */
  problem?: ReactNode;
}) {
  const { t } = useT();
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [showError, setShowError] = useState(false);
  const needsReason = reasonLabel !== undefined;

  const confirm = async () => {
    if (needsReason && !reason.trim()) {
      setShowError(true);
      return;
    }
    setPending(true);
    try {
      const done = await onConfirm(needsReason ? reason.trim() : undefined);
      if (done === false) return;
      onOpenChange(false);
      setReason('');
      setShowError(false);
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={title}
      role="alertdialog"
      isDismissable={false}
      description={effect}
      footer={
        <>
          {/* At 320 px with 200 % text a long label wraps and the reason box (w-full) shrinks; before, they
              pushed the dialog (and the refusal shown in it, OPS-01) past the screen edge. */}
          <Button variant="secondary" className="max-w-full whitespace-normal" onPress={() => onOpenChange(false)}>
            {t('common:actions.cancel')}
          </Button>
          <Button variant={destructive ? 'danger' : 'primary'} className="max-w-full whitespace-normal" isPending={pending} onPress={confirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {problem || needsReason ? (
        <>
          {problem && <div className="mb-4">{problem}</div>}
          {needsReason && (
            <TextField value={reason} onChange={setReason} isRequired isInvalid={showError && !reason.trim()} className="flex flex-col gap-1.5">
              <Label className="text-sm font-medium text-text">
                {reasonLabel} <span className="text-muted">({t('common:state.required')})</span>
              </Label>
              <TextArea
                rows={3}
                className="w-full rounded-control border border-border-control bg-panel px-3 py-2 text-sm data-invalid:border-error"
              />
              {showError && !reason.trim() && <p className="text-sm text-error">{t('forms:errors.required')}</p>}
            </TextField>
          )}
        </>
      ) : null}
    </Dialog>
  );
}
