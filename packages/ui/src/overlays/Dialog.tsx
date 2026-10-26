import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Dialog as AriaDialog, Heading, Modal, ModalOverlay } from 'react-aria-components';
import { cn } from '../lib/cn';
import { useT } from '../lib/useT';
import { IconButton } from '../primitives/IconButton';

export interface DialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  role?: 'dialog' | 'alertdialog';
  size?: 'sm' | 'md' | 'lg';
  /** Destructive confirmations should not close on an outside click. */
  isDismissable?: boolean;
  className?: string;
}

const SIZE = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl' } as const;

/** Modal dialog: focus moves in, is contained, the page is inert, Escape closes, focus returns. */
export function Dialog({
  isOpen,
  onOpenChange,
  title,
  description,
  children,
  footer,
  role = 'dialog',
  size = 'md',
  isDismissable = true,
  className,
}: DialogProps) {
  const { t } = useT();
  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable={isDismissable}
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-overlay p-4 data-entering:animate-overlay-in data-exiting:animate-overlay-out"
    >
      <Modal className={cn('w-full data-entering:animate-sheet-in', SIZE[size])}>
        <AriaDialog role={role} className={cn('relative rounded-card bg-panel p-5 shadow-overlay outline-none sm:p-6', className)}>
          <div className="flex items-start gap-3">
            <Heading slot="title" className="flex-1 text-lg font-semibold text-text">
              {title}
            </Heading>
            <IconButton label={t('common:actions.close')} icon={X} slot="close" className="-m-2" onPress={() => onOpenChange(false)} />
          </div>
          {description && <div className="mt-2 text-sm text-muted">{description}</div>}
          {children && <div className="mt-4">{children}</div>}
          {footer && <div className="mt-6 flex flex-wrap justify-end gap-2">{footer}</div>}
        </AriaDialog>
      </Modal>
    </ModalOverlay>
  );
}
