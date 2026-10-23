// Medication reminders. Called every 5 minutes by a Supabase Cron job with the
// header `x-cron-secret: <CRON_SECRET>`.
//  - "due":      within 15 minutes after a dose time
//  - "followup": 60–75 minutes after, only if the dose is still unrecorded
// reminder_log makes each notification fire once even if the job overlaps.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import webpush from "npm:web-push@3.6.7";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

type Med = { id: string; owner_id: string; name: string; times: string[]; timezone: string };

function localNow(tz: string) {
  const d = new Date();
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const hm = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
  const [h, m] = hm.split(":").map(Number);
  return { date, minutes: h * 60 + m };
}
const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };

Deno.serve(async (req) => {
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret || req.headers.get("x-cron-secret") !== secret) return new Response("forbidden", { status: 403 });

  const pub = Deno.env.get("VAPID_PUBLIC_KEY"), priv = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!pub || !priv) return new Response("push not configured", { status: 503 });
  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") ?? "mailto:masar@example.com", pub, priv);

  const { data: meds, error } = await sb.from("medications").select("id,owner_id,name,times,timezone").eq("active", true);
  if (error) return new Response(error.message, { status: 500 });

  let sent = 0;
  for (const med of (meds ?? []) as Med[]) {
    const { date, minutes } = localNow(med.timezone || "Asia/Riyadh");
    for (const t of med.times) {
      const diff = minutes - toMin(t);
      let kind: "due" | "followup" | null = null;
      if (diff >= 0 && diff < 15) kind = "due";
      else if (diff >= 60 && diff < 75) {
        const { data: log } = await sb.from("day_logs").select("meds").eq("owner_id", med.owner_id).eq("date", date).maybeSingle();
        if (!log?.meds?.[`${med.id}@${t}`]) kind = "followup";
      }
      if (!kind) continue;

      const { data: ins } = await sb.from("reminder_log")
        .upsert({ medication_id: med.id, for_date: date, dose_time: t, kind }, { onConflict: "medication_id,for_date,dose_time,kind", ignoreDuplicates: true })
        .select("id");
      if (!ins?.length) continue; // already sent

      const payload = JSON.stringify({
        title: kind === "due" ? `ميعاد الدواء: ${med.name}` : `خدت ${med.name}؟`,
        body: kind === "due" ? `الساعة ${t}. سجّل لما تاخده.` : `لسه متسجلش الدواء بتاع الساعة ${t}.`,
        tag: `med-${med.id}-${t}`,
        url: "./#/today",
      });
      const { data: subs } = await sb.from("push_subscriptions").select("id,endpoint,p256dh,auth").eq("user_id", med.owner_id);
      for (const s of subs ?? []) {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600 });
          sent++;
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) await sb.from("push_subscriptions").delete().eq("id", s.id);
        }
      }
    }
  }
  return new Response(JSON.stringify({ ok: true, sent }), { headers: { "Content-Type": "application/json" } });
});
