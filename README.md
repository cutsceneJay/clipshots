# Clipshots

A desktop app for Windows and Mac that catches the big moments in esports broadcasts, by Cutscene Creative.

Clipshots watches a broadcast so the producer doesn't have to. When something big happens (a multi-kill, a clutch, an objective, a team fight, caster hype, a crowd pop), it cuts that moment into an MP4 a few seconds after it airs, labels it, and adds it to a match report. It works the same way on past videos: YouTube and Twitch VODs, social posts, or a file on your computer.

Everything runs and is saved on your computer (Videos\Clipshots on Windows, Movies/Clipshots on Mac). There's no account and no website.

## What it can watch

- A live Twitch or YouTube link
- A past video link (VODs, X, TikTok, Instagram)
- The recording OBS or vMix is writing right now (record to MKV)
- A finished file on your computer
- An SRT or RTMP program feed
- Any new recording that appears in your OBS / ShadowPlay folder (auto-catch)

## The report

A live board during the match, then a summary with the top moments, keep/skip and trim per clip, MP4 per moment, a CSV clip log, and EDL / FCPXML / OTIO files for Premiere, Resolve and Final Cut. The full match recording is kept for editors.

## AI labels (optional)

Paste a free Google AI key (aistudio.google.com/apikey) in Settings. Clipshots then sends a few still frames per moment to Gemini 2.5 Flash, which keeps or rejects the moment and names it with game-specific terms (Ace, Baron steal, Perfect). Final score is 70% AI, 30% scan; rejected moments are capped at 45 and skipped. Without a key, moments are still caught and shown as "Not checked by AI". Nothing is made up.

## Project layout

- `desktop/` the app: Electron main process (`src/`), the catcher (`engine/`), the window (`ui/`)
- `src/lib/detect/` the detection core shared by the app and the tests
- `test/proofs/` real-footage proofs; `scripts/make-test-footage.sh` builds the test videos

## Checks

```
npm ci && npm test                 # detection core
bash scripts/make-test-footage.sh  # test videos
npm run proof:scan                 # catch moments from the 120 s test video
cd desktop && npm ci && npm run test:e2e   # the real app, end to end
```

CI runs all of these on every push. The **Desktop builds** workflow (Actions tab, Run workflow) makes the Windows installer, a portable exe and Mac dmgs. Optional signing secrets: MAC_CSC_LINK, MAC_CSC_KEY_PASSWORD, APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID, WIN_CSC_LINK, WIN_CSC_KEY_PASSWORD.

© 2020 Cutscene Creative · info@cutscenecreative.com
