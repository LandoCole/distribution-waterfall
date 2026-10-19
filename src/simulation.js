// Monte Carlo of private funds: thousands of simulated funds, each run through the European and
// American waterfalls. Plain JavaScript, no dependencies.
//
// The random draws are made once per seed (makeDraws) and every parameter reshapes those same draws
// (simulate), so changing a term reruns the same funds and only the effect of that term moves.
import { gpCarry } from './waterfall.js';

/**
 * Deal outcomes and typical terms by asset class. Calibrated to plausible gross outcomes, not fitted to a dataset.
 *   med    median multiple of a deal that isn't written off
 *   sigma  lognormal spread of those multiples
 *   wo     % of deals written off
 *   rec    the most a written-off deal can return (multiple of cost)
 *   n      deals per fund
 *   rho    % of a deal's variance shared across the fund (deals move together)
 *   T, h, c, k  hold years, hurdle %, catch-up %, carry %
 */
export const PRESETS = {
  buyout:  { name: 'buyout', med: 1.85, sigma: 0.5, wo: 8, rec: 0.3, n: 12, rho: 25, T: 5, h: 8, c: 100, k: 20,
    blurb: '12 deals, most between 1× and 3×, a few written off. Typical terms: 8% hurdle, full catch-up, 20% carry.' },
  growth:  { name: 'growth equity', med: 1.8, sigma: 0.75, wo: 10, rec: 0.3, n: 18, rho: 25, T: 5, h: 8, c: 100, k: 20,
    blurb: '18 deals with a wider spread and more upside than buyout. Same 8% hurdle, full catch-up and 20% carry.' },
  venture: { name: 'venture', med: 1.2, sigma: 1.4, wo: 40, rec: 0.3, n: 30, rho: 15, T: 8, h: 0, c: 0, k: 20,
    blurb: '30 deals. Four in ten fail and a few return 10× or more. No hurdle, 20% carry, 8-year hold.' }
};

/** Small, fast, seedable PRNG (mulberry32). Returns a function giving floats in [0, 1). */
export function mulberry32(seed) {
  let a = seed | 0;
  return () => {
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const erf = x => {
  const s = Math.sign(x); x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x));
};
/** Standard normal CDF. */
export const normCdf = x => 0.5 * (1 + erf(x / Math.SQRT2));
/** Inverse standard normal CDF, by bisection (accurate to ~1e-15 in 60 steps). */
export function normInv(p) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  let lo = -9, hi = 9;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (normCdf(m) < p) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

/**
 * The random draws behind one set of simulated funds.
 * @param {number} seed
 * @param {number} [funds=3000]
 * @param {number} [maxDeals=40]  room for up to this many deals per fund
 */
export function makeDraws(seed, funds = 3000, maxDeals = 40) {
  const R = mulberry32(seed * 7919 + 17);
  const normal = () => Math.sqrt(-2 * Math.log(R() || 1e-12)) * Math.cos(2 * Math.PI * R());
  const market = new Float32Array(funds), dealE = new Float32Array(funds * maxDeals),
        dealU = new Float32Array(funds * maxDeals), dealV = new Float32Array(funds * maxDeals);
  for (let f = 0; f < funds; f++) market[f] = normal();
  for (let i = 0; i < funds * maxDeals; i++) { dealE[i] = normal(); dealU[i] = normal(); dealV[i] = R(); }
  return { funds, maxDeals, market, dealE, dealU, dealV };
}

/** Output arrays for simulate(), sized for a set of draws. Reuse them between runs to avoid allocation. */
export function makeResults(draws) {
  const { funds, maxDeals } = draws;
  return {
    multiple: new Float64Array(funds),        // fund gross multiple
    euCarry: new Float64Array(funds),         // GP carry, European, per 100 invested
    amCarry: new Float64Array(funds),         // GP carry, American, per 100 invested
    euCarryNoCatchUp: new Float64Array(funds),
    writeOffs: new Uint8Array(funds),         // deals written off in each fund
    dealMultiples: new Float32Array(funds * maxDeals),  // fund f's deal d at [f * maxDeals + d]
    lossWriteOff: 0,                          // share of all deals written off
    lossPartial: 0                            // share of all deals that survive but return under cost
  };
}

/**
 * Runs every fund in `draws` through the waterfall. Each fund is 100 invested, split evenly across its deals.
 * A deal is written off (recovering 0 to `rec` of cost) or returns a lognormal multiple around `med`.
 * A shared shock per fund (weight `rho`) moves its deals together and makes write-offs likelier in bad funds.
 * @param {ReturnType<typeof makeDraws>} draws
 * @param {{med: number, sigma: number, wo: number, rec: number, n: number, rho: number}} world
 * @param {import('./waterfall.js').Terms} terms
 * @param {ReturnType<typeof makeResults>} [out]
 */
export function simulate(draws, world, terms, out = makeResults(draws)) {
  const { funds, maxDeals, market, dealE, dealU, dealV } = draws;
  const n = Math.min(world.n, maxDeals), size = 100 / n;
  const a = Math.sqrt(world.rho / 100), b = Math.sqrt(1 - world.rho / 100), thr = normInv(world.wo / 100);
  const noCatchUp = { ...terms, catchUp: 0 };
  let partial = 0, written = 0;
  for (let f = 0; f < funds; f++) {
    let total = 0, am = 0, w = 0;
    const m = a * market[f];
    for (let d = 0; d < n; d++) {
      const i = f * maxDeals + d, lost = m + b * dealU[i] < thr;
      const x = lost ? world.rec * dealV[i] : world.med * Math.exp(world.sigma * (m + b * dealE[i]));
      if (lost) w++; else if (x < 1) partial++;
      out.dealMultiples[i] = x;
      total += x * size;
      am += gpCarry(x * size, size, terms);
    }
    out.multiple[f] = total / 100;
    out.amCarry[f] = am;
    out.writeOffs[f] = w;
    written += w;
    out.euCarry[f] = gpCarry(total, 100, terms);
    out.euCarryNoCatchUp[f] = gpCarry(total, 100, noCatchUp);
  }
  out.lossWriteOff = written / (funds * n);
  out.lossPartial = partial / (funds * n);
  return out;
}
