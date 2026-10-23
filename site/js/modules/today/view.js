// Today: week progress, focus, top 3, carried tasks, coach notes, prayers (accountability only),
// medication check-ins and the evening mood check-in.
import { esc, toast, openSheet, closeSheet, seg, segV, val, registerActions } from '../../core/dom.js';
import { today, addDays, weekStart, nowHM, hmPlus, normHM, pd, fmtWeekday, fmtFull, fmtHijri } from '../../core/dates.js';
import { azkarCard } from '../azkar/view.js';
import { lastNudge } from '../chat/view.js';
import { errText } from '../../core/supa.js';
import { CONFIG } from '../../config.js';
import { P, saveDay, saveWeek, update, refresh, openTasks, doneDate } from '../../core/store.js';
import { sb } from '../../core/supa.js';
import { taskList, byDue } from '../tasks/view.js';

export const PRAYERS = [['fajr', 'الفجر'], ['dhuhr', 'الظهر'], ['asr', 'العصر'], ['maghrib', 'المغرب'], ['isha', 'العشاء']];
const PST = { ontime: 'في وقتها', late: 'متأخرة', missed: 'فاتت' };
const CYCLE = ['', 'ontime', 'late', 'missed'];
export const MOOD = ['', 'تعبان', 'مش أحسن حاجة', 'عادي', 'كويس', 'ممتاز'];
const UI = { pDay: 't', rerender: () => {} };

const pLabel = (k, l, d) => k === 'dhuhr' && pd(d).getDay() === 5 ? 'الجمعة' : l;
export const doses = () => P.meds.filter(m => m.active).flatMap(m => m.times.map(t => ({ id: m.id, name: m.name, t, key: `${m.id}@${t}` }))).sort((a, b) => a.t.localeCompare(b.t));

export function weekStats() {
  const td = today(), ws = weekStart(td), we = addDays(ws, 6), pws = addDays(ws, -7), pwe = addDays(ws, -1);
  const done = P.tasks.filter(t => t.status === 'done' && doneDate(t) >= ws && doneDate(t) <= we);
  const prev = P.tasks.filter(t => t.status === 'done' && doneDate(t) >= pws && doneDate(t) <= pwe);
  const openDue = openTasks().filter(t => t.due && t.due <= we);
  const pct = done.length + openDue.length ? Math.round(done.length / (done.length + openDue.length) * 100) : 0;
  const active = new Set(P.tasks.map(doneDate).filter(Boolean));
  Object.values(P.days).forEach(d => { if (d.mood || Object.keys(d.prayers || {}).length) active.add(d.date); });
  let streak = 0, d = active.has(td) ? td : addDays(td, -1);
  while (active.has(d)) { streak++; d = addDays(d, -1); }
  return { td, ws, we, done, prev, openDue, pct, streak, doneToday: P.tasks.filter(t => doneDate(t) === td) };
}

function ring(p) {
  const r = 26, c = 2 * Math.PI * r;
  return `<svg viewBox="0 0 64 64" class="ring" role="img" aria-label="نسبة إنجاز الأسبوع ${p}%"><circle cx="32" cy="32" r="${r}" fill="none" stroke="var(--surface)" stroke-width="7"/><circle cx="32" cy="32" r="${r}" fill="none" stroke="var(--accent)" stroke-width="7" stroke-linecap="round" stroke-dasharray="${(c * p / 100).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 32 32)"/><text x="32" y="37" text-anchor="middle" font-size="14" fill="var(--ink)" style="font-family:var(--f-num)">${p}%</text></svg>`;
}

function prayerCard() {
  const d = UI.pDay === 'y' ? addDays(today(), -1) : today(), p = P.days[d]?.prayers || {};
  const ok = PRAYERS.filter(([k]) => p[k] === 'ontime' || p[k] === 'late').length;
  return `<section class="card"><div class="sh"><h2>الصلاة</h2><div class="chips">${[['t', 'النهارده'], ['y', 'امبارح']].map(([k, l]) => `<button class="${UI.pDay === k ? 'on' : ''}" data-act="tdDay" data-v="${k}">${l}</button>`).join('')}</div></div>
  <div class="prayers">${PRAYERS.map(([k, l]) => `<button class="pr ${p[k] || ''}" data-act="tdPrayer" data-k="${k}" data-d="${d}" aria-label="${pLabel(k, l, d)}: ${PST[p[k]] || 'لم تسجل'}"><b>${pLabel(k, l, d)}</b><span>${PST[p[k]] || 'سجّل'}</span></button>`).join('')}</div>
  <p class="hint">دوسة: في وقتها · التانية: متأخرة · التالتة: فاتت · الرابعة: تمسح. صليت <b class="num">${ok}</b> من 5.</p></section>`;
}

function medCard() {
  const ds = doses(), m = P.days[today()]?.meds || {}, now = nowHM();
  if (!ds.length) return `<section class="card"><div class="sh"><h2>الدواء</h2><button class="link" data-act="tdMeds">ضيف دواءك</button></div><p class="empty">اكتب اسم الدواء ومواعيده، وهفكّرك وأسألك خدته ولا لأ.</p></section>`;
  return `<section class="card"><div class="sh"><h2>الدواء</h2><button class="link" data-act="tdMeds">المواعيد</button></div>
  ${ds.map(x => { const st = m[x.key];
    const q = st ? `${esc(x.name)} · <span class="num">${x.t}</span>` : now >= x.t ? `خدت ${esc(x.name)} بتاع <span class="num">${x.t}</span>؟` : `${esc(x.name)} · الساعة <span class="num">${x.t}</span>`;
    const a = st === 'taken' ? `<span class="ok">خدته</span><button class="mini" data-act="tdDose" data-k="${esc(x.key)}" data-v="">تراجع</button>`
      : st === 'skipped' ? `<span class="no">ماخدتوش</span><button class="mini" data-act="tdDose" data-k="${esc(x.key)}" data-v="">تراجع</button>`
      : `<button class="mini" data-act="tdDose" data-k="${esc(x.key)}" data-v="taken">أيوه خدته</button>${now >= x.t ? `<button class="mini" data-act="tdDose" data-k="${esc(x.key)}" data-v="skipped">لأ</button>` : ''}`;
    return `<div class="dose"><span>${q}</span><span class="acts">${a}</span></div>`; }).join('')}</section>`;
}

export function renderToday(root, rerender) {
  UI.rerender = rerender;
  const st = weekStats(), td = st.td, open = openTasks();
  const h = new Date().getHours(), greet = h < 12 ? 'صباح الخير يا سيد' : h < 17 ? 'يومك ماشي إزاي يا سيد؟' : 'مساء الخير يا سيد';
  const diff = st.done.length - st.prev.length;
  const line = st.done.length ? `أنجزت <b class="num">${st.done.length}</b> مهمة الأسبوع ده${st.prev.length ? (diff >= 0 ? `، أكتر من اللي فات بـ <b class="num">${diff}</b>` : `، أقل من اللي فات بـ <b class="num">${-diff}</b>`) : ''}.` : 'الأسبوع لسه بادئ. أول مهمة تخلصها هتفتح العداد.';
  const focus = P.tasks.filter(t => t.focus_date === td).sort((a, b) => (a.status === 'done') - (b.status === 'done'));
  const dueToday = open.filter(t => t.due === td && t.focus_date !== td).sort(byDue);
  const carried = open.filter(t => t.due && t.due < td).sort(byDue);
  const inbox = open.filter(t => !t.due).length;
  const wk = (P.weeks[st.ws]?.focus || []).filter(Boolean), day = P.days[td];

  const notes = [];
  const lateDoses = doses().filter(x => !(day?.meds || {})[x.key] && nowHM() >= hmPlus(x.t, 60));
  if (lateDoses.length) notes.push(`لسه مسجلتش الدواء بتاع ${lateDoses.map(x => x.t).join(' و')}. خدته؟`);
  const yp = P.days[addDays(td, -1)]?.prayers || {}, ym = PRAYERS.filter(([k]) => yp[k] === 'missed').length;
  if (ym) notes.push(`فاتك ${ym} ${ym > 1 ? 'فروض' : 'فرض'} امبارح. اقضيهم النهارده، وسجّل القضاء من الميزان.`);
  open.filter(t => (t.rolled || 0) >= 3).slice(0, 2).forEach(t => notes.push(`«${esc(t.title)}» اترحّلت ${t.rolled} مرات. قسّمها لخطوة أصغر أو خد قرار تلغيها.`));
  const noDod = open.filter(t => !t.dod && (t.priority || 1) >= 2).length;
  if (noDod) notes.push(`${noDod} مهام مهمة من غير تعريف إنجاز. من غيره مش هتعرف امتى خلصت.`);
  const projs = new Set(st.doneToday.map(t => t.project_id).filter(Boolean));
  if (projs.size >= 4) notes.push(`اشتغلت النهارده على ${projs.size} مشاريع. التنقل الكتير بياكل التركيز؛ جمّع شغل كل مشروع في بلوك واحد.`);
  if (inbox > 10) notes.push(`عندك ${inbox} مهمة من غير موعد. خصص 10 دقايق تفرزها: موعد، تفويض، أو حذف.`);

  const nudge = lastNudge();
  root.innerHTML = `
  <section class="datebar"><span class="wd">النهارده ${fmtWeekday(td)}</span><span>${fmtFull(td)}</span><span class="hint">${fmtHijri(td)}</span></section>
  <section class="card soft hero-grid"><div><h1 class="big">${greet}</h1><p style="margin:4px 0 0;font-size:14px">${line}</p>
    <span class="streak">سلسلة الأيام المنظمة <b class="num">${st.streak}</b> يوم</span></div>${ring(st.pct)}</section>
  ${notes.length ? `<section class="card warn"><div class="sh"><h2>انتبه</h2></div><ul class="coach">${notes.slice(0, 4).map(n => `<li>${n}</li>`).join('')}</ul></section>` : ''}
  <section class="card"><div class="sh"><h2>أهم 3 النهارده</h2><span class="count num">${focus.filter(t => t.status === 'done').length}/${focus.length || 3}</span></div>
    ${focus.length ? taskList(focus) : '<p class="empty">دوس النجمة ★ جنب أي مهمة عشان تختارها من أهم 3.</p>'}</section>
  ${nudge ? `<a class="card linkcard" href="#/chat"><span><b>رفيقك بيسأل</b><br><span class="hint">${esc(nudge.text.slice(0, 90))}</span></span><span class="go">رد</span></a>` : ''}
  ${prayerCard()}
  ${azkarCard()}
  ${medCard()}
  ${dueToday.length ? `<section class="card"><div class="sh"><h2>مستحقة النهارده</h2><span class="count num">${dueToday.length}</span></div>${taskList(dueToday)}</section>` : ''}
  ${carried.length ? `<section class="card"><div class="sh"><h2>مترحّلة من أيام فاتت</h2><button class="link" data-act="tdCarryAll">انقل الكل للنهارده</button></div>${taskList(carried.slice(0, 8))}${carried.length > 8 ? `<p class="hint">و${carried.length - 8} كمان في المهام.</p>` : ''}</section>` : ''}
  <section class="card"><div class="sh"><h2>تركيز الأسبوع</h2><button class="link" data-act="tdWeek">${wk.length ? 'تعديل' : 'حدّده'}</button></div>
    ${wk.length ? `<ul class="coach">${wk.map(f => `<li>${esc(f)}</li>`).join('')}</ul>` : '<p class="empty">اختار من هدف لتلاتة يبقوا محور الأسبوع. لو حصل طارئ غيّرهم بوعي.</p>'}</section>
  <section class="card"><div class="sh"><h2>تسجيل اليوم</h2><button class="link" data-act="tdCheckin">${day?.mood ? 'تعديل' : 'سجّل'}</button></div>
    ${day?.mood ? `<p style="margin:0">المزاج <b class="num">${day.mood}/5</b> (${MOOD[day.mood] || ''}) · الطاقة <b class="num">${day.energy}/5</b>${day.word ? ` · «${esc(day.word)}»` : ''}</p>${day.highlight ? `<p class="hint">${esc(day.highlight)}</p>` : ''}` : '<p class="empty">آخر اليوم: مزاجك وطاقتك من 1 لـ5 وكلمة تلخص اليوم. دقيقة واحدة.</p>'}</section>
  ${inbox ? `<a class="card linkcard" href="#/tasks"><span><b>الـInbox</b><br><span class="hint">${inbox} مهمة من غير موعد</span></span><span class="go">افرزها</span></a>` : ''}
  <a class="card linkcard" href="#/shela"><span><b>حساب الشلة</b><br><span class="hint">مين عليه ومين ليه</span></span><span class="go">افتح</span></a>`;
}

registerActions({
  tdDay: el => { UI.pDay = el.dataset.v; UI.rerender(); },
  tdPrayer: el => { const d = el.dataset.d, k = el.dataset.k, p = { ...(P.days[d]?.prayers || {}) }; const nx = CYCLE[(CYCLE.indexOf(p[k] || '') + 1) % CYCLE.length]; if (nx) p[k] = nx; else delete p[k]; saveDay(d, { prayers: p }).catch(x => toast(errText(x))); },
  tdDose: el => { const td = today(), m = { ...(P.days[td]?.meds || {}) }; if (el.dataset.v) m[el.dataset.k] = el.dataset.v; else delete m[el.dataset.k]; saveDay(td, { meds: m }).then(() => { if (el.dataset.v === 'taken') toast('تمام، اتسجل'); }).catch(x => toast(errText(x))); },
  tdCarryAll: async () => { const td = today(); try { for (const t of openTasks().filter(t => t.due && t.due < td)) await sb.from('tasks').update({ due: td, rolled: (t.rolled || 0) + 1 }).eq('id', t.id); await refresh('tasks'); toast('اتنقلوا للنهارده'); } catch (x) { toast(errText(x)); } },
  tdWeek: () => { const ws = weekStart(today()), f = P.weeks[ws]?.focus || [];
    openSheet(`<h3>تركيز الأسبوع</h3><p class="hint">من هدف لتلاتة بس. الباقي يستنى.</p>${[0, 1, 2].map(i => `<input id="w-${i}" value="${esc(f[i] || '')}" placeholder="${['مثال: تسليم موديول تقارير الأهرام', 'مثال: ديمو الارتكاز الماسي', 'مثال: قرار CMA'][i]}">`).join('')}
    <div class="actions"><button class="btn primary block" data-act="tdSaveWeek">حفظ</button></div>`); },
  tdSaveWeek: async () => { try { await saveWeek(weekStart(today()), { focus: [0, 1, 2].map(i => val('w-' + i)).filter(Boolean) }); closeSheet(); toast('تركيز الأسبوع اتحدد'); } catch (x) { toast(errText(x)); } },
  tdCheckin: () => { const d = P.days[today()] || {};
    openSheet(`<h3>تسجيل اليوم</h3>
    <div class="fld"><span>المزاج</span>${seg('d-mood', [1, 2, 3, 4, 5].map(n => [n, `${n} ${MOOD[n]}`]), d.mood || '')}</div>
    <div class="fld"><span>الطاقة</span>${seg('d-energy', [1, 2, 3, 4, 5].map(n => [n, n]), d.energy || '')}</div>
    <label class="fld"><span>كلمة تلخص اليوم</span><input id="d-word" value="${esc(d.word || '')}" maxlength="40"></label>
    <label class="fld"><span>أحسن حاجة حصلت النهارده (اختياري)</span><textarea id="d-hl" rows="2">${esc(d.highlight || '')}</textarea></label>
    <div class="actions"><button class="btn primary block" data-act="tdSaveCheckin">حفظ</button></div>`); },
  tdSaveCheckin: async () => { const mood = +segV('d-mood'), energy = +segV('d-energy'); if (!mood || !energy) return toast('اختار المزاج والطاقة');
    try { await saveDay(today(), { mood, energy, word: val('d-word'), highlight: val('d-hl') }); closeSheet(); toast('تسجيل اليوم اتحفظ'); } catch (x) { toast(errText(x)); } },
  tdMeds: () => { const it = P.meds.filter(m => m.active);
    const row = (i, m) => `<div class="medrow" data-i="${i}"><label class="fld"><span>الدواء</span><input class="md-n" value="${esc(m?.name || '')}" placeholder="اسم الدواء"></label>
      <div class="fld"><span>المواعيد</span><div class="times">${(m?.times?.length ? m.times : ['09:00']).map(t => `<input type="time" class="md-t" value="${t}">`).join('')}<button type="button" class="mini" data-act="tdAddTime">+ ميعاد</button></div></div></div>`;
    openSheet(`<h3>الدواء ومواعيده</h3><p class="hint">هيوصلك إشعار في الميعاد، وتاني بعد ساعة لو مسجلتش. سيب الاسم فاضي عشان تشيل دواء.</p>
    <div id="med-rows" style="display:grid;gap:12px">${(it.length ? it : [null]).map((m, i) => row(i, m)).join('')}</div>
    <button class="btn ghost sm" data-act="tdAddMed">+ دواء تاني</button>
    <div class="actions"><button class="btn primary block" data-act="tdSaveMeds">حفظ</button></div>`); },
  tdAddTime: el => { const i = document.createElement('input'); i.type = 'time'; i.className = 'md-t'; i.value = '21:00'; el.before(i); },
  tdAddMed: () => { const box = document.getElementById('med-rows'); const n = box.children.length;
    box.insertAdjacentHTML('beforeend', `<div class="medrow" data-i="${n}"><label class="fld"><span>الدواء</span><input class="md-n" placeholder="اسم الدواء"></label><div class="fld"><span>المواعيد</span><div class="times"><input type="time" class="md-t" value="09:00"><button type="button" class="mini" data-act="tdAddTime">+ ميعاد</button></div></div></div>`); },
  tdSaveMeds: async el => {
    const old = P.meds.filter(m => m.active), rows = [];
    for (const [i, r] of [...document.querySelectorAll('.medrow')].entries()) {
      const name = r.querySelector('.md-n').value.trim(); if (!name) continue;
      const times = [...r.querySelectorAll('.md-t')].map(x => normHM(x.value)).filter(Boolean);
      if (!times.length) return toast(`حدد ميعاد لـ«${name}»`);
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
      await refresh('meds'); closeSheet(); toast('اتحفظت المواعيد');
    } catch (x) { el.disabled = false; toast(errText(x)); }
  },
});
