import { TourLibraryView } from '@repo/ui/onboarding';

/** GUIDE-003 tour library (shared view), with the backoffice practice sandbox. */
export default function TourLibrary({ autoStartTourId }: { autoStartTourId?: string }) {
  return <TourLibraryView {...(autoStartTourId ? { autoStartTourId } : {})} practiceHref="/backoffice/help/practice" />;
}
