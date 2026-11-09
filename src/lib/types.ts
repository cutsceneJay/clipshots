import type { Category } from "@/lib/detect/categories";

/** One caught moment as the board shows it, whether it lives on this PC or in the cloud. */
export interface BoardMoment {
  id: string;
  start: number;
  end: number;
  peak: number;
  trimStart: number | null;
  trimEnd: number | null;
  peakAt: string | null;
  score: number;
  scanScore: number;
  aiScore: number | null;
  category: Category;
  label: string | null;
  reason: string;
  kept: boolean;
  source: "ai" | "scan";
  /** Playable URL for the clip file, if any. */
  clipUrl: string | null;
  thumbUrl: string | null;
  /** Local path on this PC (desktop only). */
  clipPath?: string | null;
  latencySec?: number | null;
  synced?: boolean;
}

export interface BoardMatch {
  id: string;
  name: string;
  eventName?: string;
  game: string;
  sourceKind: string;
  sourceLabel?: string | null;
  status: "live" | "ended" | "failed";
  startedAt: string;
  endedAt: string | null;
  /** Seconds of footage, when known (scanned recordings). */
  durationSec?: number | null;
}

export function clipIn(m: BoardMoment) {
  return m.trimStart ?? m.start;
}
export function clipOut(m: BoardMoment) {
  return m.trimEnd ?? m.end;
}
