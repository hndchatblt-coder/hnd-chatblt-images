/**
 * Incidents (§4.10). They exist to give the player a reason to open the app and a reason to keep
 * a cash buffer.
 *
 * **Hard rule: incidents degrade, they never destroy, and they never require a response inside a
 * time window.** An unattended incident just costs more the longer it runs. A player who opens
 * the app twice a day should feel clever, not rescued.
 */
import type { StationType } from "./recipes.js";

export interface IncidentDef {
  id: string;
  name: string;
  line: string;
  weight: number;
  /** Takes a station offline until the callout is paid. */
  disablesStation?: StationType;
  /** Cost to make it go away. */
  calloutCost?: number;
  /** Multiplies production while it runs. Never zero — degrade, never destroy. */
  productionMult?: number;
  /** Bins this share of held stock, once. */
  spoilShare?: number;
  /** Caps reputation until remedied. */
  reputationCap?: number;
  /** Game hours it runs if left alone. */
  hours: number;
}

export const incidentConfig = {
  /** Roughly one every 2-3 game days. */
  meanDaysBetween: 2.5,
  /** Nothing happens in the first few days — let the player find their feet. */
  graceDays: 3,
  /** An unattended incident costs this much more per game day it runs. */
  neglectCostPerDay: 55,
} as const;

export const incidents: IncidentDef[] = [
  {
    id: "fryer-thermostat",
    name: "Fryer thermostat",
    line: "The fryer is reading 40 degrees hotter than it is. Nobody trusts it.",
    weight: 22,
    disablesStation: "fryer",
    calloutCost: 340,
    hours: 8,
  },
  {
    id: "sickie",
    name: "Someone's crook",
    line: "Text at 6am. Three words. One of them was 'sorry'.",
    weight: 26,
    productionMult: 0.7,
    hours: 11,
  },
  {
    id: "coolroom",
    name: "Cool room drifted",
    line: "Door wasn't shut properly. It was 11 degrees in there all night.",
    weight: 14,
    spoilShare: 0.6,
    hours: 1,
  },
  {
    id: "short-picked",
    name: "Short-picked delivery",
    line: "Invoice says twelve. There are seven. The driver has left.",
    weight: 16,
    productionMult: 0.85,
    hours: 6,
  },
  {
    id: "inspector",
    name: "Health inspector",
    line: "She has a clipboard and she is looking at the grease trap.",
    weight: 9,
    reputationCap: 3.5,
    calloutCost: 220,
    hours: 24,
  },
  {
    id: "gas-bottle",
    name: "Gas bottle ran out",
    line: "Mid-Saturday. Of course it was mid-Saturday.",
    weight: 13,
    disablesStation: "grill",
    calloutCost: 120,
    hours: 3,
  },
];
