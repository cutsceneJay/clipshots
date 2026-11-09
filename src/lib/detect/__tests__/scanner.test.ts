import { describe, it, expect } from "vitest";
import { scanAll, type FeatureSample } from "../scanner";

function feed(len: number, bursts: [number, number][], decoy?: [number, number], audio = true): FeatureSample[] {
  const out: FeatureSample[] = [];
  let seed = 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let t = 1 / 3; t < len; t += 1 / 3) {
    const inB = bursts.some(([a, b]) => t >= a && t < b);
    const inD = decoy && t >= decoy[0] && t < decoy[1];
    const s: FeatureSample = {
      t,
      motion: inB ? 30 + rnd() * 20 : inD ? 0 : 3 + rnd() * 2,
      flash: inB && rnd() > 0.6 ? 40 : rnd() * 1,
      hot: inB ? 0.05 : 0,
    };
    if (audio) {
      s.rms = inB ? 0.4 + rnd() * 0.2 : inD ? 0.8 : 0.03 + rnd() * 0.01;
      s.transients = inB ? 3 + Math.floor(rnd() * 3) : 0;
    }
    out.push(s);
  }
  return out;
}

describe("scanner", () => {
  const bursts: [number, number][] = [[20, 24], [64, 69], [100, 104]];
  it("finds every burst and skips a loud static decoy", () => {
    const got = scanAll(feed(120, bursts, [45, 49]));
    for (const [a, b] of bursts) expect(got.some((m) => m.start < b && m.end > a)).toBe(true);
    expect(got.some((m) => m.peak >= 44 && m.peak <= 50)).toBe(false);
    for (const m of got) {
      expect(m.end - m.start).toBeLessThanOrEqual(15);
      expect(m.peak).toBeGreaterThanOrEqual(m.start);
      expect(m.peak).toBeLessThanOrEqual(m.end);
    }
  });
  it("works on picture alone", () => {
    const got = scanAll(feed(120, bursts, [45, 49], false));
    for (const [a, b] of bursts) expect(got.some((m) => m.start < b && m.end > a)).toBe(true);
  });
  it("stays quiet on calm footage", () => {
    expect(scanAll(feed(300, [])).length).toBeLessThanOrEqual(1);
  });
});
