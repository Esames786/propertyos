/** IBAN helpers (ISO 13616, mod-97). Pakistan: 24 characters, "PK" + 2 check + 4 bank + 16 account. */

const LENGTHS: Record<string, number> = { PK: 24 };

export function normalizeIban(input: string): string {
  return input.replace(/\s+/g, '').toUpperCase();
}

function mod97(numeric: string): number {
  let remainder = 0;
  for (const ch of numeric) remainder = (remainder * 10 + Number(ch)) % 97;
  return remainder;
}

function toNumeric(rearranged: string): string {
  return [...rearranged]
    .map((c) => (/[A-Z]/.test(c) ? String(c.charCodeAt(0) - 55) : c))
    .join('');
}

export function isValidIban(input: string): boolean {
  const iban = normalizeIban(input);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban)) return false;
  const expected = LENGTHS[iban.slice(0, 2)];
  if (expected && iban.length !== expected) return false;
  return mod97(toNumeric(iban.slice(4) + iban.slice(0, 4))) === 1;
}

/** Builds a checksum-valid IBAN. Used only for fictional fixture accounts (bank code "DEMO"). */
export function buildIban(country: string, bban: string): string {
  const check = 98 - mod97(toNumeric(`${bban}${country}00`));
  return `${country}${String(check).padStart(2, '0')}${bban}`;
}

export function formatIban(input: string): string {
  return normalizeIban(input).replace(/(.{4})(?=.)/g, '$1 ');
}
