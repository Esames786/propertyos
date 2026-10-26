import { Compass, ListChecks } from 'lucide-react';
import { useT } from '../lib/useT';
import { useNavigation, useQueryParam } from '../navigation/RouterAdapter';
import { useGuidedTour } from '../onboarding/GuidedTourProvider';
import { Drawer } from '../overlays/Drawer';
import { Button } from '../primitives/Button';
import { ShortcutList } from './HelpMenu';
import { useShell } from './ShellContext';

/** Context help for the current page (GLOBAL-007), deep-linkable as ?help=open. */
export function HelpDrawer() {
  const { t } = useT();
  const { helpKey } = useShell();
  const [help, setHelp] = useQueryParam('help');
  const tour = useGuidedTour();
  const { navigate } = useNavigation();
  const essentials = tour.available.find((d) => d.id === 'GLOBAL-TOUR-001');
  const close = () => setHelp(null);

  return (
    <Drawer isOpen={help === 'open'} onOpenChange={(open) => !open && close()} title={t('help:drawerTitle')} testId="help-drawer">
      <div className="space-y-8">
        <section aria-labelledby="help-page-title">
          <h3 id="help-page-title" className="text-base font-semibold text-text">
            {t(`help:pages.${helpKey}.title`)}
          </h3>
          <p className="mt-2 text-sm text-text">{t(`help:pages.${helpKey}.body`)}</p>
        </section>
        {essentials && (
          <section className="space-y-2">
            <Button
              variant="primary"
              icon={Compass}
              onPress={() => {
                close();
                tour.start(essentials.id);
              }}
            >
              {t('help:menu.takeTour')}
            </Button>
            <Button
              variant="secondary"
              icon={ListChecks}
              onPress={() => {
                close();
                navigate(tour.links.textGuide(essentials.id));
              }}
            >
              {t('help:menu.showMeHow')}
            </Button>
          </section>
        )}
        <section>
          <h3 className="mb-3 text-base font-semibold text-text">{t('help:shortcuts.title')}</h3>
          <ShortcutList />
        </section>
      </div>
    </Drawer>
  );
}
