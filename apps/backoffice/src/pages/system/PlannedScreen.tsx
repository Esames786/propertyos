import type { ScreenEntry } from '@repo/contracts/screens';
import { PlannedScreenView, useT } from '@repo/ui';

export function PlannedScreen({ screen, record }: { screen: ScreenEntry; record: string | null }) {
  const { t } = useT();
  return (
    <PlannedScreenView
      screen={screen}
      record={record}
      startHref="/backoffice/lab"
      secondary={{ label: t('nav:pages.tourLibrary'), href: '/backoffice/help/tours' }}
    />
  );
}
