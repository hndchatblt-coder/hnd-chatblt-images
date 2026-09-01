/**
 * STEP 13 GATES — the rhythm beat.
 *
 * "The mechanical/human motion contrast (§21.5), exaggerated deliberately.
 * Machines metronomic, people irregular. Working signatures per machine. A
 * machine failure visible before it's notified."
 *
 * **Exit: density stage 2.** A player distinguishes an automated kitchen from a
 * manual one at a glance, muted, with no labels.
 *
 * A visual criterion cannot be fully asserted in a unit test, and pretending
 * otherwise would be the exact failure this project keeps logging. What CAN be
 * gated is everything the visual reading depends on — that the two motion
 * vocabularies are actually different in construction, that machines are a
 * different kind of object from stations in palette and silhouette, and that a
 * broken machine is distinguishable from a working one without reading a word.
 * The judgement itself was made from screenshots and is recorded in STATE.md.
 */
import { describe, expect, it } from 'vitest';
import { BRAND } from '@/config/brand';
import { RENDER } from '@/config/render';
import { MACHINES } from '@/config/machines';

describe('STEP 13 — two motion vocabularies, different by construction', () => {
  it('gives machines exactly one period and no per-unit variation', () => {
    /**
     * §21.5: *"metronomic, identical every cycle, no hesitation."*
     *
     * The structural claim: `RHYTHM` describes ONE cycle, and there is nothing
     * in it that could vary between two machines of the same kind. Two
     * clamshells are in lockstep because there is no field that could put them
     * out of it.
     */
    expect(RENDER.RHYTHM.cycleSeconds).toBeGreaterThan(0);
    expect(RENDER.RHYTHM).not.toHaveProperty('jitter');
    expect(RENDER.RHYTHM).not.toHaveProperty('speedJitter');
    expect(RENDER.RHYTHM).not.toHaveProperty('phaseOffset');
    expect(RENDER.RHYTHM).not.toHaveProperty('easing');
  });

  it('gives people every kind of variation a machine has not got', () => {
    // §21.5: "variable speed, pauses, small course corrections, occasional
    // idle fidget." All four must be non-zero or the contrast is one-sided.
    expect(RENDER.MOTION.speedJitter).toBeGreaterThan(0);
    expect(RENDER.MOTION.swayPixels).toBeGreaterThan(0);
    expect(RENDER.MOTION.wanderPixels).toBeGreaterThan(0);
    expect(RENDER.MOTION.fidgetPixels).toBeGreaterThan(0);
  });

  it('beats the human periods against each other so the gait never repeats', () => {
    /**
     * The bob and the sway must not be harmonics, or the combined motion has a
     * short visible cycle and a person starts looking like a machine — which is
     * precisely what this step exists to prevent.
     *
     * Checked as a ratio that is not near any simple fraction. The shipped
     * value is `bobHz / 2phi` — the golden ratio, for exactly the reason it is
     * always used for this: an irrational ratio never re-aligns.
     *
     * Caught a real one. 0.61 gave a ratio of 3.934, a 4:1 harmonic in all but
     * name, and the two sines re-aligned every four steps.
     */
    const ratio = RENDER.MOTION.bobHz / RENDER.MOTION.swayHz;
    for (const harmonic of [1, 1.5, 2, 2.5, 3, 4, 5]) {
      expect(
        Math.abs(ratio - harmonic),
        `bob/sway = ${ratio.toFixed(3)} is too close to ${harmonic}`,
      ).toBeGreaterThan(0.15);
    }
  });

  it('keeps the machine cycle slower than a walking pace', () => {
    // A machine that cycles faster than a person's stride reads as frantic
    // rather than as relentless, and relentless is the feeling §21.1 stage 2
    // is after.
    const machineHz = 1 / RENDER.RHYTHM.cycleSeconds;
    expect(machineHz).toBeLessThan(RENDER.MOTION.bobHz);
  });
});

describe('STEP 13 — a machine is a different KIND of object from a bench', () => {
  it('paints machines in a palette the kitchen does not otherwise use', () => {
    /**
     * The muted, unlabelled reading rests on this. Sharing `equipment.steel`
     * made a fitted clamshell look like more bench, and §21.1's stage 2 test is
     * that the kitchen visibly changes character.
     */
    const kitchen = new Set<number>(Object.values(BRAND.equipment));
    for (const [name, colour] of Object.entries(BRAND.machine)) {
      expect(kitchen.has(colour), `machine.${name} is borrowed from equipment`).toBe(false);
    }
  });

  it('keeps the machine indicator cold, against a room full of warm pilots', () => {
    // One cool light in a sodium-lamp room. Cheap, and it is what the eye
    // catches first at a glance.
    const blue = (c: number): number => c & 0xff;
    const red = (c: number): number => (c >> 16) & 0xff;
    expect(blue(BRAND.machine.indicator)).toBeGreaterThan(red(BRAND.machine.indicator));
    expect(red(BRAND.equipment.pilot)).toBeGreaterThan(blue(BRAND.equipment.pilot));
  });

  it('stands taller than a bench and shorter than a person', () => {
    /**
     * Height is the cheapest silhouette differentiator there is. Taller than a
     * station so it breaks the bench line; shorter than a person because §14.5
     * says automation never makes staff obsolete and the picture must not say
     * otherwise.
     */
    expect(RENDER.HEIGHT.machine).toBeGreaterThan(RENDER.HEIGHT.station);
    expect(RENDER.HEIGHT.machine).toBeLessThan(RENDER.HEIGHT.person);
  });

  it('gives every machine a working signature distinct from its idle one', () => {
    // §21.2: install, idle AND working, all three, all different. A machine
    // whose idle and working descriptions match has no working signature.
    for (const m of MACHINES) {
      expect(m.signature.install.length).toBeGreaterThan(10);
      expect(m.signature.idle.length).toBeGreaterThan(10);
      expect(m.signature.working.length).toBeGreaterThan(10);
      expect(m.signature.idle).not.toBe(m.signature.working);
    }
  });
});

describe('STEP 13 — a failure is visible before it is notified', () => {
  it('stalls the cycle somewhere a healthy machine never rests', () => {
    /**
     * The fault reads instantly BECAUSE everything else about a machine is
     * perfectly regular: it stops partway through the stroke and buzzes there.
     * A healthy cycle is only ever at the ends of its travel when it pauses, so
     * a stall in the middle is unmistakable.
     */
    expect(RENDER.RHYTHM.faultStallFraction).toBeGreaterThan(0.1);
    expect(RENDER.RHYTHM.faultStallFraction).toBeLessThan(0.9);
    // And it buzzes fast — faster than any healthy motion in the room, so it
    // reads as wrongness rather than as another rhythm.
    expect(RENDER.RHYTHM.faultHz).toBeGreaterThan(RENDER.MOTION.bobHz);
    expect(RENDER.RHYTHM.faultJitterPixels).toBeGreaterThan(0);
  });
});
