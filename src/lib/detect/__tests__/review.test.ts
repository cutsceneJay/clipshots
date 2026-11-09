import { describe, it, expect } from "vitest";
import { buildReviewRequest, parseVerdict, reviewFrameTimes, MAX_REQUEST_BYTES, MAX_FRAMES } from "../review";
import type { ScanCandidate } from "../scanner";

const c: ScanCandidate = { id: "m1", start: 16.33, end: 25, peak: 21.33, scanScore: 97, cues: { audio: 0.9, visual: 0.95, together: true, flashes: 3, hot: 0.06, transients: 20 } };

describe("review request", () => {
  it("asks for build-up, peak and payoff frames inside the window", () => {
    const ts = reviewFrameTimes(c);
    expect(ts).toHaveLength(9);
    expect(new Set(ts.map((t) => t.phase))).toEqual(new Set(["build-up", "peak", "payoff"]));
    for (const t of ts) {
      expect(t.t).toBeGreaterThanOrEqual(c.start);
      expect(t.t).toBeLessThan(c.end);
    }
  });
  it("stays under the size limit with 9 realistic 448px JPEGs and uses game labels", () => {
    const jpeg = "data:image/jpeg;base64," + "A".repeat(48_000); // ~36 KB, typical 448px q5 frame
    const body = buildReviewRequest({ candidate: c, frames: reviewFrameTimes(c).map((f) => ({ ...f, dataUrl: jpeg })), game: "valorant" });
    const json = JSON.stringify(body);
    expect(json.length).toBeLessThan(MAX_REQUEST_BYTES);
    expect((body.messages[1].content as unknown[]).filter((x: any) => x.type === "image_url")).toHaveLength(MAX_FRAMES);
    expect(json).toContain("Spike plant");
    expect(json).toContain("agent select");
  });
});

describe("parseVerdict", () => {
  it("reads a tool call", () => {
    const v = parseVerdict({ choices: [{ message: { tool_calls: [{ function: { arguments: JSON.stringify({ keep: true, score: 88, category: "Clutch", label: "1vX clutch", reason: "1v3 to save the round", start: 17, end: 24 }) } }] } }] });
    expect(v).toMatchObject({ keep: true, score: 88, category: "Clutch", label: "1vX clutch" });
  });
  it("reads plain JSON content as a fallback", () => {
    const v = parseVerdict({ choices: [{ message: { content: '```json\n{"keep":false,"score":10,"category":"Action","reason":"Loading screen","start":16,"end":25}\n```' } }] });
    expect(v?.keep).toBe(false);
  });
  it("rejects garbage", () => {
    expect(parseVerdict({ choices: [{ message: { content: "sure!" } }] })).toBeNull();
    expect(parseVerdict(null)).toBeNull();
  });
});
