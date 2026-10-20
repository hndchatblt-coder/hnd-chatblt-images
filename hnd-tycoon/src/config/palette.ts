/**
 * Reserved-hue enforcement. DESIGN.md §21.3, BUILD_PLAN step 17.
 *
 * *"Nothing decorative uses ticket amber/red or the food ramp."*
 *
 * The rule exists because the ticket rail and the doneness ramp are the two
 * places in this game where colour carries INFORMATION rather than mood. A
 * player learns "amber means that ticket is getting old" in about four seconds
 * and unlearns it the moment something amber turns out to be a lampshade.
 *
 * Enforcing it needs a distance, not an equality check. Two hexes that differ
 * by one digit are the same colour to anyone glancing at a phone in daylight,
 * and the violation this file was written to catch was exactly that shape:
 * `fx.glow` sat at `0xffb347` against `ticketWarning`'s `0xe8a33d`, thirty
 * units apart out of a possible four hundred and forty, under a comment that
 * said "never a signal hue".
 *
 * **The rule is about saturation, not hue, and that took a measurement to
 * work out.** The literal reading — "no decorative colour may resemble a
 * reserved one" — is unsatisfiable here: ticketFresh, ticketWarning,
 * ticketCritical and the four-step food ramp between them occupy the entire
 * warm half of the wheel, and the art direction (§22.2) is *"warm sodium-lamp
 * interior against a cool blue-grey street"*. Measured, twenty-eight of thirty
 * decorative tokens sat within 150 of some signal, which means the threshold
 * was wrong rather than the palette.
 *
 * What actually makes a signal legible is what makes hi-vis legible: it is not
 * a hue nothing else may use, it is a SATURATION nothing else in the
 * environment has. So the enforceable rule, split by the role the colour plays:
 *
 * 1. **Every ticket signal must out-saturate every decorative token.** The
 *    ticket rail is the alert channel and it has to shout louder than the
 *    wallpaper. Measured before the fix, it did not: the pilot light sat at
 *    chroma 194 and the sodium lamp at 184, against ticketWarning's 171. The
 *    thing meant to grab you was quieter than the room.
 * 2. **The food ramp must be internally separable**, because it is read as an
 *    ordered sequence on a small object rather than against the room.
 * 3. **No decorative token may be exactly a signal hue**, whatever the role.
 *
 * The distance metric is the "redmean" weighted Euclidean approximation — cheap, no
 * colour-space conversion, and markedly closer to human judgement than plain
 * RGB distance, which treats a shift in blue as mattering as much as the same
 * shift in green. It is not CIEDE2000 and does not need to be: the question is
 * "would somebody confuse these at a glance", not "can a spectrophotometer
 * tell them apart".
 */

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

const BYTE = 255;
const RED_SHIFT = 16;
const GREEN_SHIFT = 8;
const MASK = 0xff;
const TWO = 2;
const FOUR = 4;

export function rgbOf(hex: number): Rgb {
  return {
    r: (hex >> RED_SHIFT) & MASK,
    g: (hex >> GREEN_SHIFT) & MASK,
    b: hex & MASK,
  };
}

/**
 * How far apart two colours look, roughly 0..765.
 *
 * Redmean: weight the channels by where in the red range the pair sits, which
 * is the standard cheap correction for the fact that human vision resolves
 * green far better than blue and handles reds differently at either end.
 */
export function colourDistance(a: number, b: number): number {
  const x = rgbOf(a);
  const y = rgbOf(b);
  const meanRed = (x.r + y.r) / TWO;
  const dr = x.r - y.r;
  const dg = x.g - y.g;
  const db = x.b - y.b;
  const wr = TWO + meanRed / BYTE;
  const wg = FOUR;
  const wb = TWO + (BYTE - meanRed) / BYTE;
  return Math.sqrt(wr * dr * dr + wg * dg * dg + wb * db * db);
}

/** Colourfulness, 0..255. `max - min` over the channels — cheap HSV chroma. */
export function chroma(hex: number): number {
  const c = rgbOf(hex);
  return Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);
}

/** Perceived brightness, 0..255. Rec. 709 weights. */
export function luminance(hex: number): number {
  const c = rgbOf(hex);
  return R_LUM * c.r + G_LUM * c.g + B_LUM * c.b;
}

const R_LUM = 0.2126;
const G_LUM = 0.7152;
const B_LUM = 0.0722;

export const PALETTE = {
  /**
   * How far a decorative colour must sit from every reserved signal hue.
   *
   * // PROVISIONAL, but not arbitrary. Calibrated against the pairs actually in
   * the palette: the sodium lamp and ticket amber measured 61 apart and were
   * plainly confusable on a screenshot; the cool machine housing and ticket red
   * measured 340 and are obviously different things. 150 sits between them with
   * room either side, and it is the number the test uses, so moving it is a
   * deliberate act with a diff rather than a slow drift.
   */
  MIN_SIGNAL_DISTANCE: 150,
  /**
   * How much more colourful a ticket signal must be than the most colourful
   * decorative token. Not a large margin — the point is an ordering that holds,
   * not a gulf.
   */
  SIGNAL_CHROMA_MARGIN: 25,
  /**
   * And how far apart two SIGNALS must be from each other, which is a stricter
   * job: the doneness ramp is read as an ordered sequence, so neighbouring
   * steps have to be told apart at 12px by someone who is not looking hard.
   */
  MIN_RAMP_STEP: 60,
} as const;
