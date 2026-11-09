import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Radio, Link2, History, HardDrive, FileVideo, Cable } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GAME_PROFILES } from "@/lib/detect/categories";
import { desktop, type SourceKind } from "@/lib/desktop";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const SOURCES: { kind: SourceKind; title: string; hint: string; icon: typeof Radio; placeholder?: string }[] = [
  { kind: "url", title: "Live stream link", hint: "A Twitch or YouTube broadcast that's live now.", icon: Radio, placeholder: "https://twitch.tv/yourchannel" },
  { kind: "vod", title: "Past video link", hint: "A YouTube or Twitch VOD, or a post from X, TikTok or Instagram. Downloaded, then scanned at full speed.", icon: History, placeholder: "https://youtube.com/watch?v=..." },
  { kind: "file", title: "Recording in progress", hint: "The file OBS or vMix is recording right now. Record to MKV, not MP4.", icon: HardDrive },
  { kind: "recording", title: "Finished file", hint: "A recording already on this computer. Scanned at full speed.", icon: FileVideo },
  { kind: "srt", title: "SRT feed", hint: "Send the program feed to this computer over SRT.", icon: Cable, placeholder: "9000" },
  { kind: "rtmp", title: "RTMP feed", hint: "Point an RTMP output at this computer.", icon: Link2, placeholder: "1935" },
];

export function StartCatching({ cloudEvent, defaultEventName = "", defaultGame = "generic" }: { cloudEvent?: { id: string; name: string; game: string } | null; defaultEventName?: string; defaultGame?: string }) {
  const nav = useNavigate();
  const d = desktop();
  const [kind, setKind] = useState<SourceKind>("url");
  const [value, setValue] = useState("");
  const [eventName, setEventName] = useState(cloudEvent?.name ?? defaultEventName);
  const [matchName, setMatchName] = useState("");
  const [game, setGame] = useState(cloudEvent?.game ?? defaultGame);
  const [context, setContext] = useState("");
  const [busy, setBusy] = useState(false);
  const src = SOURCES.find((s) => s.kind === kind)!;
  const needsFile = kind === "file" || kind === "recording";

  if (!d) {
    return (
      <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
        Catching runs in the Clipshots desktop app on your production computer, so it can watch the feed without a browser tab open. Everyone else can follow the live board right here.
      </div>
    );
  }

  async function go() {
    if (!d) return;
    const v = kind === "srt" || kind === "rtmp" ? value || src.placeholder! : value.trim();
    if (!v) return toast.error(needsFile ? "Pick a file first." : "Paste a link first.");
    if ((kind === "url" || kind === "vod") && !/^https?:\/\//i.test(v)) return toast.error("That doesn't look like a link.");
    setBusy(true);
    try {
      const name = matchName.trim() || `Match ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
      let cloud: { eventId: string; matchId: string } | null = null;
      if (cloudEvent && supabase) {
        const { data, error } = await supabase
          .from("matches")
          .insert({ event_id: cloudEvent.id, name, source_kind: kind, source_label: needsFile ? v.split(/[\\/]/).pop() : v })
          .select("id")
          .single();
        if (error) throw new Error("Couldn't create the match online. Catching locally instead.");
        cloud = { eventId: cloudEvent.id, matchId: data.id };
      }
      const { sessionId } = await d.start({ eventName: eventName || "Untitled event", matchName: name, game, context, source: { kind, value: v }, cloud });
      nav({ to: "/catch/$sessionId", params: { sessionId } });
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't start.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {SOURCES.map((s) => (
          <button
            key={s.kind}
            onClick={() => {
              setKind(s.kind);
              setValue("");
            }}
            className={cn(
              "flex flex-col items-start gap-1 rounded-lg border p-3 text-left text-sm transition",
              kind === s.kind ? "border-primary/60 bg-primary/10" : "border-border hover:bg-surface-3",
            )}
          >
            <s.icon className={cn("size-4", kind === s.kind ? "text-primary" : "text-muted-foreground")} />
            <span className="font-semibold">{s.title}</span>
          </button>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">{src.hint}</p>

      <div className="space-y-2">
        <Label htmlFor="src">{needsFile ? "File" : kind === "srt" || kind === "rtmp" ? "Port" : "Link"}</Label>
        <div className="flex gap-2">
          <Input id="src" value={value} placeholder={src.placeholder ?? "Pick a file"} readOnly={needsFile} onChange={(e) => setValue(e.target.value)} />
          {needsFile && (
            <Button variant="secondary" onClick={async () => setValue((await d.pickFile()) ?? value)}>
              Choose
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {!cloudEvent && (
          <div className="space-y-2">
            <Label htmlFor="ev">Event</Label>
            <Input id="ev" value={eventName} placeholder="Masters Toronto, Day 3" onChange={(e) => setEventName(e.target.value)} />
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="mn">Match</Label>
          <Input id="mn" value={matchName} placeholder="TL vs G2, Map 2" onChange={(e) => setMatchName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="gm">Game</Label>
          <Select id="gm" value={game} onChange={(e) => setGame(e.target.value)} disabled={!!cloudEvent}>
            {Object.values(GAME_PROFILES).map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="cx">Notes for the AI (optional)</Label>
          <Input id="cx" value={context} placeholder="Grand final, best of 5" onChange={(e) => setContext(e.target.value)} />
        </div>
      </div>

      <Button size="lg" onClick={go} disabled={busy} className="w-full sm:w-auto">
        {kind === "vod" || kind === "recording" ? "Scan this video" : "Start catching"}
      </Button>
    </div>
  );
}
