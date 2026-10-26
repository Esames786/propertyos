import { AccessibilityPreferences, LanguagePreferences, PageHeader, Panel, useT } from '@repo/ui';

/** PORTAL-027: the shared preference components inside the customer shell. */
export default function AccessibilityPreferencesPage() {
  const { t } = useT();
  return (
    <>
      <PageHeader title={t('nav:pages.accessibility')} description={t('a11y:preferences.intro')} />
      <div className="grid max-w-3xl gap-5">
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
