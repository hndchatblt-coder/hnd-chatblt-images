# REAL NUMBERS — fill this in

Everything in `src/config/` is currently invented. Replacing it with real High
N' Dry figures is the highest-value hour available on this project, because it
does two things at once:

1. Makes the simulation authentic rather than plausible.
2. Makes balancing possible **by eye** — you can read a day report and know
   instantly whether it's lying, which no amount of harness output gives you.

Fill in what you know, mark the rest `?`. Partial is fine — Claude Code will
use real numbers where they exist and keep the invented ones elsewhere, and
`STATE.md` should note which are which.

Ranges and typical values are more useful than precision. "Tuesday lunch does
30–40 covers" beats a spreadsheet export.

---

## Menu — the two launch items

| | Sell price | Food cost | Notes |
|---|---|---|---|
| Classic cheeseburger | | | |
| Chips | | | |
| Drinks (avg) | | | |

Current guesses: burger $16.50, chips $7.50.

## Prep times — how long does it actually take?

| Step | Elapsed | Hands-on | Notes |
|---|---|---|---|
| Patty on the grill | | | Guess: 90s elapsed, ~22s attention |
| Toast a bun | | | Guess: 25s, batch of 6 |
| Garnish prep | | | Guess: 12s, batch of 8 |
| Assemble a burger | | | Guess: 18s |
| Chips basket | | | Guess: 195s, 3 serves |

**The hands-on column is the important one** — it's what automation buys back
(§14.1) and the whole equipment ladder is calibrated against it. If a patty is
really 8s of attention rather than 22s, the clamshell grill is worth far less.

## Batch sizes

How many patties fit on the grill at once? How many baskets in the fryer? How
many buns in the toaster? These drive the batching-vs-freshness tension, which
is the core of the production game.

## Holding times

How long before a cooked patty is no longer good? A toasted bun? Chips? This
sets `freshnessWindow` and therefore how punishing par-cooking is.

## Covers and traffic

| Venue | Weekday lunch | Weekday dinner | Sat | Sun | Mon |
|---|---|---|---|---|---|
| Leichhardt | | | | | |
| Rosebery | | | | | |
| Neutral Bay | | | | | |

Also: busiest hour of the week, and roughly what share is dine-in vs takeaway
vs delivery.

## The P&L

| | Leichhardt | Rosebery | Neutral Bay |
|---|---|---|---|
| Weekly rent | | | |
| COGS % | | | |
| Labour % | | | |
| Waste % | | | |
| Avg spend per head | | | |
| Utilities / week | | | |

Current guesses: rent $2,400 / $1,900 / $3,600.

**COGS% and labour% are the two numbers the game asks the player to watch**
(§22.5), so the real ones set the target bands for the whole balance pass.

## Wages

Base rate, casual loading, and the Sat / Sun / public holiday multipliers you
actually pay. Currently: 25% loading, 1.25× / 1.5× / 2.25×.

Also — roughly what does a Sunday cost you in wages versus what it takes?
Whether Sunday is worth opening should be a real question in the game, and
it's only real if the numbers are.

## Equipment

Rough cost of a grill, a fryer, a holding cabinet, a clamshell, a conveyor
toaster. Financing terms you'd actually get. Callout cost when something dies.

## Staff

How many across the group, typical shift length, how long a good one stays,
how long training takes before someone is genuinely useful on the grill.

That last one sets the skill learning curve, which is what makes losing a
long-serving staffer hurt (§22.1).
