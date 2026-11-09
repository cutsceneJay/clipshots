import { createServerFn } from "@tanstack/react-start";
import { getCookie, setCookie } from "@tanstack/react-start/server";
import { serverEnv } from "@/server/auth";

async function digest(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`clipshots:${s}`));
  return Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");
}

/** Is the private-beta gate on, and has this browser passed it? */
export const gateStatus = createServerFn({ method: "GET" }).handler(async () => {
  const pw = serverEnv().betaPassword;
  if (!pw) return { required: false, unlocked: true };
  return { required: true, unlocked: getCookie("cs_gate") === (await digest(pw)) };
});

export const unlock = createServerFn({ method: "POST" })
  .validator((d: { password: string }) => ({ password: String(d?.password ?? "") }))
  .handler(async ({ data }) => {
    const pw = serverEnv().betaPassword;
    if (!pw) return { ok: true };
    if (data.password !== pw) return { ok: false };
    setCookie("cs_gate", await digest(pw), { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
    return { ok: true };
  });
