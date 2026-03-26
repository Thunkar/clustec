/**
 * Format raw FJ amounts (1 FJ token = 1e18 raw) into human-readable strings.
 *
 * Examples:
 *   3444541607790000000      → "3.44 FJ"
 *   7112340075250400000000   → "7,112.34 FJ"
 *   2574262100000            → "2.57T" (for per-mana rates, no /1e18)
 */

const SUFFIXES = ["", "K", "M", "B", "T", "Q"];

/** Format a number with metric suffix (K/M/B/T). */
function withSuffix(v: number, decimals = 2): string {
  if (v === 0) return "0";
  const abs = Math.abs(v);
  const tier = Math.min(Math.floor(Math.log10(abs) / 3), SUFFIXES.length - 1);
  if (tier === 0) {
    return abs < 1 ? v.toPrecision(3) : v.toFixed(decimals);
  }
  const scaled = v / Math.pow(10, tier * 3);
  return scaled.toFixed(decimals) + SUFFIXES[tier];
}

/**
 * Format a raw FJ amount (1e18 = 1 FJ token) into a readable string.
 * Returns something like "3.44 FJ" or "7.11K FJ".
 */
export function formatFJ(raw: number | string | null | undefined): string {
  if (raw == null) return "-";
  const n = Number(raw);
  if (isNaN(n)) return "-";
  if (n === 0) return "0 FJ";
  const tokens = n / 1e18;
  return `${withSuffix(tokens)} FJ`;
}

/**
 * Format a per-mana rate (raw FJ units per mana, NOT divided by 1e18).
 * These are already in "FJ-per-mana" units — just need metric suffix.
 * Returns something like "2.57T" or "3.73Q".
 */
export function formatFJPerMana(raw: number | string | null | undefined): string {
  if (raw == null) return "-";
  const n = Number(raw);
  if (isNaN(n)) return "-";
  if (n === 0) return "0";
  return withSuffix(n);
}

/**
 * Compact format for chart axes — shorter than formatFJ.
 * Returns "3.4" or "7.1K" (no "FJ" suffix).
 */
export function formatFJCompact(raw: number | null | undefined): string {
  if (raw == null) return "-";
  if (raw === 0) return "0";
  const tokens = raw / 1e18;
  return withSuffix(tokens, 1);
}

/**
 * Format a per-mana rate compactly for chart axes.
 */
export function formatPerManaCompact(raw: number | null | undefined): string {
  if (raw == null) return "-";
  if (raw === 0) return "0";
  return withSuffix(raw, 1);
}
