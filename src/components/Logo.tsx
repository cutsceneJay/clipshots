import { cn } from "@/lib/utils";

/** Reticle with a teal play triangle + "Clipshots" wordmark. The triangle always stays visible. */
export function Logo({ tone = "default", className, mark = false }: { tone?: "default" | "light" | "mono"; className?: string; mark?: boolean }) {
  const ring = tone === "mono" ? "text-muted-foreground" : "text-foreground";
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <svg viewBox="0 0 32 32" className="size-7 shrink-0" aria-hidden>
        <g className={ring} stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round">
          <circle cx="16" cy="16" r="11" opacity="0.9" />
          <path d="M16 1.5v5M16 25.5v5M1.5 16h5M25.5 16h5" />
        </g>
        {/* Play triangle: always the accent, never dimmed by tone. */}
        <path d="M13 10.5 22 16l-9 5.5z" className="fill-primary" />
      </svg>
      {!mark && (
        <span className={cn("font-display text-lg font-extrabold tracking-wider", tone === "mono" ? "text-muted-foreground" : "text-foreground")}>
          CLIP<span className="text-primary">SHOTS</span>
        </span>
      )}
    </span>
  );
}
