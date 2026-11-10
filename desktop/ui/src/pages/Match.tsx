import { useEffect, useState } from "react";
import { Square, FolderOpen, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MomentBoard } from "@/components/MomentBoard";
import { desktop, type LocalMoment, type LocalSession } from "@/lib/desktop";
import { go } from "@/lib/router";
import type { BoardMatch, BoardMoment } from "@/lib/types";

function toBoard(m: LocalMoment, mediaUrl: (p: string) => string): BoardMoment {
  return {
    id: m.id,
    start: m.start,
    end: m.end,
    peak: m.peak,
    trimStart: m.trimStart ?? null,
    trimEnd: m.trimEnd ?? null,
    peakAt: m.peakAt,
    score: m.score,
    scanScore: m.scanScore,
    aiScore: m.aiScore,
    category: m.category,
    label: m.label,
    reason: m.reason,
    kept: m.kept,
    source: m.source,
    clipUrl: mediaUrl(m.clipPath),
    thumbUrl: mediaUrl(m.thumbPath),
    clipPath: m.clipPath,
    latencySec: m.latencySec,
  };
}

export function Match({ id }: { id: string }) {
  const d = desktop();
  const [s, setS] = useState<LocalSession | null | undefined>(undefined);
  const [status, setStatus] = useState<string | null>(null);
  const [level, setLevel] = useState<number | null>(null);

  useEffect(() => {
    const load = () => d.session(id).then(setS);
    load();
    return d.onEvent((e) => {
      if (e.sessionId !== id) return;
      if (e.type === "status") setStatus(e.text);
      else if (e.type === "level") setLevel(e.level);
      else if (e.type === "moment") {
        toast(`${e.moment.label ?? e.moment.category} caught`, { description: e.moment.reason });
        load();
      } else load();
    });
  }, [id]);

  if (s === undefined) return <p className="text-muted-foreground">Loading…</p>;
  if (s === null) return <p className="text-muted-foreground">That match isn't on this computer anymore.</p>;

  const match: BoardMatch = {
    id: s.id,
    name: s.matchName,
    eventName: s.eventName,
    game: s.game,
    sourceKind: s.sourceKind,
    sourceLabel: s.sourceLabel,
    status: s.status,
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    durationSec: s.sourceKind === "recording" || s.sourceKind === "vod" ? s.durationSec ?? null : null,
  };
  const moments = s.moments.map((m) => toBoard(m, d.mediaUrl));
  const patch = async (m: BoardMoment, p: Parameters<typeof d.updateMoment>[2]) => {
    await d.updateMoment(s.id, m.id, p);
    setS(await d.session(s.id));
  };

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center gap-2">
        <a href="#/" className="text-sm text-muted-foreground hover:text-foreground">← All matches</a>
        <span className="flex-1" />
        <Button size="sm" variant="secondary" onClick={() => d.showInFolder(s.folder)}><FolderOpen /> Clips folder</Button>
        {s.status === "live" ? (
          <Button size="sm" variant="destructive" onClick={() => d.stop(s.id)}><Square /> Stop</Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            aria-label="Delete match"
            onClick={async () => {
              if (!confirm(`Delete "${s.matchName}" and its clips from this computer?`)) return;
              await d.deleteSession(s.id);
              go("/");
            }}
          >
            <Trash2 />
          </Button>
        )}
      </div>
      {s.error && <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{s.error}</p>}
      <MomentBoard
        match={match}
        moments={moments}
        statusText={status}
        level={level}
        actions={{
          setKept: (m, kept) => patch(m, { kept }),
          setTrim: (m, trimStart, trimEnd) => patch(m, { trimStart, trimEnd }),
          download: async (m) => {
            try {
              const out = m.trimStart !== null || m.trimEnd !== null ? await d.exportTrim(s.id, m.id) : m.clipPath!;
              d.showInFolder(out);
            } catch {
              toast.error("Couldn't save the trimmed clip.");
            }
          },
          showInFolder: (m) => m.clipPath && d.showInFolder(m.clipPath),
          saveText: async (name, text) => {
            const p = await d.saveText(name, text);
            if (p) toast.success("Saved", { description: p });
          },
          recordingPath: `${s.folder}/recording/full.mp4`,
        }}
      />
    </div>
  );
}
