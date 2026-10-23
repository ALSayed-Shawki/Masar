// Pure money math for the group. All amounts are integers in halalas (1/100).
// No DOM, no network: unit-tested in tests/shela-math.test.mjs.

export const toC = v => Math.round((parseFloat(String(v ?? '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(',', '.')) || 0) * 100);
export const money = c => (c / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
export const live = a => a.filter(x => !x.deleted);

/** Each member's share of one expense: {memberId: halalas}. Shares always sum to the total. */
export function shares(e) {
  const total = e.amount_c || 0, out = {};
  const parts = (e.participants || []).filter(Boolean);
  if (e.split_type === 'personal') { out[e.payer_id] = total; return out; }
  if (e.split_type === 'amounts') {
    for (const [k, v] of Object.entries(e.amounts || {})) if (+v) out[k] = +v;
    return out;
  }
  const w = e.split_type === 'shares' ? parts.map(p => Math.max(0, +(e.weights || {})[p] || 0)) : parts.map(() => 1);
  const sw = w.reduce((a, b) => a + b, 0);
  if (!sw) return out;
  let given = 0;
  parts.forEach((p, i) => { const v = Math.floor(total * w[i] / sw); out[p] = v; given += v; });
  let r = total - given;
  for (let i = 0; r > 0; i = (i + 1) % parts.length) if (w[i]) { out[parts[i]]++; r--; }
  return out;
}

/**
 * Balances from expenses + settlements.
 *  b[id]   = {paid, used, sent, got, net}   net > 0 → the group owes them
 *  nets    = pairwise "A owes B" after netting both directions
 *  tr      = fewest transfers that settle everyone
 */
export function balances(members, expenses, settlements) {
  const b = {}; members.forEach(m => { b[m.id] = { paid: 0, used: 0, sent: 0, got: 0, net: 0 }; });
  const pair = {};
  const add = (a, c, v) => { if (a === c || !v) return; (pair[a] ||= {}); pair[a][c] = (pair[a][c] || 0) + v; };
  live(expenses).forEach(e => {
    if (!b[e.payer_id]) return;
    b[e.payer_id].paid += e.amount_c || 0;
    for (const [k, v] of Object.entries(shares(e))) { if (b[k]) b[k].used += v; add(k, e.payer_id, v); }
  });
  live(settlements).forEach(s => {
    if (b[s.from_member]) b[s.from_member].sent += s.amount_c;
    if (b[s.to_member]) b[s.to_member].got += s.amount_c;
    add(s.to_member, s.from_member, s.amount_c);
  });
  for (const k in b) b[k].net = b[k].paid - b[k].used + b[k].sent - b[k].got;

  const ids = members.map(m => m.id), nets = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const a = ids[i], c = ids[j], v = (pair[a]?.[c] || 0) - (pair[c]?.[a] || 0);
    if (v > 0) nets.push({ from: a, to: c, c: v }); else if (v < 0) nets.push({ from: c, to: a, c: -v });
  }
  const cr = Object.entries(b).filter(([, x]) => x.net > 0).map(([k, x]) => ({ k, v: x.net })).sort((a, c) => c.v - a.v);
  const db = Object.entries(b).filter(([, x]) => x.net < 0).map(([k, x]) => ({ k, v: -x.net })).sort((a, c) => c.v - a.v);
  const tr = []; let i = 0, j = 0;
  while (i < db.length && j < cr.length) {
    const v = Math.min(db[i].v, cr[j].v);
    if (v > 0) tr.push({ from: db[i].k, to: cr[j].k, c: v });
    db[i].v -= v; cr[j].v -= v;
    if (!db[i].v) i++; if (!cr[j].v) j++;
  }
  return { b, nets, tr };
}

/** Totals for a date range [from, to] (inclusive, YYYY-MM-DD). Personal expenses are excluded. */
export function periodReport(members, expenses, from, to) {
  const ex = live(expenses).filter(e => e.date >= from && e.date <= to);
  const group = ex.filter(e => e.split_type !== 'personal');
  const per = {}; members.forEach(m => { per[m.id] = { paid: 0, used: 0 }; });
  const cats = {};
  group.forEach(e => {
    if (per[e.payer_id]) per[e.payer_id].paid += e.amount_c;
    for (const [k, v] of Object.entries(shares(e))) if (per[k]) per[k].used += v;
    const k = e.category || 'أخرى'; cats[k] = (cats[k] || 0) + e.amount_c;
  });
  return { ex, group, per, cats, total: group.reduce((s, e) => s + e.amount_c, 0) };
}
