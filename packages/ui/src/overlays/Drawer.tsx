import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Dialog as AriaDialog, Heading, Modal, ModalOverlay } from 'react-aria-components';
import { cn } from '../lib/cn';
import { useT } from '../lib/useT';
import { IconButton } from '../primitives/IconButton';

export interface DrawerProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Short context line under the title (e.g. record reference). */
  subtitle?: ReactNode;
  children: ReactNode;
  /** Sticky footer, usually the primary action; stays thumb-reachable on phones. */
  footer?: ReactNode;
  banner?: ReactNode;
  size?: 'md' | 'lg';
  testId?: string;
}

/**
 * Side drawer on tablet/desktop (inline-end edge, mirrors in RTL); full-height sheet on phones.
 * Modal semantics: focus trapped inside, Escape closes, focus returns to the opener.
 */
export function Drawer({ isOpen, onOpenChange, title, subtitle, children, footer, banner, size = 'md', testId }: DrawerProps) {
  const { t } = useT();
  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable
      className="fixed inset-0 z-50 bg-overlay data-entering:animate-overlay-in data-exiting:animate-overlay-out"
    >
      <Modal
        className={cn(
          'fixed inset-y-0 end-0 flex w-full flex-col bg-panel shadow-overlay data-entering:animate-sheet-in',
          size === 'lg' ? 'md:w-[min(44rem,92vw)]' : 'md:w-[min(30rem,92vw)]',
        )}
      >
        <AriaDialog data-testid={testId} className="flex h-dvh min-h-0 flex-col outline-none">
          <header className="flex items-start gap-3 border-b border-border px-5 py-4">
            <div className="min-w-0 flex-1">
              <Heading slot="title" className="text-lg font-semibold text-text">
                {title}
              </Heading>
              {subtitle && <div className="mt-0.5 text-sm text-muted">{subtitle}</div>}
            </div>
            <IconButton label={t('common:actions.close')} icon={X} onPress={() => onOpenChange(false)} className="-m-2" />
          </header>
          {banner}
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
          {footer && (
            <footer className="flex flex-wrap justify-end gap-2 border-t border-border bg-panel px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              {footer}
            </footer>
          )}
        </AriaDialog>
      </Modal>
    </ModalOverlay>
  );
}
