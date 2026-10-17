import { toCanvasPoint, createFx, createShake, clamp, lerp } from "./utils.js";
import { C } from "./theme.js";
import { sfx } from "./audio.js";
import { IDX, isUsable, poseCenter, drawSkeleton } from "./poseKit.js";
import { KEEPER, drawBall, drawGoal, drawKeeper, drawCallout, drawHint } from "./footballKit.js";

/* ═══════════════════════════════════════════════════════════════════
   SPOT KICK — solo. You are the striker.

   One player, one goal, the whole screen. Step left or right to move
   the aim along the goal mouth, then lift a knee (or swing a foot) to
   shoot: a sharper kick flies faster and higher. Corners beat the keeper
   more often; past the post is wide. Keep scoring — three misses (saved
   or wide) and the run is over, and the keeper reads you better with
   every penalty.
   ═══════════════════════════════════════════════════════════════════ */

const LIVES = 3;                // misses allowed before the run ends
const SHOT_CLOCK = 8;           // seconds before the kick is taken for you
const RESULT_TIME = 1.5;        // seconds the GOAL / SAVED callout holds
const KICK_ON = 1;              // lift level that fires a kick
const KICK_REARM = 0.45;        // lift must fall below this before the next one
const MIN_VISIBILITY = 0.5;     // knees and ankles below this are not trusted
const AIM_GAIN = 3;             // screen fraction → goal units (1 = the post)
const AIM_LIMIT = 1.18;         // stepping far enough can put it wide
const LK = 25, RK = 26, LA = 27, RA = 28;

export function createSpotKick() {
  return {
    id: "spotkick",
    title: "Spot Kick",
    icon: "⚽",
    blurb: "Solo. You're the striker: step to aim, lift your knee to shoot. Three misses and you're out.",
    players: "1P SOLO",
    hint: "Step back — full body in frame, knees too",
    tutorial: [
      "Step left or right — the target on the goal moves with you.",
      "Lift your knee or swing your foot to shoot. A sharper kick flies faster.",
      "Corners beat the keeper. Past the post is wide. Three misses ends the run.",
    ],
    mode: "pose",
    numPoses: 1,
    solo: true,                 // one player: no versus, not in the Gauntlet or online

    init({ view, practice = false }) {
      this.view = view;
      this.practice = practice;
      this.drill = [0, 0];
      this.player = createStriker();
      this.elapsed = 0;
      this.fx = createFx();
      this.shake = createShake();
      this.over = false;
    },

    onResize(view) {
      // Aim and flight are stored in goal units, so they survive a resize.
      this.view = view;
    },

    // The most central usable body is the player.
    onResults(poses) {
      const usable = poses.filter(isUsable);
      usable.sort((a, b) => Math.abs(poseCenter(a) - 0.5) - Math.abs(poseCenter(b) - 0.5));
      this.player.landmarks = usable[0] || null;
    },

    // Goal and spot positions, derived from the view each time.
    layout() {
      const W = this.view.width;
      const H = this.view.height;
      const cx = W / 2;
      const gw = Math.min(W * 0.34, H * 0.5);
      const gh = gw * 0.62;
      const top = H * 0.13;
      return { W, H, cx, gw, gh, top, spotY: H * 0.86 };
    },

    /* Reads the body into an aim (goal units) and a kick lift. Lift is
       measured in torso lengths so it means the same near or far:
       0 standing, 1 = knee raised well towards the hip or one foot swung
       half a torso above the other. */
    readBody() {
      const landmarks = this.player.landmarks;
      if (!landmarks) return null;
      const L = this.layout();
      const p = (index) => toCanvasPoint(landmarks[index], this.view);
      const shoulders = mid(p(IDX.ls), p(IDX.rs));
      const hips = mid(p(IDX.lh), p(IDX.rh));
      const torso = Math.max(20, Math.hypot(shoulders.x - hips.x, shoulders.y - hips.y));
      const screenX = (shoulders.x + hips.x) / 2 / L.W;

      const seen = (index) => landmarks[index] && (landmarks[index].visibility ?? 1) >= MIN_VISIBILITY;
      let lift = 0;
      let legs = false;
      for (const [knee, ankle, otherAnkle, hip] of [[LK, LA, RA, IDX.lh], [RK, RA, LA, IDX.rh]]) {
        if (seen(knee)) {
          legs = true;
          const drop = (p(knee).y - p(hip).y) / torso;            // ≈0.95 standing
          lift = Math.max(lift, (0.95 - drop) / 0.4);
        }
        if (seen(ankle) && seen(otherAnkle)) {
          legs = true;
          lift = Math.max(lift, ((p(otherAnkle).y - p(ankle).y) / torso) / 0.5);
        }
      }
      return { aim: clamp((screenX - 0.5) * AIM_GAIN, -AIM_LIMIT, AIM_LIMIT), lift: Math.max(0, lift), legs };
    },

    update(dt) {
      if (this.over) return;
      this.elapsed += dt;
      this.fx.update(dt);
      this.shake.update(dt);

      const player = this.player;
      const body = this.readBody();
      player.tracked = !!body;
      player.legs = !!body?.legs;
      if (body) player.aim = lerp(player.aim, body.aim, Math.min(1, dt * 10));
      const lift = body ? body.lift : 0;
      const liftSpeed = dt > 0 ? (lift - player.lift) / dt : 0;
      player.lift = lift;
      player.keeperT += dt;

      if (player.phase === "aim") {
        player.clock += dt;
        if (lift < KICK_REARM) player.armed = true;
        const kicked = player.armed && lift >= KICK_ON;
        const timedOut = !this.practice && player.clock >= SHOT_CLOCK;
        if (kicked || timedOut) this.kick(kicked ? clamp(liftSpeed / 6, 0.25, 1) : 0.15);
        // An idle keeper shuffles and bounces on their line.
        player.keeper.x = Math.sin(player.keeperT * 1.7) * 0.18;
        player.keeper.dive = 0;
      } else if (player.phase === "flight") {
        player.t += dt;
        const ball = player.ball;
        if (player.t >= ball.dive) {
          const k = clamp((player.t - ball.dive) / 0.3, 0, 1);
          player.keeper.x = lerp(ball.keeperFrom, ball.keeperTo, easeOut(k));
          player.keeper.dive = clamp((ball.keeperTo - ball.keeperFrom) / 0.9, -1, 1) * easeOut(k);
        }
        if (player.t >= ball.flight) this.resolve();
      } else if (player.phase === "result") {
        player.t += dt;
        if (player.t >= RESULT_TIME) {
          if (!this.practice && player.misses >= LIVES) this.over = true;
          else this.nextShot();
        }
      }
    },

    kick(power) {
      const player = this.player;
      const aim = player.aim;
      // Shot height follows power: a soft kick stays low, a sharp one rises.
      const height = clamp(0.2 + power * 0.65 + (Math.random() - 0.5) * 0.12, 0.12, 0.92);
      const shotIndex = player.shots.length;
      /* The keeper either reads the kicker (dives at the shot, slightly
         off) or guesses: usually a side, sometimes stays home. Reading
         improves with every penalty, so a long run gets harder. */
      const read = this.practice ? 0 : Math.min(0.6, 0.2 + shotIndex * 0.04);
      const roll = Math.random();
      const keeperTo = this.practice ? player.keeper.x
        : Math.random() < read ? clamp(aim + (Math.random() - 0.5) * 0.5, -0.8, 0.8)
        : roll < 0.22 ? 0
        : (roll < 0.61 ? -1 : 1) * (0.5 + Math.random() * 0.1);
      player.ball = {
        aim, height, power,
        flight: 0.62 - power * 0.2,
        dive: 0.1 + (1 - power) * 0.08,
        keeperFrom: player.keeper.x,
        keeperTo,
      };
      player.phase = "flight";
      player.t = 0;
      player.armed = false;
      sfx.whack();
    },

    resolve() {
      const player = this.player;
      const ball = player.ball;
      const L = this.layout();
      let outcome;
      if (Math.abs(ball.aim) > 1) outcome = "wide";
      else {
        // Gloves reach further for a low, soft ball than a high, hard one.
        const reach = this.practice ? 0.18 : 0.36 - 0.16 * ball.height + (1 - ball.power) * 0.1;
        outcome = Math.abs(player.keeper.x - ball.aim) < reach ? "saved" : "goal";
      }
      player.shots.push(outcome);
      player.phase = "result";
      player.t = 0;
      player.ball.final = outcome;
      const x = L.cx + ball.aim * L.gw;
      const y = L.top + L.gh * (1 - ball.height);
      if (outcome === "goal") {
        player.goals += 1;
        player.streak += 1;
        player.bestStreak = Math.max(player.bestStreak, player.streak);
        if (this.practice) this.drill[0] = 1;
        this.fx.burst(x, y, C.p1, 16, 240);
        this.shake.add(5);
        sfx.bonus();
      } else {
        player.streak = 0;
        if (!this.practice) player.misses += 1;
        if (outcome === "saved") { this.fx.burst(x, y, KEEPER, 10, 160); sfx.seal(); }
        else sfx.fail();
      }
    },

    nextShot() {
      const player = this.player;
      player.phase = "aim";
      player.t = 0;
      player.clock = 0;
      player.ball = null;
      player.keeper = { x: 0, dive: 0 };
    },

    draw(ctx) {
      const shaking = this.shake.apply(ctx);
      const player = this.player;
      const L = this.layout();
      const accent = C.p1;
      const goalLine = L.top + L.gh;

      // Penalty area in perspective, faint, so the camera stays visible.
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.14)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(L.cx - L.gw * 1.6, goalLine);
      ctx.lineTo(L.cx - L.gw * 2.3, L.H * 0.97);
      ctx.moveTo(L.cx + L.gw * 1.6, goalLine);
      ctx.lineTo(L.cx + L.gw * 2.3, L.H * 0.97);
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.beginPath();
      ctx.ellipse(L.cx, L.spotY + 4, 6, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      if (player.landmarks) {
        drawSkeleton(ctx, player.landmarks, this.view, { color: accent, glow: 10 });
        drawLegs(ctx, player.landmarks, this.view, accent);
      }

      const goalFlash = player.phase === "result" && player.ball?.final === "goal";
      const ripple = goalFlash ? Math.max(0, 1 - player.t / 0.8) : 0;
      drawGoal(ctx, L.cx, L.top, L.gw, L.gh, { ripple, glow: goalFlash ? accent : null });

      drawKeeper(ctx, L.cx + player.keeper.x * L.gw, goalLine, L.gh * 0.82, player.keeper.dive);

      // Aim marker and trajectory hint while lining up.
      if (player.phase === "aim") {
        const ax = L.cx + clamp(player.aim, -AIM_LIMIT, AIM_LIMIT) * L.gw;
        const ay = L.top + L.gh * 0.5;
        const wide = Math.abs(player.aim) > 1;
        const color = wide ? "rgba(255,255,255,0.45)" : accent;
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 7]);
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.moveTo(L.cx, L.spotY);
        ctx.quadraticCurveTo((L.cx + ax) / 2, (L.spotY + ay) / 2 - L.gh * 0.6, ax, ay);
        ctx.stroke();
        ctx.restore();
        const pulse = 1 + Math.sin(this.elapsed * 6) * 0.08;
        ctx.save();
        ctx.strokeStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 10;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(ax, ay, 13 * pulse, 0, Math.PI * 2);
        ctx.moveTo(ax - 20, ay); ctx.lineTo(ax - 7, ay);
        ctx.moveTo(ax + 7, ay); ctx.lineTo(ax + 20, ay);
        ctx.moveTo(ax, ay - 20); ctx.lineTo(ax, ay - 7);
        ctx.moveTo(ax, ay + 7); ctx.lineTo(ax, ay + 20);
        ctx.stroke();
        ctx.restore();
        if (wide) drawHint(ctx, ax, ay - 28, "WIDE!", C.amber, false);

        // Kick meter beside the ball: how close the knee is to firing.
        const meter = clamp(player.lift / KICK_ON, 0, 1);
        const mx = L.cx + Math.min(L.gw * 0.5, 120);
        const mh = Math.min(70, L.H * 0.16);
        ctx.save();
        ctx.fillStyle = "rgba(255,255,255,0.12)";
        ctx.fillRect(mx, L.spotY - mh, 8, mh);
        ctx.fillStyle = player.armed ? accent : "rgba(255,255,255,0.35)";
        ctx.fillRect(mx, L.spotY - mh * meter, 8, mh * meter);
        ctx.font = '700 10px "JetBrains Mono", monospace';
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.fillText("KICK", mx - 4, L.spotY + 14);
        ctx.restore();

        if (!this.practice) {
          const left = Math.max(0, SHOT_CLOCK - player.clock);
          if (left < 4) drawHint(ctx, L.cx, L.spotY + 30, `SHOOT! ${Math.ceil(left)}`, C.amber);
        }
      }

      // Ball: on the spot, in flight, or resting where it ended up.
      let bx = L.cx, by = L.spotY, br = Math.max(9, L.gh * 0.13), spin = 0;
      if (player.ball) {
        const k = player.phase === "flight" ? clamp(player.t / player.ball.flight, 0, 1) : 1;
        const tx = L.cx + player.ball.aim * L.gw;
        const ty = L.top + L.gh * (1 - player.ball.height);
        const arc = Math.sin(k * Math.PI) * L.gh * 0.35;
        bx = lerp(L.cx, tx, k);
        by = lerp(L.spotY, ty, k) - arc;
        br = lerp(br, br * 0.55, k);
        spin = k * 9;
        if (player.ball.final === "saved") { bx += (player.t * 140) * Math.sign(player.ball.aim || 1); by += player.t * 90; }
      }
      drawBall(ctx, bx, by, br, spin);

      // Lives: three balls under the spot; a miss greys one out.
      if (!this.practice) {
        const dotY = Math.min(L.H - 14, L.spotY + 52);
        for (let i = 0; i < LIVES; i++) {
          const x = L.cx + (i - (LIVES - 1) / 2) * 26;
          drawBall(ctx, x, dotY, 8, 0, i < LIVES - player.misses ? 1 : 0.2);
        }
      }

      if (player.phase === "result") {
        const k = player.t / RESULT_TIME;
        const final = player.ball.final;
        const word = final === "goal" ? "GOAL!" : final === "saved" ? "SAVED!" : "WIDE";
        const color = final === "goal" ? accent : final === "saved" ? KEEPER : "#c9cbe0";
        drawCallout(ctx, L.cx, L.top + L.gh + L.H * 0.16, word, color, k, Math.min(64, L.W * 0.07));
      }

      if (!player.tracked) drawHint(ctx, L.cx, L.H * 0.62, "STEP INTO FRAME", C.amber);
      else if (!player.legs && player.phase === "aim") drawHint(ctx, L.cx, L.H * 0.62, "STEP BACK — KNEES IN VIEW", C.amber);

      this.fx.draw(ctx);
      if (shaking) ctx.restore();
    },

    // One player, so the warm-up shows a single slot (coop drill).
    getDrill() {
      return {
        label: "SCORE 1 PENALTY",
        tip: "Step to one side to aim, then lift your knee to shoot",
        target: 1,
        progress: this.drill,
        coop: true,
        done: this.drill[0] >= 1,
      };
    },

    getHud() {
      const player = this.player;
      const lives = LIVES - player.misses;
      return {
        p1: {
          tag: "GOALS",
          value: player.goals,
          meta: !player.tracked ? "NO SUBJECT" : player.streak > 1 ? `${player.streak} IN A ROW` : `${player.shots.length} TAKEN`,
          ratio: clamp(player.goals / Math.max(1, player.shots.length), 0, 1),
        },
        p2: {
          tag: "LIVES",
          value: lives,
          meta: lives === 1 ? "LAST CHANCE" : "MISSES LEFT",
          ratio: lives / LIVES,
          accent: C.amber,
        },
        center: {
          value: player.shots.length + (player.phase === "aim" ? 1 : 0),
          label: "PENALTY",
          ratio: lives / LIVES,
          danger: lives === 1,
        },
      };
    },

    isOver() { return this.over; },

    getSummary() {
      const p = this.player;
      const saved = p.shots.filter((s) => s === "saved").length;
      const wide = p.shots.filter((s) => s === "wide").length;
      return {
        title: p.goals === 1 ? "1 GOAL" : `${p.goals} GOALS`,
        color: C.p1,
        winner: null,
        solo: true,
        success: p.goals > 0,
        tiebreak: [0, 0],
        record: p.goals,
        rows: [
          { tag: "YOU", text: `${p.shots.length} penalties · ${saved} saved · ${wide} wide`, value: `${p.goals} goals`, ratio: clamp(p.goals / Math.max(1, p.shots.length), 0, 1), color: C.p1 },
          { tag: "STREAK", text: "most goals in a row", value: `${p.bestStreak}`, ratio: clamp(p.bestStreak / Math.max(1, p.goals), 0, 1), color: C.amber },
        ],
      };
    },
  };
}

function createStriker() {
  return {
    landmarks: null, tracked: false, legs: false,
    aim: 0, lift: 0, armed: false,
    phase: "aim", t: 0, clock: 0, keeperT: 0,
    ball: null, keeper: { x: 0, dive: 0 },
    shots: [], goals: 0, misses: 0, streak: 0, bestStreak: 0,
  };
}

const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const easeOut = (k) => 1 - (1 - k) * (1 - k);

// drawSkeleton stops at the hips; the striker needs to see their legs.
function drawLegs(ctx, landmarks, view, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  for (const [hip, knee, ankle] of [[IDX.lh, LK, LA], [IDX.rh, RK, RA]]) {
    const chain = [hip, knee, ankle].filter((i) => landmarks[i] && (landmarks[i].visibility ?? 1) >= 0.35);
    if (chain.length < 2) continue;
    ctx.beginPath();
    chain.forEach((i, n) => {
      const pt = toCanvasPoint(landmarks[i], view);
      if (n === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y);
    });
    ctx.stroke();
  }
  ctx.restore();
}
