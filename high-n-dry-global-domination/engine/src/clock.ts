import type { EconomyConfig } from "./content/schemas.js";

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type DayKey = (typeof DAY_KEYS)[number];

/**
 * The economy clock (GAME_DESIGN §2, "gmin"). Drives the day/week cycle, daypart labels,
 * offline settlement, and the war layer's weekly rhythm. Independent of the active clock —
 * the active layer runs in real seconds regardless of what this clock says; this clock only
 * sets wave *intensity*, never raw spawn floods (that mapping lives in the active layer, M2).
 */
export class EconomyClock {
  private readonly realSecondsPerGameMinute: number;
  private readonly gameMinutesPerDay: number;
  private readonly hourMultipliers: ReadonlyMap<number, number>;
  private readonly dayMultipliers: Record<DayKey, number>;
  private gameMinutes: number;

  constructor(config: EconomyConfig, startGameMinutes = 0) {
    this.realSecondsPerGameMinute = config.time.realSecondsPerGameMinute;
    this.gameMinutesPerDay = config.time.gameMinutesPerDay;
    this.dayMultipliers = config.demand.dayMultipliers;
    this.hourMultipliers = expandHourRanges(config.demand.hourMultipliers);
    this.gameMinutes = startGameMinutes;
  }

  /** Advances the clock by a slice of real (wall-clock) seconds. */
  advanceByRealSeconds(realSeconds: number): void {
    if (realSeconds < 0) throw new Error("EconomyClock: cannot advance by a negative duration");
    this.gameMinutes += realSeconds / this.realSecondsPerGameMinute;
  }

  /** Fast-forwards the clock directly by a number of game-minutes (offline settlement, sim scripts). */
  advanceByGameMinutes(gameMinutes: number): void {
    if (gameMinutes < 0) throw new Error("EconomyClock: cannot advance by a negative duration");
    this.gameMinutes += gameMinutes;
  }

  getGameMinutes(): number {
    return this.gameMinutes;
  }

  getDayIndex(): number {
    return Math.floor(this.gameMinutes / this.gameMinutesPerDay) % 7;
  }

  getDayKey(): DayKey {
    return DAY_KEYS[this.getDayIndex()] as DayKey;
  }

  getHour(): number {
    return Math.floor((this.gameMinutes % this.gameMinutesPerDay) / 60) % 24;
  }

  getMinuteOfHour(): number {
    return Math.floor(this.gameMinutes % 60);
  }

  /** hourMultiplier(hour) * dayMultiplier(day) — the raw idle demand multiplier at this instant. */
  getDemandMultiplier(): number {
    const hourMult = this.hourMultipliers.get(this.getHour()) ?? 0;
    const dayMult = this.dayMultipliers[this.getDayKey()];
    return hourMult * dayMult;
  }

  toJSON(): { gameMinutes: number } {
    return { gameMinutes: this.gameMinutes };
  }

  static fromJSON(config: EconomyConfig, data: { gameMinutes: number }): EconomyClock {
    return new EconomyClock(config, data.gameMinutes);
  }
}

/** "11-14" -> {11: mult, 12: mult, 13: mult, 14: mult}, for O(1) hour lookups. */
function expandHourRanges(hourMultipliers: Record<string, number>): Map<number, number> {
  const table = new Map<number, number>();
  for (const [range, mult] of Object.entries(hourMultipliers)) {
    const [startStr, endStr] = range.split("-");
    const start = Number(startStr);
    const end = Number(endStr);
    for (let hour = start; hour <= end; hour++) table.set(hour, mult);
  }
  return table;
}

/**
 * The active clock (GAME_DESIGN §2). Real-time seconds: patience, cook progress, surges,
 * cooldowns, wave gaps. Deliberately dumb — it just accumulates elapsed real seconds. Tuning
 * happens in the active-layer rules (M2), not here.
 */
export class ActiveClock {
  private elapsedRealSeconds: number;

  constructor(startElapsedRealSeconds = 0) {
    this.elapsedRealSeconds = startElapsedRealSeconds;
  }

  advance(realSeconds: number): void {
    if (realSeconds < 0) throw new Error("ActiveClock: cannot advance by a negative duration");
    this.elapsedRealSeconds += realSeconds;
  }

  getElapsedRealSeconds(): number {
    return this.elapsedRealSeconds;
  }

  toJSON(): { elapsedRealSeconds: number } {
    return { elapsedRealSeconds: this.elapsedRealSeconds };
  }

  static fromJSON(data: { elapsedRealSeconds: number }): ActiveClock {
    return new ActiveClock(data.elapsedRealSeconds);
  }
}
