// الميزان: weekly scorecard, where time went, mood, prayers & medication, goals, achievements (CV), AI review.
import { esc, toast, openSheet, closeSheet, seg, segV, val, registerActions, confirmTap, copyText } from '../../core/dom.js';
import { today, addDays, dayDiff, fmtShort, pd } from '../../core/dates.js';
import { errText } from '../../core/supa.js';
import { ai, mdHtml } from '../../core/ai.js';
import { P, insert, update, remove, saveDay, saveWeek, pName, openTasks, doneDate } from '../../core/store.js';
import { AREAS, sheetWin, hue } from '../tasks/view.js';
import { weekStats, PRAYERS, doses } from '../today/view.js';

const WD = ['س', 'ح', 'ن', 'ث', 'ر', 'خ', 'ج'];
const UI = { rerender: () => {}, lastAI: '', tab: 'week', tip: '' };
const TABS = [['week', 'الأسبوع'], ['habits', 'عاداتي'], ['goals', 'الأهداف'], ['wins', 'الإنجازات']];
const INFO = {
  done: 'عدد المهام اللي علّمت عليها «تم» من السبت لحد النهارده. السهم مقارنة بالأسبوع اللي فات كله.',
  late: 'مهام موعدها عدّى ولسه مفتوحة. كل ما يقل الرقم ده أحسن، وبتتنقل من «آخر اليوم».',
  rolled: 'مهام مفتوحة اتنقل موعدها مرتين أو أكتر. غالبًا محتاجة تتقسم لخطوة أصغر أو تتلغي.',
};
const pColor = id => id ? `hsl(${hue(id)} 45% 40%)` : 'var(--muted)';
const MOODC = ['var(--sunk)', '#E8B4A6', '#EBC98F', '#E7D98A', '#BFDDA0', '#9FD3B6'];
const PC = { ontime: 'var(--accent)', late: 'var(--gold)', missed: 'var(--neg)' };

export function renderLedger(root, rerender) {
  UI.rerender = rerender;
  const tab = UI.tab;
  root.innerHTML = `<div class="chips">${TABS.map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-act="lgTab" data-v="${k}">${l}</button>`).join('')}</div>
  ${tab === 'week' ? weekTab() : tab === 'habits' ? habitsTab() : tab === 'goals' ? goalsTab() : winsTab()}`;
}

function weekTab() {
  const st = weekStats(), td = st.td, open = openTasks();
  const late = open.filter(t => t.due && t.due < td), rolled = open.filter(t => (t.rolled || 0) >= 2);
  const diff = st.done.length - st.prev.length;
  const byP = {}; st.done.forEach(t => { const k = t.project_id || ''; byP[k] = (byP[k] || 0) + 1; });
  const split = Object.entries(byP).sort((a, b) => b[1] - a[1]);
  const top = split[0] && split[0][0] ? pName(split[0][0]) : '';
  const tone = st.done.length === 0 ? 'لسه بادئ' : diff > 0 ? 'كويس' : diff === 0 ? 'ثابت' : 'أهدى من اللي فات';
  const verdict = st.done.length
    ? `أسبوع <b>${tone}</b>: قفلت <b class="num">${st.done.length}</b> مهمة${st.prev.length || diff ? `، ${diff > 0 ? `<b class="num">${diff}</b> أكتر من` : diff < 0 ? `<b class="num">${-diff}</b> أقل من` : 'زي'} الأسبوع اللي فات` : ''}.${top ? ` أغلب وقتك راح على <b>${esc(top)}</b>.` : ''}${rolled.length ? ` وفيه <b class="num">${rolled.length}</b> ${rolled.length > 2 ? 'مهام' : 'مهمة'} بتترحّل.` : ''}`
    : 'لسه ماقفلتش مهام الأسبوع ده. ابدأ بأصغر حاجة في «اليوم».';
  const kpi = (k, v, l, d, cls, col) => `<div class="kpi2"><button class="info" data-act="lgInfo" data-k="${k}" aria-label="الرقم ده بيتحسب إزاي">i</button><span class="v num" style="color:${col}">${v}</span><span class="l">${l}</span><span class="d ${cls}">${d}</span></div>`;
  const days = [...Array(7)].map((_, i) => addDays(st.ws, i));
  const alerts = [];
  rolled.filter(t => (t.rolled || 0) >= 3).slice(0, 3).forEach(t => alerts.push(`«${esc(t.title)}» اترحّلت ${t.rolled} مرات. قسّمها لخطوة أصغر أو خد قرار تلغيها.`));
  P.projects.filter(p => p.status === 'active').forEach(p => {
    const lastDone = P.tasks.filter(t => t.project_id === p.id).map(doneDate).filter(Boolean).sort().pop();
    if (open.some(t => t.project_id === p.id) && (!lastDone || dayDiff(td, lastDone) >= 7)) alerts.push(`<b>${esc(p.name)}</b> مافيهوش إنجاز ${lastDone ? `من ${dayDiff(td, lastDone)} يوم` : 'لسه'} وعنده مهام مفتوحة.`);
  });
  const noDod = st.openDue.filter(t => !t.dod).length; if (noDod >= 3) alerts.push(`${noDod} مهام مستحقة من غير «تعريف إنجاز». حدد امتى تقول خلصت.`);
  return `<section class="card verdict">${verdict}</section>
  <div class="kpis3">${kpi('done', st.done.length, 'خلص', diff > 0 ? `▲ ${diff} عن اللي فات` : diff < 0 ? `▼ ${-diff} عن اللي فات` : 'زي اللي فات', diff >= 0 ? 'up' : 'down', 'var(--accent)')}${kpi('late', late.length, 'متأخر', late.length ? 'محتاجة قرار' : 'مفيش 👌', late.length ? 'down' : 'up', 'var(--neg)')}${kpi('rolled', rolled.length, 'بيترحّل', rolled.length ? 'قسّمها' : 'تمام', rolled.length ? 'down' : 'up', 'var(--gold)')}</div>
  ${UI.tip ? `<div class="tip">${UI.tip}</div>` : ''}
  <section class="card"><div class="sh"><h2>وقتك راح فين</h2><span class="count">${fmtShort(st.ws)} – ${fmtShort(st.we)}</span></div>
    ${split.length ? `<div class="stack">${split.map(([k, v]) => `<span style="width:${(v / st.done.length * 100).toFixed(1)}%;background:${pColor(k)}"></span>`).join('')}</div>
    <div class="legend">${split.map(([k, v]) => `<span><i class="dot" style="background:${pColor(k)}"></i>${esc(k ? pName(k) : 'بدون مشروع')} <b class="num">${v}</b></span>`).join('')}</div>` : '<p class="empty">لما تقفل مهام هيظهر هنا وقتك اتوزع إزاي.</p>'}</section>
  <section class="card"><div class="sh"><h2>أيام الأسبوع</h2><span class="count">منجز · مزاج · الصلاة</span></div>
    <div class="days">${days.map((d, i) => { const dd = P.days[d] || {}, n = P.tasks.filter(t => doneDate(t) === d).length, fut = d > td;
      return `<div class="day ${d === td ? 'now' : ''} ${fut ? 'fut' : ''}"><span class="w">${WD[i]}</span><span class="n num">${fut ? '–' : n}</span><span class="mood" style="background:${MOODC[dd.mood || 0]}">${dd.mood || ''}</span><span class="pd">${PRAYERS.map(([k]) => `<i style="background:${PC[dd.prayers?.[k]] || 'var(--line)'}"></i>`).join('')}</span></div>`; }).join('')}</div>
    <div class="legend"><span><i class="dot" style="background:var(--accent)"></i>في وقتها</span><span><i class="dot" style="background:var(--gold)"></i>متأخرة</span><span><i class="dot" style="background:var(--neg)"></i>فاتت</span></div></section>
  ${alerts.length ? `<section class="card"><div class="sh"><h2>انتبه</h2></div>${alerts.slice(0, 5).map(a => `<div class="alert"><span class="ic">!</span><span>${a}</span></div>`).join('')}</section>` : ''}
  <button class="btn primary block" data-act="lgReview">راجع الأسبوع مع المدرب</button>
  ${P.weeks[st.ws]?.review ? `<details class="card"><summary><b>آخر مراجعة اتحفظت</b></summary><div class="ai-out">${mdHtml(P.weeks[st.ws].review, esc)}</div></details>` : ''}`;
}

function habitsTab() {
  const st = weekStats(), td = st.td;
  const first = Object.keys(P.days).sort()[0] || td, ws = first > st.ws ? first : st.ws, nd = dayDiff(td, ws) + 1, tot = nd * 5;
  let on = 0, late = 0, miss = 0, blank = 0, taken = 0; const md = doses();
  for (let d = ws; d <= td; d = addDays(d, 1)) { const p = P.days[d]?.prayers || {}; PRAYERS.forEach(([k]) => { const v = p[k]; if (v === 'ontime') on++; else if (v === 'late') late++; else if (v === 'missed') miss++; else blank++; }); const m = P.days[d]?.meds || {}; md.forEach(x => { if (m[x.key] === 'taken') taken++; }); }
  const allMissed = Object.values(P.days).reduce((s, d) => s + PRAYERS.filter(([k]) => d.prayers?.[k] === 'missed').length, 0);
  const owed = Math.max(0, allMissed - Object.values(P.days).reduce((s, d) => s + (d.qada || 0), 0));
  const bar = (n, v, max, cls = '') => `<div class="bar"><span class="n">${n}</span><div class="track"><div class="fill ${cls}" style="width:${max ? Math.min(100, v / max * 100) : 0}%"></div></div><span class="num">${v}${max ? '/' + max : ''}</span></div>`;
  const d14 = [...Array(14)].map((_, i) => addDays(td, i - 13));
  const pts = k => d14.map((d, i) => { const v = P.days[d]?.[k]; return v ? [(i * (300 / 13) + 10).toFixed(1), (70 - v * 12).toFixed(1)] : null; });
  const line = (k, col) => { const p = pts(k), segs = []; let cur = []; p.forEach(x => { if (x) cur.push(x.join(',')); else { if (cur.length) segs.push(cur); cur = []; } }); if (cur.length) segs.push(cur);
    return segs.map(s => s.length > 1 ? `<polyline points="${s.join(' ')}" fill="none" stroke="${col}" stroke-width="2.2" stroke-linejoin="round"/>` : '').join('') + p.filter(Boolean).map(([a, b]) => `<circle cx="${a}" cy="${b}" r="3" fill="${col}"/>`).join(''); };
  const hasMood = d14.some(d => P.days[d]?.mood);
  const avg = k => { const v = d14.map(d => P.days[d]?.[k]).filter(Boolean); return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : '–'; };
  return `<section class="card"><div class="sh"><h2>الصلاة</h2><span class="count">${ws === st.ws ? 'من السبت' : 'من أول يوم سجّلت'}</span></div>
    <div class="bars">${bar('في وقتها', on, tot)}${bar('متأخرة', late, 0, 'gold')}${bar('فاتت', miss, 0, 'neg')}</div>
    ${blank ? `<p class="hint">${blank} فرض لسه متسجلش.</p>` : ''}
    <div class="row"><b>عليك قضاء <span class="num">${owed}</span></b><button class="mini" data-act="lgQada" ${owed ? '' : 'disabled'}>قضيت فرض</button><small>الفروض اللي فاتت ناقص اللي قضيته</small></div></section>
  <section class="card"><div class="sh"><h2>الدواء</h2><button class="link" data-act="tdMeds">المواعيد</button></div>
    ${md.length ? `<div class="bars">${bar('خدته', taken, md.length * nd)}</div>` : '<p class="empty">مفيش دواء متسجل.</p>'}</section>
  <section class="card"><div class="sh"><h2>المزاج والطاقة</h2><span class="count">14 يوم · مزاج <span class="num">${avg('mood')}</span> · طاقة <span class="num">${avg('energy')}</span></span></div>
    ${hasMood ? `<svg viewBox="0 0 320 80" style="width:100%;display:block" role="img" aria-label="خط المزاج والطاقة"><line x1="10" x2="310" y1="34" y2="34" stroke="var(--line)" stroke-dasharray="3 4"/>${line('energy', 'var(--muted)')}${line('mood', 'var(--gold)')}</svg><p class="hint"><span style="color:var(--gold)">●</span> المزاج <span style="color:var(--muted)">●</span> الطاقة · الخط المتقطع = 3 من 5</p>` : '<p class="empty">سجّل يومك من صفحة اليوم وهيظهر الخط هنا.</p>'}</section>
  <div class="kpis"><div class="kpi"><div class="v">${st.streak}</div><div class="l">سلسلة الأيام: أيام ورا بعض فيها إنجاز أو تسجيل</div></div><div class="kpi"><div class="v">${st.pct}%</div><div class="l">من المستحق لحد الجمعة اتقفل</div></div></div>`;
}

function goalsTab() {
  return `<div class="actions"><button class="btn primary sm" data-act="lgGoal">هدف جديد</button></div>
  ${P.goals.length ? P.goals.map(g => `<section class="card goal"><div class="gt"><b>${esc(g.title)}</b><span class="tag">${AREAS[g.area] || ''}</span></div>
      <div class="track"><div class="fill ${g.progress >= 100 ? '' : 'gold'}" style="width:${Math.min(100, g.progress || 0)}%"></div></div>
      ${g.next_step ? `<div class="ns">الخطوة الجاية: ${esc(g.next_step)}</div>` : ''}
      <div class="ctl"><span class="num">${g.progress || 0}%</span>${g.deadline ? `<span>· موعد ${fmtShort(g.deadline)}</span>` : ''}
      <span class="acts-end"><button class="mini" data-act="lgStep" data-id="${g.id}" data-v="-10">−10</button><button class="mini" data-act="lgStep" data-id="${g.id}" data-v="10">+10</button><button class="mini" data-act="lgGoal" data-id="${g.id}">تعديل</button></span></div></section>`).join('') : '<section class="card"><p class="empty">ضيف أهدافك الكبيرة وحط لكل واحد الخطوة الجاية.</p></section>'}`;
}

function winsTab() {
  const months = {}; P.wins.forEach(w => { (months[w.date.slice(0, 7)] ||= []).push(w); });
  const mName = m => pd(m + '-01').toLocaleDateString('ar-EG-u-nu-latn', { month: 'long', year: 'numeric' });
  return `<div class="actions"><button class="btn primary sm" data-act="lgWin">إنجاز جديد</button>${P.wins.length ? '<button class="btn ghost sm" data-act="lgCV">صياغة نقاط CV</button>' : ''}</div>
  ${P.wins.length ? Object.keys(months).sort().reverse().map(m => `<section class="card"><div class="sh"><h2>${mName(m)}</h2><span class="count">${months[m].length}</span></div><div class="tline">${months[m].map(w => `<div class="it">${esc(w.text)}<div class="meta">${w.project_id ? `<span class="chip">${esc(pName(w.project_id))}</span>` : ''}<span>${fmtShort(w.date)}</span><span class="acts-end"><button class="mini" data-act="lgCopy" data-text="${esc(w.text)}">نسخ</button><button class="mini" data-act="lgDelWin" data-id="${w.id}">حذف</button></span></div></div>`).join('')}</div></section>`).join('') : '<section class="card"><p class="empty">كل حل قوي أو تسليم مهم يتسجل هنا بصيغة تنفع للـCV.</p></section>'}`;
}

function weekDigest() {
  const st = weekStats(), days = [...Array(7)].map((_, i) => P.days[addDays(st.ws, i)]).filter(Boolean);
  return `الأسبوع: ${st.ws} إلى ${st.we}. النهارده ${st.td}.
تركيز الأسبوع: ${(P.weeks[st.ws]?.focus || []).filter(Boolean).join(' | ') || 'غير محدد'}
منجز (${st.done.length})، الأسبوع اللي فات ${st.prev.length}:
${st.done.map(t => `- [${pName(t.project_id) || 'بدون مشروع'}] ${t.title}`).join('\n') || '-'}
مفتوح ومستحق لحد آخر الأسبوع (${st.openDue.length}):
${st.openDue.map(t => `- [${pName(t.project_id) || 'بدون مشروع'}] ${t.title} | موعد ${t.due} | اترحّلت ${t.rolled || 0} | تعريف إنجاز: ${t.dod ? 'موجود' : 'ناقص'}`).join('\n') || '-'}
مهام بدون موعد: ${openTasks().filter(t => !t.due).length}
المزاج/الطاقة: ${days.map(d => `${d.date}: ${d.mood || '-'}/${d.energy || '-'} ${d.word || ''}`).join(' ; ') || 'مفيش تسجيل'}
الصلاة: ${days.map(d => `${d.date}: ${Object.values(d.prayers || {}).join(',')}`).join(' ; ') || '-'}
إنجازات مسجلة الأسبوع ده: ${P.wins.filter(w => w.date >= st.ws).map(w => w.text).join(' | ') || '-'}
الأهداف: ${P.goals.map(g => `${g.title} (${g.progress || 0}%، الخطوة الجاية: ${g.next_step || '-'})`).join(' | ') || '-'}`;
}

export async function aiSheet(title, task, input, saveAct) {
  openSheet(`<h3>${title}</h3><div class="ai-out" id="ai-out"><p class="hint">بيفكر… ممكن ياخد نص دقيقة.</p></div><div class="actions" id="ai-acts"></div>`);
  try {
    const text = await ai(task, input); UI.lastAI = text;
    const o = document.getElementById('ai-out'); if (!o) return;
    o.innerHTML = mdHtml(text, esc);
    document.getElementById('ai-acts').innerHTML = `<button class="btn ghost" data-act="lgCopy" data-text="${esc(text)}">نسخ</button>${saveAct ? `<button class="btn primary" data-act="${saveAct}">احفظ في الأسبوع</button>` : ''}`;
  } catch (x) { const o = document.getElementById('ai-out'); if (o) o.innerHTML = `<p class="hint">${esc(x.message)}</p>`; }
}

function sheetGoal(id) {
  const g = P.goals.find(x => x.id === id) || { title: '', area: 'growth', progress: 0, next_step: '', deadline: '' };
  openSheet(`<h3>${id ? 'تعديل هدف' : 'هدف جديد'}</h3>
  <label class="fld"><span>الهدف</span><input id="g-title" value="${esc(g.title)}"></label>
  <div class="fld"><span>المجال</span>${seg('g-area', Object.entries(AREAS), g.area)}</div>
  <label class="fld"><span>الخطوة الجاية</span><input id="g-next" value="${esc(g.next_step || '')}"></label>
  <div class="row2"><label class="fld"><span>التقدم %</span><input id="g-prog" type="number" min="0" max="100" step="5" value="${g.progress || 0}"></label><label class="fld"><span>موعد</span><input type="date" id="g-dl" value="${esc(g.deadline || '')}"></label></div>
  <div class="actions"><button class="btn primary" data-act="lgSaveGoal" data-id="${id || ''}">حفظ</button>${id ? `<button class="btn danger" data-act="lgDelGoal" data-id="${id}">حذف</button>` : ''}</div>`);
}

registerActions({
  lgTab: el => { UI.tab = el.dataset.v; UI.tip = ''; UI.rerender(); },
  lgInfo: el => { UI.tip = UI.tip === INFO[el.dataset.k] ? '' : INFO[el.dataset.k]; UI.rerender(); },
  lgReview: () => aiSheet('مراجعة الأسبوع', 'review', weekDigest(), 'lgSaveReview'),
  lgSaveReview: async () => { try { await saveWeek(weekStats().ws, { review: UI.lastAI, reviewed_at: new Date().toISOString() }); toast('اتحفظت المراجعة'); } catch (x) { toast(errText(x)); } },
  lgCV: () => aiSheet('نقاط CV', 'cv', P.wins.slice(0, 40).map(w => `- ${w.text}${w.project_id ? ` (${pName(w.project_id)})` : ''}`).join('\n')),
  lgCopy: el => copyText(el.dataset.text),
  lgQada: async () => { const td = today(); try { await saveDay(td, { qada: (P.days[td]?.qada || 0) + 1 }); toast('تقبّل الله'); } catch (x) { toast(errText(x)); } },
  lgGoal: el => sheetGoal(el.dataset.id),
  lgSaveGoal: async el => {
    const title = val('g-title'); if (!title) return toast('اكتب الهدف');
    const data = { title, area: segV('g-area') || 'growth', next_step: val('g-next'), progress: Math.max(0, Math.min(100, +val('g-prog') || 0)), deadline: val('g-dl') || null };
    try { if (el.dataset.id) await update('goals', el.dataset.id, data); else await insert('goals', { ...data, sort: P.goals.length + 1 }); closeSheet(); toast('اتحفظ'); } catch (x) { toast(errText(x)); }
  },
  lgDelGoal: async el => { if (!confirmTap(el)) return; try { await remove('goals', el.dataset.id); closeSheet(); } catch (x) { toast(errText(x)); } },
  lgStep: async el => { const g = P.goals.find(x => x.id === el.dataset.id); if (!g) return; try { await update('goals', g.id, { progress: Math.max(0, Math.min(100, (g.progress || 0) + (+el.dataset.v))) }); } catch (x) { toast(errText(x)); } },
  lgWin: () => sheetWin(),
  lgDelWin: async el => { if (!confirmTap(el, 'تأكيد؟')) return; try { await remove('wins', el.dataset.id); } catch (x) { toast(errText(x)); } },
});

/** Open تقريري on a given tab (used by المزيد). */
export function ledgerTab(k) { UI.tab = k; UI.tip = ''; }
