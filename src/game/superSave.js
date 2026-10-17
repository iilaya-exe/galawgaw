import { toCanvasPoint, createFx, createShake, clamp, lerp, dist, palmCenter } from "./utils.js";
import { C } from "./theme.js";
import { sfx } from "./audio.js";
import { drawBall, drawGlove, drawCallout, drawHint, glovePair } from "./footballKit.js";

/* ═══════════════════════════════════════════════════════════════════
   SUPER SAVE — solo. You are the goalkeeper.

   The whole screen is a goal with the player standing in it. A computer
   striker runs up and shoots; the ball grows as it comes at you. One
   raised hand moves a pair of gloves held together, like a keeper
   gathering the ball. Touch it before it crosses the line. Shots get
   quicker, some curve, and some are hit at the side your gloves are
   not. Let in three and the run is over — most saves wins your record.
   ═══════════════════════════════════════════════════════════════════ */

const LIVES = 3;                // goals conceded before the run ends
const RUNUP = 0.9;              // seconds of run-up before the shot
const RESULT_TIME = 1.1;        // seconds the SAVED / GOAL callout holds
const SAVE_FROM = 0.72;         // flight progress from which a touch counts
const FLIGHT_START = 1.2;       // first shot, seconds from boot to line
const FLIGHT_STEP = 0.035;      // quicker every shot
const FLIGHT_FLOOR = 0.68;
const GLOVE_SCALE = 0.62;       // glove size relative to the ball

export function createSuperSave() {
  return {
    id: "supersave",
    title: "Super Save",
    icon: "🧤",
    blurb: "Solo. You're the keeper: one hand moves your gloves. Let in three and you're out.",
    players: "1P SOLO",
    hint: "Raise one hand — it moves both gloves",
    tutorial: [
      "You're in goal. Raise one hand — it moves both gloves together.",
      "Watch the striker. Get your gloves on the ball before it reaches you.",
      "Shots get faster and start to curve. Let in three and the run is over.",
    ],
    mode: "hand",
    numHands: 1,                // one hand drives the pair of gloves
    solo: true,                 // one player: no versus, not in the Gauntlet or online

    init({ view, practice = false }) {
      this.view = view;
      this.practice = practice;
      this.drill = [0, 0];
      this.gloves = [];
      this.hold = null;
      this.keeper = createKeeper();
      this.elapsed = 0;
      this.fx = createFx();
      this.shake = createShake();
      this.over = false;
      this.keeper.shot = this.newShot();
    },

    onResize(view) {
      // Shots are stored in screen fractions, so they survive a resize.
      this.view = view;
    },

    // The first hand seen drives both gloves; a second hand is ignored.
    onResults(hands) {
      const landmarks = hands[0];
      if (!landmarks) { this.gloves = []; this.hold = null; return; }
      const palm = toCanvasPoint(palmCenter(landmarks), this.view);
      const wrist = toCanvasPoint(landmarks[0], this.view);
      const knuckle = toCanvasPoint(landmarks[9], this.view);
      const angle = Math.atan2(knuckle.y - wrist.y, knuckle.x - wrist.x);
      this.hold = { x: palm.x, y: palm.y };   // the gap between the gloves
      this.gloves = glovePair(palm.x, palm.y, angle, this.layout().R * GLOVE_SCALE);
    },

    layout() {
      const W = this.view.width;
      const H = this.view.height;
      const R = clamp(Math.min(W, H) * 0.085, 18, 60);
      return { W, H, cx: W / 2, R, startY: H * 0.34, strikerY: H * 0.33 };
    },

    // Positions are screen fractions (0-1 across, 0-1 down).
    newShot() {
      const index = this.keeper.taken;
      let tx = 0.18 + Math.random() * 0.64;
      // Half the time the shot goes to the side the gloves are not.
      if (!this.practice && this.gloves.length && Math.random() < 0.5) {
        const avg = this.gloves.reduce((sum, g) => sum + g.x / this.view.width, 0) / this.gloves.length;
        tx = avg < 0.5 ? 0.58 + Math.random() * 0.24 : 0.18 + Math.random() * 0.24;
      }
      const power = !this.practice && index >= 6 && Math.random() < 0.25;
      const flight = this.practice ? 1.9
        : Math.max(FLIGHT_FLOOR, FLIGHT_START - index * FLIGHT_STEP) * (power ? 0.8 : 1);
      return {
        tx,
        ty: this.practice ? 0.45 + Math.random() * 0.25 : 0.3 + Math.random() * 0.55,
        curve: !this.practice && index >= 3 && Math.random() < 0.4 ? (Math.random() < 0.5 ? -1 : 1) * (0.12 + Math.random() * 0.1) : 0,
        flight,
        power,
      };
    },

    // Where the ball is at flight progress k, in canvas pixels.
    ballAt(k) {
      const L = this.layout();
      const shot = this.keeper.shot;
      const sx = L.cx, sy = L.startY;
      const ex = shot.tx * L.W, ey = shot.ty * L.H;
      const cx = (sx + ex) / 2 + shot.curve * L.W, cy = Math.min(sy, ey) - L.H * 0.08;
      const u = 1 - k;
      return {
        x: u * u * sx + 2 * u * k * cx + k * k * ex,
        y: u * u * sy + 2 * u * k * cy + k * k * ey,
        r: lerp(L.R * 0.16, L.R, k * k),
      };
    },

    update(dt) {
      if (this.over) return;
      this.elapsed += dt;
      this.fx.update(dt);
      this.shake.update(dt);

      const keeper = this.keeper;
      keeper.tracked = this.gloves.length > 0;
      keeper.t += dt;

      if (keeper.phase === "runup") {
        if (keeper.t >= (this.practice ? RUNUP * 1.4 : RUNUP)) {
          keeper.phase = "flight";
          keeper.t = 0;
          sfx.whack();
        }
      } else if (keeper.phase === "flight") {
        const k = clamp(keeper.t / keeper.shot.flight, 0, 1);
        keeper.k = k;
        if (k >= SAVE_FROM) {
          const ball = this.ballAt(k);
          const reach = ball.r + this.layout().R * 0.55;
          // Either glove (or the gap between them) can stop it; a ball that
          // lands right between the gloves is held rather than parried.
          const middle = this.hold ? dist(this.hold, ball) : Infinity;
          const touch = this.gloves.reduce((best, g) => Math.min(best, dist(g, ball)), middle);
          if (touch <= reach) { this.finishShot(middle <= ball.r * 0.7 ? "caught" : "saved", ball); return; }
        }
        if (k >= 1) this.finishShot("goal", this.ballAt(1));
      } else if (keeper.phase === "result") {
        if (keeper.t >= RESULT_TIME) {
          if (!this.practice && keeper.conceded >= LIVES) { this.over = true; return; }
          keeper.shot = this.newShot();
          keeper.phase = "runup";
          keeper.t = 0;
          keeper.k = 0;
        }
      }
    },

    finishShot(outcome, ball) {
      const keeper = this.keeper;
      keeper.taken += 1;
      keeper.phase = "result";
      keeper.t = 0;
      keeper.outcome = outcome;
      keeper.endX = ball.x / this.view.width;
      keeper.endY = ball.y / this.view.height;
      if (outcome === "goal") {
        keeper.streak = 0;
        if (!this.practice) keeper.conceded += 1;
        this.shake.add(7);
        sfx.bomb();
      } else {
        keeper.saves += 1;
        keeper.streak += 1;
        keeper.bestStreak = Math.max(keeper.bestStreak, keeper.streak);
        if (outcome === "caught") keeper.caught += 1;
        if (this.practice) this.drill[0] = 1;
        this.fx.burst(ball.x, ball.y, C.p1, 14, 220);
        sfx.seal();
      }
    },

    draw(ctx) {
      const shaking = this.shake.apply(ctx);
      const keeper = this.keeper;
      const L = this.layout();
      const accent = C.p1;

      // The player stands in this goal: posts at the edges, bar on top.
      const left = L.W * 0.04;
      const right = L.W * 0.96;
      const bar = L.H * 0.08;
      const conceded = keeper.phase === "result" && keeper.outcome === "goal";
      ctx.save();
      ctx.strokeStyle = conceded ? C.danger : "rgba(255,255,255,0.9)";
      ctx.lineWidth = Math.max(5, L.W * 0.008);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(left, L.H);
      ctx.lineTo(left, bar);
      ctx.lineTo(right, bar);
      ctx.lineTo(right, L.H);
      ctx.stroke();
      ctx.restore();

      // The pitch and the striker far away.
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(L.W * 0.3, L.H * 0.37);
      ctx.lineTo(L.W * 0.7, L.H * 0.37);
      ctx.stroke();
      ctx.restore();
      const runK = keeper.phase === "runup" ? clamp(keeper.t / RUNUP, 0, 1) : 1;
      const lean = keeper.phase === "runup" ? 0 : (keeper.shot.tx - 0.5) * 0.6;
      drawStriker(ctx, L.cx - L.W * 0.05 * (1 - runK), L.strikerY, Math.max(10, L.H * 0.05), runK, lean);

      // Telegraph: a faint ring where the shot is heading, firming up in flight.
      if (keeper.phase === "flight") {
        const end = this.ballAt(1);
        ctx.save();
        ctx.globalAlpha = 0.12 + keeper.k * 0.3;
        ctx.strokeStyle = keeper.shot.power ? C.amber : "#ffffff";
        ctx.setLineDash([5, 6]);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(end.x, end.y, L.R, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      for (const glove of this.gloves) {
        drawGlove(ctx, glove.x, glove.y, L.R * GLOVE_SCALE, accent, glove.angle, keeper.phase === "flight", glove.flip);
      }

      // Ball
      if (keeper.phase === "runup") {
        drawBall(ctx, L.cx, L.startY, L.R * 0.16);
      } else if (keeper.phase === "flight") {
        const ball = this.ballAt(keeper.k);
        if (keeper.shot.power) {
          ctx.save();
          ctx.globalAlpha = 0.35;
          ctx.fillStyle = C.amber;
          ctx.beginPath();
          ctx.arc(ball.x, ball.y, ball.r * 1.35, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        drawBall(ctx, ball.x, ball.y, ball.r, keeper.k * 10);
      } else if (keeper.phase === "result" && keeper.outcome === "caught") {
        // Held: the ball stays in the gloves, then fades.
        const k = keeper.t / RESULT_TIME;
        drawBall(ctx, keeper.endX * L.W, keeper.endY * L.H, L.R, 0, Math.min(1, (1 - k) * 2));
      } else if (keeper.phase === "result" && keeper.outcome === "saved") {
        // Parried: the ball deflects away and fades.
        const k = keeper.t / RESULT_TIME;
        const away = keeper.endX < 0.5 ? -1 : 1;
        drawBall(ctx, keeper.endX * L.W + away * k * L.W * 0.2, keeper.endY * L.H - Math.sin(k * Math.PI) * L.H * 0.15, L.R * (1 - k * 0.4), k * 12, 1 - k);
      }

      if (keeper.phase === "result") {
        const k = keeper.t / RESULT_TIME;
        const word = keeper.outcome === "caught" ? "CAUGHT IT!" : keeper.outcome === "saved" ? "SAVED!" : "GOAL…";
        const color = keeper.outcome === "goal" ? C.danger : accent;
        drawCallout(ctx, L.cx, L.H * 0.55, word, color, k, Math.min(64, L.W * 0.07));
        if (conceded) {
          ctx.save();
          ctx.globalAlpha = Math.max(0, 0.35 * (1 - k * 2));
          ctx.fillStyle = C.danger;
          ctx.fillRect(0, 0, L.W, L.H);
          ctx.restore();
        }
      }

      // Lives: three balls along the bottom; a goal against greys one out.
      if (!this.practice) {
        for (let i = 0; i < LIVES; i++) {
          drawBall(ctx, L.cx + (i - (LIVES - 1) / 2) * 26, L.H - 18, 8, 0, i < LIVES - keeper.conceded ? 1 : 0.2);
        }
      }

      if (!keeper.tracked) drawHint(ctx, L.cx, L.H * 0.7, "RAISE ONE HAND", C.amber);

      this.fx.draw(ctx);
      if (shaking) ctx.restore();
    },

    // One player, so the warm-up shows a single slot (coop drill).
    getDrill() {
      return {
        label: "MAKE 1 SAVE",
        tip: "Raise one hand — get your gloves on the ball as it reaches you",
        target: 1,
        progress: this.drill,
        coop: true,
        done: this.drill[0] >= 1,
      };
    },

    getHud() {
      const keeper = this.keeper;
      const lives = LIVES - keeper.conceded;
      return {
        p1: {
          tag: "SAVES",
          value: keeper.saves,
          meta: !keeper.tracked ? "NO HAND" : keeper.streak > 1 ? `${keeper.streak} IN A ROW` : `${keeper.caught} CAUGHT`,
          ratio: clamp(keeper.saves / Math.max(1, keeper.taken), 0, 1),
        },
        p2: {
          tag: "LIVES",
          value: lives,
          meta: lives === 1 ? "LAST CHANCE" : "GOALS LEFT",
          ratio: lives / LIVES,
          accent: C.amber,
        },
        center: {
          value: keeper.taken + (keeper.phase === "result" ? 0 : 1),
          label: "SHOT",
          ratio: lives / LIVES,
          danger: lives === 1,
        },
      };
    },

    isOver() { return this.over; },

    getSummary() {
      const k = this.keeper;
      return {
        title: k.saves === 1 ? "1 SAVE" : `${k.saves} SAVES`,
        color: C.p1,
        winner: null,
        solo: true,
        success: k.saves > 0,
        tiebreak: [0, 0],
        record: k.saves,
        rows: [
          { tag: "YOU", text: `${k.taken} shots faced · ${k.caught} caught clean`, value: `${k.saves} saves`, ratio: clamp(k.saves / Math.max(1, k.taken), 0, 1), color: C.p1 },
          { tag: "STREAK", text: "most saves in a row", value: `${k.bestStreak}`, ratio: clamp(k.bestStreak / Math.max(1, k.saves), 0, 1), color: C.amber },
        ],
      };
    },
  };
}

function createKeeper() {
  return {
    phase: "runup", t: 0, k: 0, shot: null, outcome: null, endX: 0.5, endY: 0.5,
    taken: 0, saves: 0, caught: 0, conceded: 0, streak: 0, bestStreak: 0, tracked: false,
  };
}

// The striker in the distance: a small figure that runs in and kicks.
function drawStriker(ctx, x, y, s, run, lean) {
  const stride = Math.sin(run * Math.PI * 4) * 0.6;
  const kick = run > 0.85 ? (run - 0.85) / 0.15 : 0;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(lean * 0.4);
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = Math.max(2, s * 0.14);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(0, -s * 1.55, s * 0.28, 0, Math.PI * 2);
  ctx.moveTo(0, -s * 1.25); ctx.lineTo(0, -s * 0.45);
  ctx.moveTo(0, -s * 1.05); ctx.lineTo(-s * 0.5, -s * 0.7 + stride * s * 0.3);
  ctx.moveTo(0, -s * 1.05); ctx.lineTo(s * 0.5, -s * 0.7 - stride * s * 0.3);
  ctx.moveTo(0, -s * 0.45); ctx.lineTo(-s * 0.35 + stride * s * 0.3, 0);
  ctx.moveTo(0, -s * 0.45); ctx.lineTo(s * 0.35 - stride * s * 0.3 + kick * s * 0.5, -kick * s * 0.5);
  ctx.stroke();
  ctx.restore();
}
