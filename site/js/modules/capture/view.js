// Quick capture (+ button): write anything, AI splits it into tasks / ideas / notes / money / wins for review.
import { $, esc, toast, openSheet, closeSheet, val, registerActions } from '../../core/dom.js';
import { today, pd } from '../../core/dates.js';
import { errText } from '../../core/supa.js';
import { ai, parseJSON } from '../../core/ai.js';
import { P, insert } from '../../core/store.js';
import { projSelect } from '../tasks/view.js';

export const KINDS = { task: 'مهمة', idea: 'فكرة بزنس', note: 'ملاحظة', learn: 'تعلّم', expense: 'مصروف', income: 'دخل', win: 'إنجاز' };
export const CATS = ['سكن', 'أكل وبيت', 'مواصلات', 'أسرة / مصر', 'تعليم وكورسات', 'اشتراكات وأدوات', 'صحة', 'ترفيه', 'ادخار البزنس', 'أخرى'];
export const INC = ['راتب', 'مشروع / فريلانس', 'عمولة / مكافأة', 'أخرى'];
export const catSelect = (id, kind, cur) => `<select id="${id}">${(kind === 'in' ? INC : CATS).map(c => `<option ${c === cur ? 'selected' : ''}>${c}</option>`).join('')}</select>`;

let items = [];

export function openCapture() {
  items = [];
  openSheet(`<h3>سجّل أي حاجة</h3>
  <p class="hint">اكتبها زي ما هي في دماغك: مهام، فكرة، حاجة شفتها، مصروف، إنجاز. هرتّبها وتراجعها قبل الحفظ.</p>
  <textarea id="cap" rows="5" placeholder="مثال: عميل أكناف عايز تقرير أعمار الديون قبل الخميس. صرفت 45 ريال غدا. فكرة: باقة Odoo جاهزة للمخابز."></textarea>
  <div class="actions"><button class="btn primary" data-act="capAI">رتّبها</button><button class="btn ghost" data-act="capRaw">احفظها مهمة كما هي</button></div>
  <div id="cap-out" style="display:grid;gap:10px"></div>`);
}

function itemHtml(it, i) {
  const k = it.kind; let det = '';
  if (k === 'task') det = `<div class="row2"><label class="fld"><span>المشروع</span>${projSelect('c-p-' + i, it.project)}</label><label class="fld"><span>الموعد</span><input type="date" id="c-d-${i}" value="${esc(it.due || '')}"></label></div>${it.dod ? `<p class="hint">تعريف الإنجاز: ${esc(it.dod)}</p>` : ''}`;
  else if (k === 'expense' || k === 'income') det = `<div class="row2"><label class="fld"><span>المبلغ</span><input id="c-a-${i}" inputmode="decimal" value="${esc(it.amount || '')}"></label><label class="fld"><span>العملة</span><select id="c-c-${i}">${['SAR', 'EGP'].map(c => `<option ${c === it.currency ? 'selected' : ''}>${c}</option>`).join('')}</select></label></div><label class="fld"><span>البند</span>${catSelect('c-g-' + i, k === 'income' ? 'in' : 'out', it.category)}</label>`;
  else det = `<label class="fld"><span>المشروع</span>${projSelect('c-p-' + i, it.project)}</label>`;
  return `<div class="capitem"><div class="hd"><select id="c-k-${i}" data-i="${i}" class="cap-kind">${Object.entries(KINDS).map(([v, l]) => `<option value="${v}" ${v === k ? 'selected' : ''}>${l}</option>`).join('')}</select><button class="mini" data-act="capDrop" data-i="${i}">شيل</button></div>
  <textarea id="c-t-${i}" rows="2">${esc(it.title)}</textarea>${det}</div>`;
}
function draw() {
  const n = items.filter(Boolean).length, out = $('#cap-out'); if (!out) return;
  out.innerHTML = n ? items.map((it, i) => it ? itemHtml(it, i) : '').join('') + `<button class="btn primary block" data-act="capSave">حفظ الكل (${n})</button>` : '';
  out.querySelectorAll('.cap-kind').forEach(s => s.addEventListener('change', () => { readAll(); draw(); }));
}
function read(i) {
  const it = items[i]; if (!it) return; const g = id => document.getElementById(id);
  it.kind = val('c-k-' + i) || it.kind; it.title = val('c-t-' + i);
  if (g('c-p-' + i)) it.project = val('c-p-' + i);
  if (g('c-d-' + i)) it.due = val('c-d-' + i);
  if (g('c-a-' + i)) it.amount = parseFloat(val('c-a-' + i).replace(',', '.')) || 0;
  if (g('c-c-' + i)) it.currency = val('c-c-' + i);
  if (g('c-g-' + i)) it.category = val('c-g-' + i);
}
const readAll = () => items.forEach((_, i) => read(i));
const iso = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') ? s : null;

async function saveItem(it) {
  if (!it.title) return;
  switch (it.kind) {
    case 'task': return insert('tasks', { title: it.title, dod: it.dod || '', project_id: it.project || null, due: iso(it.due), priority: Math.min(3, Math.max(1, +it.priority || 1)) });
    case 'idea': case 'note': case 'learn': return insert('notes', { kind: it.kind, text: it.title, source: it.source || '', project_id: it.project || null });
    case 'expense': case 'income':
      if (!(+it.amount > 0)) throw new Error(`«${it.title}» محتاجة مبلغ`);
      return insert('money', { kind: it.kind === 'income' ? 'in' : 'out', amount: +it.amount, currency: it.currency === 'EGP' ? 'EGP' : 'SAR', category: it.category || 'أخرى', note: it.title, date: iso(it.due) || today() });
    case 'win': return insert('wins', { text: it.title, project_id: it.project || null, date: today() });
  }
}

registerActions({
  capture: openCapture,
  capRaw: async el => { const t = val('cap'); if (!t) return toast('اكتب حاجة الأول'); el.disabled = true; try { await insert('tasks', { title: t }); closeSheet(); toast('اتسجلت في الـInbox'); } catch (x) { el.disabled = false; toast(errText(x)); } },
  capAI: async el => {
    const t = val('cap'); if (!t) return toast('اكتب حاجة الأول');
    el.disabled = true; el.textContent = 'بيرتّب…';
    try {
      const r = parseJSON(await ai('capture', t, { today: `${today()} (${pd(today()).toLocaleDateString('ar-EG', { weekday: 'long' })})`, projects: P.projects.map(p => `${p.id}: ${p.name}`).join('\n') }));
      items = (Array.isArray(r) ? r : [r]).filter(x => x && x.title).map(x => ({ ...x, kind: KINDS[x.kind] ? x.kind : 'note', project: P.projects.some(p => p.id === x.project) ? x.project : '' }));
      if (!items.length) toast('مالقيتش عناصر واضحة. احفظها كما هي.');
      draw();
    } catch (x) { toast(x.message); }
    finally { if (el.isConnected) { el.disabled = false; el.textContent = 'رتّبها تاني'; } }
  },
  capDrop: el => { readAll(); items[+el.dataset.i] = null; draw(); },
  capSave: async el => {
    readAll(); el.disabled = true; let ok = 0, fail = 0;
    for (let i = 0; i < items.length; i++) { if (!items[i]) continue; try { await saveItem(items[i]); ok++; items[i] = null; } catch (x) { fail++; toast(x.message || errText(x)); } }
    if (!fail) { closeSheet(); toast(`اتسجل ${ok} عنصر`); } else { draw(); }
  },
});
