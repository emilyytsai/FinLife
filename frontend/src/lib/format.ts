// Must produce exactly the same strings as the backend's engine.money (contracts/schema.md "Money format").

type MoneyTier = { below: number; step: number; divisor: number; suffix: string; decimals: 0 | 1 };

// Each tier rounds half up to its own precision. If rounding reaches the next tier's range, the next tier
// is used instead ("decide the unit after rounding"): 999.5 -> $1k, 9999 -> $10k, 999999 -> $1M.
const MONEY_TIERS: MoneyTier[] = [
  { below: 1_000, step: 1, divisor: 1, suffix: "", decimals: 0 },
  { below: 10_000, step: 100, divisor: 1_000, suffix: "k", decimals: 1 },
  { below: 1_000_000, step: 1_000, divisor: 1_000, suffix: "k", decimals: 0 },
  { below: 10_000_000, step: 100_000, divisor: 1_000_000, suffix: "M", decimals: 1 },
  { below: Infinity, step: 1_000_000, divisor: 1_000_000, suffix: "M", decimals: 0 },
];

/** $950, $9.5k, $350k, $2.6M, $12M. Negative values get a leading "-". */
export function money(x: number): string {
  if (!Number.isFinite(x)) return "—";
  if (x < 0) return `-${money(-x)}`;
  for (const tier of MONEY_TIERS) {
    const rounded = Math.floor(x / tier.step + 0.5) * tier.step;
    if (rounded < tier.below) {
      const value = rounded / tier.divisor;
      const text = tier.decimals === 1 ? value.toFixed(1).replace(/\.0$/, "") : String(value);
      return `$${text}${tier.suffix}`;
    }
  }
  return "—";
}

/** 0.06 -> "6%". One decimal when the percent isn't whole: 0.075 -> "7.5%". */
export function pct(x: number): string {
  return `${Math.round(x * 1000) / 10}%`;
}
