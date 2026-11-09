// Combines a scan candidate with the AI's verdict. Pure and unit-tested.

import type { ScanCandidate } from "./scanner";
import { isCategory, profileFor, type Category } from "./categories";

export interface AiVerdict {
  keep: boolean;
  score: number; // 0..100
  category: string;
  label?: string;
  reason: string;
  start: number;
  end: number;
}

export interface Moment {
  id: string;
  start: number;
  end: number;
  peak: number;
  score: number;
  scanScore: number;
  aiScore: number | null;
  category: Category;
  label: string | null;
  reason: string;
  kept: boolean;
  source: "ai" | "scan";
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Merge one AI verdict into its candidate. Never trusts the AI's numbers blindly. */
export function mergeVerdict(c: ScanCandidate, v: AiVerdict, gameId?: string): Moment {
  const profile = profileFor(gameId);
  // Tightened window: within 3 s of the scan window, 3..15 s long, must contain the peak.
  let start = clamp(Number(v.start), c.start - 3, c.end + 3);
  let end = clamp(Number(v.end), c.start - 3, c.end + 3);
  if (!Number.isFinite(start)) start = c.start;
  if (!Number.isFinite(end)) end = c.end;
  if (end < start) [start, end] = [end, start];
  if (start > c.peak) start = Math.max(c.start - 3, c.peak - 1);
  if (end < c.peak) end = Math.min(c.end + 3, c.peak + 1);
  if (end - start > 15) {
    // Shrink around the peak.
    start = Math.max(start, c.peak - 10);
    end = start + 15;
  }
  if (end - start < 3) {
    const pad = (3 - (end - start)) / 2;
    start -= pad;
    end += pad;
  }
  start = Math.max(0, start);

  const ai = clamp(Math.round(Number(v.score) || 0), 0, 100);
  let score = Math.round(0.7 * ai + 0.3 * c.scanScore);
  if (!v.keep) score = Math.min(score, 45);

  const label = v.label && v.label in profile.labels ? v.label : null;
  const category: Category = label ? profile.labels[label] : isCategory(v.category) ? v.category : "Action";

  return {
    id: c.id,
    start: round2(start),
    end: round2(end),
    peak: c.peak,
    score,
    scanScore: c.scanScore,
    aiScore: ai,
    category,
    label,
    reason: plainReason(v.reason),
    kept: !!v.keep,
    source: "ai",
  };
}

/** When the AI is unavailable: the scan's own pick, labelled honestly. */
export function scanOnlyMoment(c: ScanCandidate): Moment {
  const { audio, visual, together, flashes, transients } = c.cues;
  let reason: string;
  if (together) reason = "Picture and sound spike together";
  else if (audio > visual) reason = transients > 3 ? "Sudden burst of loud sound" : "Sound gets much louder";
  else reason = flashes > 1 ? "Flashes and fast movement on screen" : "Fast movement on screen";
  return {
    id: c.id,
    start: c.start,
    end: c.end,
    peak: c.peak,
    score: c.scanScore,
    scanScore: c.scanScore,
    aiScore: null,
    category: "Action",
    label: null,
    reason,
    kept: true,
    source: "scan",
  };
}

function plainReason(r: unknown): string {
  const s = String(r ?? "").replace(/\s+/g, " ").replace(/[—–]/g, "-").trim();
  if (!s) return "Reviewed by AI";
  return s.length > 70 ? s.slice(0, 67).trimEnd() + "..." : s;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
