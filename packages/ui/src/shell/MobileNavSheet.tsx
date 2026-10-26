import { X } from 'lucide-react';
import { Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components';
import { useT } from '../lib/useT';
import { IconButton } from '../primitives/IconButton';
import { LocaleToggle } from './LocaleSwitcher';
import { NavList } from './NavList';
import { NotificationsPanel } from './NotificationsPanel';
import { useShell } from './ShellContext';

/** Phone navigation: the sidebar becomes a full-height sheet from the reading-start edge. */
export function MobileNavSheet({ tenantName }: { tenantName: string }) {
  const { t } = useT();
  const { navItems, mobileNavOpen, setMobileNavOpen } = useShell();
  return (
    <ModalOverlay isOpen={mobileNavOpen} onOpenChange={setMobileNavOpen} isDismissable className="fixed inset-0 z-50 bg-overlay data-entering:animate-overlay-in md:hidden">
      <Modal className="fixed inset-y-0 start-0 w-[min(20rem,88vw)] bg-panel shadow-overlay data-entering:animate-sheet-in">
        <Dialog className="flex h-dvh flex-col outline-none" data-testid="mobile-nav">
          <div className="flex items-center gap-3 border-b border-border px-4 py-3">
            <Heading slot="title" className="flex-1 text-base font-semibold text-text">
              {t('nav:mobileMenuTitle')}
              <span className="block text-xs font-normal text-muted">
                <bdi>{tenantName}</bdi>
              </span>
            </Heading>
            <IconButton label={t('common:actions.close')} icon={X} onPress={() => setMobileNavOpen(false)} />
          </div>
          <nav aria-label={t('nav:primaryLabel')} className="min-h-0 flex-1 overflow-y-auto p-3">
            <NavList items={navItems} anchorPrefix="mnav" onNavigate={() => setMobileNavOpen(false)} />
          </nav>
          <div className="flex items-center gap-2 border-t border-border p-3">
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
