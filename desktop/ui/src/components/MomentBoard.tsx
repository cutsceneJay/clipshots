import { useMemo, useRef, useState } from "react";
import { Check, Download, FileSpreadsheet, FolderOpen, Film, Printer, Scissors, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { CategoryBadge, CATEGORY_STYLE } from "@/components/CategoryBadge";
import { CATEGORIES, profileFor, type Category } from "@/lib/detect/categories";
import { mss } from "@/lib/detect/timecode";
import { clipIn, clipOut, type BoardMatch, type BoardMoment } from "@/lib/types";
import { downloadText, safeName, toCsv, toEdl, toFcpxml, toOtio } from "@/lib/exports";
import { cn } from "@/lib/utils";

export interface BoardActions {
  setKept(m: BoardMoment, kept: boolean): void;
  setTrim(m: BoardMoment, trimStart: number | null, trimEnd: number | null): void;
  download?(m: BoardMoment): void;
  showInFolder?(m: BoardMoment): void;
  saveText?(name: string, text: string): void;
  /** Absolute path of the full match recording, for editor handoff. */
  recordingPath?: string | null;
}

export function MomentBoard({
  match,
  moments,
  actions,
  statusText,
  level,
}: {
  match: BoardMatch;
  moments: BoardMoment[];
  actions: BoardActions;
  statusText?: string | null;
  level?: number | null;
}) {
  const [filter, setFilter] = useState<Category | "all">("all");
  const [sort, setSort] = useState<"time" | "score">("time");
  const [showSkipped, setShowSkipped] = useState(false);
  const [trimming, setTrimming] = useState<BoardMoment | null>(null);
  const live = match.status === "live";
  const profile = profileFor(match.game);

  const counts = useMemo(() => {
    const c = new Map<Category, number>();
    for (const m of moments) if (m.kept) c.set(m.category, (c.get(m.category) ?? 0) + 1);
    return c;
  }, [moments]);
  const kept = moments.filter((m) => m.kept);
  const shown = useMemo(() => {
    let xs = moments.filter((m) => (showSkipped || m.kept) && (filter === "all" || m.category === filter));
    xs = [...xs].sort((a, b) => (sort === "time" ? a.start - b.start : b.score - a.score));
    return xs;
  }, [moments, filter, sort, showSkipped]);
  const top = useMemo(() => [...kept].sort((a, b) => b.score - a.score).slice(0, 3), [kept]);
  const latencies = moments.map((m) => m.latencySec).filter((x): x is number => typeof x === "number" && x > 0);
  const avgLatency = latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : null;
  const duration = match.durationSec ? match.durationSec * 1000 : (match.endedAt ? new Date(match.endedAt).getTime() : Date.now()) - new Date(match.startedAt).getTime();

  const base = safeName(`${match.eventName ?? ""} ${match.name}`);
  const save = (name: string, text: string, type?: string) => (actions.saveText ? actions.saveText(name, text) : downloadText(name, text, type));
  const ordered = [...kept].sort((a, b) => a.start - b.start);
  const lastEnd = moments.reduce((a, m) => Math.max(a, m.end), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface/80 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {live ? (
                <span className="inline-flex items-center gap-1.5 text-live">
                  <span className="size-2 animate-live rounded-full bg-live" /> Live
                </span>
              ) : match.status === "failed" ? (
                <span className="text-destructive">Stopped early</span>
              ) : (
                <span>Match report</span>
              )}
              <span>·</span>
              <span>{profile.name}</span>
            </div>
            <h1 className="mt-1 truncate text-2xl font-bold sm:text-3xl">{match.name}</h1>
            {match.eventName && <p className="text-sm text-muted-foreground">{match.eventName}</p>}
          </div>
          <div className="no-print flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => save(`${base}-clip-log.csv`, toCsv(match, ordered), "text/csv")}>
              <FileSpreadsheet /> Clip log
            </Button>
            <ExportMenu
              disabled={!ordered.length}
              onEdl={() => save(`${base}.edl`, toEdl(match, ordered))}
              onFcp={() => save(`${base}.fcpxml`, toFcpxml(match, ordered, actions.recordingPath ?? `${base}.mp4`, match.durationSec ?? lastEnd + 5))}
              onOtio={() => save(`${base}.otio`, toOtio(match, ordered, actions.recordingPath ?? `${base}.mp4`))}
            />
            <Button variant="secondary" size="sm" onClick={() => window.print()}>
              <Printer /> Print
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Moments kept" value={String(kept.length)} sub={moments.length !== kept.length ? `${moments.length - kept.length} skipped` : undefined} />
          <Stat label={live ? "Watching for" : "Length"} value={fmtDuration(duration)} />
          <Stat label="Top score" value={top[0] ? String(top[0].score) : "–"} />
          <Stat label="Clip ready after" value={avgLatency ? `${avgLatency.toFixed(0)}s` : "–"} sub={avgLatency ? "on average" : undefined} />
        </div>

        {live && statusText && (
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">{statusText}</span>
            {typeof level === "number" && (
              <div className="h-1.5 w-32 overflow-hidden rounded-full bg-surface-3" aria-label="Action level">
                <div className="h-full bg-primary transition-[width] duration-300" style={{ width: `${Math.round(level * 100)}%` }} />
              </div>
            )}
          </div>
        )}

        {/* Category breakdown, doubles as a filter */}
        <div className="no-print flex flex-wrap gap-2">
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
            All {kept.length}
          </FilterChip>
          {CATEGORIES.filter((c) => counts.get(c)).map((c) => (
            <FilterChip key={c} active={filter === c} onClick={() => setFilter(c)} className={filter === c ? CATEGORY_STYLE[c] : undefined}>
              {c} {counts.get(c)}
            </FilterChip>
          ))}
          <span className="flex-1" />
          <FilterChip active={sort === "score"} onClick={() => setSort(sort === "time" ? "score" : "time")}>
            {sort === "time" ? "In order" : "Best first"}
          </FilterChip>
          <FilterChip active={showSkipped} onClick={() => setShowSkipped(!showSkipped)}>
            Show skipped
          </FilterChip>
        </div>
      </div>

      {/* Top moments (the report summary) */}
      {!live && top.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            <Sparkles className="size-4 text-primary" /> Top moments
          </h2>
          <ol className="grid gap-3 sm:grid-cols-3">
            {top.map((m, i) => (
              <li key={m.id} className="rounded-xl border border-border bg-surface p-3">
                <div className="flex items-center justify-between">
                  <span className="font-display text-2xl text-primary">#{i + 1}</span>
                  <span className="font-mono text-sm text-muted-foreground">{mss(m.peak)}</span>
                </div>
                <CategoryBadge category={m.category} label={m.label} className="mt-2" />
                <p className="mt-2 text-sm">{m.reason}</p>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* The feed */}
      {shown.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
          {live ? "Nothing yet. Big moments show up here a few seconds after they happen." : moments.length ? "No moments match this filter." : "No moments were caught in this match."}
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((m) => (
            <MomentCard key={m.id} m={m} actions={actions} onTrim={() => setTrimming(m)} />
          ))}
        </ul>
      )}

      {trimming && (
        <TrimDialog
          m={trimming}
          onClose={() => setTrimming(null)}
          onSave={(a, b) => {
            actions.setTrim(trimming, a, b);
            setTrimming(null);
          }}
        />
      )}
    </div>
  );
}

function MomentCard({ m, actions, onTrim }: { m: BoardMoment; actions: BoardActions; onTrim(): void }) {
  const [playing, setPlaying] = useState(false);
  const vref = useRef<HTMLVideoElement>(null);
  const offIn = clipIn(m) - m.start;
  const offOut = clipOut(m) - m.start;
  const trimmed = m.trimStart !== null || m.trimEnd !== null;
  return (
    <li className={cn("overflow-hidden rounded-xl border border-border bg-surface transition-opacity", !m.kept && "opacity-50")}>
      <div className="relative aspect-video bg-surface-2">
        {playing && m.clipUrl ? (
          <video
            ref={vref}
            src={m.clipUrl}
            autoPlay
            playsInline
            controls
            className="size-full object-contain"
            onLoadedMetadata={(e) => (e.currentTarget.currentTime = offIn)}
            onTimeUpdate={(e) => {
              if (e.currentTarget.currentTime >= offOut) {
                e.currentTarget.pause();
                e.currentTarget.currentTime = offIn;
              }
            }}
          />
        ) : (
          <button className="group absolute inset-0" onClick={() => setPlaying(true)} disabled={!m.clipUrl} aria-label="Play moment">
            {m.thumbUrl ? <img src={m.thumbUrl} alt="" className="size-full object-cover" loading="lazy" /> : <div className="grid size-full place-items-center text-muted-foreground"><Film /></div>}
            {m.clipUrl && (
              <span className="absolute inset-0 grid place-items-center bg-background/0 transition group-hover:bg-background/30">
                <span className="grid size-12 place-items-center rounded-full bg-primary/90 text-primary-foreground opacity-90 shadow-[0_0_24px_var(--glow)]">▶</span>
              </span>
            )}
          </button>
        )}
        <span className="absolute left-2 top-2 rounded-md bg-background/80 px-2 py-0.5 font-mono text-xs">
          {mss(clipIn(m))}–{mss(clipOut(m))}
        </span>
        <span className="absolute right-2 top-2 rounded-md bg-background/80 px-2 py-0.5 font-mono text-xs font-bold text-primary">{m.score}</span>
      </div>
      <div className="space-y-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <CategoryBadge category={m.category} label={m.label} />
          {m.source === "scan" && <Badge className="text-muted-foreground">Not checked by AI</Badge>}
          {trimmed && <Badge className="text-muted-foreground">Trimmed</Badge>}
          {m.synced === false && <Badge className="text-warning">Not uploaded yet</Badge>}
        </div>
        <p className="text-sm leading-snug">{m.reason}</p>
        <div className="no-print flex flex-wrap gap-2">
          <Button size="sm" variant={m.kept ? "secondary" : "default"} onClick={() => actions.setKept(m, !m.kept)}>
            {m.kept ? <><X /> Skip</> : <><Check /> Keep</>}
          </Button>
          <Button size="sm" variant="secondary" onClick={onTrim} disabled={!m.clipUrl}>
            <Scissors /> Trim
          </Button>
          {actions.download && (
            <Button size="sm" variant="secondary" onClick={() => actions.download!(m)} disabled={!m.clipUrl && !m.clipPath}>
              <Download /> MP4
            </Button>
          )}
          {actions.showInFolder && m.clipPath && (
            <Button size="sm" variant="ghost" onClick={() => actions.showInFolder!(m)} aria-label="Show in folder">
              <FolderOpen />
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

function TrimDialog({ m, onClose, onSave }: { m: BoardMoment; onClose(): void; onSave(a: number | null, b: number | null): void }) {
  const len = m.end - m.start;
  const [a, setA] = useState(clipIn(m) - m.start);
  const [b, setB] = useState(clipOut(m) - m.start);
  const vref = useRef<HTMLVideoElement>(null);
  const seek = (t: number) => {
    if (vref.current) vref.current.currentTime = t;
  };
  const nudge = (which: "a" | "b", d: number) => {
    if (which === "a") {
      const v = clamp(round1(a + d), 0, b - 1);
      setA(v);
      seek(v);
    } else {
      const v = clamp(round1(b + d), a + 1, len);
      setB(v);
      seek(v);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogTitle>Trim this moment</DialogTitle>
        <DialogDescription>Set where the clip starts and ends. Exports and the clip log use these points.</DialogDescription>
        <video ref={vref} src={m.clipUrl ?? undefined} controls playsInline className="mt-4 aspect-video w-full rounded-lg bg-surface-2" onLoadedMetadata={() => seek(a)} />
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <TrimControl label="Start" value={a} onNudge={(d) => nudge("a", d)} onSetHere={() => vref.current && setA(clamp(round1(vref.current.currentTime), 0, b - 1))} />
          <TrimControl label="End" value={b} onNudge={(d) => nudge("b", d)} onSetHere={() => vref.current && setB(clamp(round1(vref.current.currentTime), a + 1, len))} />
        </div>
        <p className="mt-3 font-mono text-sm text-muted-foreground">
          {mss(m.start + a)} to {mss(m.start + b)} · {(b - a).toFixed(1)}s
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onSave(null, null)}>Reset</Button>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave(round1(m.start + a), round1(m.start + b))}>Save trim</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TrimControl({ label, value, onNudge, onSetHere }: { label: string; value: number; onNudge(d: number): void; onSetHere(): void }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono">+{value.toFixed(1)}s</span>
      </div>
      <div className="mt-2 flex gap-2">
        <Button size="sm" variant="secondary" onClick={() => onNudge(-0.5)}>−0.5s</Button>
        <Button size="sm" variant="secondary" onClick={() => onNudge(0.5)}>+0.5s</Button>
        <Button size="sm" variant="ghost" onClick={onSetHere}>Use playhead</Button>
      </div>
    </div>
  );
}

function ExportMenu({ disabled, onEdl, onFcp, onOtio }: { disabled: boolean; onEdl(): void; onFcp(): void; onOtio(): void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Button variant="secondary" size="sm" disabled={disabled} onClick={() => setOpen(!open)}>
        <Film /> For editors
      </Button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-60 rounded-lg border border-border bg-popover p-1 shadow-xl" onMouseLeave={() => setOpen(false)}>
          {[
            ["Premiere / Resolve (EDL)", onEdl],
            ["Final Cut Pro (FCPXML)", onFcp],
            ["Other editors (OTIO)", onOtio],
          ].map(([l, f]) => (
            <button key={l as string} className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-surface-3" onClick={() => { (f as () => void)(); setOpen(false); }}>
              {l as string}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-mono text-2xl font-bold tabular">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function FilterChip({ active, className, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { active: boolean }) {
  return (
    <button
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-semibold transition",
        active ? "border-primary/50 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground",
        className,
      )}
      {...p}
    />
  );
}

function fmtDuration(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m ${s % 60}s`;
}
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round1 = (v: number) => Math.round(v * 10) / 10;
