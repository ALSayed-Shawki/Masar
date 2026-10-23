// الماليات: income / expenses in SAR and EGP, monthly budget, business savings, link to the group.
import { esc, toast, openSheet, closeSheet, seg, segV, val, registerActions, confirmTap } from '../../core/dom.js';
import { today, fmtShort, fmtMonth, pd, ymd } from '../../core/dates.js';
import { errText } from '../../core/supa.js';
import { P, insert, remove, setSetting } from '../../core/store.js';
import { catSelect } from '../capture/view.js';

const UI = { month: today().slice(0, 7), cur: 'SAR', rerender: () => {} };
const fmtN = n => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });

export function renderMoney(root, rerender) {
  UI.rerender = rerender;
  const rows = P.money.filter(x => (x.date || '').startsWith(UI.month));
  const sum = (c, k) => rows.filter(x => x.currency === c && x.kind === k).reduce((s, x) => s + (+x.amount || 0), 0);
  const b = P.settings.budget || {};
  const card = c => { const i = sum(c, 'in'), o = sum(c, 'out'), bud = +b[c] || 0, p = bud ? Math.min(100, o / bud * 100) : 0;
    return `<div class="kpi"><div class="l">${c === 'SAR' ? 'ريال سعودي' : 'جنيه مصري'}</div><div class="v">${fmtN(i - o)}</div><div class="d">دخل ${fmtN(i)} · مصروف ${fmtN(o)}</div>
    ${bud ? `<div class="track" style="margin-top:6px"><div class="fill ${p >= 90 ? 'neg' : p >= 70 ? 'gold' : ''}" style="width:${p}%"></div></div><div class="d">من الميزانية ${fmtN(o)} / ${fmtN(bud)}</div>` : ''}</div>`; };
  const cats = {}; rows.filter(x => x.kind === 'out' && x.currency === UI.cur).forEach(x => { const k = x.category || 'أخرى'; cats[k] = (cats[k] || 0) + (+x.amount || 0); });
  const cm = Math.max(1, ...Object.values(cats));
  const saved = P.money.filter(x => x.kind === 'out' && x.category === 'ادخار البزنس' && x.currency === (b.savingsCurrency || 'SAR')).reduce((s, x) => s + (+x.amount || 0), 0);
  root.innerHTML = `
  <a class="card linkcard" href="#/shela"><span><b>حساب الشلة</b><br><span class="hint">مصاريف السكن المشتركة: مين عليه ومين ليه</span></span><span class="go">افتح</span></a>
  <div class="monthnav"><button class="mini" data-act="mnMonth" data-v="-1">الشهر اللي فات</button><b>${fmtMonth(UI.month + '-01')}</b><button class="mini" data-act="mnMonth" data-v="1">اللي بعده</button></div>
  <div class="kpis">${card('SAR')}${card('EGP')}</div>
  <div class="actions"><button class="btn primary sm" data-act="mnNew">حركة جديدة</button><button class="btn ghost sm" data-act="mnBudget">الميزانية والادخار</button></div>
  ${b.savingsGoal ? `<section class="card"><div class="sh"><h2>رأس مال البزنس</h2><span class="count num">${fmtN(saved)} / ${fmtN(b.savingsGoal)} ${b.savingsCurrency || 'SAR'}</span></div><div class="track"><div class="fill gold" style="width:${Math.min(100, saved / b.savingsGoal * 100)}%"></div></div><p class="hint">بيتحسب من حركات «ادخار البزنس».</p></section>` : ''}
  <section class="card"><div class="sh"><h2>المصروف حسب البند</h2><div class="chips">${['SAR', 'EGP'].map(c => `<button class="${UI.cur === c ? 'on' : ''}" data-act="mnCur" data-v="${c}">${c}</button>`).join('')}</div></div>
    ${Object.keys(cats).length ? `<div class="bars">${Object.entries(cats).sort((x, y) => y[1] - x[1]).map(([n, v]) => `<div class="bar"><span class="n">${esc(n)}</span><div class="track"><div class="fill gold" style="width:${v / cm * 100}%"></div></div><span class="num">${fmtN(v)}</span></div>`).join('')}</div>` : '<p class="empty">مفيش مصروفات بالعملة دي الشهر ده.</p>'}</section>
  <section class="card"><div class="sh"><h2>الحركات</h2><span class="count num">${rows.length}</span></div>
    ${rows.length ? rows.map(x => `<div class="mrow"><span>${esc(x.note || x.category || '')}<br><small>${esc(x.category || '')} · ${fmtShort(x.date)}</small></span><span style="text-align:left"><span class="amt ${x.kind}">${x.kind === 'in' ? '+' : '−'}${fmtN(x.amount)} ${x.currency}</span><br><button class="mini" data-act="mnDel" data-id="${x.id}">حذف</button></span></div>`).join('')
      : '<p class="empty">سجّل أي مصروف أو دخل من زرار + بجملة زي «دفعت 120 ريال بنزين».</p>'}</section>`;
}

registerActions({
  mnMonth: el => { const d = pd(UI.month + '-01'); d.setMonth(d.getMonth() + (+el.dataset.v)); UI.month = ymd(d).slice(0, 7); UI.rerender(); },
  mnCur: el => { UI.cur = el.dataset.v; UI.rerender(); },
  mnNew: () => {
    openSheet(`<h3>حركة مالية</h3>
    <div class="fld"><span>النوع</span>${seg('m-kind', [['out', 'مصروف'], ['in', 'دخل']], 'out')}</div>
    <div class="row2"><label class="fld"><span>المبلغ</span><input id="m-amt" inputmode="decimal"></label><div class="fld"><span>العملة</span>${seg('m-cur', [['SAR', 'ريال'], ['EGP', 'جنيه']], UI.cur)}</div></div>
    <label class="fld" id="m-cat-wrap"><span>البند</span>${catSelect('m-cat', 'out', '')}</label>
    <div class="row2"><label class="fld"><span>التاريخ</span><input type="date" id="m-date" value="${today()}"></label><label class="fld"><span>ملاحظة</span><input id="m-note"></label></div>
    <div class="actions"><button class="btn primary block" data-act="mnSave">حفظ</button></div>`);
    document.getElementById('m-kind').addEventListener('segchange', e => { document.getElementById('m-cat').outerHTML = catSelect('m-cat', e.detail, ''); });
  },
  mnSave: async el => {
    const a = parseFloat(val('m-amt').replace(',', '.')); if (!(a > 0)) return toast('اكتب مبلغ صحيح');
    el.disabled = true;
    try { await insert('money', { kind: segV('m-kind') || 'out', amount: a, currency: segV('m-cur') || 'SAR', category: val('m-cat'), note: val('m-note'), date: val('m-date') || today() }); closeSheet(); toast('اتسجلت'); }
    catch (x) { el.disabled = false; toast(errText(x)); }
  },
  mnDel: async el => { if (!confirmTap(el, 'تأكيد؟')) return; try { await remove('money', el.dataset.id); } catch (x) { toast(errText(x)); } },
  mnBudget: () => { const b = P.settings.budget || {};
    openSheet(`<h3>الميزانية الشهرية والادخار</h3>
    <div class="row2"><label class="fld"><span>ميزانية المصروف بالريال</span><input id="b-sar" inputmode="decimal" value="${b.SAR || ''}"></label><label class="fld"><span>ميزانية المصروف بالجنيه</span><input id="b-egp" inputmode="decimal" value="${b.EGP || ''}"></label></div>
    <div class="row2"><label class="fld"><span>هدف رأس مال البزنس</span><input id="b-goal" inputmode="decimal" value="${b.savingsGoal || ''}"></label><div class="fld"><span>بعملة</span>${seg('b-cur', [['SAR', 'ريال'], ['EGP', 'جنيه']], b.savingsCurrency || 'SAR')}</div></div>
    <div class="actions"><button class="btn primary block" data-act="mnSaveBudget">حفظ</button></div>`); },
  mnSaveBudget: async () => { const n = id => parseFloat(val(id).replace(',', '.')) || 0;
    try { await setSetting('budget', { SAR: n('b-sar'), EGP: n('b-egp'), savingsGoal: n('b-goal'), savingsCurrency: segV('b-cur') || 'SAR' }); closeSheet(); toast('اتحفظت'); } catch (x) { toast(errText(x)); } },
});
