// Masar as an MCP server, so Sayed's Claude.ai account (which knows him) can read and update Masar.
// Add it in claude.ai → Settings → Connectors → Add custom connector, with the URL shown in
// Masar → Settings → "ربط Claude":  https://<project>.supabase.co/functions/v1/mcp/<token>
// The token is generated in the app and stored in settings(key='mcp'); it identifies the owner.
// Transport: MCP Streamable HTTP, JSON responses only (no SSE streams needed for these tools).
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const TZ = "Asia/Riyadh";
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "POST, GET, OPTIONS, DELETE" };

type Args = Record<string, unknown>;
const S = (v: unknown) => (v == null ? "" : String(v));

const TOOLS = [
  { name: "get_overview", description: "Sayed's current picture in Masar: saved profile (brain), active projects with status and next step, today's open items and what was done today, this week's numbers. Call this first.", inputSchema: { type: "object", properties: {} } },
  { name: "get_project", description: "One project's full record: scope, client, status, next step, open tasks, recent done items with notes, and the latest AI thread. Match by name (Arabic or English, partial ok) or id.", inputSchema: { type: "object", properties: { project: { type: "string" } }, required: ["project"] } },
  { name: "update_project", description: "Create or update a project. Only the fields you pass change. status: active | prospect | paused | done. area: work | growth | business | personal.", inputSchema: { type: "object", properties: { project: { type: "string", description: "existing name or id; a new name creates the project" }, client: { type: "string" }, status: { type: "string" }, scope: { type: "string" }, next_step: { type: "string" }, area: { type: "string" } }, required: ["project"] } },
  { name: "add_task", description: "Add a task or a same-day request to a project. kind: task | request (request = asked today, meant to close today). due: YYYY-MM-DD (defaults to today for requests). priority 1-3.", inputSchema: { type: "object", properties: { project: { type: "string" }, title: { type: "string" }, kind: { type: "string" }, due: { type: "string" }, priority: { type: "number" }, dod: { type: "string" } }, required: ["title"] } },
  { name: "list_tasks", description: "Open (or done) tasks, optionally for one project.", inputSchema: { type: "object", properties: { project: { type: "string" }, status: { type: "string", enum: ["todo", "done"] } } } },
  { name: "complete_task", description: "Mark a task done, with an optional note about what was done.", inputSchema: { type: "object", properties: { task_id: { type: "string" }, note: { type: "string" } }, required: ["task_id"] } },
  { name: "add_note", description: "Save an idea / note / thing to learn (kind: idea | note | learn), optionally linked to a project.", inputSchema: { type: "object", properties: { text: { type: "string" }, kind: { type: "string" }, project: { type: "string" }, source: { type: "string" } }, required: ["text"] } },
  { name: "update_brain", description: "Replace or append to Sayed's saved profile (the 'brain' every Masar AI call reads). mode: append | replace.", inputSchema: { type: "object", properties: { text: { type: "string" }, mode: { type: "string", enum: ["append", "replace"] } }, required: ["text"] } },
];

async function owner(token: string) {
  if (!token || token.length < 24) return null;
  const { data } = await sb.from("settings").select("owner_id,value").eq("key", "mcp");
  return (data ?? []).find(r => (r.value as { token?: string })?.token === token)?.owner_id ?? null;
}

async function findProject(uid: string, ref: string) {
  const { data } = await sb.from("projects").select("*").eq("owner_id", uid).eq("active", true);
  const q = ref.trim().toLowerCase();
  return (data ?? []).find(p => p.id === ref) ?? (data ?? []).find(p => p.name.toLowerCase() === q)
    ?? (data ?? []).find(p => p.name.toLowerCase().includes(q) || q.includes(p.name.toLowerCase()) || (p.client ?? "").toLowerCase().includes(q)) ?? null;
}

async function call(uid: string, name: string, a: Args): Promise<unknown> {
  const td = today();
  switch (name) {
    case "get_overview": {
      const [brain, projects, open, done] = await Promise.all([
        sb.from("settings").select("value").eq("owner_id", uid).eq("key", "brain").maybeSingle(),
        sb.from("projects").select("id,name,area,client,status,next_step,updated_at").eq("owner_id", uid).eq("active", true).order("sort"),
        sb.from("tasks").select("id,title,kind,due,priority,project_id,focus_date").eq("owner_id", uid).eq("status", "todo").order("due", { nullsFirst: false }).limit(80),
        sb.from("tasks").select("title,done_note,project_id,done_at").eq("owner_id", uid).eq("status", "done").gte("done_at", new Date(Date.now() - 7 * 864e5).toISOString()),
      ]);
      const pn = new Map((projects.data ?? []).map(p => [p.id, p.name]));
      return {
        today: td, brain: (brain.data?.value as { text?: string } | null)?.text ?? "",
        projects: projects.data,
        open_today_or_late: (open.data ?? []).filter(t => t.due && t.due <= td).map(t => ({ ...t, project: pn.get(t.project_id) })),
        open_later_or_undated: (open.data ?? []).filter(t => !t.due || t.due > td).length,
        done_last_7_days: (done.data ?? []).map(t => ({ title: t.title, note: t.done_note, project: pn.get(t.project_id), at: t.done_at })),
      };
    }
    case "get_project": {
      const p = await findProject(uid, S(a.project)); if (!p) return { error: "project not found" };
      const [open, done, chat] = await Promise.all([
        sb.from("tasks").select("id,title,kind,due,priority,dod").eq("project_id", p.id).eq("status", "todo"),
        sb.from("tasks").select("title,done_note,done_at").eq("project_id", p.id).eq("status", "done").order("done_at", { ascending: false }).limit(30),
        sb.from("chat_messages").select("role,text,created_at").eq("project_id", p.id).order("created_at", { ascending: false }).limit(10),
      ]);
      return { project: p, open_tasks: open.data, recent_done: done.data, recent_ai_thread: (chat.data ?? []).reverse() };
    }
    case "update_project": {
      const patch: Args = { updated_at: new Date().toISOString() };
      for (const k of ["client", "status", "scope", "next_step", "area"]) if (a[k] != null) patch[k] = S(a[k]);
      const p = await findProject(uid, S(a.project));
      if (p) { const { error } = await sb.from("projects").update(patch).eq("id", p.id); return error ? { error: error.message } : { ok: true, updated: p.name }; }
      const { data, error } = await sb.from("projects").insert({ owner_id: uid, name: S(a.project), area: S(a.area) || "work", sort: 100, ...patch }).select("id,name").single();
      return error ? { error: error.message } : { ok: true, created: data };
    }
    case "add_task": {
      const p = a.project ? await findProject(uid, S(a.project)) : null;
      const kind = S(a.kind) === "request" ? "request" : "task";
      const due = /^\d{4}-\d{2}-\d{2}$/.test(S(a.due)) ? S(a.due) : kind === "request" ? td : null;
      const { data, error } = await sb.from("tasks").insert({ owner_id: uid, title: S(a.title), kind, due, priority: Math.min(3, Math.max(1, Number(a.priority) || 1)), dod: S(a.dod), project_id: p?.id ?? null }).select("id,title,due").single();
      return error ? { error: error.message } : { ok: true, task: data, project: p?.name ?? null };
    }
    case "list_tasks": {
      let q = sb.from("tasks").select("id,title,kind,due,priority,status,done_note,project_id").eq("owner_id", uid).eq("status", S(a.status) || "todo").limit(100);
      if (a.project) { const p = await findProject(uid, S(a.project)); if (!p) return { error: "project not found" }; q = q.eq("project_id", p.id); }
      const { data } = await q; return data;
    }
    case "complete_task": {
      const { error } = await sb.from("tasks").update({ status: "done", done_at: new Date().toISOString(), done_note: S(a.note) }).eq("id", S(a.task_id)).eq("owner_id", uid);
      return error ? { error: error.message } : { ok: true };
    }
    case "add_note": {
      const p = a.project ? await findProject(uid, S(a.project)) : null;
      const kind = ["idea", "note", "learn"].includes(S(a.kind)) ? S(a.kind) : "note";
      const { error } = await sb.from("notes").insert({ owner_id: uid, text: S(a.text), kind, source: S(a.source), project_id: p?.id ?? null });
      return error ? { error: error.message } : { ok: true };
    }
    case "update_brain": {
      const { data } = await sb.from("settings").select("value").eq("owner_id", uid).eq("key", "brain").maybeSingle();
      const old = (data?.value as { text?: string } | null)?.text ?? "";
      const text = S(a.mode) === "replace" ? S(a.text) : [old, S(a.text)].filter(Boolean).join("\n");
      const { error } = await sb.from("settings").upsert({ owner_id: uid, key: "brain", value: { text, updated_at: new Date().toISOString() } }, { onConflict: "owner_id,key" });
      return error ? { error: error.message } : { ok: true, length: text.length };
    }
  }
  return { error: "unknown tool" };
}

const rpc = (id: unknown, result: unknown) => ({ jsonrpc: "2.0", id, result });
const rpcErr = (id: unknown, code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: cors });
  const token = new URL(req.url).pathname.split("/").filter(Boolean).pop() ?? "";
  const uid = await owner(token);
  if (!uid) return new Response("Unauthorized", { status: 401, headers: cors });

  let msg: { id?: unknown; method?: string; params?: { name?: string; arguments?: Args; protocolVersion?: string } } | unknown[];
  try { msg = await req.json(); } catch { return Response.json(rpcErr(null, -32700, "parse error"), { status: 400, headers: cors }); }
  const handle = async (m: { id?: unknown; method?: string; params?: { name?: string; arguments?: Args; protocolVersion?: string } }) => {
    if (m.id === undefined) return null; // notification (e.g. notifications/initialized)
    switch (m.method) {
      case "initialize": return rpc(m.id, { protocolVersion: m.params?.protocolVersion ?? "2025-06-18", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "masar", version: "1.0.0" }, instructions: "Masar is Sayed's personal work/life app. Call get_overview first. Write in Arabic (Egyptian) when adding content." });
      case "ping": return rpc(m.id, {});
      case "tools/list": return rpc(m.id, { tools: TOOLS });
      case "tools/call": {
        try { const out = await call(uid, m.params?.name ?? "", m.params?.arguments ?? {}); return rpc(m.id, { content: [{ type: "text", text: JSON.stringify(out, null, 1) }], isError: !!(out as { error?: string })?.error }); }
        catch (e) { return rpc(m.id, { content: [{ type: "text", text: String((e as Error).message ?? e) }], isError: true }); }
      }
      default: return rpcErr(m.id, -32601, "method not found");
    }
  };
  if (Array.isArray(msg)) {
    const out = (await Promise.all(msg.map(m => handle(m as never)))).filter(Boolean);
    return out.length ? Response.json(out, { headers: cors }) : new Response(null, { status: 202, headers: cors });
  }
  const out = await handle(msg as never);
  return out ? Response.json(out, { headers: cors }) : new Response(null, { status: 202, headers: cors });
});
