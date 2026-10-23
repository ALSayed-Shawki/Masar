// Today = the work console: quick-add today's requests per project, tick them off with a note,
// evening review to move what didn't close; plus prayers, azkar, medication and the mood check-in.
import { esc, toast, openSheet, closeSheet, seg, segV, val, registerActions } from '../../core/dom.js';
import { today, addDays, weekStart, nowHM, hmPlus, normHM, pd, fmtWeekday, fmtFull, fmtHijri } from '../../core/dates.js';
import { azkarCard } from '../azkar/view.js';
import { lastNudge } from '../chat/view.js';
import { errText } from '../../core/supa.js';
import { CONFIG } from '../../config.js';
import { P, saveDay, saveWeek, update, insert, refresh, openTasks, doneDate } from '../../core/store.js';
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
  const td = today(), open = openTasks(), st = weekStats();
  // the work board: anything due today or earlier, or starred for today
  const board = open.filter(t => (t.due && t.due <= td) || t.focus_date === td).sort(byDue);
  const doneToday = P.tasks.filter(t => doneDate(t) === td);
  const groups = new Map();
  board.forEach(t => { const k = t.project_id || ''; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(t); });
  const work = P.projects.filter(p => p.status !== 'done' && (p.area === 'work' || p.area === 'business'));
  let last = ''; try { last = localStorage.getItem('masar.lastProject') || ''; } catch {}
  const hour = new Date().getHours(), lateToday = board.length;
  const day = P.days[td], nudge = lastNudge();

  const notes = [];
  const lateDoses = doses().filter(x => !(day?.meds || {})[x.key] && nowHM() >= hmPlus(x.t, 60));
  if (lateDoses.length) notes.push(`لسه مسجلتش الدواء بتاع ${lateDoses.map(x => x.t).join(' و')}. خدته؟`);
  const yp = P.days[addDays(td, -1)]?.prayers || {}, ym = PRAYERS.filter(([k]) => yp[k] === 'missed').length;
  if (ym) notes.push(`فاتك ${ym} ${ym > 1 ? 'فروض' : 'فرض'} امبارح. اقضيهم النهارده، وسجّل القضاء من الميزان.`);
  open.filter(t => (t.rolled || 0) >= 3).slice(0, 2).forEach(t => notes.push(`«${esc(t.title)}» اترحّلت ${t.rolled} مرات. قسّمها لخطوة أصغر أو خد قرار تلغيها.`));
  const projs = new Set(doneToday.map(t => t.project_id).filter(Boolean));
  if (projs.size >= 4) notes.push(`اشتغلت النهارده على ${projs.size} مشاريع. التنقل الكتير بياكل التركيز؛ جمّع شغل كل مشروع في بلوك واحد.`);

  const block = (pid, items) => { const p = P.projects.find(x => x.id === pid);
    return `<section class="card"><div class="sh"><h2>${p ? `<a class="plink" href="#/project/${p.id}">${esc(p.name)}</a>` : 'من غير مشروع'}</h2><span class="count num">${items.length}</span></div>${taskList(items)}</section>`; };

  root.innerHTML = `
  <section class="datebar"><span class="wd">النهارده ${fmtWeekday(td)}</span><span>${fmtFull(td)}</span><span class="hint">${fmtHijri(td)}</span></section>
  <form class="card quickadd" id="qa" autocomplete="off">
    <div class="qa-row"><select id="qa-proj" aria-label="المشروع"><option value="">من غير مشروع</option>${work.map(p => `<option value="${p.id}" ${p.id === last ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
    <label class="qa-kind"><input type="checkbox" id="qa-req" checked> طلب النهارده</label></div>
    <div class="qa-row"><input id="qa-text" placeholder="اتطلب منك إيه؟ أو حاجة لازم تخلص…" enterkeyhint="done"><button class="btn primary" type="submit">إضافة</button></div>
  </form>
  ${hour >= 19 && lateToday ? `<a class="card linkcard warnc" href="#/review"><span><b>آخر اليوم</b><br><span class="hint">فاضل ${lateToday} مخلصتش. ننقلهم لإمتى؟</span></span><span class="go">راجع</span></a>` : ''}
  <div class="progress-line"><span>خلصت <b class="num">${doneToday.length}</b> من <b class="num">${doneToday.length + board.length}</b> النهارده</span><span class="hint">الأسبوع: <b class="num">${st.done.length}</b> · <a class="link" href="#/ledger">الميزان</a></span></div>
  ${groups.size ? [...groups.entries()].sort((a, b) => (a[0] ? 0 : 1) - (b[0] ? 0 : 1)).map(([pid, items]) => block(pid, items)).join('') : '<section class="card"><p class="empty">مفيش حاجة مستحقة النهارده. سجّل أي طلب يجيلك من فوق، أو اختار من المهام بالنجمة ★.</p></section>'}
  ${doneToday.length ? `<details class="card donecard"><summary><b>اللي خلص النهارده</b> <span class="num">${doneToday.length}</span></summary>${doneToday.map(t => `<div class="item"><p>✓ ${esc(t.title)}${t.project_id ? ` <span class="chip">${esc(P.projects.find(p => p.id === t.project_id)?.name || '')}</span>` : ''}</p>${t.done_note ? `<p class="hint">${esc(t.done_note)}</p>` : `<button class="mini" data-act="tdNote" data-id="${t.id}">ضيف ملاحظة</button>`}</div>`).join('')}</details>` : ''}
  ${notes.length ? `<section class="card warn"><div class="sh"><h2>انتبه</h2></div><ul class="coach">${notes.slice(0, 4).map(n => `<li>${n}</li>`).join('')}</ul></section>` : ''}
  ${nudge ? `<a class="card linkcard" href="#/chat"><span><b>رفيقك بيسأل</b><br><span class="hint">${esc(nudge.text.slice(0, 90))}</span></span><span class="go">رد</span></a>` : ''}
  ${prayerCard()}
  ${azkarCard()}
  ${medCard()}
  <section class="card"><div class="sh"><h2>تسجيل اليوم</h2><button class="link" data-act="tdCheckin">${day?.mood ? 'تعديل' : 'سجّل'}</button></div>
    ${day?.mood ? `<p style="margin:0">المزاج <b class="num">${day.mood}/5</b> (${MOOD[day.mood] || ''}) · الطاقة <b class="num">${day.energy}/5</b>${day.word ? ` · «${esc(day.word)}»` : ''}</p>` : '<p class="empty">آخر اليوم: مزاجك وطاقتك من 1 لـ5 وكلمة تلخص اليوم.</p>'}</section>
  <section class="card"><div class="sh"><h2>تركيز الأسبوع</h2><button class="link" data-act="tdWeek">${(P.weeks[st.ws]?.focus || []).length ? 'تعديل' : 'حدّده'}</button></div>
    ${(P.weeks[st.ws]?.focus || []).length ? `<ul class="coach">${P.weeks[st.ws].focus.map(f => `<li>${esc(f)}</li>`).join('')}</ul>` : '<p class="empty">من هدف لتلاتة يبقوا محور الأسبوع.</p>'}</section>`;

  root.querySelector('#qa').addEventListener('submit', async e => {
    e.preventDefault();
    const title = val('qa-text'); if (!title) return;
    const project_id = val('qa-proj') || null, request = document.getElementById('qa-req').checked;
    try { localStorage.setItem('masar.lastProject', project_id || ''); } catch {}
    try { await insert('tasks', { title, project_id, kind: request ? 'request' : 'task', due: td, priority: 1 }); toast('اتسجل'); setTimeout(() => document.getElementById('qa-text')?.focus(), 50); }
    catch (x) { toast(errText(x)); }
  });
}

/* evening review: move what didn't close today */
export function renderReview(root, rerender) {
  UI.rerender = rerender;
  const td = today(), items = openTasks().filter(t => t.due && t.due <= td).sort(byDue);
  const sat = (() => { let d = addDays(td, 1); while (pd(d).getDay() !== 6) d = addDays(d, 1); return d; })();
  root.innerHTML = `<section class="card soft"><h1 class="big">آخر اليوم</h1><p class="hint" style="margin:4px 0 0">${items.length ? `فاضل ${items.length} مخلصتش. كل واحدة ننقلها لإمتى؟` : 'كله خلص. يوم محترم 👏'}</p></section>
  ${items.length > 1 ? `<div class="actions"><button class="btn ghost sm" data-act="rvAll" data-to="${addDays(td, 1)}">الكل لبكرة</button></div>` : ''}
  ${items.map(t => `<section class="card rv"><p class="tt"><b>${esc(t.title)}</b></p><div class="meta">${t.project_id ? `<span class="chip">${esc(P.projects.find(p => p.id === t.project_id)?.name || '')}</span>` : ''}${t.kind === 'request' ? '<span class="chip">طلب</span>' : ''}${t.due < td ? `<span class="due over">من ${t.due}</span>` : ''}${t.rolled ? `<span class="rolled">اترحّلت ${t.rolled}</span>` : ''}</div>
    <div class="actions rv-acts"><button class="mini" data-act="rvMove" data-id="${t.id}" data-to="${addDays(td, 1)}">بكرة</button><button class="mini" data-act="rvMove" data-id="${t.id}" data-to="${addDays(td, 2)}">بعد بكرة</button><button class="mini" data-act="rvMove" data-id="${t.id}" data-to="${sat}">السبت</button>
    <input type="date" class="rv-date" data-id="${t.id}" min="${addDays(td, 1)}" aria-label="تاريخ تاني"><button class="mini" data-act="tkToggle" data-id="${t.id}">خلصت</button><button class="mini" data-act="rvNoDate" data-id="${t.id}">من غير موعد</button></div></section>`).join('')}
  <a class="btn ghost block" href="#/today">رجوع لليوم</a>`;
  root.querySelectorAll('.rv-date').forEach(i => i.addEventListener('change', () => moveTask(i.dataset.id, i.value)));
}
async function moveTask(id, to) {
  const t = P.tasks.find(x => x.id === id); if (!t || !to) return;
  try { await update('tasks', id, { due: to, rolled: (t.rolled || 0) + 1, focus_date: null }); toast('اتنقلت'); } catch (x) { toast(errText(x)); }
}

registerActions({
  rvMove: el => moveTask(el.dataset.id, el.dataset.to),
  rvNoDate: async el => { try { await update('tasks', el.dataset.id, { due: null, focus_date: null }); toast('اتشالت من اليوم'); } catch (x) { toast(errText(x)); } },
  rvAll: async el => { const td = today(); try { for (const t of openTasks().filter(t => t.due && t.due <= td)) await sb.from('tasks').update({ due: el.dataset.to, rolled: (t.rolled || 0) + 1, focus_date: null }).eq('id', t.id); await refresh('tasks'); toast('اتنقلوا لبكرة'); } catch (x) { toast(errText(x)); } },
  tdNote: el => noteSheet(el.dataset.id),
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

export function noteSheet(id) {
  const t = P.tasks.find(x => x.id === id); if (!t) return;
  openSheet(`<h3>✓ ${esc(t.title)}</h3><label class="fld"><span>ملاحظة على اللي اتعمل (اختياري)</span><textarea id="dn-note" rows="3" placeholder="مثال: اتسلم للعميل، فاضل مراجعة الضريبة">${esc(t.done_note || '')}</textarea></label>
  <div class="actions"><button class="btn primary" data-act="tdSaveNote" data-id="${id}" style="flex:1">حفظ الملاحظة</button><button class="btn ghost" data-act="close">من غير ملاحظة</button></div>`);
  setTimeout(() => document.getElementById('dn-note')?.focus(), 80);
}
registerActions({
  tdSaveNote: async el => { try { await update('tasks', el.dataset.id, { done_note: val('dn-note') }); closeSheet(); toast('اتحفظت'); } catch (x) { toast(errText(x)); } },
});
