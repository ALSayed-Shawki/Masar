import { SOUNDS, soundKind, setSound, paperSound, chimeOn, setChime, doneSound } from '../../core/flip.js';
// Settings (owner): notifications, the group (members, PINs, invite), account.
import { $, esc, toast, openSheet, closeSheet, val, registerActions, confirmTap, copyText, waLink } from '../../core/dom.js';
import { sb, errText } from '../../core/supa.js';
import { pushState, enablePush, testNotification, isIOS, isStandalone } from '../../core/push.js';
import { P, setSetting, refresh, myName } from '../../core/store.js';
import { CONFIG } from '../../config.js';
import { G, load, findMyGroupId, createGroup, addMember, renameMember, unbindMember, setPin, newInvite, inviteLink, updateGroup } from '../shela/data.js';

const S = { push: '…', rerender: () => {} };

export async function renderSettings(root, rerender) {
  S.rerender = rerender;
  $('#fab').hidden = true;
  const { data: { user } } = await sb.auth.getUser();
  if (!G.loaded) { const gid = await findMyGroupId(); if (gid) await load(gid).catch(() => {}); }
  S.push = await pushState().catch(() => 'unsupported');
  S.pins = {};
  if (G.group && G.isOwner) { const { data } = await sb.rpc('member_pin_status', { p_group: G.group.id }); (data || []).forEach(r => { S.pins[r.member_id] = r; }); }
  const pushTxt = { on: 'شغالة على الموبايل ده', off: 'مقفولة', denied: 'مرفوضة من إعدادات الموبايل', unsupported: isIOS() && !isStandalone() ? 'ضيف التطبيق للشاشة الرئيسية الأول' : 'الجهاز مش بيدعمها' }[S.push] || '';
  const g = G.group;
  root.innerHTML = `
  <section class="card"><div class="sh"><h2>الإشعارات</h2><span class="count">${pushTxt}</span></div>
    <p class="hint">للدواء، والأذكار، وأسئلة رفيقك. الصلاة محاسبة من غير تذكير.</p>
    <div class="actions">${S.push === 'on' ? '<button class="btn ghost sm" data-act="stTest">تجربة إشعار</button>' : S.push !== 'unsupported' ? '<button class="btn primary sm" data-act="stPush">فعّل الإشعارات</button>' : ''}</div></section>
  ${(() => { const n = P.settings.nudges || {}; return `<section class="card"><div class="sh"><h2>رفيقك (أسئلة الذكاء الاصطناعي)</h2></div>
    <p class="hint">إشعارات قصيرة رخمة: عامل إيه؟ عملت إيه النهارده؟ ردودك بتتحفظ وبيبني عليها.</p>
    <label class="checkrow"><input type="checkbox" id="nd-on" ${n.enabled ? 'checked' : ''}><span>شغّال</span></label>
    <div class="row2"><label class="fld"><span>كل كام ساعة</span><select id="nd-every">${[2, 3, 4, 5].map(h => `<option value="${h}" ${(n.every || 3) === h ? 'selected' : ''}>كل ${h} ساعات</option>`).join('')}</select></label><span></span></div>
    <div class="row2"><label class="fld"><span>من الساعة</span><input type="time" id="nd-from" value="${n.from || '10:00'}"></label><label class="fld"><span>لحد الساعة</span><input type="time" id="nd-to" value="${n.to || '23:00'}"></label></div>
    <div class="actions"><button class="btn primary sm" data-act="stNudges">حفظ</button><a class="btn ghost sm" href="#/chat">افتح المحادثة</a></div></section>`; })()}
  <section class="card"><div class="sh"><h2>العقل المدبر</h2><span class="count">${((P.settings.brain || {}).text || '').length} حرف</span></div>
    <p class="hint">كل اللي الذكاء الاصطناعي في مسار لازم يعرفه عنك وعن شغلك وطريقتك. بيتقري مع كل سؤال: المستشار، ورفيقك، والمراجعة.</p>
    <textarea id="br-text" rows="8">${esc((P.settings.brain || {}).text || '')}</textarea>
    <div class="actions"><button class="btn primary sm" data-act="stBrain">حفظ</button><button class="btn ghost sm" data-act="stImport">استيراد ملف</button></div></section>
  <section class="card"><div class="sh"><h2>ربط Claude</h2></div>
    <p class="hint">يخلي حساب Claude بتاعك (اللي عارف عنك كل حاجة) يقرأ ويحدّث مسار: المشاريع، والـScope، والمهام، والعقل المدبر.</p>
    ${(P.settings.mcp || {}).token ? `<div class="fld"><span>رابط الـConnector</span><input readonly dir="ltr" id="mcp-url" value="${esc(CONFIG.SUPABASE_URL + '/functions/v1/mcp/' + P.settings.mcp.token)}"></div>
    <div class="actions"><button class="btn ghost sm" data-act="stCopyMcp">نسخ الرابط</button><button class="btn ghost sm" data-act="stMcp">رابط جديد</button></div>
    <p class="hint">في claude.ai: Settings ← Connectors ← Add custom connector، اكتب الاسم «مسار» والصق الرابط. الرابط سري؛ متشاركهوش.</p>` : '<button class="btn primary sm" data-act="stMcp">اعمل رابط الربط</button>'}</section>
  <a class="card linkcard" href="#/azkar"><span><b>الأذكار</b><br><span class="hint">اختيار أذكار الصبح والليل ومواعيدها</span></span><span class="go">افتح</span></a>
  <section class="card"><div class="sh"><h2>الشلة</h2></div>
  ${!g ? `<p class="hint">اعمل الشلة وضيف أصحابك، وكل واحد ياخد رقم سري يدخل بيه من غير حساب.</p><button class="btn primary sm" data-act="stCreate">اعمل الشلة</button>` : `
    <p class="hint">كل واحد بيدخل بحاجتين: <b>اللينك</b> (فيه كود الشلة) و<b>رقمه السري</b> اللي بتعمله له من زرار «رقم سري» جنب اسمه. كود الشلة <b>مش</b> هو الرقم السري.</p>
    <div class="row"><span>كود الشلة <span class="code">${esc(g.invite_code)}</span><br><small class="hint">جوه اللينك بس، محدش بيكتبه</small></span><button class="mini" data-act="stNewCode">كود جديد</button></div>
    <div class="actions"><a class="btn wa sm" href="${waLink(`ادخل حساب الشلة من اللينك ده وضيفه على الشاشة الرئيسية:\n${inviteLink()}\nالكود: ${g.invite_code}`)}" target="_blank" rel="noopener">ابعت اللينك واتساب</a><button class="btn ghost sm" data-act="stCopy">نسخ اللينك</button></div>
    <div style="margin-top:8px">${G.members.map(m => `<div class="row"><span><b>${esc(m.name)}</b>${m.is_owner ? ' <span class="hint">(أنت)</span>' : m.user_id ? ' <span class="pill pos">داخل</span>' : ' <span class="pill neg">لسه</span>'}${m.is_owner ? '' : S.pins[m.id]?.has_pin ? (S.pins[m.id].locked ? ' <span class="pill neg">مقفول 15 دقيقة</span>' : ' <span class="hint">· ليه رقم سري</span>') : ' <span class="pill neg">من غير رقم سري</span>'}</span>
      <span class="actions">${m.is_owner ? '' : `<button class="mini" data-act="stPin" data-id="${m.id}">رقم سري</button>`}<button class="mini" data-act="stRename" data-id="${m.id}">الاسم</button>${!m.is_owner && m.user_id ? `<button class="mini" data-act="stUnbind" data-id="${m.id}">فك الربط</button>` : ''}${m.is_owner ? '' : `<button class="mini" data-act="stRemove" data-id="${m.id}">حذف</button>`}</span></div>`).join('')}</div>
    <div class="actions"><button class="btn ghost sm" data-act="stAddMember">إضافة عضو</button><button class="btn ghost sm" data-act="stCurrency">العملة: ${esc(g.currency)}</button></div>`}
  </section>
  <section class="card"><div class="sh"><h2>الأصوات</h2></div>
    <div class="fld"><span>صوت تقليب الصفحات</span><div class="chips">${SOUNDS.map(([k, l]) => `<button class="${soundKind() === k ? 'on' : ''}" data-act="stFlip" data-v="${k}">${l}</button>`).join('')}</div></div>
    <label class="checkrow"><input type="checkbox" id="st-chime" ${chimeOn() ? 'checked' : ''}> رنّة خفيفة لما تخلص مهمة</label></section>
  <section class="card"><div class="sh"><h2>الحساب</h2></div><p class="hint" dir="ltr" style="text-align:right">${esc(user?.email || '')}</p>
    <div class="row2"><label class="fld"><span>اسمك</span><input id="st-myname" value="${esc(myName())}"></label><div class="fld"><span>&nbsp;</span><button class="btn ghost sm" data-act="stSaveName2">حفظ الاسم</button></div></div>
    <div class="row2"><label class="fld"><span>كلمة سر جديدة</span><input id="st-pass" type="password" dir="ltr" autocomplete="new-password"></label><div class="fld"><span>&nbsp;</span><button class="btn ghost sm" data-act="stPass">تغيير كلمة السر</button></div></div>
    <button class="btn ghost sm" data-act="stOut">تسجيل الخروج</button></section>`;
}

function pinSheet(memberId) {
  const m = G.members.find(x => x.id === memberId);
  openSheet(`<h3>رقم سري لـ${esc(m.name)}</h3><p class="hint">ده الرقم اللي ${esc(m.name)} هيكتبه في خانة «رقمك السري» بعد ما يختار اسمه. من 4 لـ 8 أرقام. بعد الحفظ دوس زرار الواتساب يتبعتله هو واللينك مع بعض.</p>
  <input id="st-pin" class="pin" inputmode="numeric" maxlength="8" value="${String(Math.floor(1000 + Math.random() * 9000))}">
  <div class="actions"><button class="btn primary block" data-act="stSavePin" data-id="${memberId}">حفظ</button></div><div id="st-pin-share"></div>`);
}

registerActions({
  stFlip: el => { setSound(el.dataset.v); paperSound(el.dataset.v); el.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === el)); },
  stPush: async el => { el.disabled = true; try { await enablePush(); toast('الإشعارات اشتغلت'); } catch (x) { toast(x.message || errText(x)); } S.rerender(); },
  stNudges: async el => { el.disabled = true; try { await setSetting('nudges', { enabled: document.getElementById('nd-on').checked, every: +val('nd-every') || 3, from: val('nd-from') || '10:00', to: val('nd-to') || '23:00', tz: CONFIG.TIMEZONE }); toast('اتحفظ'); } catch (x) { toast(errText(x)); } el.disabled = false; },
  stBrain: async el => { el.disabled = true; try { await setSetting('brain', { text: val('br-text'), updated_at: new Date().toISOString() }); toast('اتحفظ'); } catch (x) { toast(errText(x)); } el.disabled = false; },
  stMcp: async el => {
    if (P.settings.mcp?.token && !confirmTap(el, 'الرابط القديم هيقف. أكّد')) return;
    const token = [...crypto.getRandomValues(new Uint8Array(24))].map(b => b.toString(16).padStart(2, '0')).join('');
    try { await setSetting('mcp', { token, created_at: new Date().toISOString() }); S.rerender(); toast('اتعمل الرابط'); } catch (x) { toast(errText(x)); }
  },
  stCopyMcp: () => copyText(document.getElementById('mcp-url').value),
  stImport: () => openSheet(`<h3>استيراد للعقل المدبر والمشاريع</h3><p class="hint">اختار ملف الاستيراد (JSON) اللي Claude جهّزهولك. بيضيف العقل المدبر ويحدّث المشاريع بالاسم، ومش بيمسح حاجة.</p>
    <input type="file" id="imp-file" accept="application/json,.json"><div class="actions"><button class="btn primary block" data-act="stDoImport">استيراد</button></div>`),
  stDoImport: async el => {
    const f = document.getElementById('imp-file')?.files?.[0]; if (!f) return toast('اختار الملف');
    el.disabled = true;
    try {
      const d = JSON.parse(await f.text());
      if (d.brain) { const old = (P.settings.brain || {}).text || ''; await setSetting('brain', { text: old && !old.includes(d.brain.slice(0, 60)) ? old + '\n\n' + d.brain : d.brain, updated_at: new Date().toISOString() }); }
      let n = 0;
      for (const pr of d.projects || []) {
        if (!pr.name) continue;
        const ex = P.projects.find(x => x.name.trim() === pr.name.trim() || (pr.aliases || []).includes(x.name));
        const row = { client: pr.client || '', status: ['active', 'prospect', 'paused', 'done'].includes(pr.status) ? pr.status : 'active', area: pr.area || 'work', scope: pr.scope || '', next_step: pr.next_step || '', updated_at: new Date().toISOString() };
        const q = ex ? sb.from('projects').update(row).eq('id', ex.id) : sb.from('projects').insert({ name: pr.name, sort: 50 + n, ...row });
        const { error } = await q; if (error) throw error; n++;
      }
      await refresh('projects', 'settings'); closeSheet(); toast(`اتستورد العقل المدبر و${n} مشروع`); S.rerender();
    } catch (x) { el.disabled = false; toast('الملف مش مظبوط: ' + (x.message || '')); }
  },
  stTest: () => testNotification().catch(() => toast('مقدرتش أبعت إشعار تجربة')),
  stCreate: async el => { el.disabled = true; try { const gid = await createGroup('الشلة', myName() || 'أنا'); await load(gid); S.rerender(); } catch (x) { el.disabled = false; toast(errText(x)); } },
  stNewCode: async el => { if (!confirmTap(el, 'الكود القديم هيقف. أكّد')) return; try { await newInvite(); S.rerender(); toast('اتعمل كود جديد'); } catch (x) { toast(errText(x)); } },
  stCopy: () => copyText(inviteLink()),
  stPin: el => pinSheet(el.dataset.id),
  stSavePin: async el => {
    const pin = val('st-pin'); if (!/^\d{4,8}$/.test(pin)) return toast('من 4 لـ 8 أرقام');
    try {
      await setPin(el.dataset.id, pin);
      const m = G.members.find(x => x.id === el.dataset.id);
      $('#st-pin-share').innerHTML = `<a class="btn wa block" href="${waLink(`يا ${m.name}، ده دخولك لحساب الشلة:\n${inviteLink()}\nاختار اسمك واكتب الرقم السري: ${pin}`)}" target="_blank" rel="noopener">ابعته لـ${esc(m.name)} واتساب</a>`;
      el.hidden = true; toast('الرقم السري اتحفظ'); S.rerender();
    } catch (x) { toast(errText(x)); }
  },
  stRename: el => { const m = G.members.find(x => x.id === el.dataset.id); openSheet(`<h3>تغيير الاسم</h3><input id="st-name" value="${esc(m.name)}"><div class="actions"><button class="btn primary block" data-act="stSaveName" data-id="${m.id}">حفظ</button></div>`); },
  stSaveName: async el => { const n = val('st-name'); if (!n) return; try { await renameMember(el.dataset.id, n); await load(G.group.id); closeSheet(); S.rerender(); } catch (x) { toast(errText(x)); } },
  stRemove: async el => {
    if (!confirmTap(el, 'حذف نهائي؟ أكّد')) return;
    try { const { data, error } = await sb.rpc('remove_member', { p_member: el.dataset.id }); if (error) throw error; await load(G.group.id); S.rerender();
      toast(data === 'archived' ? 'اتشال من الشلة. مصاريفه القديمة فضلت عشان الحسابات تفضل صح.' : 'اتحذف'); }
    catch (x) { toast(errText(x)); }
  },
  stUnbind: async el => { if (!confirmTap(el)) return; try { await unbindMember(el.dataset.id); S.rerender(); toast('اتفك الربط؛ يقدر يدخل تاني بالرقم السري'); } catch (x) { toast(errText(x)); } },
  stAddMember: () => openSheet(`<h3>عضو جديد</h3><input id="st-new" placeholder="الاسم"><div class="actions"><button class="btn primary block" data-act="stSaveMember">إضافة</button></div>`),
  stSaveMember: async () => { const n = val('st-new'); if (!n) return; try { const id = await addMember(n); S.rerender(); pinSheet(id); } catch (x) { toast(errText(x)); } },
  stCurrency: () => openSheet(`<h3>العملة</h3><input id="st-cur" value="${esc(G.group.currency)}"><div class="actions"><button class="btn primary block" data-act="stSaveCur">حفظ</button></div>`),
  stSaveCur: async () => { try { await updateGroup({ currency: val('st-cur') || 'ريال' }); closeSheet(); S.rerender(); } catch (x) { toast(errText(x)); } },
  stSaveName2: async () => { const n = val('st-myname'); if (!n) return toast('اكتب اسمك'); try { await setSetting('profile', { ...(P.settings.profile || {}), name: n }); toast('اتحفظ'); } catch (x) { toast(errText(x)); } },
  stPass: async () => { const p = val('st-pass'); if (p.length < 8) return toast('8 حروف على الأقل'); const { error } = await sb.auth.updateUser({ password: p }); toast(error ? errText(error) : 'اتغيرت كلمة السر'); },
  stOut: async () => { await sb.auth.signOut(); location.hash = '#/today'; location.reload(); },
});

// checkbox: a change listener (the click delegate would cancel the toggle)
document.addEventListener('change', e => { if (e.target.id === 'st-chime') { setChime(e.target.checked); if (e.target.checked) doneSound(); } });
