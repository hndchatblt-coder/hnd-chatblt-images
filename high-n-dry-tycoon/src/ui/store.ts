/**
 * UI state (§13). Sim state lives in the sim and is mirrored out per frame — this holds only what
 * the chrome needs, never anything the simulation depends on.
 */
import { create } from "zustand";

export interface Hud {
  cash: number;
  reputation: number;
  day: number;
  hour: number;
  covers: number;
  balked: number;
  openOrders: number;
  meanWaitMinutes: number;
  labourPct: number;
  cogsPct: number;
  wastePct: number;
  speed: number;
  paused: boolean;
  drawerOpen: boolean;
}

export const useHud = create<Hud & {
  set: (patch: Partial<Hud>) => void;
  toggleDrawer: () => void;
  setSpeed: (speed: number) => void;
  togglePause: () => void;
}>((set) => ({
  cash: 0,
  reputation: 0,
  day: 0,
  hour: 0,
  covers: 0,
  balked: 0,
  openOrders: 0,
  meanWaitMinutes: 0,
  labourPct: 0,
  cogsPct: 0,
  wastePct: 0,
  speed: 1,
  paused: false,
  drawerOpen: false,
  set: (patch) => set(patch),
  toggleDrawer: () => set((s) => ({ drawerOpen: !s.drawerOpen })),
  setSpeed: (speed) => set({ speed }),
  togglePause: () => set((s) => ({ paused: !s.paused })),
}));
