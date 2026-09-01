/**
 * Save and load, versioned (§13).
 *
 * The world holds a Map and an Rng, neither of which survives `JSON.stringify` intact, so the
 * shape is converted explicitly rather than hoping for the best. A save that silently lost the
 * RNG position would fork the sequence on reload, and determinism is what the whole architecture
 * rests on — so the save records how many numbers have been drawn and replays exactly that many.
 */
import { Rng } from "../sim/rng.js";
import type { World } from "../sim/world.js";

export const SCHEMA_VERSION = 1;

export const serialize = (world: World): string => {
  const { rng, stock, ...rest } = world;
  void rng;
  return JSON.stringify({
    version: SCHEMA_VERSION,
    seed: world.seed,
    rngCalls: world.rngCalls,
    world: { ...rest, stock: [...stock.entries()] },
  });
};

type Migration = (save: Record<string, unknown>) => Record<string, unknown>;
/** Empty today — v1 is the first format — but the mechanism ships now so v1 is never orphaned. */
const migrations: Record<number, Migration> = {};

export const deserialize = (text: string): World | null => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;

  let save = parsed as Record<string, unknown>;
  let version = typeof save.version === "number" ? save.version : 0;
  while (version < SCHEMA_VERSION) {
    const migrate = migrations[version];
    if (!migrate) break;
    save = migrate(save);
    version += 1;
  }

  const body = save.world as Record<string, unknown> | undefined;
  if (!body || typeof body !== "object") return null;

  const rng = new Rng(String(save.seed ?? "0"));
  const calls = typeof save.rngCalls === "number" ? save.rngCalls : 0;
  for (let i = 0; i < calls; i += 1) rng.next();

  return {
    ...(body as unknown as World),
    rng,
    stock: new Map((body.stock as [string, never][]) ?? []),
  };
};
