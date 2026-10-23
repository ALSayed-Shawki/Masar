import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/+esm';
import { CONFIG } from '../config.js';

export const configured = !!(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY);

export const sb = configured
  ? createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'masar-auth' },
    })
  : null;

export async function getSession() {
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session;
}
export const isAnon = s => !!s?.user?.is_anonymous;

/** Friendly Arabic text for Supabase / Postgres errors. */
export function errText(e) {
  const m = String(e?.message || e || '');
  if (/row-level security|permission denied|not allowed/i.test(m)) return 'مش مسموح لحسابك بالعملية دي.';
  if (/split amounts/i.test(m)) return 'مجموع المبالغ لازم يساوي الإجمالي.';
  if (/Invalid login credentials/i.test(m)) return 'الإيميل أو كلمة السر غلط.';
  if (/User already registered/i.test(m)) return 'الإيميل ده عنده حساب. سجّل دخول.';
  if (/Anonymous sign-ins are disabled/i.test(m)) return 'تسجيل الضيوف مقفول في الإعدادات. كلّم صاحب الشلة.';
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'مفيش اتصال بالنت.';
  return 'حصلت مشكلة: ' + m.slice(0, 120);
}
