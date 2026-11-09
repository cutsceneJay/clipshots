import type { Category } from "@/lib/detect/categories";
import { cn } from "@/lib/utils";

export const CATEGORY_STYLE: Record<Category, string> = {
  "Multi-kill": "text-cat-multikill border-cat-multikill/40 bg-cat-multikill/10",
  Clutch: "text-cat-clutch border-cat-clutch/40 bg-cat-clutch/10",
  Objective: "text-cat-objective border-cat-objective/40 bg-cat-objective/10",
  "Team fight": "text-cat-teamfight border-cat-teamfight/40 bg-cat-teamfight/10",
  Outplay: "text-cat-outplay border-cat-outplay/40 bg-cat-outplay/10",
  "Caster hype": "text-cat-hype border-cat-hype/40 bg-cat-hype/10",
  Crowd: "text-cat-crowd border-cat-crowd/40 bg-cat-crowd/10",
  Replay: "text-cat-replay border-cat-replay/40 bg-cat-replay/10",
  Fail: "text-cat-fail border-cat-fail/40 bg-cat-fail/10",
  Action: "text-cat-action border-cat-action/40 bg-cat-action/10",
};

export function CategoryBadge({ category, label, className }: { category: Category; label?: string | null; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold", CATEGORY_STYLE[category], className)}>
      {label ?? category}
    </span>
  );
}
