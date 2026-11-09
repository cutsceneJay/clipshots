import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { MomentBoard } from "@/components/MomentBoard";
import { supabase } from "@/integrations/supabase/client";
import type { BoardMatch, BoardMoment } from "@/lib/types";
import type { Category } from "@/lib/detect/categories";

export const Route = createFileRoute("/_app/matches/$matchId")({ component: CloudBoard });

function CloudBoard() {
  const { matchId } = Route.useParams();
  const [match, setMatch] = useState<(BoardMatch & { eventId: string }) | null>(null);
  const [moments, setMoments] = useState<BoardMoment[]>([]);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let alive = true;
    const urls = new Map<string, string>();
    async function sign(path: string | null) {
      if (!path) return null;
      if (urls.has(path)) return urls.get(path)!;
      const { data } = await supabase!.storage.from("clips").createSignedUrl(path, 60 * 60 * 6);
      if (data?.signedUrl) urls.set(path, data.signedUrl);
      return data?.signedUrl ?? null;
    }
    async function toBoard(r: any): Promise<BoardMoment> {
      return {
        id: r.id,
        start: Number(r.start_sec),
        end: Number(r.end_sec),
        peak: Number(r.peak_sec),
        trimStart: r.trim_start_sec === null ? null : Number(r.trim_start_sec),
        trimEnd: r.trim_end_sec === null ? null : Number(r.trim_end_sec),
        peakAt: r.peak_at,
        score: r.score,
        scanScore: r.scan_score,
        aiScore: r.ai_score,
        category: r.category as Category,
        label: r.label,
        reason: r.reason,
        kept: r.kept,
        source: r.source,
        clipUrl: await sign(r.clip_path),
        thumbUrl: await sign(r.thumb_path),
        latencySec: r.latency_sec === null ? null : Number(r.latency_sec),
      };
    }
    async function loadMatch() {
      const { data } = await supabase!.from("matches").select("id,name,status,started_at,ended_at,source_kind,source_label,event_id,events(name,game)").eq("id", matchId).maybeSingle();
      if (!alive) return;
      if (!data) return setMissing(true);
      const e = (data as any).events;
      setMatch({ id: data.id, eventId: data.event_id, name: data.name, eventName: e?.name, game: e?.game ?? "generic", sourceKind: data.source_kind, sourceLabel: data.source_label, status: data.status, startedAt: data.started_at, endedAt: data.ended_at });
    }
    async function loadMoments() {
      const { data } = await supabase!.from("moments").select("*").eq("match_id", matchId).order("start_sec");
      const xs = await Promise.all((data ?? []).map(toBoard));
      if (alive) setMoments(xs);
    }
    loadMatch();
    loadMoments();
    const ch = supabase!
      .channel(`match-${matchId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "moments", filter: `match_id=eq.${matchId}` }, async (p) => {
        if (p.eventType === "DELETE") return setMoments((xs) => xs.filter((x) => x.id !== (p.old as any).id));
        const m = await toBoard(p.new);
        setMoments((xs) => {
          const i = xs.findIndex((x) => x.id === m.id);
          if (i < 0) {
            if (p.eventType === "INSERT") toast(`${m.label ?? m.category} at ${Math.floor(m.peak / 60)}:${String(Math.floor(m.peak % 60)).padStart(2, "0")}`, { description: m.reason });
            return [...xs, m];
          }
          const c = [...xs];
          c[i] = m;
          return c;
        });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "matches", filter: `id=eq.${matchId}` }, loadMatch)
      .subscribe();
    return () => {
      alive = false;
      supabase!.removeChannel(ch);
    };
  }, [matchId]);

  if (missing) return <p className="text-muted-foreground">This match doesn't exist or you don't have access.</p>;
  if (!match) return <p className="text-muted-foreground">Loading…</p>;

  const update = async (m: BoardMoment, patch: Record<string, unknown>, local: Partial<BoardMoment>) => {
    setMoments((xs) => xs.map((x) => (x.id === m.id ? { ...x, ...local } : x)));
    const { error } = await supabase!.from("moments").update(patch).eq("id", m.id);
    if (error) toast.error("Only editors can change moments.");
  };

  return (
    <div className="space-y-4">
      <Link to="/events/$eventId" params={{ eventId: match.eventId }} className="no-print text-sm text-muted-foreground hover:text-foreground">← {match.eventName ?? "Event"}</Link>
      <MomentBoard
        match={match}
        moments={moments}
        actions={{
          setKept: (m, kept) => update(m, { kept }, { kept }),
          setTrim: (m, a, b) => update(m, { trim_start_sec: a, trim_end_sec: b }, { trimStart: a, trimEnd: b }),
          download: async (m) => {
            if (!m.clipUrl) return;
            const a = document.createElement("a");
            a.href = m.clipUrl + (m.clipUrl.includes("?") ? "&" : "?") + "download=";
            a.click();
          },
        }}
      />
    </div>
  );
}
