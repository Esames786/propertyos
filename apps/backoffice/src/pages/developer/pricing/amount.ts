/**
 * Gate E.3 local validation: a formatted amount that may wrap between its currency and its digits.
 * Intl joins them with a no-break space ("Rs 32,180,000.00"), so at 320 px with 200 % text a long amount
 * could only overflow its box or be split inside the digits. A normal space lets "Rs" and the number take a
 * line each while the number itself stays whole. Display only: the value is never parsed back.
 */
const NO_BREAK_SPACES = new RegExp(`[${String.fromCharCode(0xa0, 0x202f)}]`, 'g');
export const wrappable = (formatted: string): string => formatted.replace(NO_BREAK_SPACES, ' ');

/**
 * Wave 2 integration: a deduction (a discount line, the discount total) carries U+2212 MINUS SIGN, written inside
 * the amount's own LTR isolate (`<bdi dir="ltr">`), so in Urdu (RTL) the sign stays at the amount's left as
 * "−Rs 30.00" and is never moved to the other end of the line. A zero amount has no sign.
 */
export const MINUS = String.fromCharCode(0x2212);
export const deductionSign = (money: { amount: string }): string => (/^0+(?:\.0+)?$/.test(money.amount) ? '' : MINUS);
