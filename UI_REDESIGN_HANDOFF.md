# GALAWGAW UI Redesign Handoff

Last updated: October 15, 2026

This document records the implemented redesign, the decisions behind it, completed verification, and remaining real-device checks. The redesign and local browser review are complete. Changes are still in the working tree and have not been committed or deployed.

## Goal and chosen direction

The objective was to make GALAWGAW feel like one handmade, silly movement-based party game across both same-screen and online play. The chosen direction is a compact arcade rather than a generic landing page or dashboard:

- Mint represents Player 1 and primary actions.
- Pink represents Player 2 and highlight/replay moments.
- Amber represents The Gauntlet.
- Space Grotesk is used for short expressive headings, Geist for readable interface text, and JetBrains Mono for labels and numbering.
- Games use simple numbers, solid dark surfaces, thin dividers, and clear selected states.
- The same logo, navigation, typography, language, buttons, footer, and color system are used in local and online modes.
- Decorative gradients, blobs, excessive cards, heavy shadows, blur, and animation loops were intentionally removed or avoided.

The working copy in the repository is the source of truth. Figma contains a direction sheet documenting these decisions, not a separate pixel-perfect implementation that can drift from the code.

## Figma work

The Figma connection was verified successfully for the account `Dave Javenn G. Suan`.

File used:

<https://www.figma.com/design/GUSJtHFtmKMoDvD8Wo33gt/Untitled?node-id=4-2>

A direction sheet named `GALAWGAW / Arcade direction` was added to Page 1. It documents:

- The mint, pink, and amber roles.
- The same-screen-to-online flow.
- Typography choices.
- The performance rules that must remain intact.
- The principle that the codebase is the implementation source of truth.

The sheet uses Geist and Space Grotesk and was visually checked after fixing its initial text-flow sizing.

## Code changes completed

### Shared arcade shell

Added `src/components/arcade/ArcadeShell.tsx` with:

- `ArcadeHeader`, shared by the main arcade and online play.
- A Same screen / Online mode switch.
- `ArcadeFooter`, with consistent privacy and recording language.
- `PartyPose`, a lightweight static SVG illustration of two players posing.

The artwork is deliberately static so it does not add another render loop or burden low-end devices.

### Main arcade

Rebuilt `src/components/arcade/MenuPage.tsx` around a more compact arcade layout:

- New hero: “Small games. Ridiculous moves.”
- Clear Pick a game and Play online actions.
- A horizontal Gauntlet strip instead of a large glowing promotional card.
- A game section titled “Pick your next bad idea.”
- Lightweight filter controls for all games, versus, co-op, hand, and full-body games.
- A simpler three-step explanation of camera setup and play.
- Shared header and footer.

Rebuilt `src/components/arcade/GameCard.tsx`:

- Preserved the real game preview canvases and all existing click/keyboard behavior.
- Replaced generic card UI with numbered arcade entries.
- Kept game type, tracking type, best score, and play action visible.
- Removed blur, large shadow effects, hover transforms, and per-card animation wrappers.

Added `src/arcade.css` for the shared shell, arcade page, responsive layout, game entries, Gauntlet strip, and footer.

Updated `src/index.css`:

- Imports the new arcade stylesheet.
- Replaced the multi-radial-gradient dotted backdrop with a solid background.
- Left all camera-stage, gameplay, reduced-motion, and low-performance-mode rules intact.

### Online play

Updated `src/online/Online.tsx` and `src/online/online.css`:

- Uses the same shared header and footer as the main arcade.
- New online headline: “Far apart. Equally ridiculous.”
- Replaced the single game dropdown with a browsable radio-button game list.
- Split room setup into two obvious steps: Pick your game and Get together.
- Kept private room creation, joining by code, public matchmaking, saved highlight access, privacy text, and all server calls.
- Added clearer selected-game details.
- Added a room readiness sequence: Camera ready, Partner joined, Ready to play.
- Restyled waiting, active match, result, consent, performance, and error states with the shared design language.
- Restyled highlights as “Your match. The good bits.”
- Preserved the existing camera, tracking, room, recording, and highlight logic.

Updated `src/online/GameStage.tsx` only at the presentation layer:

- Grouped stage instructions, fullscreen, and sound controls into one toolbar.
- Did not alter canvas sizes, requestAnimationFrame logic, video attachment, tracking projection, or server snapshots.

### Static information pages

Updated `scripts/build-pages.mjs` and `public/info.css` so About, Help, Contact, Privacy, and Terms feel related to the arcade:

- Reuses the existing outlined GALAWGAW wordmark.
- Copies the already-installed local Geist and Space Grotesk font files when pages are generated.
- Removes the old radial background and generic rounded-card styling.
- Uses the same dark background, mint accent, type hierarchy, and compact radii.
- Changes the footer line to “Good company. Questionable moves.”

Generated fonts and the wordmark are ignored in `.gitignore`, consistent with the other generated static-page output.

Added a small development-only middleware in `vite.config.ts` to serve the generated information-page index files at their normal trailing-slash URLs. Without it, Vite's development SPA fallback showed the arcade for `/about/` and similar links. Production routing is unchanged.

## Performance constraints preserved

The redesign must not undo the existing latency and low-end-device work. So far, it has preserved:

- Background-worker MediaPipe tracking and main-thread fallback.
- Adaptive tracking frame budgets and stale-result handling.
- Light online video as the recommended/default quality.
- Existing LiveKit bitrate and encoding settings.
- Existing server snapshot cadence, ping measurements, and direct resync behavior.
- Existing online drawing loop and canvas dimensions.
- Existing local preview manager rather than adding new preview loops.
- `prefers-reduced-motion` behavior and the existing `perf-low` camera rules.

No dependency was added. No backend game rules, scoring, room protocol, tracking code, or recording pipeline was changed.

## Verification completed

- TypeScript check passed with `npm run typecheck` after the main redesign changes.
- The main arcade was opened at desktop size and visually inspected at 1280 × 900.
- The redesigned desktop hero, mode switch, static pose artwork, Gauntlet strip, game section, typography, and spacing rendered correctly.
- The online disconnected/error state was opened and visually inspected. It correctly retained the new shared shell and showed a graceful server-unavailable state.
- The Figma direction sheet was created and visually checked.
- Static information pages were regenerated successfully with `npm run pages`.
- `npm test` passed all 11 tests, covering immediate local controls for all ten games and bounded projection.
- `npm run build` passed, including TypeScript and the production bundle, after the final routing fix.
- `git diff --check` passed (line-ending warnings only).
- All ten server-provided online games loaded; radio selection updated the selected-game summary and worked with keyboard arrows.
- Two separate local browser sessions created and joined a private Signal Pop room. The guest joined the host's game through the invite even though the guest initially selected another game. Both player names appeared, Partner joined updated, and leaving returned to the picker. Both test players left afterward.
- Main arcade, online picker, and room UI were reviewed at desktop and phone sizes, including 390px phone width. The main arcade also fit 320px width; landscape overflow was checked at 844px. No horizontal overflow was observed at the tested widths.
- Main arcade filters and arrow-key game navigation still worked.
- About, Help, Contact, Privacy, and Terms were checked through their normal links at phone width with correct headings and no broken images or horizontal overflow.
- The backend working tree remained clean, and tracking, camera, game engine, and package dependency files were unchanged by this redesign.
- Final arcade and online previews were left open at `http://127.0.0.1:5173/` and `http://127.0.0.1:5173/#online`.

## Current working-tree files

Modified:

- `.gitignore`
- `public/info.css`
- `scripts/build-pages.mjs`
- `src/components/arcade/GameCard.tsx`
- `src/components/arcade/MenuPage.tsx`
- `src/index.css`
- `src/online/GameStage.tsx`
- `src/online/Online.tsx`
- `src/online/online.css`
- `vite.config.ts`

New:

- `src/arcade.css`
- `src/components/arcade/ArcadeShell.tsx`
- `UI_REDESIGN_HANDOFF.md`

## Remaining checks and useful next work

The earlier local-backend connection problem was resolved during the continuation; private room creation and joining now work in the local preview. The local test backend reports media, highlights, and public play disabled.

1. Run a real two-device camera match, including tracking calibration, Ready to play, gameplay, results, and replay. Camera and microphone permissions were not granted during the automated review.
2. With configured media services, test live video, recording consent from both players, a rendered highlight, and opening its shared link. The visual code was updated, but actual recording/rendering was not exercised here.
3. Test public matchmaking in an environment with public play enabled; its existing behavior was retained but not exercised against the local backend.
4. Compare frame times and responsiveness on a lower-end phone before and after deployment. No new dependency or render loop was added and performance-sensitive code is unchanged, but this is not a measured device benchmark.
5. Deploy only when requested. Figma was accessible but the supplied file was initially empty, so it now contains a direction sheet derived from the product. Mobbin was intentionally not used.

## Important cautions for whoever continues

- Do not replace or refactor `src/tracking/tracker.ts`, `public/tracking-worker.js`, `src/online/camera.ts`, the game preview manager, or backend update cadence as part of visual polish.
- Do not add decorative animation loops, canvas effects, video filters, blur over live camera views, or another UI/component library.
- Keep the video and canvas elements mounted where the existing room code expects them; LiveKit track attachment depends on those refs.
- Keep online games sourced from `/api/config`; do not hardcode a frontend-only game list that could drift from the server.
- Preserve room/query/hash behavior for invite links and shared clips.
- Do not deploy or push until the final checks pass and the user asks for deployment/pushing.

## Gameplay follow-up — 15 October 2026

This section supersedes the earlier working-tree list and visual-only scope for the follow-up request. Changes are implemented locally in both galawgaw and Galawgaw_Backend; they are not committed or deployed.

- Restored the three setup steps directly below the homepage introduction. Gave Gauntlet a stronger amber treatment and separate same-screen/online actions.
- Added optional same-screen highlights: silent, captioned, local video; one 640×360 encoder at 15 fps; independently playable ten-second segments ranked by score changes. Only the best segment is retained. Clips can be previewed, downloaded, shared where file sharing is supported, or discarded. No cloud upload occurs. Recording defaults off and stops in the engine's low-performance mode. Watching a clip cancels local Gauntlet's automatic next-round timer.
- Added online Gauntlet: three lives, random versus games without immediate repeats, round history and a champion. Ties use game tiebreaks, then fewer remaining lives, then a coin toss so the series finishes.
- Online readiness now arms the player first, then requires both players' appropriate landmarks in frame for one second before a three-second countdown. Leaving position cancels the countdown. The server owns this decision.
- Added a persistent results lounge. Both players vote to continue; the host chooses the next game after ordinary matches or a completed Gauntlet. Each round gets a fresh match ID, input state and recording consent. Cameras remain connected in the lounge; trackers are released and reopened for the next game's model.
- Signal Pop, Whack-a-Mole and Copy the Pose now last 60 seconds locally and online. Other game-specific win conditions and timings remain intact.
- Kept background tracking, render budgets, lightweight camera defaults and server update cadence. No dependencies or additional rendering loop were added. Recording still has a device cost when enabled; real low-end-device benchmarking remains necessary.

### Validation and deployment

- Frontend: all 11 tests passed and production build passed.
- Backend: all 29 tests passed across the suite and focused integration rerun; production build passed. The real two-client integration covered readiness, countdown cancellation, scoring, reconnect, natural finish, host selection and returning together to a fresh Gauntlet lobby. Initial sandbox loopback isolation required rerunning that integration test outside the sandbox.
- Browser: inspected desktop homepage and online Gauntlet lobby; created and left a real local Gauntlet room. Native MediaRecorder smoke fixture produced a playable 640×360 VP8 clip (120,851 bytes, media ready state 4, no decoder error). Fixture is at /test/local-highlight.html in the development server and uses synthetic video, not a camera.
- The browser viewport override did not reliably apply the requested 390px width. A 699px view was observed without horizontal overflow, but narrow-phone validation remains outstanding.
- Still required: real two-device camera/LiveKit recording and rematch check, Safari/iPhone recording compatibility, and low-end phone performance measurement. Cloud services were disabled for local browser tests.
- Deploy frontend and backend together: the shared online protocol is now version 3. An older backend is intentionally rejected by the new frontend. No new service or environment variable is needed for same-screen recording.
- Preview used http://127.0.0.1:5174/ with an isolated backend on localhost:2567. No cloud services were used.

## Community follow-up — 16 October 2026

Implemented locally in both repositories. Nothing was deployed, pushed, or enabled in production. Existing gameplay follow-up changes were already present and have been preserved.

### Delivered

- Shared, lazy-loaded Funniest Moments section below the arcade game selection and online entry controls. Six clips per page, Featured/Latest, thumbnails first, on-demand native video, public clip URLs, comments, one laugh reaction, reports and My submissions.
- Explicit submission from completed same-screen and online highlights. Same-screen media remains local until upload; uploaders confirm everyone's permission. Both online participants must separately consent to the fixed clip/caption. Recording and private sharing do not imply public publication. Either online participant can withdraw.
- Real PostgreSQL-backed routes, schema/indexes/RLS, server-side ownership and input validation, rate limits, idempotent comments and unique reactions. New clips require moderation. Private credentials, storage paths and share tokens stay out of public JSON.
- Protected, server-rendered moderation interface with review, approve/feature/reject, comment deletion and report resolution. No admin secret is shipped to the frontend. Disabled by default and unavailable without server configuration.
- Separate community media worker: bounded MP4/WebM validation, silent 640x360/15 fps local conversion, one-time posters, reuse of rendered online clips, cleanup and recovery. Default 12 MB/30 seconds, 20 daily submissions globally, three per guest, 100 active posts. These limits do not guarantee a provider billing cap.
- Updated help, privacy and terms copy. Guest identity still lasts 24 hours in the current tab; support/removal instructions explain that limitation.

### Performance preserved

- No changes to tracking workers, camera defaults, inference budgets, game rendering, readiness/countdown logic or server simulation cadence. No app dependencies added.
- Feed mounts only in menus and loads near the viewport. Comments/viewer load only on demand. No social polling or animation loops. Closing a clip removes its video; starting gameplay unmounts the menu feed. Video processing runs in a separate service.
- Production community module: about 17.9 KB JavaScript / 5.8 KB gzip, loaded separately. This is not a real-device performance benchmark. Video proxy traffic still uses API bandwidth; staging load testing remains necessary.

### Validation

- Frontend: 11 existing tests passed; TypeScript and production build passed.
- Backend: 29 existing tests passed earlier in this task, including the real two-player reconnect/round lifecycle test; five new focused checks passed (policy, PostgreSQL HTTP integration, native FFmpeg media integration). TypeScript/production build passed.
- PostgreSQL tests cover both-participant consent, admin authentication/origin enforcement, ownership, duplicate comments/reactions, pagination, expiry/withdrawal, quota retention and upload request validation. PGlite is installed only in a temporary test directory, not an app dependency. Storage and queue are stubbed in these tests.
- Real FFmpeg integration accepts MP4 and streaming WebM without duration metadata, produces silent 640x360/15fps video/posters and rejects non-video input.
- Browser: shared main/online feeds, 390px phone viewport without horizontal overflow, clip metadata/playback readiness, guest access, comment persistence, reaction, report, empty submissions and unavailable-public-clip feedback. Escape removes video and returns keyboard focus to the clip button. Fixed muted text contrast found during visual review.
- Also checked the featured feed's empty state and a simulated API outage followed by Retry recovery, using the test harness's local-only controls.
- Preview fixtures are explicitly marked TEST and use synthetic video, not real community activity. Browser harness uses real routes and PostgreSQL operations with local media/queue adapters. It does not test LiveKit, production R2/Redis, or live two-device recording.

### Required before launch

Follow `../Galawgaw_Backend/COMMUNITY_SETUP.md`: apply `migrations/002_community.sql`, configure API/worker feature flag and limits, add a community worker service, configure private moderation credentials/origin, and set the documented R2 cleanup backstop. Keep community disabled until staging passes.

Still needed: actual R2 → Redis worker → moderation → public playback → withdrawal/cleanup round trip, Safari/iPhone recording samples, real low-end device and concurrent game/media load testing. No production service was altered. The local preview on 5175 targets an isolated test service on 26794; do not use that URL in production.
