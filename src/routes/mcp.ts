import { createFileRoute } from "@tanstack/react-router";
import { userFromRequest } from "@/server/auth";
import { handleRpc } from "@/server/mcp";

const json = (b: unknown, status = 200, h: Record<string, string> = {}) => new Response(b === null ? null : JSON.stringify(b), { status: b === null ? 202 : status, headers: { "content-type": "application/json", ...h } });

export const Route = createFileRoute("/mcp")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await userFromRequest(request);
        if (!auth) {
          const origin = new URL(request.url).origin;
          return json({ error: "unauthorized" }, 401, { "WWW-Authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"` });
        }
        const body = await request.json().catch(() => null);
        if (Array.isArray(body)) return json((await Promise.all(body.map((m) => handleRpc(auth.supabase, m)))).filter(Boolean));
        return json(await handleRpc(auth.supabase, body));
      },
      GET: async () => new Response("Method not allowed", { status: 405 }),
    },
  },
});
