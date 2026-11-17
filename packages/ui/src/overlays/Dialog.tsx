import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Dialog as AriaDialog, Heading, Modal, ModalOverlay } from 'react-aria-components';
import { useToastClearance, useToastOverlay } from '../feedback/Toast';
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
  const clearance = useToastClearance();
  useToastOverlay(isOpen && !footer);
  // B10 (Issue #24, F-INT-3): a dialog taller than the screen (320 px with 200 % text) scrolls inside this
  // overlay. Moving focus scrolls only until the control's box touches the overlay's edge, which cut off the
  // part of its keyboard ring outside that box (37 % of a confirm dialog's Cancel ring). The scroll padding
  // (the overlay's own padding, wider than any ring) keeps a focused control that far inside the edge.
  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable={isDismissable}
      className="fixed inset-0 z-50 grid scroll-p-4 place-items-center overflow-y-auto bg-overlay p-4 data-entering:animate-overlay-in data-exiting:animate-overlay-out"
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
          {footer && <div ref={clearance} className="mt-6 flex flex-wrap justify-end gap-2">{footer}</div>}
        </AriaDialog>
      </Modal>
    </ModalOverlay>
  );
}
