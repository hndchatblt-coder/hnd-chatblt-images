import { z } from "zod";

// economy.config.json — the single source of truth for all idle + active balance numbers.
// Every section here mirrors a top-level key in economy.config.json. Keep in sync by hand;
// a missing/renamed key should fail loudly (zod) rather than silently fall back to a default.

const HourRangeKey = z.string().regex(/^\d{1,2}-\d{1,2}$/);

export const EconomyConfigSchema = z.object({
  version: z.string(),
  comment: z.string().optional(),
  time: z.object({
    realSecondsPerGameMinute: z.number().positive(),
    gameMinutesPerDay: z.number().int().positive(),
    comment: z.string().optional(),
  }),
  demand: z.object({
    baseCustomersPerGameMinute: z.number().positive(),
    hourMultipliers: z.record(HourRangeKey, z.number().nonnegative()),
    dayMultipliers: z.object({
      mon: z.number().nonnegative(),
      tue: z.number().nonnegative(),
      wed: z.number().nonnegative(),
      thu: z.number().nonnegative(),
      fri: z.number().nonnegative(),
      sat: z.number().nonnegative(),
      sun: z.number().nonnegative(),
    }),
    reputationMultiplier: z.string(),
  }),
  revenue: z.object({
    avgTicketDollars: z.number().positive(),
    grossMarginPct: z.number().min(0).max(1),
    wagesSkimPct: z.number().min(0).max(1),
    comment: z.string().optional(),
  }),
  stations: z.record(
    z.string(),
    z.object({
      baseCost: z.number().nonnegative(),
      costGrowth: z.number().positive(),
      capacityPerUnit: z.number().positive().optional(),
      unit: z.string().optional(),
      effect: z.string().optional(),
    }),
  ),
  milestoneBonuses: z.object({
    comment: z.string().optional(),
    thresholds: z.array(z.number().int().positive()),
    multiplierPerMilestone: z.number().positive(),
  }),
  venues: z.object({
    comment: z.string().optional(),
    baseCost: z.number().positive(),
    costGrowth: z.number().positive(),
    newVenueStartsWith: z.string(),
  }),
  managers: z.record(
    z.string(),
    z.object({
      cost: z.number().nonnegative(),
      currency: z.enum(["cash", "reputation", "influence"]),
      effect: z.string(),
    }),
  ),
  offline: z.object({
    model: z.string(),
    baseCapGameHours: z.number().positive(),
    capUpgrade: z.object({
      name: z.string(),
      baseCost: z.number().nonnegative(),
      costGrowth: z.number().positive(),
      hoursPerLevel: z.number().positive(),
      maxGameHours: z.number().positive(),
    }),
    comment: z.string().optional(),
  }),
  reputation: z.object({
    sources: z.string(),
    weeklySpecial: z.object({
      successRepGain: z.number().nonnegative(),
      flopRepGain: z.number().nonnegative(),
      comment: z.string().optional(),
    }),
  }),
  influence: z.object({
    formula: z.string(),
    comment: z.string().optional(),
    spentOn: z.array(z.string()),
  }),
  war: z.object({
    comment: z.string().optional(),
    tileCaptureCost: z.string(),
    battleResolution: z.string(),
    escalationPhases: z.array(
      z.object({
        phase: z.number().int().positive(),
        name: z.string(),
        weapons: z.array(z.string()),
      }),
    ),
  }),
  pacingTargets: z.object({
    comment: z.string().optional(),
    firstManagerRealMinutes: z.tuple([z.number(), z.number()]),
    secondVenueRealMinutes: z.tuple([z.number(), z.number()]),
    firstRivalContactRealMinutes: z.tuple([z.number(), z.number()]),
    firstTileCaptureRealHours: z.tuple([z.number(), z.number()]),
    cityDominationRealHours: z.tuple([z.number(), z.number()]),
    day14EmpireProfitPerSecGrowthVsDay1: z.tuple([z.number(), z.number()]),
    noSingleStationDominates: z.string(),
    offlineCapNeverExceeds: z.string(),
  }),
  venueSizes: z.object({
    comment: z.string().optional(),
    tiers: z.array(
      z.object({
        name: z.string(),
        cost: z.number().nonnegative(),
        caps: z.record(z.string(), z.number().nonnegative()),
      }),
    ),
  }),
  activeLayer: z.object({
    comment: z.string().optional(),
    designPrinciple: z.string(),
    items: z.record(
      z.string(),
      z.object({
        price: z.number().positive(),
        baseCookSec: z.number().positive(),
      }),
    ),
    orderMix: z.string(),
    serving: z.object({
      verb: z.string(),
      tipPct: z.number().min(0).max(1),
      tipWindow: z.string(),
      netRate: z.number().min(0).max(1),
      insufficientStock: z.string(),
    }),
    stations: z.object({
      model: z.string(),
      baseStock: z.record(z.string(), z.number().nonnegative()),
    }),
    hires: z.record(
      z.string(),
      z.object({ name: z.string(), cost: z.number().nonnegative() }).or(z.string()),
    ),
    wavePacing: z.object({
      model: z.string(),
      gapSec: z.string(),
      sizeFn: z.string(),
      intensityByDaypart: z.record(z.string(), z.number()),
      surgeIntensity: z.number().positive(),
    }),
    patienceSec: z.number().positive(),
    downtimeVerbs: z.object({
      research: z.object({
        tapsToComplete: z.number().int().positive(),
        bangerChance: z.number().min(0).max(1),
        bangerSurgeSec: z.number().positive(),
        bangerOrderBias: z.string(),
        flopCash: z.number().nonnegative(),
        flopIsHumourEngine: z.boolean(),
      }),
      prep: z.object({
        capBySize: z.array(z.number().int().nonnegative()),
        cookSpeedBoost: z.number().positive(),
        burnsPerItem: z.number().nonnegative(),
      }),
      socialAds: z.object({
        baseCost: z.number().nonnegative(),
        costGrowthPerUse: z.number().positive(),
        surgeSec: z.number().positive(),
        cooldownSec: z.number().nonnegative(),
        designNote: z.string(),
      }),
      flyers: z.object({
        verb: z.string(),
        convertChance: z.number().min(0).max(1),
      }),
      coins: z.object({
        dropChance: z.number().min(0).max(1),
        value: z.string(),
        lifeSec: z.number().positive(),
      }),
    }),
    startingCash: z.number().nonnegative(),
    openQuestions: z.array(z.string()),
  }),
});

export type EconomyConfig = z.infer<typeof EconomyConfigSchema>;

// /content — data-driven game content. Content iterations (CLAUDE.md "Agent-loop contract")
// may only add rows here; every row is zod-validated before it's usable.

const DemographicVector = z.object({
  families: z.number().min(-1).max(1),
  office: z.number().min(-1).max(1),
  students: z.number().min(-1).max(1),
  lateNight: z.number().min(-1).max(1),
});

export const TilesContentSchema = z.object({
  comment: z.string().optional(),
  tiles: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      region: z.string(),
      demographics: z.object({
        families: z.number().min(0).max(1),
        office: z.number().min(0).max(1),
        students: z.number().min(0).max(1),
        lateNight: z.number().min(0).max(1),
      }),
      baseDemandMult: z.number().positive(),
      defense: z.number().nonnegative(),
      owner: z.enum(["player", "neutral", "rival"]),
      butcherNode: z.boolean().optional(),
      notes: z.string(),
    }),
  ),
});

export const ManagersContentSchema = z.object({
  comment: z.string().optional(),
  managers: z.array(
    z.object({
      name: z.string(),
      hustle: z.number().int().min(1).max(10),
      consistency: z.number().int().min(1).max(10),
      quirk: z.string(),
      modifier: z.record(z.string(), z.number()),
    }),
  ),
});

export const RivalsContentSchema = z.object({
  comment: z.string().optional(),
  rivals: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      personality: z.string(),
      phase: z.number().int().positive(),
      expansionRate: z.number().positive(),
      defenseStyle: z.string(),
      preferredDemographics: z.array(z.string()),
      flavour: z.string(),
      taunts: z.object({
        onCapture: z.array(z.string()).min(1),
        onPlayerFailedAttack: z.array(z.string()).min(1),
        onPlayerCapture: z.array(z.string()).min(1),
      }),
    }),
  ),
});

export const SpecialsContentSchema = z.object({
  comment: z.string().optional(),
  patties: z.array(z.object({ id: z.string(), name: z.string(), affinity: DemographicVector })),
  sauces: z.array(z.object({ id: z.string(), name: z.string(), affinity: DemographicVector })),
  gimmicks: z.array(z.object({ id: z.string(), name: z.string(), affinity: DemographicVector })),
});

export type TilesContent = z.infer<typeof TilesContentSchema>;
export type ManagersContent = z.infer<typeof ManagersContentSchema>;
export type RivalsContent = z.infer<typeof RivalsContentSchema>;
export type SpecialsContent = z.infer<typeof SpecialsContentSchema>;
