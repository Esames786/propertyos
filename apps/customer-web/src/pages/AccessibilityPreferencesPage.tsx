import { PageHeader, PersonalizationHub, useT } from '@repo/ui';

/**
 * PORTAL-027: the resident's appearance and accessibility (Gate D.1 hub). Text size comes first: it
 * was chosen at first sign-in (C.2) and is kept; `#text-size` opens the page at it.
 */
export default function AccessibilityPreferencesPage() {
  const { t } = useT();
  return (
    <>
      <PageHeader title={t('nav:pages.accessibility')} description={t('a11y:hub.intro')} />
      <PersonalizationHub />
    </>
  );
}
