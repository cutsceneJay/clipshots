// Turns raw tiny frames and audio PCM into FeatureSamples for the scanner.
// Pure functions so the desktop catcher, a browser worker and tests share them.

import type { FeatureSample } from "./scanner";

export const FRAME_W = 64;
export const FRAME_H = 36;
export const SAMPLE_FPS = 3; // about 1/3 s between frames
export const AUDIO_RATE = 16000;
export const RMS_STEP = Math.round(AUDIO_RATE * 0.031); // about 31 ms

export interface FrameStats {
  gray: Uint8Array;
  brightness: number;
  hot: number;
}

/** rgb24 bytes (w*h*3) to luma + hot-pixel share. */
export function frameStats(rgb: Uint8Array, w = FRAME_W, h = FRAME_H): FrameStats {
  const n = w * h;
  const gray = new Uint8Array(n);
  let sum = 0;
  let hot = 0;
  for (let i = 0, p = 0; i < n; i++, p += 3) {
    const r = rgb[p],
      g = rgb[p + 1],
      b = rgb[p + 2];
    const y = (r * 77 + g * 150 + b * 29) >> 8;
    gray[i] = y;
    sum += y;
    // Bright, saturated red / orange / yellow: explosions, fire, damage.
    const mn = Math.min(r, g, b);
    if (r > 170 && r >= g && b < 120 && (r - mn) / r > 0.5) hot++;
  }
  return { gray, brightness: sum / n, hot: hot / n };
}

export function motionBetween(a: Uint8Array, b: Uint8Array): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]);
  return d / a.length;
}

/** Streaming audio envelope: feed PCM (float -1..1), read RMS steps. */
export class AudioEnvelope {
  private buf: number[] = [];
  private history: number[] = [];
  readonly steps: { t: number; rms: number; transient: boolean }[] = [];
  private pos = 0; // samples consumed
  constructor(private rate = AUDIO_RATE, private step = RMS_STEP) {}
  push(pcm: Float32Array) {
    for (let i = 0; i < pcm.length; i++) this.buf.push(pcm[i]);
    while (this.buf.length >= this.step) {
      let acc = 0;
      for (let i = 0; i < this.step; i++) acc += this.buf[i] * this.buf[i];
      this.buf.splice(0, this.step);
      const rms = Math.sqrt(acc / this.step);
      const prev = this.history.length ? this.history.reduce((a, b) => a + b, 0) / this.history.length : rms;
      const transient = rms > 0.04 && rms > prev * 2.2;
      this.history.push(rms);
      if (this.history.length > 8) this.history.shift();
      this.steps.push({ t: this.pos / this.rate, rms, transient });
      this.pos += this.step;
    }
  }
  /** Summarise and drop all steps that end before time t. */
  take(until: number): { rms: number; transients: number } | null {
    let n = 0,
      acc = 0,
      tr = 0;
    while (this.steps.length && this.steps[0].t < until) {
      const s = this.steps.shift()!;
      acc += s.rms;
      tr += s.transient ? 1 : 0;
      n++;
    }
    return n ? { rms: acc / n, transients: tr } : null;
  }
  get time() {
    return this.pos / this.rate;
  }
}

export function s16leToFloat(buf: Uint8Array): Float32Array {
  const n = buf.length >> 1;
  const out = new Float32Array(n);
  const dv = new DataView(buf.buffer, buf.byteOffset, n * 2);
  for (let i = 0; i < n; i++) out[i] = dv.getInt16(i * 2, true) / 32768;
  return out;
}

/** Builds samples from frames + audio arriving at their own pace. */
export class FeatureAssembler {
  private prev: FrameStats | null = null;
  private frameIndex = 0;
  readonly audio = new AudioEnvelope();
  constructor(private hasAudio: boolean, private fps = SAMPLE_FPS) {}
  /** Returns a sample, or null for the very first frame. Audio must have caught up to t. */
  frame(rgb: Uint8Array): FeatureSample | null {
    const st = frameStats(rgb);
    const t = this.frameIndex / this.fps;
    this.frameIndex++;
    const prev = this.prev;
    this.prev = st;
    if (!prev) {
      if (this.hasAudio) this.audio.take(t);
      return null;
    }
    const sample: FeatureSample = {
      t,
      motion: motionBetween(prev.gray, st.gray),
      flash: Math.abs(st.brightness - prev.brightness),
      hot: st.hot,
    };
    if (this.hasAudio) {
      const a = this.audio.take(t);
      sample.rms = a?.rms ?? 0;
      sample.transients = a?.transients ?? 0;
    }
    return sample;
  }
  /** Time of the next frame, to know whether audio has caught up. */
  get nextFrameTime() {
    return this.frameIndex / this.fps;
  }
}
