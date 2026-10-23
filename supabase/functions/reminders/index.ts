// All scheduled notifications. Called every 5 minutes by Supabase Cron with the header
// `x-cron-secret: <CRON_SECRET>`.
//   1. Medication: at the dose time, and again after 60 min if still unrecorded.
//   2. Azkar: morning (leaving home) and evening (coming back) at the chosen time and days.
//      Tapping the notification walks through the azkar one by one (handled in sw.js).
//   3. AI check-ins ("nudges"): short playful questions during active hours; replies go to the chat.
//   4. Evening review: what is still open from today → open the app to move it to tomorrow / later.
// Each notification is logged once per day, so overlapping runs never double-send.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import webpush from "npm:web-push@3.6.7";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const TZ_DEFAULT = "Asia/Riyadh";
const WINDOW = 10; // minutes after the target time in which a run still fires

function localNow(tz: string) {
  const d = new Date();
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const hm = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(d);
  const [h, m] = hm.split(":").map(Number);
  return { date, minutes: h * 60 + m, day: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd) };
}
const toMin = (t: string) => { const [h, m] = (t || "0:0").split(":").map(Number); return h * 60 + m; };
const inWindow = (now: number, t: string) => { const d = now - toMin(t); return d >= 0 && d < WINDOW; };

async function onceToday(owner: string, key: string, date: string) {
  const { data } = await sb.from("notify_log").upsert({ owner_id: owner, key, for_date: date }, { onConflict: "owner_id,key,for_date", ignoreDuplicates: true }).select("id");
  return !!data?.length;
}

async function push(owner: string, payload: Record<string, unknown>) {
  const { data: subs } = await sb.from("push_subscriptions").select("id,endpoint,p256dh,auth").eq("user_id", owner);
  let n = 0;
  for (const s of subs ?? []) {
    try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 3600 }); n++; }
    catch (e) { const c = (e as { statusCode?: number }).statusCode; if (c === 404 || c === 410) await sb.from("push_subscriptions").delete().eq("id", s.id); }
  }
  return n;
}

async function medications(): Promise<number> {
  let sent = 0;
  const { data: meds } = await sb.from("medications").select("id,owner_id,name,times,timezone").eq("active", true);
  for (const med of meds ?? []) {
    const { date, minutes } = localNow(med.timezone || TZ_DEFAULT);
    for (const t of med.times as string[]) {
      const diff = minutes - toMin(t);
      let kind: "due" | "followup" | null = null;
      if (diff >= 0 && diff < 15) kind = "due";
      else if (diff >= 60 && diff < 75) {
        const { data: log } = await sb.from("day_logs").select("meds").eq("owner_id", med.owner_id).eq("date", date).maybeSingle();
        if (!log?.meds?.[`${med.id}@${t}`]) kind = "followup";
      }
      if (!kind) continue;
      const { data: ins } = await sb.from("reminder_log")
        .upsert({ medication_id: med.id, for_date: date, dose_time: t, kind }, { onConflict: "medication_id,for_date,dose_time,kind", ignoreDuplicates: true }).select("id");
      if (!ins?.length) continue;
      sent += await push(med.owner_id, {
        type: "med",
        title: kind === "due" ? `ميعاد الدواء: ${med.name}` : `خدت ${med.name}؟`,
        body: kind === "due" ? `الساعة ${t}. سجّل لما تاخده.` : `لسه متسجلش الدواء بتاع الساعة ${t}.`,
        tag: `med-${med.id}-${t}`, url: "./#/today",
      });
    }
  }
  return sent;
}

type Slot = { time?: string; days?: number[]; ids?: string[] };
async function azkar(): Promise<number> {
  let sent = 0;
  const { data: rows } = await sb.from("settings").select("owner_id,value").eq("key", "azkar");
  for (const r of rows ?? []) {
    const cfg = r.value as { morning?: Slot; evening?: Slot; tz?: string };
    const { date, minutes, day } = localNow(cfg.tz || TZ_DEFAULT);
    for (const slot of ["morning", "evening"] as const) {
      const s = cfg[slot];
      if (!s?.time || !s.ids?.length || !(s.days ?? [0, 1, 2, 3, 4, 5, 6]).includes(day) || !inWindow(minutes, s.time)) continue;
      if (!(await onceToday(r.owner_id, `azkar:${slot}`, date))) continue;
      sent += await push(r.owner_id, {
        type: "azkar", slot, tag: `azkar-${slot}`, url: `./#/azkar/${slot}`,
        title: slot === "morning" ? "أذكار الخروج والصباح" : "أذكار الرجوع والمساء",
        body: "دوس على الإشعار ويظهرلك الذكر اللي بعده.",
      });
    }
  }
  return sent;
}

type NudgeCfg = { enabled?: boolean; every?: number; from?: string; to?: string; tz?: string };
async function nudges(): Promise<number> {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return 0;
  let sent = 0;
  const { data: rows } = await sb.from("settings").select("owner_id,value").eq("key", "nudges");
  for (const r of rows ?? []) {
    const cfg = r.value as NudgeCfg;
    if (!cfg.enabled) continue;
    const tz = cfg.tz || TZ_DEFAULT, { date, minutes } = localNow(tz);
    const from = toMin(cfg.from || "10:00"), to = toMin(cfg.to || "23:00"), step = Math.max(1, cfg.every || 3) * 60;
    let slot: number | null = null;
    for (let t = from; t <= to; t += step) if (minutes - t >= 0 && minutes - t < WINDOW) slot = t;
    if (slot === null) continue;

    // skip if he wrote in the last hour: no need to poke an active conversation
    const { data: recent } = await sb.from("chat_messages").select("role,text,created_at,source").eq("owner_id", r.owner_id).order("created_at", { ascending: false }).limit(10);
    if (recent?.some(m => m.role === "user" && Date.now() - new Date(m.created_at).getTime() < 3600_000)) continue;
    if (!(await onceToday(r.owner_id, `nudge:${slot}`, date))) continue;

    const [{ data: tasks }, { data: day }] = await Promise.all([
      sb.from("tasks").select("title,status,done_at,focus_date,due").eq("owner_id", r.owner_id).or(`focus_date.eq.${date},due.eq.${date},done_at.gte.${date}T00:00:00`),
      sb.from("day_logs").select("prayers,mood,energy,word,azkar").eq("owner_id", r.owner_id).eq("date", date).maybeSingle(),
    ]);
    const done = (tasks ?? []).filter(t => t.status === "done").map(t => t.title);
    const open = (tasks ?? []).filter(t => t.status === "todo").map(t => t.title);
    const hh = String(Math.floor(minutes / 60)).padStart(2, "0") + ":" + String(minutes % 60).padStart(2, "0");
    const { data: sets } = await sb.from("settings").select("key,value").eq("owner_id", r.owner_id).in("key", ["brain", "profile"]);
    const sv = (k: string) => (sets ?? []).find(x => x.key === k)?.value as Record<string, string> | undefined;
    const brain = String(sv("brain")?.text ?? "").slice(0, 4000);
    const name = String(sv("profile")?.name ?? "").trim() || "صاحبي";
    const history = (recent ?? []).slice().reverse().map(m => `${m.role === "user" ? name : "أنت"}: ${m.text}`).join("\n");
    const prompt = `أنت رفيق ${name} في تطبيق "مسار": صاحب جدع، دمه خفيف، بيرخّم عليه بحب عشان يوصل لأحسن نسخة من نفسه وأحسن روتين.
اكتب رسالة إشعار واحدة قصيرة (أقل من 110 حرف) بالعامية المصرية، فيها سؤال يخليه يرد. نوّع ومتكررش اللي فات. ممكن تناديه "يا برنس" أو "يا هندسة" أحيانًا مش دايمًا.
استخدم الواقع: الساعة دلوقتي ${hh}. اتقفل النهارده: ${done.join(" | ") || "ولا حاجة لسه"}. لسه مفتوح ومهم: ${open.slice(0, 4).join(" | ") || "-"}.
الصلاة النهارده: ${JSON.stringify(day?.prayers ?? {})}. المزاج: ${day?.mood ?? "-"}. الأذكار: ${JSON.stringify(day?.azkar ?? {})}.
خلفية عنه: ${brain || "-"}
آخر كلام بينكم (خده في اعتبارك وكمّل عليه لو مناسب):
${history || "مفيش"}
ممنوع: الوعظ الطويل، اللوم الجارح، الإيموجي الكتير (واحد بالكتير). اكتب الرسالة بس.`;
    let text = "عامل إيه يا برنس؟ عملت إيه النهارده؟";
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: Deno.env.get("AI_MODEL_FAST") ?? "claude-haiku-5-5", max_tokens: 200, messages: [{ role: "user", content: prompt }] }),
      });
      if (res.ok) { const j = await res.json(); const t = (j.content ?? []).map((c: { text?: string }) => c.text ?? "").join("").trim(); if (t) text = t.slice(0, 220); }
    } catch { /* fall back to the default line */ }
    await sb.from("chat_messages").insert({ owner_id: r.owner_id, role: "assistant", text, source: "nudge" });
    sent += await push(r.owner_id, { type: "nudge", title: "مسار", body: text, tag: "nudge", url: "./#/chat" });
  }
  return sent;
}

type ReviewCfg = { enabled?: boolean; time?: string; tz?: string };
async function review(): Promise<number> {
  let sent = 0;
  const { data: rows } = await sb.from("settings").select("owner_id,value").eq("key", "review");
  for (const r of rows ?? []) {
    const cfg = r.value as ReviewCfg;
    if (cfg.enabled === false) continue;
    const { date, minutes } = localNow(cfg.tz || TZ_DEFAULT);
    if (!inWindow(minutes, cfg.time || "20:30")) continue;
    const { count } = await sb.from("tasks").select("id", { count: "exact", head: true }).eq("owner_id", r.owner_id).eq("status", "todo").lte("due", date);
    if (!count) continue;
    if (!(await onceToday(r.owner_id, "review", date))) continue;
    sent += await push(r.owner_id, { type: "review", title: "آخر اليوم", body: `فاضل ${count} ${count > 2 && count < 11 ? "حاجات" : "حاجة"} مخلصتش. ننقلهم لبكرة ولا لإمتى؟`, tag: "review", url: "./#/review" });
  }
  return sent;
}

Deno.serve(async (req) => {
  // trimmed on both sides: a secret pasted with a trailing newline must still match
  const secret = (Deno.env.get("CRON_SECRET") ?? "").trim();
  const given = (req.headers.get("x-cron-secret") ?? "").trim();
  // lengths only, never values: tells a missing server secret apart from a wrong/missing header
  if (!secret || given !== secret) return new Response(`forbidden (server ${secret.length}, header ${given.length})`, { status: 403 });
  const pub = Deno.env.get("VAPID_PUBLIC_KEY"), priv = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!pub || !priv) return new Response("push not configured", { status: 503 });
  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") ?? "mailto:masar@example.com", pub, priv);
  const out: Record<string, number | string> = {};
  for (const [name, fn] of Object.entries({ medications, azkar, nudges, review })) {
    try { out[name] = await fn(); } catch (e) { out[name] = "error: " + String((e as Error).message ?? e); }
  }
  return new Response(JSON.stringify({ ok: true, ...out }), { headers: { "Content-Type": "application/json" } });
});
