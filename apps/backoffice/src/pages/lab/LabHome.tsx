import { Badge, buttonClass, InlineAlert, Link, PageHeader, useT, useNavigation } from '@repo/ui';
import { useGuidedTour, useTourModule } from '@repo/ui/onboarding';
import { Compass, FormInput, GraduationCap, LayoutDashboard, Loader, Palette, Shapes } from 'lucide-react';

const CARDS = [
  { id: 'tokens', href: '/backoffice/lab/tokens', icon: Palette, title: 'nav:pages.labTokens', body: 'lab:home.cards.tokens' },
  { id: 'components', href: '/backoffice/lab/components', icon: Shapes, title: 'nav:pages.labComponents', body: 'lab:home.cards.components' },
  { id: 'forms', href: '/backoffice/lab/forms', icon: FormInput, title: 'nav:pages.labForms', body: 'lab:home.cards.forms' },
  { id: 'workspace', href: '/backoffice/lab/workspace', icon: LayoutDashboard, title: 'nav:pages.labWorkspace', body: 'lab:home.cards.workspace' },
  { id: 'states', href: '/backoffice/lab/states', icon: Loader, title: 'nav:pages.labStates', body: 'lab:home.cards.states' },
] as const;

/** Stage 1 start page: what exists, how to try it, and a way into the guided tour and practice mode. */
export default function LabHome() {
  const { t } = useT();
  const tour = useGuidedTour();
  const { navigate } = useNavigation();
  useTourModule('lab');
  return (
    <>
      <PageHeader
        title={t('lab:home.title')}
        description={t('lab:home.intro')}
        badge={<Badge tone="demo">{t('common:app.prototypeBadge')}</Badge>}
        actions={
          <>
            <button type="button" className={buttonClass('primary')} onClick={() => tour.start('GLOBAL-TOUR-001')} data-testid="start-essentials-tour">
              <Compass aria-hidden className="size-4" />
              {t('lab:home.tourCta')}
            </button>
            <button type="button" className={buttonClass('secondary')} onClick={() => navigate('/backoffice/help/practice')}>
              <GraduationCap aria-hidden className="size-4" />
              {t('lab:home.practiceCta')}
            </button>
          </>
        }
      />
      <InlineAlert tone="info" className="mb-6">
        {t('lab:home.stageNote')}
      </InlineAlert>
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {CARDS.map((card) => (
          <li key={card.id}>
            <Link
              variant="plain"
              href={card.href}
              className="group flex h-full flex-col gap-3 rounded-card border border-border bg-panel p-5 shadow-card outline-none data-hovered:border-primary data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus"
            >
              <span className="grid size-10 place-items-center rounded-control bg-primary-soft text-primary">
                <card.icon aria-hidden className="size-5" />
              </span>
              <span className="text-base font-semibold text-text group-data-hovered:text-primary">{t(card.title)}</span>
              <span className="text-sm text-muted">{t(card.body)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
