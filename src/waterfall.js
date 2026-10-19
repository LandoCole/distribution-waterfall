// Distribution waterfall: how a private fund's proceeds are split between its investors (LPs)
// and its manager (GP), tier by tier. Plain JavaScript, no dependencies.
//
// Money is in any consistent unit (the demo uses $ millions). Rates are fractions: 0.08 = 8%.

export const TIERS = ['Return of capital', 'Preferred return', 'GP catch-up', 'Carried interest split'];

/**
 * Terms of a fund.
 * @typedef {object} Terms
 * @property {number} hurdle   preferred return per year, compounded (0.08)
 * @property {number} years    years from close to exit; the hurdle compounds over them
 * @property {number} catchUp  GP's share of the catch-up tier (1 = full catch-up, 0 = none)
 * @property {number} carry    GP's share of profit once caught up (0.2)
 */

/**
 * Runs one waterfall: `proceeds` returned on `capital` invested.
 * Returns the four tiers in order, each split into { lp, gp }.
 * @param {number} proceeds
 * @param {number} capital
 * @param {Terms} terms
 * @returns {{lp: number, gp: number}[]}
 */
export function distribute(proceeds, capital, { hurdle, years, catchUp, carry }) {
  let rem = proceeds;
  const roc = Math.min(rem, capital); rem -= roc;
  const pref = Math.min(rem, preferredReturn(capital, hurdle, years)); rem -= pref;
  let cu = 0;
  if (catchUp > 0) cu = Math.min(rem, catchUpSize(pref, catchUp, carry));
  rem -= cu;
  return [
    { lp: roc, gp: 0 },
    { lp: pref, gp: 0 },
    { lp: cu * (1 - catchUp), gp: cu * catchUp },
    { lp: rem * (1 - carry), gp: rem * carry }
  ];
}

/** The preferred return owed on `capital`: the hurdle compounded over `years`. */
export function preferredReturn(capital, hurdle, years) {
  return capital * (Math.pow(1 + hurdle, years) - 1);
}

/**
 * How big the catch-up tier is: the amount at which the GP holds `carry` of all profit so far.
 * If the GP's catch-up share is at or below carry it never catches up, so the tier is unbounded.
 */
export function catchUpSize(pref, catchUp, carry) {
  return catchUp > carry ? carry * pref / (catchUp - carry) : Infinity;
}

/** Adds up tiers (or any list of { lp, gp }). */
export function totals(tiers) {
  return tiers.reduce((a, t) => ({ lp: a.lp + t.lp, gp: a.gp + t.gp }), { lp: 0, gp: 0 });
}

/**
 * The GP's total from one waterfall, without building the tiers. Same result as
 * totals(distribute(...)).gp; used where it runs millions of times.
 */
export function gpCarry(proceeds, capital, { hurdle, years, catchUp, carry }) {
  let r = proceeds - Math.min(proceeds, capital);
  const p = Math.min(r, preferredReturn(capital, hurdle, years)); r -= p;
  let cu = 0;
  if (catchUp > 0) cu = Math.min(r, catchUpSize(p, catchUp, carry));
  r -= cu;
  return cu * catchUp + r * carry;
}

/**
 * A deal: what it cost and what it returned at exit.
 * @typedef {{cost: number, exit: number}} Deal
 */

/** European (whole-fund) waterfall: every exit pooled, one waterfall on the whole fund. */
export function european(deals, terms) {
  const capital = deals.reduce((s, d) => s + d.cost, 0);
  const proceeds = deals.reduce((s, d) => s + d.exit, 0);
  const tiers = distribute(proceeds, capital, terms);
  return { capital, proceeds, tiers, ...totals(tiers) };
}

/** American (deal-by-deal) waterfall: each deal runs its own waterfall on its own cost; results are added up. */
export function american(deals, terms) {
  const perDeal = deals.map(d => distribute(d.exit, d.cost, terms));
  const tiers = [0, 1, 2, 3].map(j => totals(perDeal.map(t => t[j])));
  const capital = deals.reduce((s, d) => s + d.cost, 0);
  const proceeds = deals.reduce((s, d) => s + d.exit, 0);
  return { capital, proceeds, perDeal, tiers, ...totals(tiers) };
}
