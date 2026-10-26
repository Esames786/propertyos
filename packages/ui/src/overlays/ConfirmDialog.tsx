import { useState } from 'react';
import { Label, TextArea, TextField } from 'react-aria-components';
import { useT } from '../lib/useT';
import { Button } from '../primitives/Button';
import { Dialog } from './Dialog';

/**
 * Confirmation for significant or destructive actions: says exactly what will happen and can
 * require a reason (blueprint 01 §2, 07 Critical feedback). Not used for ordinary saves.
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
  onConfirm: (reason?: string) => Promise<void> | void;
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
      await onConfirm(needsReason ? reason.trim() : undefined);
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
          <Button variant="secondary" onPress={() => onOpenChange(false)}>
            {t('common:actions.cancel')}
          </Button>
          <Button variant={destructive ? 'danger' : 'primary'} isPending={pending} onPress={confirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {needsReason && (
        <TextField value={reason} onChange={setReason} isRequired isInvalid={showError && !reason.trim()} className="flex flex-col gap-1.5">
          <Label className="text-sm font-medium text-text">
            {reasonLabel} <span className="text-muted">({t('common:state.required')})</span>
          </Label>
          <TextArea
            rows={3}
            className="rounded-control border border-border-control bg-panel px-3 py-2 text-sm data-invalid:border-error"
          />
          {showError && !reason.trim() && <p className="text-sm text-error">{t('forms:errors.required')}</p>}
        </TextField>
      )}
    </Dialog>
  );
}
