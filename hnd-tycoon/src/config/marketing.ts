/**
 * Marketing and pricing. DESIGN.md §8.2, §8.3, §6.1.
 *
 * §8.2 on pricing: *"the lever the player forgets they have"*, and the one
 * with the most delayed consequence. Raising price lifts margin immediately and
 * suppresses arrivals through `priceResistance`. Changes land the NEXT trading
 * day — that delay is the design, not an implementation convenience.
 *
 * §8.3 on marketing: *"efficiency scales down as reputation drops. A bad shop
 * pays more per customer, and those customers balk more. Bad money after bad,
 * and the panel must show cost-per-cover so the player can see it happening."*
 */
export const PRICING = {
  /** §6.1: priceResistance = clamp((price / fairPrice - 1) * elasticity, 0, 0.8) */
  ELASTICITY: 1.7,
  MAX_RESISTANCE: 0.8,
  /**
   * §8.2: fairPrice rises with reputation, so a 4.6-star shop can charge what a
   * 3.8-star shop cannot. **This is the main way reputation converts into
   * money** and the band has to be surfaced next to the price input.
   */
  FAIR_PRICE_AT_PRIOR: 1.0,
  FAIR_PRICE_PER_STAR: 0.14,
  FAIR_BAND: 0.12,
  /** Constantly re-pricing looks erratic and Regulars notice. §8.2 */
  CHANGE_FRICTION_STARS: 0.04,
  MIN_MULTIPLIER: 0.6,
  MAX_MULTIPLIER: 1.8,
  /**
   * **Value for money is part of satisfaction, and this is what stops "small,
   * dear and lean" being the dominant strategy.**
   *
   * §8.2's fair band is a statement about what a shop at your rating can get
   * away with. Until now, exceeding it only suppressed demand — and for a shop
   * that could not serve that demand anyway, suppressing it was FREE. Measured:
   * `bot:tightarse` charging 118% on one staffer finished ninety days 41% ahead
   * of a well-run larger shop, on half the covers.
   *
   * Charging over the odds now costs satisfaction on every order that IS served,
   * which feeds §7.4's reviews and §6.1's demand. Below the band it is zero: a
   * cheap shop is not penalised, it just makes less per cover.
   *
   * Multiplies the satisfaction score by `1 - OVER_BAND_SATISFACTION * over`,
   * where `over` is how far past the top of the band the price sits, as a
   * fraction of the band's own width.
   */
  OVER_BAND_SATISFACTION: 0.38,
  /**
   * However dear you get, the food is still the food. §10 — there is no price
   * at which the shop becomes untradeable, only one at which it is resented.
   */
  MIN_VALUE_SCORE: 0.25,
} as const;

export interface MarketingChannel {
  readonly id: string;
  readonly label: string;
  readonly blurb: string;
  /** Dollars per week at full spend. */
  readonly weeklyCost: number;
  /** Awareness added per dollar. */
  readonly potency: number;
  /** Fraction of its awareness lost per day. */
  readonly decayPerDay: number;
}

export const MARKETING_CHANNELS: readonly MarketingChannel[] = [
  {
    id: 'letterbox',
    label: 'Letterbox drop',
    blurb: 'Slow to build, slow to fade. The people it brings come back.',
    weeklyCost: 180,
    potency: 0.00055,
    decayPerDay: 0.06,
  },
  {
    id: 'social',
    label: 'Paid social',
    blurb: 'Spikes fast, fades faster. This is where over-marketing lives.',
    weeklyCost: 420,
    potency: 0.00135,
    decayPerDay: 0.22,
  },
];

export const MARKETING = {
  /** §8.3: total awareness decays ~12%/day on top of per-channel decay. */
  GLOBAL_DECAY_PER_DAY: 0.12,
  /** Awareness cannot exceed this — you cannot buy a queue out of nothing. */
  MAX_AWARENESS: 1.4,
  /**
   * §8.3: efficiency scales DOWN as reputation drops. Below the prior you pay
   * more per customer and those customers balk more — bad money after bad.
   */
  EFFICIENCY_AT_ONE_STAR: 0.25,
  EFFICIENCY_AT_FIVE_STARS: 1.15,
} as const;
