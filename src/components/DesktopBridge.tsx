// Runs once for the whole app inside the desktop window. It answers the
// catcher's AI review requests (using the signed-in session) and uploads
// caught clips to the cloud so teammates can see the live board.
import { useEffect } from "react";
import { toast } from "sonner";
import { desktop, type LocalMoment, type LocalSession } from "@/lib/desktop";
import { supabase } from "@/integrations/supabase/client";

async function token() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function uploadMoment(s: LocalSession, m: LocalMoment): Promise<string | null> {
  const d = desktop();
  if (!d || !supabase || !s.cloud || m.cloudId) return m.cloudId ?? null;
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return null;
  const dir = `${s.cloud.eventId}/${s.cloud.matchId}`;
  const base = m.clipPath.split(/[\\/]/).pop()!.replace(/\.mp4$/, "");
  const clip = await d.readFile(m.clipPath);
  const thumb = await d.readFile(m.thumbPath);
  const up1 = await supabase.storage.from("clips").upload(`${dir}/${base}.mp4`, clip, { contentType: "video/mp4", upsert: true });
  if (up1.error) throw up1.error;
  const up2 = await supabase.storage.from("clips").upload(`${dir}/${base}.jpg`, thumb, { contentType: "image/jpeg", upsert: true });
  if (up2.error) throw up2.error;
  const { data, error } = await supabase
    .from("moments")
    .insert({
      match_id: s.cloud.matchId,
      start_sec: m.start,
      end_sec: m.end,
      peak_sec: m.peak,
      trim_start_sec: m.trimStart ?? null,
      trim_end_sec: m.trimEnd ?? null,
      peak_at: m.peakAt,
      score: m.score,
      scan_score: m.scanScore,
      ai_score: m.aiScore,
      category: m.category,
      label: m.label,
      reason: m.reason,
      kept: m.kept,
      source: m.source,
      clip_path: `${dir}/${base}.mp4`,
      thumb_path: `${dir}/${base}.jpg`,
      latency_sec: m.latencySec,
    })
    .select("id")
    .single();
  if (error) throw error;
  await d.updateMoment(s.id, m.id, { cloudId: data.id });
  return data.id;
}

async function syncAll() {
  const d = desktop();
  if (!d || !supabase || !(await token())) return;
  for (const s of await d.sessions()) {
    if (!s.cloud) continue;
    for (const m of s.moments) if (!m.cloudId) await uploadMoment(s, m).catch(() => null);
  }
}

export function DesktopBridge() {
  useEffect(() => {
    const d = desktop();
    if (!d) return;
    const off = d.onEvent(async (e) => {
      if (e.type === "review") {
        const t = await token();
        if (!t) return d.answerReview(e.requestId, null);
        try {
          const res = await fetch("/api/review", {
            method: "POST",
            headers: { Authorization: `Bearer ${t}`, "content-type": "application/json" },
            body: JSON.stringify({ candidate: e.candidate, frames: e.frames, game: e.game, context: e.context }),
          });
          const body = await res.json().catch(() => null);
          d.answerReview(e.requestId, res.ok ? body?.verdict ?? null : null);
        } catch {
          d.answerReview(e.requestId, null);
        }
      } else if (e.type === "moment") {
        const s = await d.session(e.sessionId);
        if (s?.cloud) uploadMoment(s, e.moment).catch(() => toast.error("A clip couldn't upload. Clipshots will try again."));
      } else if (e.type === "ended") {
        const s = await d.session(e.sessionId);
        if (s?.cloud && supabase) await supabase.from("matches").update({ status: s.status, ended_at: s.endedAt }).eq("id", s.cloud.matchId);
      } else if (e.type === "error") {
        toast.error(e.message);
      }
    });
    syncAll();
    const iv = setInterval(syncAll, 60_000);
    return () => {
      off();
      clearInterval(iv);
    };
  }, []);
  return null;
}
