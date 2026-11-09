# Clipshots

A live highlight catcher for esports broadcasts, by Cutscene Creative.

Clipshots watches a broadcast so the producer doesn't have to. When something big happens (a multi-kill, a clutch, an objective, a team fight, caster hype, a crowd pop) it cuts that moment into an MP4 a few seconds after it airs, labels it, and adds it to a report the whole team can follow live. It works the same way on past videos: YouTube and Twitch VODs, social posts, or a file on your computer.

## How it fits together

- **Desktop app** (`desktop/`, Windows and Mac) runs on the production computer. It takes a live stream link, a past video link, the recording OBS or vMix is writing, a finished file, or an SRT/RTMP program feed. It keeps a rolling recording, scans picture and sound continuously, cuts each moment as a real MP4, and asks the AI to name and categorize it. Clips are saved in Videos\Clipshots (Windows) or Movies/Clipshots (Mac). It can also auto-catch any new recording that appears in your OBS folder.
- **Web app** (TanStack Start on Cloudflare, editable in Lovable) is the report: events, matches, a live board that fills in during the show, a match summary afterwards, keep/skip and trim, a CSV clip log, and EDL / FCPXML / OTIO files for Premiere, Resolve and Final Cut. Teammates are invited per event as viewers or editors.
- **Detection** (`src/lib/detect/`) is shared by both. Pass 1 ranks motion, flashes, fire/explosion colors, loudness and sharp sounds against the feed's own recent history, rewards sound and picture spiking together, and ignores static screens. Pass 2 sends build-up, peak and payoff frames to Gemini 2.5 Flash, which keeps or rejects the moment and labels it with game-specific terms. Final score is 70% AI, 30% scan; rejected moments are capped at 45 and skipped. With no AI, clips are kept with an honest "Not checked by AI" tag. Nothing is ever made up.

## Setting it up

1. Create a Supabase project. Run the SQL in `supabase/migrations/` in order. Turn on Google and email sign-in.
2. Copy `.env.example` to `.env` and fill it in. On Cloudflare, add the server values as secrets. `LOVABLE_API_KEY` turns on AI review.
3. Put the live site address in `desktop/config.json` (`appUrl` and `allowedOrigins`). The desktop API is only given to those addresses.
4. Desktop builds come from the **Desktop builds** GitHub workflow. Signing is optional: add `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`, `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD` as repository secrets. Without them, Mac builds are ad-hoc signed and Windows builds are unsigned (Windows will show a SmartScreen warning).

## Checks

```
npm test                      # detection, AI-merge, review request, MCP
npm run test:rls              # privacy rules on a throwaway Postgres
npm run test:footage          # builds the proof videos
npm run proof:scan            # catches moments from the 120 s test video
npm run proof:live            # same, fed in real time, with clip delay
npm run proof:srt             # real-time SRT program feed
npm run proof:vod             # past video downloaded by link
cd desktop && npm run test:e2e  # real Electron app under Xvfb
```

The CI workflow runs all of these on every push.

## Agent access

`/mcp` is an MCP server. Tools: list/create/update events, list matches, get a match report, keep or skip a moment. Each call runs as the signed-in user.

© 2020 Cutscene Creative · info@cutscenecreative.com
