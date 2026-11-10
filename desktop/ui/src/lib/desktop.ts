// The Electron preload exposes window.clipshotsDesktop to the app window only.

import type { Moment } from "@/lib/detect/merge";

export type SourceKind = "url" | "vod" | "file" | "srt" | "rtmp" | "recording";

export interface LocalMoment extends Moment {
  clipPath: string;
  thumbPath: string;
  peakAt: string | null;
  latencySec: number | null;
  trimStart?: number | null;
  trimEnd?: number | null;
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
  error?: string | null;
  durationSec?: number;
}

export type CatcherEvent =
  | { type: "status"; sessionId: string; text: string }
  | { type: "level"; sessionId: string; t: number; level: number }
  | { type: "moment"; sessionId: string; moment: LocalMoment }
  | { type: "ended"; sessionId: string }
  | { type: "error"; sessionId: string; message: string };

export interface StartOptions {
  eventName: string;
  matchName: string;
  game: string;
  context?: string;
  source: { kind: SourceKind; value: string };
}

export interface AiStatus {
  hasKey: boolean;
  /** Whether the OS can encrypt the key at rest. */
  encrypted: boolean;
}

export interface ClipshotsDesktop {
  version: string;
  platform: string;
  start(o: StartOptions): Promise<{ sessionId: string }>;
  stop(sessionId: string): Promise<void>;
  sessions(): Promise<LocalSession[]>;
  session(id: string): Promise<LocalSession | null>;
  deleteSession(id: string): Promise<void>;
  updateMoment(sessionId: string, momentId: string, patch: Partial<Pick<LocalMoment, "kept" | "trimStart" | "trimEnd">>): Promise<void>;
  onEvent(cb: (e: CatcherEvent) => void): () => void;
  pickFile(): Promise<string | null>;
  showInFolder(path: string): Promise<void>;
  openLibrary(): Promise<void>;
  libraryPath(): Promise<string>;
  mediaUrl(path: string): string;
  saveText(defaultName: string, text: string): Promise<string | null>;
  /** Trim a saved clip into a new MP4 file next to it. */
  exportTrim(sessionId: string, momentId: string): Promise<string>;
  /** Auto-catch new recordings that appear in a folder (OBS, ShadowPlay, Xbox Game Bar). */
  getWatch(): Promise<{ folder: string | null; game: string }>;
  setWatch(folder: string | null | "pick", game?: string): Promise<{ folder: string | null; game: string }>;
  getAi(): Promise<AiStatus>;
  /** Save (or with null, remove) the Gemini key. */
  setAiKey(key: string | null): Promise<AiStatus>;
  /** Send a tiny request to check the saved key works. */
  testAi(): Promise<{ ok: boolean; message: string }>;
  openExternal(url: string): Promise<void>;
  isCatching(): Promise<boolean>;
}

declare global {
  interface Window {
    clipshotsDesktop?: ClipshotsDesktop;
  }
}

export function desktop(): ClipshotsDesktop {
  if (typeof window === "undefined" || !window.clipshotsDesktop) throw new Error("Clipshots must run inside the desktop app.");
  return window.clipshotsDesktop;
}
