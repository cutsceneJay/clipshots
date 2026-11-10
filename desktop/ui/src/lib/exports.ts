// Report exports: CSV clip log, EDL, FCPXML and OTIO markers for editors.
// Times are seconds from the start of the match recording.

import { smpte, mss } from "@/lib/detect/timecode";
import { clipIn, clipOut, type BoardMatch, type BoardMoment } from "@/lib/types";

const FPS = 30;

function csvCell(v: unknown) {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(match: BoardMatch, moments: BoardMoment[]): string {
  const head = ["#", "Match", "In", "Out", "Length (s)", "Peak", "Aired at", "Category", "Label", "Score", "Reason", "Kept", "Checked by", "File"];
  const rows = moments.map((m, i) => [
    i + 1,
    match.name,
    mss(clipIn(m)),
    mss(clipOut(m)),
    (clipOut(m) - clipIn(m)).toFixed(1),
    mss(m.peak),
    m.peakAt ? new Date(m.peakAt).toLocaleTimeString() : "",
    m.category,
    m.label ?? "",
    m.score,
    m.reason,
    m.kept ? "Yes" : "No",
    m.source === "ai" ? "AI" : "Scan only",
    m.clipPath ?? "",
  ]);
  return [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** CMX3600 EDL: one event per kept moment, cut from the match recording. */
export function toEdl(match: BoardMatch, moments: BoardMoment[], reel = "MATCH"): string {
  const lines = [`TITLE: ${match.name.replace(/[^\w .-]/g, "").slice(0, 60)}`, "FCM: NON-DROP FRAME", ""];
  let rec = 3600; // record timeline starts at 01:00:00:00
  moments.forEach((m, i) => {
    const a = clipIn(m),
      b = clipOut(m);
    const len = b - a;
    lines.push(`${String(i + 1).padStart(3, "0")}  ${reel.padEnd(8).slice(0, 8)} AV    C        ${smpte(a, FPS)} ${smpte(b, FPS)} ${smpte(rec, FPS)} ${smpte(rec + len, FPS)}`);
    lines.push(`* FROM CLIP NAME: ${m.label ?? m.category} ${mss(m.peak)}`);
    lines.push(`* COMMENT: ${m.category} | score ${m.score} | ${m.reason}`);
    lines.push("");
    rec += len;
  });
  return lines.join("\n");
}

function frames(sec: number) {
  return `${Math.round(sec * FPS)}/${FPS}s`;
}
function xml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** FCPXML 1.10: the match recording with a marker per moment, plus a selects project. */
export function toFcpxml(match: BoardMatch, moments: BoardMoment[], mediaPath: string, durationSec: number): string {
  const markers = moments
    .map((m) => `          <marker start="${frames(m.peak)}" duration="${frames(clipOut(m) - clipIn(m))}" value="${xml(`${m.label ?? m.category}: ${m.reason}`)}"/>`)
    .join("\n");
  let off = 0;
  const spine = moments
    .map((m) => {
      const len = clipOut(m) - clipIn(m);
      const s = `          <asset-clip ref="r2" name="${xml(m.label ?? m.category)}" offset="${frames(off)}" start="${frames(clipIn(m))}" duration="${frames(len)}" format="r1"/>`;
      off += len;
      return s;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.10">
  <resources>
    <format id="r1" name="FFVideoFormat1080p30" frameDuration="1/30s" width="1920" height="1080"/>
    <asset id="r2" name="${xml(match.name)}" start="0s" duration="${frames(durationSec)}" hasVideo="1" hasAudio="1" format="r1">
      <media-rep kind="original-media" src="file://${encodeURI(mediaPath)}"/>
    </asset>
  </resources>
  <library>
    <event name="${xml(match.eventName ?? "Clipshots")}">
      <asset-clip ref="r2" name="${xml(match.name)}" duration="${frames(durationSec)}" format="r1">
${markers}
      </asset-clip>
      <project name="${xml(match.name)} selects">
        <sequence format="r1" duration="${frames(off)}" tcStart="0s" tcFormat="NDF">
          <spine>
${spine}
          </spine>
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>
`;
}

/** OpenTimelineIO JSON: a selects timeline referencing the match recording. */
export function toOtio(match: BoardMatch, moments: BoardMoment[], mediaPath: string): string {
  const rt = (v: number) => ({ OTIO_SCHEMA: "RationalTime.1", rate: FPS, value: Math.round(v * FPS) });
  const clips = moments.map((m) => ({
    OTIO_SCHEMA: "Clip.2",
    name: `${m.label ?? m.category} ${mss(m.peak)}`,
    metadata: { clipshots: { category: m.category, score: m.score, reason: m.reason } },
    source_range: { OTIO_SCHEMA: "TimeRange.1", start_time: rt(clipIn(m)), duration: rt(clipOut(m) - clipIn(m)) },
    media_references: { DEFAULT_MEDIA: { OTIO_SCHEMA: "ExternalReference.1", target_url: `file://${mediaPath}` } },
    active_media_reference_key: "DEFAULT_MEDIA",
    effects: [],
    markers: [],
    enabled: true,
  }));
  return JSON.stringify(
    {
      OTIO_SCHEMA: "Timeline.1",
      name: `${match.name} selects`,
      tracks: { OTIO_SCHEMA: "Stack.1", name: "tracks", children: [{ OTIO_SCHEMA: "Track.1", name: "V1", kind: "Video", children: clips }] },
    },
    null,
    2,
  );
}

export function downloadText(name: string, text: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeName(s: string) {
  return s.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "clipshots";
}
