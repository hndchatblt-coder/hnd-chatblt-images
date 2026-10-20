/**
 * Number notation. Short scale by default ($1.25M), scientific as a settings option, both driven
 * by config.notation. Kept pure so the counter component and the stats panel format identically.
 */
import { config, type EconomyConfig } from "./config.js";

export type Notation = "short" | "scientific";

const ZERO = 0;
const ONE = 1;

export function formatCash(
  value: number,
  notation: Notation = "short",
  c: EconomyConfig = config,
): string {
  return `$${formatNumber(value, notation, c)}`;
}

export function formatNumber(
  value: number,
  notation: Notation = "short",
  c: EconomyConfig = config,
): string {
  if (!Number.isFinite(value)) return "—";
  const sign = value < ZERO ? "-" : "";
  const n = Math.abs(value);
  const { groupSize, shortSuffixes, decimalsBelowThousand, decimalsAbove } = c.notation;

  if (n < groupSize) {
    return sign + n.toFixed(n < ONE && n > ZERO ? decimalsAbove : decimalsBelowThousand);
  }

  const tier = Math.floor(Math.log(n) / Math.log(groupSize));

  if (notation === "scientific" || tier >= shortSuffixes.length) {
    const exponent = Math.floor(Math.log10(n));
    const mantissa = n / Math.pow(10, exponent);
    return `${sign}${mantissa.toFixed(decimalsAbove)}e${exponent}`;
  }

  const scaled = n / Math.pow(groupSize, tier);
  return `${sign}${trimZeros(scaled.toFixed(decimalsAbove))}${shortSuffixes[tier]}`;
}

/** 1.20M reads worse than 1.2M; 1.00M reads worse than 1M. */
function trimZeros(text: string): string {
  if (!text.includes(".")) return text;
  return text.replace(/\.?0+$/, "");
}

/** "$1.2k/sec" style, for the till subline. */
export function formatRate(
  value: number,
  notation: Notation = "short",
  c: EconomyConfig = config,
): string {
  return `${formatCash(value, notation, c)}/sec`;
}

/** Plain-English duration for the offline welcome-back summary. */
export function formatDuration(seconds: number, c: EconomyConfig = config): string {
  const { secondsPerMinute, secondsPerHour } = c.time;
  if (seconds < secondsPerMinute) return `${Math.floor(seconds)}s`;
  if (seconds < secondsPerHour) return `${Math.floor(seconds / secondsPerMinute)}m`;
  const hours = Math.floor(seconds / secondsPerHour);
  const minutes = Math.floor((seconds % secondsPerHour) / secondsPerMinute);
  return minutes > ZERO ? `${hours}h ${minutes}m` : `${hours}h`;
}
