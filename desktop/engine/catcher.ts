// The live catcher. Runs in the desktop app (Node, native ffmpeg).
//
// One ffmpeg process reads the feed and does three things at once:
//   1. records it to disk in 2 s pieces (stream copy, almost no CPU),
//   2. sends tiny 64x36 frames 3 times a second to the scanner,
//   3. sends a 16 kHz mono loudness feed to the scanner.
// When the scanner closes a moment, we cut that span out of the recording as a
// real MP4, grab review frames and a thumbnail, ask the AI to judge it, and
// emit the result. Nothing here is faked: no AI means an honest scan-only label.

import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { createServer, type Server, type Socket } from "node:net";
import { promises as fs, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createScanner, type ScanCandidate, type ScannerOptions } from "../../src/lib/detect/scanner";
import { FeatureAssembler, FRAME_W, FRAME_H, SAMPLE_FPS, AUDIO_RATE, s16leToFloat } from "../../src/lib/detect/features";
import { mergeVerdict, scanOnlyMoment, type AiVerdict, type Moment } from "../../src/lib/detect/merge";
import { reviewFrameTimes, type ReviewFrame } from "../../src/lib/detect/review";

export type SourceKind = "url" | "vod" | "file" | "srt" | "rtmp" | "recording";

export interface CatcherSource {
  kind: SourceKind;
  /** url: a live Twitch/YouTube link or direct HLS. vod: a past broadcast or social post link (downloaded, then scanned at full speed). file: a recording being written (MKV/TS/FLV). recording: a finished file scanned at full speed. srt/rtmp: port to listen on. */
  value: string;
  /** Read a file at real-time speed (used to simulate a live feed in tests). */
  realtime?: boolean;
}

export interface CatcherOptions {
  source: CatcherSource;
  workDir: string;
  ffmpegPath?: string;
  ytDlpPath?: string;
  game?: string;
  context?: string;
  scanner?: ScannerOptions;
  /** Ask the AI. Return null if it is unavailable (we then fall back honestly). */
  review?: (c: ScanCandidate, frames: ReviewFrame[]) => Promise<AiVerdict | null>;
  /** Delete recorded pieces older than this many minutes. 0 keeps the whole show. */
  keepMinutes?: number;
  /** Output clip encode. */
  clipHeight?: number;
}

export interface CaughtMoment extends Moment {
  clipPath: string;
  thumbPath: string;
  /** Wall-clock time the moment peaked (live feeds only). */
  peakAt: string | null;
  /** Seconds from the clip's last frame airing to the clip being ready (live feeds only). */
  latencySec: number | null;
}

interface Segment {
  file: string;
  start: number;
  end: number;
}

export class Catcher extends EventEmitter {
  private ff: ChildProcess | null = null;
  private servers: Server[] = [];
  private segments: Segment[] = [];
  private segListPos = 0;
  private startedAt = 0;
  /** Seconds of feed processed so far. */
  feedTime = 0;
  private stopping = false;
  private queue: Promise<void> = Promise.resolve();
  private pending = 0;
  readonly segDir: string;
  readonly clipDir: string;

  constructor(private o: CatcherOptions) {
    super();
    this.segDir = path.join(o.workDir, "recording");
    this.clipDir = path.join(o.workDir, "clips");
  }

  get ffmpeg() {
    return this.o.ffmpegPath || process.env.FFMPEG_PATH || "ffmpeg";
  }

  async start() {
    await fs.mkdir(this.segDir, { recursive: true });
    await fs.mkdir(this.clipDir, { recursive: true });
    this.status("Connecting to the feed");
    const input = await this.resolveInput();
    const k = this.o.source.kind;
    const probe = k === "srt" || k === "rtmp" || k === "url" ? { hasAudio: true, duration: 0 } : await this.probe(input.args[input.args.length - 1]);
    const hasAudio = probe.hasAudio;
    this.hasAudio = hasAudio;
    this.duration = this.o.source.kind === "recording" ? probe.duration : 0;

    const assembler = new FeatureAssembler(hasAudio);
    const scanner = createScanner(this.o.scanner);
    const frameBytes = FRAME_W * FRAME_H * 3;
    let vbuf: Buffer = Buffer.alloc(0);

    const pump = () => {
      while (vbuf.length >= frameBytes) {
        // Wait until audio has caught up with this frame's time.
        if (hasAudio && assembler.audio.time < assembler.nextFrameTime && !this.audioEnded) break;
        const f = vbuf.subarray(0, frameBytes);
        vbuf = vbuf.subarray(frameBytes);
        const sample = assembler.frame(new Uint8Array(f));
        if (!sample) continue;
        this.feedTime = sample.t;
        for (const c of scanner.push(sample)) this.enqueue(c);
        this.emit("level", { t: sample.t, level: scanner.level });
        if (this.duration && !this.pending) {
          const pct = Math.min(99, Math.floor((sample.t / this.duration) * 100));
          if (pct !== this.lastPct) {
            this.lastPct = pct;
            this.status(`Scanning the video ${pct}%`);
          }
        }
      }
    };

    const vPort = await this.listen((sock) => {
      sock.on("data", (d: Buffer) => {
        vbuf = vbuf.length ? Buffer.concat([vbuf, d]) : d;
        pump();
      });
      sock.on("end", () => {
        this.videoEnded = true;
        pump();
      });
    });
    let aRemainder: Buffer = Buffer.alloc(0);
    const aPort = hasAudio
      ? await this.listen((sock) => {
          sock.on("data", (d: Buffer) => {
            let buf = aRemainder.length ? Buffer.concat([aRemainder, d]) : d;
            const even = buf.length & ~1;
            assembler.audio.push(s16leToFloat(new Uint8Array(buf.buffer, buf.byteOffset, even)));
            aRemainder = Buffer.from(buf.subarray(even));
            pump();
          });
          sock.on("end", () => {
            this.audioEnded = true;
            pump();
          });
        })
      : 0;

    const segList = path.join(this.segDir, "pieces.csv");
    const args = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-nostdin",
      ...input.args,
      // 1. the recording, in 2 s pieces
      "-map",
      "0:v:0",
      ...(hasAudio ? ["-map", "0:a:0?"] : []),
      "-c",
      "copy",
      "-f",
      "segment",
      "-segment_time",
      "2",
      // Each piece starts at zero so pieces join cleanly (audio included).
      "-reset_timestamps",
      "1",
      "-segment_format",
      // MKV pieces: concatenate cleanly on ffmpeg 6 and 7 (the Linux ffmpeg 7
      // static build crashes reading MPEG-TS).
      "matroska",
      "-segment_list",
      segList,
      "-segment_list_type",
      "csv",
      "-segment_list_flags",
      "live",
      path.join(this.segDir, "piece%06d.mkv"),
      // 2. tiny frames for the scanner
      "-map",
      "0:v:0",
      "-vf",
      `fps=${SAMPLE_FPS},scale=${FRAME_W}:${FRAME_H}:flags=area`,
      "-pix_fmt",
      "rgb24",
      "-f",
      "rawvideo",
      `tcp://127.0.0.1:${vPort}`,
      // 3. loudness feed
      ...(hasAudio ? ["-map", "0:a:0", "-ac", "1", "-ar", String(AUDIO_RATE), "-f", "s16le", `tcp://127.0.0.1:${aPort}`] : []),
    ];
    this.startedAt = Date.now();
    this.ff = spawn(this.ffmpeg, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    this.ff.stderr!.on("data", (d) => (err = (err + d).slice(-4000)));
    this.status(this.idleStatus());
    const segTimer = setInterval(() => this.readSegments(segList), 500);

    await new Promise<void>((resolve) => {
      this.ff!.on("close", (code) => {
        clearInterval(segTimer);
        this.readSegments(segList);
        if (code && !this.stopping) {
          this.emit("log", err);
          this.emit("error", new Error(plainFfmpegError(err)));
        }
        resolve();
      });
    });
    // Feed over: finish whatever moment was open, wait for clips to be cut.
    await waitUntil(() => this.videoEnded && (!hasAudio || this.audioEnded), 5000);
    pump();
    for (const c of scanner.flush()) this.enqueue(c);
    await this.queue;
    for (const s of this.servers) s.close();
    this.status("Stopped");
    this.emit("ended");
  }

  stop() {
    this.stopping = true;
    // "q" is not available with -nostdin; SIGINT lets ffmpeg close files cleanly.
    const ff = this.ff;
    ff?.kill("SIGINT");
    // A recording that's still growing never reaches its end, so ffmpeg can sit
    // waiting after the first request. Ask again, then insist.
    const alive = () => ff && ff.exitCode === null && ff.signalCode === null;
    setTimeout(() => alive() && ff!.kill("SIGINT"), 4000);
    setTimeout(() => alive() && ff!.kill("SIGKILL"), 10000);
    this.ytProc?.kill();
  }

  private videoEnded = false;
  private audioEnded = false;

  /** Feed time tracks the wall clock (live feeds), unlike a recording scanned at full speed. */
  private isLive() {
    return this.o.source.kind !== "recording" || !!this.o.source.realtime;
  }

  private idleStatus() {
    return this.o.source.kind === "recording" && !this.o.source.realtime ? "Scanning the video" : "Watching for action";
  }

  private status(text: string) {
    this.emit("status", text);
  }

  private enqueue(c: ScanCandidate) {
    this.pending++;
    this.emit("status", "Picking the best moments");
    this.queue = this.queue.then(() => this.process(c)).catch((e) => { this.emit("error", e); }).finally(() => {
      this.pending--;
      if (!this.pending && !this.stopping) this.status(this.idleStatus());
    });
  }

  private async process(c: ScanCandidate) {
    // Wait until the recording covers the window (a piece closes at the next keyframe after 2 s).
    const ok = await waitUntil(() => this.coveredUntil() >= c.end || this.ffDone(), 30000);
    if (!ok) throw new Error("The recording fell behind; this moment could not be saved.");
    const pieces = this.segments.filter((s) => s.end > c.start - 3 && s.start < c.end + 3);
    if (!pieces.length) return;
    const base = pieces[0].start;
    const list = path.join(this.clipDir, `${c.id}.txt`);
    await fs.writeFile(list, pieces.map((p) => `file '${path.join(this.segDir, p.file).replace(/'/g, "'\\''")}'`).join("\n"));
    const concat = ["-f", "concat", "-safe", "0", "-i", list];

    // Review frames, then the AI verdict.
    const frames: ReviewFrame[] = [];
    for (const f of reviewFrameTimes(c)) {
      const jpg = await this.run([...seekArgs(f.t - base), ...concat, "-frames:v", "1", "-vf", "scale=448:-2", "-q:v", "5", "-f", "image2", "-c:v", "mjpeg", "pipe:1"], true);
      if (jpg?.length) frames.push({ t: f.t, phase: f.phase, dataUrl: `data:image/jpeg;base64,${jpg.toString("base64")}` });
    }
    let moment: Moment;
    let verdict: AiVerdict | null = null;
    if (this.o.review && frames.length) {
      try {
        verdict = await this.o.review(c, frames);
      } catch {
        verdict = null;
      }
    }
    moment = verdict ? mergeVerdict(c, verdict, this.o.game) : scanOnlyMoment(c);

    // Cut the real clip (accurate re-encode) and a thumbnail at the peak.
    const name = `${String(Math.floor(moment.start)).padStart(5, "0")}-${c.id}`;
    const clipPath = path.join(this.clipDir, `${name}.mp4`);
    const thumbPath = path.join(this.clipDir, `${name}.jpg`);
    const h = this.o.clipHeight ?? 1080;
    // Footage without sound still gets a (silent) audio track, so clips post cleanly everywhere.
    const silence = this.hasAudio ? [] : ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo"];
    const maps = this.hasAudio ? [] : ["-map", "0:v:0", "-map", "1:a:0", "-shortest"];
    await this.run([
      "-y",
      "-ss",
      String(Math.max(0, moment.start - base)),
      "-t",
      String(moment.end - moment.start),
      ...concat,
      ...silence,
      ...maps,
      "-vf",
      `scale=-2:'min(${h},ih)'`,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "20",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "160k",
      "-movflags",
      "+faststart",
      clipPath,
    ]);
    await this.run(["-y", ...seekArgs(moment.peak - base), ...concat, "-frames:v", "1", "-vf", "scale=640:-2", "-q:v", "3", thumbPath]);
    await fs.rm(list, { force: true });

    const caught: CaughtMoment = {
      ...moment,
      clipPath,
      thumbPath,
      peakAt: this.isLive() ? new Date(this.startedAt + moment.peak * 1000).toISOString() : null,
      // For live feeds, feed time tracks wall time, so this is how long after the
      // clip's last frame aired that the finished clip was ready.
      latencySec: this.isLive() ? Math.round((Date.now() - (this.startedAt + moment.end * 1000)) / 100) / 10 : null,
    };
    this.emit("moment", caught);
    this.prune();
  }

  private coveredUntil() {
    return this.segments.length ? this.segments[this.segments.length - 1].end : 0;
  }
  private ffDone() {
    return !this.ff || this.ff.exitCode !== null || this.ff.signalCode !== null;
  }

  private readSegments(file: string) {
    if (!existsSync(file)) return;
    const text = readFileSync(file, "utf8");
    const lines = text.split("\n").slice(this.segListPos).filter(Boolean);
    for (const l of lines) {
      const [f, s, e] = l.split(",");
      if (f && e) this.segments.push({ file: f, start: Number(s), end: Number(e) });
      this.segListPos++;
    }
  }

  private async prune() {
    const keep = this.o.keepMinutes ?? 0;
    if (!keep) return;
    const cutoff = this.feedTime - keep * 60;
    while (this.segments.length > 1 && this.segments[0].end < cutoff) {
      const s = this.segments.shift()!;
      await fs.rm(path.join(this.segDir, s.file), { force: true });
    }
  }

  private listen(onConn: (s: Socket) => void): Promise<number> {
    return new Promise((resolve) => {
      const srv = createServer((sock) => {
        sock.setNoDelay(true);
        onConn(sock);
      });
      srv.listen(0, "127.0.0.1", () => resolve((srv.address() as any).port));
      this.servers.push(srv);
    });
  }

  private async resolveInput(): Promise<{ args: string[] }> {
    const { kind, value, realtime } = this.o.source;
    switch (kind) {
      case "url": {
        // Twitch / YouTube pages need resolving to a playable stream first.
        const direct = /\.(m3u8|ts|flv|mp4)(\?|$)/i.test(value) ? value : await this.ytDlp(value);
        return { args: ["-reconnect", "1", "-reconnect_streamed", "1", "-reconnect_delay_max", "5", "-i", direct] };
      }
      case "file":
        // A recording still being written: keep reading as it grows.
        return { args: ["-re", "-follow", "1", "-i", `file:${value}`] };
      case "recording":
        return { args: [...(realtime ? ["-re"] : []), "-i", value] };
      case "vod": {
        const file = await this.downloadVod(value);
        this.o.source = { kind: "recording", value: file };
        return { args: ["-i", file] };
      }
      case "srt":
        return { args: ["-i", `srt://0.0.0.0:${Number(value) || 9000}?mode=listener`] };
      case "rtmp":
        return { args: ["-listen", "1", "-i", `rtmp://0.0.0.0:${Number(value) || 1935}/live`] };
    }
  }

  /** Download a past broadcast / social post with yt-dlp, reporting progress. */
  private downloadVod(url: string): Promise<string> {
    const outTpl = path.join(this.o.workDir, "source.%(ext)s");
    return new Promise((resolve, reject) => {
      const args = [
        "--no-playlist",
        "--no-warnings",
        "--newline",
        "-f",
        "bv*[height<=1080]+ba/b[height<=1080]/bv*+ba/b",
        "--merge-output-format",
        "mp4",
        "--print",
        "after_move:filepath",
        "-o",
        outTpl,
      ];
      const ff = this.ffmpeg;
      if (ff !== "ffmpeg") args.push("--ffmpeg-location", ff);
      args.push(url);
      const p = spawn(this.o.ytDlpPath || "yt-dlp", args);
      this.ytProc = p;
      let out = "";
      let err = "";
      p.stdout.on("data", (d) => {
        out += d;
        const m = /\[download\]\s+([\d.]+)%/.exec(String(d));
        if (m) this.status(`Downloading the video ${Math.floor(Number(m[1]))}%`);
      });
      p.stderr.on("data", (d) => (err = (err + d).slice(-2000)));
      p.on("error", () => reject(new Error("The video downloader is missing. Reinstall Clipshots.")));
      p.on("close", (code) => {
        this.ytProc = null;
        const file = out.trim().split("\n").filter((l) => l && !l.startsWith("[")).pop();
        if (code === 0 && file && existsSync(file)) {
          this.status("Scanning the video");
          resolve(file);
        } else if (/Private|members|Sign in|age/i.test(err)) reject(new Error("That video is private or needs a sign-in, so it can't be downloaded."));
        else reject(new Error("Couldn't download that video. Check the link opens in a browser."));
      });
    });
  }
  private ytProc: ChildProcess | null = null;

  private ytDlp(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const p = spawn(this.o.ytDlpPath || "yt-dlp", ["-g", "-f", "best[height<=1080]/best", "--no-warnings", url]);
      let out = "";
      p.stdout.on("data", (d) => (out += d));
      p.on("error", () => reject(new Error("Couldn't open that stream link. Check it's live and public.")));
      p.on("close", (code) => {
        const first = out.trim().split("\n")[0];
        if (code === 0 && first) resolve(first);
        else reject(new Error("Couldn't open that stream link. Check it's live and public."));
      });
    });
  }

  private duration = 0;
  private hasAudio = true;
  private lastPct = -1;

  /** Has audio? How long? (ffmpeg-static ships without ffprobe, so read ffmpeg's banner.) */
  private probe(file: string): Promise<{ hasAudio: boolean; duration: number }> {
    return new Promise((resolve) => {
      const p = spawn(this.ffmpeg, ["-hide_banner", "-nostdin", "-i", file.replace(/^file:/, "")], { stdio: ["ignore", "ignore", "pipe"] });
      let err = "";
      p.stderr!.on("data", (d) => (err += d));
      p.on("close", () => {
        const d = /Duration: (\d+):(\d+):([\d.]+)/.exec(err);
        resolve({ hasAudio: /Stream #\S+.*Audio:/.test(err), duration: d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : 0 });
      });
    });
  }

  /** Run ffmpeg. Returns stdout when asked, null on failure (when tolerant). */
  private run(args: string[], stdout = false, tolerant = false): Promise<Buffer | null> {
    return new Promise((resolve, reject) => {
      const p = spawn(this.ffmpeg, ["-hide_banner", "-loglevel", "error", "-nostdin", ...args], { stdio: ["ignore", stdout ? "pipe" : "ignore", "pipe"] });
      const chunks: Buffer[] = [];
      let err = "";
      p.stdout?.on("data", (d) => chunks.push(d));
      p.stderr!.on("data", (d) => (err += d));
      p.on("close", (code) => {
        if (code === 0) resolve(Buffer.concat(chunks));
        else if (tolerant || stdout) resolve(null);
        else {
          if (process.env.CLIPSHOTS_DEBUG) console.error("ffmpeg failed:", args.join(" "), "\n", err);
          reject(new Error(plainFfmpegError(err)));
        }
      });
    });
  }
}

function seekArgs(t: number) {
  return ["-ss", String(Math.max(0, t))];
}

function waitUntil(fn: () => boolean, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const tick = () => {
      if (fn()) return resolve(true);
      if (Date.now() - t0 > timeoutMs) return resolve(false);
      setTimeout(tick, 100);
    };
    tick();
  });
}

function plainFfmpegError(err: string): string {
  if (/Connection refused|timed out|Server returned 4/i.test(err)) return "Lost the connection to the feed.";
  if (/No such file/i.test(err)) return "Couldn't find that recording file.";
  if (/Invalid data|moov atom/i.test(err)) return "Couldn't read that recording. If OBS is recording to MP4, switch it to MKV so it can be read while recording.";
  return "Video processing stopped unexpectedly.";
}
