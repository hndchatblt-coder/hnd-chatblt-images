/**
 * Things that go wrong. DESIGN.md §9.
 *
 * *"Roughly one every 2–3 game days. A reason to open the app and a reason to
 * hold a cash buffer."*
 *
 * **The hard rule, and it is the reason this file is shaped the way it is:**
 * incidents DEGRADE, they never destroy, and they never require a response
 * inside a time window. An unattended incident costs more the longer it runs.
 * Twice a day should feel clever, not rescued.
 *
 * So there is no `expiresAt` on an incident and there never will be. That is
 * the field that would turn this system into a punishment for having a job, and
 * §5.3's "attention is rewarded, never required" is a pillar rather than a
 * preference. What there IS is `severityPerDay`: leave the fryer limping and it
 * limps worse, at a rate you can watch, and fixing it on Thursday costs more
 * than fixing it on Tuesday because of what it did in between — not because a
 * timer ran out.
 */

export type IncidentEffect =
  /** A station runs slower until it is fixed. */
  | 'stationSpeed'
  /** Somebody rostered on does not turn up today. */
  | 'staffAbsent'
  /** Everything in the buffer ages faster. */
  | 'freshness'
  /** Ambience drops — the room is not at its best. */
  | 'condition';

export interface IncidentSpec {
  readonly id: string;
  /** Shown as the headline. Plain English, no exclamation marks. */
  readonly label: string;
  /** The sentence under it. What it is doing to you, in terms you can act on. */
  readonly blurb: string;
  readonly effect: IncidentEffect;
  /** Which station type it can strike, when the effect is `stationSpeed`. */
  readonly station?: string;
  /** Relative frequency. Normalised at use. */
  readonly weight: number;
  /**
   * How bad it is on day one, as a fraction of the thing it degrades. 0.35 on
   * a station speed means it runs at 65% until you deal with it.
   */
  readonly severity: number;
  /** How much worse per game day left alone. The whole of "unattended costs more". */
  readonly severityPerDay: number;
  /** It cannot degrade past this. Nothing in this game goes to zero. §10 */
  readonly maxSeverity: number;
  /** Dollars to put right. Scales with how far it has been let go. */
  readonly baseFixCost: number;
}

export const INCIDENTS: readonly IncidentSpec[] = [
  {
    id: 'fryerThermostat',
    label: 'Fryer thermostat is playing up',
    blurb: 'It gets there eventually. Chips are slow and the queue knows it.',
    effect: 'stationSpeed',
    station: 'fryer',
    weight: 0.22,
    severity: 0.3,
    severityPerDay: 0.06,
    maxSeverity: 0.7,
    baseFixCost: 260,
  },
  {
    id: 'grillBurner',
    label: 'One burner has gone out on the grill',
    blurb: 'Half the flat-top is cold. Patties take as long as they take.',
    effect: 'stationSpeed',
    station: 'grill',
    weight: 0.18,
    severity: 0.35,
    severityPerDay: 0.05,
    maxSeverity: 0.65,
    baseFixCost: 320,
  },
  {
    id: 'staffSick',
    /**
     * The only incident that resolves itself, because a person being ill is not
     * a thing you fix with money — you cover the shift or you wear it. It ends
     * when the day does, which is not a timer the player has to beat: there is
     * nothing to do about it inside the day at all, so nothing is being asked.
     */
    label: 'Someone has called in sick',
    blurb: 'Down a pair of hands today. Nothing to fix — just a long shift.',
    effect: 'staffAbsent',
    weight: 0.24,
    severity: 1,
    severityPerDay: 0,
    maxSeverity: 1,
    baseFixCost: 0,
  },
  {
    id: 'coolRoomDrift',
    label: 'The cool room drifted overnight',
    blurb: 'Everything in it is a day older than it should be. Bins fill faster.',
    effect: 'freshness',
    weight: 0.2,
    severity: 0.28,
    severityPerDay: 0.07,
    maxSeverity: 0.6,
    baseFixCost: 210,
  },
  {
    id: 'roomTired',
    label: 'The room is looking tired',
    blurb: 'A light out, a wobbly table, the floor sticky by six. People notice.',
    effect: 'condition',
    weight: 0.16,
    severity: 0.2,
    severityPerDay: 0.04,
    maxSeverity: 0.5,
    baseFixCost: 140,
  },
];

export const INCIDENT_RULES = {
  /**
   * §9: "roughly one every 2–3 game days". Expressed as a per-day probability
   * rather than a countdown, so it is Poisson-ish and occasionally gives you
   * two in a week and occasionally none — a schedule you can plan around is
   * not a reason to open the app.
   */
  CHANCE_PER_DAY: 0.4,
  /**
   * Never more than this many open at once. Not a difficulty cap — a legibility
   * one. Four simultaneous problems is a list, and a list is something a player
   * closes.
   */
  MAX_OPEN: 3,
  /** No two of the same kind at once. */
  UNIQUE_BY_ID: true,
  /**
   * A brand-new shop gets a week clear. Incidents on day one read as the game
   * being broken rather than as the world having weather.
   *
   * It was a fortnight, which is too long: §9 wants incidents to be "a reason to
   * open the app", and at the shipped time compression a fortnight is about
   * forty minutes of continuous play before the world does anything to you at
   * all. A week still covers the opening — long enough to hire, buy a station
   * and learn what the readout is for.
   */
  GRACE_DAYS: 7,
  /**
   * Fixing costs `baseFixCost * (1 + severityAbove * this)`. Letting it run is
   * a decision with a price, which is the point — but the price is bounded by
   * `maxSeverity`, so walking away for a fortnight is recoverable. §10.
   */
  COST_PER_SEVERITY: 2.2,
} as const;
