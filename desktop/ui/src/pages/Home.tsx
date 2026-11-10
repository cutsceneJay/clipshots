import { useEffect, useState } from "react";
import { ChevronRight, FolderSearch, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { StartCatching } from "@/components/StartCatching";
import { GAME_PROFILES } from "@/lib/detect/categories";
import { desktop, type AiStatus, type LocalSession } from "@/lib/desktop";
import { go } from "@/lib/router";

export function Home() {
  const d = desktop();
  const [sessions, setSessions] = useState<LocalSession[]>([]);
  const [ai, setAi] = useState<AiStatus | null>(null);
  useEffect(() => {
    const load = () => d.sessions().then(setSessions);
    load();
    d.getAi().then(setAi);
    return d.onEvent((e) => (e.type === "moment" || e.type === "ended") && load());
  }, []);

  return (
    <div className="space-y-8">
      {ai && !ai.hasKey && (
        <button onClick={() => go("/settings")} className="flex w-full items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 text-left text-sm hover:bg-primary/10">
          <Sparkles className="size-5 shrink-0 text-primary" />
          <span className="flex-1">
            <span className="font-semibold">Turn on AI labels.</span>{" "}
            <span className="text-muted-foreground">Without it, Clipshots still catches moments but can't name them (Clutch, Ace, Baron steal...). Add your free Google AI key in Settings.</span>
          </span>
          <ChevronRight className="size-4 text-muted-foreground" />
        </button>
      )}
      <section className="rounded-xl border border-border bg-surface p-5">
        <h1 className="mb-1 text-2xl font-bold">Catch a match</h1>
        <p className="mb-5 text-sm text-muted-foreground">Clips and reports are saved on this computer.</p>
        <StartCatching onStarted={(id) => go(`/match/${id}`)} />
      </section>
      <AutoCatch />
      <section>
        <h2 className="mb-3 font-semibold">Matches</h2>
        {sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing caught yet.</p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
            {sessions.map((s) => (
              <li key={s.id}>
                <a href={`#/match/${s.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-3">
                  {s.status === "live" ? <span className="size-2 animate-live rounded-full bg-live" /> : <span className="size-2 rounded-full bg-muted-foreground/40" />}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{s.matchName}</div>
                    <div className="truncate text-sm text-muted-foreground">
                      {s.eventName} · {new Date(s.startedAt).toLocaleString()} · {s.moments.filter((m) => m.kept).length} moments
                    </div>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function AutoCatch() {
  const d = desktop();
  const [w, setW] = useState<{ folder: string | null; game: string } | null>(null);
  useEffect(() => {
    d.getWatch().then(setW);
  }, []);
  if (!w) return null;
  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <h2 className="flex items-center gap-2 font-semibold">
        <FolderSearch className="size-4 text-primary" /> Auto-catch new recordings
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Point this at your OBS, ShadowPlay or Xbox Game Bar recordings folder. When a new recording starts, Clipshots starts catching it on its own.
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <span className="min-w-0 flex-1 truncate rounded-md border border-border bg-surface-2 px-3 py-2 text-sm">{w.folder ?? "Off"}</span>
        <Select className="sm:w-48" value={w.game} onChange={async (e) => setW(await d.setWatch(w.folder, e.target.value))} aria-label="Game for auto-catch">
          {Object.values(GAME_PROFILES).map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </Select>
        <Button variant="secondary" onClick={async () => setW(await d.setWatch("pick"))}>Choose folder</Button>
        {w.folder && <Button variant="ghost" onClick={async () => setW(await d.setWatch(null))}>Turn off</Button>}
      </div>
    </section>
  );
}
