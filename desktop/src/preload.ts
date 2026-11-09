// Sandboxed preload. Exposes window.clipshotsDesktop only to the Clipshots site.
import { contextBridge, ipcRenderer } from "electron";

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? "";
const allowed = arg("clipshots-allowed").split(",").filter(Boolean);

if (allowed.includes(location.origin)) {
  const listeners = new Set<(e: unknown) => void>();
  ipcRenderer.on("clipshots:event", (_e, payload) => listeners.forEach((l) => l(payload)));
  const ua = navigator.userAgent;
  contextBridge.exposeInMainWorld("clipshotsDesktop", {
    version: arg("clipshots-version"),
    platform: /Windows/.test(ua) ? "windows" : /Mac/.test(ua) ? "mac" : "linux",
    start: (o: unknown) => ipcRenderer.invoke("cs:start", o),
    stop: (id: string) => ipcRenderer.invoke("cs:stop", id),
    sessions: () => ipcRenderer.invoke("cs:sessions"),
    session: (id: string) => ipcRenderer.invoke("cs:session", id),
    updateMoment: (s: string, m: string, p: unknown) => ipcRenderer.invoke("cs:updateMoment", s, m, p),
    setCloud: (s: string, c: unknown) => ipcRenderer.invoke("cs:setCloud", s, c),
    onEvent: (cb: (e: unknown) => void) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    answerReview: (id: string, v: unknown) => ipcRenderer.send("cs:answerReview", id, v),
    pickFile: () => ipcRenderer.invoke("cs:pickFile"),
    showInFolder: (p: string) => ipcRenderer.invoke("cs:showInFolder", p),
    mediaUrl: (p: string) => `clipshots-media://local/${encodeURIComponent(p)}`,
    readFile: (p: string) => ipcRenderer.invoke("cs:readFile", p),
    saveText: (n: string, t: string) => ipcRenderer.invoke("cs:saveText", n, t),
    exportTrim: (s: string, m: string) => ipcRenderer.invoke("cs:exportTrim", s, m),
    getWatch: () => ipcRenderer.invoke("cs:getWatch"),
    setWatch: (f: string | null, g?: string) => ipcRenderer.invoke("cs:setWatch", f, g),
    isRendering: () => ipcRenderer.invoke("cs:isRendering"),
  });
}
