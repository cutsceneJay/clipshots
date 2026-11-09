import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { desktop } from "@/lib/desktop";

export const Route = createFileRoute("/_app/settings")({ component: Settings });

interface Note { id: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string }

function Settings() {
  const { user } = useSession();
  const [notes, setNotes] = useState<Note[]>([]);
  const load = () => supabase!.from("notifications").select("*").order("created_at", { ascending: false }).limit(50).then(({ data }) => setNotes(data ?? []));
  useEffect(() => { load(); }, []);
  const d = desktop();
  const google = user?.identities?.some((i) => i.provider === "google");

  return (
    <div className="max-w-2xl space-y-8">
      <h1 className="text-2xl font-bold">Settings</h1>
      <section className="space-y-2 rounded-xl border border-border bg-surface p-5">
        <h2 className="font-semibold">Account</h2>
        <p className="text-sm text-muted-foreground">Signed in as {user?.email}</p>
        <p className="text-sm text-muted-foreground">Plan: Private beta</p>
        <p className="text-sm text-muted-foreground">Google: {google ? "Connected" : "Not connected"}</p>
      </section>
      <section className="space-y-2 rounded-xl border border-border bg-surface p-5">
        <h2 className="font-semibold">Desktop app</h2>
        <p className="text-sm text-muted-foreground">{d ? `Running Clipshots ${d.version} on this computer.` : "Not running in the desktop app."}</p>
      </section>
      <section id="notifications" className="space-y-3 rounded-xl border border-border bg-surface p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Notifications</h2>
          {notes.some((n) => !n.read_at) && (
            <Button size="sm" variant="secondary" onClick={async () => { await supabase!.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null); load(); }}>Mark all read</Button>
          )}
        </div>
        {notes.length === 0 ? <p className="text-sm text-muted-foreground">Nothing yet.</p> : (
          <ul className="space-y-2">
            {notes.map((n) => (
              <li key={n.id} className="rounded-lg border border-border p-3 text-sm">
                <div className="flex items-center gap-2">{!n.read_at && <span className="size-2 rounded-full bg-primary" />}<span className="font-medium">{n.title}</span></div>
                {n.body && <p className="text-muted-foreground">{n.body}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
