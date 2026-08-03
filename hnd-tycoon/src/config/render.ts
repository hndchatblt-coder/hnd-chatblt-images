/**
 * Everything about how the shop is drawn. DESIGN.md §12, §21, §22.2.
 *
 * **Projection: top-down with a shallow oblique lean. Not isometric.** Grid
 * axes match thumb axes, so left is left and back-of-house is up-screen. The
 * lean comes from two things and no rotation at all: depth tiles are shorter
 * than they are wide, and anything with height gets a front face drawn below
 * its top face. That reads as three dimensions without the depth-sorting misery
 * of a true isometric grid, and it keeps a 9-wide room 9 taps wide.
 *
 * **The screen is a cross-section, street at the BOTTOM.** Grid y=0 is the
 * door and grid y=depth-1 is the back wall, so screen y runs the other way:
 * food flows down the screen and customers flow up it. §12.
 */
export const RENDER = {
  /** Portrait dev frame. §12 — this is the target, not a preview size. */
  FRAME_WIDTH: 430,
  FRAME_HEIGHT: 1000,
  /** Below this the room stops shrinking and the player scrolls instead. */
  MIN_FRAME_HEIGHT: 480,

  /**
   * A floor tile: wider than it is deep. The foreshortening IS the lean.
   *
   * Sized so Leichhardt's 9x15 fills the frame rather than sitting in a void.
   * 9 x 40 = 360 of 390 across; 15 x 31 = 465 down, which leaves the top of
   * the frame for the HUD and the bottom for the street and the queue.
   */
  TILE_WIDTH: 40,
  TILE_DEPTH: 31,

  /** How tall things stand. Drawn as a front face under the top face. */
  HEIGHT: {
    station: 22,
    counter: 15,
    column: 40,
    person: 32,
    /**
     * Machines stand TALLER than the bench they sit on. §21.5.
     *
     * Height is the cheapest silhouette differentiator there is, and the
     * §21.1 test for stage 2 is that an automated kitchen reads as different
     * MUTED and with no labels. A machine the same height as its station is a
     * texture change; one that breaks the bench line is a different kitchen.
     *
     * Taller than a station (22) and shorter than a person (32) — it must not
     * out-mass the staff, because §14.5 says automation never makes them
     * obsolete and the picture should not say otherwise.
     */
    machine: 28,
  },

  /**
   * The shop is a warm box in a cold city (§22.2). This is that box: a warm
   * wash over the interior, brightest at the pass, falling off toward the
   * back. Without it the room is merely dark, which is not the same thing.
   */
  GLOW: {
    alpha: 0.30,
    radiusTiles: 7,
    /** Concentric rings baked into the texture. More rings, softer falloff. */
    rings: 22,
  },

  /**
   * The back wall, above the last grid row. It is not decoration: without it
   * the kitchen is a floating rectangle in a void, and the extraction hood
   * over the gas run is the clearest possible statement of why the grill
   * lives where it lives.
   */
  WALL: {
    height: 190,
    hoodDrop: 30,
    /** The skirting where wall meets floor. Without it the wall reads as floor. */
    skirting: 5,
  },

  /** Fallback grid origin, before the camera has measured the viewport. */
  ORIGIN_X: 15,
  SIDE_MARGIN: 12,
  /** Depth as a fraction of width. Below 1 is the whole oblique lean. */
  DEPTH_RATIO: 0.78,
  MIN_TILE_DEPTH: 16,

  /**
   * Screen space the HUD owns and the floor must not be drawn under. The
   * street and the queue were being rendered beneath the bottom bar, which
   * hid 100% of the street and all but eight pixels of the first customer.
   */
  CHROME: {
    top: 96,
    bottom: 150,
  },
  /**
   * Screen y of grid row 0 — the door end. The street and the queue live
   * below it, which is why it is not at the bottom of the frame.
   */
  FLOOR_BOTTOM: 716,
  /** How many rows of street to draw below the door. */
  STREET_ROWS: 4,

  /**
   * Silhouettes must read at 12px (§22.2), so people are drawn a touch larger
   * than a tile suggests. A cook who reads as a floor tile is not a cook.
   */
  PERSON_WIDTH: 18,

  /** Steam, and how much of it. Culled hard as density rises (§21.3). */
  STEAM: {
    maxParticles: 120,
    riseSpeed: 14,
    lifeSeconds: 1.6,
    spawnPerSecond: 3.2,
    size: 7,
  },

  /**
   * Human motion is irregular, machine motion is metronomic. §21.5 calls this
   * the single distinction that does the most visual work, and says to
   * exaggerate it deliberately. These are the exaggeration.
   */
  /**
   * Motion budget. BUILD_PLAN step 17.
   *
   * *"Individual fidgets cull as density rises."*
   *
   * The per-person irregularity from step 13 — phase, speed, sway, bob, four
   * separate sources of it — is what makes a crowd read as people rather than
   * as a spreadsheet. It is also the only per-entity work in the renderer that
   * scales with headcount, and at stage 4 there are eighty-odd of them.
   *
   * **Culled by DISTANCE-FROM-CAMERA rank, not at random.** Randomly freezing
   * half the room produces a crowd where some people twitch and some are
   * statues, which reads as broken. Dropping the fidget on whoever is furthest
   * back reads as depth of field: the people you are looking at move, and the
   * ones at the back of the room are a texture, which is what they are anyway.
   *
   * The thresholds are counts of moving bodies, not a frame-time reading. A
   * budget that responds to measured fps oscillates — cull, get faster, un-cull,
   * get slower — and the oscillation is far more visible than the culling.
   */
  MOTION_BUDGET: {
    /** Everyone fidgets below this. §21.1's stages 1 and 2. */
    FULL_UNTIL: 24,
    /** Above this, only the nearest `NEAR_COUNT` keep their per-person motion. */
    NEAR_COUNT: 18,
    /**
     * And past this, the sway goes too and only the walk cycle survives. A
     * body still moves along its path — losing that would make the room look
     * frozen, which is a lie about what the shop is doing.
     */
    WALK_ONLY_ABOVE: 56,
  },

  MOTION: {
    /** Walk bob amplitude in pixels, and its cycle. */
    bobPixels: 1.6,
    bobHz: 2.4,
    /**
     * Per-person speed jitter, so two people never walk in lockstep.
     *
     * This sat here unused from step 5 to step 13 while `drawStaff` bobbed
     * everyone on a clean sine — which made human motion exactly as metronomic
     * as a machine's, and §21.5's contrast is the whole of step 13.
     */
    speedJitter: 0.12,
    /**
     * How irregular a person is, beyond speed. §21.5: *"variable speed, pauses,
     * small course corrections, occasional idle fidget."*
     *
     * A second, slower sine beaten against the first is what turns a clean
     * bob into a gait — the two periods are deliberately not harmonics, so the
     * combined motion never visibly repeats.
     */
    /**
     * bobHz / 2φ — the golden ratio, for the reason it is always used for this.
     *
     * 0.61 was measured at a bob:sway ratio of 3.934, which is a 4:1 harmonic
     * in all but name: the two sines re-align every four steps and the gait
     * acquires a short visible cycle. A person who visibly loops is a person
     * who reads as a machine, which is the one thing this step exists to stop.
     *
     * An irrational ratio never re-aligns at all. 2.4 / 3.236 = 0.7417.
     */
    swayHz: 0.7417,
    swayPixels: 1.1,
    /** How far a person drifts off a straight line while walking. */
    wanderPixels: 1.4,
    /** Standing still is never quite still. */
    fidgetHz: 0.37,
    fidgetPixels: 0.5,
  },

  /**
   * **The rhythm beat. DESIGN.md §21.5, and density stage 2 (§21.1).**
   *
   * *"Machines move on fixed rhythms. People move irregularly. That single
   * distinction does more visual work than any other decision in this document,
   * and it should be exaggerated deliberately."*
   *
   * Everything here is the machine half. It is the exact opposite of `MOTION`
   * in construction as well as in feel: one period, no phase offset per unit,
   * no jitter, no easing. A machine's cycle is a sawtooth on a fixed clock and
   * two machines of the same kind are in perfect lockstep — which is unsettling
   * next to people, and is meant to be.
   */
  RHYTHM: {
    /** Seconds per machine cycle. Slow enough to read as deliberate. */
    cycleSeconds: 1.45,
    /** How far the working part of a machine travels, in pixels. */
    strokePixels: 5,
    /** Fraction of the cycle spent on the working stroke; the rest is return. */
    strokeFraction: 0.42,
    /** Idle: equipment should look ON at rest (§21.2), and machines breathe evenly. */
    idleHz: 0.5,
    idleAlpha: 0.22,
    /**
     * A machine that has failed is visible BEFORE the panel says so — a step 13
     * requirement. It stutters: the cycle stalls partway and jerks, which reads
     * wrong at a glance precisely because everything else about a machine is
     * perfectly regular.
     */
    faultStallFraction: 0.55,
    faultJitterPixels: 1.8,
    faultHz: 7.5,
  },

  /**
   * The install beat. §21.2 — a one-time arrival animation with weight:
   * drop-in, 2px shake, settle. Two seconds, once, never repeated. This is the
   * purchase's payoff moment and it is cheap to build.
   */
  INSTALL: {
    seconds: 1.9,
    dropPixels: 110,
    dropFraction: 0.42,
    shakePixels: 2,
    shakeCycles: 7,
  },

  /** Customers queue outside the door, up-screen from it. */
  QUEUE: {
    /**
     * People abreast, and how many rows of them the street can hold.
     *
     * These are NOT free numbers — `STREET_ROWS` is what `fitCamera` reserves
     * below the door, and a queue laid out past it is drawn underneath the
     * opaque bottom bar. That happened, was fixed in the audit, and came back
     * the moment the queue got long enough to need a fifth row. The visible
     * count is now derived from the rows rather than set beside them, so the
     * two cannot drift apart again.
     */
    perRow: 4,
    rows: 2,
    /**
     * The idle sway of somebody waiting. Was inline in `drawQueue` as `0.9` and
     * `1.2`, which is the "just for now" constant CLAUDE.md warns about — it
     * surfaced when step 17's motion budget needed to switch it off.
     */
    swayHz: 0.9,
    swayPixels: 1.2,
    /**
     * Tiles between rows. `headOffset + (rows - 1) * rowPitch + rowPitch` must
     * stay inside `STREET_ROWS`, and there is a test for it.
     *
     * Two rows, not three. A person sprite is about twice as tall as a tile is
     * deep, so rows closer than this overlap into a smear — three rows of three
     * read as vertical stacks of blobs rather than as a crowd of people. Four
     * abreast in two rows is the same eight people and legibly a queue.
     */
    rowPitch: 1.4,
    /** Tiles from the door to the head of the queue. */
    headOffset: 1.2,
    /** Columns are this many tiles apart. Wider than 0.9 — they were merging. */
    columnPitch: 1.05,
    /** People on a footpath are smaller than the cook you are watching. */
    scale: 0.72,
    /**
     * How far a wait has to run before it shows in the body. §6.2 asks for
     * "customer mood through posture" — the slump is the whole of it. Measured
     * against §7.4's six-minute grace, because that is when a customer starts
     * actually minding.
     */
    slumpAfterMinutes: 6,
    slumpOverMinutes: 12,
    slumpPixels: 3.5,
    slumpLeanDegrees: 5,
  },

  /**
   * The walkout. §6.3, and the step 10 exit criterion: **legible on screen
   * before the stat moves.**
   *
   * It has to read as a DECISION, not a despawn. So: arrive at the door, pause
   * long enough to be seen looking, then turn and walk off down the street,
   * fading only at the very end. The pause is the most important number here —
   * without it a walkout is indistinguishable from a customer being served.
   */
  WALKOUT: {
    seconds: 2.6,
    /** Fraction of the animation spent standing at the door, looking. */
    lookFraction: 0.3,
    /**
     * How far they travel. **Sideways, mostly.**
     *
     * The first cut sent them straight down the screen, which put them among
     * the people still queueing, moving the same way, in the same silhouette —
     * completely unreadable as a departure. A walkout has to leave the LINE
     * before it leaves the frame, so the sideways component dominates and it
     * carries them clear off the edge.
     */
    travelPixels: 18,
    driftPixels: 132,
    /** Fraction of the animation before they start to fade at all. */
    fadeFrom: 0.55,
    /** Bob while walking off — dejected, so slower than the queue's sway. */
    bobHz: 1.6,
    bobPixels: 1.4,
    /**
     * They go cold as they go. The queue is lit by the shop; someone who has
     * given up on it is walking back into the street, and §22.2's whole palette
     * idea is warm box against cold city.
     *
     * Light, because this is a MULTIPLY. The first value was a mid slate, which
     * multiplied against an already-mid customer colour and produced brown
     * lumps that read as bin bags rather than as people leaving.
     */
    tint: 0xa8b6c4,
  },

  /**
   * The ticket rail. §22.6 — open orders as a row of docket stubs above the
   * pass, ageing white -> amber -> red. It is the shop's stress, on screen,
   * with no number attached to it.
   */
  RAIL: {
    /**
     * Six, down from nine.
     *
     * At nine the rail spanned half the room and was drawn over the assembly
     * bench and the person working it — the shop's stress buried the shop. The
     * rail is a glance-read, and six dockets carry "we are behind" exactly as
     * well as nine while leaving the kitchen visible.
     */
    maxVisible: 6,
    ticketWidth: 19,
    ticketHeight: 25,
    gapPixels: 3,
    /**
     * Pixels above the pass. The rail hangs over the counter it belongs to.
     *
     * It was pinned to the back of the room, where it overlapped the extraction
     * hood and read as a row of red lockers built into the splashback —
     * equipment, not paper. Above the pass it is where a real one is, and it is
     * next to the food it is describing.
     */
    liftPixels: 56,
    /**
     * How opaque the docket PAPER is. The FLAG stays at full opacity always.
     *
     * Step 17's saturation rule, applied to the rail's own two halves. Six
     * dockets at full opacity are six big white rectangles hanging in front of
     * the counter, hiding the kitchen they are reporting on — and the paper is
     * not the signal. The band across the top is what ages and what has to be
     * seen; the paper is only what carries it.
     *
     * Turning the carrier down raises the signal-to-noise of the rail without
     * touching the signal at all, which is the cheapest legibility win in the
     * step and was invisible until somebody looked at a screenshot.
     */
    paperAlpha: 0.62,
    /** The coloured band across the top of each docket. Only this ages. */
    flagHeight: 7,
    /** A degree or two of tilt each, so they read as paper and not as tiles. */
    tiltDegrees: 3.5,
    /** Minutes at which a ticket turns amber, and at which it turns red. */
    amberMinutes: 5,
    redMinutes: 11,
    /** A red ticket pulses. Nothing else on screen does. */
    pulseHz: 1.9,
    pulseAlpha: 0.28,
  },

  /** Real seconds of a frame beyond which we stop trying to catch up. */
  MAX_FRAME_SECONDS: 0.25,
} as const;
