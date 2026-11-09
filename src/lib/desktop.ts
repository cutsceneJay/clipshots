// The desktop app exposes window.clipshotsDesktop to the Clipshots site only.
// Everything here must cope with it being absent (a normal browser).

import type { Moment } from "@/lib/detect/merge";
import type { ScanCandidate } from "@/lib/detect/scanner";
import type { ReviewFrame } from "@/lib/detect/review";

export type SourceKind = "url" | "vod" | "file" | "srt" | "rtmp" | "recording";

export interface LocalMoment extends Moment {
  clipPath: string;
  thumbPath: string;
  peakAt: string | null;
  latencySec: number | null;
  trimStart?: number | null;
  trimEnd?: number | null;
  cloudId?: string | null;
}

export interface LocalSession {
  id: string;
  eventName: string;
  matchName: string;
  game: string;
  context?: string;
  sourceKind: SourceKind;
  sourceLabel: string;
  status: "live" | "ended" | "failed";
  startedAt: string;
  endedAt: string | null;
  folder: string;
  moments: LocalMoment[];
  cloud?: { eventId: string; matchId: string } | null;
  error?: string | null;
  durationSec?: number;
}

export type CatcherEvent =
  | { type: "status"; sessionId: string; text: string }
  | { type: "level"; sessionId: string; t: number; level: number }
  | { type: "moment"; sessionId: string; moment: LocalMoment }
  | { type: "ended"; sessionId: string }
  | { type: "error"; sessionId: string; message: string }
  | { type: "review"; requestId: string; sessionId: string; candidate: ScanCandidate; frames: ReviewFrame[]; game: string; context?: string };

export interface StartOptions {
  eventName: string;
  matchName: string;
  game: string;
  context?: string;
  source: { kind: SourceKind; value: string };
  cloud?: { eventId: string; matchId: string } | null;
}

export interface ClipshotsDesktop {
  version: string;
  platform: string;
  start(o: StartOptions): Promise<{ sessionId: string }>;
  stop(sessionId: string): Promise<void>;
  sessions(): Promise<LocalSession[]>;
  session(id: string): Promise<LocalSession | null>;
  updateMoment(sessionId: string, momentId: string, patch: Partial<Pick<LocalMoment, "kept" | "trimStart" | "trimEnd" | "cloudId">>): Promise<void>;
  setCloud(sessionId: string, cloud: { eventId: string; matchId: string }): Promise<void>;
  onEvent(cb: (e: CatcherEvent) => void): () => void;
  answerReview(requestId: string, verdict: unknown | null): void;
  pickFile(): Promise<string | null>;
  showInFolder(path: string): Promise<void>;
  mediaUrl(path: string): string;
  readFile(path: string): Promise<ArrayBuffer>;
  saveText(defaultName: string, text: string): Promise<string | null>;
  /** Trim a saved clip into a new MP4 file next to it. */
  exportTrim(sessionId: string, momentId: string): Promise<string>;
  /** Auto-catch new recordings that appear in a folder (OBS, ShadowPlay, Xbox Game Bar). */
  getWatch(): Promise<{ folder: string | null; game: string }>;
  setWatch(folder: string | null | "pick", game?: string): Promise<{ folder: string | null; game: string }>;
  isRendering(): Promise<boolean>;
}

declare global {
  interface Window {
    clipshotsDesktop?: ClipshotsDesktop;
  }
}

export function desktop(): ClipshotsDesktop | null {
  return typeof window !== "undefined" && window.clipshotsDesktop ? window.clipshotsDesktop : null;
}
