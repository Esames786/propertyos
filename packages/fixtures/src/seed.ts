/** Deterministic PRNG (mulberry32) so every run, screenshot and test sees identical data. */
export interface Random {
  next(): number;
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  chance(probability: number): boolean;
  weighted<T>(entries: ReadonlyArray<readonly [T, number]>): T;
}

export function createRandom(seed: number): Random {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (items) => items[Math.floor(next() * items.length)]!,
    chance: (p) => next() < p,
    weighted: (entries) => {
      const total = entries.reduce((sum, [, w]) => sum + w, 0);
      let roll = next() * total;
      for (const [value, weight] of entries) {
        roll -= weight;
        if (roll < 0) return value;
      }
      return entries[entries.length - 1]![0];
    },
  };
}

export const pad = (n: number, width: number) => String(n).padStart(width, '0');

/** Fixed clock for fixture generation; dates are deterministic regardless of the day the demo runs. */
export const FIXTURE_NOW = new Date('2026-10-26T09:00:00Z');

export function daysFromNow(days: number, hour = 9): string {
  const d = new Date(FIXTURE_NOW);
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}

export function calendarDaysFromNow(days: number): string {
  return daysFromNow(days).slice(0, 10);
}

/** Percentage of a 2-decimal amount using integer paisa arithmetic (no float drift). */
export function percentOf(amount: string, percent: number): string {
  const paisa = BigInt(amount.replace('.', ''));
  const result = (paisa * BigInt(Math.round(percent * 100))) / 10000n;
  const str = result.toString().padStart(3, '0');
  return `${str.slice(0, -2)}.${str.slice(-2)}`;
}
