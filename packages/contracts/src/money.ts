import { z } from 'zod';

/** Fixed-decimal money as a string ("12500000.50") plus ISO currency. Never a JS float. */
export const MoneySchema = z.object({
  amount: z.string().regex(/^-?\d{1,18}(\.\d{1,2})?$/),
  currency: z.literal('PKR'),
});

export type Money = z.infer<typeof MoneySchema>;

export const isMoneyAmount = (amount: string) => MoneySchema.shape.amount.safeParse(amount).success;

export function pkr(amount: string): Money {
  return MoneySchema.parse({ amount, currency: 'PKR' });
}
