import { toCanvasPoint, createFx, createShake, clamp, lerp, dist, palmCenter } from "./utils.js";
import { C } from "./theme.js";
import { sfx } from "./audio.js";
import { drawBall, drawGlove, drawCallout, drawHint } from "./footballKit.js";

/* ═══════════════════════════════════════════════════════════════════
   SUPER SAVE — you are the goalkeeper.

   Each half is a goal with the player standing in it. A computer striker
   runs up and shoots; the ball grows as it comes at you and your hands
   are the gloves. Touch it before it crosses the line. Shots get quicker,
   some curve, and some are hit at the side your gloves are not. Ten
   shots each — most saves wins.
   ═══════════════════════════════════════════════════════════════════ */

const SHOTS = 10;
const RUNUP = 0.9;              // seconds of run-up before the shot
const RESULT_TIME = 1.1;        // seconds the SAVED / GOAL callout holds
const SAVE_FROM = 0.72;         // flight progress from which a touch counts
const FLIGHT_START = 1.15;      // first shot, seconds from boot to line
const FLIGHT_STEP = 0.04;       // quicker every shot
const FLIGHT_FLOOR = 0.72;

export function createSuperSave() {
  return {
    id: "supersave",
    title: "Super Save",
    icon: "🧤",
    blurb: "You're the keeper. Your hands are the gloves — stop every shot you can.",
    players: "2P VS",
    hint: "Both hands up — one player each side",
    tutorial: [
      "You're in goal. Both hands up — they're your gloves.",
      "Watch the striker. Get a glove on the ball before it reaches you.",
      "Shots get faster and start to curve. Ten each — most saves wins.",
    ],
    mode: "hand",
    numHands: 4,                // two keepers × two gloves

    init({ view, practice = false }) {
      this.view = view;
      this.practice = practice;
      this.drill = [0, 0];
      this.gloves = [[], []];
      this.keepers = [createKeeper(), createKeeper()];
      this.target = practice ? 99 : SHOTS;
      this.elapsed = 0;
      this.fx = createFx();
      this.shake = createShake();
      this.over = false;
      for (const side of [0, 1]) this.keepers[side].shot = this.newShot(side);
    },

    onResize(view) {
      // Shots are stored in lane fractions, so they survive a resize.
      this.view = view;
    },

    onResults(hands) {
      this.gloves = [[], []];
      for (const landmarks of hands) {
        const palm = toCanvasPoint(palmCenter(landmarks), this.view);
        const wrist = toCanvasPoint(landmarks[0], this.view);
        const knuckle = toCanvasPoint(landmarks[9], this.view);
        const thumb = toCanvasPoint(landmarks[4], this.view);
        // Which side of the wrist→fingers line is the thumb on? The artwork
        // has it on the left, so mirror the glove when it is on the right.
        const turn = (knuckle.x - wrist.x) * (thumb.y - wrist.y) - (knuckle.y - wrist.y) * (thumb.x - wrist.x);
        const glove = { x: palm.x, y: palm.y, angle: Math.atan2(knuckle.y - wrist.y, knuckle.x - wrist.x), flip: turn > 0 };
        this.gloves[palm.x < this.view.width / 2 ? 0 : 1].push(glove);
      }
    },

    lane(side) {
      const half = this.view.width / 2;
      const originX = side === 0 ? 0 : half;
      const H = this.view.height;
      const R = clamp(Math.min(half, H) * 0.085, 18, 48);
      return { originX, half, H, cx: originX + half / 2, R, startY: H * 0.34, strikerY: H * 0.33 };
    },

    // Positions are lane fractions (0-1 across the half, 0-1 down the view).
    newShot(side) {
      const keeper = this.keepers[side];
      const index = keeper.taken;
      let tx = 0.14 + Math.random() * 0.72;
      // Half the time the shot goes to the side the gloves are not.
      const gloves = this.gloves[side];
      if (!this.practice && gloves.length && Math.random() < 0.5) {
        const L = this.lane(side);
        const avg = gloves.reduce((sum, g) => sum + (g.x - L.originX) / L.half, 0) / gloves.length;
        tx = avg < 0.5 ? 0.6 + Math.random() * 0.26 : 0.14 + Math.random() * 0.26;
      }
      const power = !this.practice && index >= 5 && Math.random() < 0.25;
      const flight = this.practice ? 1.9
        : Math.max(FLIGHT_FLOOR, FLIGHT_START - index * FLIGHT_STEP) * (power ? 0.8 : 1);
      return {
        tx,
        ty: this.practice ? 0.45 + Math.random() * 0.25 : 0.3 + Math.random() * 0.55,
        curve: !this.practice && index >= 3 && Math.random() < 0.4 ? (Math.random() < 0.5 ? -1 : 1) * (0.2 + Math.random() * 0.15) : 0,
        flight,
        power,
      };
    },

    // Where the ball is at flight progress k, in canvas pixels.
    ballAt(side, k) {
      const L = this.lane(side);
      const shot = this.keepers[side].shot;
      const sx = L.cx, sy = L.startY;
      const ex = L.originX + shot.tx * L.half, ey = shot.ty * L.H;
      const cx = (sx + ex) / 2 + shot.curve * L.half, cy = Math.min(sy, ey) - L.H * 0.08;
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

      for (const side of [0, 1]) {
        const keeper = this.keepers[side];
        keeper.tracked = this.gloves[side].length > 0;
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
            const ball = this.ballAt(side, k);
            const L = this.lane(side);
            const reach = ball.r + L.R * 0.55;
            const touch = this.gloves[side].reduce((best, g) => Math.min(best, dist(g, ball)), Infinity);
            if (touch <= reach) { this.finishShot(side, touch <= ball.r * 0.6 ? "caught" : "saved", ball); continue; }
          }
          if (k >= 1) this.finishShot(side, "goal", this.ballAt(side, 1));
        } else if (keeper.phase === "result") {
          if (keeper.t >= RESULT_TIME) {
            if (keeper.taken >= this.target) keeper.phase = "done";
            else {
              keeper.shot = this.newShot(side);
              keeper.phase = "runup";
              keeper.t = 0;
              keeper.k = 0;
            }
          }
        }
      }

      if (!this.practice && this.keepers.every((keeper) => keeper.phase === "done")) this.over = true;
    },

    finishShot(side, outcome, ball) {
      const keeper = this.keepers[side];
      keeper.taken += 1;
      keeper.phase = "result";
      keeper.t = 0;
      keeper.outcome = outcome;
      keeper.history.push(outcome);
      keeper.endX = (ball.x - this.lane(side).originX) / this.lane(side).half;
      keeper.endY = ball.y / this.view.height;
      const accent = side === 0 ? C.p1 : C.p2;
      if (outcome === "goal") {
        keeper.conceded += 1;
        this.shake.add(7);
        sfx.bomb();
      } else {
        keeper.saves += 1;
        if (outcome === "caught") keeper.caught += 1;
        if (this.practice) this.drill[side] = 1;
        this.fx.burst(ball.x, ball.y, accent, 14, 220);
        sfx.seal();
      }
    },

    draw(ctx) {
      const shaking = this.shake.apply(ctx);
      for (const side of [0, 1]) this.drawLane(ctx, side);
      this.fx.draw(ctx);
      const { view } = this;
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.22)";
      ctx.setLineDash([12, 10]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(view.width / 2, 0);
      ctx.lineTo(view.width / 2, view.height);
      ctx.stroke();
      ctx.restore();
      if (shaking) ctx.restore();
    },

    drawLane(ctx, side) {
      const keeper = this.keepers[side];
      const L = this.lane(side);
      const accent = side === 0 ? C.p1 : C.p2;

      // The player stands in this goal: posts at the lane edges, bar on top.
      const left = L.originX + L.half * 0.05;
      const right = L.originX + L.half * 0.95;
      const bar = L.H * 0.08;
      const conceded = keeper.phase === "result" && keeper.outcome === "goal";
      ctx.save();
      ctx.strokeStyle = conceded ? C.danger : "rgba(255,255,255,0.9)";
      ctx.lineWidth = Math.max(4, L.half * 0.018);
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
      ctx.moveTo(L.originX + L.half * 0.18, L.H * 0.37);
      ctx.lineTo(L.originX + L.half * 0.82, L.H * 0.37);
      ctx.stroke();
      ctx.restore();
      const runK = keeper.phase === "runup" ? clamp(keeper.t / RUNUP, 0, 1) : 1;
      const lean = keeper.phase === "runup" ? 0 : (keeper.shot.tx - 0.5) * 0.6;
      drawStriker(ctx, L.cx - L.half * 0.1 * (1 - runK), L.strikerY, Math.max(10, L.H * 0.045), runK, lean);

      // Telegraph: a faint ring where the shot is heading, firming up in flight.
      if (keeper.phase === "flight") {
        const end = this.ballAt(side, 1);
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

      // Gloves
      for (const glove of this.gloves[side]) {
        drawGlove(ctx, glove.x, glove.y, L.R * 0.62, accent, glove.angle, keeper.phase === "flight", glove.flip);
      }

      // Ball
      if (keeper.phase === "runup") {
        drawBall(ctx, L.cx, L.startY, L.R * 0.16);
      } else if (keeper.phase === "flight") {
        const ball = this.ballAt(side, keeper.k);
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
        drawBall(ctx, L.originX + keeper.endX * L.half, keeper.endY * L.H, L.R, 0, Math.min(1, (1 - k) * 2));
      } else if (keeper.phase === "result" && keeper.outcome === "saved") {
        // Parried: the ball deflects away and fades.
        const k = keeper.t / RESULT_TIME;
        const away = keeper.endX < 0.5 ? -1 : 1;
        drawBall(ctx, L.originX + keeper.endX * L.half + away * k * L.half * 0.4, keeper.endY * L.H - Math.sin(k * Math.PI) * L.H * 0.15, L.R * (1 - k * 0.4), k * 12, 1 - k);
      }

      if (keeper.phase === "result") {
        const k = keeper.t / RESULT_TIME;
        const word = keeper.outcome === "caught" ? "CAUGHT IT!" : keeper.outcome === "saved" ? "SAVED!" : "GOAL…";
        const color = keeper.outcome === "goal" ? C.danger : accent;
        drawCallout(ctx, L.cx, L.H * 0.55, word, color, k, Math.min(52, L.half * 0.12));
        if (conceded) {
          ctx.save();
          ctx.globalAlpha = Math.max(0, 0.35 * (1 - k * 2));
          ctx.fillStyle = C.danger;
          ctx.fillRect(L.originX, 0, L.half, L.H);
          ctx.restore();
        }
      } else if (keeper.phase === "done") {
        drawHint(ctx, L.cx, L.H * 0.6, "DONE — WAITING FOR YOUR RIVAL", "rgba(255,255,255,0.7)", false);
      }

      // Shots record along the bottom.
      if (!this.practice) {
        const y = L.H - 14;
        for (let i = 0; i < this.target; i++) {
          const x = L.cx + (i - (this.target - 1) / 2) * 14;
          const result = keeper.history[i];
          ctx.save();
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = "rgba(255,255,255,0.35)";
          ctx.fillStyle = result === "goal" ? C.danger : accent;
          ctx.beginPath();
          ctx.arc(x, y, 4.5, 0, Math.PI * 2);
          if (result) ctx.fill(); else ctx.stroke();
          ctx.restore();
        }
      }

      if (!keeper.tracked && keeper.phase !== "done") drawHint(ctx, L.cx, L.H * 0.7, `PLAYER ${side + 1} — HANDS UP`, C.amber);
    },

    getDrill() {
      return {
        label: "MAKE 1 SAVE EACH",
        tip: "Hands up — get a glove on the ball as it reaches you",
        target: 1,
        progress: this.drill,
        done: this.drill[0] >= 1 && this.drill[1] >= 1,
      };
    },

    getHud() {
      const pod = (side) => {
        const keeper = this.keepers[side];
        return {
          value: keeper.saves,
          meta: !keeper.tracked && keeper.phase !== "done" ? "NO HANDS"
            : keeper.caught > 0 ? `${keeper.caught} CAUGHT · ${keeper.conceded} LET IN` : `${keeper.conceded} LET IN`,
          ratio: clamp(keeper.saves / this.target, 0, 1),
        };
      };
      const left = Math.max(...this.keepers.map((keeper) => this.target - keeper.taken));
      return {
        p1: pod(0),
        p2: pod(1),
        center: { value: Math.max(0, left), label: "SHOTS", ratio: clamp(left / this.target, 0, 1), danger: left <= 2 },
      };
    },

    isOver() { return this.over; },

    getSummary() {
      const [a, b] = this.keepers;
      const winner = a.saves > b.saves ? 1 : b.saves > a.saves ? 2 : null;
      const row = (keeper, tag, color) => ({
        tag,
        text: `${keeper.saves} of ${keeper.taken} saved · ${keeper.caught} caught clean`,
        value: `${keeper.saves} saves`,
        ratio: clamp(keeper.saves / Math.max(1, keeper.taken), 0, 1),
        color,
      });
      return {
        title: winner ? `PLAYER ${winner} WINS` : "DRAW",
        color: winner === 1 ? C.p1 : winner === 2 ? C.p2 : C.amber,
        winner,
        // Level on saves? The cleaner hands win it.
        tiebreak: [a.caught, b.caught],
        record: Math.max(a.saves, b.saves),
        rows: [row(a, "P1", C.p1), row(b, "P2", C.p2)],
      };
    },
  };
}

function createKeeper() {
  return {
    phase: "runup", t: 0, k: 0, shot: null, outcome: null, endX: 0.5, endY: 0.5,
    taken: 0, saves: 0, caught: 0, conceded: 0, tracked: false, history: [],
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

