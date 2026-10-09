# GALAWGAW

Webcam party games for two players. Ten split-screen games controlled with
your hands and body, tracked on-device with MediaPipe — no install, no
backend, and camera frames never leave the browser.

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

## Develop

Requires Node 20+.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
npm run preview    # serve dist/ locally
```

Camera access needs `https://` or `localhost`.

## Deploy

`dist/` is a static site, so any static host works. Serve it with these two
headers so MediaPipe can run multi-threaded (without them it still works,
just slower):

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: credentialless
```

`vercel.json` (Vercel) and `public/_headers` (Netlify, Cloudflare Pages)
already set them. Safari does not support `credentialless` and runs the
tracker single-threaded.

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

The UI uses [shadcn/ui](https://ui.shadcn.com). `components.json` is
configured, so more components can be added with `npx shadcn@latest add <name>`.

## Adding a game

Write a factory in `src/game/` that returns an object with `init`,
`onResults`, `update`, `draw`, `isOver`, `getHud` and `getSummary` (and
optionally `getDrill` for the warm-up), then register it in `GAMES` in
`src/engine/games.ts`. Set `mode` to `hand` or `pose`. Hand games receive an
array of 21-point hand landmarks; pose games receive 33-point poses. Convert
normalized landmarks with `toCanvasPoint` from `src/game/utils.js`, and add a
menu preview renderer in `src/game/previews.js`.
