import { TextGuideView } from '@repo/ui/onboarding';

/** Accessible text-only version of a tour (shared view). */
export default function TextGuidePage({ tourId }: { tourId: string }) {
  return <TextGuideView tourId={tourId} />;
}
