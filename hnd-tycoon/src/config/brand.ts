/**
 * High N' Dry brand tokens. DESIGN.md §22.2.
 *
 * TODO: replace with the real brand hexes. Everything visual reads from here,
 * so restyling the entire game is a single-file change.
 *
 * Direction: warm sodium-lamp interior against a cool blue-grey street, so the
 * shop reads as a warm box in a cold city. Grubby, saturated, confident.
 * NOT cream-and-terracotta editorial. This is a neon-and-steel subject.
 */
export const BRAND = {
  /**
   * Reserved signal hues. §21.3.
   *
   * **These must be the most saturated colours on screen**, and that is the
   * rule rather than "no decorative colour may look like them" — see
   * `config/palette.ts`. The ticket amber and red were raised here because
   * measurement found the shop's own pilot lights (chroma 194) and sodium lamp
   * (184) shouting louder than the ticket warning (171) that was supposed to
   * leap off them.
   */
  signal: {
    ticketFresh: 0xf4f1ea,
    ticketWarning: 0xffa50a,
    ticketCritical: 0xf5231a,
    foodRaw: 0xc4707a,
    foodSeared: 0x9a5a34,
    foodPerfect: 0x6f3d21,
    foodBurnt: 0x2b1a12,
  },
  interior: {
    warm: 0xe0a055,
    floor: 0x2a2622,
    /** The alternate floor tile. A flat floor reads as a void. */
    floorAlt: 0x322d28,
    surface: 0x3d3833,
    /** Grout, tile edges, the seams that give the floor scale. */
    seam: 0x1e1a17,
  },
  street: { cold: 0x2c3a47, night: 0x161c22 },
  ink: { primary: 0xf4f1ea, muted: 0x8a8580 },

  /**
   * Equipment. Steel and enamel, not toys. Each is a top colour and a darker
   * front face — the front face is what makes the oblique lean read.
   */
  equipment: {
    steel: 0x8f9296,
    steelDark: 0x5c6064,
    enamel: 0x4a5258,
    enamelDark: 0x2f3438,
    /** Anything hot gets this on its cooking surface. */
    hotplate: 0x39322e,
    /**
     * Pilot lights and readouts: equipment should look ON at rest. §21.2
     *
     * Pulled down from `0xff7a3d` (chroma 194). A pilot light is a small warm
     * dot, which is also exactly what an ageing ticket looks like — being the
     * single most saturated thing in the game made it the loudest.
     */
    pilot: 0xd96a35,
    oil: 0xc9a24a,
    timber: 0x6b5440,
    timberDark: 0x453425,
  },

  /**
   * Machines. §21.5, and deliberately NOT the equipment palette.
   *
   * A clamshell has to read as a different KIND of thing from the grill it
   * sits on, muted and at a glance, or the automation ladder is invisible.
   * Sharing `equipment.steel` made a fitted machine look like more bench.
   *
   * Colder and darker than the room, with a machined blue cast the warm
   * interior has nowhere else. Against sodium-lamp orange this is the only
   * cool mass on the floor, which is the whole reading.
   */
  machine: {
    housing: 0x4d5a68,
    housingDark: 0x2b333c,
    /** The gantry and the moving arm. Bright enough to track in motion. */
    arm: 0xa9b7c4,
    /** A machine is ON. One cold indicator against the shop's warm pilots. */
    indicator: 0x6fd3e8,
  },

  /** People. Chef whites in the kitchen, brand tee at the counter. §21.2 */
  people: {
    whites: 0xe8e4dc,
    whitesDark: 0xb9b4aa,
    apron: 0x2f3438,
    skin: 0xc98d63,
    /** Customers are cooler than staff — they came in off the street. */
    customer: 0x6d7f8d,
    customerAlt: 0x7d7086,
  },

  /** Steam and haze. Never a signal hue. §21.3 */
  fx: { steam: 0xd8d2c6, glow: 0xe0a055 },
} as const;
