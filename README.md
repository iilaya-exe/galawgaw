# GALAWGAW

Webcam party games for two players. Ten split-screen games controlled with
your hands and body, tracked on-device with MediaPipe — no install, no
backend, and camera frames never leave the browser.

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
