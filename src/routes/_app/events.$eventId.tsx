import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronRight, UserPlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { StartCatching } from "@/components/StartCatching";
import { supabase } from "@/integrations/supabase/client";
import { profileFor } from "@/lib/detect/categories";
import { useSession } from "@/hooks/useSession";

export const Route = createFileRoute("/_app/events/$eventId")({ component: EventPage });

interface Ev { id: string; name: string; game: string; owner_id: string }
interface Match { id: string; name: string; status: string; started_at: string; source_kind: string; moments: { count: number }[] }
interface Member { id: string; email: string; role: string; status: string }

function EventPage() {
  const { eventId } = Route.useParams();
  const { user } = useSession();
  const [ev, setEv] = useState<Ev | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [missing, setMissing] = useState(false);

  const load = async () => {
    const e = await supabase!.from("events").select("id,name,game,owner_id").eq("id", eventId).maybeSingle();
    if (!e.data) return setMissing(true);
    setEv(e.data);
    const m = await supabase!.from("matches").select("id,name,status,started_at,source_kind,moments(count)").eq("event_id", eventId).order("started_at", { ascending: false });
    setMatches((m.data as Match[]) ?? []);
    const mem = await supabase!.from("event_members").select("id,email,role,status").eq("event_id", eventId).order("created_at");
    setMembers(mem.data ?? []);
  };
  useEffect(() => {
    load();
    const ch = supabase!.channel(`ev-${eventId}`).on("postgres_changes", { event: "*", schema: "public", table: "matches", filter: `event_id=eq.${eventId}` }, load).subscribe();
    return () => { supabase!.removeChannel(ch); };
  }, [eventId]);

  if (missing) return <p className="text-muted-foreground">This event doesn't exist or you don't have access.</p>;
  if (!ev) return <p className="text-muted-foreground">Loading…</p>;
  const owner = user?.id === ev.owner_id;

  return (
    <div className="space-y-8">
      <div>
        <Link to="/events" className="text-sm text-muted-foreground hover:text-foreground">← Events</Link>
        <h1 className="mt-2 text-2xl font-bold">{ev.name}</h1>
        <p className="text-sm text-muted-foreground">{profileFor(ev.game).name}</p>
      </div>

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="mb-4 font-semibold">Catch a match</h2>
        <StartCatching cloudEvent={ev} />
      </section>

      <section>
        <h2 className="mb-3 font-semibold">Matches</h2>
        {matches.length === 0 ? (
          <p className="text-sm text-muted-foreground">No matches yet.</p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
            {matches.map((m) => (
              <li key={m.id}>
                <Link to="/matches/$matchId" params={{ matchId: m.id }} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-3">
                  {m.status === "live" ? <span className="size-2 animate-live rounded-full bg-live" /> : <span className="size-2 rounded-full bg-muted-foreground/40" />}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{m.name}</div>
                    <div className="text-sm text-muted-foreground">{new Date(m.started_at).toLocaleString()} · {m.moments?.[0]?.count ?? 0} moments</div>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-semibold">Team</h2>
        <p className="mb-3 text-sm text-muted-foreground">People you invite can follow the live board and reports. Editors can also keep, skip and trim moments.</p>
        {owner && <Invite eventId={eventId} onDone={load} />}
        <ul className="mt-3 space-y-2">
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
              <span className="flex-1 truncate">{m.email}</span>
              <Badge>{m.role === "editor" ? "Editor" : "Viewer"}</Badge>
              {m.status === "invited" && <Badge className="text-muted-foreground">Invited</Badge>}
              {m.status === "invited" && user?.email?.toLowerCase() === m.email && (
                <Button size="sm" onClick={async () => { await supabase!.from("event_members").update({ status: "accepted" }).eq("id", m.id); load(); }}>Accept</Button>
              )}
              {owner && (
                <Button size="icon" variant="ghost" aria-label="Remove" onClick={async () => { await supabase!.from("event_members").delete().eq("id", m.id); load(); }}>
                  <Trash2 className="size-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Invite({ eventId, onDone }: { eventId: string; onDone(): void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("viewer");
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row"
      onSubmit={async (e) => {
        e.preventDefault();
        const { error } = await supabase!.from("event_members").insert({ event_id: eventId, email: email.trim().toLowerCase(), role });
        if (error) return toast.error(error.code === "23505" ? "Already invited." : "Couldn't send the invite.");
        toast.success("Invited. They'll see the event after they sign in and accept.");
        setEmail("");
        onDone();
      }}
    >
      <Input type="email" required placeholder="teammate@studio.com" value={email} onChange={(e) => setEmail(e.target.value)} />
      <Select value={role} onChange={(e) => setRole(e.target.value)} className="sm:w-36">
        <option value="viewer">Viewer</option>
        <option value="editor">Editor</option>
      </Select>
      <Button type="submit"><UserPlus /> Invite</Button>
    </form>
  );
}
