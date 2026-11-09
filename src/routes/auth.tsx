import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";

export const Route = createFileRoute("/auth")({ component: Auth });

function Auth() {
  const { user } = useSession();
  const nav = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (user) nav({ to: "/events", replace: true });
  }, [user, nav]);

  if (!supabase)
    return (
      <Shell>
        <p className="text-sm text-muted-foreground">Sign-in isn't switched on yet. The cloud account still needs to be connected.</p>
      </Shell>
    );

  const google = () => supabase!.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${location.origin}/events` } });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r =
      mode === "in"
        ? await supabase!.auth.signInWithPassword({ email, password })
        : await supabase!.auth.signUp({ email, password, options: { emailRedirectTo: `${location.origin}/events` } });
    setBusy(false);
    if (r.error) return toast.error(r.error.message.includes("Invalid") ? "That email and password don't match." : r.error.message);
    if (mode === "up" && !r.data.session) toast.success("Check your email to confirm your account.");
  }

  return (
    <Shell>
      <Button variant="secondary" className="w-full" onClick={google}>
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden><path fill="currentColor" d="M21.35 11.1H12v2.98h5.35c-.23 1.4-1.66 4.1-5.35 4.1a5.98 5.98 0 0 1 0-11.96c1.87 0 3.12.8 3.84 1.48l2.62-2.52C16.78 3.6 14.6 2.6 12 2.6a9.4 9.4 0 1 0 0 18.8c5.43 0 9.02-3.81 9.02-9.18 0-.62-.07-1.09-.17-1.56z"/></svg>
        Continue with Google
      </Button>
      <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" /></div>
      <form onSubmit={submit} className="space-y-3">
        <div className="space-y-1"><Label htmlFor="em">Email</Label><Input id="em" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="pw">Password</Label><Input id="pw" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        <Button className="w-full" disabled={busy} type="submit">{mode === "in" ? "Sign in" : "Create account"}</Button>
      </form>
      <button className="mt-4 text-sm text-muted-foreground hover:text-foreground" onClick={() => setMode(mode === "in" ? "up" : "in")}>
        {mode === "in" ? "New here? Create an account" : "Have an account? Sign in"}
      </button>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-6">
        <Logo className="mb-6" />
        {children}
      </div>
    </div>
  );
}
