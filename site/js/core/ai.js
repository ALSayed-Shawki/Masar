// Calls the server-side AI function (the Anthropic key never reaches the phone).
import { sb } from './supa.js';

export async function ai(task, input, context = {}) {
  const { data, error } = await sb.functions.invoke('ai', { body: { task, input, context } });
  if (error) {
    let code = '';
    try { code = (await error.context?.json())?.error || ''; } catch {}
    throw new Error(code === 'ai_not_configured' ? 'مفتاح الذكاء الاصطناعي لسه متحطش على السيرفر.' : code === 'daily_limit' ? 'خلصت حد الذكاء الاصطناعي النهارده. يتجدد بكرة.' : 'المساعد الذكي مش متاح دلوقتي. جرّب تاني.');
  }
  return data?.text || '';
}

/** Read JSON out of a model reply that may wrap it in prose or a code fence. */
export function parseJSON(t) {
  try { return JSON.parse(t); } catch {}
  const f = t.match(/```(?:json)?\s*([\s\S]*?)```/); if (f) { try { return JSON.parse(f[1]); } catch {} }
  const s = t.search(/[[{]/), e = Math.max(t.lastIndexOf(']'), t.lastIndexOf('}'));
  if (s >= 0 && e > s) return JSON.parse(t.slice(s, e + 1));
  throw new Error('الرد ماكانش واضح. جرّب تاني.');
}

/** Minimal markdown → HTML for AI answers (headings, bullet lists, bold). Input is escaped first. */
export function mdHtml(src, esc) {
  let out = '', inList = false;
  for (const raw of esc(src).split('\n')) {
    const l = raw.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    const li = l.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (li) { if (!inList) { out += '<ul>'; inList = true; } out += `<li>${li[1]}</li>`; continue; }
    if (inList) { out += '</ul>'; inList = false; }
    if (/^#{1,4}\s/.test(l)) out += `<h4>${l.replace(/^#+\s*/, '')}</h4>`; else if (l.trim()) out += `<p>${l}</p>`;
  }
  return out + (inList ? '</ul>' : '');
}
