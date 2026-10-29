import { PageHeader, PersonalizationHub, PrototypeToolsPreference, useT, type HubSection } from '@repo/ui';

/**
 * Appearance and accessibility (GLOBAL-010, with GLOBAL-009 language and GUIDE-006 tours as its
 * sections; Gate D.1 personalization hub). Each register address opens the page at its section.
 */
export default function PreferencesPage({ defaultTab }: { defaultTab: 'language' | 'accessibility' | 'tours' }) {
  const { t } = useT();
  const section: HubSection | undefined = defaultTab === 'accessibility' ? undefined : defaultTab;
  return (
    <>
      <PageHeader title={t('nav:pages.preferences')} description={t('a11y:hub.intro')} />
      <PersonalizationHub initialSection={section} tourExtras={<PrototypeToolsPreference />} />
    </>
  );
}
