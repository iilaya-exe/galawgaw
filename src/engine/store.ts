import { create } from "zustand";

/* ═══════════════════════════════════════════════════════════════════
   UI state. The engine (engine.ts) is the only writer; React components
   read slices of it with selectors, so a HUD tick re-renders the HUD and
   nothing else.
   ═══════════════════════════════════════════════════════════════════ */

export type Phase = "menu" | "loading" | "warmup" | "countdown" | "playing" | "paused" | "over" | "error";
export type PlayMode = "single" | "shuffle" | "gauntlet";
export type StepState = "pending" | "active" | "done";
export type SlotState = "waiting" | "tracked" | "done";

export interface GameMeta {
  index: number;
  id: string;
  title: string;
  icon: string;
  blurb: string;
  players: string;
  hint?: string;
  mode: "hand" | "pose";
  coop: boolean;
}

export interface HudPod {
  value: string;
  meta: string;
  ratio: number;
  tag: string;
  accent?: string;
}

export interface HudCenter {
  value: string;
  label: string;
  ratio: number;
  danger: boolean;
}

export interface ResultRow {
  tag: string;
  text: string;
  value: string;
  ratio: number;
  color: string;
}

export interface SeriesEntry {
  round: number;
  game: string;
  winner: 1 | 2;
  how: "play" | "tiebreak" | "underdog" | "toss";
}

export interface SeriesState {
  lives: [number, number];
  round: number;
  history: SeriesEntry[];
  lastLost: 0 | 1 | null;
  over: boolean;
  /** Bumped when a life is spent, so the pip animation replays. */
  lossKey: number;
}

export interface Result {
  kicker: string;
  title: string;
  color: string;
  rows: ResultRow[];
  finale: boolean;
  statusHead: string | null;
  replayLabel: string;
  record: number | null;
  coop: boolean;
}

export interface ArcadeState {
  phase: Phase;
  playMode: PlayMode;
  game: GameMeta | null;
  steps: { cam: StepState; model: StepState; cal: StepState };
  error: string;
  warm: {
    label: string;
    tip: string;
    coop: boolean;
    slots: [{ state: SlotState; text: string }, { state: SlotState; text: string }];
  };
  count: { value: string; hint: string };
  hud: { p1: HudPod; p2: HudPod; center: HudCenter | null };
  series: SeriesState;
  result: Result | null;
  autoNext: { active: boolean; seconds: number; ratio: number };
  telemetry: { fps: number; subjects: number; delegate: "GPU" | "CPU" | null; camera: boolean };
  muted: boolean;
  perfLow: boolean;
  records: Record<string, number>;
}

const emptyPod = (tag: string): HudPod => ({ value: "0", meta: "", ratio: 0, tag });

export const initialSeries = (lives: number): SeriesState => ({
  lives: [lives, lives],
  round: 0,
  history: [],
  lastLost: null,
  over: false,
  lossKey: 0,
});

export const useArcade = create<ArcadeState>()(() => ({
  phase: "menu",
  playMode: "single",
  game: null,
  steps: { cam: "pending", model: "pending", cal: "pending" },
  error: "",
  warm: {
    label: "TRY IT OUT",
    tip: "Try it out",
    coop: false,
    slots: [
      { state: "waiting", text: "0/2" },
      { state: "waiting", text: "0/2" },
    ],
  },
  count: { value: "3", hint: "" },
  hud: { p1: emptyPod("P1"), p2: emptyPod("P2"), center: null },
  series: initialSeries(3),
  result: null,
  autoNext: { active: false, seconds: 0, ratio: 0 },
  telemetry: { fps: 0, subjects: 0, delegate: null, camera: false },
  muted: false,
  perfLow: false,
  records: {},
}));

export const emptyHud = () => ({ p1: emptyPod("P1"), p2: emptyPod("P2"), center: null });
