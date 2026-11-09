// Builds the AI review request (OpenAI-compatible, sent to Gemini 2.5 Flash via
// the Lovable AI gateway) and parses the answer. Runs on the server only; the
// desktop catcher posts frames to /api/review and never sees the key.

import { CATEGORIES, profileFor } from "./categories";
import type { AiVerdict } from "./merge";
import type { ScanCandidate } from "./scanner";

export interface ReviewFrame {
  /** Seconds in the feed. */
  t: number;
  /** "build-up" | "peak" | "payoff" */
  phase: string;
  /** JPEG as a data URL, about 448 px wide. */
  dataUrl: string;
}

export interface ReviewInput {
  candidate: ScanCandidate;
  frames: ReviewFrame[];
  game?: string;
  context?: string; // e.g. "Grand final, TL vs G2, map 2"
}

export const REVIEW_MODEL = "google/gemini-2.5-flash";
export const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
/** Keep requests well under gateway limits. 9 frames at ~448 px JPEG q70 is ~350 KB. */
export const MAX_FRAMES = 9;
export const MAX_REQUEST_BYTES = 3_500_000;

export function buildReviewRequest(input: ReviewInput) {
  const { candidate: c, frames, game, context } = input;
  const p = profileFor(game);
  const labels = Object.keys(p.labels);
  const cues: string[] = [];
  if (c.cues.together) cues.push("sound and picture spike at the same time");
  if (c.cues.transients > 3) cues.push("bursts of sharp sounds like shots, impacts or shouting");
  if (c.cues.flashes > 0) cues.push("bright flashes");
  if (c.cues.hot > 0.02) cues.push("fire or explosion colors");
  if (c.cues.visual > 0.8) cues.push("very fast movement");
  if (c.cues.audio > 0.8 && c.cues.visual < 0.4) cues.push("loud audio but little movement (be suspicious)");

  const system = [
    "You review moments caught from a live esports broadcast for a producer who cannot watch every second.",
    `Game: ${p.name}.${context ? ` Show: ${context}.` : ""}`,
    "Decide if this window is a real highlight a producer would want to clip right now.",
    `Reject: ${p.ignore.join("; ")}.`,
    "Replays of a play already shown can be kept but use category Replay.",
    "Write the reason in plain words a viewer would use, under 70 characters, no jargon.",
    "Tighten start and end to the action: within 3 seconds of the window, 3 to 15 seconds long, and containing the peak.",
  ].join("\n");

  const content: unknown[] = [
    {
      type: "text",
      text:
        `Window ${c.start.toFixed(1)}s to ${c.end.toFixed(1)}s, peak at ${c.peak.toFixed(1)}s. ` +
        `Scan strength ${c.scanScore}/100.` +
        (cues.length ? ` What the scan noticed: ${cues.join(", ")}.` : "") +
        ` Frames follow in time order.`,
    },
  ];
  for (const f of frames.slice(0, MAX_FRAMES)) {
    content.push({ type: "text", text: `${f.phase} at ${f.t.toFixed(1)}s` });
    content.push({ type: "image_url", image_url: { url: f.dataUrl } });
  }

  return {
    model: REVIEW_MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "verdict",
          description: "Your verdict on this moment.",
          parameters: {
            type: "object",
            properties: {
              keep: { type: "boolean" },
              score: { type: "number", description: "0 to 100, how clip-worthy" },
              category: { type: "string", enum: [...CATEGORIES] },
              label: { type: "string", enum: labels, description: "Most precise label for this game, if one fits" },
              reason: { type: "string", description: "Plain words, under 70 characters" },
              start: { type: "number" },
              end: { type: "number" },
            },
            required: ["keep", "score", "category", "reason", "start", "end"],
          },
        },
      },
    ],
    tool_choice: { type: "function", function: { name: "verdict" } },
  };
}

export function parseVerdict(json: unknown): AiVerdict | null {
  try {
    const msg = (json as any)?.choices?.[0]?.message;
    const call = msg?.tool_calls?.[0]?.function?.arguments;
    const raw = call ? JSON.parse(call) : JSON.parse(String(msg?.content ?? "").replace(/^```(json)?|```$/g, ""));
    if (typeof raw?.keep !== "boolean") return null;
    return {
      keep: raw.keep,
      score: Number(raw.score),
      category: String(raw.category ?? "Action"),
      label: raw.label ? String(raw.label) : undefined,
      reason: String(raw.reason ?? ""),
      start: Number(raw.start),
      end: Number(raw.end),
    };
  } catch {
    return null;
  }
}

/** Frame times for a candidate: build-up, peak, payoff bursts. */
export function reviewFrameTimes(c: ScanCandidate): { t: number; phase: string }[] {
  const out: { t: number; phase: string }[] = [];
  const b = Math.max(c.start, c.peak - 3);
  out.push({ t: c.start, phase: "build-up" }, { t: (c.start + b) / 2, phase: "build-up" }, { t: b, phase: "build-up" });
  out.push({ t: c.peak - 0.5, phase: "peak" }, { t: c.peak, phase: "peak" }, { t: c.peak + 0.5, phase: "peak" });
  const e = c.end - 0.2;
  out.push({ t: (c.peak + e) / 2, phase: "payoff" }, { t: e - 0.6, phase: "payoff" }, { t: e, phase: "payoff" });
  return out.map((x) => ({ ...x, t: Math.max(c.start, Math.min(c.end - 0.05, x.t)) }));
}
