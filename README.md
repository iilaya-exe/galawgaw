# GALAWGAW

Webcam party games for two players. Ten same-screen games controlled with
your hands and body, tracked on-device with MediaPipe. Same-screen play keeps
camera frames in the browser. The new online Copy the Pose mode connects to
the separate Galawgaw_Backend server for movement, rooms and scoring, with
optional live camera sharing and opt-in cloud highlights.

## Online development

Run `npm install` and `npm run dev` in both repositories. Open
`http://localhost:5173/#online`, create a private room and send its invite to
a second browser tab. Camera access on another device requires HTTPS.
The online prototype has four target poses; the original local game retains
its expanded pose library.

No cloud credentials are needed for local room and movement testing. For
live video and highlights, follow `SETUP.md` in Galawgaw_Backend. Configure
`VITE_API_URL` in `.env` locally or as a GitHub Actions repository variable
for production builds. It is a public URL, not a secret.

deybsuanwashere

## Games

| # | Game | Mode | Tracking |
| --- | --- | --- | --- |
| 1 | Signal Pop | Versus | Hands |
| 2 | Whack-a-Mole | Versus | Hands |
| 3 | Copy the Pose | Versus | Full body |
| 4 | Ice Breaker | Versus | Hands |
| 5 | Hull Breach | Co-op | Hands |
| 6 | Freeze Frame | Versus | Full body |
| 7 | Beam Dodge | Versus | Full body |
| 8 | Tug of War | Versus | Hands |
| 9 | Vault Sync | Co-op | Full body |
| 10 | Echo | Versus | Full body |

Play a single game, **Shuffle** a random one, or run the **Gauntlet**: random
versus games back to back, three lives each, last player standing wins.

## Project layout

```text
index.html                  page shell + startup failure guard
src/main.tsx, App.tsx       React entry
src/index.css               Tailwind v4 + shadcn theme tokens
src/components/ui/          shadcn/ui components (button, card, badge, …)
src/components/arcade/      menu page, stage, HUD and overlays
src/engine/engine.ts        camera, tracking models, frame loop, match flow
src/engine/store.ts         UI state (zustand) written by the engine
src/engine/games.ts         game registry
src/game/                   the games themselves (plain JS, canvas)
```
