/**
 * Foundational types. DESIGN.md §26 — the forbidden-hardcode list.
 *
 * Every type in this file exists to make a §26 violation a COMPILE ERROR
 * rather than a code-review note. If you find yourself reaching for `number`
 * where one of these belongs, that is the mistake §26 is about.
 *
 * These are cheap today and a rewrite in Act III. Do not weaken them.
 */

// --- Branded primitives --------------------------------------------------
declare const brand: unique symbol;
type Brand<T, B> = T & { readonly [brand]: B };

/** Whole simulation ticks since run start. Never wall-clock. */
export type GameTime = Brand<number, 'GameTime'>;
export const gameTime = (ticks: number): GameTime => ticks as GameTime;

/** Floor tiles. Distinct from pixels, metres or anything else. */
export type Tiles = Brand<number, 'Tiles'>;
export const tiles = (n: number): Tiles => n as Tiles;

export type SiteId = Brand<string, 'SiteId'>;
export type StaffId = Brand<string, 'StaffId'>;
export type OrderId = Brand<string, 'OrderId'>;
export type ItemId = Brand<string, 'ItemId'>;
export type RecipeId = Brand<string, 'RecipeId'>;
export type MachineId = Brand<string, 'MachineId'>;
export const id = <T extends string>(s: string): T => s as T;

// --- Money ---------------------------------------------------------------
/**
 * §26: currency is a typed value with a unit, never a bare number.
 * Act III crosses borders. Stored in minor units (cents) as an integer so
 * the P&L reconciles to the cent — that is a gate in step 6.
 */
export type CurrencyCode = 'AUD' | 'NZD' | 'USD' | 'GBP' | 'EUR' | 'JPY';

export interface Money {
  readonly cents: number;
  readonly currency: CurrencyCode;
}

export const money = (major: number, currency: CurrencyCode = 'AUD'): Money => ({
  cents: Math.round(major * 100),
  currency,
});

export const cents = (c: number, currency: CurrencyCode = 'AUD'): Money => ({
  cents: Math.round(c),
  currency,
});

export const ZERO = (currency: CurrencyCode = 'AUD'): Money => ({ cents: 0, currency });

function assertSame(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new Error(`Currency mismatch: ${a.currency} vs ${b.currency}`);
  }
}

export const Cash = {
  add: (a: Money, b: Money): Money => (assertSame(a, b), { cents: a.cents + b.cents, currency: a.currency }),
  sub: (a: Money, b: Money): Money => (assertSame(a, b), { cents: a.cents - b.cents, currency: a.currency }),
  scale: (a: Money, k: number): Money => ({ cents: Math.round(a.cents * k), currency: a.currency }),
  sum: (xs: readonly Money[], currency: CurrencyCode = 'AUD'): Money =>
    xs.reduce((acc, m) => Cash.add(acc, m), ZERO(currency)),
  gte: (a: Money, b: Money): boolean => (assertSame(a, b), a.cents >= b.cents),
  lt: (a: Money, b: Money): boolean => (assertSame(a, b), a.cents < b.cents),
  isNegative: (a: Money): boolean => a.cents < 0,
  /** Ratio of two Money values, e.g. COGS%. Returns a plain number. */
  ratio: (a: Money, b: Money): number => (assertSame(a, b), b.cents === 0 ? 0 : a.cents / b.cents),
  major: (a: Money): number => a.cents / 100,
  format: (a: Money): string =>
    `${a.currency} ${(a.cents / 100).toFixed(2)}`,
};

// --- Sites ---------------------------------------------------------------
/**
 * §26: `Site`, never `Venue`. A venue is one kind of site. Dark kitchens,
 * commissaries and colony modules are others, and they arrive in later acts.
 */
export type SiteKind = 'venue' | 'darkKitchen' | 'commissary' | 'colonyModule';

// --- Reputation ----------------------------------------------------------
/**
 * §26: reputation is a keyed map, never scalar fields. Acts III and IV add
 * regional, national and per-territory channels. Declare channels in config.
 */
export type ReputationChannel = string & { readonly __rep?: never };

export interface ReputationState {
  /** Recency-weighted mean of recent reviews, 1..5 stars. */
  readonly stars: number;
  readonly reviewCount: number;
}

export type ReputationMap = ReadonlyMap<ReputationChannel, ReputationState>;

// --- Routing -------------------------------------------------------------
/**
 * §26: routing is generic. Act II runs trucks, Act IV runs drones, Act V runs
 * lifters. Same problem, different vehicle envelopes.
 */
export interface VehicleClass {
  readonly id: string;
  readonly capacityUnits: number;
  /** Max one-way distance before it must return. Infinity for trucks in Act II. */
  readonly rangeUnits: number;
  readonly speedUnitsPerHour: number;
  readonly runningCostPerHour: Money;
  /** Fraction of time unavailable — charging, maintenance, weather. */
  readonly downtimeFraction: number;
}

export interface RouteNode {
  readonly siteId: SiteId;
  readonly arrivalOffsetHours: number;
}

export interface Route {
  readonly id: string;
  readonly vehicle: VehicleClass;
  readonly nodes: readonly RouteNode[];
  /**
   * §26: transit has latency. Act IV needs flight time, Act V needs light-lag.
   * Zero in Act II for same-city trucks, but the field exists from day one.
   */
  readonly controlLatencyHours: number;
}

// --- Camera --------------------------------------------------------------
/** §26: N-tier camera, not 3-tier. Later acts add region, nation, orbital. */
export interface CameraTier {
  readonly id: string;
  readonly minZoom: number;
  readonly maxZoom: number;
  readonly label: string;
}
