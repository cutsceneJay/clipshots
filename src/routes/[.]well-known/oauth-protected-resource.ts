// OAuth discovery for MCP clients: sign in with your Clipshots (Supabase) account.
import { createFileRoute } from "@tanstack/react-router";
import { serverEnv } from "@/server/auth";

export const Route = createFileRoute("/.well-known/oauth-protected-resource")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const origin = new URL(request.url).origin;
        const { supabaseUrl } = serverEnv();
        return new Response(
          JSON.stringify({ resource: `${origin}/mcp`, authorization_servers: supabaseUrl ? [`${supabaseUrl}/auth/v1`] : [], bearer_methods_supported: ["header"] }),
          { headers: { "content-type": "application/json" } },
        );
      },
    },
  },
});
