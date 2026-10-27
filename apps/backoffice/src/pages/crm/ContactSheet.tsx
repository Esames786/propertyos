import { Button, Dialog, useAnnounce, useApiMutation, useT, useToast } from '@repo/ui';
import { MessageCircle, Phone } from 'lucide-react';
import { useState } from 'react';
import { Label, Radio, RadioGroup, TextArea, TextField } from 'react-aria-components';
import { useCrmFormat } from './format';

export interface ContactTarget {
  leadId: string;
  name: string;
  phone: string;
  projectName: string;
}

type Kind = 'call' | 'whatsapp';
type Outcome = 'answered' | 'no_answer' | 'callback';

/**
 * Simulated call / WhatsApp (the prototype never dials or sends). The sheet shows who and which
 * number, says plainly that nothing happens outside the demo, and logs the outcome to the lead's
 * timeline, which is the real workflow being practised.
 */
export function useContactSheet() {
  const [state, setState] = useState<{ kind: Kind; target: ContactTarget } | null>(null);
  return {
    open: (kind: Kind, target: ContactTarget) => setState({ kind, target }),
    sheet: state ? <ContactSheet key={`${state.kind}-${state.target.leadId}`} kind={state.kind} target={state.target} onClose={() => setState(null)} /> : null,
  };
}

function ContactSheet({ kind, target, onClose }: { kind: Kind; target: ContactTarget; onClose: () => void }) {
  const { t } = useT();
  const f = useCrmFormat();
  const toast = useToast();
  const announce = useAnnounce();
  const log = useApiMutation();
  const [outcome, setOutcome] = useState<Outcome>('answered');
  const [message, setMessage] = useState(() => t('crm:contact.template', { name: target.name, project: target.projectName }));
  const Icon = kind === 'call' ? Phone : MessageCircle;

  const submit = async () => {
    await log.mutateAsync({
      method: 'POST',
      path: `/leads/${target.leadId}/activity`,
      body: kind === 'call' ? { kind: 'call', outcome } : { kind: 'whatsapp', note: message },
    });
    const done = kind === 'call' ? t('crm:contact.callLogged', { name: target.name }) : t('crm:contact.messageLogged', { name: target.name });
    toast.success(done);
    announce(done);
    onClose();
  };

  return (
    <Dialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={kind === 'call' ? t('crm:contact.callTitle', { name: target.name }) : t('crm:contact.whatsappTitle', { name: target.name })}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onPress={onClose}>
            {t('common:actions.cancel')}
          </Button>
          <Button variant="primary" icon={Icon} onPress={submit} isPending={log.isPending} data-testid="contact-log">
            {kind === 'call' ? t('crm:contact.logCall') : t('crm:contact.logMessage')}
          </Button>
        </>
      }
    >
      <div className="space-y-4" data-testid="contact-sheet">
        <div className="flex items-center gap-3 rounded-tile bg-sunken p-3">
          <span aria-hidden className={kind === 'call' ? 'grid size-11 place-items-center rounded-tile bg-tile-sky text-on-tile' : 'grid size-11 place-items-center rounded-tile bg-tile-emerald text-on-tile'}>
            <Icon className="size-5" />
          </span>
          <bdi dir="ltr" className="ltr-ref text-lg font-semibold text-text">
            {f.phone(target.phone)}
          </bdi>
        </div>
        <p className="text-sm text-muted">{kind === 'call' ? t('crm:contact.demoCall') : t('crm:contact.demoWhatsapp')}</p>
        {kind === 'call' ? (
          <RadioGroup value={outcome} onChange={(v) => setOutcome(v as Outcome)} className="space-y-2">
            <Label className="text-sm font-medium text-text">{t('crm:contact.outcome')}</Label>
            {(['answered', 'no_answer', 'callback'] as const).map((o) => (
              <Radio
                key={o}
                value={o}
                className="group flex min-h-11 cursor-default items-center gap-3 rounded-control border border-border px-3 text-sm text-text outline-none data-selected:border-primary data-selected:bg-primary-soft data-focus-visible:outline-2 data-focus-visible:outline-focus"
              >
                <span aria-hidden className="grid size-5 place-items-center rounded-pill border-2 border-border-control group-data-selected:border-primary">
                  <span className="size-2.5 rounded-pill bg-primary opacity-0 group-data-selected:opacity-100" />
                </span>
                {t(`crm:contact.${o === 'no_answer' ? 'noAnswer' : o}`)}
              </Radio>
            ))}
          </RadioGroup>
        ) : (
          <TextField value={message} onChange={setMessage} className="flex flex-col gap-1.5">
            <Label className="text-sm font-medium text-text">{t('crm:contact.message')}</Label>
            <TextArea rows={4} className="rounded-control border border-border-control bg-panel px-3 py-2 text-sm text-text outline-none focus-visible:outline-2 focus-visible:outline-focus" />
          </TextField>
        )}
      </div>
    </Dialog>
  );
}
