// Returns the public VAPID key the app needs to subscribe to push notifications.
import { cors, json } from "../_shared/cors.ts";

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  if (!publicKey) return json({ error: "push_not_configured" }, 503);
  return json({ publicKey });
});
