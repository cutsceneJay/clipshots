/** Seconds are the only source of truth. These are for display and exports. */

export function mss(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
}

/** HH:MM:SS:FF at a whole frame rate. */
export function smpte(sec: number, fps = 30): string {
  const total = Math.round(Math.max(0, sec) * fps);
  const f = total % fps;
  const s = Math.floor(total / fps);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}:${p(f)}`;
}
