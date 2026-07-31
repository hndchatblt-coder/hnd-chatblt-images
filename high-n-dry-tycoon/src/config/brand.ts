/**
 * Palette (§11.3).
 *
 * **These are derived, not official.** I could not reach high-n-dry.com.au from this environment
 * (the outbound proxy 403s the domain), so rather than block M4 I've built a palette from what
 * the brand demonstrably is: a flame-grill burger bar whose own tagline is "GOOD TIMES, BETTER
 * BURGERS!!!", Southern-inspired, beers, dogs welcome. Loud, warm, unfussy.
 *
 * Swapping in the real hexes is a change to this file and nothing else — every shape in
 * `src/render` reads from here and the ShapeRegistry rebuilds its textures on boot.
 *
 * The direction the brief asks for (§11.3) is a **warm sodium-lamp interior against a cool
 * blue-grey street**, so the shop reads as a warm box in a cold city and the light spilling from
 * the door at the bottom of the screen is literally where the customers come from. Everything
 * below serves that: the interior ramp runs warm, the exterior ramp runs cold, and the only
 * saturated colours belong to food, signage and tickets.
 */
export const brand = {
  /* --------------------------------------------------------------- identity */
  /** House red. Signage, awning, trays, the apron. TODO(ben): confirm against the real brand. */
  red: "#D0342B",
  redDark: "#9E2018",
  /** Heat-lamp amber. The accent, and the actual light source over the pass. */
  lamp: "#FFA51F",
  lampHot: "#FFD37A",
  /** Near-black. Type on light, char, grill bars, the gaps between things. */
  char: "#1A1614",
  /** Menus, tickets, paper. */
  paper: "#F4EEE1",

  /* -------------------------------------------------------------- interior */
  /** Cream subway tile — the back-of-house ground. */
  tile: "#E6DAC4",
  grout: "#C7B79C",
  /** Stainless: bench tops, appliances. An accent, never the ground. */
  steel: "#B3B9BF",
  steelDark: "#7C848C",
  /** Timber counter front, and the warm mass customers stand at. */
  timber: "#8A5A32",
  /** Quarry-tile floor on the customer side. Warm-dim, never blue-dim. */
  floor: "#54423A",
  floorDeep: "#2E2420",

  /* -------------------------------------------------------------- exterior */
  /** The cold city outside, so the shop reads as a warm box in it. */
  street: "#28313C",
  streetLight: "#3B4756",
  night: "#1A2029",

  /* ------------------------------------------------------------------ food */
  /** The raw → seared → perfect → burnt ramp. Interpolated, never four sprites. */
  pattyRaw: "#B4645A",
  pattySeared: "#8A4A28",
  pattyPerfect: "#6B3A1C",
  pattyBurnt: "#2E1C10",
  bun: "#D9A45E",
  cheese: "#F0B93C",
  lettuce: "#6E9B47",
  chip: "#E8B93F",

  /* --------------------------------------------------------------- tickets */
  /** Ticket age: white → amber → red. The single most important glanceable signal (§11.4). */
  ticketFresh: "#F4EEE1",
  ticketWarm: "#F0B93C",
  ticketLate: "#D0342B",

  /* ---------------------------------------------------------------- states */
  good: "#6FBF73",
  warn: "#FFA51F",
  bad: "#D0342B",
} as const;

/**
 * Typefaces (§11.3). Heavy condensed display for signage and headline numbers — burger shops are
 * sign-first businesses — a clean geometric grotesque for UI body, and monospace tabular for all
 * money and metrics so columns of dollars scan instantly.
 */
export const type = {
  display: '"Haettenschweiler", "Arial Narrow", "Oswald", system-ui, sans-serif',
  body: '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  mono: 'ui-monospace, "SF Mono", "SFMono-Regular", Menlo, Consolas, monospace',
} as const;

/** Linear interpolation between two hex colours. The whole reason code-drawn art was chosen. */
export const mix = (a: string, b: string, t: number): string => {
  const parse = (h: string): [number, number, number] => [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ];
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const k = Math.max(0, Math.min(1, t));
  const to = (x: number, y: number): string =>
    Math.round(x + (y - x) * k)
      .toString(16)
      .padStart(2, "0");
  return `#${to(ar, br)}${to(ag, bg)}${to(ab, bb)}`;
};

/**
 * Where a patty is on the ramp, 0 = raw to 1 = ruined. Continuous, because every state in this
 * simulation is continuous — this is the argument for code-drawn art in one function.
 */
export const pattyColour = (doneness: number): string => {
  if (doneness < 0.34) return mix(brand.pattyRaw, brand.pattySeared, doneness / 0.34);
  if (doneness < 0.7) return mix(brand.pattySeared, brand.pattyPerfect, (doneness - 0.34) / 0.36);
  return mix(brand.pattyPerfect, brand.pattyBurnt, (doneness - 0.7) / 0.3);
};

/** Ticket colour by age against its target. White → amber → red (§11.4). */
export const ticketColour = (ageFraction: number): string =>
  ageFraction < 0.5
    ? mix(brand.ticketFresh, brand.ticketWarm, ageFraction / 0.5)
    : mix(brand.ticketWarm, brand.ticketLate, (ageFraction - 0.5) / 0.5);
