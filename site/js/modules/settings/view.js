// Settings (owner): notifications, the group (members, PINs, invite), account.
import { $, esc, toast, openSheet, closeSheet, val, registerActions, confirmTap, copyText, waLink } from '../../core/dom.js';
import { sb, errText } from '../../core/supa.js';
import { pushState, enablePush, testNotification, isIOS, isStandalone } from '../../core/push.js';
import { G, load, findMyGroupId, createGroup, addMember, renameMember, unbindMember, setPin, newInvite, inviteLink, updateGroup } from '../shela/data.js';

const S = { push: '…', rerender: () => {} };

export async function renderSettings(root, rerender) {
  S.rerender = rerender;
  $('#fab').hidden = true;
  const { data: { user } } = await sb.auth.getUser();
  if (!G.loaded) { const gid = await findMyGroupId(); if (gid) await load(gid).catch(() => {}); }
  S.push = await pushState().catch(() => 'unsupported');
  const pushTxt = { on: 'شغالة على الموبايل ده', off: 'مقفولة', denied: 'مرفوضة من إعدادات الموبايل', unsupported: isIOS() && !isStandalone() ? 'ضيف التطبيق للشاشة الرئيسية الأول' : 'الجهاز مش بيدعمها' }[S.push] || '';
  const g = G.group;
  root.innerHTML = `
  <section class="card"><div class="sh"><h2>الإشعارات</h2><span class="count">${pushTxt}</span></div>
    <p class="hint">بتستخدم لتذكير الدواء بس. الصلاة محاسبة من غير تذكير.</p>
    <div class="actions">${S.push === 'on' ? '<button class="btn ghost sm" data-act="stTest">تجربة إشعار</button>' : S.push !== 'unsupported' ? '<button class="btn primary sm" data-act="stPush">فعّل الإشعارات</button>' : ''}</div></section>
  <section class="card"><div class="sh"><h2>الشلة</h2></div>
  ${!g ? `<p class="hint">اعمل الشلة وضيف أصحابك، وكل واحد ياخد رقم سري يدخل بيه من غير حساب.</p><button class="btn primary sm" data-act="stCreate">اعمل الشلة</button>` : `
    <div class="row"><span>كود الدخول <span class="code">${esc(g.invite_code)}</span></span><button class="mini" data-act="stNewCode">كود جديد</button></div>
    <div class="actions"><a class="btn wa sm" href="${waLink(`ادخل حساب الشلة من اللينك ده وضيفه على الشاشة الرئيسية:\n${inviteLink()}\nالكود: ${g.invite_code}`)}" target="_blank" rel="noopener">ابعت اللينك واتساب</a><button class="btn ghost sm" data-act="stCopy">نسخ اللينك</button></div>
    <div style="margin-top:8px">${G.members.map(m => `<div class="row"><span><b>${esc(m.name)}</b>${m.is_owner ? ' <span class="hint">(أنت)</span>' : m.user_id ? ' <span class="pill pos">داخل</span>' : ' <span class="pill neg">لسه</span>'}</span>
      <span class="actions">${m.is_owner ? '' : `<button class="mini" data-act="stPin" data-id="${m.id}">رقم سري</button>`}<button class="mini" data-act="stRename" data-id="${m.id}">الاسم</button>${!m.is_owner && m.user_id ? `<button class="mini" data-act="stUnbind" data-id="${m.id}">فك الربط</button>` : ''}</span></div>`).join('')}</div>
    <div class="actions"><button class="btn ghost sm" data-act="stAddMember">إضافة عضو</button><button class="btn ghost sm" data-act="stCurrency">العملة: ${esc(g.currency)}</button></div>`}
  </section>
  <section class="card"><div class="sh"><h2>الحساب</h2></div><p class="hint" dir="ltr" style="text-align:right">${esc(user?.email || '')}</p>
    <button class="btn ghost sm" data-act="stOut">تسجيل الخروج</button></section>`;
}

function pinSheet(memberId) {
  const m = G.members.find(x => x.id === memberId);
  openSheet(`<h3>رقم سري لـ${esc(m.name)}</h3><p class="hint">من 4 لـ 8 أرقام. ابعته له لوحده، مش في جروب.</p>
  <input id="st-pin" class="pin" inputmode="numeric" maxlength="8" value="${String(Math.floor(1000 + Math.random() * 9000))}">
  <div class="actions"><button class="btn primary block" data-act="stSavePin" data-id="${memberId}">حفظ</button></div><div id="st-pin-share"></div>`);
}

registerActions({
  stPush: async el => { el.disabled = true; try { await enablePush(); toast('الإشعارات اشتغلت'); } catch (x) { toast(x.message || errText(x)); } S.rerender(); },
  stTest: () => testNotification().catch(() => toast('مقدرتش أبعت إشعار تجربة')),
  stCreate: async el => { el.disabled = true; try { const gid = await createGroup('الشلة', 'سيد'); await load(gid); S.rerender(); } catch (x) { el.disabled = false; toast(errText(x)); } },
  stNewCode: async el => { if (!confirmTap(el, 'الكود القديم هيقف. أكّد')) return; try { await newInvite(); S.rerender(); toast('اتعمل كود جديد'); } catch (x) { toast(errText(x)); } },
  stCopy: () => copyText(inviteLink()),
  stPin: el => pinSheet(el.dataset.id),
  stSavePin: async el => {
    const pin = val('st-pin'); if (!/^\d{4,8}$/.test(pin)) return toast('من 4 لـ 8 أرقام');
    try {
      await setPin(el.dataset.id, pin);
      const m = G.members.find(x => x.id === el.dataset.id);
      $('#st-pin-share').innerHTML = `<a class="btn wa block" href="${waLink(`يا ${m.name}، ده دخولك لحساب الشلة:\n${inviteLink()}\nاختار اسمك واكتب الرقم السري: ${pin}`)}" target="_blank" rel="noopener">ابعته لـ${esc(m.name)} واتساب</a>`;
      el.hidden = true; toast('الرقم السري اتحفظ');
    } catch (x) { toast(errText(x)); }
  },
  stRename: el => { const m = G.members.find(x => x.id === el.dataset.id); openSheet(`<h3>تغيير الاسم</h3><input id="st-name" value="${esc(m.name)}"><div class="actions"><button class="btn primary block" data-act="stSaveName" data-id="${m.id}">حفظ</button></div>`); },
  stSaveName: async el => { const n = val('st-name'); if (!n) return; try { await renameMember(el.dataset.id, n); await load(G.group.id); closeSheet(); S.rerender(); } catch (x) { toast(errText(x)); } },
  stUnbind: async el => { if (!confirmTap(el)) return; try { await unbindMember(el.dataset.id); S.rerender(); toast('اتفك الربط؛ يقدر يدخل تاني بالرقم السري'); } catch (x) { toast(errText(x)); } },
  stAddMember: () => openSheet(`<h3>عضو جديد</h3><input id="st-new" placeholder="الاسم"><div class="actions"><button class="btn primary block" data-act="stSaveMember">إضافة</button></div>`),
  stSaveMember: async () => { const n = val('st-new'); if (!n) return; try { const id = await addMember(n); S.rerender(); pinSheet(id); } catch (x) { toast(errText(x)); } },
  stCurrency: () => openSheet(`<h3>العملة</h3><input id="st-cur" value="${esc(G.group.currency)}"><div class="actions"><button class="btn primary block" data-act="stSaveCur">حفظ</button></div>`),
  stSaveCur: async () => { try { await updateGroup({ currency: val('st-cur') || 'ريال' }); closeSheet(); S.rerender(); } catch (x) { toast(errText(x)); } },
  stOut: async () => { await sb.auth.signOut(); location.hash = '#/today'; location.reload(); },
});
