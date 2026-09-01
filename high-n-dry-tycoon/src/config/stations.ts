/**
 * Stations (§4.5). Footprints and service points matter from M1 — M0 only needs capacity and
 * which steps a station can run, but the shape data lives here from the start so the spatial
 * milestone has nothing to invent.
 */
import type { StationType } from "./recipes.js";

export type ServicePoint = "gas" | "extraction" | "plumbing" | "power";

export interface StationDef {
  type: StationType;
  name: string;
  /** Tiles, width x depth. */
  footprint: { w: number; d: number };
  requires: ServicePoint[];
  cost: number;
  /** How many steps this station can run at once. */
  slots: number;
  /** Whether it burns utilities while running. */
  drawsPower: boolean;
}

export const stations: StationDef[] = [
  { type: "grill", name: "Flat-top grill", footprint: { w: 2, d: 1 }, requires: ["gas", "extraction"], cost: 4200, slots: 1, drawsPower: true },
  { type: "fryer", name: "Fryer", footprint: { w: 1, d: 1 }, requires: ["gas", "extraction"], cost: 2600, slots: 1, drawsPower: true },
  { type: "prep", name: "Prep bench", footprint: { w: 3, d: 1 }, requires: ["plumbing"], cost: 1100, slots: 1, drawsPower: false },
  { type: "toast", name: "Bun toaster", footprint: { w: 1, d: 1 }, requires: ["power"], cost: 900, slots: 1, drawsPower: true },
  { type: "assembly", name: "Assembly bench", footprint: { w: 2, d: 1 }, requires: [], cost: 800, slots: 1, drawsPower: false },
  { type: "pass", name: "The pass", footprint: { w: 1, d: 2 }, requires: ["power"], cost: 1400, slots: 1, drawsPower: true },
  { type: "drinks", name: "Drinks fridge", footprint: { w: 1, d: 1 }, requires: ["power"], cost: 1200, slots: 1, drawsPower: true },
];

export const stationByType = new Map(stations.map((s) => [s.type, s]));

/** Equipment sells back at this fraction (§5). */
export const resaleFraction = 0.6;
