// AI helper for the owner only. The Anthropic key never leaves the server.
// POST { task: "capture" | "polish" | "review" | "suggest" | "cv", input: string, context?: object }
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { cors, json } from "../_shared/cors.ts";

const FAST = Deno.env.get("AI_MODEL_FAST") ?? "claude-haiku-5-5";
const SMART = Deno.env.get("AI_MODEL_SMART") ?? "claude-sonnet-5-5";

const STYLE = "اكتب بالعربي المصري المهني، مباشر، من غير مجاملات، واحتفظ بمصطلحات Odoo والأسماء التقنية بالإنجليزي. متخترعش أي بيانات مش موجودة.";

const TASKS: Record<string, { model: string; max: number; prompt: (input: string, ctx: Record<string, unknown>) => string }> = {
  capture: {
    model: FAST, max: 1500,
    prompt: (input, ctx) => `أنت مساعد تنظيم شخصي لسيد، استشاري Odoo ومحاسب. حوّل النص اللي تحت لعناصر منفصلة.
اليوم: ${ctx.today ?? ""}. أسبوع الشغل بيبدأ السبت.
المشاريع (استخدم الـid بالظبط أو "" لو مش واضح):
${ctx.projects ?? "(لا يوجد)"}
الأنواع: task مهمة، idea فكرة بزنس، note ملاحظة أو حاجة من السوشيال، learn حاجة يذاكرها، expense مصروف، income دخل، win إنجاز للـCV.
القواعد: title مختصر ومحدد، المهام تبدأ بفعل، الإنجاز كنقطة CV. dod للمهام: امتى تعتبر خلصت. due بصيغة YYYY-MM-DD أو "". priority 1-3. amount رقم، currency SAR أو EGP.
رد بمصفوفة JSON فقط بالشكل:
[{"kind":"task","title":"","dod":"","project":"","due":"","priority":1,"amount":0,"currency":"SAR","category":"","source":""}]

النص:
${input}`,
  },
  polish: {
    model: FAST, max: 400,
    prompt: (input) => `أعد صياغة المهمة دي باحترافية: عنوان يبدأ بفعل ومحدد وقابل للقياس، وتعريف إنجاز في جملة. ${STYLE}
رد بـJSON فقط: {"title":"","dod":"","note":"ملاحظة لو المهمة كبيرة أو غامضة وإلا فاضي"}
المهمة: ${input}`,
  },
  review: {
    model: SMART, max: 1800,
    prompt: (input) => `أنت مدرب عمل صريح لسيد: استشاري Odoo ومحاسب شغال في أكتر من جهة. ${STYLE}
راجع بيانات الأسبوع واكتب بالعناوين: ## الخلاصة ## اللي اتعمل كويس ## ملاحظات على أسلوب الشغل ## مخاطر ## تركيز الأسبوع الجاي (3 نقاط) ## سطر أخير.

${input}`,
  },
  suggest: {
    model: SMART, max: 1200,
    prompt: (input) => `أنت مستشار عملي لسيد. من أفكاره وأهدافه اقترح 3 خطوات صغيرة للأسبوع ده مربوطة بأفكار مسجلة، وقول لو في فكرة تستاهل تتحول لمشروع. ${STYLE}

${input}`,
  },
  cv: {
    model: SMART, max: 1500,
    prompt: (input) => `حوّل الإنجازات دي لنقاط CV احترافية بالإنجليزي ثم بالعربي، لاستشاري Odoo ERP ومحاسب. فعل قوي + ما تم + الأثر. متضيفش أرقام مش مذكورة.

${input}`,
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { data: { user } } = await sb.auth.getUser(token);
  if (!user || user.is_anonymous) return json({ error: "not_allowed" }, 403);

  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return json({ error: "ai_not_configured" }, 503);

  let body: { task?: string; input?: string; context?: Record<string, unknown> };
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
  const t = TASKS[body.task ?? ""];
  if (!t || !body.input || body.input.length > 60000) return json({ error: "bad_request" }, 400);

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: t.model, max_tokens: t.max, messages: [{ role: "user", content: t.prompt(body.input, body.context ?? {}) }] }),
  });
  if (!r.ok) return json({ error: "upstream", status: r.status }, 502);
  const data = await r.json();
  const text = (data.content ?? []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("");
  return json({ text });
});
