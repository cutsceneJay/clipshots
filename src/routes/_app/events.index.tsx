import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { GAME_PROFILES, profileFor } from "@/lib/detect/categories";

export const Route = createFileRoute("/_app/events/")({ component: Events });

interface Ev { id: string; name: string; game: string; created_at: string; matches: { count: number }[] }

function Events() {
  const [events, setEvents] = useState<Ev[] | null>(null);
  const [open, setOpen] = useState(false);
  const load = () => supabase!.from("events").select("id,name,game,created_at,matches(count)").order("created_at", { ascending: false }).then(({ data, error }) => {
    if (error) toast.error("Couldn't load your events.");
    setEvents((data as Ev[]) ?? []);
  });
  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Events</h1>
          <p className="text-sm text-muted-foreground">A show or broadcast day. Each match you catch lives inside one.</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus /> New event</Button>
      </div>
      {events === null ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : events.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <p className="text-muted-foreground">No events yet.</p>
          <Button className="mt-4" onClick={() => setOpen(true)}><Plus /> Create your first event</Button>
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {events.map((e) => (
            <li key={e.id}>
              <Link to="/events/$eventId" params={{ eventId: e.id }} className="flex items-center gap-3 px-4 py-4 hover:bg-surface-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{e.name}</div>
                  <div className="text-sm text-muted-foreground">{profileFor(e.game).name} · {e.matches?.[0]?.count ?? 0} matches · {new Date(e.created_at).toLocaleDateString()}</div>
                </div>
                <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <NewEvent open={open} onOpenChange={setOpen} onCreated={load} />
    </div>
  );
}

function NewEvent({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange(o: boolean): void; onCreated(): void }) {
  const [name, setName] = useState("");
  const [game, setGame] = useState("generic");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>New event</DialogTitle>
        <DialogDescription>Pick the game so moments get the right labels.</DialogDescription>
        <form
          className="mt-4 space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const { error } = await supabase!.from("events").insert({ name: name.trim(), game });
            if (error) return toast.error("Couldn't create the event.");
            toast.success("Event created");
            setName("");
            onOpenChange(false);
            onCreated();
          }}
        >
          <div className="space-y-1"><Label htmlFor="n">Name</Label><Input id="n" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder="Masters Toronto, Day 3" /></div>
          <div className="space-y-1">
            <Label htmlFor="g">Game</Label>
            <Select id="g" value={game} onChange={(e) => setGame(e.target.value)}>
              {Object.values(GAME_PROFILES).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </Select>
          </div>
          <Button type="submit" className="w-full">Create event</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
