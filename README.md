# Distribution waterfall

How a private fund's proceeds are split between its investors (limited partners, LPs) and its manager (general partner, GP), tier by tier, under European (whole-fund) and American (deal-by-deal) terms. It also includes a Monte Carlo of 3,000 simulated funds to show how those terms play out across many outcomes.

**Live demo:** [landonthornton.com/waterfall](https://landonthornton.com/waterfall/)

Everything runs in the browser in plain JavaScript, with no dependencies and no build step.

## What's here

| Path | What it is |
|---|---|
| `src/waterfall.js` | The waterfall engine: the four tiers, European and American structures |
| `src/simulation.js` | The Monte Carlo: seeded draws, asset-class presets, 3,000 funds through both waterfalls |
| `index.html` | The demo: a hand-drawn SVG Sankey calculator and the Monte Carlo scatter, built on the two modules |
| `test/` | Tests for both modules (`node --test`) |

## Run it

```sh
npm test          # 18 tests, Node 18+
npm run demo      # serves the folder on http://localhost:8080 (ES modules need http://, not file://)
```

## The engine

```js
import { distribute, european, american, gpCarry } from './src/waterfall.js';

const terms = { hurdle: 0.08, years: 5, catchUp: 1, carry: 0.2 };   // 8% hurdle, full catch-up, 20% carry

distribute(200, 100, terms);
// → [ { lp: 100,   gp: 0 },       return of capital
//     { lp: 46.93, gp: 0 },       preferred return (8% compounded over 5 years)
//     { lp: 0,     gp: 11.73 },   GP catch-up, until the GP holds 20% of profit
//     { lp: 33.07, gp: 8.27 } ]   80/20 carried interest split

const deals = [{ cost: 50, exit: 0 }, { cost: 50, exit: 150 }];
european(deals, terms).gp;   // 3.07: the write-off is pooled with the winner
american(deals, terms).gp;   // 20.0: the winner pays carry on its own
```

- `distribute(proceeds, capital, terms)` returns the four tiers, each split into `{ lp, gp }`.
- `european(deals, terms)` pools every exit and runs one waterfall on the whole fund.
- `american(deals, terms)` runs one waterfall per deal on its own cost and adds the results up.
- `gpCarry(proceeds, capital, terms)` is the GP's total alone, for hot loops.
- `totals(tiers)`, `preferredReturn(...)` and `catchUpSize(...)` are small helpers.

Rates are fractions (0.08 = 8%). Money is in any consistent unit; the demo uses $ millions.

### The simulation

```js
import { PRESETS, makeDraws, simulate } from './src/simulation.js';

const draws = makeDraws(1);                              // 3,000 funds × up to 40 deals of random draws, seeded
const r = simulate(draws, PRESETS.buyout, terms);         // reruns in a few ms; reuse `draws` to change only the inputs
r.multiple[0], r.euCarry[0], r.amCarry[0];               // fund 0's gross multiple and GP carry, per $100M
```

Each fund is $100M split evenly across its deals. Each deal either:

- **is written off**, recovering between nothing and a set ceiling, or
- **returns a multiple** drawn from a lognormal distribution around a typical deal.

A shared shock for each fund makes its deals rise and fall together, and makes write-offs likelier in a bad fund. The buyout, growth equity and venture presets are calibrated to plausible gross outcomes, not fitted to a dataset.

## What the model leaves out

- **Management fees**, so the GP's share here is carry alone.
- **The GP's own commitment.**
- **Exit timing.** Every deal is held for the full hold period, so the hurdle compounds over the same years for every deal.

It's an illustrative model, not investment advice.

## License

MIT. See [LICENSE](LICENSE).
