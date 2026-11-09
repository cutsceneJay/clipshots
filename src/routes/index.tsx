import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Radio, ListChecks, FileSpreadsheet, Zap } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/useSession";
import { desktop } from "@/lib/desktop";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const { user, loading } = useSession();
  const nav = useNavigate();
  useEffect(() => {
    if (loading) return;
    if (user) nav({ to: "/events", replace: true });
    else if (desktop()) nav({ to: "/catch", replace: true });
  }, [user, loading, nav]);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5">
        <Logo />
        <Button asChild variant="secondary" size="sm"><Link to="/auth">Sign in</Link></Button>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4">
        <section className="py-16 sm:py-24">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary">For esports broadcasts</p>
          <h1 className="mt-4 max-w-3xl text-4xl font-extrabold leading-tight sm:text-6xl">
            Every big play, clipped and sorted while the show is live.
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
            Clipshots watches the broadcast so your producer doesn't have to. Clutches, multi-kills, objectives and crowd pops are grabbed seconds after they happen, labelled, and laid out in a report your whole team can follow.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg"><Link to="/auth">Get started</Link></Button>
            <Button asChild size="lg" variant="secondary"><Link to="/download">Desktop app</Link></Button>
          </div>
        </section>
        <section className="grid gap-4 pb-8 sm:grid-cols-2 lg:grid-cols-4">
          {[
            [Radio, "Any feed", "A Twitch or YouTube link, the OBS recording, or an SRT/RTMP program feed. Past VODs and social posts too."],
            [Zap, "Seconds, not minutes", "Each moment becomes a ready-to-post MP4 a few seconds after it airs."],
            [ListChecks, "Sorted for you", "Multi-kills, clutches, objectives, team fights, caster hype and crowd moments, tuned per game."],
            [FileSpreadsheet, "A real report", "A live board during the match, a summary after, a clip log for the team and markers for editors."],
          ].map(([Icon, t, b]: any) => (
            <div key={t} className="rounded-xl border border-border bg-surface/80 p-5">
              <Icon className="size-5 text-primary" />
              <h3 className="mt-3 font-semibold">{t}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{b}</p>
            </div>
          ))}
        </section>
      </main>
      <Footer />
    </div>
  );
}
