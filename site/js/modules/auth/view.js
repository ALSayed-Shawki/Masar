// Owner sign-in (email + password). Friends never see this; they join the group with a code + PIN.
import { esc, toast, val, registerActions } from '../../core/dom.js';
import { sb, errText } from '../../core/supa.js';

export function renderLogin(root, onDone) {
  root.innerHTML = `<section class="card claim"><div class="sh"><h2>تسجيل الدخول</h2></div>
  <label class="fld"><span>الإيميل</span><input id="a-email" type="email" dir="ltr" autocomplete="username"></label>
  <label class="fld"><span>كلمة السر</span><input id="a-pass" type="password" dir="ltr" autocomplete="current-password"></label>
  <button class="btn primary block" data-act="aIn">دخول</button>
  <button class="btn ghost block" data-act="aUp">أول مرة؟ اعمل الحساب</button>
  <p class="hint">بعد ما تعمل حسابك، اقفل التسجيل الجديد من إعدادات Supabase عشان محدش غيرك يعمل حساب.</p></section>`;
  registerActions({
    aIn: async el => {
      el.disabled = true;
      const { error } = await sb.auth.signInWithPassword({ email: val('a-email'), password: val('a-pass') });
      el.disabled = false;
      if (error) return toast(errText(error));
      onDone();
    },
    aUp: async el => {
      const email = val('a-email'), password = val('a-pass');
      if (!email || password.length < 8) return toast('اكتب إيميل وكلمة سر 8 حروف على الأقل');
      el.disabled = true;
      const { data, error } = await sb.auth.signUp({ email, password });
      el.disabled = false;
      if (error) return toast(errText(error));
      if (!data.session) return toast('افتح الإيميل وأكّد الحساب، وبعدين سجّل دخول.');
      onDone();
    },
  });
}

export function renderNotConfigured(root) {
  root.innerHTML = `<section class="card"><div class="sh"><h2>التطبيق لسه متوصلش بقاعدة البيانات</h2></div>
  <p class="hint">${esc('محتاج SUPABASE_URL و SUPABASE_ANON_KEY في js/config.js.')}</p></section>`;
}

// First sign-in: ask the person's name and a short line about their work (seeds the AI "brain").
import { openSheet, closeSheet } from '../../core/dom.js';
import { P, setSetting, myName } from '../../core/store.js';
export function maybeOnboard() {
  if (myName()) return;
  openSheet(`<h3>أهلاً بيك في مسار</h3><p class="hint">معلومتين بس عشان التطبيق والذكاء الاصطناعي يكلموك صح.</p>
  <label class="fld"><span>اسمك</span><input id="ob-name" placeholder="مثال: مصطفى"></label>
  <label class="fld"><span>بتشتغل إيه؟ (سطرين، تقدر تزوّد بعدين من الإعدادات ← العقل المدبر)</span><textarea id="ob-about" rows="3" placeholder="مثال: استشاري Odoo، شغال على تنفيذ ERP لمصانع وشركات تجارية…"></textarea></label>
  <div class="actions"><button class="btn primary block" data-act="obSave">يلا نبدأ</button></div>`);
}
registerActions({
  obSave: async () => {
    const name = val('ob-name'); if (!name) return toast('اكتب اسمك');
    const about = val('ob-about');
    try {
      await setSetting('profile', { name });
      if (about && !(P.settings.brain || {}).text) await setSetting('brain', { text: `${name}: ${about}`, updated_at: new Date().toISOString() });
      closeSheet(); toast(`أهلاً يا ${name}`);
    } catch (x) { toast(errText(x)); }
  },
});
