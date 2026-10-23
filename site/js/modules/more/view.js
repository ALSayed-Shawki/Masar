// المزيد: the less frequent pages.
import { $ } from '../../core/dom.js';

const LINKS = [
  ['#/ideas', 'الأفكار', 'أفكار البزنس، الملاحظات، حاجات التعلّم'],
  ['#/money', 'الماليات', 'ريال وجنيه، الميزانية، رأس مال البزنس'],
  ['#/shela', 'حساب الشلة', 'مين عليه ومين ليه'],
  ['#/azkar', 'الأذكار', 'أذكار الصبح والليل ومواعيدها'],
  ['#/chat', 'رفيقك', 'المحادثة مع الذكاء الاصطناعي'],
  ['#/review', 'مراجعة آخر اليوم', 'نقل اللي مخلصش'],
  ['#/settings', 'الإعدادات', 'الإشعارات، العقل المدبر، ربط Claude، الشلة'],
];

export function renderMore(root) {
  $('#fab').hidden = true;
  root.innerHTML = LINKS.map(([href, t, d]) => `<a class="card linkcard" href="${href}"><span><b>${t}</b><br><span class="hint">${d}</span></span><span class="go">افتح</span></a>`).join('');
}
