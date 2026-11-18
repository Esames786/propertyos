import { useT } from '@repo/ui';
import { RelatedRecords } from '../workspace/RelatedRecords';
import { FavouriteButton, useFavourites } from '../workspace/wkit';

/**
 * Wave 2 integration (E.13 connections): a payables record page keeps the record as a favourite and shows its
 * related records from E.13's registry, exactly like the other Gate E record pages. The registry answers with
 * E.8's own record rule (developer/payables/records.ts), so every related card is one the reader may open, and
 * none names a bank detail. The shell records the visit as a recent record from the `?record=` address.
 */
export function FavouriteStar({ id, title }: { id: string; title: string }) {
  const favourites = useFavourites();
  const record = { id, title, favouritable: true };
  return <FavouriteButton record={record} isFavourite={favourites.isFavourite(id)} onToggle={() => void favourites.toggle(record)} testId="pay-favourite" />;
}

/** The record's related records (no documents panel: payables keep their own evidence on the record). */
export function PayRelated({ id, headingLevel = 2 }: { id: string; headingLevel?: 2 | 3 }) {
  const { t } = useT();
  return (
    <section aria-label={t('payables:related.title')} data-testid="pay-related">
      <RelatedRecords recordId={id} headingLevel={headingLevel} withDocuments={false} />
    </section>
  );
}
