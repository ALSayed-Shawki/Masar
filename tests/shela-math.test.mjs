import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shares, balances, periodReport, toC } from '../site/js/modules/shela/math.js';

const M = [{ id: 's' }, { id: 'a' }, { id: 'g' }];
const sum = o => Object.values(o).reduce((x, y) => x + y, 0);

test('equal split never loses a halala', () => {
  const s = shares({ amount_c: 100, split_type: 'equal', participants: ['s', 'a', 'g'] });
  assert.equal(sum(s), 100);
  assert.deepEqual(Object.values(s).sort(), [33, 33, 34]);
});

test('weighted split follows the ratio', () => {
  const s = shares({ amount_c: 9000, split_type: 'shares', participants: ['s', 'a'], weights: { s: 2, a: 1 } });
  assert.deepEqual(s, { s: 6000, a: 3000 });
});

test('personal expense does not move balances', () => {
  const { b } = balances(M, [{ payer_id: 's', amount_c: 5000, split_type: 'personal', participants: ['s'] }], []);
  assert.equal(b.s.net, 0);
});

test('balances, pairwise debts and settlements add up', () => {
  const ex = [
    { payer_id: 's', amount_c: 30000, split_type: 'equal', participants: ['s', 'a', 'g'] },
    { payer_id: 'a', amount_c: 10000, split_type: 'one', participants: ['g'] },
    { payer_id: 'g', amount_c: 9000, split_type: 'shares', participants: ['s', 'a', 'g'], weights: { s: 2, a: 1, g: 0 } },
    { payer_id: 's', amount_c: 999, split_type: 'equal', participants: ['s', 'a'], deleted: true },
  ];
  const st = [{ from_member: 'a', to_member: 's', amount_c: 5000 }];
  const { b, tr, nets } = balances(M, ex, st);
  assert.equal(sum(Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.net]))), 0);
  assert.deepEqual([b.s.net, b.a.net, b.g.net], [9000, 2000, -11000]);
  assert.deepEqual(tr, [{ from: 'g', to: 's', c: 9000 }, { from: 'g', to: 'a', c: 2000 }]);
  assert.deepEqual(nets.find(n => n.from === 'a' && n.to === 's'), { from: 'a', to: 's', c: 5000 });
});

test('report excludes personal and out-of-range expenses', () => {
  const ex = [
    { payer_id: 's', amount_c: 3000, split_type: 'equal', participants: ['s', 'a', 'g'], date: '2026-10-10', category: 'أكل' },
    { payer_id: 's', amount_c: 7000, split_type: 'personal', participants: ['s'], date: '2026-10-11' },
    { payer_id: 'a', amount_c: 4000, split_type: 'equal', participants: ['a', 'g'], date: '2026-09-30' },
  ];
  const r = periodReport(M, ex, '2026-10-01', '2026-10-31');
  assert.equal(r.total, 3000);
  assert.equal(r.per.s.paid, 3000);
  assert.equal(r.per.a.used, 1000);
});

test('amount parsing accepts Arabic digits and comma', () => {
  assert.equal(toC('١٢٫٥'.replace('٫', ',')), 1250);
  assert.equal(toC('45'), 4500);
});
