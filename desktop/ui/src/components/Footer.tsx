import { desktop } from "@/lib/desktop";

export function Footer() {
  return (
    <footer className="no-print mt-16 border-t border-border/60 px-4 py-6 text-sm text-muted-foreground">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span>© 2020 Cutscene Creative</span>
        <button className="text-left hover:text-foreground" onClick={() => desktop().openExternal("mailto:info@cutscenecreative.com")}>
          info@cutscenecreative.com
        </button>
      </div>
    </footer>
  );
}
