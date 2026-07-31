/**
 * Money (§4.9). Australian rules, because the game is about an Australian burger shop and
 * penalty rates are a real decision an operator makes every week.
 */
export const economy = {
  startingCash: 8000,

  /** Menu price per item id. */
  menuPrice: { cheeseburger: 16.5, chips: 6.5 } as Record<string, number>,

  /** Cost per unit of raw ingredient. COGS counts waste and remakes, not just what sold. */
  ingredientCost: {
    beef: 2.35,
    bun: 0.85,
    cheese: 0.42,
    garnish: 0.36,
    potato: 0.9,
    oil: 0.15,
  } as Record<string, number>,

  wages: {
    /** Casual loading, on top of base, in lieu of leave. */
    casualLoading: 0.25,
    /** Multipliers by day of week, Sunday-first. */
    penaltyRates: [1.5, 1, 1, 1, 1, 1, 1.25] as readonly number[],
    publicHoliday: 2.25,
  },

  fixed: {
    /** Per venue per week. */
    rentPerWeek: 1450,
    insurancePerWeek: 95,
    posSubscriptionPerWeek: 42,
    /** Utilities scale with how long equipment actually ran. */
    utilitiesPerStationHour: 0.55,
  },

  marketing: {
    /**
     * Dollars of spend per point of awareness at five stars. Awareness multiplies demand
     * directly, so this is the exchange rate between cash today and customers tomorrow.
     */
    dollarsPerAwarenessPoint: 900,
    /**
     * Marketing efficiency scales with reputation and never falls below this. A bad shop pays
     * more per customer and those customers then balk — bad money after bad (§4.9).
     */
    minEfficiency: 0.25,
  },

  overdraft: { annualRate: 0.14, compoundDaily: true },
} as const;
