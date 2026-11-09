// Live moment scanner. Pure logic, no I/O, so the same code runs in the desktop
// catcher (live feeds), in a full-speed pass over a recording, and in tests.
//
// Input: one FeatureSample about every 1/3 s, measured from tiny frames (about
// 64x36) and the audio loudness envelope. Each signal is ranked against the
// feed's own recent history, so a loud broadcast and a quiet one are judged
// on their own terms. Audio and picture count about equally, moments where
// both spike together get a bonus, and an absolute motion floor stops static
// screens (a loud tone over a still image, an intermission card) from becoming
// fake peaks.

export interface FeatureSample {
  /** Seconds since the start of the feed / recording. */
  t: number;
  /** Mean absolute pixel change against the previous sample frame, 0..255. */
  motion: number;
  /** Absolute change in mean brightness against the previous sample frame, 0..255. */
  flash: number;
  /** Share of bright, saturated red/orange/yellow pixels, 0..1. */
  hot: number;
  /** Mean RMS loudness over the sample span, 0..1. Absent when there is no audio. */
  rms?: number;
  /** Count of sharp loudness jumps (shots, impacts, shouting) in the sample span. */
  transients?: number;
}

export interface ScanCandidate {
  id: string;
  /** Window start and end in seconds (the clip to cut). */
  start: number;
  end: number;
  /** Time of the strongest sample. */
  peak: number;
  /** 0..100 */
  scanScore: number;
  /** What drove the score, used for honest fallback labels and AI cues. */
  cues: { audio: number; visual: number; together: boolean; flashes: number; hot: number; transients: number };
}

export interface ScannerOptions {
  /** Seconds of history to rank against. */
  historySec?: number;
  /** Seconds before the scanner is allowed to fire. */
  warmupSec?: number;
  /** Minimum smoothed score to fire, 0..1. */
  minTrigger?: number;
  /** Quantile of recent scores the trigger must also beat. */
  triggerQuantile?: number;
  /** Mean pixel change below which the picture counts as static. */
  motionFloor?: number;
  /** Build-up before the peak and payoff after it, seconds. */
  preRoll?: number;
  postRoll?: number;
  /** Shortest and longest clip, seconds. */
  minLen?: number;
  maxLen?: number;
  /** Seconds between the end of one moment and the next peak. */
  minGap?: number;
  /** How long the action must stay quiet before a moment closes, seconds. */
  releaseSec?: number;
}

const DEFAULTS: Required<ScannerOptions> = {
  historySec: 600,
  warmupSec: 8,
  minTrigger: 0.62,
  triggerQuantile: 0.9,
  motionFloor: 1.2,
  preRoll: 5,
  postRoll: 3,
  minLen: 3,
  maxLen: 15,
  minGap: 4,
  releaseSec: 1.5,
};

/** Sorted rolling window with O(log n) rank queries. */
class RollingRank {
  private sorted: number[] = [];
  private fifo: number[] = [];
  constructor(private cap: number) {}
  push(v: number) {
    this.fifo.push(v);
    this.sorted.splice(this.lowerBound(v), 0, v);
    if (this.fifo.length > this.cap) {
      const old = this.fifo.shift()!;
      this.sorted.splice(this.lowerBound(old), 1);
    }
  }
  /** Share of history strictly below v, with ties counted half. 0..1 */
  rank(v: number): number {
    const n = this.sorted.length;
    if (n === 0) return 0;
    const lo = this.lowerBound(v);
    let hi = lo;
    while (hi < n && this.sorted[hi] === v) hi++;
    return (lo + (hi - lo) * 0.5) / n;
  }
  quantile(q: number): number {
    const n = this.sorted.length;
    if (n === 0) return 0;
    return this.sorted[Math.min(n - 1, Math.floor(q * n))];
  }
  get size() {
    return this.sorted.length;
  }
  private lowerBound(v: number) {
    let lo = 0,
      hi = this.sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.sorted[mid] < v) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
}

interface Scored {
  t: number;
  s: number;
  /** Does anything clearly stand out from what's typical for this feed? */
  standout: boolean;
  audio: number;
  visual: number;
  sample: FeatureSample;
}

interface Open {
  firstAbove: number;
  lastAbove: number;
  peak: Scored;
  samples: Scored[];
}

export interface LiveScanner {
  push(sample: FeatureSample): ScanCandidate[];
  /** Close any open moment, e.g. when the feed ends. */
  flush(): ScanCandidate[];
  /** Latest smoothed score 0..1, for a live meter. */
  readonly level: number;
}

export function createScanner(opts: ScannerOptions = {}): LiveScanner {
  const o = { ...DEFAULTS, ...opts };
  const cap = Math.round(o.historySec * 3);
  const ranks = {
    motion: new RollingRank(cap),
    flash: new RollingRank(cap),
    hot: new RollingRank(cap),
    rms: new RollingRank(cap),
    transients: new RollingRank(cap),
    score: new RollingRank(cap),
  };
  const recent: Scored[] = []; // last ~20 s, for build-up context
  let open: Open | null = null;
  let lastEnd = -Infinity;
  let level = 0;
  let seq = 0;
  let firstT: number | null = null;

  function scoreOf(x: FeatureSample): Scored {
    ranks.motion.push(x.motion);
    ranks.flash.push(x.flash);
    ranks.hot.push(x.hot);
    const visual = 0.55 * ranks.motion.rank(x.motion) + 0.2 * ranks.flash.rank(x.flash) + 0.25 * ranks.hot.rank(x.hot);
    let audio = 0;
    const hasAudio = x.rms !== undefined;
    if (hasAudio) {
      ranks.rms.push(x.rms!);
      ranks.transients.push(x.transients ?? 0);
      audio = 0.45 * ranks.rms.rank(x.rms!) + 0.55 * ranks.transients.rank(x.transients ?? 0);
    }
    let s = hasAudio ? 0.42 * visual + 0.42 * audio + 0.16 * Math.min(visual, audio) * (visual > 0.6 && audio > 0.6 ? 1 : 0.4) : visual;
    // Static picture: whatever the audio does, this is not a highlight.
    if (x.motion < o.motionFloor) s *= 0.35;
    // Ranks always have a "top 10%", even in dead air. Require a real jump
    // against what's typical, so calm stretches stay quiet.
    const mMed = ranks.motion.quantile(0.5);
    const visualJump = x.motion >= mMed * 1.8 + 1.5 || x.flash >= 15 || x.hot >= ranks.hot.quantile(0.5) + 0.01;
    const audioJump = hasAudio && x.motion >= o.motionFloor && (x.rms! >= ranks.rms.quantile(0.5) * 2 + 0.01 || (x.transients ?? 0) >= ranks.transients.quantile(0.5) + 2);
    return { t: x.t, s, standout: visualJump || audioJump, audio, visual, sample: x };
  }

  function smooth(): number {
    // Mean over the last ~1 s (3 samples).
    const n = Math.min(3, recent.length);
    let sum = 0;
    for (let i = recent.length - n; i < recent.length; i++) sum += recent[i].s;
    return n ? sum / n : 0;
  }

  function standoutCount(): number {
    let n = 0;
    for (let i = Math.max(0, recent.length - 3); i < recent.length; i++) if (recent[i].standout) n++;
    return n;
  }

  function close(o2: Open): ScanCandidate | null {
    const peakT = o2.peak.t;
    let start = Math.min(peakT - o.preRoll, o2.firstAbove - 1);
    let end = Math.max(peakT + o.postRoll, o2.lastAbove + 1);
    start = Math.max(start, firstT ?? 0, lastEnd);
    if (end - start > o.maxLen) {
      // Keep the peak inside with build-up weighted before it.
      start = Math.max(start, peakT - (o.maxLen * o.preRoll) / (o.preRoll + o.postRoll));
      end = Math.min(end, start + o.maxLen);
    }
    if (end - start < o.minLen) end = start + o.minLen;
    const inWin = o2.samples;
    const together = inWin.some((x) => x.audio > 0.6 && x.visual > 0.6);
    const cand: ScanCandidate = {
      id: `m${++seq}`,
      start: round2(start),
      end: round2(end),
      peak: round2(peakT),
      scanScore: Math.round(Math.min(1, o2.peak.s) * 100),
      cues: {
        audio: round2(max(inWin, (x) => x.audio)),
        visual: round2(max(inWin, (x) => x.visual)),
        together,
        flashes: inWin.filter((x) => x.sample.flash > 20).length,
        hot: round2(max(inWin, (x) => x.sample.hot)),
        transients: inWin.reduce((a, x) => a + (x.sample.transients ?? 0), 0),
      },
    };
    lastEnd = end;
    return cand;
  }

  return {
    get level() {
      return level;
    },
    push(sample) {
      if (firstT === null) firstT = sample.t;
      const sc = scoreOf(sample);
      recent.push(sc);
      while (recent.length && recent[0].t < sample.t - 20) recent.shift();
      const sm = smooth();
      level = sm;
      ranks.score.push(sm);
      const out: ScanCandidate[] = [];
      const warm = sample.t - firstT >= o.warmupSec;
      const trigger = Math.max(o.minTrigger, ranks.score.quantile(o.triggerQuantile));
      const release = trigger * 0.8;

      if (open) {
        open.samples.push(sc);
        if (sm >= release) open.lastAbove = sample.t;
        if (sc.s > open.peak.s) open.peak = sc;
        const quietFor = sample.t - open.lastAbove;
        const tooLong = sample.t - open.firstAbove > o.maxLen;
        // Close once the action has calmed and the payoff after the peak is recorded.
        if ((quietFor >= o.releaseSec || tooLong) && sample.t >= open.peak.t + o.postRoll) {
          const c = close(open);
          open = null;
          if (c) out.push(c);
        }
      } else if (warm && sm >= trigger && standoutCount() >= 2 && sample.t >= lastEnd + o.minGap) {
        open = { firstAbove: sample.t, lastAbove: sample.t, peak: sc, samples: recent.filter((x) => x.t >= sample.t - 2) };
      }
      return out;
    },
    flush() {
      if (!open) return [];
      const c = close(open);
      open = null;
      return c ? [c] : [];
    },
  };
}

/** Run the scanner over a full set of samples (a finished recording). */
export function scanAll(samples: FeatureSample[], opts?: ScannerOptions): ScanCandidate[] {
  const s = createScanner(opts);
  const out: ScanCandidate[] = [];
  for (const x of samples) out.push(...s.push(x));
  out.push(...s.flush());
  return out;
}

function max<T>(xs: T[], f: (x: T) => number) {
  let m = 0;
  for (const x of xs) m = Math.max(m, f(x));
  return m;
}
function round2(n: number) {
  return Math.round(n * 100) / 100;
}
