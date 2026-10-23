// Today: prayer accountability (no reminders), medication check-ins, quick links.
import { $, esc, toast, openSheet, closeSheet, val, registerActions } from '../../core/dom.js';
import { today, addDays, weekStart, dayDiff, nowHM, hmPlus, normHM, pd } from '../../core/dates.js';
import { sb, errText } from '../../core/supa.js';
import { CONFIG } from '../../config.js';

const PRAYERS = [['fajr', 'الفجر'], ['dhuhr', 'الظهر'], ['asr', 'العصر'], ['maghrib', 'المغرب'], ['isha', 'العشاء']];
const PST = { ontime: 'في وقتها', late: 'متأخرة', missed: 'فاتت' };
const CYCLE = ['', 'ontime', 'late', 'missed'];
const T = { days: {}, meds: [], pDay: 't', uid: null, loaded: false, rerender: () => {} };

const pLabel = (k, l, d) => k === 'dhuhr' && pd(d).getDay() === 5 ? 'الجمعة' : l;
const doses = () => T.meds.filter(m => m.active).flatMap(m => m.times.map(t => ({ id: m.id, name: m.name, t, key: `${m.id}@${t}` }))).sort((a, b) => a.t.localeCompare(b.t));

export async function loadToday() {
  const { data: { user } } = await sb.auth.getUser(); T.uid = user.id;
  const [d, m] = await Promise.all([
    sb.from('day_logs').select('date,prayers,meds,qada').gte('date', addDays(today(), -365)),
    sb.from('medications').select('*').order('created_at'),
  ]);
  if (d.error || m.error) throw d.error || m.error;
  T.days = Object.fromEntries((d.data || []).map(x => [x.date, x]));
  T.meds = m.data || []; T.loaded = true;
}

async function saveDay(date, patch) {
  T.days[date] = { ...(T.days[date] || { date, prayers: {}, meds: {}, qada: 0 }), ...patch };
  T.rerender();
  const { error } = await sb.from('day_logs').upsert({ owner_id: T.uid, date, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'owner_id,date' });
  if (error) { toast(errText(error)); await loadToday(); T.rerender(); return false; }
  return true;
}

function prayerCard() {
  const d = T.pDay === 'y' ? addDays(today(), -1) : today(), p = T.days[d]?.prayers || {};
  const ok = PRAYERS.filter(([k]) => p[k] === 'ontime' || p[k] === 'late').length;
  return `<section class="card"><div class="sh"><h2>الصلاة</h2><div class="chips">${[['t', 'النهارده'], ['y', 'امبارح']].map(([k, l]) => `<button class="${T.pDay === k ? 'on' : ''}" data-act="tdDay" data-v="${k}">${l}</button>`).join('')}</div></div>
  <div class="prayers">${PRAYERS.map(([k, l]) => `<button class="pr ${p[k] || ''}" data-act="tdPrayer" data-k="${k}" data-d="${d}" aria-label="${pLabel(k, l, d)}: ${PST[p[k]] || 'لم تسجل'}"><b>${pLabel(k, l, d)}</b><span>${PST[p[k]] || 'سجّل'}</span></button>`).join('')}</div>
  <p class="hint">دوسة: في وقتها · التانية: متأخرة · التالتة: فاتت · الرابعة: تمسح. صليت <b class="num">${ok}</b> من 5.</p></section>`;
}

function medCard() {
  const ds = doses(), m = T.days[today()]?.meds || {}, now = nowHM();
  if (!ds.length) return `<section class="card"><div class="sh"><h2>الدوا</h2><button class="link" data-act="tdMeds">ضيف دواك</button></div><p class="empty">اكتب اسم الدوا ومواعيده، وهفكّرك وأسألك خدته ولا لأ.</p></section>`;
  return `<section class="card"><div class="sh"><h2>الدوا</h2><button class="link" data-act="tdMeds">المواعيد</button></div>
  ${ds.map(x => { const st = m[x.key];
    const q = st ? `${esc(x.name)} · <span class="num">${x.t}</span>` : now >= x.t ? `خدت ${esc(x.name)} بتاع <span class="num">${x.t}</span>؟` : `${esc(x.name)} · الساعة <span class="num">${x.t}</span>`;
    const a = st === 'taken' ? `<span class="ok">خدته</span><button class="mini" data-act="tdDose" data-k="${esc(x.key)}" data-v="">تراجع</button>`
      : st === 'skipped' ? `<span class="no">ماخدتوش</span><button class="mini" data-act="tdDose" data-k="${esc(x.key)}" data-v="">تراجع</button>`
      : `<button class="mini" data-act="tdDose" data-k="${esc(x.key)}" data-v="taken">أيوه خدته</button>${now >= x.t ? `<button class="mini" data-act="tdDose" data-k="${esc(x.key)}" data-v="skipped">لأ</button>` : ''}`;
    return `<div class="dose"><span>${q}</span><span class="acts">${a}</span></div>`; }).join('')}</section>`;
}

function statsCard() {
  const td = today(), first = Object.keys(T.days).sort()[0] || td, wsRaw = weekStart(td), ws = first > wsRaw ? first : wsRaw;
  const days = dayDiff(td, ws) + 1, tot = days * 5;
  let ontime = 0, late = 0, missed = 0, blank = 0;
  for (let d = ws; d <= td; d = addDays(d, 1)) { const p = T.days[d]?.prayers || {}; PRAYERS.forEach(([k]) => { const v = p[k]; if (v === 'ontime') ontime++; else if (v === 'late') late++; else if (v === 'missed') missed++; else blank++; }); }
  const allMissed = Object.values(T.days).reduce((s, d) => s + PRAYERS.filter(([k]) => d.prayers?.[k] === 'missed').length, 0);
  const qada = Object.values(T.days).reduce((s, d) => s + (d.qada || 0), 0), owed = Math.max(0, allMissed - qada);
  const md = doses(); let taken = 0;
  for (let d = ws; d <= td; d = addDays(d, 1)) { const m = T.days[d]?.meds || {}; md.forEach(x => { if (m[x.key] === 'taken') taken++; }); }
  const bar = (n, v, max, cls = '') => `<div class="bar"><span class="n">${n}</span><div class="track"><div class="fill ${cls}" style="width:${max ? v / max * 100 : 0}%"></div></div><span class="num">${v}${max ? '/' + max : ''}</span></div>`;
  return `<section class="card"><div class="sh"><h2>حسابك الأسبوع ده</h2><span class="count">${ws === wsRaw ? 'من السبت' : 'من أول يوم سجّلت'}</span></div>
  <div class="bars">${bar('في وقتها', ontime, tot)}${bar('متأخرة', late, 0, 'gold')}${bar('فاتت', missed, 0, 'neg')}${md.length ? bar('الدوا', taken, md.length * days) : ''}</div>
  ${blank ? `<p class="hint">${blank} فرض لسه متسجلش.</p>` : ''}
  <div class="row"><b>عليك قضاء <span class="num">${owed}</span></b><button class="mini" data-act="tdQada" ${owed ? '' : 'disabled'}>قضيت فرض</button><small>الفروض اللي فاتت في آخر سنة ناقص اللي قضيته</small></div></section>`;
}

export function renderToday(root, rerender) {
  T.rerender = rerender;
  $('#fab').hidden = true;
  if (!T.loaded) { root.innerHTML = '<section class="card"><div class="skel"></div><div class="skel" style="width:70%"></div></section>'; loadToday().then(rerender).catch(e => { root.innerHTML = `<section class="card"><p class="empty">${esc(errText(e))}</p></section>`; }); return; }
  const td = today(), h = new Date().getHours();
  const yp = T.days[addDays(td, -1)]?.prayers || {}, ym = PRAYERS.filter(([k]) => yp[k] === 'missed').length;
  const lateDoses = doses().filter(x => !(T.days[td]?.meds || {})[x.key] && nowHM() >= hmPlus(x.t, 60));
  const notes = [];
  if (lateDoses.length) notes.push(`لسه مسجلتش دوا ${lateDoses.map(x => x.t).join(' و')}. خدته؟`);
  if (ym) notes.push(`فاتك ${ym} ${ym > 1 ? 'فروض' : 'فرض'} امبارح. اقضيهم النهارده قبل ما يتراكموا.`);
  root.innerHTML = `
  <section class="card soft"><h1 class="big">${h < 12 ? 'صباح الخير يا سيد' : h < 17 ? 'يومك ماشي إزاي يا سيد؟' : 'مساء الخير يا سيد'}</h1></section>
  ${notes.length ? `<section class="card warn"><ul style="margin:0;padding-inline-start:18px">${notes.map(n => `<li>${n}</li>`).join('')}</ul></section>` : ''}
  ${prayerCard()}
  ${medCard()}
  ${statsCard()}
  <a class="card linkcard" href="#/shela"><span><b>حساب الشلة</b><br><span class="hint">مين عليه ومين ليه</span></span><span class="go">افتح</span></a>
  ${CONFIG.LEGACY_URL ? `<a class="card linkcard" href="${esc(CONFIG.LEGACY_URL)}" target="_blank" rel="noopener"><span><b>المهام والأهداف</b><br><span class="hint">لسه على نسخة Claude لحد ما ننقلها هنا</span></span><span class="go">افتح</span></a>` : ''}`;
}

registerActions({
  tdDay: el => { T.pDay = el.dataset.v; T.rerender(); },
  tdPrayer: el => { const d = el.dataset.d, k = el.dataset.k, p = { ...(T.days[d]?.prayers || {}) }; const nx = CYCLE[(CYCLE.indexOf(p[k] || '') + 1) % CYCLE.length]; if (nx) p[k] = nx; else delete p[k]; saveDay(d, { prayers: p }); },
  tdDose: async el => { const td = today(), m = { ...(T.days[td]?.meds || {}) }; if (el.dataset.v) m[el.dataset.k] = el.dataset.v; else delete m[el.dataset.k]; if (await saveDay(td, { meds: m }) && el.dataset.v === 'taken') toast('تمام، اتسجل'); },
  tdQada: async () => { const td = today(); if (await saveDay(td, { qada: (T.days[td]?.qada || 0) + 1 })) toast('تقبّل الله'); },
  tdMeds: () => {
    const it = T.meds.filter(m => m.active);
    openSheet(`<h3>الدوا ومواعيده</h3><p class="hint">المواعيد بصيغة 24 ساعة ومفصولة بفاصلة، مثال: 09:00, 21:00. هيوصلك إشعار في الميعاد، وتاني بعد ساعة لو مسجلتش.</p>
    ${[0, 1, 2, 3].map(i => `<div class="row2"><label class="fld"><span>الدوا ${i + 1}</span><input id="md-n-${i}" value="${esc(it[i]?.name || '')}"></label><label class="fld"><span>المواعيد</span><input id="md-t-${i}" dir="ltr" value="${esc((it[i]?.times || []).join(', '))}" placeholder="09:00"></label></div>`).join('')}
    <div class="actions"><button class="btn primary block" data-act="tdSaveMeds">حفظ</button></div>`);
  },
  tdSaveMeds: async el => {
    const old = T.meds.filter(m => m.active), rows = [];
    for (const i of [0, 1, 2, 3]) {
      const name = val('md-n-' + i); if (!name) continue;
      const times = val('md-t-' + i).split(/[,،\s]+/).filter(Boolean).map(normHM);
      if (!times.length || times.includes(null)) return toast(`مواعيد «${name}» مش مظبوطة. اكتبها زي 09:00`);
      rows.push({ id: old[i]?.id, name, times: [...new Set(times)].sort() });
    }
    el.disabled = true;
    try {
      for (const r of rows) {
        const q = r.id ? sb.from('medications').update({ name: r.name, times: r.times, active: true }).eq('id', r.id)
                       : sb.from('medications').insert({ name: r.name, times: r.times, timezone: CONFIG.TIMEZONE });
        const { error } = await q; if (error) throw error;
      }
      const keep = new Set(rows.map(r => r.id).filter(Boolean));
      for (const m of old) if (!keep.has(m.id)) { const { error } = await sb.from('medications').update({ active: false }).eq('id', m.id); if (error) throw error; }
      await loadToday(); closeSheet(); T.rerender(); toast('اتحفظت المواعيد');
    } catch (x) { el.disabled = false; toast(errText(x)); }
  },
});
