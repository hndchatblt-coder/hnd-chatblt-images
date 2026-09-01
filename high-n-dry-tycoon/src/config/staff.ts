/**
 * Staff (§10). Named people with traits, not units — this is where the affection in the game
 * lives, and it is cheap because the art is procedural.
 */
import type { StationType } from "./recipes.js";

export type StaffType = "casual" | "partTime" | "fullTime";

export const staffConfig = {
  /** Base hourly rate before loading and penalties. */
  baseHourlyRate: { casual: 26.5, partTime: 24.8, fullTime: 24.2 } as Record<StaffType, number>,

  /** Skill starts here and climbs on hours worked, logarithmically. */
  startingSkill: 0.55,
  skillCeiling: 1.6,
  /** Skill gain per game hour worked at a station, before the log curve flattens it. */
  skillPerHour: 0.045,

  /** Stamina drains over a shift and drags speed and error rate with it. */
  staminaDrainPerHour: 0.11,
  staminaRecoverPerHourOff: 0.22,

  /**
   * How much stamina drags on speed. A fresh staffer works at floor+span; an exhausted one at
   * floor. Never zero — tired people are slow, not stopped.
   */
  staminaSpeedFloor: 0.55,
  staminaSpeedSpan: 0.45,
  /** Nobody ever works slower than this, whatever the modifiers say. */
  minWorkRate: 0.1,

  /** Errors (§4.6). */
  baseErrorRate: 0.018,
  fatigueErrorWeight: 1.6,
  rushErrorWeight: 1.1,

  /** Morale (§10.2) moves slowly on purpose — it is a consequence, not a dial. */
  moraleStart: 0.7,
  moraleQuitThreshold: 0.22,
  moraleNoticeDays: 3,
} as const;

/** The roster names new hires are drawn from. Player can rename. */
export const staffNames: readonly string[] = [
  "Archie T.", "Deano", "Kez", "Sammy O.", "Dougie B.", "Macca", "Freya", "Bazza",
  "Nic", "Tam", "Sione", "Renee", "Hoss", "Priya", "Jonesy", "Mel", "Rafa", "Dot",
];

export type StationSkill = Partial<Record<StationType, number>>;
