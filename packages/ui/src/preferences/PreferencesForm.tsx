import { LOCALE_META, SUPPORTED_LOCALES, useLocale, type AppLocale } from '@repo/i18n';
import { Volume2 } from 'lucide-react';
import { useState } from 'react';
import { Label, RadioGroup } from 'react-aria-components';
import { useToast } from '../feedback/Toast';
import { RadioOption, Switch } from '../forms/ChoiceFields';
import { labelClass } from '../forms/fieldStyles';
import { useT } from '../lib/useT';
import { useGuidedTour } from '../onboarding/GuidedTourProvider';
import { ConfirmDialog } from '../overlays/ConfirmDialog';
import { Button } from '../primitives/Button';
import { usePreferences, type Preferences } from './PreferencesProvider';
import { playTone } from './sound';

/** Language selector as a radio group (GLOBAL-009). Native names so speakers can find theirs. */
export function LanguagePreferences() {
  const { t } = useT();
  const { locale, setLocale } = useLocale();
  return (
    <div className="space-y-3" data-testid="language-preferences">
      <p className="text-sm text-muted">{t('a11y:language.intro')}</p>
      <RadioGroup value={locale} onChange={(v) => setLocale(v as AppLocale)} className="flex flex-col gap-3">
        <Label className={labelClass}>{t('a11y:language.title')}</Label>
        {SUPPORTED_LOCALES.map((l) => (
          <RadioOption key={l} option={{ id: l, label: LOCALE_META[l].nativeName }} />
        ))}
      </RadioGroup>
    </div>
  );
}

/** Motion, contrast and sound (GLOBAL-010, PORTAL-027). Applied immediately; stored on this device. */
export function AccessibilityPreferences() {
  const { t } = useT();
  const { preferences, update } = usePreferences();
  return (
    <div className="space-y-6" data-testid="accessibility-preferences">
      <p className="text-sm text-muted">{t('a11y:preferences.intro')}</p>
      <RadioGroup value={preferences.motion} onChange={(v) => update({ motion: v as Preferences['motion'] })} className="flex flex-col gap-3">
        <Label className={labelClass}>{t('a11y:preferences.motion')}</Label>
        <RadioOption option={{ id: 'system', label: t('a11y:preferences.motionSystem') }} />
        <RadioOption option={{ id: 'reduce', label: t('a11y:preferences.motionReduce') }} />
        <RadioOption option={{ id: 'full', label: t('a11y:preferences.motionFull') }} />
        <p className="text-xs text-muted">{t('a11y:preferences.motionHint')}</p>
      </RadioGroup>
      <RadioGroup value={preferences.contrast} onChange={(v) => update({ contrast: v as Preferences['contrast'] })} className="flex flex-col gap-3">
        <Label className={labelClass}>{t('a11y:preferences.contrast')}</Label>
        <RadioOption option={{ id: 'system', label: t('a11y:preferences.contrastSystem') }} />
        <RadioOption option={{ id: 'standard', label: t('a11y:preferences.contrastStandard') }} />
        <RadioOption option={{ id: 'more', label: t('a11y:preferences.contrastMore') }} />
      </RadioGroup>
      <div className="space-y-2">
        <Switch
          isSelected={preferences.sound}
          onChange={(sound) => update({ sound })}
          label={t('a11y:preferences.sound')}
          description={t('a11y:preferences.soundHint')}
          testId="sound-switch"
        />
        <Button size="sm" variant="secondary" icon={Volume2} isDisabled={!preferences.sound} onPress={() => playTone('success')} className="ms-14">
          {t('a11y:preferences.soundTest')}
        </Button>
      </div>
    </div>
  );
}

/** Guided-tour preferences (GUIDE-006): auto-offer, text-only guide, reset progress. */
export function TourPreferences() {
  const { t } = useT();
  const { preferences, update } = usePreferences();
  const tour = useGuidedTour();
  const toast = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  return (
    <div className="space-y-6" data-testid="tour-preferences">
      <Switch
        isSelected={tour.profile?.autoOffer ?? true}
        onChange={tour.setAutoOffer}
        label={t('onboarding:preferences.autoOffer')}
        description={t('onboarding:preferences.autoOfferHint')}
        testId="tour-auto-offer"
      />
      <Switch
        isSelected={preferences.textOnlyGuide}
        onChange={(textOnlyGuide) => update({ textOnlyGuide })}
        label={t('onboarding:preferences.textOnly')}
        description={t('onboarding:preferences.textOnlyHint')}
        testId="tour-text-only"
      />
      <Button variant="secondary" className="max-w-full whitespace-normal text-start" onPress={() => setConfirmOpen(true)}>
        {t('onboarding:preferences.reset')}
      </Button>
      <ConfirmDialog
        isOpen={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('onboarding:preferences.resetConfirmTitle')}
        effect={t('onboarding:preferences.resetConfirmBody')}
        confirmLabel={t('onboarding:preferences.reset')}
        onConfirm={() => {
          tour.resetProgress();
          toast.success(t('onboarding:preferences.resetDone'));
        }}
      />
    </div>
  );
}
