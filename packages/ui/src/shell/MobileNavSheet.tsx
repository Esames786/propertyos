import { X } from 'lucide-react';
import { Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components';
import { useT } from '../lib/useT';
import { IconButton } from '../primitives/IconButton';
import { BrandBlock } from './BrandBlock';
import { LocaleToggle } from './LocaleSwitcher';
import { NavList } from './NavList';
import { NotificationsPanel } from './NotificationsPanel';
import { useShell } from './ShellContext';

/** Phone navigation: the rail becomes a full-height sheet from the reading-start edge. */
export function MobileNavSheet({ tenantName }: { tenantName: string }) {
  const { t } = useT();
  const { navItems, mobileNavOpen, setMobileNavOpen } = useShell();
  return (
    <ModalOverlay isOpen={mobileNavOpen} onOpenChange={setMobileNavOpen} isDismissable className="fixed inset-0 z-50 bg-overlay backdrop-blur-[2px] data-entering:animate-overlay-in md:hidden">
      <Modal className="fixed inset-y-0 start-0 w-[min(20rem,88vw)] overflow-hidden rounded-e-card bg-panel shadow-overlay data-entering:animate-sheet-in">
        <Dialog className="flex h-dvh flex-col outline-none" data-testid="mobile-nav">
          <div className="flex items-center gap-3 px-4 pt-4 pb-3">
            <BrandBlock tenantName={tenantName} className="flex-1" />
            <IconButton label={t('common:actions.close')} icon={X} onPress={() => setMobileNavOpen(false)} />
          </div>
          <Heading slot="title" className="sr-only">
            {t('nav:mobileMenuTitle')}
          </Heading>
          <nav aria-label={t('nav:primaryLabel')} className="min-h-0 flex-1 overflow-y-auto px-3 pt-2 pb-4">
            <NavList items={navItems} anchorPrefix="mnav" onNavigate={() => setMobileNavOpen(false)} />
          </nav>
          <div className="flex items-center gap-2 border-t border-border p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            <LocaleToggle className="flex-1 justify-center" />
            <span className="sm:hidden">
              <NotificationsPanel />
            </span>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
