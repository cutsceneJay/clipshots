import { describe, it, expect } from "vitest";
import { mergeVerdict, scanOnlyMoment } from "../merge";
import type { ScanCandidate } from "../scanner";

const c: ScanCandidate = { id: "m1", start: 10, end: 20, peak: 15, scanScore: 80, cues: { audio: 0.9, visual: 0.9, together: true, flashes: 2, hot: 0.1, transients: 8 } };

describe("mergeVerdict", () => {
  it("blends 70% AI and 30% scan", () => {
    const m = mergeVerdict(c, { keep: true, score: 90, category: "Clutch", reason: "1v3 to win the round", start: 11, end: 19 });
    expect(m.score).toBe(Math.round(0.7 * 90 + 0.3 * 80));
    expect(m.kept).toBe(true);
    expect(m.source).toBe("ai");
  });
  it("caps rejected moments at 45 and does not include them", () => {
    const m = mergeVerdict(c, { keep: false, score: 95, category: "Action", reason: "Loading screen", start: 10, end: 20 });
    expect(m.score).toBeLessThanOrEqual(45);
    expect(m.kept).toBe(false);
  });
  it("clamps the window to within 3s of the scan window", () => {
    const m = mergeVerdict(c, { keep: true, score: 70, category: "Clutch", reason: "x", start: -50, end: 400 });
    expect(m.start).toBeGreaterThanOrEqual(7);
    expect(m.end).toBeLessThanOrEqual(23);
    expect(m.end - m.start).toBeLessThanOrEqual(15);
  });
  it("always contains the peak", () => {
    const m = mergeVerdict(c, { keep: true, score: 70, category: "Clutch", reason: "x", start: 16, end: 19 });
    expect(m.start).toBeLessThanOrEqual(15);
    expect(m.end).toBeGreaterThanOrEqual(15);
  });
  it("enforces at least 3 seconds", () => {
    const m = mergeVerdict(c, { keep: true, score: 70, category: "Clutch", reason: "x", start: 14.5, end: 15.2 });
    expect(m.end - m.start).toBeGreaterThanOrEqual(3 - 1e-9);
  });
  it("maps game labels to categories and ignores unknown ones", () => {
    const a = mergeVerdict(c, { keep: true, score: 70, category: "Action", label: "Ace", reason: "x", start: 10, end: 20 }, "cs2");
    expect(a.category).toBe("Multi-kill");
    expect(a.label).toBe("Ace");
    const b = mergeVerdict(c, { keep: true, score: 70, category: "Nonsense", label: "Made up", reason: "x", start: 10, end: 20 }, "cs2");
    expect(b.category).toBe("Action");
    expect(b.label).toBeNull();
  });
  it("clamps scores and handles garbage numbers", () => {
    const m = mergeVerdict(c, { keep: true, score: 999, category: "Clutch", reason: "x", start: NaN, end: NaN });
    expect(m.aiScore).toBe(100);
    expect(m.start).toBeLessThanOrEqual(15);
  });
  it("keeps reasons short and plain", () => {
    const m = mergeVerdict(c, { keep: true, score: 70, category: "Clutch", reason: "A".repeat(200) + " — dash", start: 10, end: 20 });
    expect(m.reason.length).toBeLessThanOrEqual(70);
  });
});

describe("scanOnlyMoment", () => {
  it("labels honestly when the AI is unavailable", () => {
    const m = scanOnlyMoment(c);
    expect(m.source).toBe("scan");
    expect(m.aiScore).toBeNull();
    expect(m.reason.length).toBeGreaterThan(0);
    expect(m.score).toBe(80);
  });
});
