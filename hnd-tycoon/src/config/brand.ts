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
  interior: { warm: 0xffb347, floor: 0x2a2622, surface: 0x3d3833 },
  street: { cold: 0x2c3a47, night: 0x161c22 },
  ink: { primary: 0xf4f1ea, muted: 0x8a8580 },
} as const;
