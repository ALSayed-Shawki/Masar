// الأذكار: choose what appears when leaving in the morning and coming back at night,
// when and on which days; read them one by one (tap to count / move on).
import { $, esc, toast, openSheet, closeSheet, val, registerActions } from '../../core/dom.js';
import { today } from '../../core/dates.js';
import { errText } from '../../core/supa.js';
import { CONFIG } from '../../config.js';
import { P, setSetting, saveDay } from '../../core/store.js';
import { LIBRARY, DEFAULT_IDS } from './library.js';

const SLOTS = { morning: 'الخروج والصباح', evening: 'الرجوع والمساء' };
const DAYS = [[6, 'س'], [0, 'ح'], [1, 'ن'], [2, 'ث'], [3, 'ر'], [4, 'خ'], [5, 'ج']];
const UI = { rerender: () => {}, reader: null };

export function azkarCfg() {
  const c = P.settings.azkar || {};
  const slot = (k, time, days) => ({ time: c[k]?.time || time, days: c[k]?.days || days, ids: c[k]?.ids || DEFAULT_IDS[k] });
  return { morning: slot('morning', '07:30', [6, 0, 1, 2, 3, 4]), evening: slot('evening', '19:30', [6, 0, 1, 2, 3, 4]), custom: c.custom || [], tz: CONFIG.TIMEZONE };
}
const all = cfg => [...LIBRARY, ...cfg.custom];
export const itemsFor = (slot, cfg = azkarCfg()) => cfg[slot].ids.map(id => all(cfg).find(x => x.id === id)).filter(Boolean);

/** The service worker reads this copy to walk through azkar inside the notification itself. */
export async function syncAzkarCache() {
  try {
    const cfg = azkarCfg(), data = {};
    for (const s of Object.keys(SLOTS)) data[s] = itemsFor(s, cfg).map(x => ({ t: x.title, b: x.text, c: x.count || 1 }));
    const c = await caches.open('azkar-data');
    await c.put('./__azkar.json', new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } }));
  } catch { /* no cache API: notifications fall back to opening the app */ }
}

export function azkarCard() {
  const d = P.days[today()]?.azkar || {}, cfg = azkarCfg();
  return `<section class="card"><div class="sh"><h2>الأذكار</h2><a class="link" href="#/azkar">اختيار ومواعيد</a></div>
  <div class="actions">${Object.entries(SLOTS).map(([k, l]) => `<a class="btn ${d[k] ? 'ghost' : 'primary'} sm" href="#/azkar/${k}" style="flex:1">${d[k] ? '✓ ' : ''}${l}<br><small class="num" style="font-weight:400">${cfg[k].time}</small></a>`).join('')}</div></section>`;
}

export function renderAzkar(root, rerender, slot) {
  UI.rerender = rerender;
  if (slot && SLOTS[slot]) return renderReader(root, slot);
  const cfg = azkarCfg();
  root.innerHTML = `<section class="card soft"><h1 class="big">الأذكار</h1><p class="hint" style="margin:4px 0 0">النصوص من حصن المسلم. اختار اللي يظهرلك في كل وقت، وهيوصلك إشعار تدوس عليه يعرض الذكر اللي بعده.</p></section>
  ${Object.entries(SLOTS).map(([k, l]) => `<section class="card"><div class="sh"><h2>${l}</h2><a class="link" href="#/azkar/${k}">اقرأها دلوقتي</a></div>
    <div class="row2"><label class="fld"><span>ميعاد الإشعار</span><input type="time" id="az-t-${k}" value="${cfg[k].time}"></label>
    <div class="fld"><span>الأيام</span><div class="days" id="az-d-${k}">${DAYS.map(([n, l2]) => `<button type="button" class="${cfg[k].days.includes(n) ? 'on' : ''}" data-act="azDay" data-n="${n}">${l2}</button>`).join('')}</div></div></div>
    <div class="azlist">${all(cfg).filter(x => x.slots?.includes(k) || x.custom || cfg[k].ids.includes(x.id)).map(x => `<label class="checkrow"><input type="checkbox" data-slot="${k}" value="${x.id}" ${cfg[k].ids.includes(x.id) ? 'checked' : ''}><span><b>${esc(x.title)}</b>${x.count > 1 ? ` <span class="hint">×${x.count}</span>` : ''}<br><small class="hint">${esc(x.text.slice(0, 70))}${x.text.length > 70 ? '…' : ''}</small></span></label>`).join('')}</div></section>`).join('')}
  <div class="actions"><button class="btn primary" data-act="azSave" style="flex:1">حفظ</button><button class="btn ghost" data-act="azAdd">إضافة ذكر خاص</button></div>`;
}

function renderReader(root, slot) {
  const items = itemsFor(slot);
  if (!UI.reader || UI.reader.slot !== slot) UI.reader = { slot, i: 0, left: items[0]?.count || 1 };
  const r = UI.reader, it = items[r.i];
  $('#fab').hidden = true;
  if (!items.length) { root.innerHTML = `<section class="card"><p class="empty">مفيش أذكار مختارة هنا.</p><a class="btn primary sm" href="#/azkar">اختار</a></section>`; return; }
  if (!it) {
    root.innerHTML = `<section class="card soft zikr-done"><h1 class="big">تقبّل الله</h1><p>خلّصت أذكار ${SLOTS[slot]}.</p><div class="actions"><a class="btn primary" href="#/today">رجوع لليوم</a><button class="btn ghost" data-act="azRestart">من الأول</button></div></section>`;
    if (!P.days[today()]?.azkar?.[slot]) saveDay(today(), { azkar: { ...(P.days[today()]?.azkar || {}), [slot]: true } }).catch(() => {});
    return;
  }
  root.innerHTML = `<div class="sh"><h2>أذكار ${SLOTS[slot]}</h2><span class="count num">${r.i + 1}/${items.length}</span></div>
  <div class="track"><div class="fill" style="width:${r.i / items.length * 100}%"></div></div>
  <button class="card zikr" data-act="azTap"><span class="hint">${esc(it.title)}</span><span class="ztext">${esc(it.text)}</span>
    ${it.count > 1 ? `<span class="zcount"><b class="num">${r.left}</b> من <span class="num">${it.count}</span></span>` : ''}<span class="hint">دوس عشان ${it.count > 1 && r.left > 1 ? 'تعدّ' : 'تكمّل'}${it.src ? ` · ${esc(it.src)}` : ''}</span></button>
  <div class="actions"><button class="btn ghost sm" data-act="azPrev" ${r.i ? '' : 'disabled'}>السابق</button><button class="btn ghost sm" data-act="azSkip">تخطّي</button></div>`;
}

registerActions({
  azDay: el => el.classList.toggle('on'),
  azSave: async el => {
    const cfg = azkarCfg(), next = { custom: cfg.custom };
    for (const k of Object.keys(SLOTS)) {
      next[k] = { time: val('az-t-' + k) || cfg[k].time, days: [...document.querySelectorAll(`#az-d-${k} .on`)].map(b => +b.dataset.n),
        ids: [...document.querySelectorAll(`input[data-slot="${k}"]:checked`)].map(i => i.value) };
    }
    el.disabled = true;
    try { await setSetting('azkar', { ...next, tz: CONFIG.TIMEZONE }); await syncAzkarCache(); toast('اتحفظت الأذكار والمواعيد'); } catch (x) { toast(errText(x)); }
    el.disabled = false;
  },
  azAdd: () => openSheet(`<h3>ذكر خاص</h3><label class="fld"><span>العنوان</span><input id="az-ct" placeholder="مثال: دعاء الخروج"></label>
    <label class="fld"><span>النص</span><textarea id="az-cb" rows="3"></textarea></label>
    <div class="row2"><label class="fld"><span>عدد المرات</span><input id="az-cc" type="number" min="1" value="1"></label>
    <div class="fld"><span>يظهر في</span><select id="az-cs"><option value="morning">الصبح</option><option value="evening">بالليل</option><option value="both">الاتنين</option></select></div></div>
    <div class="actions"><button class="btn primary block" data-act="azSaveCustom">إضافة</button></div>`),
  azSaveCustom: async () => {
    const text = val('az-cb'); if (!text) return toast('اكتب النص');
    const cfg = azkarCfg(), id = 'c-' + Date.now().toString(36), s = val('az-cs');
    const item = { id, custom: true, title: val('az-ct') || 'ذكر خاص', text, count: Math.max(1, +val('az-cc') || 1), slots: s === 'both' ? ['morning', 'evening'] : [s] };
    const next = { morning: { ...cfg.morning }, evening: { ...cfg.evening }, custom: [...cfg.custom, item], tz: CONFIG.TIMEZONE };
    item.slots.forEach(k => { next[k].ids = [...next[k].ids, id]; });
    try { await setSetting('azkar', next); await syncAzkarCache(); closeSheet(); toast('اتضاف'); } catch (x) { toast(errText(x)); }
  },
  azTap: () => { const r = UI.reader, it = itemsFor(r.slot)[r.i]; if (!it) return; if (r.left > 1) r.left--; else { r.i++; r.left = itemsFor(r.slot)[r.i]?.count || 1; } navigator.vibrate?.(15); UI.rerender(); },
  azSkip: () => { const r = UI.reader; r.i++; r.left = itemsFor(r.slot)[r.i]?.count || 1; UI.rerender(); },
  azPrev: () => { const r = UI.reader; r.i = Math.max(0, r.i - 1); r.left = itemsFor(r.slot)[r.i]?.count || 1; UI.rerender(); },
  azRestart: () => { UI.reader = null; UI.rerender(); },
});
