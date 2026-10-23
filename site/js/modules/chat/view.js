// رفيقك: the AI check-ins arrive here as messages; Sayed replies and the conversation
// becomes context for the next check-ins.
import { $, esc, toast, val, registerActions } from '../../core/dom.js';
import { today } from '../../core/dates.js';
import { errText } from '../../core/supa.js';
import { ai } from '../../core/ai.js';
import { P, myName, insert, openTasks, doneDate } from '../../core/store.js';

const UI = { rerender: () => {}, busy: false };
const fmtTime = iso => new Date(iso).toLocaleString('ar-EG-u-nu-latn', { weekday: 'short', hour: 'numeric', minute: '2-digit' });

const general = () => P.chat.filter(m => !m.project_id);
export function lastNudge() { return general().find(m => m.role === 'assistant'); }

export function renderChat(root, rerender) {
  UI.rerender = rerender;
  $('#fab').hidden = true;
  const msgs = general().slice().reverse();
  root.innerHTML = `<section class="card soft"><h1 class="big">رفيقك</h1><p class="hint" style="margin:4px 0 0">بيسألك كل كام ساعة عامل إيه وعملت إيه، وبياخد ردودك في اعتباره. ظبط مواعيده من الإعدادات.</p></section>
  <section class="card chat">${msgs.length ? msgs.map(m => `<div class="msg ${m.role}"><p>${esc(m.text)}</p><small class="hint">${fmtTime(m.created_at)}</small></div>`).join('') : '<p class="empty">لسه مفيش رسايل. اكتبله أي حاجة، أو استنى أول إشعار.</p>'}
  ${UI.busy ? '<div class="msg assistant"><p class="hint">بيكتب…</p></div>' : ''}</section>
  <div class="chatbox"><textarea id="chat-in" rows="2" placeholder="رد عليه أو احكيله يومك…"></textarea><button class="btn primary" data-act="chSend" ${UI.busy ? 'disabled' : ''}>ابعت</button></div>`;
  const box = root.querySelector('.chat'); box.scrollTop = box.scrollHeight;
  setTimeout(() => window.scrollTo(0, document.body.scrollHeight), 50);
}

function todayContext() {
  const td = today(), d = P.days[td] || {};
  const done = P.tasks.filter(t => doneDate(t) === td).map(t => t.title);
  const focus = openTasks().filter(t => t.focus_date === td).map(t => t.title);
  return `خلّص النهارده: ${done.join(' | ') || 'لسه'}. أهم المفتوح: ${focus.join(' | ') || '-'}. الصلاة: ${JSON.stringify(d.prayers || {})}. المزاج: ${d.mood || '-'}. الأذكار: ${JSON.stringify(d.azkar || {})}.`;
}

registerActions({
  chSend: async el => {
    const text = val('chat-in'); if (!text) return;
    UI.busy = true; el.disabled = true;
    try {
      await insert('chat', { role: 'user', text, source: 'chat' });
      const history = general().slice(0, 12).reverse().map(m => `${m.role === 'user' ? (myName() || 'أنا') : 'أنت'}: ${m.text}`).join('\n');
      const reply = await ai('chat', text, { today: todayContext(), history });
      if (reply) await insert('chat', { role: 'assistant', text: reply.trim(), source: 'chat' });
    } catch (x) { toast(x.message || errText(x)); }
    UI.busy = false; UI.rerender();
  },
});
