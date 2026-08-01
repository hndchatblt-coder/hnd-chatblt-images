/**
 * What there is to buy. DESIGN.md §14.2, §14.3, §21.2.
 *
 * **Every machine must create a new problem.** §14.3 is non-negotiable and
 * audited: each piece trades a labour cost for at least two of capital, floor
 * space, utilities, flexibility and reliability. If a thing is strictly better
 * than not having it, it is a stat upgrade in a costume — cut it or cost it.
 *
 * So every entry here declares its `costs` explicitly, and a test asserts
 * there are at least two. That turns the rule from a good intention into
 * something that fails the build.
 *
 * **Every purchase has a visible signature** (§21.2). Every entry declares its
 * install beat, its idle signature and its working signature, and a test
 * asserts those too. If you cannot describe one, the item should not exist.
 */
import { money, type Money } from '@/sim/types';
import type { StationType } from './recipes';

export type CostKind = 'capital' | 'floorSpace' | 'utilities' | 'flexibility' | 'reliability';

export interface Signature {
  /** One-time arrival: drop-in with shadow, shake, dust, power-on. */
  readonly install: string;
  /** How it looks doing nothing. Equipment should feel ON at rest. */
  readonly idle: string;
  /** Its motion under load, identifiable without a label. */
  readonly working: string;
}

export interface CatalogueEntry {
  readonly id: string;
  readonly label: string;
  /** One line of plain English. Australian, deadpan, never winking. */
  readonly blurb: string;
  readonly price: Money;
  /** At least two, by §14.3. */
  readonly costs: readonly CostKind[];
  readonly signature: Signature;
}

export interface EquipmentEntry extends CatalogueEntry {
  readonly kind: 'equipment';
  readonly station: StationType;
}

export interface HireEntry extends CatalogueEntry {
  readonly kind: 'hire';
  readonly skill: number;
}

export type CatalogueItem = EquipmentEntry | HireEntry;

/**
 * The fictional roster. Real staff names are blocked on Q5/Q6 — do not ship a
 * public build with real employees' names without asking them first.
 */
export const ROSTER: readonly string[] = [
  'Marnie',
  'Tavita',
  'Dec',
  'Shazza',
  'Hoang',
  'Fitzy',
  'Priya',
  'Baz',
];

export const CATALOGUE: readonly CatalogueItem[] = [
  {
    kind: 'hire',
    id: 'hire',
    label: 'Put someone on',
    blurb: 'Another pair of hands. They eat into the margin whether it is busy or not.',
    price: money(0),
    skill: 1,
    costs: ['capital', 'flexibility'],
    signature: {
      install: 'Walks in through the front door on their first shift and crosses to the pass.',
      idle: 'Stands at the pass, shifting weight, looking at the door.',
      working: 'Irregular gait, pauses, small course corrections. Never metronomic.',
    },
  },
  {
    kind: 'equipment',
    id: 'fryer',
    label: 'Second fryer',
    blurb: 'Chips stop being the thing everything waits on. Needs gas and a hood.',
    price: money(4800),
    station: 'fryer',
    costs: ['capital', 'floorSpace', 'utilities'],
    signature: {
      install: 'Wheeled in, dropped with a shudder, oil settles, element glows.',
      idle: 'Oil surface still and amber. A thermostat light cycling slowly.',
      working: 'Bubbling, steam column, basket sitting proud of the oil.',
    },
  },
  {
    kind: 'equipment',
    id: 'grill',
    label: 'Second grill',
    blurb: 'Two metres of flat-top. Eats the back wall, and the gas bill with it.',
    price: money(7200),
    station: 'grill',
    costs: ['capital', 'floorSpace', 'utilities'],
    signature: {
      install: 'Two people carry it in. Lands heavy. Pilot lights catch one at a time.',
      idle: 'Hotplate dark, pilot lights breathing.',
      working: 'Steam off the plate, patties in a row darkening through the ramp.',
    },
  },
  {
    kind: 'equipment',
    id: 'toast',
    label: 'Second toaster',
    blurb: 'Buns stop queueing behind patties.',
    price: money(1600),
    station: 'toast',
    costs: ['capital', 'floorSpace', 'utilities'],
    signature: {
      install: 'Set down on the bench, plugged in, elements tick as they warm.',
      idle: 'A dull orange line along the element.',
      working: 'Brighter element, faint smoke, buns going through.',
    },
  },
  {
    kind: 'equipment',
    id: 'assembly',
    label: 'Second assembly bench',
    blurb: 'Somewhere else to build. Three tiles of floor you will want back later.',
    price: money(1100),
    station: 'assembly',
    costs: ['capital', 'floorSpace'],
    signature: {
      install: 'Slid into place. Nothing lights up, because it is a bench.',
      idle: 'Bare timber. The only thing on the line that is honestly inert.',
      working: 'Hands over it constantly. Where the burger actually becomes a burger.',
    },
  },
  {
    kind: 'equipment',
    id: 'drinks',
    label: 'Holding cabinet',
    blurb: 'Keeps cooked food good for longer. Worth nothing unless you cook ahead.',
    price: money(1900),
    station: 'drinks',
    costs: ['capital', 'floorSpace', 'utilities'],
    signature: {
      install: 'Rolled in, door swings once, interior light comes on.',
      idle: 'Interior light, condensation on the glass, compressor cycling.',
      working: 'Trays going in and out. Fuller when you have over-committed.',
    },
  },
];

export const CATALOGUE_BY_ID: Readonly<Record<string, CatalogueItem>> = Object.fromEntries(
  CATALOGUE.map((item) => [item.id, item]),
);
