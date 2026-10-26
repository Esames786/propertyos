import { AccessibilityPreferences, LanguagePreferences, PageHeader, Panel, TourPreferences, UrlTabs, useT } from '@repo/ui';

/**
 * Preferences (GLOBAL-008/009/010, GUIDE-006). One page with tabs; each register URL opens its tab
 * (Stage 0 conflict C13). The profile section of GLOBAL-008 arrives in Stage 2.
 */
export default function PreferencesPage({ defaultTab }: { defaultTab: 'language' | 'accessibility' | 'tours' }) {
  const { t } = useT();
  return (
    <>
      <PageHeader title={t('nav:pages.preferences')} description={t('help:pages.preferences.body')} />
      <UrlTabs
        label={t('nav:pages.preferences')}
        defaultId={defaultTab}
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
