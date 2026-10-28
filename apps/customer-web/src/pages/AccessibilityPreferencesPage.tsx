import { AccessibilityPreferences, LanguagePreferences, PageHeader, Panel, TextSizeSettings, useT } from '@repo/ui';

/**
 * PORTAL-027: display and accessibility. Text size first (chosen at first sign-in, changed here, kept
 * per person and organisation), then language and the device's motion and contrast settings.
 */
export default function AccessibilityPreferencesPage() {
  const { t } = useT();
  return (
    <>
      <PageHeader title={t('nav:pages.accessibility')} description={t('a11y:preferences.intro')} />
      <div className="grid max-w-3xl gap-5">
        <section id="text-size" tabIndex={-1} aria-labelledby="text-size-title" className="scroll-mt-24 outline-none">
          <Panel title={t('a11y:textSize.settingsTitle')} description={t('a11y:textSize.settingsHint')}>
            <span id="text-size-title" className="sr-only">{t('a11y:textSize.settingsTitle')}</span>
            <TextSizeSettings />
          </Panel>
        </section>
        <Panel title={t('a11y:language.title')}>
          <LanguagePreferences />
        </Panel>
        <Panel title={t('a11y:preferences.title')}>
          <AccessibilityPreferences />
        </Panel>
      </div>
    </>
  );
}
