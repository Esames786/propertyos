/** Pakistani CNIC: 13 digits shown as #####-#######-#. */

export function cnicDigits(input: string): string {
  return input.replace(/\D/g, '').slice(0, 13);
}

/** Progressive mask applied while typing; tolerant of pasted values with or without dashes. */
export function maskCnic(input: string): string {
  const d = cnicDigits(input);
  if (d.length <= 5) return d;
  if (d.length <= 12) return `${d.slice(0, 5)}-${d.slice(5)}`;
  return `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}`;
}

export function isValidCnic(input: string): boolean {
  return /^\d{5}-\d{7}-\d$/.test(input) || /^\d{13}$/.test(input);
}
