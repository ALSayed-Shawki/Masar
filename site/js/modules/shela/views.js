// Group expenses screens: balances, log, reports, plus the expense/settlement sheets and the join flow.
import { $, esc, toast, openSheet, closeSheet, seg, segV, val, registerActions, confirmTap } from '../../core/dom.js';
import { today, weekStart, addDays, fmtShort, pd, ymd } from '../../core/dates.js';
import { errText } from '../../core/supa.js';
import { money, toC, shares, balances, periodReport, live } from './math.js';
import { G, mName, canEdit, saveExpense, setDeleted, addSettlement, uploadReceipt, receiptUrl, preview, join } from './data.js';
import { shareReport } from './report.js';

export const CATS = ['أكل', 'قهوة ومشروبات', 'بقالة وبيت', 'إيجار وفواتير', 'مواصلات', 'خروجات', 'أخرى'];
const TYPES = [['equal', 'بالتساوي'], ['one', 'لحد معين'], ['shares', 'بالنسب'], ['amounts', 'بمبالغ'], ['personal', 'خاص بيا']];
const PERIODS = [['week', 'الأسبوع ده'], ['lastweek', 'اللي فات'], ['month', 'الشهر ده'], ['lastmonth', 'الشهر اللي فات'], ['all', 'من الأول']];

const UI = { tab: 'balance', filter: 'all', period: 'month', draft: null, rerender: () => {} };
try { UI.tab = localStorage.getItem('shela.tab') || 'balance'; } catch {}
const cur = () => G.group?.currency || 'ريال';
const amt = c => `<span class="num">${money(c)}</span>`;

export function periodRange(p = UI.period) {
  const td = today();
  switch (p) {
    case 'week': { const s = weekStart(td); return [s, addDays(s, 6)]; }
    case 'lastweek': { const s = addDays(weekStart(td), -7); return [s, addDays(s, 6)]; }
    case 'month': return [td.slice(0, 7) + '-01', td.slice(0, 7) + '-31'];
    case 'lastmonth': { const d = pd(td.slice(0, 7) + '-01'); d.setMonth(d.getMonth() - 1); const m = ymd(d).slice(0, 7); return [m + '-01', m + '-31']; }
    default: return ['0000-01-01', '9999-12-31'];
  }
}
export const periodLabel = (p = UI.period) => PERIODS.find(x => x[0] === p)?.[1] || '';

export function splitText(e) {
  if (e.split_type === 'personal') return 'خاص';
  if (e.split_type === 'amounts') return 'بمبالغ محددة';
  const p = e.participants || [];
  if (e.split_type === 'one' || p.length === 1) return `على ${mName(p[0])}`;
  if (e.split_type === 'shares') return `بالنسب على ${p.length}`;
  return p.length === G.members.length ? 'على الكل بالتساوي' : `بالتساوي على ${p.map(mName).join(' و')}`;
}

/* ---------------- screens ---------------- */
export function renderShela(root, rerender) {
  UI.rerender = rerender;
  const fab = $('#fab'); fab.hidden = !G.me; fab.textContent = '+ مصروف'; fab.dataset.act = 'shNewExp';
  if (!G.me) {
    root.innerHTML = `<section class="card"><div class="sh"><h2>${esc(G.group?.name || 'الشلة')}</h2></div><p class="empty">حسابك مش مربوط بأي اسم في الشلة.</p></section>`;
    return;
  }
  const tabs = `<div class="subtabs">${[['balance', 'الرصيد'], ['log', 'المصاريف'], ['report', 'التقارير']].map(([k, l]) =>
    `<button class="${UI.tab === k ? 'on' : ''}" data-act="shTab" data-v="${k}">${l}</button>`).join('')}</div>`;
  root.innerHTML = tabs + ({ balance: vBalance, log: vLog, report: vReport }[UI.tab] || vBalance)();
}

function vBalance() {
  const { b, nets, tr } = balances(G.members, G.expenses, G.settlements);
  const mine = b[G.me.id]?.net || 0;
  return `
  <section class="card soft hero"><span>رصيدك يا ${esc(G.me.name)}</span>
    <span class="v ${mine > 0 ? 'pos' : mine < 0 ? 'neg' : ''}">${mine > 0 ? '+' : mine < 0 ? '−' : ''}${money(Math.abs(mine))} <small style="font-size:14px">${esc(cur())}</small></span>
    <span class="hint" style="margin:0">${mine > 0 ? 'ليك عند الشلة' : mine < 0 ? 'عليك للشلة' : 'متساوي، مفيش عليك ولا ليك'}</span></section>
  <section class="card"><div class="sh"><h2>كل واحد في الشلة</h2><span class="count">دفع / استهلك</span></div>
  ${G.members.map(m => { const x = b[m.id]; return `<div class="row"><b>${esc(m.name)}${x.net > 0 ? '<span class="pill pos">ليه</span>' : x.net < 0 ? '<span class="pill neg">عليه</span>' : ''}</b>
    <span class="num ${x.net > 0 ? 'pos' : x.net < 0 ? 'neg' : ''}">${x.net > 0 ? '+' : x.net < 0 ? '−' : ''}${money(Math.abs(x.net))}</span>
    <small>دفع ${amt(x.paid)} · استهلك ${amt(x.used)}${x.sent || x.got ? ` · سدّد ${amt(x.sent)} · استلم ${amt(x.got)}` : ''}</small></div>`; }).join('')}</section>
  <section class="card"><div class="sh"><h2>أقصر طريق للتسوية</h2></div>
  ${tr.length ? tr.map(t => `<div class="row"><span><b>${esc(mName(t.from))}</b> <span class="hint">يدفع لـ</span> <b>${esc(mName(t.to))}</b><br>${amt(t.c)} ${esc(cur())}</span>
     <button class="mini" data-act="shSettle" data-from="${t.from}" data-to="${t.to}" data-c="${t.c}">اتدفعت</button></div>`).join('') : '<p class="empty">الحسابات متساوية.</p>'}
  <p class="hint">أقل عدد تحويلات يقفل الحساب. لما حد يدفع، دوس «اتدفعت».</p></section>
  <section class="card"><div class="sh"><h2>بين كل اتنين</h2></div>
  ${nets.length ? nets.map(n => `<div class="row"><span><b>${esc(mName(n.from))}</b> <span class="hint">عليه لـ</span> <b>${esc(mName(n.to))}</b></span>${amt(n.c)}</div>`).join('') : '<p class="empty">مفيش ديون بين حد والتاني.</p>'}</section>`;
}

function expRow(e) {
  const del = e.deleted;
  if (e.kind === 'settle') return `<button class="ex settle ${del ? 'deleted' : ''}" data-act="shShowSet" data-id="${e.id}"><span class="t">${esc(mName(e.from_member))} سدّد لـ${esc(mName(e.to_member))}</span><span class="amt">${money(e.amount_c)}</span>
    <span class="meta"><span>${fmtShort(e.date)}</span><span class="chip">تسوية</span>${del ? '<span>اتلغت</span>' : ''}</span></button>`;
  return `<button class="ex ${del ? 'deleted' : ''}" data-act="shShowExp" data-id="${e.id}"><span class="t">${esc(e.title)}</span><span class="amt">${money(e.amount_c)}</span>
    <span class="meta"><span>دفع ${esc(mName(e.payer_id))}</span><span>${fmtShort(e.date)}</span><span class="chip">${esc(splitText(e))}</span>${e.category ? `<span class="chip">${esc(e.category)}</span>` : ''}${e.receipt_path ? '<span>فيه فاتورة</span>' : ''}${del ? '<span>اتحذف</span>' : ''}</span></button>`;
}

function vLog() {
  const me = G.me.id;
  let items = [...G.expenses.map(e => ({ ...e, kind: 'exp' })), ...G.settlements.map(s => ({ ...s, kind: 'settle' }))];
  const f = UI.filter;
  if (f === 'mine') items = items.filter(e => e.kind === 'settle' ? (e.from_member === me || e.to_member === me) : (e.payer_id === me || (e.participants || []).includes(me) || (e.amounts || {})[me]));
  else if (f.startsWith('paid:')) items = items.filter(e => e.kind === 'exp' && e.payer_id === f.slice(5));
  if (f === 'deleted') items = items.filter(e => e.deleted); else items = items.filter(e => !e.deleted);
  items.sort((a, b) => b.date.localeCompare(a.date) || String(b.created_at).localeCompare(String(a.created_at)));
  return `<div class="chips"><button class="${f === 'all' ? 'on' : ''}" data-act="shFilter" data-v="all">الكل</button><button class="${f === 'mine' ? 'on' : ''}" data-act="shFilter" data-v="mine">يخصني</button>
    ${G.members.map(m => `<button class="${f === 'paid:' + m.id ? 'on' : ''}" data-act="shFilter" data-v="paid:${m.id}">دفعها ${esc(m.name)}</button>`).join('')}
    <button class="${f === 'deleted' ? 'on' : ''}" data-act="shFilter" data-v="deleted">المحذوف</button></div>
  <div class="actions"><button class="btn ghost sm" data-act="shSettle">تسجيل تسوية</button></div>
  <section class="card">${items.length ? items.map(expRow).join('') : '<p class="empty">لسه مفيش مصاريف. دوس «+ مصروف».</p>'}</section>`;
}

function vReport() {
  const [a, z] = periodRange(), r = periodReport(G.members, G.expenses, a, z);
  const pm = Math.max(1, ...Object.values(r.per).flatMap(x => [x.paid, x.used])), cm = Math.max(1, ...Object.values(r.cats));
  return `<div class="chips">${PERIODS.map(([k, l]) => `<button class="${UI.period === k ? 'on' : ''}" data-act="shPeriod" data-v="${k}">${l}</button>`).join('')}</div>
  <div class="kpis"><div class="kpi"><div class="v">${money(r.total)}</div><div class="l">صرف الشلة (${esc(cur())})</div></div><div class="kpi"><div class="v">${r.group.length}</div><div class="l">مصاريف مشتركة</div></div></div>
  <section class="card"><div class="sh"><h2>مين دفع ومين استهلك</h2></div><div class="bars">
  ${G.members.map(m => { const x = r.per[m.id]; return `<div class="bar"><span class="n">${esc(m.name)} دفع</span><div class="track"><div class="fill" style="width:${x.paid / pm * 100}%"></div></div><span class="num">${money(x.paid)}</span></div>
    <div class="bar"><span class="n">${esc(m.name)} استهلك</span><div class="track"><div class="fill pos" style="width:${x.used / pm * 100}%"></div></div><span class="num">${money(x.used)}</span></div>`; }).join('')}</div></section>
  <section class="card"><div class="sh"><h2>حسب البند</h2></div>
  ${Object.keys(r.cats).length ? `<div class="bars">${Object.entries(r.cats).sort((x, y) => y[1] - x[1]).map(([k, v]) => `<div class="bar"><span class="n">${esc(k)}</span><div class="track"><div class="fill gold" style="width:${v / cm * 100}%"></div></div><span class="num">${money(v)}</span></div>`).join('')}</div>` : '<p class="empty">مفيش مصاريف في الفترة دي.</p>'}</section>
  <div class="actions"><button class="btn wa" data-act="shShare" data-f="png" style="flex:1">ابعت التقرير صورة</button><button class="btn ghost" data-act="shShare" data-f="pdf" style="flex:1">PDF</button></div>
  <p class="hint">التقرير بيحسب المصاريف المشتركة بس. «خاص بيا» بيتسجل للمتابعة ومش بيدخل في الحساب.</p>`;
}

/* ---------------- sheets ---------------- */
const memSel = (id, v) => `<select id="${id}">${G.members.map(m => `<option value="${m.id}" ${m.id === v ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select>`;

function splitBlock(type, e) {
  const ps = e.participants?.length ? e.participants : G.members.map(m => m.id);
  if (type === 'personal') return '<p class="hint">مصروف خاص بيك؛ بيتسجل للمتابعة بس ومش بيدخل في حسابات الشلة.</p>';
  if (type === 'one') return `<label class="fld"><span>المصروف ده يخص مين؟</span>${memSel('x-one', e.split_type === 'one' ? ps[0] : G.members.find(m => m.id !== G.me.id)?.id)}</label><p class="hint">اللي اخترته عليه المبلغ كله للي دفع.</p>`;
  if (type === 'equal') return `<div class="fld"><span>مين داخل فيه؟</span>${G.members.map(m => `<label class="checkrow"><input type="checkbox" id="x-p-${m.id}" ${ps.includes(m.id) ? 'checked' : ''}><span>${esc(m.name)}</span></label>`).join('')}</div>`;
  if (type === 'shares') return `<div class="fld"><span>نسبة كل واحد (مثلاً 2 و1 و1)</span>${G.members.map(m => `<label class="splitrow"><span>${esc(m.name)}</span><input id="x-w-${m.id}" inputmode="decimal" value="${e.split_type === 'shares' ? ((e.weights || {})[m.id] ?? '') : 1}"></label>`).join('')}</div>`;
  if (type === 'amounts') return `<div class="fld"><span>مبلغ كل واحد (المجموع = الإجمالي)</span>${G.members.map(m => `<label class="splitrow"><span>${esc(m.name)}</span><input id="x-a-${m.id}" inputmode="decimal" value="${(e.amounts || {})[m.id] ? money(e.amounts[m.id]) : ''}"></label>`).join('')}</div>`;
  return '';
}

function sheetExp(id) {
  const e = id ? G.expenses.find(x => x.id === id) : { title: '', amount_c: 0, date: today(), payer_id: G.me.id, split_type: 'equal', category: 'أكل', note: '' };
  UI.draft = { id, receipt_path: e.receipt_path || null, base: e };
  openSheet(`<h3>${id ? 'تعديل مصروف' : 'مصروف جديد'}</h3>
  <label class="fld"><span>صرفت على إيه؟</span><input id="x-title" value="${esc(e.title)}" placeholder="مثال: عشا الخميس"></label>
  <div class="row2"><label class="fld"><span>المبلغ (${esc(cur())})</span><input id="x-amt" inputmode="decimal" value="${e.amount_c ? money(e.amount_c) : ''}"></label><label class="fld"><span>التاريخ</span><input type="date" id="x-date" value="${esc(e.date)}"></label></div>
  <div class="row2"><label class="fld"><span>مين دفع؟</span>${memSel('x-payer', e.payer_id)}</label><label class="fld"><span>البند</span><select id="x-cat">${CATS.map(c => `<option ${c === e.category ? 'selected' : ''}>${c}</option>`).join('')}</select></label></div>
  <div class="fld"><span>يتقسم إزاي؟</span>${seg('x-type', TYPES, e.split_type)}</div>
  <div id="x-split">${splitBlock(e.split_type, e)}</div>
  <label class="fld"><span>صورة الفاتورة (اختياري)</span><input type="file" id="x-file" accept="image/*,application/pdf"></label>
  ${e.receipt_path ? '<p class="hint">فيه فاتورة محفوظة؛ اختار ملف جديد لو عاوز تغيّرها.</p>' : ''}
  <label class="fld"><span>ملاحظة</span><input id="x-note" value="${esc(e.note || '')}"></label>
  <div class="actions"><button class="btn primary block" data-act="shSaveExp">حفظ</button></div>`);
  $('#x-type').addEventListener('segchange', ev => { $('#x-split').innerHTML = splitBlock(ev.detail, ev.detail === UI.draft.base.split_type ? UI.draft.base : {}); });
}

async function saveExp(btn) {
  const title = val('x-title'), amount_c = toC(val('x-amt'));
  if (!title) return toast('اكتب صرفت على إيه');
  if (amount_c <= 0) return toast('اكتب مبلغ صحيح');
  const split_type = segV('x-type') || 'equal', payer_id = val('x-payer');
  const e = { title, amount_c, date: val('x-date') || today(), payer_id, split_type, category: val('x-cat'), note: val('x-note'), participants: [], weights: {}, amounts: {} };
  if (split_type === 'personal') e.participants = [payer_id];
  else if (split_type === 'one') e.participants = [val('x-one')];
  else if (split_type === 'equal') { e.participants = G.members.filter(m => document.getElementById('x-p-' + m.id)?.checked).map(m => m.id); if (!e.participants.length) return toast('اختار مين داخل فيه'); }
  else if (split_type === 'shares') { G.members.forEach(m => { const w = parseFloat(val('x-w-' + m.id).replace(',', '.')) || 0; if (w > 0) { e.weights[m.id] = w; e.participants.push(m.id); } }); if (!e.participants.length) return toast('اكتب نسبة لحد واحد على الأقل'); }
  else if (split_type === 'amounts') { let s = 0; G.members.forEach(m => { const c = toC(val('x-a-' + m.id)); if (c > 0) { e.amounts[m.id] = c; e.participants.push(m.id); s += c; } }); if (s !== amount_c) return toast(`المجموع ${money(s)} ولازم يساوي ${money(amount_c)}`); }
  btn.disabled = true; btn.textContent = 'بيحفظ…';
  e.receipt_path = UI.draft.receipt_path;
  const file = $('#x-file')?.files?.[0];
  if (file) { try { e.receipt_path = await uploadReceipt(file); } catch { toast('الفاتورة ماترفعتش؛ المصروف هيتحفظ من غيرها.'); } }
  try { await saveExpense(UI.draft.id, e); closeSheet(); toast(UI.draft?.id ? 'اتعدّل' : 'اتسجل'); }
  catch (x) { toast(errText(x)); if (btn.isConnected) { btn.disabled = false; btn.textContent = 'حفظ'; } }
}

async function showExp(id) {
  const e = G.expenses.find(x => x.id === id); if (!e) return;
  const sh = shares(e);
  openSheet(`<h3>${esc(e.title)}</h3><div class="detail">
  <div class="r"><span>المبلغ</span><b>${amt(e.amount_c)} ${esc(cur())}</b></div>
  <div class="r"><span>دفع</span><b>${esc(mName(e.payer_id))}</b></div>
  <div class="r"><span>التاريخ</span><span>${fmtShort(e.date)}</span></div>
  <div class="r"><span>التقسيم</span><span>${esc(splitText(e))}</span></div>
  ${e.split_type !== 'personal' ? Object.entries(sh).map(([k, v]) => `<div class="r"><span>حصة ${esc(mName(k))}</span>${amt(v)}</div>`).join('') : ''}
  ${e.category ? `<div class="r"><span>البند</span><span>${esc(e.category)}</span></div>` : ''}
  ${e.note ? `<div class="r"><span>ملاحظة</span><span>${esc(e.note)}</span></div>` : ''}
  <div class="r"><span>سجّله</span><span>${esc(mName(e.created_by_member))}${e.edited_at ? ' · اتعدّل' : ''}</span></div></div>
  <div class="receipt" id="x-receipt">${e.receipt_path ? '<p class="hint">بيحمّل الفاتورة…</p>' : ''}</div>
  <div class="actions">${canEdit(e) && !e.deleted ? `<button class="btn primary" data-act="shEditExp" data-id="${id}">تعديل</button><button class="btn danger" data-act="shDelExp" data-id="${id}">حذف</button>` : ''}
  ${canEdit(e) && e.deleted ? `<button class="btn ghost" data-act="shRestoreExp" data-id="${id}">استرجاع</button>` : ''}</div>
  ${!canEdit(e) ? '<p class="hint">التعديل والحذف للي سجّله أو لصاحب الشلة.</p>' : ''}`);
  if (e.receipt_path) {
    try {
      const url = await receiptUrl(e.receipt_path), box = $('#x-receipt'); if (!box) return;
      box.innerHTML = /\.pdf$/.test(e.receipt_path) ? `<a class="btn ghost" href="${esc(url)}" target="_blank" rel="noopener">فتح الفاتورة PDF</a>`
        : `<a href="${esc(url)}" target="_blank" rel="noopener"><img src="${esc(url)}" alt="فاتورة ${esc(e.title)}"></a>`;
    } catch { const box = $('#x-receipt'); if (box) box.innerHTML = '<p class="hint">مقدرتش أحمّل الفاتورة.</p>'; }
  }
}

function sheetSettle(from, to, c) {
  const f = from || G.me.id;
  openSheet(`<h3>تسجيل تسوية</h3><p class="hint">لما حد يدفع فلوس لحد تاني عشان يقفل اللي عليه.</p>
  <div class="row2"><label class="fld"><span>مين دفع؟</span>${memSel('s-from', f)}</label><label class="fld"><span>لمين؟</span>${memSel('s-to', to || G.members.find(m => m.id !== f)?.id)}</label></div>
  <div class="row2"><label class="fld"><span>المبلغ</span><input id="s-amt" inputmode="decimal" value="${c ? money(c) : ''}"></label><label class="fld"><span>التاريخ</span><input type="date" id="s-date" value="${today()}"></label></div>
  <label class="fld"><span>ملاحظة</span><input id="s-note" placeholder="تحويل بنكي، كاش…"></label>
  <div class="actions"><button class="btn primary block" data-act="shSaveSettle">حفظ التسوية</button></div>`);
}
function showSet(id) {
  const s = G.settlements.find(x => x.id === id); if (!s) return;
  openSheet(`<h3>تسوية</h3><div class="detail"><div class="r"><span>${esc(mName(s.from_member))} دفع لـ${esc(mName(s.to_member))}</span><b>${amt(s.amount_c)}</b></div>
  <div class="r"><span>التاريخ</span><span>${fmtShort(s.date)}</span></div>${s.note ? `<div class="r"><span>ملاحظة</span><span>${esc(s.note)}</span></div>` : ''}</div>
  ${canEdit(s) ? `<div class="actions">${s.deleted ? `<button class="btn ghost" data-act="shRestoreSet" data-id="${id}">استرجاع</button>` : `<button class="btn danger" data-act="shDelSet" data-id="${id}">إلغاء التسوية</button>`}</div>` : ''}`);
}

registerActions({
  shTab: el => { UI.tab = el.dataset.v; try { localStorage.setItem('shela.tab', UI.tab); } catch {} UI.rerender(); scrollTo(0, 0); },
  shFilter: el => { UI.filter = el.dataset.v; UI.rerender(); },
  shPeriod: el => { UI.period = el.dataset.v; UI.rerender(); },
  shNewExp: () => sheetExp(null),
  shEditExp: el => sheetExp(el.dataset.id),
  shSaveExp: el => saveExp(el),
  shShowExp: el => showExp(el.dataset.id),
  shDelExp: async el => { if (!confirmTap(el)) return; try { await setDeleted('expenses', el.dataset.id, true); closeSheet(); toast('اتحذف (يترجّع من «المحذوف»)'); } catch (x) { toast(errText(x)); } },
  shRestoreExp: async el => { try { await setDeleted('expenses', el.dataset.id, false); closeSheet(); toast('اترجّع'); } catch (x) { toast(errText(x)); } },
  shSettle: el => sheetSettle(el.dataset.from, el.dataset.to, +el.dataset.c || 0),
  shSaveSettle: async el => {
    const from_member = val('s-from'), to_member = val('s-to'), amount_c = toC(val('s-amt'));
    if (from_member === to_member) return toast('اختار شخصين مختلفين');
    if (amount_c <= 0) return toast('اكتب مبلغ صحيح');
    el.disabled = true;
    try { await addSettlement({ from_member, to_member, amount_c, date: val('s-date') || today(), note: val('s-note') }); closeSheet(); toast('التسوية اتسجلت'); }
    catch (x) { el.disabled = false; toast(errText(x)); }
  },
  shShowSet: el => showSet(el.dataset.id),
  shDelSet: async el => { if (!confirmTap(el)) return; try { await setDeleted('settlements', el.dataset.id, true); closeSheet(); toast('التسوية اتلغت'); } catch (x) { toast(errText(x)); } },
  shRestoreSet: async el => { try { await setDeleted('settlements', el.dataset.id, false); closeSheet(); toast('اترجّعت'); } catch (x) { toast(errText(x)); } },
  shShare: async el => {
    el.disabled = true; const old = el.textContent; el.textContent = 'بيجهّز…';
    try { await shareReport(UI.period, el.dataset.f); } catch (x) { if (x?.name !== 'AbortError') toast('مقدرتش أجهّز التقرير: ' + (x?.message || '')); }
    finally { el.disabled = false; el.textContent = old; }
  },
});

/* ---------------- join (friends, no account) ---------------- */
const J = { code: '', group: null, pick: null };
export async function renderJoin(root, code, onJoined) {
  J.code = (code || '').toUpperCase();
  $('#fab').hidden = true;
  if (!J.code) {
    root.innerHTML = `<section class="card claim"><div class="sh"><h2>ادخل الشلة</h2></div>
    <p class="hint">اكتب كود الشلة اللي اتبعتلك على الواتساب.</p>
    <input id="j-code" dir="ltr" class="pin" maxlength="8" autocomplete="off" placeholder="A1B2C3D4">
    <button class="btn primary block" data-act="jCode">التالي</button></section>`;
    registerActions({ jCode: () => { const c = val('j-code').toUpperCase(); if (c.length < 6) return toast('الكود ناقص'); location.hash = '#/join/' + c; } });
    return;
  }
  root.innerHTML = '<section class="card"><div class="skel"></div></section>';
  try { J.group = await preview(J.code); } catch (x) { root.innerHTML = `<section class="card"><p class="empty">${esc(errText(x))}</p></section>`; return; }
  if (!J.group) { root.innerHTML = `<section class="card claim"><div class="sh"><h2>الكود ده مش شغال</h2></div><p class="hint">اتأكد من الرابط، أو اطلب كود جديد.</p><button class="btn ghost" data-act="jReset">اكتب الكود</button></section>`;
    registerActions({ jReset: () => { location.hash = '#/join'; } }); return; }
  const draw = () => {
    root.innerHTML = `<section class="card claim"><div class="sh"><h2>أهلاً في ${esc(J.group.name)}</h2></div>
    <p class="hint">اختار اسمك واكتب <b>رقمك السري</b> (4 أرقام) اللي اتبعتلك في رسالة لوحدك. ده مش الكود اللي في اللينك.</p>
    ${J.group.members.map(m => `<button class="pick ${J.pick === m.id ? 'on' : ''}" data-act="jPick" data-id="${m.id}">${esc(m.name)}${m.claimed ? ' <small class="hint">(اتسجل قبل كده)</small>' : ''}</button>`).join('') || '<p class="empty">مفيش أسماء جاهزة. كلّم صاحب الشلة.</p>'}
    ${J.pick ? `<label class="fld"><span>رقمك السري</span><input id="j-pin" class="pin" type="password" inputmode="numeric" maxlength="8" autocomplete="one-time-code"></label>
    <button class="btn primary block" data-act="jJoin">دخول</button>` : ''}
    <p class="hint">لو فتحت من موبايل جديد أو مسحت البيانات، اختار اسمك تاني بنفس الرقم السري.</p></section>`;
  };
  registerActions({
    jPick: el => { J.pick = el.dataset.id; draw(); setTimeout(() => $('#j-pin')?.focus(), 50); },
    jJoin: async el => {
      const pin = val('j-pin'); if (!/^\d{4,8}$/.test(pin)) return toast('الرقم السري من 4 لـ 8 أرقام');
      el.disabled = true;
      try {
        const r = await join(J.code, J.pick, pin);
        if (r?.ok) { try { localStorage.setItem('shela.code', J.code); } catch {} toast('أهلاً بيك'); onJoined(r.group_id); return; }
        toast({ bad_pin: `الرقم السري غلط. باقي ${r?.left ?? ''} محاولات.`, locked: 'محاولات كتير. جرّب بعد ربع ساعة.', no_pin: 'لسه متعملكش رقم سري. كلّم صاحب الشلة.', owner: 'إنت صاحب الشلة؛ افتحها من تطبيق مسار (المزيد ← حساب الشلة). اللينك ده لأصحابك بس.' }[r?.error] || 'مقدرتش أدخلك.');
      } catch (x) { toast(errText(x)); }
      el.disabled = false;
    },
  });
  draw();
}
