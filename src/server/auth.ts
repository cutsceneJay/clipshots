// Server-only helpers. Keys never leave the server.
import { createClient } from "@supabase/supabase-js";
import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

function env(name: string): string | undefined {
  return (globalThis as any).process?.env?.[name];
}

export function serverEnv() {
  return {
    supabaseUrl: env("SUPABASE_URL") ?? env("VITE_SUPABASE_URL"),
    supabaseKey: env("SUPABASE_PUBLISHABLE_KEY") ?? env("VITE_SUPABASE_PUBLISHABLE_KEY") ?? env("SUPABASE_ANON_KEY"),
    lovableKey: env("LOVABLE_API_KEY"),
    betaPassword: env("BETA_PASSWORD"),
  };
}

/** Resolve the signed-in user from a Bearer token. Returns null if not signed in. */
export async function userFromRequest(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const { supabaseUrl, supabaseKey } = serverEnv();
  if (!token || !supabaseUrl || !supabaseKey) return null;
  const sb = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) return null;
  return { user: data.user, supabase: sb };
}

/** Server-function middleware: requires a signed-in user, gives handlers a user-scoped client. */
export const authMiddleware = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const auth = await userFromRequest(getRequest());
  if (!auth) throw new Error("Please sign in again.");
  return next({ context: auth });
});
