import { LogOut, RotateCcw, Settings, UserRoundCog } from 'lucide-react';
import { Dialog, DialogTrigger, Heading, Popover } from 'react-aria-components';
import { MOCK_MODES_UI } from './mockModes';
import { useTransport, type MockMode } from '../data/TransportProvider';
import { DemoBadge } from '../data/StatusLabel';
import { SelectControl } from '../forms/ChoiceFields';
import { useToast } from '../feedback/Toast';
import { useT } from '../lib/useT';
import { useNavigation } from '../navigation/RouterAdapter';
import { useGuidedTour } from '../onboarding/GuidedTourProvider';
import { useSession } from '../permissions/SessionProvider';
import { Button } from '../primitives/Button';
import { Button as AriaButton } from 'react-aria-components';
import { LocaleToggle } from './LocaleSwitcher';
import { useShell } from './ShellContext';

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}

/** Account popover: who you are (demo), preferences, identity switch, onboarding reset, simulated network. */
export function UserMenu() {
  const { t } = useT();
  const { persona, signOut } = useSession();
  const { mockMode, setMockMode } = useTransport();
  const { navigate } = useNavigation();
  const { links } = useShell();
  const tour = useGuidedTour();
  const toast = useToast();
  if (!persona) return null;
  return (
    <DialogTrigger>
      <AriaButton
        aria-label={t('nav:header.accountMenu', { name: persona.displayName })}
        data-testid="user-menu-button"
        className="grid size-10 place-items-center rounded-pill bg-primary text-sm font-semibold text-on-primary shadow-[inset_0_0_0_1.5px_rgb(181_138_71/0.6)] outline-none transition-transform duration-[var(--motion-fast)] data-hovered:scale-[1.04] data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus pointer-coarse:size-11"
      >
        <span aria-hidden>{initials(persona.displayName)}</span>
      </AriaButton>
      <Popover placement="bottom end" offset={6} className="w-[min(20rem,calc(100vw-1rem))] rounded-card border border-border bg-panel p-5 shadow-overlay data-entering:animate-overlay-in">
        <Dialog className="space-y-4 outline-none" data-testid="user-menu">
          {({ close }) => (
            <>
              <div>
                <Heading slot="title" className="text-sm font-semibold text-text">
                  {t('common:userMenu.title')}
                </Heading>
                <p className="mt-2 text-xs text-muted">{t('common:demo.signedInAs')}</p>
                <p className="text-sm font-medium text-text">
                  <bdi>{persona.displayName}</bdi>
                </p>
                <p className="text-sm text-muted">{t(persona.roleKey as 'common:persona.manager')}</p>
                <div className="mt-2">
                  <DemoBadge />
                </div>
              </div>
              <LocaleToggle className="w-full justify-center md:hidden" />
              <div className="grid gap-2">
                <Button
                  variant="secondary"
                  icon={Settings}
                  onPress={() => {
                    close();
                    navigate(links.preferences);
                  }}
                >
                  {t('common:userMenu.preferences')}
                </Button>
                <Button
                  variant="secondary"
                  icon={UserRoundCog}
                  onPress={() => {
                    close();
                    signOut();
                  }}
                  data-testid="switch-identity"
                >
                  {t('common:demo.switchIdentity')}
                </Button>
                <Button
                  variant="secondary"
                  icon={RotateCcw}
                  onPress={() => {
                    tour.resetProgress();
                    toast.info(t('common:demo.resetOnboardingDone'));
                    close();
                  }}
                  data-testid="reset-onboarding"
                >
                  {t('common:demo.resetOnboarding')}
                </Button>
              </div>
              <SelectControl
                label={t('common:demo.mockNetwork')}
                value={mockMode}
                options={MOCK_MODES_UI.map((m) => ({ id: m, label: t(`common:demo.mockModes.${m}`) }))}
                onChange={(m) => m && setMockMode(m as MockMode)}
                optional
                testId="mock-network"
              />
              <Button
                variant="quiet"
                icon={LogOut}
                onPress={() => {
                  close();
                  signOut();
                }}
              >
                {t('common:demo.signOut')}
              </Button>
            </>
          )}
        </Dialog>
      </Popover>
    </DialogTrigger>
  );
}
