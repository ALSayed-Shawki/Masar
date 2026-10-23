// المزيد: every section of the app as a grid of tiles, with small badges for what needs attention.
// New sections plug in by adding one row to MODULES.
import { $, esc, registerActions, actions } from '../../core/dom.js';
import { today } from '../../core/dates.js';
import { P, openTasks } from '../../core/store.js';
import { lastNudge } from '../chat/view.js';
import { ledgerTab } from '../ledger/view.js';

// [key, title, subtitle, letter, background, ink, target]  target: '#/route' | 'ledger:tab' | 'act:name'
const MODULES = [
  ['chat', 'رفيقك', 'المساعد الذكي', 'ر', '#D6EAE0', '#1D6A50', '#/chat'],
  ['shela', 'الشلة', 'مصاريف البيت', 'ش', '#F4E5C6', '#8A5A10', '#/shela'],
  ['ideas', 'الأفكار', 'وملاحظات وتعلّم', 'ف', '#E6E0F2', '#5E4B8B', '#/ideas'],
  ['azkar', 'الأذكار', 'الصباح والمساء', 'ذ', '#DCE7F2', '#2F5D8A', '#/azkar'],
  ['meds', 'الدواء', 'المواعيد والتذكير', 'د', '#F6DCD5', '#A83A27', 'act:tdMeds'],
  ['money', 'الفلوس', 'ريال وجنيه', 'م', '#E6EBD3', '#56651C', '#/money'],
  ['prayer', 'الصلاة', 'والقضاء', 'ص', '#D6EAE0', '#1D6A50', 'ledger:habits'],
  ['wins', 'الإنجازات', 'والـCV', 'إ', '#F4E5C6', '#8A5A10', 'ledger:wins'],
  ['goals', 'الأهداف', 'والخطوة الجاية', 'هـ', '#F2DEE6', '#8A3D5C', 'ledger:goals'],
  ['review', 'آخر اليوم', 'نقل اللي ما خلصش', 'ي', '#F4E5C6', '#8A5A10', '#/review'],
  ['brain', 'العقل المدبر', 'اللي الذكاء يعرفه عنك', 'ع', '#E2E9E5', '#44524C', '#/settings'],
  ['settings', 'الإعدادات', 'الإشعارات والأصوات', '⚙', '#E2E9E5', '#44524C', '#/settings'],
];

function badge(k) {
  const td = today();
  if (k === 'chat') { const n = lastNudge(); return n && P.chat.filter(m => !m.project_id)[0]?.role === 'assistant' ? '1' : ''; }
  if (k === 'review') { const n = openTasks().filter(t => t.due && t.due <= td).length; return n && new Date().getHours() >= 17 ? String(n) : ''; }
  return '';
}

export function renderMore(root) {
  $('#fab').hidden = true;
  root.innerHTML = `<div class="sh" style="margin:0 2px"><h2>كل حاجة في مسار</h2></div>
  <div class="grid3">${MODULES.map(([k, t, s, l, bg, fg, to]) => {
    const b = badge(k), inner = `<span class="mi" style="background:${bg};color:${fg}">${l}</span><b>${t}</b><span class="hint">${s}</span>${b ? `<span class="mbadge">${b}</span>` : ''}`;
    return to.startsWith('#') ? `<a class="mod" href="${to}">${inner}</a>` : `<button class="mod" data-act="moGo" data-to="${esc(to)}">${inner}</button>`;
  }).join('')}</div>
  <p class="hint" style="text-align:center">عاوز قسم جديد؟ قول لـClaude وهيتضاف هنا.</p>`;
}

registerActions({
  moGo: el => {
    const [kind, v] = el.dataset.to.split(':');
    if (kind === 'ledger') { ledgerTab(v); location.hash = '#/ledger'; }
    else if (kind === 'act') actions[v]?.(el);
  },
});
