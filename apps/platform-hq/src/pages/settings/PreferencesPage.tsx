import { AccessibilityPreferences, LanguagePreferences, PageHeader, Panel, TourPreferences, UrlTabs, useT } from '@repo/ui';

/**
 * HQ-024 (partial): the shared preferences for platform users (language, accessibility, tours). The
 * full personalization hub (text size, theme, palettes, density, reading mode) is Gate D.
 */
export default function PreferencesPage() {
  const { t } = useT();
  return (
    <>
      <PageHeader title={t('nav:pages.preferences')} description={t('help:pages.preferences.body')} />
      <UrlTabs
        label={t('nav:pages.preferences')}
        defaultId="language"
        items={[
          { id: 'language', label: t('a11y:language.title') },
          { id: 'accessibility', label: t('a11y:preferences.title') },
          { id: 'tours', label: t('onboarding:preferences.title') },
        ]}
      >
        {(tab) => (
          <Panel className="max-w-2xl">
            {tab === 'language' && <LanguagePreferences />}
            {tab === 'accessibility' && <AccessibilityPreferences />}
            {tab === 'tours' && <TourPreferences />}
          </Panel>
        )}
      </UrlTabs>
    </>
  );
}
