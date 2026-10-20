/**
 * The session model. DESIGN.md §25.2.
 *
 * Bots do NOT run continuously. They play three 8-minute sessions per real day
 * with offline gaps between and a 9-hour overnight, obeying the §5.2 offline
 * caps. Balancing against a continuous 90-day run tunes a game that nobody's
 * play pattern matches — this is the single easiest way to get the whole
 * economy subtly wrong, so the model lives here and is used by every bot.
 *
 * Offline rule, restated because it is counter-intuitive:
 *   - any gap grants AT MOST one trading day of accrual, however long it was
 *   - at most two offline trading days per rolling real 24 hours
 *   - offline runs at 75% efficiency
 *   - no purchase may ever raise these caps (§5.3)
 */
import { TIME } from '@/config/time';

export interface SessionPlan {
  /** Real minutes of active play in this session. */
  readonly activeMinutes: number;
  /** Real hours of gap BEFORE this session. */
  readonly gapHoursBefore: number;
}

/** Three 8-minute sessions a day, with an overnight. */
export const DEFAULT_SESSION_PATTERN: readonly SessionPlan[] = [
  { activeMinutes: 8, gapHoursBefore: 9 }, // morning, after sleep
  { activeMinutes: 8, gapHoursBefore: 6 }, // lunch
  { activeMinutes: 8, gapHoursBefore: 4 }, // evening
];

export interface OfflineGrant {
  readonly tradingDays: number;
  readonly efficiency: number;
  readonly cappedFrom: number;
}

/**
 * How much offline accrual a gap earns, given how much has already been
 * granted in the trailing real 24 hours.
 */
export function offlineGrant(gapHours: number, grantedInLast24h: number): OfflineGrant {
  const uncapped = gapHours > 0 ? TIME.OFFLINE_MAX_TRADING_DAYS_PER_GAP : 0;
  const remaining = Math.max(0, TIME.OFFLINE_MAX_TRADING_DAYS_PER_REAL_DAY - grantedInLast24h);
  return {
    tradingDays: Math.min(uncapped, remaining),
    efficiency: TIME.OFFLINE_EFFICIENCY,
    cappedFrom: uncapped,
  };
}

/** Game hours of active play a real-minutes session buys at a given speed. */
export function activeGameHours(realMinutes: number, speed = 1): number {
  return (realMinutes * 60 * speed) / TIME.REAL_SECONDS_PER_GAME_HOUR;
}
