import { Clock } from './clock';
import { Rng } from './rng';
import { createState, emptyDay, type SimState, type StateOptions } from './state';
import { CALENDARS, TIME } from '@/config/time';

/**
 * Tick orchestration. DESIGN.md §5.1.
 *
 * The World owns the clock, the RNG and the systems. It knows nothing about
 * rendering. Everything here must run in Node — that constraint is what makes
 * the balance harness possible, and the harness is how this game gets tuned.
 *
 * STEP 1 SCOPE: clock + rng + system registry + day boundary events.
 * Systems get added in later steps. Do not put game logic in this file —
 * it goes in sim/systems/ and registers here.
 */

export interface System {
  readonly name: string;
  /** Called every tick, in registration order. */
  tick?(world: World): void;
  /** Called on the tick trade opens. */
  onOpen?(world: World): void;
  /** Called on the tick trade closes. Emit daily figures here. */
  onClose?(world: World): void;
  /** Called on the tick payroll lands. */
  onPayroll?(world: World): void;
}

export interface DayReport {
  dayIndex: number;
  dayOfWeek: number;
  tradingHours: number;
  /** Systems append their own lines. Kept loose until Step 6 defines the P&L. */
  lines: Record<string, number | string>;
}

export interface WorldOptions extends StateOptions {
  seed: number | string;
  calendarId?: string;
}

export class World {
  readonly clock: Clock;
  readonly rng: Rng;
  readonly seed: number | string;
  readonly state: SimState;
  private readonly systems: System[] = [];
  private readonly reports: DayReport[] = [];
  private current: DayReport | null = null;

  constructor(opts: WorldOptions) {
    this.state = createState(opts);
    // The site chooses the calendar. §26 — the trading day is never hardcoded,
    // and "Sydney standard" is a default, not an assumption.
    const calendarKey = opts.calendarId ?? this.state.site.calendarId;
    const calendar = CALENDARS[calendarKey];
    if (!calendar) throw new Error(`Unknown calendar: ${calendarKey}`);
    this.clock = new Clock(calendar);
    this.seed = opts.seed;
    this.rng = new Rng(opts.seed);
  }

  register(system: System): this {
    this.systems.push(system);
    return this;
  }

  /** Named RNG stream for a system. Prevents cross-system sequence coupling. */
  rngFor(systemName: string): Rng {
    return this.rng.fork(systemName);
  }

  record(key: string, value: number | string): void {
    if (this.current) this.current.lines[key] = value;
  }

  get dayReports(): readonly DayReport[] {
    return this.reports;
  }

  private openDay(): void {
    // The World resets the day accumulator, not a system — otherwise which
    // system happens to be registered first would silently decide whether
    // anyone else sees yesterday's figures.
    this.state.day = emptyDay();
    // Run-hours are read by the utilities bill AND the bottleneck readout, so
    // neither system may reset them — whichever was registered first would
    // silently blind the other.
    for (const station of this.state.stations) station.runSeconds = 0;
    for (const staff of this.state.staff) {
      staff.shiftSeconds = 0;
      staff.walkSeconds = 0;
    }
    this.current = {
      dayIndex: this.clock.dayIndex,
      dayOfWeek: this.clock.dayOfWeek,
      tradingHours: this.clock.tradingHoursToday,
      lines: {},
    };
    for (const s of this.systems) s.onOpen?.(this);
  }

  private closeDay(): void {
    for (const s of this.systems) s.onClose?.(this);
    if (this.current) this.reports.push(this.current);
    this.current = null;
  }

  tick(): void {
    if (this.clock.isOpeningTick()) this.openDay();
    for (const s of this.systems) s.tick?.(this);
    if (this.clock.isPayrollTick()) for (const s of this.systems) s.onPayroll?.(this);
    if (this.clock.isClosingTick()) this.closeDay();
    this.clock.advance();
  }

  /** Run for a whole number of game days. */
  runDays(days: number): void {
    const target = this.clock.dayIndex + days;
    let guard = 0;
    const maxTicks = days * this.clock.ticksPerCycle + 2;
    while (this.clock.dayIndex < target && guard++ <= maxTicks) this.tick();
  }

  runTicks(n: number): void {
    for (let i = 0; i < n; i++) this.tick();
  }
}

export { TIME };
