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

One tap = one sear. The patty squashes, flame licks around its edge, grease spits, the lamp flares,
and the take rises off the patty. All of it happens in one place: where the thumb landed.
(Pass 1 routed the number to a ticket rail instead — see revision 4 below for why that's gone.)

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

**4. ~~The rising number is Cookie Clicker's default, not ours.~~ — REVERTED at FEEL GATE 1.**
Pass 2 originally replaced the rising number with a **docket flick** to the ticket rail. Ben's
verdict on the M1 build: *"the docket to rail is confusing."* He's right, and for a structural
reason worth recording so it isn't reinvented:

- **The metaphor was inverted.** A docket on a rail is an order *to be made*. Using it as a receipt
  for a completed sale is backwards to anyone who has actually run a pass — which is the audience.
- **It split the feedback from the action.** The tap happens at the patty; the payoff resolved at
  the top of the screen. The eye can't be in both places, so the tap felt disconnected from its own
  reward.
- **The rail carried no information.** Eight identical `$1` dockets look like a readout that means
  something. It didn't.
- **It also contradicted the brief.** §2 lists "a rising number" as a required part of every tap. I
  overrode an explicit requirement in my own design pass and called it a promotion.

**Now: the rising number, at the patty.** Tabular monospace, dark backing so it stays legible over
flame, steel and patty alike; fast out, slow drift, quick fade. The rail is gone entirely rather
than left as decoration, and the scene reclaimed its vertical space.

Dockets remain the right object for *shop buttons* (a price on thermal paper is exactly right) —
just not for sales feedback. If they return to the scene later it will be with their real meaning:
incoming orders.

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

---

## PASS 3 — "The line" (Ben, after Phase D)

> *"Why is the patty so stupidly large. Look to other idle games for inspiration. I think cookie
> clicker was the wrong direction."*

**Pass 3 supersedes pass 2.** Where they differ, build pass 3.

### What was wrong

Pass 1 built the screen around **THE PATTY — hero, thumb zone, lamp-lit**. That was Cookie
Clicker's cookie with a burger skin on it: one giant clickable object, and a list of things to buy
underneath. When the reframe moved the tap onto **customers**, the patty stopped being a button —
but nobody took it off the stage. So the largest, best-lit object on screen has been doing nothing
for two milestones. Ben is right, and he's right about the cause, not just the symptom.

The deeper problem: Cookie Clicker is *deliberately* plain. It's a spreadsheet that respects you.
Copying its skeleton got us its looks as well, and its looks are not what this game wants.

### The new direction: a working line, seen in cross-section

The screen is a burger bar's **line**, cut away side-on, running left to right the way the food
does: **grill → fryer → pass → register → customer.** Nothing on it is decorative. Every station
is a generator you bought, staffed by a person with a name, and **the food physically moves**.

### What we're stealing, and from where

- **Idle Miner Tycoon** — the side-cut shaft with workers walking between stations. This is the
  single closest fit to what our shop is already trying to be, and it's the reason the giant
  patty has to go: in a good idle game the screen is a *process*, not a mascot. Every upgrade
  visibly staffs the process.
- **Egg, Inc.** — the place physically grows, and the camera pulls back as it does. We already
  built the pull-back in Phase D; this makes the near view worth pulling back *from*.
- **AdVenture Capitalist** — the reason it reads as making money is that you can see each
  business *filling*. Throughput needs a visible cycle, not just a number going up.

### The concrete changes

1. **The giant patty is deleted.** In its place, **five small patties sizzling on the grill** —
   more appetising, and it scales: a busier shop puts more down.
2. **Burgers travel the line.** Every serve — yours *or* your staff's — spawns a burger at the
   pass that flies to the customer who ordered it. Your cash-per-second becomes a *visible rate
   of food leaving the kitchen*. This is the whole idea in one mechanic.
3. **The room warms up.** The old ground was `--steel` — a grey-blue bench filling most of the
   frame, which is why the scene read cold no matter how many warm lamps were hung on it. Cream
   subway tile becomes the ground; steel is demoted to bench-and-appliance accent.

### Colour — pass 3

| Token | Hex | Role |
|---|---|---|
| `--tile` | `#EDE4D3` | Cream subway tile — **the new ground** |
| `--grout` | `#CFC3AC` | Tile grout, soft edges |
| `--timber` | `#8A5A32` | Counter front, warm mass |
| `--sear` | `#C6402B` | House red — awning, trays, brand |
| `--lamp` | `#FF9E1B` | Heat-lamp amber — the light itself |
| `--char` | `#241F1C` | Grill bars, char, type on light |
| `--steel` | `#A8AFB6` | Bench and appliances — **accent, no longer ground** |

Unchanged from pass 2: type roles, radius ≤ 3px, two button objects (docket + steel plate), no
gradient pills, no starbursts, no emoji in game copy.
