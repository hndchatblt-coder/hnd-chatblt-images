/**
 * Who walks in, and who takes one look at the queue and keeps walking (§4.2, §4.3).
 *
 * Balking is the player's early warning system. It moves before reputation does, which is the
 * whole reason it is a headline stat: by the time your stars have dropped you have already been
 * over-marketing for days.
 */
import { basket, recipeById } from "../../config/recipes.js";
import { demand } from "../../config/demand.js";
import { dtGameSeconds, time } from "../../config/time.js";
import type { VenueDef } from "../../config/venues.js";
import { dayOfWeek, hourOfDay } from "../clock.js";
import type { World } from "../world.js";

export const reputationMultiplier = (stars: number): number => {
  const { floor, span, exponent, min, max } = demand.reputation;
  const clamped = Math.min(max, Math.max(min, stars));
  return floor + span * Math.pow(clamped / max, exponent);
};

/** What a customer thinks is a fair price at this reputation. Charging above it costs you. */
export const fairPrice = (stars: number): number => {
  const { fairPriceAtOneStar: lo, fairPriceAtFiveStars: hi } = demand.price;
  const t = (Math.min(5, Math.max(1, stars)) - 1) / 4;
  return lo + (hi - lo) * t;
};

export const priceResistance = (stars: number, price: number): number => {
  const ratio = price / fairPrice(stars) - 1;
  return Math.min(demand.price.maxResistance, Math.max(0, ratio * demand.price.elasticity));
};

/** Customers per game hour right now, before Poisson sampling. */
export const demandRate = (world: World, venue: VenueDef): number => {
  const hour = Math.floor(hourOfDay(world.clock)) % time.hoursPerDay;
  const raw = demand.daypart[hour] ?? 0;
  if (raw <= 0) return 0;

  // A venue skews the shape of its own day: Rosebery is lunch, Neutral Bay is dinner.
  const skew = hour < 16 ? venue.daypartSkew.lunch : venue.daypartSkew.dinner;
  const dow = demand.dayOfWeek[dayOfWeek(world.clock)] ?? 1;
  const avgPrice = world.menuPrice.cheeseburger ?? 0;

  return (
    demand.baseFootTraffic *
    venue.footTrafficMultiplier *
    raw *
    skew *
    dow *
    reputationMultiplier(world.reputation) *
    (1 + world.marketingAwareness) *
    (1 - priceResistance(world.reputation, avgPrice))
  );
};

/**
 * What a customer estimates the wait to be, from what they can actually see: the queue. They
 * cannot see your kitchen, so this is deliberately naive — it is the same information a real
 * person standing at the door has.
 */
const estimatedWaitMinutes = (world: World): number => {
  const ahead = world.customers.filter((c) => c.state === "queued" || c.state === "waiting").length;
  return (ahead * world.rollingServiceSeconds) / 60;
};

export const stepArrivals = (world: World, venue: VenueDef): void => {
  const perHour = demandRate(world, venue);
  if (perHour <= 0) return;

  const lambda = (perHour * dtGameSeconds) / time.secondsPerHour;
  const count = world.rng.poisson(lambda);

  for (let i = 0; i < count; i += 1) {
    const patience =
      demand.balk.patienceMinutes *
      venue.patienceMultiplier *
      world.rng.range(demand.balk.patienceVariance.min, demand.balk.patienceVariance.max);

    const estimate = estimatedWaitMinutes(world);
    const over = estimate - patience;
    const pBalk = Math.min(
      demand.balk.maxProbability,
      Math.max(0, over / demand.balk.patienceWindowMinutes),
    );

    if (world.rng.chance(pBalk)) {
      world.day.balked += 1;
      // A walkout occasionally writes it up. Rare, but it is the first thing to move.
      if (world.rng.chance(demand.balk.reviewChance)) {
        world.pendingReviews.push({
          at: world.clock.elapsed,
          stars: demand.balk.reviewStars,
          reason: "walked out, too busy",
        });
      }
      continue;
    }

    const wants: string[] = ["cheeseburger"];
    if (world.rng.chance(basket.chipsAttachRate)) wants.push("chips");
    // Anything unknown to the menu is a config error, not something to paper over at runtime.
    for (const id of wants) {
      if (!recipeById.has(id)) throw new Error(`unknown recipe in basket: ${id}`);
    }

    world.customers.push({
      id: world.nextCustomerId++,
      arrivedAt: world.clock.elapsed,
      state: "queued",
      basket: wants,
      orderId: null,
      patienceMinutes: patience,
    });
    world.day.covers += 1;
  }
};
