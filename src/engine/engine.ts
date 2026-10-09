import type { HandLandmarker, PoseLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { toast } from "sonner";
import { startPreviews, stopPreviews, measurePreviews } from "@/game/previews.js";
import { sfx, unlock, isMuted, setMuted } from "@/game/audio.js";
import { pickRandom, toCanvasPoint, palmCenter } from "@/game/utils.js";
import { C } from "@/game/theme.js";
import { GAMES, META, type GameFactory, type GameInstance } from "./games";
import {
  useArcade, initialSeries, emptyHud,
  type ArcadeState, type HudPod, type Phase, type PlayMode, type ResultRow, type SeriesEntry, type SlotState,
} from "./store";

/* ═══════════════════════════════════════════════════════════════════
   The engine owns the camera, the tracking models and the frame loop.
   It writes UI state into the store; it never touches the DOM beyond the
   <video> and <canvas> it is attached to.
   ═══════════════════════════════════════════════════════════════════ */

// Must match the installed @mediapipe/tasks-vision version exactly.
const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const POSE_MODEL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
const HAND_MODEL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

// The gauntlet is a last-player-standing format, so it can only draw on
// versus channels — a co-op round has no loser to take a life from.
const VERSUS_GAMES = GAMES.filter((_, index) => !META[index].coop);

const set = useArcade.setState;
const get = useArcade.getState;

type Landmarker = HandLandmarker | PoseLandmarker;
type Point = { x: number; y: number; z?: number };

let video: HTMLVideoElement | null = null;
let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;

const view = { width: 1, height: 1, videoWidth: 0, videoHeight: 0 };

/* ── Adaptive quality ────────────────────────────────────────────────
   The camera grade, glass blur and a HiDPI canvas are all free on a
   machine with GPU acceleration and ruinous on one without. Rather than
   pick a side, measure: if the frame rate sits on the floor, drop the
   decoration and render 1:1.
   ─────────────────────────────────────────────────────────────────── */
const PERF_LOW_FPS = 20;
const PERF_GRACE_MS = 3000;   // sustained, so a slow first second never trips it
let perfLow = false;
let perfBadSince = 0;

let selectedFactory: GameFactory | null = null;
let currentGame: GameInstance | null = null;
let cameraStream: MediaStream | null = null;
const landmarkers = new Map<string, Landmarker>();  // "hand:4" -> instance, so numHands is honoured
let rafId: number | null = null;
let lastFrameTime = 0;
let lastVideoTime = -1;
let sequenceToken = 0;        // cancels an in-flight countdown/boot
let subjects = 0;
let lastResults: Point[][] = [];
let noSubjectSince = 0;
let toastUntil = 0;

/* ── Play modes ──────────────────────────────────────────────────────
   "single"   one chosen channel, rematch replays the same one
   "shuffle"  a random channel; rematch deals another
   "gauntlet" random channels back to back, three lives each — a match
              loss costs a life, and the series ends when someone hits 0
   ─────────────────────────────────────────────────────────────────── */
export const SERIES_LIVES = 3;
let playMode: PlayMode = "single";
let lastDecision: { winner: 1 | 2; how: SeriesEntry["how"] } | null = null;
const series = () => get().series;

function resetSeries() {
  lastDecision = null;
  set({ series: initialSeries(SERIES_LIVES) });
}

function setPhase(phase: Phase) {
  const previous = get().phase;
  if (phase !== "over") cancelAutoNext();
  if (phase === "menu") startPreviews("menu");
  else if (previous === "menu") stopPreviews();

  const meta = currentGame && phase !== "menu"
    ? META[GAMES.findIndex((f) => f === selectedFactory)] ?? null
    : null;
  set({ phase, playMode, game: meta });
  document.documentElement.toggleAttribute("data-playing", phase !== "menu");
}

function flash(message: string, ms = 2200) {
  toastUntil = performance.now() + ms;
  toast(message, { id: "coach", duration: ms });
}

/* ── Canvas sizing (HiDPI-correct) ───────────────────────────────── */
function syncVideoSize() {
  view.videoWidth = video?.videoWidth || 0;
  view.videoHeight = video?.videoHeight || 0;
}

function layout() {
  if (!canvas || !ctx) return;
  syncVideoSize();
  const rect = canvas.getBoundingClientRect();
  // Performance mode renders the canvas 1:1 with CSS pixels. On a 1.5x
  // display that is less than half the pixels to clear and redraw a frame.
  const dpr = perfLow ? 1 : Math.min(window.devicePixelRatio || 1, 2);
  view.width = Math.max(1, Math.round(rect.width));
  view.height = Math.max(1, Math.round(rect.height));
  canvas.width = Math.round(view.width * dpr);
  canvas.height = Math.round(view.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/* ── Records ─────────────────────────────────────────────────────── */
const recordKey = (id: string) => `sa.best.${id}`;

// Storage access throws outright in some privacy modes; records are a nicety,
// never a reason for the app to fail to start.
function getRecord(id: string) {
  try { return Number(localStorage.getItem(recordKey(id)) || 0); }
  catch { return 0; }
}
function setRecord(id: string, value: number) {
  try { localStorage.setItem(recordKey(id), String(value)); } catch { /* ignore */ }
}
function loadRecords() {
  set({ records: Object.fromEntries(META.map((meta) => [meta.id, getRecord(meta.id)])) });
}

/* ── Camera + models ─────────────────────────────────────────────── */
function cameraLive() {
  return !!cameraStream && cameraStream.getVideoTracks().some((track) => track.readyState === "live");
}

function setTelemetry(patch: Partial<ArcadeState["telemetry"]>) {
  const current = get().telemetry;
  const changed = (Object.keys(patch) as (keyof typeof patch)[]).some((key) => current[key] !== patch[key]);
  if (changed) set({ telemetry: { ...current, ...patch } });
}

async function startCamera() {
  if (cameraLive() || !video) return;
  /* 540p at 30fps, not 720p at whatever the camera offers. The tracking
     models downscale to their own fixed input either way, so the extra
     pixels buy no accuracy — they only cost decode, upload and the CSS
     grade, every frame. The frame-rate cap matters just as much: detection
     runs once per *new camera frame*, so a 60fps webcam quietly doubles the
     inference bill for nothing. */
  cameraStream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: "user",
      width: { ideal: 960 },
      height: { ideal: 540 },
      frameRate: { ideal: 30, max: 30 },
    },
    audio: false,
  });
  video.srcObject = cameraStream;
  if (video.readyState < 2) {
    await new Promise((resolve) => { video!.onloadedmetadata = resolve; });
  }
  await video.play();
  syncVideoSize();
  lastVideoTime = -1;
  setTelemetry({ camera: true });
}

function stopCamera() {
  cameraStream?.getTracks().forEach((track) => track.stop());
  cameraStream = null;
  if (video) video.srcObject = null;
  lastVideoTime = -1;
  setTelemetry({ camera: false, subjects: 0 });
}

// The tracker is most of the bundle, and the menu needs none of it, so it
// loads on the first launch rather than holding up the first paint.
const loadTasks = () => import("@mediapipe/tasks-vision");
let visionPromise: ReturnType<typeof FilesetResolver.forVisionTasks> | null = null;
function getVision() {
  visionPromise ??= loadTasks().then(({ FilesetResolver }) => FilesetResolver.forVisionTasks(WASM_BASE));
  return visionPromise;
}

const landmarkerKey = (game: GameInstance) =>
  `${game.mode}:${game.mode === "pose" ? (game.numPoses || 2) : (game.numHands || 2)}`;

// Cached per mode *and* per hand count — Whack-a-Mole needs four hands,
// the others only two, and a landmarker's numHands is fixed at creation.
async function getLandmarker(game: GameInstance): Promise<Landmarker> {
  const key = landmarkerKey(game);
  const cached = landmarkers.get(key);
  if (cached) return cached;
  const count = Number(key.split(":")[1]);
  const vision = await getVision();
  const { HandLandmarker, PoseLandmarker } = await loadTasks();

  const build = (delegate: "GPU" | "CPU"): Promise<Landmarker> => (game.mode === "pose"
    ? PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: POSE_MODEL, delegate },
        runningMode: "VIDEO",
        numPoses: count,
      })
    : HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: HAND_MODEL, delegate },
        runningMode: "VIDEO",
        numHands: count,
      }));

  // The GPU delegate is the fast path but is not available everywhere —
  // WebKit in particular can refuse it. Falling back to CPU keeps the game
  // playable at a lower frame rate instead of failing outright.
  let instance: Landmarker;
  try {
    instance = await build("GPU");
    setTelemetry({ delegate: "GPU" });
  } catch (error) {
    console.warn("GPU delegate unavailable, falling back to CPU", error);
    instance = await build("CPU");
    setTelemetry({ delegate: "CPU" });
    flash("GPU unavailable — tracking is running on the CPU", 3200);
  }

  landmarkers.set(key, instance);
  return instance;
}

function setStep(step: keyof ArcadeState["steps"], value: ArcadeState["steps"]["cam"]) {
  set({ steps: { ...get().steps, [step]: value } });
}

/* ── Play-mode entry points ──────────────────────────────────────── */

export function startSingle(index: number) {
  playMode = "single";
  resetSeries();
  void launch(GAMES[index]);
}

// A random channel, never the one just played.
export function startShuffle() {
  playMode = "shuffle";
  resetSeries();
  void launch(pickRandom(GAMES, selectedFactory));
}

export function startGauntlet() {
  playMode = "gauntlet";
  resetSeries();
  nextRound();
}

function nextRound() {
  set({ series: { ...series(), round: series().round + 1, lastLost: null } });
  void launch(pickRandom(VERSUS_GAMES, selectedFactory));
}

// What the primary results button does next, given the mode.
export function primaryAction() {
  if (playMode === "gauntlet") return series().over ? startGauntlet() : nextRound();
  if (playMode === "shuffle") return startShuffle();
  void launch(selectedFactory);
}

export function retry() {
  void launch(selectedFactory);
}

/* ── Warm-up ─────────────────────────────────────────────────────────
   Every match opens with a short, real playthrough of the channel rather
   than a wall of text. The game runs with its teeth pulled — no bombs, no
   clock, no flooding — and each player has a small objective to complete.
   Finishing the drill proves the tracking works far better than a readout
   does, because you only complete it by actually being seen.
   ─────────────────────────────────────────────────────────────────── */
const WARMUP_TIMEOUT = 40;   // start anyway rather than trapping anyone
const TIP_EVERY = 3.6;       // seconds each tutorial line stays up
let warmElapsed = 0;
let warmResolve: (() => void) | null = null;
let present = [false, false];

function warmup(token: number) {
  return new Promise<void>((resolve) => {
    warmResolve = () => { warmResolve = null; resolve(); };
    warmElapsed = 0;
    present = [false, false];

    const game = currentGame!;
    const drill = game.getDrill?.();
    const coop = !!game.coop;
    set({
      warm: {
        label: drill?.label || "TRY IT OUT",
        tip: "Try it out",
        coop,
        slots: [
          { state: "waiting", text: `0/${drill?.target ?? 1}` },
          { state: "waiting", text: `0/${drill?.target ?? 1}` },
        ],
      },
    });

    // Real game, practice settings.
    game.init({ canvas, ctx, view, practice: true });

    setPhase("warmup");
    startLoop();

    if (token !== sequenceToken) warmResolve?.();
  });
}

// Which halves of the frame currently hold a tracked player.
function detectPresence() {
  const found = [false, false];
  if (!currentGame) return found;

  if (currentGame.mode === "pose") {
    for (const pose of lastResults) {
      if (!pose[11] || !pose[12] || !pose[23] || !pose[24]) continue;
      const shoulders = (pose[11].x + pose[12].x) / 2;
      const hips = (pose[23].x + pose[24].x) / 2;
      const centre = 1 - (shoulders + hips) / 2;   // mirrored screen space
      found[centre < 0.5 ? 0 : 1] = true;
    }
  } else {
    for (const hand of lastResults) {
      if (!hand[0]) continue;
      const point = toCanvasPoint(palmCenter(hand), view);
      found[point.x < view.width / 2 ? 0 : 1] = true;
    }
  }
  return found;
}

function updateWarmup(dt: number) {
  const game = currentGame!;
  warmElapsed += dt;
  present = detectPresence();

  const drill = game.getDrill?.() ?? { target: 1, progress: [1, 1], done: true };
  const coop = !!drill.coop;
  const warm = get().warm;
  const slots = warm.slots.map((slot, side) => {
    if (coop && side === 1) return slot;
    const value = drill.progress[side] ?? 0;
    const complete = value >= drill.target;
    // Three states, and they say different things: waiting (not seen),
    // tracked (seen, still working), done (drill complete).
    const state: SlotState = complete ? "done" : present[side] || coop ? "tracked" : "waiting";
    const text = `${Math.min(value, drill.target)}/${drill.target}`;
    return slot.state === state && slot.text === text ? slot : { state, text };
  }) as ArcadeState["warm"]["slots"];

  const timedOut = warmElapsed > WARMUP_TIMEOUT;
  const missing = !coop && (!present[0] || !present[1]);

  // Status wins the tip slot when it matters; otherwise the tutorial lines
  // rotate through it, one at a time, so they cost no screen space.
  let tip: string;
  if (drill.done) tip = "Nice — starting the real match…";
  else if (timedOut) tip = "Starting anyway — you can join once the round begins";
  else if (missing) {
    tip = game.mode === "pose"
      ? "Step back until both players fit, one on each side"
      : "Both players: raise a hand into your half of the screen";
  } else {
    const lines = game.tutorial || [];
    const rotated = lines.length ? lines[Math.floor(warmElapsed / TIP_EVERY) % lines.length] : "";
    tip = rotated || drill.tip || "Try it out";
  }

  if (tip !== warm.tip || slots[0] !== warm.slots[0] || slots[1] !== warm.slots[1]) {
    set({ warm: { ...warm, tip, slots } });
  }

  if (drill.done || timedOut) finishWarmup();
}

export function finishWarmup() {
  if (!warmResolve) return;
  const done = warmResolve;
  warmResolve = null;
  done();
}

// A light frame around each half so players know which side is theirs.
function drawWarmupGuides(ctx: CanvasRenderingContext2D) {
  if (currentGame!.coop) return;
  const half = view.width / 2;
  const inset = 12;

  for (const side of [0, 1]) {
    const x = side === 0 ? inset : half + inset / 2;
    const w = half - inset * 1.5;
    const color = side === 0 ? C.p1 : C.p2;
    const ok = present[side];
    ctx.save();
    ctx.globalAlpha = ok ? 0.35 : 0.5;
    ctx.strokeStyle = ok ? color : "rgba(255,255,255,0.35)";
    ctx.lineWidth = 2;
    ctx.setLineDash(ok ? [] : [10, 8]);
    ctx.beginPath();
    ctx.roundRect(x, inset + 64, w, view.height - inset * 2 - 64 - 96, 18);
    ctx.stroke();
    ctx.restore();

    if (!ok) {
      ctx.save();
      ctx.font = '700 14px "JetBrains Mono", monospace';
      ctx.textAlign = "center";
      ctx.fillStyle = C.amber;
      ctx.globalAlpha = 0.6 + Math.sin(performance.now() / 240) * 0.4;
      ctx.shadowColor = C.amber;
      ctx.shadowBlur = 10;
      ctx.fillText(`PLAYER ${side + 1} — STEP INTO FRAME`, x + w / 2, view.height / 2);
      ctx.restore();
    }
  }
}

/* ── Launch sequence ─────────────────────────────────────────────── */
async function launch(factory: GameFactory | null) {
  unlock();
  sfx.select();
  selectedFactory = factory || selectedFactory;
  if (!selectedFactory) return;

  const token = ++sequenceToken;
  finishWarmup();          // release a warm-up left over from a prior launch
  stopLoop();
  currentGame = selectedFactory();
  resetHud();
  set({ steps: { cam: "active", model: "pending", cal: "pending" }, result: null });
  setPhase("loading");

  try {
    await startCamera();
    if (token !== sequenceToken) return;
    setStep("cam", "done");
    setStep("model", "active");

    await getLandmarker(currentGame);
    if (token !== sequenceToken) return;
    setStep("model", "done");
    setStep("cal", "active");
  } catch (error) {
    console.error(error);
    if (token !== sequenceToken) return;
    stopCamera();
    const name = (error as { name?: string } | null)?.name;
    set({
      error: name === "NotAllowedError"
        ? "Camera permission was denied. Allow camera access in your browser's address bar, then try again."
        : name === "NotFoundError"
          ? "No camera was found on this device. Plug one in or try another device."
          : "Could not start the camera or load the tracking model. Check your connection and try again.",
    });
    setPhase("error");
    return;
  }

  layout();
  currentGame.init({ canvas, ctx, view });
  setStep("cal", "done");
  await warmup(token);
  if (token !== sequenceToken) return;

  // Throw away the practice run and start the real match from zero.
  currentGame.init({ canvas, ctx, view });
  resetHud();
  await countdown(token);
}

function countdown(token: number) {
  return new Promise<void>((resolve) => {
    const game = currentGame!;
    const hint = playMode === "gauntlet"
      ? `Round ${series().round} · ${game.title} — ${game.hint || "step into frame"}`
      : game.hint || "Step into frame";
    let n = 3;
    set({ count: { value: String(n), hint } });
    setPhase("countdown");
    sfx.count();
    startLoop();

    const tick = () => {
      if (token !== sequenceToken) return resolve();
      n -= 1;
      if (n === 0) {
        set({ count: { value: "GO", hint } });
        sfx.go();
        setTimeout(() => {
          if (token !== sequenceToken) return resolve();
          setPhase("playing");
          lastFrameTime = performance.now();
          resolve();
        }, 620);
        return;
      }
      set({ count: { value: String(n), hint } });
      sfx.count();
      setTimeout(tick, 800);
    };
    setTimeout(tick, 800);
  });
}

/* ── Frame loop ──────────────────────────────────────────────────── */
function startLoop() {
  if (rafId !== null) return;
  lastFrameTime = performance.now();
  rafId = requestAnimationFrame(tick);
}

function stopLoop() {
  if (rafId !== null) cancelAnimationFrame(rafId);
  rafId = null;
}

function detect(timestampMs: number) {
  if (!currentGame || !video || video.readyState < 2) return;
  // Feeding MediaPipe the same frame twice is wasted work (and some builds
  // reject a non-advancing timestamp), so only run on a fresh frame.
  if (video.currentTime === lastVideoTime) return;
  lastVideoTime = video.currentTime;

  const landmarker = landmarkers.get(landmarkerKey(currentGame));
  if (!landmarker) return;

  const result = landmarker.detectForVideo(video, timestampMs);
  const found = (result.landmarks || []) as Point[][];
  subjects = found.length;
  lastResults = found;
  currentGame.onResults(found);
}

function tick(now: number) {
  rafId = requestAnimationFrame(tick);
  if (!ctx || !currentGame) return;
  // rAF timestamps and performance.now() share an origin but not an
  // instant, so the first frame after a (re)start can produce a negative
  // delta. Clamping at both ends keeps every timer moving forwards.
  const dt = Math.max(0, Math.min((now - lastFrameTime) / 1000, 0.05));
  lastFrameTime = now;

  try {
    detect(now);
  } catch (error) {
    console.error("tracking error", error);
  }

  updateTracking(now);

  ctx.clearRect(0, 0, view.width, view.height);

  const phase = get().phase;
  if (phase === "playing") {
    currentGame.update(dt);
    currentGame.draw(ctx);
    updateHud();
    if (currentGame.isOver()) finish();
  } else if (phase === "countdown") {
    currentGame.draw(ctx);   // players can see the board while they get set
    updateHud();             // and the scoreboard they are about to play for
  } else if (phase === "warmup") {
    currentGame.update(dt);
    currentGame.draw(ctx);
    drawWarmupGuides(ctx);
    updateHud();
    updateWarmup(dt);
  }

  measureFps(now);
}

function updateTracking(now: number) {
  setTelemetry({ subjects });
  if (subjects > 0) {
    noSubjectSince = 0;
  } else if (get().phase === "playing") {
    if (noSubjectSince === 0) noSubjectSince = now;
    else if (now - noSubjectSince > 1500 && now > toastUntil) {
      flash(currentGame!.mode === "pose" ? "Step back — get your full body in frame" : "Raise your hands into frame");
      noSubjectSince = now;
    }
  }
}

/* ── HUD (written to the store only when a value changes) ────────── */
// Ratios are quantised so a smoothly draining timer costs a handful of
// store writes a second rather than one per frame; CSS transitions fill
// in the motion between steps.
const quantise = (n: number) => Math.round(clamp01(n) * 200) / 200;
const clamp01 = (n: number) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));

function updateHud() {
  const data = currentGame!.getHud?.();
  if (!data) return;
  const hud = get().hud;
  const p1 = nextPod(hud.p1, data.p1, "P1");
  const p2 = nextPod(hud.p2, data.p2, "P2");
  let center = hud.center;
  if (data.center) {
    const next = {
      value: String(data.center.value),
      label: String(data.center.label ?? ""),
      ratio: quantise(data.center.ratio),
      danger: !!data.center.danger,
    };
    if (!center || center.value !== next.value || center.label !== next.label
      || center.ratio !== next.ratio || center.danger !== next.danger) center = next;
  }
  if (p1 !== hud.p1 || p2 !== hud.p2 || center !== hud.center) set({ hud: { p1, p2, center } });
}

function nextPod(previous: HudPod, pod: any, fallbackTag: string): HudPod {
  if (!pod) return previous;
  const next: HudPod = {
    value: String(pod.value),
    meta: pod.meta || "",
    ratio: quantise(pod.ratio ?? 0),
    // Co-op relabels the pods (SEALED / WATER) and recolours them.
    tag: pod.tag || fallbackTag,
    accent: pod.accent,
  };
  const same = previous.value === next.value && previous.meta === next.meta && previous.ratio === next.ratio
    && previous.tag === next.tag && previous.accent === next.accent;
  return same ? previous : next;
}

function resetHud() {
  set({ hud: emptyHud() });
}

/* ── FPS meter ───────────────────────────────────────────────────── */
const fpsSamples: number[] = [];
let fpsLastReport = 0;

function measureFps(now: number) {
  fpsSamples.push(now);
  while (fpsSamples.length > 0 && now - fpsSamples[0] > 1000) fpsSamples.shift();
  if (now - fpsLastReport < 500) return;
  fpsLastReport = now;
  const fps = fpsSamples.length;
  setTelemetry({ fps });
  considerPerfMode(fps, now);
}

// Only judged mid-match, where the frame rate is steady state — a model
// still loading or a screen still animating in proves nothing.
function considerPerfMode(fps: number, now: number) {
  if (perfLow) return;
  const phase = get().phase;
  if (phase !== "playing" && phase !== "warmup") { perfBadSince = 0; return; }
  if (fps >= PERF_LOW_FPS) { perfBadSince = 0; return; }
  if (perfBadSince === 0) { perfBadSince = now; return; }
  if (now - perfBadSince >= PERF_GRACE_MS) enablePerfMode();
}

function enablePerfMode() {
  perfLow = true;
  document.documentElement.classList.add("perf-low");
  set({ perfLow: true });
  layout();                        // re-cut the canvas at 1x
  currentGame?.onResize?.(view);   // geometry is baked from the view, not scaled
  flash("Low frame rate — visual effects reduced", 3600);
}

/* ── Deciding a gauntlet round ───────────────────────────────────────
   A gauntlet round must always produce a loser. If it did not, a run of
   drawn rounds would deduct no lives and the series could never end.
   Resolution order:
     1. the game's own winner
     2. the game's tiebreak metric (best streak, accuracy, damage, …)
     3. the player who is behind on lives — which also guarantees the
        series terminates, since every round now removes exactly one life
     4. a coin toss, if even that is level
   ─────────────────────────────────────────────────────────────────── */
function decideRound(summary: any): { winner: 1 | 2; how: SeriesEntry["how"] } {
  if (summary.winner) return { winner: summary.winner, how: "play" };

  const [t1, t2] = summary.tiebreak || [0, 0];
  if (t1 !== t2) return { winner: t1 > t2 ? 1 : 2, how: "tiebreak" };

  const [l1, l2] = series().lives;
  if (l1 !== l2) return { winner: l1 < l2 ? 1 : 2, how: "underdog" };

  return { winner: Math.random() < 0.5 ? 1 : 2, how: "toss" };
}

// Applies a match result to the running series.
function applySeriesResult(summary: any) {
  const decision = decideRound(summary);
  lastDecision = decision;
  const current = series();
  const lastLost: 0 | 1 = decision.winner === 1 ? 1 : 0;
  const lives = [...current.lives] as [number, number];
  lives[lastLost] -= 1;
  set({
    series: {
      ...current,
      lives,
      lastLost,
      lossKey: current.lossKey + 1,
      history: [...current.history, {
        round: current.round,
        game: currentGame!.title,
        winner: decision.winner,
        how: decision.how,
      }],
      over: lives.some((n) => n <= 0),
    },
  });
}

function finish() {
  stopLoop();
  const game = currentGame!;
  const summary = game.getSummary();
  if (playMode === "gauntlet") applySeriesResult(summary);

  const s = series();
  const finale = playMode === "gauntlet" && s.over;
  const champion = finale ? (s.lives[0] <= 0 ? 2 : 1) : null;
  const roundWinner = playMode === "gauntlet" ? lastDecision?.winner : null;
  const decidedOnTiebreak = !!roundWinner && summary.winner === null;

  const title = finale
    ? `Player ${champion} takes the gauntlet`
    : decidedOnTiebreak ? `Player ${roundWinner} takes the round` : summary.title;
  const color = finale ? (champion === 1 ? C.p1 : C.p2)
    : decidedOnTiebreak ? (roundWinner === 1 ? C.p1 : C.p2)
    : summary.color || "";

  const kicker = finale ? "Gauntlet complete"
    : playMode === "gauntlet" ? `Round ${s.round} result`
    : summary.coop ? "Dive complete" : "Match complete";

  const how = lastDecision?.how;
  const decidedBy = how === "tiebreak" ? " on tiebreak"
    : how === "underdog" ? " on countback"
    : how === "toss" ? " on a coin toss"
    : "";
  const statusHead = playMode !== "gauntlet" ? null
    : s.over ? `Decided in ${s.round} ${s.round === 1 ? "round" : "rounds"}`
    : `Player ${(s.lastLost ?? 0) + 1} loses a life${decidedBy}`;

  const replayLabel = finale ? "New gauntlet"
    : playMode === "gauntlet" ? "Next round"
    : playMode === "shuffle" ? "Deal again"
    : "Rematch";

  let record: number | null = null;
  const best = getRecord(game.id);
  if (Number.isFinite(summary.record) && summary.record > best) {
    setRecord(game.id, summary.record);
    record = summary.record;
    loadRecords();
  }

  const rows: ResultRow[] = (summary.rows || []).map(
    (row: any) => ({
      tag: String(row.tag),
      text: String(row.text),
      value: String(row.value),
      ratio: clamp01(row.ratio ?? 0),
      color: row.color || C.p1,
    }),
  );

  set({ result: { kicker, title, color, rows, finale, statusHead, replayLabel, record, coop: !!summary.coop } });
  setPhase("over");
  startAutoNext();
  if (summary.coop) (summary.success ? sfx.win() : sfx.fail());
  else if (playMode !== "gauntlet" && summary.winner === null) sfx.draw();
  else sfx.win();
}

/* ── Hands-free round advance ────────────────────────────────────────
   In a gauntlet the players are standing back from the device, so the
   results screen rolls straight on to the next round by itself. The
   next round then opens with its own warm-up, which waits for both
   players to be tracked — so the whole loop runs without anyone
   walking back to the keyboard.
   ─────────────────────────────────────────────────────────────────── */
const AUTO_NEXT_MS = 9000;
let autoTimer: ReturnType<typeof setTimeout> | null = null;
let autoDeadline = 0;

function startAutoNext() {
  if (playMode !== "gauntlet" || series().over) return;
  autoDeadline = performance.now() + AUTO_NEXT_MS;

  const step = () => {
    autoTimer = null;
    if (get().phase !== "over") { cancelAutoNext(); return; }
    const left = autoDeadline - performance.now();
    if (left <= 0) { cancelAutoNext(); nextRound(); return; }
    set({ autoNext: { active: true, seconds: Math.ceil(left / 1000), ratio: left / AUTO_NEXT_MS } });
    autoTimer = setTimeout(step, 200);
  };
  step();
}

export function cancelAutoNext() {
  if (autoTimer !== null) clearTimeout(autoTimer);
  autoTimer = null;
  if (get().autoNext.active) set({ autoNext: { active: false, seconds: 0, ratio: 0 } });
}

export function returnToMenu() {
  sequenceToken++;
  finishWarmup();          // release any awaiting launch
  stopLoop();
  stopCamera();
  currentGame = null;
  selectedFactory = null;
  playMode = "single";
  resetSeries();
  cancelAutoNext();
  resetHud();
  toast.dismiss();
  ctx?.clearRect(0, 0, view.width, view.height);
  set({ result: null });
  setPhase("menu");
  requestAnimationFrame(() => measurePreviews());
  sfx.back();
}

export function pause() {
  if (get().phase !== "playing") return;
  stopLoop();
  setPhase("paused");
}

export function resume() {
  if (get().phase !== "paused") return;
  setPhase("playing");
  startLoop();
}

export function togglePause() {
  const phase = get().phase;
  if (phase === "playing") pause();
  else if (phase === "paused") resume();
}

export function toggleMute() {
  unlock();
  setMuted(!isMuted());
  set({ muted: isMuted() });
  if (!isMuted()) sfx.select();
}

export function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}

export function hoverSound() {
  sfx.hover();
}

/* ── Attachment ──────────────────────────────────────────────────── */
let attached = false;

// Binds the engine to the stage's <video> and <canvas>. Returns a detach
// function so React can clean up (and so development double-mounts work).
export function attach(videoEl: HTMLVideoElement, canvasEl: HTMLCanvasElement) {
  video = videoEl;
  canvas = canvasEl;
  ctx = canvasEl.getContext("2d", { alpha: true });
  layout();

  // ResizeObserver rather than window.resize: the stage also changes on
  // fullscreen toggles and mobile URL-bar collapse, which fire no resize.
  let resizeTimer: ReturnType<typeof setTimeout> | undefined;
  const observer = new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      layout();
      measurePreviews();
      // Games bake geometry from the view size, so they must rebuild it.
      const phase = get().phase;
      if (currentGame && (phase === "playing" || phase === "paused" || phase === "countdown" || phase === "warmup")) {
        currentGame.onResize?.(view);
      }
    }, 90);
  });
  observer.observe(canvasEl);

  const onVisibility = () => { if (document.hidden) pause(); };
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("blur", pause);

  if (!attached) {
    attached = true;
    loadRecords();
    set({ muted: isMuted() });
    startPreviews("menu");
  }

  return () => {
    observer.disconnect();
    clearTimeout(resizeTimer);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("blur", pause);
  };
}

export { GAMES, META };
