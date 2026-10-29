import { PageHeader, PersonalizationHub, useT } from '@repo/ui';

/**
 * HQ-024: appearance and accessibility for platform people (Gate D.1). The same hub as the office
 * and resident apps; Platform HQ has no organisation colours, so Evergreen is the default.
 */
export default function PreferencesPage() {
  const { t } = useT();
  return (
    <>
      <PageHeader title={t('nav:pages.preferences')} description={t('a11y:hub.intro')} />
      <PersonalizationHub organisationLabel={t('a11y:hub.platformName')} organisationColours={false} />
    </>
  );
}
