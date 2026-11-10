import { useEffect, useState } from "react";
import { FolderOpen, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { desktop, type AiStatus } from "@/lib/desktop";

export function Settings() {
  const d = desktop();
  const [ai, setAi] = useState<AiStatus | null>(null);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [lib, setLib] = useState("");
  useEffect(() => {
    d.getAi().then(setAi);
    d.libraryPath().then(setLib);
  }, []);

  async function save() {
    if (!key.trim()) return;
    setBusy(true);
    setAi(await d.setAiKey(key.trim()));
    setKey("");
    const r = await d.testAi();
    setBusy(false);
    if (r.ok) toast.success("AI labels are on");
    else toast.error(r.message);
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <section className="space-y-3 rounded-xl border border-border bg-surface p-5">
        <h2 className="flex items-center gap-2 font-semibold"><KeyRound className="size-4 text-primary" /> AI labels</h2>
        <p className="text-sm text-muted-foreground">
          Clipshots uses Google's Gemini to check each caught moment and name it (Clutch, Ace, Baron steal). It sends a few still frames per moment, never the full video. Get a free key at{" "}
          <button className="text-primary hover:underline" onClick={() => d.openExternal("https://aistudio.google.com/apikey")}>aistudio.google.com/apikey</button>, then paste it here.
        </p>
        {ai?.hasKey ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary">Key saved{ai.encrypted ? " and encrypted on this computer" : ""}</span>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const r = await d.testAi();
                setBusy(false);
                r.ok ? toast.success(r.message) : toast.error(r.message);
              }}
            >
              Test it
            </Button>
            <Button variant="ghost" onClick={async () => setAi(await d.setAiKey(null))}>Remove</Button>
          </div>
        ) : (
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <Input type="password" autoComplete="off" placeholder="Paste your Google AI key" value={key} onChange={(e) => setKey(e.target.value)} aria-label="Google AI key" />
            <Button type="submit" disabled={busy || !key.trim()}>Save</Button>
          </form>
        )}
        <p className="text-xs text-muted-foreground">Without a key, moments are still caught and saved, marked "Not checked by AI".</p>
      </section>

      <section className="space-y-3 rounded-xl border border-border bg-surface p-5">
        <h2 className="font-semibold">Where clips are saved</h2>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <span className="min-w-0 flex-1 truncate rounded-md border border-border bg-surface-2 px-3 py-2 font-mono text-sm">{lib}</span>
          <Button variant="secondary" onClick={() => d.openLibrary()}><FolderOpen /> Open</Button>
        </div>
      </section>

      <section className="space-y-2 rounded-xl border border-border bg-surface p-5 text-sm text-muted-foreground">
        <h2 className="font-semibold text-foreground">About</h2>
        <p>Clipshots {d.version} by Cutscene Creative.</p>
        <p>Everything stays on this computer. Only the still frames used for AI labels are sent to Google, and only when a key is saved.</p>
        <p>You need the right to record and clip any broadcast you bring into Clipshots. Footage belongs to its rights holders.</p>
        <p>Built with FFmpeg (LGPL/GPL) and yt-dlp (Unlicense).</p>
      </section>
    </div>
  );
}
