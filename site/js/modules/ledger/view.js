// الميزان: weekly scorecard, where time went, mood, prayers & medication, goals, achievements (CV), AI review.
import { esc, toast, openSheet, closeSheet, seg, segV, val, registerActions, confirmTap, copyText } from '../../core/dom.js';
import { today, addDays, dayDiff, fmtShort } from '../../core/dates.js';
import { errText } from '../../core/supa.js';
import { ai, mdHtml } from '../../core/ai.js';
import { P, insert, update, remove, saveDay, saveWeek, pName, openTasks, doneDate } from '../../core/store.js';
import { AREAS, sheetWin } from '../tasks/view.js';
import { weekStats, PRAYERS, doses } from '../today/view.js';

const WD = ['س', 'ح', 'ن', 'ث', 'ر', 'خ', 'ج'];
const UI = { rerender: () => {}, lastAI: '' };

export function renderLedger(root, rerender) {
  UI.rerender = rerender;
  const st = weekStats(), td = st.td;
  const days = [...Array(7)].map((_, i) => addDays(st.ws, i));
  const counts = days.map(d => P.tasks.filter(t => doneDate(t) === d).length), mx = Math.max(3, ...counts);
  const W = 320, H = 130, bw = 26, gap = (W - 7 * bw) / 8;
  const bars = days.map((d, i) => {
    const x = W - (gap + i * (bw + gap)) - bw, h = Math.round(counts[i] / mx * 80), m = P.days[d]?.mood;
    return `<rect x="${x}" y="${100 - h}" width="${bw}" height="${Math.max(h, 2)}" rx="5" fill="${d === td ? 'var(--accent)' : 'var(--accent-soft)'}"/>
    ${counts[i] ? `<text x="${x + bw / 2}" y="${94 - h}" text-anchor="middle" font-size="11" fill="var(--ink)" style="font-family:var(--f-num)">${counts[i]}</text>` : ''}
    <text x="${x + bw / 2}" y="117" text-anchor="middle" font-size="12" fill="var(--muted)">${WD[i]}</text>${m ? `<circle cx="${x + bw / 2}" cy="127" r="${1.5 + m * .6}" fill="var(--gold)"/>` : ''}`;
  }).join('');
  const byP = {}; st.done.forEach(t => { const k = pName(t.project_id) || 'بدون مشروع'; byP[k] = (byP[k] || 0) + 1; });
  const pm = Math.max(1, ...Object.values(byP));
  const d14 = [...Array(14)].map((_, i) => addDays(td, i - 13));
  const pts = k => d14.map((d, i) => { const v = P.days[d]?.[k]; return v ? [(i * (300 / 13) + 10).toFixed(1), (70 - v * 12).toFixed(1)] : null; });
  const line = (k, col) => { const p = pts(k), segs = []; let cur = []; p.forEach(x => { if (x) cur.push(x.join(',')); else { if (cur.length) segs.push(cur); cur = []; } }); if (cur.length) segs.push(cur);
    return segs.map(s => s.length > 1 ? `<polyline points="${s.join(' ')}" fill="none" stroke="${col}" stroke-width="2.2" stroke-linejoin="round"/>` : '').join('') + p.filter(Boolean).map(([a, b]) => `<circle cx="${a}" cy="${b}" r="3" fill="${col}"/>`).join(''); };
  const hasMood = d14.some(d => P.days[d]?.mood);
  const avg = k => { const v = d14.map(d => P.days[d]?.[k]).filter(Boolean); return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : '–'; };
  const monthWins = P.wins.filter(w => w.date >= td.slice(0, 7) + '-01').length;

  // prayers & medication since Saturday (or since first use)
  const first = Object.keys(P.days).sort()[0] || td, ws = first > st.ws ? first : st.ws, nd = dayDiff(td, ws) + 1, tot = nd * 5;
  let on = 0, late = 0, miss = 0, blank = 0, taken = 0; const md = doses();
  for (let d = ws; d <= td; d = addDays(d, 1)) { const p = P.days[d]?.prayers || {}; PRAYERS.forEach(([k]) => { const v = p[k]; if (v === 'ontime') on++; else if (v === 'late') late++; else if (v === 'missed') miss++; else blank++; }); const m = P.days[d]?.meds || {}; md.forEach(x => { if (m[x.key] === 'taken') taken++; }); }
  const allMissed = Object.values(P.days).reduce((s, d) => s + PRAYERS.filter(([k]) => d.prayers?.[k] === 'missed').length, 0);
  const owed = Math.max(0, allMissed - Object.values(P.days).reduce((s, d) => s + (d.qada || 0), 0));
  const bar = (n, v, max, cls = '') => `<div class="bar"><span class="n">${n}</span><div class="track"><div class="fill ${cls}" style="width:${max ? Math.min(100, v / max * 100) : 0}%"></div></div><span class="num">${v}${max ? '/' + max : ''}</span></div>`;

  root.innerHTML = `
  <div class="kpis kpis4">
    <div class="kpi"><div class="v">${st.done.length}</div><div class="l">منجز الأسبوع</div><div class="d">اللي فات ${st.prev.length}</div></div>
    <div class="kpi"><div class="v">${st.pct}%</div><div class="l">نسبة الإنجاز</div><div class="d">من المستحق لحد الجمعة</div></div>
    <div class="kpi"><div class="v">${st.streak}</div><div class="l">سلسلة الأيام</div><div class="d">يوم فيه إنجاز أو تسجيل</div></div>
    <div class="kpi"><div class="v">${monthWins}</div><div class="l">إنجازات الشهر</div><div class="d">للـCV والبروفايل</div></div>
  </div>
  <section class="card"><div class="sh"><h2>ميزان الأسبوع</h2><span class="count">${fmtShort(st.ws)} – ${fmtShort(st.we)}</span></div>
    <svg viewBox="0 0 ${W} ${H + 5}" style="width:100%;max-width:${W * 1.4}px;display:block;margin:0 auto" role="img" aria-label="المهام المنجزة لكل يوم">${bars}</svg>
    <p class="hint">الأعمدة: مهام اتقفلت كل يوم من السبت للجمعة. النقطة الدهبي: مزاج اليوم.</p>
    <button class="btn primary block" data-act="lgReview">مراجعة الأسبوع مع المدرب</button></section>
  <section class="card"><div class="sh"><h2>الأسبوع راح على إيه</h2></div>
    ${Object.keys(byP).length ? `<div class="bars">${Object.entries(byP).sort((a, b) => b[1] - a[1]).map(([n, v]) => `<div class="bar"><span class="n">${esc(n)}</span><div class="track"><div class="fill" style="width:${v / pm * 100}%"></div></div><span class="num">${v}</span></div>`).join('')}</div>` : '<p class="empty">لما تقفل مهام هيظهر هنا وقتك راح على أنهي مشروع.</p>'}</section>
  <section class="card"><div class="sh"><h2>الصلاة والدواء</h2><span class="count">${ws === st.ws ? 'من السبت' : 'من أول يوم سجّلت'}</span></div>
    <div class="bars">${bar('في وقتها', on, tot)}${bar('متأخرة', late, 0, 'gold')}${bar('فاتت', miss, 0, 'neg')}${md.length ? bar('الدواء', taken, md.length * nd) : ''}</div>
    ${blank ? `<p class="hint">${blank} فرض لسه متسجلش.</p>` : ''}
    <div class="row"><b>عليك قضاء <span class="num">${owed}</span></b><button class="mini" data-act="lgQada" ${owed ? '' : 'disabled'}>قضيت فرض</button><small>الفروض اللي فاتت في آخر سنة ناقص اللي قضيته</small></div></section>
  <section class="card"><div class="sh"><h2>المزاج والطاقة</h2><span class="count">14 يوم · مزاج <span class="num">${avg('mood')}</span> · طاقة <span class="num">${avg('energy')}</span></span></div>
    ${hasMood ? `<svg viewBox="0 0 320 80" style="width:100%;display:block" role="img" aria-label="خط المزاج والطاقة"><line x1="10" x2="310" y1="34" y2="34" stroke="var(--line)" stroke-dasharray="3 4"/>${line('energy', 'var(--muted)')}${line('mood', 'var(--gold)')}</svg><p class="hint"><span style="color:var(--gold)">●</span> المزاج <span style="color:var(--muted)">●</span> الطاقة · الخط المتقطع = 3 من 5</p>` : '<p class="empty">سجّل يومك من صفحة اليوم وهيظهر الخط هنا.</p>'}</section>
  <section class="card"><div class="sh"><h2>الأهداف</h2><button class="link" data-act="lgGoal">هدف جديد</button></div>
    ${P.goals.length ? P.goals.map(g => `<div class="goal"><div class="gt"><b>${esc(g.title)}</b><span class="tag">${AREAS[g.area] || ''}</span></div>
      <div class="track"><div class="fill ${g.progress >= 100 ? '' : 'gold'}" style="width:${Math.min(100, g.progress || 0)}%"></div></div>
      <div class="ctl"><span class="num">${g.progress || 0}%</span>${g.deadline ? `<span>· موعد ${fmtShort(g.deadline)}</span>` : ''}${g.next_step ? `<span>· الخطوة الجاية: ${esc(g.next_step)}</span>` : ''}
      <span class="acts-end"><button class="mini" data-act="lgStep" data-id="${g.id}" data-v="-10">−10</button><button class="mini" data-act="lgStep" data-id="${g.id}" data-v="10">+10</button><button class="mini" data-act="lgGoal" data-id="${g.id}">تعديل</button></span></div></div>`).join('') : '<p class="empty">ضيف أهدافك الكبيرة وحط لكل واحد الخطوة الجاية.</p>'}</section>
  <section class="card"><div class="sh"><h2>سجل الإنجازات</h2><button class="link" data-act="lgWin">إنجاز جديد</button></div>
    ${P.wins.length ? P.wins.slice(0, 30).map(w => `<div class="item"><p>${esc(w.text)}</p><div class="meta">${w.project_id ? `<span class="chip">${esc(pName(w.project_id))}</span>` : ''}<span>${fmtShort(w.date)}</span><span class="acts-end"><button class="mini" data-act="lgCopy" data-text="${esc(w.text)}">نسخ</button><button class="mini" data-act="lgDelWin" data-id="${w.id}">حذف</button></span></div></div>`).join('') : '<p class="empty">كل حل قوي أو تسليم مهم يتسجل هنا بصيغة تنفع للـCV.</p>'}
    ${P.wins.length ? '<button class="btn ghost sm" data-act="lgCV">صياغة نقاط CV من الإنجازات</button>' : ''}</section>`;
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
