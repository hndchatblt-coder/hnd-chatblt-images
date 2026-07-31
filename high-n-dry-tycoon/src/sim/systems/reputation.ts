/**
 * Reputation (§4.8): a recency-weighted mean of the last N reviews, on a half-life.
 *
 * Weeks to build, days to destroy, days to repair. The half-life is what makes the way out of the
 * spiral "cut marketing and be disciplined for a week and a half" rather than a button.
 */
import { reviews as cfg } from "../../config/reviews.js";
import { time } from "../../config/time.js";
import type { World } from "../world.js";

export const recomputeReputation = (world: World): void => {
  const now = world.clock.elapsed;
  const halfLifeSeconds = cfg.halfLifeDays * time.hoursPerDay * time.secondsPerHour;

  // A new venue is not a blank slate, it is an unknown one — hence the prior.
  let weighted = cfg.priorStars * cfg.priorWeight;
  let weight = cfg.priorWeight;

  for (const review of world.reviews) {
    const age = now - review.at;
    // Half-life decay, written with LN2 so there is no bare constant in simulation code: this
    // is exactly 0.5 ^ (age / halfLife), which is what "half-life" means.
    const w = Math.exp((-Math.LN2 * age) / halfLifeSeconds);
    weighted += review.stars * w;
    weight += w;
  }

  world.reputation = weight > 0 ? weighted / weight : cfg.priorStars;
};

export const flushReviews = (world: World): void => {
  if (world.pendingReviews.length === 0) return;
  for (const r of world.pendingReviews) {
    world.reviews.push(r);
    world.day.reviews += 1;
  }
  world.pendingReviews.length = 0;
  if (world.reviews.length > cfg.windowSize) {
    world.reviews.splice(0, world.reviews.length - cfg.windowSize);
  }
  recomputeReputation(world);
};
