import { sb } from './supa.js';

const b64ToBytes = s => {
  const p = '='.repeat((4 - s.length % 4) % 4);
  const raw = atob((s + p).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
};

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

export async function pushState() {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return sub ? 'on' : 'off';
}

/** Ask permission, subscribe, and store the subscription for the reminder job. */
export async function enablePush() {
  if (!pushSupported()) throw new Error(isIOS() && !isStandalone()
    ? 'على الآيفون: ضيف التطبيق للشاشة الرئيسية الأول وافتحه من الأيقونة.'
    : 'الجهاز ده مش بيدعم الإشعارات.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('الإشعارات اترفضت. فعّلها من إعدادات الموبايل.');
  const { data, error } = await sb.functions.invoke('push-config', { method: 'GET' });
  if (error || !data?.publicKey) throw new Error('مفتاح الإشعارات لسه متجهزش على السيرفر.');
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(data.publicKey) });
  const j = sub.toJSON();
  const { error: e2 } = await sb.from('push_subscriptions').upsert(
    { endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, user_agent: navigator.userAgent.slice(0, 200) },
    { onConflict: 'endpoint' });
  if (e2) throw e2;
}

export async function testNotification() {
  const reg = await navigator.serviceWorker.ready;
  await reg.showNotification('مسار', { body: 'الإشعارات شغالة.', icon: 'icons/masar-192.png', badge: 'icons/badge-96.png', lang: 'ar', dir: 'rtl' });
}
