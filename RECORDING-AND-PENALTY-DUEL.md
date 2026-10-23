# Recording and Penalty Duel — October 24, 2026

## Changes

- Each local round opens a recording dialog before camera setup and warm-up. Options: record with microphone and game audio, video only, or no recording. Back cancels the launch. Permission refusal leaves video-only and no-recording available.
- Online Get ready uses the same dialog. Audio enables the LiveKit microphone; recording still requires both players' consent. Cancelling a pending microphone request cannot mark a player ready.
- Local audio is mixed directly into the existing single recorder. Microphone is muted before gameplay and during pause, and released when recording finishes or is cancelled. Adaptive video profiles and short bounded segments remain; profile changes now finish the old segment before replacing its video track.
- Community submissions remain. Local clips carry their originating game ID, even after another round is selected. The game dropdown is removed. Online submissions already derive the game from the match.
- The backend accepts solo Spot Kick and Super Save submissions. Community processing preserves optional audio at 64 kbps mono AAC; silent inputs remain silent. Submission consent mentions people seen or heard.
- Penalty Duel is available locally, online, and in the Gauntlet: five shots per player, alternating roles, knee kick to shoot and wrist gloves to save. A six-second shot clock prevents stalled rounds. Equal goals produce a draw (the existing Gauntlet tiebreak applies there). It uses the existing two-person pose tracker.

## Deployment

Changes are in both repositories and have not been pushed. Deploy Galawgaw_Backend (game server and community worker) and galawgaw together. Online protocol is now 4; an old server is deliberately rejected by the new frontend. No new dependency or environment variable is needed.

## Checks

- Frontend tests cover recording choices, late permission cancellation, microphone pause/cleanup, adaptive video-track replacement, retained game ID, penalty saves/goals/wides, fair shot counts, timeout completion, and pose visibility.
- Backend game/render tests cover the new game and verify the shared module manifest.
- Native FFmpeg tests verify MP4/WebM audio preservation, silent input support, bounded output, and invalid-file rejection.
- Two real Colyseus clients passed positioning, countdown, scoring, reconnect, and lobby tests outside the sandbox.
- Optional PostgreSQL integration test was skipped because its standalone PGlite runtime was not configured.
- Browser review was blocked by Work settings disabling local browser access. Real-device microphone/codec playback and movement feel still need a hands-on check.

## Quick device check

1. Pick Penalty Duel: verify the recording dialog appears and Back returns to the arcade.
2. Choose audio, allow the microphone, complete warm-up, play a round, and download the clip. Check reactions and enabled game sounds are audible.
3. Repeat with video only and no recording; verify there is no microphone request for those choices.
4. Submit a saved clip after switching games. Confirm there is no game dropdown and the original game is shown in submissions.
5. Play online on two devices. Both players choose recording separately, hold position for countdown, then alternate shooting and saving. Check replay, lobby return, and a second round.
