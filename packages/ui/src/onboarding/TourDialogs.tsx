import { Check, Compass, GraduationCap, LifeBuoy, PartyPopper, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Checkbox } from 'react-aria-components';
import { useT } from '../lib/useT';
import { useNavigation } from '../navigation/RouterAdapter';
import { Dialog } from '../overlays/Dialog';
import { useSession } from '../permissions/SessionProvider';
import { Button } from '../primitives/Button';
import { useGuidedTour } from './GuidedTourProvider';

/**
 * First-login welcome (doc 09 §2A): optional and never coercive. Two equally prominent choices;
 * closing it is the same as "Explore on my own". Shown once per tenant + persona + app.
 */
export function FirstLoginWelcome({ isOpen }: { isOpen: boolean }) {
  const { t } = useT();
  const { persona } = useSession();
  const { decideWelcome } = useGuidedTour();
  const [dontOffer, setDontOffer] = useState(false);
  if (!persona) return null;
  // Residents who joined by invitation share one welcome line (their persona ids are generated).
  const benefit = t(`common:welcomeBenefit.${persona.unlisted ? 'invited_resident' : (persona.id as 'manager')}`);
  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={(open) => !open && decideWelcome('declined', !dontOffer)}
      title={t('onboarding:welcome.title', { name: persona.displayName })}
      size="md"
      description={
        <div className="space-y-2">
          <p className="flex items-start gap-2 text-text">
            <Sparkles aria-hidden className="mt-0.5 size-5 shrink-0 text-primary" />
            <span>{benefit}</span>
          </p>
          <p>{t('onboarding:welcome.intro')}</p>
        </div>
      }
      footer={
        <div className="flex w-full flex-col gap-4" data-testid="welcome-dialog">
          <div className="grid gap-2 sm:grid-cols-2">
            <Button variant="primary" size="lg" icon={Compass} onPress={() => decideWelcome('accepted', !dontOffer)} data-testid="welcome-start">
              {t('onboarding:welcome.start')}
            </Button>
            <Button variant="secondary" size="lg" onPress={() => decideWelcome('declined', !dontOffer)} data-testid="welcome-explore">
              {t('onboarding:welcome.explore')}
            </Button>
          </div>
          <Checkbox isSelected={dontOffer} onChange={setDontOffer} className="group flex cursor-default items-center gap-3 text-sm text-text">
            <span className="grid size-5 place-items-center rounded-sm border-2 border-border-control group-data-selected:border-primary group-data-selected:bg-primary group-data-focus-visible:outline-2 group-data-focus-visible:outline-offset-2 group-data-focus-visible:outline-focus">
              <Check aria-hidden className="size-3.5 text-on-primary opacity-0 group-data-selected:opacity-100" strokeWidth={3} />
            </span>
            {t('onboarding:welcome.dontOffer')}
          </Checkbox>
          <p className="text-xs text-muted">{t('onboarding:welcome.laterHint')}</p>
        </div>
      }
    />
  );
}

/** Completion summary with a path into real work (doc 09 §2A.7). */
export function TourCompletion() {
  const { t } = useT();
  const { state, dismissCompletion, links, available } = useGuidedTour();
  const { navigate, location } = useNavigation();
  const isOpen = state.status === 'completed';
  const completed = state.status === 'completed' ? available.find((d) => d.id === state.tourId) : undefined;
  const go = (href: string) => {
    dismissCompletion();
    navigate(href);
  };
  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={(open) => !open && dismissCompletion()}
      title={t('onboarding:completion.title')}
      description={
        <p className="flex items-start gap-2">
          <PartyPopper aria-hidden className="mt-0.5 size-5 shrink-0 text-success" />
          <span>{t('onboarding:completion.body')}</span>
        </p>
      }
      footer={
        <div className="flex w-full flex-wrap justify-end gap-2" data-testid="tour-completion">
          {!completed?.practice && (
            <Button variant="secondary" icon={GraduationCap} onPress={() => go(links.practice)}>
              {t('onboarding:completion.practice')}
            </Button>
          )}
          <Button variant="secondary" icon={LifeBuoy} onPress={() => go(`${location.pathname}?help=open`)}>
            {t('onboarding:completion.openHelp')}
          </Button>
          <Button variant="primary" onPress={() => go(links.start)}>
            {t('onboarding:completion.goToStart')}
          </Button>
        </div>
      }
    />
  );
}
