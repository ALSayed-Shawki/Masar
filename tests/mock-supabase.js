// In-memory stand-in for supabase-js, used only by the UI smoke test (tests/smoke.py).
const OWNER = 'u-owner', FRIEND = 'u-friend';
const role = new URLSearchParams(location.search).get('as') || 'owner';
const uid = role === 'owner' ? OWNER : role === 'friend' ? FRIEND : null;
const user = uid ? { id: uid, email: role === 'owner' ? 'sayed@example.com' : null, is_anonymous: role !== 'owner' } : null;
const T = (window.__DB = window.__DB || {
  groups: [{ id: 'g1', owner_id: OWNER, name: 'الشلة', currency: 'ريال', invite_code: 'A1B2C3D4' }],
  group_members: [
    { id: 'm-s', group_id: 'g1', name: 'سيد', user_id: OWNER, is_owner: true, sort: 0, active: true },
    { id: 'm-a', group_id: 'g1', name: 'أحمد عثمان', user_id: role === 'friend' ? FRIEND : null, is_owner: false, sort: 1, active: true },
    { id: 'm-g', group_id: 'g1', name: 'غازي', user_id: null, is_owner: false, sort: 2, active: true },
  ],
  expenses: [
    { id: 'e1', group_id: 'g1', title: 'عشا الخميس', amount_c: 18000, date: '2026-10-22', payer_id: 'm-s', split_type: 'equal', participants: ['m-s', 'm-a', 'm-g'], weights: {}, amounts: {}, category: 'أكل', note: '', created_by: OWNER, created_by_member: 'm-s', created_at: '2026-10-22T20:00:00Z', deleted: false },
    { id: 'e2', group_id: 'g1', title: 'بقالة', amount_c: 9000, date: '2026-10-21', payer_id: 'm-a', split_type: 'one', participants: ['m-g'], weights: {}, amounts: {}, category: 'بقالة وبيت', note: '', created_by: FRIEND, created_by_member: 'm-a', created_at: '2026-10-21T20:00:00Z', deleted: false },
  ],
  settlements: [],
  projects: [], tasks: [], notes: [], wins: [], money_entries: [], goals: [], weeks: [], settings: [],
  day_logs: [], medications: [{ id: 'med1', owner_id: OWNER, name: 'فيتامين د', times: ['09:00', '21:00'], timezone: 'Asia/Riyadh', active: true, created_at: '2026-10-01' }],
  push_subscriptions: [],
});
let n = 100;
class Q {
  constructor(t) { this.t = t; this.f = []; this.op = 'select'; this.one = false; this.maybe = false; this.payload = null; }
  select() { return this; } order() { return this; } limit() { return this; }
  eq(k, v) { this.f.push(r => r[k] === v); return this; }
  gte(k, v) { this.f.push(r => r[k] >= v); return this; }
  or(expr) { const parts = expr.split(','); this.f.push(r => parts.some(p => { const [k, op, ...v] = p.split('.'); const val = v.join('.'); return op === 'eq' ? r[k] === val : op === 'gte' ? (r[k] || '') >= val : false; })); return this; }
  single() { this.one = true; return this; } maybeSingle() { this.maybe = true; return this; }
  insert(p) { this.op = 'insert'; this.payload = p; return this; }
  update(p) { this.op = 'update'; this.payload = p; return this; }
  upsert(p) { this.op = 'upsert'; this.payload = p; return this; }
  delete() { this.op = 'delete'; return this; }
  then(ok, bad) { return Promise.resolve(this.run()).then(ok, bad); }
  run() {
    const rows = T[this.t] || (T[this.t] = []);
    if (this.op === 'insert') {
      const add = p => { const r = { id: 'x' + (n++), created_at: new Date().toISOString(), owner_id: uid, deleted: false, status: 'todo', active: true, rolled: 0, priority: 1, progress: 0, dod: '', ...p }; rows.push(r); return r; };
      const out = Array.isArray(this.payload) ? this.payload.map(add) : add(this.payload);
      return { data: this.one ? out : [].concat(out), error: null };
    }
    if (this.op === 'delete') { const keep = rows.filter(r => !this.f.every(f => f(r))); rows.length = 0; rows.push(...keep); return { data: null, error: null }; }
    if (this.op === 'upsert') {
      const p = this.payload, key = { day_logs: 'date', weeks: 'start', settings: 'key' }[this.t] || 'endpoint', i = rows.findIndex(r => r[key] === p[key]);
      if (i >= 0) Object.assign(rows[i], p); else rows.push({ ...p }); return { data: null, error: null };
    }
    const hit = rows.filter(r => this.f.every(f => f(r)));
    if (this.op === 'update') { hit.forEach(r => Object.assign(r, this.payload)); return { data: null, error: null }; }
    const data = JSON.parse(JSON.stringify(hit));
    if (this.one) return { data: data[0] || null, error: data[0] ? null : { message: 'not found' } };
    if (this.maybe) return { data: data[0] || null, error: null };
    return { data, error: null };
  }
}
export function createClient() {
  return {
    auth: {
      getSession: async () => ({ data: { session: user ? { user } : null } }),
      getUser: async () => ({ data: { user } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInAnonymously: async () => ({ error: null }),
      signInWithPassword: async () => ({ error: null }), signUp: async () => ({ data: {}, error: null }), signOut: async () => ({}),
    },
    from: t => new Q(t),
    rpc: async (fn, a) => {
      if (fn === 'group_preview') return { data: { id: 'g1', name: 'الشلة', members: [{ id: 'm-a', name: 'أحمد عثمان', claimed: false }, { id: 'm-g', name: 'غازي', claimed: false }] }, error: null };
      if (fn === 'join_group') return { data: a.p_pin === '1234' ? { ok: true, group_id: 'g1', member_id: a.p_member } : { ok: false, error: 'bad_pin', left: 3 }, error: null };
      return { data: null, error: null };
    },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel() {},
    storage: { from: () => ({ upload: async () => ({ error: null }), createSignedUrl: async () => ({ data: { signedUrl: 'about:blank' }, error: null }) }) },
    functions: { invoke: async (name, o) => {
      if (name !== 'ai') return { data: { publicKey: 'x' }, error: null };
      const t = o.body.task;
      const text = t === 'capture' ? JSON.stringify([{ kind: 'task', title: 'تجهيز تقرير أعمار الديون لعميل أكناف', dod: 'التقرير متسلم', due: '', priority: 2 }, { kind: 'expense', title: 'غدا', amount: 45, currency: 'SAR', category: 'أكل وبيت' }, { kind: 'idea', title: 'باقة Odoo جاهزة للمخابز' }])
        : t === 'polish' ? JSON.stringify({ title: 'مراجعة تقرير المبيعات', dod: 'اتبعت للعميل', note: '' }) : '## الخلاصة\n- أسبوع كويس';
      return { data: { text }, error: null };
    } },
  };
}
