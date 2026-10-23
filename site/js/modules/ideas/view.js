// الأفكار: business ideas, notes / social-media finds, things to learn; AI suggests next steps.
import { esc, toast, openSheet, closeSheet, seg, segV, val, registerActions, confirmTap } from '../../core/dom.js';
import { fmtShort, ymd } from '../../core/dates.js';
import { errText } from '../../core/supa.js';
import { P, insert, remove, pName } from '../../core/store.js';
import { projSelect, sheetTask } from '../tasks/view.js';
import { aiSheet } from '../ledger/view.js';

const NOTE_KINDS = { idea: 'فكرة بزنس', note: 'ملاحظة', learn: 'تعلّم' };
const UI = { kind: 'all', rerender: () => {} };

export function renderIdeas(root, rerender) {
  UI.rerender = rerender;
  const a = UI.kind === 'all' ? P.notes : P.notes.filter(n => n.kind === UI.kind);
  root.innerHTML = `
  <div class="chips">${[['all', 'الكل'], ...Object.entries(NOTE_KINDS)].map(([k, l]) => `<button class="${UI.kind === k ? 'on' : ''}" data-act="idKind" data-v="${k}">${l}</button>`).join('')}</div>
  <div class="actions"><button class="btn primary sm" data-act="idNew">إضافة</button>${P.notes.length ? '<button class="btn ghost sm" data-act="idSuggest">اقترح عليّ أعمل إيه بيهم</button>' : ''}</div>
  <section class="card">${a.length ? a.map(n => `<div class="item"><div class="meta"><span class="tag ${n.kind}">${NOTE_KINDS[n.kind] || 'ملاحظة'}</span>${n.project_id ? `<span class="chip">${esc(pName(n.project_id))}</span>` : ''}<span>${fmtShort(ymd(new Date(n.created_at)))}</span></div>
    <p>${esc(n.text)}</p>${n.source ? (/^https?:\/\//.test(n.source) ? `<a href="${esc(n.source)}" target="_blank" rel="noopener">${esc(n.source)}</a>` : `<span class="hint">المصدر: ${esc(n.source)}</span>`) : ''}
    <div class="acts"><button class="mini" data-act="idTask" data-id="${n.id}">حوّلها لمهمة</button><button class="mini" data-act="idDel" data-id="${n.id}">حذف</button></div></div>`).join('')
    : '<p class="empty">أي فكرة بزنس، بوست مفيد، أو حاجة عاوز تذاكرها: سجّلها من زرار + وهتلاقيها هنا.</p>'}</section>`;
}

registerActions({
  idKind: el => { UI.kind = el.dataset.v; UI.rerender(); },
  idNew: () => openSheet(`<h3>إضافة للأفكار</h3>
    <div class="fld"><span>النوع</span>${seg('n-kind', Object.entries(NOTE_KINDS), UI.kind !== 'all' ? UI.kind : 'idea')}</div>
    <label class="fld"><span>المحتوى</span><textarea id="n-text" rows="4"></textarea></label>
    <label class="fld"><span>المصدر أو الرابط (اختياري)</span><input id="n-src" dir="auto"></label>
    <label class="fld"><span>مرتبطة بمشروع؟</span>${projSelect('n-proj', '')}</label>
    <div class="actions"><button class="btn primary block" data-act="idSave">حفظ</button></div>`),
  idSave: async () => { const text = val('n-text'); if (!text) return toast('اكتب المحتوى'); try { await insert('notes', { kind: segV('n-kind') || 'note', text, source: val('n-src'), project_id: val('n-proj') || null }); closeSheet(); toast('اتحفظت'); } catch (x) { toast(errText(x)); } },
  idTask: el => { const n = P.notes.find(x => x.id === el.dataset.id); sheetTask(null, { title: n?.text || '', project_id: n?.project_id || '' }); },
  idDel: async el => { if (!confirmTap(el, 'تأكيد؟')) return; try { await remove('notes', el.dataset.id); } catch (x) { toast(errText(x)); } },
  idSuggest: () => aiSheet('اقتراحات من أفكارك', 'suggest', `الأهداف: ${P.goals.map(g => `${g.title} (${g.progress || 0}%)`).join(' | ') || '-'}
الأفكار والملاحظات:
${P.notes.slice(0, 50).map(n => `- [${NOTE_KINDS[n.kind] || n.kind}] ${n.text}${n.source ? ` (مصدر: ${n.source})` : ''}`).join('\n')}`),
});
