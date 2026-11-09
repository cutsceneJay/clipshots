import { createFileRoute, Link, Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bell, Menu, Radio, CalendarDays, Settings, LogOut } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useSession } from "@/hooks/useSession";
import { supabase } from "@/integrations/supabase/client";
import { desktop } from "@/lib/desktop";
import { cn } from "@/lib/utils";

// App pages need the browser to run (sessions live in the browser), so no SSR.
export const Route = createFileRoute("/_app")({ ssr: false, component: AppLayout });

function AppLayout() {
  const { user, loading } = useSession();
  const nav = useNavigate();
  const loc = useLocation();
  const isDesktop = !!desktop();
  const [menu, setMenu] = useState(false);
  const [unread, setUnread] = useState(0);

  // Signed-out people go to sign in. The desktop app can catch without an account.
  const localOk = isDesktop && loc.pathname.startsWith("/catch");
  useEffect(() => {
    if (!loading && !user && !localOk) nav({ to: "/auth", replace: true });
  }, [loading, user, localOk, nav]);

  useEffect(() => {
    if (!user || !supabase) return;
    const load = () => supabase!.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null).then(({ count }) => setUnread(count ?? 0));
    load();
    const ch = supabase.channel("notif").on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, load).subscribe();
    return () => {
      supabase!.removeChannel(ch);
    };
  }, [user]);

  if (loading || (!user && !localOk)) return <div className="grid min-h-dvh place-items-center text-muted-foreground">Loading…</div>;

  const links = [
    { to: "/events", label: "Events", icon: CalendarDays, show: !!user },
    { to: "/catch", label: "Catch", icon: Radio, show: true },
    { to: "/settings", label: "Settings", icon: Settings, show: !!user },
  ].filter((l) => l.show);
  const NavLinks = ({ onClick }: { onClick?: () => void }) => (
    <>
      {links.map((l) => (
        <Link key={l.to} to={l.to} onClick={onClick} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-surface-3 hover:text-foreground [&.active]:text-foreground [&.active]:bg-surface-3">
          <l.icon className="size-4" /> {l.label}
        </Link>
      ))}
    </>
  );

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="no-print sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <Link to={user ? "/events" : "/catch"}><Logo /></Link>
          <nav className="ml-4 hidden items-center gap-1 sm:flex"><NavLinks /></nav>
          <span className="flex-1" />
          {user && (
            <Link to="/settings" hash="notifications" className="relative rounded-md p-2 hover:bg-surface-3" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}>
              <Bell className="size-5" />
              {unread > 0 && <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">{unread}</span>}
            </Link>
          )}
          {!user && supabase && <Button asChild size="sm" variant="secondary"><Link to="/auth">Sign in</Link></Button>}
          {user && (
            <Button variant="ghost" size="icon" className="hidden sm:inline-flex" onClick={() => supabase!.auth.signOut()} aria-label="Sign out">
              <LogOut className="size-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="sm:hidden" onClick={() => setMenu(true)} aria-label="Menu"><Menu /></Button>
        </div>
      </header>
      <Dialog open={menu} onOpenChange={setMenu}>
        <DialogContent side="right">
          <DialogTitle className="mb-4"><Logo /></DialogTitle>
          <nav className="flex flex-col gap-1"><NavLinks onClick={() => setMenu(false)} /></nav>
          {user && <Button variant="ghost" className="mt-4 w-full justify-start" onClick={() => supabase!.auth.signOut()}><LogOut /> Sign out</Button>}
        </DialogContent>
      </Dialog>
      <main className={cn("mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-8")}>
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
