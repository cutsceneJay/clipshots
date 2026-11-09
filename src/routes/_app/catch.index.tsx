import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronRight, Download, FolderSearch } from "lucide-react";
import { Select } from "@/components/ui/input";
import { GAME_PROFILES } from "@/lib/detect/categories";
import { Button } from "@/components/ui/button";
import { StartCatching } from "@/components/StartCatching";
import { desktop, type LocalSession } from "@/lib/desktop";

export const Route = createFileRoute("/_app/catch/")({ component: CatchHome });

function CatchHome() {
  const d = desktop();
  const [sessions, setSessions] = useState<LocalSession[]>([]);
  useEffect(() => {
    if (!d) return;
    const load = () => d.sessions().then(setSessions);
    load();
    return d.onEvent((e) => (e.type === "moment" || e.type === "ended") && load());
  }, []);

  if (!d)
    return (
      <div className="mx-auto max-w-xl space-y-4 py-10 text-center">
        <h1 className="text-2xl font-bold">Catching runs in the desktop app</h1>
        <p className="text-muted-foreground">Install Clipshots on the production computer. It watches the feed, cuts the clips and sends them here for the rest of the team.</p>
        <Button asChild><Link to="/download"><Download /> Get the desktop app</Link></Button>
      </div>
    );

  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-border bg-surface p-5">
        <h1 className="mb-1 text-2xl font-bold">Catch a match</h1>
        <p className="mb-5 text-sm text-muted-foreground">Clips are saved on this computer. To share a live board with your team, start from an event instead.</p>
        <StartCatching />
      </section>
      <AutoCatch />
      <section>
        <h2 className="mb-3 font-semibold">On this computer</h2>
        {sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing caught yet.</p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
            {sessions.map((s) => (
              <li key={s.id}>
                <Link to="/catch/$sessionId" params={{ sessionId: s.id }} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-3">
                  {s.status === "live" ? <span className="size-2 animate-live rounded-full bg-live" /> : <span className="size-2 rounded-full bg-muted-foreground/40" />}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{s.matchName}</div>
                    <div className="truncate text-sm text-muted-foreground">{s.eventName} · {new Date(s.startedAt).toLocaleString()} · {s.moments.filter((m) => m.kept).length} moments</div>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function AutoCatch() {
  const d = desktop()!;
  const [w, setW] = useState<{ folder: string | null; game: string } | null>(null);
  useEffect(() => {
    d.getWatch().then(setW);
  }, []);
  if (!w) return null;
  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <h2 className="flex items-center gap-2 font-semibold"><FolderSearch className="size-4 text-primary" /> Auto-catch new recordings</h2>
      <p className="mt-1 text-sm text-muted-foreground">Point this at your OBS, ShadowPlay or Xbox Game Bar recordings folder. When a new recording starts, Clipshots starts catching it on its own.</p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <span className="min-w-0 flex-1 truncate rounded-md border border-border bg-surface-2 px-3 py-2 text-sm">{w.folder ?? "Off"}</span>
        <Select className="sm:w-48" value={w.game} onChange={async (e) => setW(await d.setWatch(w.folder, e.target.value))}>
          {Object.values(GAME_PROFILES).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </Select>
        <Button variant="secondary" onClick={async () => setW(await d.setWatch("pick"))}>Choose folder</Button>
        {w.folder && <Button variant="ghost" onClick={async () => setW(await d.setWatch(null))}>Turn off</Button>}
      </div>
    </section>
  );
}
