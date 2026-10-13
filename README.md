# GALAWGAW

Webcam party games for two players. Ten same-screen games controlled with
your hands and body, tracked on-device with MediaPipe. Same-screen play keeps
camera frames in the browser. Online play supports all ten games and connects to
the separate Galawgaw_Backend server for movement, rooms and scoring, with
optional live camera sharing and opt-in cloud highlights.

## Online development

Run `npm install` and `npm run dev` in both repositories. Open
`http://localhost:5173/#online`, create a private room and send its invite to
a second browser tab. Camera access on another device requires HTTPS.
Choose a game before creating a room or finding a public opponent. Joining an
invite uses the host's game. The server runs the same game modules as local play,
including Copy the Pose's expanded library and the two cooperative games.

After changing `src/game`, run `node scripts/sync-games.mjs` in the backend repo
to update its vendored rules. Both deployments share online protocol version 2.
Deploy the backend and highlight worker before the frontend; the online page
will explain a version mismatch instead of trying to play incompatible rules.

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

## Site information and AdSense

`npm run dev` and `npm run build` generate static `/about/`, `/help/`,
`/contact/`, `/privacy/`, and `/terms/` pages, plus a sitemap. Edit the content in
`scripts/site-pages.mjs` and styling in `public/info.css`; run `npm run pages`
after editing during development. Generated HTML in `public/` is ignored by
Git and regenerated before deployment. The game instructions are taken directly
from the game registry. These pages work without JavaScript or camera access.

Support and privacy requests go to `ponj.suan@gmail.com`. The arcade, online
rooms, and clip pages link to the information pages. The privacy text separates
the backend's 30-day clip access expiry from storage cleanup: R2 lifecycle
rules and database retention are separate deployment settings. Verify the
backend's `SETUP.md` retention steps before claiming timed file deletion.

`public/ads.txt` contains the Google direct-seller entry for publisher
`pub-6484144302656332`. `public/robots.txt` points to the generated sitemap.
After deployment, verify these files and the new pages on galawgaw.com.
Configure the applicable consent message in AdSense's **Privacy & messaging**
and review actual vendor settings; adding these pages does not configure a CMP
or guarantee AdSense approval. Informational pages do not load ad scripts.

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
