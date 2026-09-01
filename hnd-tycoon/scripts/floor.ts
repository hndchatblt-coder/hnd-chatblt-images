/**
 * THE most important number in the project, printed.
 *
 *   npm run floor
 *
 * DESIGN.md pillar one is that space is the binding constraint. BUILD_PLAN
 * step 3: "moving the grill six tiles from the pass measurably drops
 * throughput. Print the delta. If layout doesn't matter, the game doesn't
 * exist."
 *
 * Measured on a SATURATED kitchen. At normal trade the shop serves everyone
 * who walks in under either layout, so the delta would read as zero and the
 * conclusion would be exactly backwards — demand is the constraint at 14
 * arrivals an hour, not space.
 */
import { LAYOUTS } from '@/config/layouts';
import { buildScenario } from '@/sim/scenario';
import { mean, runSeeds, SATURATION_RATE, SEEDS } from '@/harness/probe';
import { createState } from '@/sim/state';

const DAYS = 5;
const TIGHT = 'leichhardtTight';
const STRETCHED = 'leichhardtStretched';

function distances(layoutId: string): { grillToPass: number; assemblyToPass: number } {
  const state = createState({ siteId: 'leichhardt', layoutId });
  return {
    grillToPass: state.floor.betweenStations('grill-1', 'pass-1'),
    assemblyToPass: state.floor.betweenStations('assembly-1', 'pass-1'),
  };
}

function measure(layoutId: string) {
  const runs = runSeeds({ days: DAYS, layoutId, arrivalsPerHour: SATURATION_RATE }, SEEDS);
  const world = buildScenario({ seed: SEEDS[0] as number, layoutId, arrivalsPerHour: SATURATION_RATE });
  world.runDays(DAYS);
  const walk = world.state.staff.reduce((a, s) => a + s.walkSeconds, 0);
  const shift = world.state.staff.reduce((a, s) => a + s.shiftSeconds, 0);
  return {
    covers: mean(runs.map((r) => r.covers)),
    batches: mean(runs.map((r) => r.batches)),
    wait: mean(runs.map((r) => r.meanWaitMinutes)),
    walkShare: shift > 0 ? walk / shift : 0,
  };
}

const tightD = distances(TIGHT);
const stretchedD = distances(STRETCHED);
const tight = measure(TIGHT);
const stretched = measure(STRETCHED);

const coversDelta = 1 - stretched.covers / tight.covers;
const batchDelta = 1 - stretched.batches / tight.batches;

const pct = (n: number): string => `${(n * 100).toFixed(1)}%`;

console.log(`
THE FLOOR — does space cost throughput?

  ${LAYOUTS[TIGHT]?.label}
    grill -> pass       ${tightD.grillToPass} tiles
    assembly -> pass    ${tightD.assemblyToPass} tiles

  ${LAYOUTS[STRETCHED]?.label}
    grill -> pass       ${stretchedD.grillToPass} tiles  (+${stretchedD.grillToPass - tightD.grillToPass})
    assembly -> pass    ${stretchedD.assemblyToPass} tiles  (+${stretchedD.assemblyToPass - tightD.assemblyToPass})

  Saturated at ${SATURATION_RATE} arrivals/hr, ${DAYS} days, ${SEEDS.length} seeds.

                      tight        stretched
    covers          ${tight.covers.toFixed(0).padStart(7)}      ${stretched.covers.toFixed(0).padStart(7)}
    batches         ${tight.batches.toFixed(0).padStart(7)}      ${stretched.batches.toFixed(0).padStart(7)}
    mean wait       ${tight.wait.toFixed(1).padStart(6)}m      ${stretched.wait.toFixed(1).padStart(6)}m
    walk share      ${pct(tight.walkShare).padStart(7)}      ${pct(stretched.walkShare).padStart(7)}

  >> THROUGHPUT DELTA: ${pct(coversDelta)} covers, ${pct(batchDelta)} batches <<

  Measured at the knee: the rate at which the tight kitchen is just coping.
  Below it both layouts serve everyone and this reads zero; far above it the
  stretched kitchen collapses and it reads whatever you like.

  Walking is ${pct(tight.walkShare)} of staff time tight and ${pct(stretched.walkShare)} stretched.
  That share is the ceiling on what layout can ever cost.

  Note the shape: the capacity tax is small and the WAIT is where it bites.
  The stretched kitchen does not fail, it falls behind and never catches up.
  See docs/QUESTIONS.md Q1 — this number still needs Ben's call.
`);
