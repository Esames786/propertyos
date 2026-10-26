/**
 * Pakistani phone numbers. Stored as E.164 ("+923001234567"), displayed grouped and always
 * rendered left-to-right (inside a bidi-isolated element) so Urdu layout never reorders digits.
 */

export function normalizePkPhone(input: string): string | null {
  const digits = input.replace(/[\s\-().]/g, '');
  let national: string;
  if (/^\+92\d+$/.test(digits)) national = digits.slice(3);
  else if (/^0092\d+$/.test(digits)) national = digits.slice(4);
  else if (/^92\d{9,10}$/.test(digits)) national = digits.slice(2);
  else if (/^0\d+$/.test(digits)) national = digits.slice(1);
  else if (/^\d{9,10}$/.test(digits)) national = digits;
  else return null;
  if (!/^\d{9,10}$/.test(national)) return null;
  if (national.startsWith('3') && national.length !== 10) return null;
  return `+92${national}`;
}

export function isPkMobile(e164: string): boolean {
  return /^\+923\d{9}$/.test(e164);
}

export function isValidPkPhone(input: string): boolean {
  return normalizePkPhone(input) !== null;
}

export function formatPkPhone(e164: string): string {
  const national = e164.replace(/^\+92/, '');
  if (isPkMobile(e164)) return `+92 ${national.slice(0, 3)} ${national.slice(3)}`;
  return `+92 ${national.slice(0, 2)} ${national.slice(2)}`;
}
