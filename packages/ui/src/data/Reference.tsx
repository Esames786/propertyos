import { cn } from '../lib/cn';

/**
 * Latin identifiers (invoice/unit numbers, IBAN, phone, CNIC, email, URL, transaction id) rendered
 * left-to-right and bidi-isolated, so Urdu layout never reorders their characters (01 §3).
 */
export function Reference({ value, className, mono = false }: { value: string; className?: string; mono?: boolean }) {
  return (
    <bdi dir="ltr" className={cn('ltr-ref whitespace-nowrap', mono && 'tracking-wide', className)}>
      {value}
    </bdi>
  );
}
