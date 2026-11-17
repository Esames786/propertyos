/**
 * Gate E.8: a running total of typed amounts for the forms (shown while typing; the server checks and
 * stores the figures). Integer paisa, never a float; text that is not an amount counts as nothing.
 */
const AMOUNT = /^\d{1,9}(\.\d{1,2})?$/;

export function paisaOf(text: string): bigint {
  const v = text.trim().replace(/,/g, '');
  if (!AMOUNT.test(v)) return 0n;
  const [whole = '0', frac = ''] = v.split('.');
  return BigInt(whole) * 100n + BigInt(`${frac}00`.slice(0, 2));
}

export function moneyText(paisa: bigint): string {
  const negative = paisa < 0n;
  const digits = (negative ? -paisa : paisa).toString().padStart(3, '0');
  return `${negative ? '-' : ''}${digits.slice(0, -2)}.${digits.slice(-2)}`;
}
