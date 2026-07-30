# DESIGN_TOKENS.md — High N' Dry: Clicker

Per brief §4: pass 1 is the plan, pass 2 critiques it and revises anything that reads like a
default. Both passes are kept below so the reasoning is auditable. **Pass 2 is the spec** — where
they differ, build pass 2.

---

## PASS 1 — the plan

### Direction: "Under the heat lamp"

The screen is the **pass** of a burger bar at night, seen straight on: a brushed stainless bench,
a ticket rail above it, and a heat lamp throwing warm amber light down onto the grill. Source
material is the service side of the business — dockets, rails, lamps, steel, char, grease — not
mobile-game convention.

Deliberately **not dark and moody**. The lamp is the light source and it is warm and bright; the
steel is mid-tone, not near-black. (Prior project failed a feel gate for being "doom and gloom";
that lesson carries.)

### Colour — 6 named values

| Token | Hex | Role |
|---|---|---|
| `--steel` | `#8A9199` | Brushed steel bench — the ground |
| `--steel-dark` | `#4A5158` | Edges, shadow, panel wells |
| `--char` | `#241F1C` | Char marks, grill bars, type on light surfaces |
| `--lamp` | `#FF9E1B` | Heat-lamp amber — the accent and the actual light |
| `--sear` | `#E2401C` | Flame, hot signals, the patty's fire |
| `--docket` | `#F6F1E4` | Thermal paper — dockets, ticker, cards |

### Type — three roles

- **Display:** heavy condensed uppercase, kitchen-signage register. Labels, prices, section heads.
- **Body:** system UI face. Invisible on purpose; carries flavour text and copy.
- **Numeric/utility:** tabular monospace — the till readout, `$/sec`, docket prices. Thermal
  printer lineage, and tabular figures stop the counter jittering as it animates.

### Layout (390×844 portrait)

```
┌──────────────────────────────┐
│ ticker — one docket line     │  44
├──────────────────────────────┤
│  $12.4k                      │  92   till readout, tabular, huge
│  burgers sold · $/sec        │
├──────────────────────────────┤
│ ══ ticket rail ══════════════│  54   dockets accumulate here
│                              │
│                              │
│          THE PATTY           │ 360   hero, thumb zone, lamp-lit
│        on the grill          │
│                              │
│                              │
├──────────────────────────────┤
│ [ STAFF ] [ UPGRADES ] [ ⋯ ] │  72   tabs → slide-over panels
└──────────────────────────────┘
```

### Signature element: **The Sear**

One tap = one sear. The patty squashes, flame licks around its edge, grease spits, the lamp
flares, and **a docket prints and flicks up onto the ticket rail** carrying the sale amount.

---

## PASS 2 — critique and revision

Four things in pass 1 read like defaults or risked the brief's forbidden list. Changed:

**1. "Steel + amber + off-white" was drifting toward a generic dark industrial UI kit.**
Revised: the heat lamp is not a colour, it is a **light source that physically lights the scene**.
A warm radial falloff sits above the grill; every surface below it is tinted by it, and the lamp's
intensity *responds to production* — busier kitchen, hotter lamp. Light does the work that gradient
buttons would otherwise do. Added `--lamp-glow` as a derived alpha of `--lamp`, not a 7th hue.

**2. Impact / Haettenschweiler as the display face is the lazy version of "loud".**
Revised: loudness comes from **scale, case and the lamp**, not a novelty face. The display role is
a heavy condensed grotesque used *only* for labels, section heads and prices; the real typographic
hero is the **till readout** — monospace, tabular, oversized, animated. Implementation: bundle a
subset condensed woff2 as a data URI (no CDN — the brief's bundle budget allows ~30KB); if no
suitable face can be bundled, fall back to a condensed system stack rather than shipping a
placeholder. Never a webfont URL: a silent fallback would break the whole register.

**3. Real risk of sliding into "casual mobile game" (explicitly forbidden).**
Revised, with two hard rules:
- **No rounded gradient buttons anywhere.** Buttons are one of exactly two objects: a **docket**
  (thermal-paper card, squared corners, perforated top edge, monospace price, slight rotation) or a
  **steel plate** (flat fill, 1px top inset highlight, hard offset shadow, no radius > 3px).
- **No starbursts, no confetti, no purple-to-pink.** Every particle is a real thing from the
  kitchen: flame, grease, smoke, docket paper, or a coin. If it isn't in a burger bar, it isn't on
  screen.

**4. The rising number is Cookie Clicker's default, not ours.**
Revised: the tap feedback is the **docket flick** to the rail (pass 1's signature, now promoted to
the primary number channel). Two reasons it's better than a floating `+$1`: it's specific to the
subject, and the rail **accumulates a visible record of the session** — the screen physically fills
with evidence of work, which is exactly what an incremental game wants. A small tabular number
still rides the docket, so nothing is lost in legibility.

Also confirmed against the forbidden list: ground is mid-tone steel (**not** cream), there is **no
serif anywhere**, the accent is heat-lamp amber (**not** terracotta), there is no acid green, and
there are no hairline broadsheet rules — divisions are steel seams and perforations.

### Tokens as built

```css
--steel:      #8A9199;   --steel-dark: #4A5158;
--char:       #241F1C;   --lamp:       #FF9E1B;
--sear:       #E2401C;   --docket:     #F6F1E4;
--lamp-glow:  rgb(255 158 27 / <alpha>);   /* derived, intensity tracks production */

--font-display: heavy condensed grotesque, uppercase, tracking -0.01em
--font-body:    system-ui stack
--font-num:     ui-monospace, tabular-nums

--radius-max: 3px          /* nothing rounder than a steel edge */
--shadow:     hard offset, no blur > 4px
```

### Verification

Screenshot at 390×844 and look at it — every iteration, per brief §4. The rubric the auditor will
use: does the hero earn the screen, is the type doing work, is there a single memorable thing,
would a screenshot stop a thumb.
