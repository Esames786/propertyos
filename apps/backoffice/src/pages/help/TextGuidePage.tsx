import { NotFoundState, PageHeader, useT } from '@repo/ui';
import { TextOnlyTour, useGuidedTour } from '@repo/ui/onboarding';

/** Accessible text-only version of a tour (doc 09 §7): same steps, no spotlight required. */
export default function TextGuidePage({ tourId }: { tourId: string }) {
  const { t } = useT();
  const { available } = useGuidedTour();
  const def = available.find((d) => d.id === tourId);
  if (!def) return <NotFoundState headingLevel={1} />;
  const name = t(def.nameKey as 'onboarding:library.title');
  return (
    <>
      <PageHeader
        title={t('nav:pages.textGuide', { tour: name })}
        description={t(def.summaryKey as 'onboarding:library.title')}
        breadcrumbs={[{ label: t('nav:pages.tourLibrary'), href: '/backoffice/help/tours' }, { label: name }]}
      />
      <TextOnlyTour tourId={tourId} />
    </>
  );
}
