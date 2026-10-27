import { MessageCircle, Phone } from 'lucide-react';
import { Button as AriaButton } from 'react-aria-components';
import { useT } from '../lib/useT';
import { cn } from '../lib/cn';

const base =
  'relative grid size-11 shrink-0 place-items-center rounded-tile outline-none transition-[translate,background-color] duration-[var(--motion-fast)] data-hovered:-translate-y-0.5 data-pressed:translate-y-0 data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus';

/**
 * Call and WhatsApp shortcuts on a record card. In the prototype these never dial or open a chat:
 * the caller decides what happens (the CRM shows a simulated-call sheet that can log the call).
 * Names include the person so a list of cards is not a list of identical "Call" buttons.
 */
export function ContactButtons({ name, onCall, onWhatsApp, testId }: { name: string; onCall: () => void; onWhatsApp: () => void; testId?: string }) {
  const { t } = useT();
  return (
    <div className="flex items-center gap-2" data-testid={testId}>
      <AriaButton aria-label={t('common:contact.call', { name })} onPress={onCall} className={cn(base, 'bg-tile-sky-soft text-tile-sky-ink data-hovered:bg-tile-sky data-hovered:text-on-tile')}>
        <Phone aria-hidden className="size-5" />
      </AriaButton>
      <AriaButton aria-label={t('common:contact.whatsapp', { name })} onPress={onWhatsApp} className={cn(base, 'bg-tile-emerald-soft text-tile-emerald-ink data-hovered:bg-tile-emerald data-hovered:text-on-tile')}>
        <MessageCircle aria-hidden className="size-5" />
      </AriaButton>
    </div>
  );
}
