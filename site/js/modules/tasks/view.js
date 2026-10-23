// Tasks: list by due date / project, task sheet with AI polish, done / focus / carry-over.
import { $, esc, toast, openSheet, closeSheet, seg, segV, val, registerActions, confirmTap } from '../../core/dom.js';
import { today, addDays, dayDiff, pd, LOC, fmtShort } from '../../core/dates.js';
import { errText } from '../../core/supa.js';
import { ai, parseJSON } from '../../core/ai.js';
import { P, insert, update, remove, pName, openTasks, doneDate } from '../../core/store.js';
import { doneSound, confetti } from '../../core/flip.js';

export const AREAS = { work: 'شغل', growth: 'تطوير', business: 'بزنس', personal: 'شخصي' };
const UI = { view: 'today', proj: 'all', rerender: () => {} };

export function dueLabel(s) {
  const n = dayDiff(s, today());
  if (n === 0) return 'النهارده'; if (n === 1) return 'بكرة'; if (n === -1) return 'امبارح';
  if (n < 0) return `متأخرة ${-n} يوم`; if (n < 7) return pd(s).toLocaleDateString(LOC, { weekday: 'long' });
  return fmtShort(s);
}
const dueCls = (s, done) => { if (done) return ''; const n = dayDiff(s, today()); return n < 0 ? 'over' : n === 0 ? 'today' : ''; };
export const byDue = (a, b) => (a.due || '9999').localeCompare(b.due || '9999') || (b.priority || 1) - (a.priority || 1);

// a stable color per project, so its tiles are recognisable at a glance
const HUES = [152, 32, 212, 330, 78, 265, 8, 186];
export const hue = id => { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return HUES[h % HUES.length]; };
export function taskRow(t) {
  const done = t.status === 'done', star = t.focus_date === today();
  return `<li class="task p${t.priority || 1} ${done ? 'is-done' : ''}"${t.project_id ? ` style="--ph:${hue(t.project_id)}"` : ''}>
  <button class="chk" data-act="tkToggle" data-id="${t.id}" aria-label="${done ? 'رجّعها مفتوحة' : 'تم'}">${done ? '✓' : ''}</button>
  <button class="tbody" data-act="tkEdit" data-id="${t.id}"><span class="tt">${esc(t.title)}</span>
  <span class="meta">${t.kind === 'request' ? '<span class="chip req">طلب</span>' : ''}${t.project_id ? `<span class="chip">${esc(pName(t.project_id))}</span>` : ''}${t.due ? `<span class="due ${dueCls(t.due, done)}">${dueLabel(t.due)}</span>` : ''}${(t.rolled || 0) >= 2 && !done ? `<span class="rolled">اترحّلت ${t.rolled} مرات</span>` : ''}${!t.dod && !done ? '<span>بدون تعريف إنجاز</span>' : ''}</span></button>
  ${done ? '<span></span>' : `<button class="star ${star ? 'on' : ''}" data-act="tkFocus" data-id="${t.id}" aria-label="${star ? 'شيلها من أهم 3' : 'ضيفها لأهم 3 النهارده'}">★</button>`}</li>`;
}
// tiles (mini cards) by default; the person can switch to a plain list and it is remembered on this phone
export const layout = () => { try { return localStorage.getItem('masar.taskLayout') || 'tiles'; } catch { return 'tiles'; } };
export const taskList = a => `<ul class="tl ${layout() === 'tiles' ? 'tiles' : ''}">${a.map(taskRow).join('')}</ul>`;
export const layoutToggle = () => `<button class="btn ghost sm lay" data-act="tkLayout" aria-label="طريقة العرض">${layout() === 'tiles' ? '☰ قائمة' : '▦ كروت'}</button>`;

export function projSelect(id, cur) {
  return `<select id="${id}"><option value="">بدون مشروع</option>${Object.entries(AREAS).map(([a, l]) => {
    const ps = P.projects.filter(p => p.area === a);
    return ps.length ? `<optgroup label="${l}">${ps.map(p => `<option value="${p.id}" ${p.id === cur ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</optgroup>` : '';
  }).join('')}</select>`;
}

// filters instead of one long scroll: each shows its open count
const FILTERS = [
  ['today', 'النهارده', (t, td) => (t.due && t.due <= td) || t.focus_date === td],
  ['week', 'الأسبوع', (t, td) => t.due > td && t.due <= addDays(td, 7) && t.focus_date !== td],
  ['later', 'بعدين', (t, td) => t.due > addDays(td, 7)],
  ['none', 'بدون موعد', t => !t.due],
];
export function renderTasks(root, rerender) {
  UI.rerender = rerender;
  const td = today(), done = UI.view === 'done';
  const byProj = a => UI.proj === 'all' ? a : a.filter(t => (t.project_id || '') === (UI.proj === 'none' ? '' : UI.proj));
  const open = byProj(openTasks());
  const f = FILTERS.find(x => x[0] === UI.view) || FILTERS[0];
  let a = done ? byProj(P.tasks.filter(t => t.status === 'done')) : open.filter(t => f[2](t, td));
  a.sort(done ? (x, y) => String(y.done_at).localeCompare(String(x.done_at)) : byDue);
  const late = !done && UI.view === 'today' ? a.filter(t => t.due && t.due < td).length : 0;
  root.innerHTML = `
  <div class="chips fchips">${FILTERS.map(([k, l, fn]) => `<button class="${UI.view === k ? 'on' : ''}" data-act="tkView" data-v="${k}">${l} <span class="c">${open.filter(t => fn(t, td)).length}</span></button>`).join('')}<button class="${done ? 'on' : ''}" data-act="tkView" data-v="done">منجزة</button></div>
  <div class="chips"><button class="${UI.proj === 'all' ? 'on' : ''}" data-act="tkProj" data-v="all">كل المشاريع</button>${P.projects.map(p => `<button class="${UI.proj === p.id ? 'on' : ''}" data-act="tkProj" data-v="${p.id}">${esc(p.name)}</button>`).join('')}<button class="${UI.proj === 'none' ? 'on' : ''}" data-act="tkProj" data-v="none">بدون مشروع</button></div>
  <div class="actions"><button class="btn primary sm" data-act="tkNew">مهمة جديدة</button><button class="btn ghost sm" data-act="tkNewProject">مشروع جديد</button>${layoutToggle()}</div>
  ${late ? `<p class="hint" style="margin:0 2px"><b class="due over">${late} متأخرة</b> من أيام فاتت، ظاهرة هنا مع النهارده.</p>` : ''}
  ${!a.length ? `<section class="card"><p class="empty">${done ? 'لسه مفيش مهام منجزة هنا.' : 'مفيش حاجة هنا. سجّل أي حاجة من زرار +.'}</p></section>`
    : `<section class="card">${taskList(done ? a.slice(0, 80) : a)}</section>`}`;
}

export function sheetTask(id, preset = {}) {
  const t = id ? P.tasks.find(x => x.id === id) : { title: '', dod: '', project_id: UI.proj !== 'all' && UI.proj !== 'none' ? UI.proj : '', due: today(), priority: 1, ...preset };
  openSheet(`<h3>${id ? 'تعديل مهمة' : 'مهمة جديدة'}</h3>
  <label class="fld"><span>المهمة</span><textarea id="f-title" rows="2" placeholder="ابدأ بفعل: تجهيز، مراجعة، تسليم…">${esc(t.title)}</textarea></label>
  <button class="btn ghost sm" data-act="tkPolish" style="justify-self:start">صياغة احترافية</button><p class="hint" id="polish-note" hidden></p>
  <label class="fld"><span>تعريف الإنجاز: امتى أقول خلصت؟</span><textarea id="f-dod" rows="2">${esc(t.dod)}</textarea></label>
  <div class="row2"><label class="fld"><span>المشروع</span>${projSelect('f-proj', t.project_id)}</label><label class="fld"><span>الموعد</span><input type="date" id="f-due" value="${esc(t.due || '')}"></label></div>
  <div class="fld"><span>الأولوية</span>${seg('f-pri', [[1, 'عادي'], [2, 'مهم'], [3, 'حرج']], t.priority || 1)}</div>
  <div class="actions"><button class="btn primary" data-act="tkSave" data-id="${id || ''}">حفظ</button>
  ${id ? `<button class="btn ghost" data-act="tkWin" data-id="${id}">سجّلها إنجاز</button><button class="btn danger" data-act="tkDel" data-id="${id}">حذف</button>` : ''}</div>`);
}

registerActions({
  tkView: el => { UI.view = el.dataset.v; UI.rerender(); },
  tkLayout: () => { try { localStorage.setItem('masar.taskLayout', layout() === 'tiles' ? 'list' : 'tiles'); } catch {} document.dispatchEvent(new Event('masar:rerender')); },
  tkProj: el => { UI.proj = el.dataset.v; UI.rerender(); },
  tkNew: () => sheetTask(null),
  tkEdit: el => sheetTask(el.dataset.id),
  tkToggle: async el => {
    const t = P.tasks.find(x => x.id === el.dataset.id); if (!t) return;
    try {
      if (t.status === 'done') await update('tasks', t.id, { status: 'todo', done_at: null });
      else {
        await update('tasks', t.id, { status: 'done', done_at: new Date().toISOString() });
        const n = P.tasks.filter(x => doneDate(x) === today()).length;
        const left = openTasks().filter(x => (x.due && x.due <= today()) || x.focus_date === today()).length;
        const all = left === 0 && n >= 2;
        doneSound(all); if (all) confetti();
        toast(all ? `خلصت كل شغل النهارده (${n}) 🎉` : n >= 3 ? `${n} النهارده. كمّل كده.` : 'تمت ✓');
        (await import('../today/view.js')).noteSheet(t.id);
      }
    } catch (x) { toast(errText(x)); }
  },
  tkFocus: async el => {
    const t = P.tasks.find(x => x.id === el.dataset.id); if (!t) return; const td = today();
    try {
      if (t.focus_date === td) return await update('tasks', t.id, { focus_date: null });
      if (P.tasks.filter(x => x.focus_date === td).length >= 3) return toast('أهم 3 اكتملوا. شيل واحدة الأول.');
      const d = { focus_date: td }; if (!t.due || t.due < td) { d.due = td; if (t.due) d.rolled = (t.rolled || 0) + 1; }
      await update('tasks', t.id, d);
    } catch (x) { toast(errText(x)); }
  },
  tkSave: async el => {
    const title = val('f-title'); if (!title) return toast('اكتب المهمة الأول');
    const due = val('f-due') || null, data = { title, dod: val('f-dod'), project_id: val('f-proj') || null, due, priority: +segV('f-pri') || 1 };
    el.disabled = true;
    try {
      const id = el.dataset.id;
      if (id) { const old = P.tasks.find(x => x.id === id); if (old?.due && due && due > old.due && old.due < today()) data.rolled = (old.rolled || 0) + 1; await update('tasks', id, data); }
      else await insert('tasks', data);
      closeSheet(); toast(id ? 'اتحفظت' : 'اتضافت');
    } catch (x) { el.disabled = false; toast(errText(x)); }
  },
  tkDel: async el => { if (!confirmTap(el)) return; try { await remove('tasks', el.dataset.id); closeSheet(); toast('اتحذفت'); } catch (x) { toast(errText(x)); } },
  tkWin: el => { const t = P.tasks.find(x => x.id === el.dataset.id); sheetWin(t?.title || '', t?.project_id || ''); },
  tkPolish: async el => {
    const title = val('f-title'); if (!title) return toast('اكتب المهمة الأول');
    el.disabled = true; el.textContent = 'بيصيغ…';
    try {
      const r = parseJSON(await ai('polish', `${title}\nتعريف الإنجاز الحالي: ${val('f-dod') || '-'}`));
      if (r?.title && $('#f-title')) $('#f-title').value = r.title;
      if (r?.dod && $('#f-dod')) $('#f-dod').value = r.dod;
      const n = $('#polish-note'); if (n && r?.note) { n.textContent = r.note; n.hidden = false; }
    } catch (x) { toast(x.message); }
    finally { if (el.isConnected) { el.disabled = false; el.textContent = 'صياغة احترافية'; } }
  },
  tkNewProject: () => openSheet(`<h3>مشروع جديد</h3><label class="fld"><span>الاسم</span><input id="pr-name"></label>
    <div class="fld"><span>المجال</span>${seg('pr-area', Object.entries(AREAS), 'work')}</div>
    <div class="actions"><button class="btn primary block" data-act="tkSaveProject">حفظ</button></div>`),
  tkSaveProject: async () => { const name = val('pr-name'); if (!name) return toast('اكتب الاسم'); try { await insert('projects', { name, area: segV('pr-area') || 'work', sort: P.projects.length + 1 }); closeSheet(); toast('اتضاف المشروع'); } catch (x) { toast(errText(x)); } },
});

export function sheetWin(text = '', project = '') {
  openSheet(`<h3>إنجاز جديد</h3><p class="hint">اكتبه كنقطة CV: فعل + نتيجة + رقم لو موجود.</p>
  <label class="fld"><span>الإنجاز</span><textarea id="v-text" rows="3">${esc(text)}</textarea></label>
  <div class="row2"><label class="fld"><span>المشروع</span>${projSelect('v-proj', project)}</label><label class="fld"><span>التاريخ</span><input type="date" id="v-date" value="${today()}"></label></div>
  <div class="actions"><button class="btn primary block" data-act="tkSaveWin">حفظ</button></div>`);
}
registerActions({
  tkSaveWin: async () => { const text = val('v-text'); if (!text) return toast('اكتب الإنجاز'); try { await insert('wins', { text, project_id: val('v-proj') || null, date: val('v-date') || today() }); closeSheet(); toast('اتسجل في سجل الإنجازات'); } catch (x) { toast(errText(x)); } },
});
