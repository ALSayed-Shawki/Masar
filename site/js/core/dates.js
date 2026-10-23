export const LOC = 'ar-EG-u-nu-latn';
const pad = n => String(n).padStart(2, '0');
export const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
export const pd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (s, n) => { const d = pd(s); d.setDate(d.getDate() + n); return ymd(d); };
export const today = () => ymd(new Date());
/** Saudi work week starts on Saturday. */
export const weekStart = s => { const d = pd(s); d.setDate(d.getDate() - (d.getDay() + 1) % 7); return ymd(d); };
export const dayDiff = (a, b) => Math.round((pd(a) - pd(b)) / 864e5);
export const fmtShort = s => pd(s).toLocaleDateString(LOC, { day: 'numeric', month: 'short' });
export const fmtDay = s => pd(s).toLocaleDateString(LOC, { weekday: 'long', day: 'numeric', month: 'long' });
export const fmtMonth = s => pd(s).toLocaleDateString(LOC, { month: 'long', year: 'numeric' });
export const nowHM = () => { const d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
export const hmPlus = (t, min) => { const [h, m] = t.split(':').map(Number); const x = h * 60 + m + min; return pad(Math.floor(x / 60) % 24) + ':' + pad(x % 60); };
export const normHM = t => { const m = String(t).trim().match(/^(\d{1,2})(?::(\d{2}))?$/); if (!m || +m[1] > 23 || +(m[2] || 0) > 59) return null; return pad(+m[1]) + ':' + (m[2] || '00'); };
export const fmtWeekday = s => pd(s).toLocaleDateString(LOC, { weekday: 'long' });
export const fmtFull = s => pd(s).toLocaleDateString(LOC, { day: 'numeric', month: 'long', year: 'numeric' });
export const fmtHijri = s => { try { return pd(s).toLocaleDateString('ar-SA-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' }); } catch { return ''; } };
