/**
 * Double-entry, near enough. DESIGN.md §8, §26.
 *
 * Every dollar that moves is posted to a named account, and cash is the sum of
 * the postings. That is not bookkeeping ceremony — it is the only way the
 * step 6 gate ("P&L reconciles to the cent over a 90-day run") can be checked
 * rather than asserted. If cash and the ledger disagree, something spent money
 * without saying so, and that is exactly the bug this catches.
 *
 * `Money` is integer cents throughout. Float dollars cannot survive ninety days
 * of addition — `0.1 + 0.2` alone breaks it.
 */
import { Cash, ZERO, type Money } from './types';

export type Account =
  | 'revenue'
  | 'cogs'
  | 'waste'
  | 'wages'
  | 'rent'
  | 'utilities'
  | 'capex'
  | 'overheads'
  | 'interest';

/** Accounts that reduce cash. Revenue is the only one that adds. */
const EXPENSES: readonly Account[] = [
  'cogs',
  'wages',
  'rent',
  'utilities',
  'capex',
  'overheads',
  'interest',
];

/**
 * `waste` is a MEMO account. Those ingredients were already charged to COGS
 * when they were consumed — the food existed, you paid for it, and then it
 * went in the bin. Posting it again would bill you twice for one patty and
 * break the reconciliation, which is the whole point of this file.
 */
const MEMO: readonly Account[] = ['waste'];

export interface Posting {
  readonly account: Account;
  readonly amount: Money;
  readonly note: string;
}

export class Ledger {
  private cashHeld: Money;
  private readonly totals = new Map<Account, Money>();
  private readonly dayTotals = new Map<Account, Money>();

  constructor(opening: Money) {
    this.cashHeld = opening;
    this.opening = opening;
  }

  private readonly opening: Money;

  get cash(): Money {
    return this.cashHeld;
  }

  /**
   * Post an amount. Expenses are always given as positive Money — the account
   * decides the sign. A caller that has to remember to negate is a caller that
   * will eventually forget.
   */
  post(account: Account, amount: Money, _note = ''): void {
    if (!MEMO.includes(account)) {
      const signed = EXPENSES.includes(account) ? Cash.scale(amount, -1) : amount;
      this.cashHeld = Cash.add(this.cashHeld, signed);
    }
    this.totals.set(account, Cash.add(this.totals.get(account) ?? ZERO(), amount));
    this.dayTotals.set(account, Cash.add(this.dayTotals.get(account) ?? ZERO(), amount));
  }

  total(account: Account): Money {
    return this.totals.get(account) ?? ZERO();
  }

  today(account: Account): Money {
    return this.dayTotals.get(account) ?? ZERO();
  }

  startDay(): void {
    this.dayTotals.clear();
  }

  /**
   * Opening cash plus revenue minus every expense must equal cash held, to the
   * cent. Returns the discrepancy, which must be zero.
   */
  reconcile(): Money {
    let expected = Cash.add(this.opening, this.total('revenue'));
    for (const account of EXPENSES) expected = Cash.sub(expected, this.total(account));
    return Cash.sub(this.cashHeld, expected);
  }

  /** Every account with a non-zero total, in a stable order. */
  summary(): { account: Account; amount: Money }[] {
    return (['revenue', ...EXPENSES, ...MEMO] as Account[])
      .map((account) => ({ account, amount: this.total(account) }))
      .filter((row) => row.amount.cents !== 0);
  }

  daySummary(): { account: Account; amount: Money }[] {
    return (['revenue', ...EXPENSES, ...MEMO] as Account[])
      .map((account) => ({ account, amount: this.today(account) }))
      .filter((row) => row.amount.cents !== 0);
  }
}
