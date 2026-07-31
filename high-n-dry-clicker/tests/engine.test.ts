import { describe, expect, it } from "vitest";
import { config, validateConfig } from "../src/engine/config.js";
import { derive, generatorCost } from "../src/engine/derive.js";
import {
  bestLayout,
  defaultLayout,
  EMPTY,
  normalizeLayout,
  scoreLayout,
  swapBays,
} from "../src/engine/layout.js";
import {
  buyGenerator,
  buyPerk,
  buyUpgrade,
  canSellBusiness,
  goodwillFor,
  pendingGoodwill,
  purchaseOptions,
  sellBusiness,
  settleOffline,
  tap,
  tapGolden,
  tick,
} from "../src/engine/engine.js";
import { createInitialState, totalGenerators } from "../src/engine/state.js";

const c = config;

describe("config", () => {
  it("validates", () => {
    expect(() => validateConfig()).not.toThrow();
  });

  it("has the content depth the brief requires", () => {
    const tiers = c.generators.list.length * c.generatorTiers.thresholds.length;
    expect(c.generators.list.length).toBe(12);
    expect(tiers + c.clickUpgrades.length + c.globalUpgrades.length).toBeGreaterThanOrEqual(60);
    expect(c.achievements.length).toBe(40);
  });
});

describe("tapping", () => {
  it("pays base cash on the first tap and counts a burger", () => {
    const s = createInitialState(1);
    const { earned } = tap(s);
    expect(earned).toBe(c.click.baseCash);
    expect(s.cash).toBe(c.click.baseCash);
    expect(s.burgersSold).toBe(1);
    expect(s.taps).toBe(1);
  });

  it("click power rises with click upgrades", () => {
    const s = createInitialState(1);
    const before = derive(s).clickPower;
    s.cash = c.clickUpgrades[0]!.cost;
    expect(buyUpgrade(s, c.clickUpgrades[0]!.id)).toBe(true);
    expect(derive(s).clickPower).toBeGreaterThan(before);
  });
});

describe("generators", () => {
  it("cost follows baseCost x growth^owned", () => {
    const s = createInitialState(1);
    const def = c.generators.list[0]!;
    expect(generatorCost(s, 0)).toBeCloseTo(def.baseCost, 9);
    s.generators[0] = 5;
    expect(generatorCost(s, 0)).toBeCloseTo(def.baseCost * Math.pow(c.generators.costGrowth, 5), 9);
  });

  it("bulk cost equals the sum of the singles", () => {
    const s = createInitialState(1);
    const def = c.generators.list[1]!;
    let summed = 0;
    for (let k = 0; k < 7; k += 1) summed += def.baseCost * Math.pow(c.generators.costGrowth, k);
    expect(generatorCost(s, 1, 7)).toBeCloseTo(summed, 6);
  });

  it("buying adds production and spends cash", () => {
    const s = createInitialState(1);
    s.cash = 1000;
    const before = derive(s).cps;
    expect(buyGenerator(s, 0)).toBe(true);
    expect(s.cash).toBeLessThan(1000);
    expect(derive(s).cps).toBeGreaterThan(before);
    expect(totalGenerators(s)).toBe(1);
  });

  it("refuses a purchase it cannot afford and changes nothing", () => {
    const s = createInitialState(1);
    const snapshot = JSON.stringify(s);
    expect(buyGenerator(s, 0)).toBe(false);
    expect(JSON.stringify(s)).toBe(snapshot);
  });
});

describe("upgrades", () => {
  it("tier upgrades only unlock at their owned threshold", () => {
    const s = createInitialState(1);
    const def = c.generators.list[0]!;
    const id = `tier:${def.id}:0`;
    s.cash = Number.MAX_SAFE_INTEGER;
    expect(buyUpgrade(s, id)).toBe(false);
    s.generators[0] = c.generatorTiers.thresholds[0]!;
    expect(buyUpgrade(s, id)).toBe(true);
    expect(buyUpgrade(s, id)).toBe(false); // no double-buy
  });

  it("a tier upgrade doubles exactly its own generator", () => {
    const s = createInitialState(1);
    s.generators[0] = c.generatorTiers.thresholds[0]!;
    s.generators[1] = 5;
    const before = derive(s);
    s.cash = Number.MAX_SAFE_INTEGER;
    buyUpgrade(s, `tier:${c.generators.list[0]!.id}:0`);
    const after = derive(s);
    expect(after.generatorCps[0]!).toBeCloseTo(before.generatorCps[0]! * c.generatorTiers.multiplier, 6);
    expect(after.generatorCps[1]!).toBeCloseTo(before.generatorCps[1]!, 6);
  });
});

describe("golden patty", () => {
  it("never removes progress, even from the health inspector", () => {
    const s = createInitialState(1);
    s.generators[2] = 20;
    s.cash = 5000;
    const cashBefore = s.cash;
    const inspector = c.golden.effects.find((e) => e.id === "inspector")!;
    s.golden.activeEffects.push({
      effectId: inspector.id,
      type: "productionMult",
      value: inspector.value!,
      endsAt: s.timeSeconds + inspector.seconds!,
    });
    const d = derive(s);
    expect(d.productionMult).toBeCloseTo(inspector.value!, 6);
    expect(d.cps).toBeGreaterThan(0); // slowed, never stopped
    expect(s.cash).toBe(cashBefore); // nothing taken
    tick(s, 1);
    expect(s.cash).toBeGreaterThan(cashBefore); // still earning
  });

  it("frenzy multiplies production while it lasts, then expires", () => {
    const s = createInitialState(1);
    s.generators[2] = 10;
    const plain = derive(s).cps;
    const frenzy = c.golden.effects.find((e) => e.id === "frenzy")!;
    s.golden.activeEffects.push({
      effectId: frenzy.id,
      type: "productionMult",
      value: frenzy.value!,
      endsAt: s.timeSeconds + frenzy.seconds!,
    });
    expect(derive(s).cps).toBeCloseTo(plain * frenzy.value!, 6);
    tick(s, frenzy.seconds! + 1);
    expect(derive(s).cps).toBeCloseTo(plain, 6);
  });

  it("tapping nothing returns null", () => {
    const s = createInitialState(1);
    s.golden.onScreen = null;
    expect(tapGolden(s)).toBeNull();
  });
});

describe("prestige", () => {
  it("goodwill rises with lifetime revenue", () => {
    expect(goodwillFor(c.prestige.minLifetimeRevenueToSell)).toBeGreaterThan(0);
    expect(goodwillFor(c.prestige.minLifetimeRevenueToSell * 100)).toBeGreaterThan(
      goodwillFor(c.prestige.minLifetimeRevenueToSell),
    );
  });

  it("cannot sell below the threshold", () => {
    const s = createInitialState(1);
    s.lifetimeRevenue = c.prestige.minLifetimeRevenueToSell / 2;
    expect(canSellBusiness(s)).toBe(false);
    expect(sellBusiness(s)).toBe(0);
  });

  it("selling keeps everything permanent and resets only the run", () => {
    const s = createInitialState(1);
    s.lifetimeRevenue = c.prestige.minLifetimeRevenueToSell * 10;
    s.generators[0] = 30;
    s.upgrades.push(c.globalUpgrades[0]!.id);
    s.achievements.push("ach-first");
    const expected = pendingGoodwill(s);

    const awarded = sellBusiness(s);
    expect(awarded).toBe(expected);
    expect(awarded).toBeGreaterThan(0);
    expect(s.goodwill).toBe(awarded);
    expect(s.prestigeCount).toBe(1);
    expect(totalGenerators(s)).toBe(0);
    expect(s.upgrades).toHaveLength(0);
    expect(s.achievements).toContain("ach-first"); // never taken away
    expect(s.lifetimeRevenue).toBe(c.prestige.minLifetimeRevenueToSell * 10); // never reset
    expect(s.runRevenue).toBe(0);
  });

  it("goodwill is granted once — selling again awards only the delta", () => {
    const s = createInitialState(1);
    s.lifetimeRevenue = c.prestige.minLifetimeRevenueToSell * 10;
    const first = sellBusiness(s);
    expect(pendingGoodwill(s)).toBe(0);
    expect(sellBusiness(s)).toBe(0);
    s.lifetimeRevenue *= 50;
    const second = sellBusiness(s);
    expect(second).toBeGreaterThan(0);
    expect(s.goodwill).toBe(first + second);
  });

  it("goodwill multiplies production", () => {
    const s = createInitialState(1);
    s.generators[1] = 10;
    const before = derive(s).cps;
    s.goodwill = 50;
    expect(derive(s).cps).toBeCloseTo(before * (1 + 50 * c.prestige.multiplierPerGoodwill), 6);
  });

  it("perks cost goodwill and apply", () => {
    const s = createInitialState(1);
    const perk = c.prestige.perks.find((p) => p.effect === "globalMult")!;
    s.goodwill = perk.cost;
    s.generators[1] = 10;
    const before = derive(s).cps;
    expect(buyPerk(s, perk.id)).toBe(true);
    expect(s.goodwill).toBe(0);
    expect(derive(s).cps).toBeGreaterThan(before);
    expect(buyPerk(s, perk.id)).toBe(false);
  });
});

describe("offline", () => {
  it("earns at the reduced rate and caps", () => {
    const s = createInitialState(1, 0);
    s.generators[2] = 50;
    const rate = derive(s).cps * c.offline.rateShare;
    const hours = c.offline.capHours + 4;
    const report = settleOffline(s, hours * c.time.secondsPerHour * c.time.msPerSecond);
    expect(report.cappedSeconds).toBe(c.offline.capHours * c.time.secondsPerHour);
    expect(report.earned).toBeCloseTo(rate * report.cappedSeconds, 4);
  });

  it("a backwards clock takes nothing", () => {
    const s = createInitialState(1, 10_000_000);
    s.generators[2] = 10;
    const before = s.cash;
    const report = settleOffline(s, 1000);
    expect(report.earned).toBe(0);
    expect(s.cash).toBe(before);
  });
});

describe("achievements", () => {
  it("unlock once and are never removed", () => {
    const s = createInitialState(1);
    tap(s);
    expect(s.achievements).toContain("ach-first");
    const count = s.achievements.length;
    tap(s);
    expect(s.achievements.filter((a) => a === "ach-first")).toHaveLength(1);
    expect(s.achievements.length).toBeGreaterThanOrEqual(count);
  });

  it("Understaffed needs cash with zero generators", () => {
    const s = createInitialState(1);
    const def = c.achievements.find((a) => a.id === "ach-understaffed")!;
    s.cash = def.trigger.value!;
    tap(s);
    expect(s.achievements).toContain("ach-understaffed");

    const other = createInitialState(2);
    other.cash = def.trigger.value!;
    buyGenerator(other, 0);
    tap(other);
    expect(other.achievements).not.toContain("ach-understaffed");
  });
});

describe("purchase options", () => {
  it("values click upgrades only for a player who taps", () => {
    const s = createInitialState(1);
    s.generators[1] = 10;
    const clickId = c.clickUpgrades.find((u) => u.effect === "clickMult")!.id;
    const idle = purchaseOptions(s, 0).find((o) => o.id === clickId)!;
    const active = purchaseOptions(s, 5).find((o) => o.id === clickId)!;
    expect(idle.gainPerSecond).toBeCloseTo(0, 9);
    expect(active.gainPerSecond).toBeGreaterThan(0);
  });
});

describe("determinism", () => {
  it("same seed and same inputs produce identical state", () => {
    const run = () => {
      const s = createInitialState(99);
      for (let i = 0; i < 200; i += 1) {
        tap(s);
        tick(s, 1);
      }
      return JSON.stringify(s);
    };
    expect(run()).toBe(run());
  });
});

describe("layout — the line", () => {
  const owned = config.generators.list.map((_, i) => (config.layout.placeable.includes(i) ? 10 : 0));
  const flat = config.generators.list.map(() => 1);

  it("never scores below baseline, whatever you do to it", () => {
    // Hard rule 4 in mechanical form: a bad line costs an unearned bonus, never output.
    const lines: unknown[] = [
      defaultLayout(),
      [],
      null,
      "nonsense",
      [99, -7, 2.5],
      [...config.layout.placeable].reverse(),
      bestLayout(owned, flat),
    ];
    for (const line of lines) {
      const score = scoreLayout(normalizeLayout(line), owned);
      expect(score.flowMult).toBeGreaterThanOrEqual(1);
      for (const m of score.generatorMults) expect(m).toBeGreaterThanOrEqual(1);
    }
  });

  it("normalises anything into a legal line", () => {
    const line = normalizeLayout([1, 1, 1]);
    expect(line).toHaveLength(config.layout.bays);
    // No station stands in two bays at once.
    const placed = line.filter((v) => v !== EMPTY);
    expect(new Set(placed).size).toBe(placed.length);
  });

  it("stays within the configured cap", () => {
    expect(scoreLayout(bestLayout(owned, flat), owned).total).toBeLessThanOrEqual(
      config.layout.maxMultiplier + 1e-9,
    );
  });

  it("puts the bonus where the money is", () => {
    // Two shops identical but for which station carries the income. AUTO should pair the earner.
    const heavyDelivery = config.generators.list.map((_, i) => (i === 4 ? 1000 : 1));
    const heavyFryer = config.generators.list.map((_, i) => (i === 1 ? 1000 : 1));
    const a = scoreLayout(bestLayout(owned, heavyDelivery), owned);
    const b = scoreLayout(bestLayout(owned, heavyFryer), owned);
    expect(a.generatorMults[4]).toBeGreaterThan(1);
    expect(b.generatorMults[1]).toBeGreaterThan(1);
  });

  it("swapping bays is reversible and does not lose a station", () => {
    const start = defaultLayout();
    const once = swapBays(start, 0, 2);
    expect(swapBays(once, 0, 2)).toEqual(start);
    expect(once.filter((v) => v !== EMPTY).length).toBe(start.filter((v) => v !== EMPTY).length);
  });

  it("an empty bench is exactly baseline, and any line is at least that", () => {
    // A7 in miniature. An empty bench must score precisely 1.0 — that is the output a save from
    // before layout existed produces — and no arrangement may come in under it.
    const empty = scoreLayout(normalizeLayout(null), owned);
    expect(empty.flowMult).toBe(1);
    expect(empty.generatorMults.every((m) => m === 1)).toBe(true);

    const state = createInitialState(7);
    state.generators = owned.slice();
    state.layout = normalizeLayout(null);
    const baseline = derive(state, config).cps;
    for (const line of [defaultLayout(), bestLayout(owned, flat), [...owned.keys()].reverse()]) {
      state.layout = normalizeLayout(line);
      expect(derive(state, config).cps).toBeGreaterThanOrEqual(baseline);
    }
  });
});
