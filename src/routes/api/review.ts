// AI review of one caught moment. Called by the desktop catcher (through the
// signed-in page). The AI key stays here on the server.
import { createFileRoute } from "@tanstack/react-router";
import { userFromRequest, serverEnv } from "@/server/auth";
import { buildReviewRequest, parseVerdict, GATEWAY_URL, MAX_REQUEST_BYTES, type ReviewInput } from "@/lib/detect/review";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export const Route = createFileRoute("/api/review")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await userFromRequest(request);
        if (!auth) return json({ error: "Please sign in to use AI review." }, 401);
        const { lovableKey } = serverEnv();
        if (!lovableKey) return json({ error: "AI review isn't set up yet." }, 503);
        let input: ReviewInput;
        try {
          input = (await request.json()) as ReviewInput;
        } catch {
          return json({ error: "Bad request" }, 400);
        }
        if (!input?.candidate || !Array.isArray(input.frames)) return json({ error: "Bad request" }, 400);
        const body = JSON.stringify(buildReviewRequest(input));
        if (body.length > MAX_REQUEST_BYTES) return json({ error: "Too many frames" }, 413);
        const res = await fetch(GATEWAY_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${lovableKey}`, "content-type": "application/json" },
          body,
        });
        if (res.status === 429) return json({ error: "AI is busy, try again shortly." }, 429);
        if (res.status === 402) return json({ error: "AI credits have run out." }, 402);
        if (!res.ok) return json({ error: "AI review failed." }, 502);
        const verdict = parseVerdict(await res.json());
        if (!verdict) return json({ error: "AI gave an unreadable answer." }, 502);
        return json({ verdict });
      },
    },
  },
});
