// Sandboxed preload. Exposes window.clipshotsDesktop only to the Clipshots window.
import { contextBridge, ipcRenderer } from "electron";

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? "";
const allowed = arg("clipshots-allowed").split(",").filter(Boolean);

if (allowed.includes(location.origin)) {
  const listeners = new Set<(e: unknown) => void>();
  ipcRenderer.on("clipshots:event", (_e, payload) => listeners.forEach((l) => l(payload)));
  const ua = navigator.userAgent;
  const call = (ch: string) => (...a: unknown[]) => ipcRenderer.invoke(ch, ...a);
  contextBridge.exposeInMainWorld("clipshotsDesktop", {
    version: arg("clipshots-version"),
    platform: /Windows/.test(ua) ? "windows" : /Mac/.test(ua) ? "mac" : "linux",
    start: call("cs:start"),
    stop: call("cs:stop"),
    sessions: call("cs:sessions"),
    session: call("cs:session"),
    deleteSession: call("cs:deleteSession"),
    updateMoment: call("cs:updateMoment"),
    onEvent: (cb: (e: unknown) => void) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    pickFile: call("cs:pickFile"),
    showInFolder: call("cs:showInFolder"),
    openLibrary: call("cs:openLibrary"),
    libraryPath: call("cs:libraryPath"),
    mediaUrl: (p: string) => `clipshots-media://local/${encodeURIComponent(p)}`,
    saveText: call("cs:saveText"),
    exportTrim: call("cs:exportTrim"),
    getWatch: call("cs:getWatch"),
    setWatch: call("cs:setWatch"),
    getAi: call("cs:getAi"),
    setAiKey: call("cs:setAiKey"),
    testAi: call("cs:testAi"),
    openExternal: call("cs:openExternal"),
    isCatching: call("cs:isCatching"),
  });
}
