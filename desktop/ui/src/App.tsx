import { Radio, Settings as Cog } from "lucide-react";
import { Toaster } from "sonner";
import { Logo } from "@/components/Logo";
import { Footer } from "@/components/Footer";
import { useRoute } from "@/lib/router";
import { Home } from "@/pages/Home";
import { Match } from "@/pages/Match";
import { Settings } from "@/pages/Settings";
import { cn } from "@/lib/utils";

export function App() {
  const r = useRoute();
  const link = (href: string, label: string, Icon: typeof Radio, active: boolean) => (
    <a href={href} className={cn("flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-surface-3", active ? "bg-surface-3 text-foreground" : "text-muted-foreground")}>
      <Icon className="size-4" /> {label}
    </a>
  );
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="no-print sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <a href="#/"><Logo /></a>
          <nav className="ml-4 flex items-center gap-1">
            {link("#/", "Catch", Radio, r.page !== "settings")}
            {link("#/settings", "Settings", Cog, r.page === "settings")}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-8">
        {r.page === "match" ? <Match id={r.id} /> : r.page === "settings" ? <Settings /> : <Home />}
      </main>
      <Footer />
      <Toaster theme="dark" position="top-center" richColors />
    </div>
  );
}
