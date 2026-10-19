import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distribute, totals, gpCarry, european, american, preferredReturn } from '../src/waterfall.js';

const STD = { hurdle: 0.08, years: 5, catchUp: 1, carry: 0.2 };
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('2x fund with full catch-up: GP ends with exactly carry share of profit', () => {
  const t = totals(distribute(200, 100, STD));
  close(t.gp, 20);
  close(t.lp, 180);
});

test('tiers fill in order: capital, then preferred return, then catch-up, then the split', () => {
  const pref = preferredReturn(100, 0.08, 5);          // 46.93...
  const [roc, pr, cu, split] = distribute(200, 100, STD);
  close(roc.lp, 100); close(roc.gp, 0);
  close(pr.lp, pref); close(pr.gp, 0);
  close(cu.gp, 0.2 * pref / 0.8); close(cu.lp, 0);
  close(split.lp + split.gp, 200 - 100 - pref - 0.2 * pref / 0.8);
  close(split.gp / (split.lp + split.gp), 0.2);
});

test('a fund that loses money pays no carry and returns everything to LPs', () => {
  const t = totals(distribute(80, 100, STD));
  close(t.gp, 0); close(t.lp, 80);
});

test('profit below the hurdle goes entirely to LPs', () => {
  const t = totals(distribute(130, 100, STD));          // 30 profit < 46.9 preferred return
  close(t.gp, 0); close(t.lp, 130);
});

test('no catch-up: GP only shares profit above the hurdle', () => {
  const terms = { ...STD, catchUp: 0 };
  const pref = preferredReturn(100, 0.08, 5);
  close(totals(distribute(200, 100, terms)).gp, 0.2 * (100 - pref));
});

test('catch-up at or below carry never catches up: the catch-up tier takes the rest', () => {
  const terms = { ...STD, catchUp: 0.2 };
  const [, , cu, split] = distribute(300, 100, terms);
  close(split.lp + split.gp, 0);
  close(cu.gp, 0.2 * (300 - 100 - preferredReturn(100, 0.08, 5)));
});

test('nothing is created or lost: tiers always add up to proceeds', () => {
  for (const proceeds of [0, 50, 100, 140, 160, 200, 500])
    for (const catchUp of [0, 0.5, 1])
      for (const carry of [0, 0.2, 0.3]) {
        const t = totals(distribute(proceeds, 100, { ...STD, catchUp, carry }));
        close(t.lp + t.gp, proceeds, 1e-9);
      }
});

test('gpCarry matches the GP total from distribute', () => {
  for (const proceeds of [0, 90, 120, 150, 170, 250, 900])
    for (const terms of [STD, { ...STD, catchUp: 0 }, { ...STD, catchUp: 0.5, hurdle: 0 }, { ...STD, carry: 0.3, years: 8 }])
      close(gpCarry(proceeds, 100, terms), totals(distribute(proceeds, 100, terms)).gp);
});

test('European pools the deals: one loser drags down the whole fund', () => {
  const deals = [{ cost: 50, exit: 0 }, { cost: 50, exit: 150 }];   // 1.5x fund, 3x winner
  const eu = european(deals, STD), am = american(deals, STD);
  close(eu.proceeds, 150); close(eu.capital, 100);
  // 50 of profit clears the 46.9 preferred return by 3.07, all of which the full catch-up gives the GP
  close(eu.gp, 50 - preferredReturn(100, 0.08, 5));
  assert.ok(am.gp > eu.gp, 'deal-by-deal pays the GP more when a loser is offset by a winner');
  close(am.gp, totals(distribute(150, 50, STD)).gp);               // the write-off pays nothing on its own
});

test('American with identical deals matches European', () => {
  const deals = Array.from({ length: 5 }, () => ({ cost: 20, exit: 40 }));
  close(american(deals, STD).gp, european(deals, STD).gp);
});
