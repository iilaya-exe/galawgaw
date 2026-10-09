import { createSignalPop } from "@/game/signalPop.js";
import { createWhackAMole } from "@/game/whackAMole.js";
import { createCopyPose } from "@/game/copyPose.js";
import { createIceBreaker } from "@/game/iceBreaker.js";
import { createHullBreach } from "@/game/hullBreach.js";
import { createFreezeFrame } from "@/game/freezeFrame.js";
import { createBeamDodge } from "@/game/beamDodge.js";
import { createTugOfWar } from "@/game/tugOfWar.js";
import { createVaultSync } from "@/game/vaultSync.js";
import { createEcho } from "@/game/echoGame.js";
import type { GameMeta } from "./store";

/* ═══════════════════════════════════════════════════════════════════
   Game contract — every factory returns an object with:

     id, title, icon, blurb, players, mode ("hand" | "pose"), numHands?
     init({ canvas, ctx, view, practice? })   view = logical CSS-pixel size
     onResize(view)                geometry must be rebuilt, not scaled
     onResults(landmarks)
     update(dt)  /  draw(ctx)  /  isOver()
     getHud()      -> { p1, p2, center } for the DOM heads-up display
     getSummary()  -> { title, color, rows[], record, winner, tiebreak }
     getDrill()    -> warm-up objective (optional)

   Games never draw their own score text: the HUD is DOM, so it stays
   crisp and consistent across every channel.
   ═══════════════════════════════════════════════════════════════════ */

// The game modules are plain JS; this is the shape the engine relies on.
export type GameInstance = Record<string, any> & {
  id: string;
  title: string;
  icon: string;
  blurb: string;
  players: string;
  hint?: string;
  mode: "hand" | "pose";
  coop?: boolean;
  numHands?: number;
  numPoses?: number;
  tutorial?: string[];
};
export type GameFactory = () => GameInstance;

export const GAMES: GameFactory[] = [
  createSignalPop, createWhackAMole, createCopyPose, createIceBreaker, createHullBreach,
  createFreezeFrame, createBeamDodge, createTugOfWar, createVaultSync, createEcho,
] as GameFactory[];

// Metadata is stable, so build it once instead of re-instantiating games.
export const META: GameMeta[] = GAMES.map((factory, index) => {
  const game = factory();
  return {
    index,
    id: game.id,
    title: game.title,
    icon: game.icon,
    blurb: game.blurb,
    players: game.players,
    hint: game.hint,
    mode: game.mode,
    coop: !!game.coop,
  };
});

// Per-card accent, cycling through the palette.
export const ACCENTS = [
  "var(--p1)", "var(--p2)", "var(--violet)", "var(--ice)", "var(--amber)",
  "var(--danger)", "var(--amber)", "var(--p2)", "var(--violet)", "var(--ice)",
];
