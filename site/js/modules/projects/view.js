// المشاريع: every project with its scope, status and next step; inside a project the AI
// reads the scope + tasks + done-notes and tells you where it stands and what to do next.
import { $, esc, toast, openSheet, closeSheet, seg, segV, val, registerActions } from '../../core/dom.js';
import { today, weekStart, fmtShort, ymd } from '../../core/dates.js';
import { errText } from '../../core/supa.js';
import { ai, mdHtml } from '../../core/ai.js';
import { P, myName, insert, update, openTasks, doneDate } from '../../core/store.js';
import { AREAS, taskList, byDue } from '../tasks/view.js';

const STATUS = { active: 'شغال', prospect: 'عميل محتمل / ديمو', paused: 'متوقف', done: 'خلص' };
const UI = { rerender: () => {}, busy: false };

export function renderProjects(root, rerender) {
  UI.rerender = rerender;
  const ws = weekStart(today());
  const card = p => {
    const open = openTasks().filter(t => t.project_id === p.id), late = open.filter(t => t.due && t.due < today()).length;
    const week = P.tasks.filter(t => t.project_id === p.id && doneDate(t) >= ws).length;
    return `<a class="card pcard" href="#/project/${p.id}"><div class="sh"><h2>${esc(p.name)}</h2><span class="pill st-${p.status}">${STATUS[p.status] || ''}</span></div>
      ${p.client ? `<p class="hint" style="margin:0">${esc(p.client)}</p>` : ''}
      <div class="meta"><span>مفتوح <b class="num">${open.length}</b></span>${late ? `<span class="due over">متأخر ${late}</span>` : ''}<span>خلص الأسبوع ده <b class="num">${week}</b></span>${p.scope ? '' : '<span class="rolled">من غير Scope</span>'}</div>
      ${p.next_step ? `<p class="next">الخطوة الجاية: ${esc(p.next_step)}</p>` : ''}</a>`;
  };
  const by = s => P.projects.filter(p => p.status === s);
  root.innerHTML = `<div class="actions"><button class="btn primary sm" data-act="pjNew">مشروع جديد</button><a class="btn ghost sm" href="#/tasks">كل المهام</a></div>
  ${Object.keys(STATUS).map(s => by(s).length ? `<h3 class="grouph">${STATUS[s]} <span class="num">${by(s).length}</span></h3>${by(s).map(card).join('')}` : '').join('')}`;
}

function threadOf(pid) { return P.chat.filter(m => m.project_id === pid).slice(0, 30).reverse(); }

function projectDigest(p, question) {
  const open = openTasks().filter(t => t.project_id === p.id).sort(byDue);
  const done = P.tasks.filter(t => t.project_id === p.id && t.status === 'done').sort((a, b) => String(b.done_at).localeCompare(String(a.done_at))).slice(0, 30);
  const notes = P.notes.filter(n => n.project_id === p.id).slice(0, 15);
  return `المشروع: ${p.name}${p.client ? ` (العميل: ${p.client})` : ''} — الحالة: ${STATUS[p.status]}. النهارده ${today()}.
الـScope:
${p.scope || '(لسه مكتوبش)'}
الخطوة الجاية المسجلة: ${p.next_step || '-'}
مهام مفتوحة (${open.length}):
${open.map(t => `- ${t.title}${t.due ? ` | موعد ${t.due}` : ''}${t.kind === 'request' ? ' | طلب' : ''}${t.rolled ? ` | اترحّلت ${t.rolled}` : ''}`).join('\n') || '-'}
اتعمل مؤخرًا (${done.length}):
${done.map(t => `- ${doneDate(t)}: ${t.title}${t.done_note ? ` — ملاحظة: ${t.done_note}` : ''}`).join('\n') || '-'}
ملاحظات وأفكار عن المشروع:
${notes.map(n => `- ${n.text}`).join('\n') || '-'}
المحادثة اللي فاتت عن المشروع:
${threadOf(p.id).slice(-8).map(m => `${m.role === 'user' ? (myName() || 'أنا') : 'أنت'}: ${m.text}`).join('\n') || '-'}

المطلوب: ${question}`;
}

export function renderProject(root, rerender, id) {
  UI.rerender = rerender;
  const p = P.projects.find(x => x.id === id);
  if (!p) { root.innerHTML = '<section class="card"><p class="empty">المشروع ده مش موجود.</p><a class="btn ghost sm" href="#/projects">المشاريع</a></section>'; return; }
  const open = openTasks().filter(t => t.project_id === p.id).sort(byDue);
  const done = P.tasks.filter(t => t.project_id === p.id && t.status === 'done').sort((a, b) => String(b.done_at).localeCompare(String(a.done_at)));
  const thread = threadOf(p.id);
  root.innerHTML = `<a class="link" href="#/projects">‹ المشاريع</a>
  <section class="card soft"><div class="sh"><h1 class="big">${esc(p.name)}</h1><span class="pill st-${p.status}">${STATUS[p.status]}</span></div>
    ${p.client ? `<p class="hint" style="margin:0">${esc(p.client)}</p>` : ''}${p.next_step ? `<p class="next">الخطوة الجاية: ${esc(p.next_step)}</p>` : ''}
    <div class="actions"><button class="btn ghost sm" data-act="pjEdit" data-id="${p.id}">تعديل الـScope والحالة</button></div></section>
  <section class="card"><div class="sh"><h2>الـScope</h2></div>${p.scope ? `<div class="scope">${esc(p.scope)}</div>` : '<p class="empty">اكتب الـScope: المطلوب، الموديولات، اللي اتسلم، اللي فاضل. الذكاء الاصطناعي بيعتمد عليه.</p>'}</section>
  <section class="card"><div class="sh"><h2>المستشار</h2></div>
    <div class="actions"><button class="btn primary sm" data-act="pjAsk" data-id="${p.id}" data-q="status">إحنا فين؟</button><button class="btn primary sm" data-act="pjAsk" data-id="${p.id}" data-q="next">اقترح الخطوات الجاية</button><button class="btn ghost sm" data-act="pjAsk" data-id="${p.id}" data-q="risks">المخاطر</button></div>
    <div class="chat pchat">${thread.map(m => `<div class="msg ${m.role}">${m.role === 'assistant' ? `<div class="ai-out">${mdHtml(m.text, esc)}</div>` : `<p>${esc(m.text)}</p>`}</div>`).join('')}${UI.busy ? '<div class="msg assistant"><p class="hint">بيفكر…</p></div>' : ''}</div>
    <div class="chatbox"><textarea id="pj-in" rows="2" placeholder="اسأله عن المشروع، أو احكيله اللي حصل…"></textarea><button class="btn primary" data-act="pjSend" data-id="${p.id}" ${UI.busy ? 'disabled' : ''}>ابعت</button></div></section>
  <section class="card"><div class="sh"><h2>مفتوح</h2><span class="count num">${open.length}</span></div>
    <form class="qa-row" id="pj-add"><input id="pj-task" placeholder="مهمة أو طلب جديد للمشروع…"><button class="btn primary sm" type="submit">إضافة</button></form>
    ${open.length ? taskList(open) : '<p class="empty">مفيش مهام مفتوحة.</p>'}</section>
  <section class="card"><div class="sh"><h2>اللي اتعمل</h2><span class="count num">${done.length}</span></div>
    ${done.slice(0, 25).map(t => `<div class="item"><p>✓ ${esc(t.title)} <span class="hint">${fmtShort(doneDate(t))}</span></p>${t.done_note ? `<p class="hint">${esc(t.done_note)}</p>` : ''}</div>`).join('') || '<p class="empty">لسه.</p>'}</section>`;
  root.querySelector('#pj-add').addEventListener('submit', async e => {
    e.preventDefault(); const title = val('pj-task'); if (!title) return;
    try { await insert('tasks', { title, project_id: p.id, due: today(), kind: 'task' }); toast('اتضافت'); } catch (x) { toast(errText(x)); }
  });
}

const QUESTIONS = {
  status: 'قولّي إحنا فين في المشروع ده بالنسبة للـScope: اللي خلص، اللي ماشي، اللي واقف، ونسبة تقريبية للإنجاز. باختصار.',
  next: 'اقترح أهم 3 خطوات جاية بالترتيب، كل خطوة صغيرة وواضحة وقابلة تتعمل الأسبوع ده، ووضح ليه.',
  risks: 'إيه المخاطر أو الحاجات اللي ممكن تأخر المشروع أو تأثر على جودته أو حساباته، وإزاي نتعامل معاها؟',
};

async function askProject(p, question, userText) {
  UI.busy = true; UI.rerender();
  try {
    if (userText) await insert('chat', { role: 'user', text: userText, source: 'chat', project_id: p.id });
    const reply = await ai('project', projectDigest(p, question), { project_name: p.name });
    if (reply) await insert('chat', { role: 'assistant', text: reply.trim(), source: 'chat', project_id: p.id });
  } catch (x) { toast(x.message || errText(x)); }
  UI.busy = false; UI.rerender();
}

function sheetProject(p) {
  p = p || { name: '', client: '', status: 'active', scope: '', next_step: '', area: 'work' };
  openSheet(`<h3>${p.id ? 'تعديل المشروع' : 'مشروع جديد'}</h3>
  <div class="row2"><label class="fld"><span>الاسم</span><input id="pj-name" value="${esc(p.name)}"></label><label class="fld"><span>العميل / الجهة</span><input id="pj-client" value="${esc(p.client || '')}"></label></div>
  <div class="fld"><span>الحالة</span>${seg('pj-status', Object.entries(STATUS), p.status || 'active')}</div>
  <div class="fld"><span>المجال</span>${seg('pj-area', Object.entries(AREAS), p.area || 'work')}</div>
  <label class="fld"><span>الـScope</span><textarea id="pj-scope" rows="8" placeholder="المطلوب، الموديولات، اللي اتسلم، اللي فاضل، القيود…">${esc(p.scope || '')}</textarea></label>
  <label class="fld"><span>الخطوة الجاية</span><input id="pj-next" value="${esc(p.next_step || '')}"></label>
  <div class="actions"><button class="btn primary block" data-act="pjSave" data-id="${p.id || ''}">حفظ</button></div>`);
}

registerActions({
  pjNew: () => sheetProject(null),
  pjEdit: el => sheetProject(P.projects.find(x => x.id === el.dataset.id)),
  pjSave: async el => {
    const name = val('pj-name'); if (!name) return toast('اكتب الاسم');
    const data = { name, client: val('pj-client'), status: segV('pj-status') || 'active', area: segV('pj-area') || 'work', scope: val('pj-scope'), next_step: val('pj-next'), updated_at: new Date().toISOString() };
    try { if (el.dataset.id) await update('projects', el.dataset.id, data); else { const r = await insert('projects', { ...data, sort: P.projects.length + 1 }); location.hash = '#/project/' + r.id; } closeSheet(); toast('اتحفظ'); }
    catch (x) { toast(errText(x)); }
  },
  pjAsk: el => { const p = P.projects.find(x => x.id === el.dataset.id); if (p && !UI.busy) askProject(p, QUESTIONS[el.dataset.q]); },
  pjSend: el => { const p = P.projects.find(x => x.id === el.dataset.id), t = val('pj-in'); if (p && t && !UI.busy) askProject(p, `رد على ${myName() || "صاحب الحساب"}: ${t}`, t); },
});
