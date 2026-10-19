import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDraws, makeResults, simulate, PRESETS, mulberry32, normInv, normCdf } from '../src/simulation.js';
import { gpCarry } from '../src/waterfall.js';

const termsOf = P => ({ hurdle: P.h / 100, years: P.T, catchUp: P.c / 100, carry: P.k / 100 });

test('mulberry32 is deterministic and in [0, 1)', () => {
  const a = mulberry32(42), b = mulberry32(42);
  for (let i = 0; i < 1000; i++) { const x = a(); assert.equal(x, b()); assert.ok(x >= 0 && x < 1); }
});

test('normInv inverts normCdf', () => {
  for (const p of [0.01, 0.08, 0.25, 0.5, 0.9, 0.99]) assert.ok(Math.abs(normCdf(normInv(p)) - p) < 1e-9);
  assert.equal(normInv(0), -Infinity);
  assert.equal(normInv(1), Infinity);
});

test('same seed, same funds; different seed, different funds', () => {
  const P = PRESETS.buyout, t = termsOf(P);
  const r1 = simulate(makeDraws(1, 200), P, t), r2 = simulate(makeDraws(1, 200), P, t), r3 = simulate(makeDraws(2, 200), P, t);
  assert.deepEqual(r1.multiple, r2.multiple);
  assert.notDeepEqual(r1.multiple, r3.multiple);
});

test('European carry is a function of the fund multiple alone', () => {
  const P = PRESETS.buyout, t = termsOf(P), r = simulate(makeDraws(3, 500), P, t);
  for (let f = 0; f < 500; f++) assert.ok(Math.abs(r.euCarry[f] - gpCarry(r.multiple[f] * 100, 100, t)) < 1e-9);
});

test('without a catch-up, American pays at least as much as European in every fund', () => {
  // with no catch-up the GP's share is convex in proceeds, so splitting the fund deal by deal can only add carry;
  // with a catch-up it isn't, and a fund of deals that each just clear the hurdle can pay the GP less deal by deal
  const P = PRESETS.venture, t = termsOf(P);
  assert.equal(t.catchUp, 0);
  const r = simulate(makeDraws(4, 500), P, t);
  for (let f = 0; f < 500; f++) assert.ok(r.amCarry[f] >= r.euCarry[f] - 1e-9, `fund ${f}`);
});

test('changing a term reruns the same funds: gross multiples do not move', () => {
  const P = PRESETS.growth, d = makeDraws(5, 300);
  const a = Float64Array.from(simulate(d, P, termsOf(P)).multiple);
  const b = simulate(d, P, { ...termsOf(P), carry: 0.3, hurdle: 0 }).multiple;
  assert.deepEqual(a, b);
});

test('write-off rate lands near the dial; presets give plausible fund multiples', () => {
  for (const P of Object.values(PRESETS)) {
    const r = simulate(makeDraws(6), P, termsOf(P));
    assert.ok(Math.abs(r.lossWriteOff - P.wo / 100) < 0.02, `${P.name} write-offs ${r.lossWriteOff}`);
    const sorted = Float64Array.from(r.multiple).sort(), median = sorted[sorted.length >> 1];
    assert.ok(median > 0.8 && median < 3.5, `${P.name} median ${median}`);
  }
});

test('results can be reused between runs', () => {
  const d = makeDraws(7, 100), out = makeResults(d), P = PRESETS.venture;
  assert.equal(simulate(d, P, termsOf(P), out), out);
  const first = Float64Array.from(out.euCarry);
  simulate(d, { ...P, med: 2 }, termsOf(P), out);
  assert.notDeepEqual(first, out.euCarry);
});
