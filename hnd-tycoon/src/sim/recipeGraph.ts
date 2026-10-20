/**
 * A recipe is a DAG of steps, not a timer. DESIGN.md §7.
 *
 * This module turns the declarative recipe in config into something the
 * kitchen can schedule against: a validated graph with a topological order, a
 * depth for every step, and a lookup from item to the step that produces it.
 *
 * Two orderings come out of it and they are NOT the same:
 *
 *   topological — dependencies before dependents. Used to prove correctness:
 *                 a step can never be worked before the steps it depends on.
 *   pull        — SHALLOWEST first, nearest the customer. Used to schedule.
 *
 * The second one matters more than it looks. A scheduler that works the
 * deepest unmet need first makes patties forever and never plates anything;
 * the line has to drain toward the pass. §7.1.
 *
 * Pure and deterministic: no clock, no RNG, no state.
 */
import type { Recipe, Step } from '@/config/recipes';
import type { ItemId, RecipeId } from './types';

const NONE = 0;
const ONE = 1;

export interface RecipeGraph {
  readonly recipeId: RecipeId;
  readonly steps: ReadonlyMap<string, Step>;
  /** Dependencies before dependents. */
  readonly topological: readonly Step[];
  /** Nearest the customer first. This is the scheduling order. */
  readonly pull: readonly Step[];
  /** 0 for the step that produces the finished item; +1 per level upstream. */
  readonly depth: ReadonlyMap<string, number>;
  /** Which step produces a given item. One producer per item, enforced. */
  readonly producerOf: ReadonlyMap<ItemId, Step>;
  /**
   * Which step consumes a given item — where a staffer carries it next.
   * Absent for the finished item, which is carried nowhere: the customer
   * collects it from the pass. §7.1, "carry output onward".
   */
  readonly consumerOf: ReadonlyMap<ItemId, Step>;
  /** The item a customer is handed. The single sink of the graph. */
  readonly finishedItem: ItemId;
  /** Items a step consumes, one per unit produced: its dependencies' outputs. */
  inputsOf(stepId: string): readonly ItemId[];
}

export class RecipeGraphError extends Error {}

/**
 * Builds and validates the graph. Throws rather than returning a broken graph:
 * a malformed recipe is a content bug and must fail loudly at load, not
 * silently produce a kitchen that never plates anything.
 */
export function buildRecipeGraph(recipe: Recipe): RecipeGraph {
  const steps = new Map<string, Step>();
  for (const step of recipe.steps) {
    if (steps.has(step.id)) {
      throw new RecipeGraphError(`${recipe.id}: duplicate step id "${step.id}"`);
    }
    steps.set(step.id, step);
  }

  const producerOf = new Map<ItemId, Step>();
  for (const step of recipe.steps) {
    if (producerOf.has(step.output)) {
      throw new RecipeGraphError(
        `${recipe.id}: item "${step.output}" produced by two steps — one producer per item`,
      );
    }
    producerOf.set(step.output, step);
  }

  for (const step of recipe.steps) {
    for (const dep of step.dependsOn) {
      if (!steps.has(dep)) {
        throw new RecipeGraphError(`${recipe.id}: step "${step.id}" depends on unknown "${dep}"`);
      }
    }
  }

  // Kahn's algorithm. Also the cycle check — if anything is left over when the
  // queue empties, the leftovers are in a cycle.
  const indegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const step of recipe.steps) {
    indegree.set(step.id, step.dependsOn.length);
    for (const dep of step.dependsOn) {
      const list = dependents.get(dep) ?? [];
      list.push(step.id);
      dependents.set(dep, list);
    }
  }

  const queue = recipe.steps.filter((s) => s.dependsOn.length === NONE).map((s) => s.id);
  const topological: Step[] = [];
  while (queue.length > NONE) {
    const id = queue.shift() as string;
    topological.push(steps.get(id) as Step);
    for (const next of dependents.get(id) ?? []) {
      const remaining = (indegree.get(next) ?? NONE) - ONE;
      indegree.set(next, remaining);
      if (remaining === NONE) queue.push(next);
    }
  }
  if (topological.length !== recipe.steps.length) {
    throw new RecipeGraphError(`${recipe.id}: dependency cycle`);
  }

  // The finished item is the one nothing else consumes. Exactly one, or the
  // recipe has no single thing to hand the customer.
  const consumed = new Set<string>();
  for (const step of recipe.steps) for (const dep of step.dependsOn) consumed.add(dep);
  const sinks = recipe.steps.filter((s) => !consumed.has(s.id));
  if (sinks.length !== ONE) {
    throw new RecipeGraphError(
      `${recipe.id}: expected exactly one finished item, found ${sinks.length}`,
    );
  }
  const sink = sinks[NONE] as Step;

  // Depth measured DOWN from the customer: the sink is 0, its dependencies 1,
  // and so on. Walking the topological order backwards guarantees every
  // dependent is already assigned when a step is reached.
  const depth = new Map<string, number>();
  depth.set(sink.id, NONE);
  for (let i = topological.length - ONE; i >= NONE; i -= ONE) {
    const step = topological[i] as Step;
    const own = depth.get(step.id) ?? NONE;
    for (const dep of step.dependsOn) {
      depth.set(dep, Math.max(depth.get(dep) ?? NONE, own + ONE));
    }
  }

  const pull = [...recipe.steps].sort((a, b) => {
    const da = depth.get(a.id) ?? NONE;
    const db = depth.get(b.id) ?? NONE;
    // Ties broken by step id so the schedule is deterministic regardless of
    // how the recipe happens to be written in config.
    return da === db ? a.id.localeCompare(b.id) : da - db;
  });

  const inputs = new Map<string, ItemId[]>();
  const consumerOf = new Map<ItemId, Step>();
  for (const step of recipe.steps) {
    const items = step.dependsOn.map((dep) => (steps.get(dep) as Step).output);
    inputs.set(step.id, items);
    for (const item of items) consumerOf.set(item, step);
  }

  return {
    recipeId: recipe.id,
    steps,
    topological,
    pull,
    depth,
    producerOf,
    consumerOf,
    finishedItem: sink.output,
    inputsOf: (stepId) => inputs.get(stepId) ?? [],
  };
}

/** Builds every graph once at load. A content bug fails here, not mid-service. */
export function buildAllGraphs(
  recipes: Readonly<Record<string, Recipe>>,
): ReadonlyMap<RecipeId, RecipeGraph> {
  const out = new Map<RecipeId, RecipeGraph>();
  for (const recipe of Object.values(recipes)) out.set(recipe.id, buildRecipeGraph(recipe));
  return out;
}
