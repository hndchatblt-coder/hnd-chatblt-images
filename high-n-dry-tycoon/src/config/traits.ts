/**
 * Traits (§10.1). Every trait must create a placement decision — if it does not change where you
 * put someone or whether you hire them, it is flavour and it gets cut.
 */
import type { StationType } from "./recipes.js";

export interface TraitDef {
  id: string;
  name: string;
  blurb: string;
  /** Multiplies step speed at these stations. */
  speedAt?: Partial<Record<StationType, number>>;
  /** Multiplies speed everywhere. */
  speed?: number;
  /** Stations this person flatly will not work. */
  refuses?: StationType[];
  /** Multiplies skill gain. */
  learnRate?: number;
  learnRateAt?: Partial<Record<StationType, number>>;
  /** Multiplies fatigue accumulation. */
  fatigueRate?: number;
  /** Multiplies base error rate. */
  errorRate?: number;
  /** Multiplies incident chance at their station. */
  incidentRate?: number;
  /** Added satisfaction when serving at the register. */
  registerSatisfaction?: number;
  /** First hour of any shift runs at this speed. */
  slowStart?: number;
  /** Only available on these days, Sunday-first. No penalty-rate premium. */
  onlyDays?: readonly number[];
  wageMultiplier?: number;
}

export const traits: TraitDef[] = [
  { id: "fastHands", name: "Fast hands", blurb: "Never watches their own hands.", speedAt: { assembly: 1.15 } },
  { id: "grillDog", name: "Grill dog", blurb: "Happiest in the smoke. Will not do front of house.", learnRateAt: { grill: 2 }, refuses: ["pass", "drinks"] },
  { id: "slowStarter", name: "Slow starter", blurb: "Takes an hour to arrive properly.", slowStart: 0.7 },
  { id: "steady", name: "Steady", blurb: "Same pace at 11am and 9pm.", fatigueRate: 0.6 },
  { id: "chatty", name: "Chatty", blurb: "Knows everyone. Knows everyone's business.", registerSatisfaction: 0.08, speedAt: { pass: 0.9 } },
  { id: "weekendWarrior", name: "Weekend warrior", blurb: "Has a real job Monday to Thursday.", onlyDays: [0, 5, 6], wageMultiplier: 1 },
  { id: "cleanFreak", name: "Clean freak", blurb: "Things do not break around them.", incidentRate: 0.7 },
  { id: "green", name: "Green", blurb: "Cheap, keen, and drops things.", errorRate: 2.4, learnRate: 1.8, wageMultiplier: 0.88 },
];

export const traitById = new Map(traits.map((t) => [t.id, t]));
