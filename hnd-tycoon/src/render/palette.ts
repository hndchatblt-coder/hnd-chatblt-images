/**
 * Colour as information. DESIGN.md §21.3, §22.2.
 *
 * **Every state here is continuous**, which is why raw → seared → perfect →
 * burnt is an interpolation rather than four sprite frames. It is also why
 * this module has no PixiJS in it: the ramp is arithmetic, and arithmetic
 * should be testable without a GPU.
 *
 * §21.3: the food ramp and ticket amber/red own their hues. **No decorative
 * element may use them.** As the screen fills toward stage 4, that reservation
 * is the only thing keeping the critical signals findable.
 */
import { BRAND } from '@/config/brand';

export function lerpColour(a: number, b: number, t: number): number {
  const k = Math.max(0, Math.min(1, t));
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  return (
    (Math.round(ar + (br - ar) * k) << 16) |
    (Math.round(ag + (bg - ag) * k) << 8) |
    Math.round(ab + (bb - ab) * k)
  );
}

/**
 * Where a piece of food is on the ramp.
 *
 * `cookProgress` runs 0..1 through the cooking window. `quality` is the sim's
 * own number: it only drops below 1 when a batch has been left unattended past
 * its grace window, so **burnt is only ever reached because somebody was too
 * busy**, never because time passed.
 */
export function foodColour(cookProgress: number, quality: number): number {
  const f = BRAND.signal;
  if (quality < 1) {
    return lerpColour(f.foodPerfect, f.foodBurnt, Math.min(1, (1 - quality) * 2));
  }
  const p = Math.max(0, Math.min(1, cookProgress));
  return p < 0.5
    ? lerpColour(f.foodRaw, f.foodSeared, p * 2)
    : lerpColour(f.foodSeared, f.foodPerfect, (p - 0.5) * 2);
}
