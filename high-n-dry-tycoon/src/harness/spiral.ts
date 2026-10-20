/**
 * The M3 gate (§15): "`bot:naive` demonstrably spirals and demonstrably recovers when switched to
 * balanced. Ship the chart."
 *
 * This is the load-bearing experiment for §3 — the punishment spiral has to be *emergent*, and
 * the way out has to be discipline over about 8-10 trading days rather than a button.
 */
import { botById } from "./bots.js";
import { runSessions } from "./session.js";
import { createWorld, type World } from "../sim/world.js";

export interface SpiralPoint {
  day: number;
  reputation: number;
  balkRate: number;
  meanWaitMinutes: number;
  cash: number;
}

const sample = (world: World, day: number): SpiralPoint => {
  const recent = world.history.slice(-3);
  const served = recent.reduce((a, d) => a + d.ordersCompleted, 0);
  const walked = recent.reduce((a, d) => a + d.covers + d.balked, 0);
  return {
    day,
    reputation: world.reputation,
    balkRate: walked > 0 ? recent.reduce((a, d) => a + d.balked, 0) / walked : 0,
    meanWaitMinutes: served > 0 ? recent.reduce((a, d) => a + d.waitSecondsTotal, 0) / served / 60 : 0,
    cash: world.cash,
  };
};

/**
 * Runs `naiveDays` as naive, then switches to balanced for `recoveryDays`, sampling daily.
 * The switch is the whole experiment: the same shop, the same seed, one change of policy.
 */
export const spiralAndRecover = (
  seed: string,
  naiveDays: number,
  recoveryDays: number,
  staffCount = 2,
): { points: SpiralPoint[]; switchDay: number } => {
  const naive = botById.get("naive");
  const balanced = botById.get("balanced");
  if (!naive || !balanced) throw new Error("bots missing");

  const world = createWorld({ seed, staffCount });
  const points: SpiralPoint[] = [];

  for (let day = 0; day < naiveDays; day += 1) {
    runSessions(world, naive, 1);
    points.push(sample(world, day + 1));
  }
  for (let day = 0; day < recoveryDays; day += 1) {
    runSessions(world, balanced, 1);
    points.push(sample(world, naiveDays + day + 1));
  }

  return { points, switchDay: naiveDays };
};

/** A sparkline of reputation, because a chart in a terminal is still a chart. */
export const chart = (points: SpiralPoint[], switchDay: number): string => {
  const blocks = "▁▂▃▄▅▆▇█";
  const min = 1;
  const max = 5;
  const line = points
    .map((p) => {
      const t = (p.reputation - min) / (max - min);
      const i = Math.max(0, Math.min(blocks.length - 1, Math.round(t * (blocks.length - 1))));
      return blocks[i];
    })
    .join("");
  const marker = " ".repeat(Math.max(0, switchDay - 1)) + "^";
  return [
    `  stars 1-5 over ${points.length} days`,
    `  ${line}`,
    `  ${marker} switched to balanced here`,
  ].join("\n");
};
