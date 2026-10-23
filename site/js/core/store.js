// Owner's personal data, loaded once and kept in memory. Every write goes to Supabase
// (RLS: owner only), then the affected table is re-read and screens re-render.
import { sb } from './supa.js';
import { addDays, today, ymd } from './dates.js';

export const P = { uid: null, chat: [], tasks: [], projects: [], notes: [], wins: [], money: [], days: {}, goals: [], weeks: {}, settings: {}, meds: [], loaded: false };
const listeners = new Set();
export const onP = fn => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach(f => f());

const DEFAULT_PROJECTS = [
  ['محيط الأهرام', 'work'], ['الإضاءة المتطورة', 'work'], ['أكناف', 'work'], ['فاد', 'work'], ['ديموهات العملاء', 'work'],
  ['أنا بيكري', 'work'], ['ام اس للخضار', 'work'], ['ام اس للاستيراد والتصدير', 'work'],
  ['CMA', 'growth'], ['Odoo 20', 'growth'], ['الذكاء الاصطناعي', 'growth'], ['المحاسبة', 'growth'],
  ['البزنس الخاص', 'business'], ['شخصي', 'personal'],
];
const DEFAULT_GOALS = [
  ['الأهرام: أتمتة كاملة وتشغيل الإنتاج على ERP متكامل مع AI', 'work', ''],
  ['CMA: حسم القرار وبدء المذاكرة', 'growth', 'قرار: أكمل ولا لأ، وأي Part أبدأ بيها'],
  ['الإلمام بجديد Odoo 20', 'growth', ''],
  ['بدء البزنس الخاص', 'business', ''],
];

const Q = {
  tasks: () => sb.from('tasks').select('*').or(`status.eq.todo,done_at.gte.${new Date(Date.now() - 120 * 864e5).toISOString()}`),
  projects: () => sb.from('projects').select('*').eq('active', true).order('sort'),
  notes: () => sb.from('notes').select('*').order('created_at', { ascending: false }).limit(300),
  wins: () => sb.from('wins').select('*').order('date', { ascending: false }).limit(300),
  money: () => sb.from('money_entries').select('*').order('date', { ascending: false }).limit(1500),
  days: () => sb.from('day_logs').select('*').gte('date', addDays(today(), -365)),
  goals: () => sb.from('goals').select('*').order('sort'),
  weeks: () => sb.from('weeks').select('*').gte('start', addDays(today(), -120)),
  settings: () => sb.from('settings').select('*'),
  meds: () => sb.from('medications').select('*').order('created_at'),
  chat: () => sb.from('chat_messages').select('*').order('created_at', { ascending: false }).limit(200),
};
const SHAPE = {
  days: a => Object.fromEntries(a.map(x => [x.date, x])),
  weeks: a => Object.fromEntries(a.map(x => [x.start, x])),
  settings: a => Object.fromEntries(a.map(x => [x.key, x.value])),
};
const TABLE = { tasks: 'tasks', projects: 'projects', notes: 'notes', wins: 'wins', money: 'money_entries', days: 'day_logs', goals: 'goals', weeks: 'weeks', settings: 'settings', meds: 'medications', chat: 'chat_messages' };

async function fetchKey(k) {
  const { data, error } = await Q[k]();
  if (error) throw error;
  P[k] = SHAPE[k] ? SHAPE[k](data || []) : (data || []);
}

export async function loadAll() {
  const { data: { user } } = await sb.auth.getUser();
  P.uid = user.id;
  await Promise.all(Object.keys(Q).map(fetchKey));
  if (!P.projects.length && !P.settings.seeded) {
    await sb.from('projects').insert(DEFAULT_PROJECTS.map(([name, area], i) => ({ name, area, sort: i + 1 })));
    if (!P.goals.length) await sb.from('goals').insert(DEFAULT_GOALS.map(([title, area, next_step], i) => ({ title, area, next_step, sort: i + 1 })));
    await sb.from('settings').upsert({ owner_id: P.uid, key: 'seeded', value: { at: new Date().toISOString() } });
    await Promise.all(['projects', 'goals', 'settings'].map(fetchKey));
  }
  if (!P.settings.review) await sb.from('settings').upsert({ owner_id: P.uid, key: 'review', value: { enabled: true, time: '20:30', tz: 'Asia/Riyadh' } }).then(() => fetchKey('settings'));
  P.loaded = true;
  emit();
}

/** Re-read some keys after a write and refresh the screen. */
export async function refresh(...keys) { await Promise.all(keys.map(fetchKey)); emit(); }

export async function insert(key, row) {
  const { data, error } = await sb.from(TABLE[key]).insert(row).select().single();
  if (error) throw error;
  await refresh(key); return data;
}
export async function update(key, id, patch) {
  const { error } = await sb.from(TABLE[key]).update(patch).eq('id', id);
  if (error) throw error;
  await refresh(key);
}
export async function remove(key, id) {
  const { error } = await sb.from(TABLE[key]).delete().eq('id', id);
  if (error) throw error;
  await refresh(key);
}
export async function saveDay(date, patch) {
  P.days[date] = { ...(P.days[date] || { date, prayers: {}, meds: {}, qada: 0 }), ...patch };
  emit(); // optimistic
  const { error } = await sb.from('day_logs').upsert({ owner_id: P.uid, date, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'owner_id,date' });
  if (error) { await refresh('days'); throw error; }
}
export async function saveWeek(start, patch) {
  const { error } = await sb.from('weeks').upsert({ owner_id: P.uid, start, ...patch }, { onConflict: 'owner_id,start' });
  if (error) throw error;
  await refresh('weeks');
}
export async function setSetting(key, value) {
  const { error } = await sb.from('settings').upsert({ owner_id: P.uid, key, value }, { onConflict: 'owner_id,key' });
  if (error) throw error;
  await refresh('settings');
}

// helpers used by several screens
export const pName = id => P.projects.find(p => p.id === id)?.name || '';
export const openTasks = () => P.tasks.filter(t => t.status === 'todo');
export const doneDate = t => t.done_at ? ymd(new Date(t.done_at)) : '';
