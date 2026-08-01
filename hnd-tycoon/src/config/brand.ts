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
  // Reserved signal hues — NOTHING decorative may use these. §21.3
  signal: {
    ticketFresh: 0xf4f1ea,
    ticketWarning: 0xe8a33d,
    ticketCritical: 0xd6453a,
    foodRaw: 0xc4707a,
    foodSeared: 0x9a5a34,
    foodPerfect: 0x6f3d21,
    foodBurnt: 0x2b1a12,
  },
  interior: {
    warm: 0xffb347,
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
    /** Pilot lights and readouts: equipment should look ON at rest. §21.2 */
    pilot: 0xff7a3d,
    oil: 0xc9a24a,
    timber: 0x6b5440,
    timberDark: 0x453425,
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
  fx: { steam: 0xd8d2c6, glow: 0xffb347 },
} as const;
