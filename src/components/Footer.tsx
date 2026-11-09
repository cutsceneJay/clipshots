import { Link } from "@tanstack/react-router";

export function Footer() {
  return (
    <footer className="no-print mt-16 border-t border-border/60 px-4 py-8 text-sm text-muted-foreground">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span>© 2020 Cutscene Creative · <a className="hover:text-foreground" href="mailto:info@cutscenecreative.com">info@cutscenecreative.com</a></span>
        <nav className="flex flex-wrap gap-4">
          <Link to="/legal/$page" params={{ page: "terms" }} className="hover:text-foreground">Terms</Link>
          <Link to="/legal/$page" params={{ page: "privacy" }} className="hover:text-foreground">Privacy</Link>
          <Link to="/legal/$page" params={{ page: "licensing" }} className="hover:text-foreground">Licensing</Link>
          <Link to="/legal/$page" params={{ page: "contact" }} className="hover:text-foreground">Contact</Link>
        </nav>
      </div>
    </footer>
  );
}
