// Minimal MCP server (Streamable HTTP, JSON responses). Every tool runs as the
// signed-in user through a user-scoped Supabase client, so privacy rules apply.
import type { SupabaseClient } from "@supabase/supabase-js";
import { CATEGORIES, GAME_PROFILES } from "@/lib/detect/categories";
import { mss } from "@/lib/detect/timecode";

type Tool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run(sb: SupabaseClient, args: any): Promise<unknown>;
};

const str = (description: string) => ({ type: "string", description });

export const TOOLS: Tool[] = [
  {
    name: "list_events",
    description: "List the events (shows / broadcast days) you own or were invited to.",
    inputSchema: { type: "object", properties: {} },
    run: async (sb) => (await sb.from("events").select("id,name,game,created_at").order("created_at", { ascending: false })).data,
  },
  {
    name: "create_event",
    description: "Create an event.",
    inputSchema: { type: "object", properties: { name: str("Event name"), game: { type: "string", enum: Object.keys(GAME_PROFILES) } }, required: ["name"] },
    run: async (sb, a) => {
      const { data, error } = await sb.from("events").insert({ name: String(a.name).slice(0, 120), game: a.game ?? "generic" }).select("id,name,game").single();
      if (error) throw new Error(error.message);
      return data;
    },
  },
  {
    name: "update_event",
    description: "Rename an event or change its game.",
    inputSchema: { type: "object", properties: { event_id: str("Event id"), name: str("New name"), game: { type: "string", enum: Object.keys(GAME_PROFILES) } }, required: ["event_id"] },
    run: async (sb, a) => {
      const patch: Record<string, string> = {};
      if (a.name) patch.name = String(a.name).slice(0, 120);
      if (a.game) patch.game = a.game;
      const { data, error } = await sb.from("events").update(patch).eq("id", a.event_id).select("id,name,game").single();
      if (error) throw new Error(error.message);
      return data;
    },
  },
  {
    name: "list_matches",
    description: "List matches in an event with how many moments each has.",
    inputSchema: { type: "object", properties: { event_id: str("Event id") }, required: ["event_id"] },
    run: async (sb, a) => (await sb.from("matches").select("id,name,status,started_at,ended_at,moments(count)").eq("event_id", a.event_id).order("started_at")).data,
  },
  {
    name: "get_match_report",
    description: "The report for one match: every caught moment with time, category, score and reason.",
    inputSchema: {
      type: "object",
      properties: { match_id: str("Match id"), category: { type: "string", enum: [...CATEGORIES] }, min_score: { type: "number" }, include_skipped: { type: "boolean" } },
      required: ["match_id"],
    },
    run: async (sb, a) => {
      const m = await sb.from("matches").select("id,name,status,started_at,ended_at").eq("id", a.match_id).maybeSingle();
      if (!m.data) throw new Error("Match not found");
      let q = sb.from("moments").select("id,start_sec,end_sec,peak_sec,trim_start_sec,trim_end_sec,score,category,label,reason,kept,source").eq("match_id", a.match_id).order("start_sec");
      if (!a.include_skipped) q = q.eq("kept", true);
      if (a.category) q = q.eq("category", a.category);
      if (typeof a.min_score === "number") q = q.gte("score", a.min_score);
      const rows = (await q).data ?? [];
      return {
        match: m.data,
        moments: rows.map((r: any) => ({ ...r, in: mss(Number(r.trim_start_sec ?? r.start_sec)), out: mss(Number(r.trim_end_sec ?? r.end_sec)) })),
      };
    },
  },
  {
    name: "set_moment_kept",
    description: "Keep or skip a moment.",
    inputSchema: { type: "object", properties: { moment_id: str("Moment id"), kept: { type: "boolean" } }, required: ["moment_id", "kept"] },
    run: async (sb, a) => {
      const { data, error } = await sb.from("moments").update({ kept: !!a.kept }).eq("id", a.moment_id).select("id,kept").single();
      if (error) throw new Error("You can't change that moment.");
      return data;
    },
  },
];

export async function handleRpc(sb: SupabaseClient, msg: any) {
  const ok = (result: unknown) => ({ jsonrpc: "2.0", id: msg.id, result });
  const err = (code: number, message: string) => ({ jsonrpc: "2.0", id: msg.id ?? null, error: { code, message } });
  switch (msg?.method) {
    case "initialize":
      return ok({ protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "clipshots", version: "0.1.0" } });
    case "notifications/initialized":
      return null;
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
    case "tools/call": {
      const t = TOOLS.find((x) => x.name === msg.params?.name);
      if (!t) return err(-32602, "Unknown tool");
      try {
        const out = await t.run(sb, msg.params?.arguments ?? {});
        return ok({ content: [{ type: "text", text: JSON.stringify(out, null, 2) }] });
      } catch (e: any) {
        return ok({ isError: true, content: [{ type: "text", text: e?.message ?? "Failed" }] });
      }
    }
    default:
      return err(-32601, "Method not found");
  }
}
