# GAME.md — High N' Dry: Clicker (restatement of BUILD_BRIEF.md)

Purpose of this file: restate the spec in my own words so **drift is visible**. If this file and
`BUILD_BRIEF.md` disagree, the brief wins and this file is the bug. Anywhere the brief left a
decision open, I've made the call here and marked it **[CALL]** so Ben can overrule it cheaply.

---

## 1. What the game is

A one-screen incremental. You tap a flame-grilled patty; each tap sells a burger and pays cash.
Cash buys generators that earn without tapping, and upgrades that multiply tapping and generators.
You hit a wall, sell the business (prestige) for Goodwill — a permanent multiplier — and go again,
faster.

Cookie Clicker's skeleton, unmodified. High N' Dry's skin and voice on top. The work is execution
quality, not mechanical invention.

**One currency:** cash (`$`). **One vanity stat:** burgers sold.
**One screen.** Panels slide over it; they are not screens. A second gameplay screen is a defect.

## 2. The three verbs

| Verb | What it does | Why it stays interesting |
|---|---|---|
| Tap the patty | Sells a burger, pays `clickPower` | Click power scales off production, so tapping never becomes pointless |
| Buy a generator | Adds passive `$/sec`, costs `baseCost × 1.15^owned` | Rising cost keeps rotating which generator is the best buy |
| Buy an upgrade | Multiplies clicks, one generator, or everything | Step changes; the thresholds are the pacing beats |

## 3. Generators (12, cost growth 1.15)

Ordered ladder, each roughly ×10 cost and ×8 output of the one before — Cookie Clicker's proven
building curve, renamed into the real business.

| # | id | Name | Flavour |
|---|---|---|---|
| 1 | `tongs` | Second pair of tongs | You bought a second pair of tongs. You still do all the work. |
| 2 | `fryer` | Fryer | Chips sell themselves. |
| 3 | `grillHand` | Grill hand | Turns up. Mostly. |
| 4 | `frontOfHouse` | Front of house | Someone else takes the orders now. |
| 5 | `uberEats` | Uber Eats listing | Strangers, at scale, with opinions. |
| 6 | `rosebery` | Rosebery | Second venue. |
| 7 | `neutralBay` | Neutral Bay | Third venue. Different POS, don't ask. |
| 8 | `ghostKitchen` | Ghost kitchen | A burger shop that isn't anywhere. |
| 9 | `franchise` | Franchise program | Other people's rent. |
| 10 | `pattyFactory` | Patty factory | 8mm then 6mm, forever. |
| 11 | `cattleStation` | Cattle station | Now employs more people than the burger shop. |
| 12 | `beefFutures` | Beef futures desk | You are, technically, a commodities trader. |

Cost of the *next* unit: `baseCost × costGrowth^owned`, `costGrowth = 1.15`. Because the marginal
cost of an owned generator climbs, each generator becomes the best `$`-per-output buy for some
window — that's the assertion G3 checks, and it's satisfied by construction rather than by luck.

## 4. Upgrades (~64, three families)

**[CALL]** The brief says "~60 upgrades" and also "tiered ×2 upgrades at 10/25/50/100/150 owned"
per generator — 12 × 5 = 60 tiered alone, which would leave no room for the other two families.
I've resolved it as **three tiers per generator (10/25/50)** = 36, plus 14 click and 14 global =
**64 total**, with the 100/150 thresholds reserved for a later content pass if depth is needed.
Flag if you'd rather have all five tiers and fewer of the others.

- **Generator tiers (36).** At 10/25/50 owned, unlock a ×2 multiplier for that generator.
  Cost = `baseCost × [10, 100, 1000]`. These are the loudest pacing beats — crossing 10 owned must
  be unmistakable without reading text.
- **Click family (14).** Straight click multipliers (better tongs, the STPP patty formula, the
  double-grind) plus the two that make late-game tapping matter: `clickPerGenerator` (+cash per
  tap for every generator owned) and `clickShareOfCps` (each tap is worth a % of a second's
  production). This is the "convert generator output into click power" mechanic the brief asks for.
- **Global family (14).** Multiply everything: the weekly special board, Lightspeed integration,
  the ticket printer, hiring a manager called Archie, a reel that goes viral.

No single upgrade may produce more than a **25×** step (G3).

## 5. Golden Patty

Spawns on a randomised timer, drifts across the screen, tappable for ~13s. Weighted effects:

| Effect | Result | Duration |
|---|---|---|
| Frenzy | ×7 production | 77s |
| Lucky | instant cash: min(15% of bank, 900s of production) | instant |
| Service bell | ×777 click power | 13s |
| Health inspector (rare) | production ×0.5 | 60s |

The Health Inspector is the only negative and it **never destroys anything** — no cash removed, no
generators lost. Consistent with the pillar: the game never takes progress away.

## 6. News ticker

One line above the patty, cycling ~10s, drawn from pools gated by progress (early / mid / late /
prestige). 70 lines written. Voice: dry, specific, deadpan, one notch past reality. No explaining
the joke, no flagged puns, no emoji, no exclamation marks.

## 7. Prestige — "sell the business"

Lifetime revenue converts to **Goodwill**, a permanent global multiplier that survives resets.
Goodwill is also spent on a small perk tree: faster golden patties, a stronger opening (start each
run with cash/generators), better offline rate.

`goodwill = floor(goodwillScale × (lifetimeRevenue / goodwillDivisor) ^ goodwillExponent)`

Tuned so the **first sale lands 45–120 minutes** into casual play (G3). Selling is a moment, not a
menu action — the sell screen has to land.

## 8. Achievements (40)

Dry names, real triggers. Includes the brief's three examples: *Owner-operator* (10,000 manual
taps), *Understaffed* (reach $10k with zero generators), *Trading down* (buy a beef futures desk
before a fryer). Achievements are recognition only — **[CALL]** they grant no multiplier, so they
can't distort the economy the playbot is asserting against.

## 9. Offline

Earn at a reduced rate while away, capped at 8 hours, with a plain welcome-back summary. No
timers you must return for, no punishment for leaving, no dark patterns.

## 10. Architecture

- React + Vite, TypeScript strict. Portrait-first (390×844), one screen with slide-over panels.
- **Headless engine** in `src/engine/` — pure TS, zero DOM imports. Tick, purchase, multiplier
  resolution, golden patties, prestige, offline settlement. UI reads state, dispatches intents.
- **Config is law.** Every number in `economy.config.json`; no numeric literals in engine code
  beyond `0`, `1`, indices.
- Seeded RNG throughout; same seed + same input tape = identical result.
- Storage behind an adapter interface; save format versioned with a migration path from day one.
- Canvas for the patty and particles, DOM for everything else.

## 11. Definition of done

Per brief §2, verified not asserted: tap juice within one frame (squash, flare, grease, rising
number, layered click, haptic); 60fps at 4× CPU throttle during a frenzy with everything owned; no
frame >20ms in a 60s capture; cold load <2s on throttled 4G; bundle <1.5MB gzipped; 12 generators
/ ~60 upgrades / 40 achievements / 60+ ticker lines; first prestige 45–120 min with no dead stretch
>90s; save/load + autosave + offline + export/import; settings incl. reduced motion and notation;
real stats; visible focus; zero placeholder assets and zero emoji-as-icons; ambient sizzle bed,
layered pitch-varied click, tier-up stinger, golden fanfare.

## 12. Where the loop stops

The §6 loop certifies *not broken, not slow, not ugly by rubric, not boring by the numbers*. It
cannot certify fun. Fun is Ben's, at the three feel gates: **M1** (is the tap right?), **M3** (is it
satisfying for five straight minutes?), **M6** (would you screenshot this?).
