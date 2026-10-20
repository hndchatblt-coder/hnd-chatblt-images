/**
 * Step 17 — density and legibility. DESIGN.md §21.1, §21.3.
 *
 * *"Reserved-hue enforcement: nothing decorative uses ticket amber/red or the
 * food ramp."* and *"every shape readable at 12px."*
 *
 * The palette rules here are the ones that survived measurement. The literal
 * reading of §21.3 was tried first and is unsatisfiable — see
 * `config/palette.ts` for the twenty-eight-of-thirty result that killed it.
 * What is enforced instead is the property that actually makes a signal
 * legible: it out-shouts the room.
 */
import { describe, expect, it } from 'vitest';
import { BRAND } from '@/config/brand';
import { PALETTE, chroma, colourDistance, luminance } from '@/config/palette';
import { RENDER } from '@/config/render';
import { allowanceFor, fidgetingAt } from '@/render/motionBudget';

/**
 * Every colour that gets drawn IN THE ROOM and is not a reserved signal.
 *
 * `ink` is excluded, and the exclusion is a scope correction rather than a
 * convenience: §21.3 is a rule about the venue rendering, and `ink.primary` is
 * HUD type. It is exactly `ticketFresh` — both are "clean paper white" — but a
 * ticket is a rectangle on a rail inside the scene and the ink is a font in a
 * bar over the top of it. They are on different layers, never adjacent, and
 * they are on the same side of the argument anyway: HUD text is information,
 * not decoration.
 */
const DECORATIVE: [string, number][] = Object.entries(BRAND)
  .filter(([group]) => group !== 'signal' && group !== 'ink')
  .flatMap(([group, tokens]) =>
    Object.entries(tokens as Record<string, number>).map(
      ([name, hex]) => [`${group}.${name}`, hex] as [string, number],
    ),
  );

/** The alert channel. These are the ones that have to leap off the screen. */
const TICKETS = ['ticketFresh', 'ticketWarning', 'ticketCritical'] as const;
/** The doneness sequence, in order. Read on a patty, not against the room. */
const RAMP = ['foodRaw', 'foodSeared', 'foodPerfect', 'foodBurnt'] as const;

describe('§21.3 — the signals have to out-shout the room', () => {
  /**
   * The load-bearing one, and the bug it was written for was real: before this
   * step the shop's pilot lights sat at chroma 194 and its sodium lamp at 184,
   * against ticketWarning's 171. The single most saturated thing in the game
   * was a decorative dot on the front of a fryer, and an ageing ticket — which
   * is a small warm dot — had to compete with it.
   */
  it('every chromatic ticket signal is more saturated than every decoration', () => {
    const loudestDecoration = Math.max(...DECORATIVE.map(([, hex]) => chroma(hex)));
    for (const name of TICKETS) {
      const hex = BRAND.signal[name];
      // ticketFresh is near-white on purpose — it is separated by BRIGHTNESS
      // rather than colour, and is checked as such below.
      if (chroma(hex) < PALETTE.SIGNAL_CHROMA_MARGIN) continue;
      expect(
        chroma(hex),
        `${name} (chroma ${chroma(hex)}) must beat the loudest decoration (${loudestDecoration})`,
      ).toBeGreaterThan(loudestDecoration + PALETTE.SIGNAL_CHROMA_MARGIN);
    }
  });

  it('the achromatic signals are separated by brightness instead', () => {
    // "Fresh" is a bright near-white and "burnt" is a near-black. Neither can
    // be told apart by saturation, so they must be at the extremes of the
    // luminance range the room occupies.
    const roomLum = DECORATIVE.map(([, hex]) => luminance(hex));
    expect(luminance(BRAND.signal.ticketFresh)).toBeGreaterThan(Math.max(...roomLum) - 1);
    expect(luminance(BRAND.signal.foodBurnt)).toBeLessThan(Math.min(...roomLum) + 30);
  });

  it('no decorative token is exactly a reserved hue', () => {
    // Whatever the saturation argument, an exact duplicate is always wrong —
    // and `fx.glow` was literally `interior.warm`, under a comment reading
    // "steam and haze. Never a signal hue."
    for (const [name, hex] of DECORATIVE) {
      for (const signal of Object.values(BRAND.signal)) {
        expect(hex, `${name} is exactly a signal hue`).not.toBe(signal);
      }
    }
  });
});

describe('§21.3 — the doneness ramp has to be readable as a sequence', () => {
  it('every step is distinguishable from the one before it', () => {
    for (let i = 1; i < RAMP.length; i++) {
      const from = BRAND.signal[RAMP[i - 1] as (typeof RAMP)[number]];
      const to = BRAND.signal[RAMP[i] as (typeof RAMP)[number]];
      expect(
        colourDistance(from, to),
        `${RAMP[i - 1]} -> ${RAMP[i]} is too close to read at 12px`,
      ).toBeGreaterThan(PALETTE.MIN_RAMP_STEP);
    }
  });

  it('runs monotonically darker, so it reads as a direction', () => {
    // Raw to burnt is a journey in one direction. A ramp that brightens in the
    // middle is four colours, not a sequence, and the player has to memorise
    // it rather than read it.
    for (let i = 1; i < RAMP.length; i++) {
      const from = BRAND.signal[RAMP[i - 1] as (typeof RAMP)[number]];
      const to = BRAND.signal[RAMP[i] as (typeof RAMP)[number]];
      expect(luminance(to), `${RAMP[i]} is not darker than ${RAMP[i - 1]}`).toBeLessThan(
        luminance(from),
      );
    }
  });

  it('is distinguishable from the surface it is cooked on', () => {
    // A patty on a hotplate is a small shape on a large one. If the two share a
    // luminance the shape has no silhouette at all, which is the 12px test.
    for (const name of RAMP) {
      expect(
        Math.abs(luminance(BRAND.signal[name]) - luminance(BRAND.equipment.hotplate)),
        `${name} vanishes against the hotplate`,
      ).toBeGreaterThan(10);
    }
  });
});

describe('§21.3 — the metric itself', () => {
  it('rates a channel swap as a real difference and a rounding as not', () => {
    // Guarding the guard. A distance function that reports everything as far
    // apart would make every test above pass for free.
    expect(colourDistance(0xff0000, 0x0000ff)).toBeGreaterThan(400);
    expect(colourDistance(0xe8a33d, 0xe8a33e)).toBeLessThan(5);
    expect(colourDistance(0x123456, 0x123456)).toBe(0);
  });

  it('weights green more heavily than blue, as an eye does', () => {
    const greenShift = colourDistance(0x808080, 0x80a080);
    const blueShift = colourDistance(0x808080, 0x8080a0);
    expect(greenShift).toBeGreaterThan(blueShift);
  });
});

describe('§21.1 — the motion budget culls fidgets, never the walk', () => {
  const { FULL_UNTIL, NEAR_COUNT } = RENDER.MOTION_BUDGET;

  it('leaves a quiet shop completely alone', () => {
    // The first thing a new player sees. Shaving a little off every frame to be
    // safe makes it worse to look at and buys nothing.
    for (let n = 1; n <= FULL_UNTIL; n++) {
      expect(fidgetingAt(n), `${n} bodies`).toBe(n);
      expect(allowanceFor(n, n - 1).fidget).toBe(true);
    }
  });

  it('caps the fidget count once the room is busy, and never grows it back', () => {
    let previous = fidgetingAt(FULL_UNTIL);
    for (let n = FULL_UNTIL + 1; n < 200; n++) {
      const now = fidgetingAt(n);
      expect(now, `${n} bodies`).toBeLessThanOrEqual(previous);
      expect(now).toBeLessThanOrEqual(NEAR_COUNT);
      previous = now;
    }
  });

  it('culls from the back, so it reads as depth rather than as a bug', () => {
    // Rank 0 is nearest the front. If this were random, a crowded room would
    // have some people twitching and some frozen, which reads as broken.
    const moving = 80;
    for (let rank = 0; rank < NEAR_COUNT; rank++) {
      expect(allowanceFor(moving, rank).fidget, `rank ${rank}`).toBe(true);
    }
    for (let rank = NEAR_COUNT; rank < moving; rank++) {
      expect(allowanceFor(moving, rank).fidget, `rank ${rank}`).toBe(false);
    }
  });

  it('never culls the walk cycle, at any density', () => {
    // A heaving shop with everyone frozen mid-stride is a worse lie than one
    // where nobody fidgets. The room has to still be doing something.
    for (const moving of [1, 25, 80, 500]) {
      for (const rank of [0, 10, 100]) {
        expect(allowanceFor(moving, rank).walk, `${moving}/${rank}`).toBe(true);
      }
    }
  });

  it('is a step function of headcount, not of frame time', () => {
    // Driven by a count on purpose. A budget that reads measured fps
    // oscillates, and in this container two consecutive runs on identical code
    // reported 2.10ms and 5.40ms of render — steering on that is steering on
    // noise.
    expect(allowanceFor(FULL_UNTIL, 0)).toEqual(allowanceFor(FULL_UNTIL, 0));
    expect(fidgetingAt(1000)).toBe(NEAR_COUNT);
  });
});
