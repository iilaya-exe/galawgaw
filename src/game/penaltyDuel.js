import { clamp, lerp, toCanvasPoint } from './utils.js';
import { createPoseTracker, IDX, drawSkeleton } from './poseKit.js';
import { drawBall, drawGoal, drawGlove } from './footballKit.js';
import { C } from './theme.js';
import { sfx } from './audio.js';

const SHOTS = 5, SHOT_CLOCK = 6, FLIGHT = .95, RESULT = 1.6;

function drawHint(ctx, x, y, text, color, laneWidth) {
  ctx.save(); ctx.fillStyle = color; ctx.textAlign = 'center';
  ctx.font = '700 12px "JetBrains Mono", monospace';
  ctx.fillText(text, x, y, Math.max(1, laneWidth - 16)); ctx.restore();
}

// One pose tracker drives both knee kicks and wrist gloves. Goal positions
// are normalized within each lane, so resizing never changes a shot or save.
export function createPenaltyDuel() {
  return {
    id: 'penaltyduel', title: 'Penalty Duel', icon: '⚽', players: '2P VERSUS',
    blurb: 'Your shot. Their gloves. Take turns scoring penalties and making ridiculous saves. Five shots each.',
    hint: 'One player on each side. Step back so knees and wrists are visible.',
    tutorial: [
      'Striker: step sideways to aim, then lift a knee to shoot. Lower it to reload.',
      'Keeper: move your hands to move the gloves. Meet the ball as it reaches the goal.',
      'Swap roles after every shot. Five shots each; most goals wins. No real ball needed.',
    ],
    mode: 'pose', numPoses: 2,
    init({ view, practice = false }) {
      this.view = view; this.practice = practice; this.tracker = createPoseTracker();
      this.players = [0, 1].map(() => ({ landmarks: null, tracked: false, legs: false, armed: false, aim: .5, lift: 0, gloves: [], goals: 0, saves: 0, shots: [] }));
      this.drill = [0, 0]; this.turn = 0; this.striker = 0; this.phase = 'aim';
      this.t = 0; this.ball = null; this.outcome = ''; this.over = false;
    },
    onResize(view) { this.view = view; },
    onResults(poses) {
      const slots = this.tracker.assign(poses);
      this.players.forEach((p, side) => {
        p.landmarks = slots[side]; p.tracked = !!slots[side];
        p.gloves = []; p.legs = false; p.lift = 0;
        if (!p.tracked) { p.armed = false; return; }
        const points = p.landmarks;
        const point = i => toCanvasPoint(points[i], this.view);
        const visible = i => points[i] && (points[i].visibility ?? 1) >= .5;
        const shoulder = { x: (point(IDX.ls).x + point(IDX.rs).x) / 2, y: (point(IDX.ls).y + point(IDX.rs).y) / 2 };
        const hip = { x: (point(IDX.lh).x + point(IDX.rh).x) / 2, y: (point(IDX.lh).y + point(IDX.rh).y) / 2 };
        const torso = Math.max(20, Math.hypot(hip.x - shoulder.x, hip.y - shoulder.y));
        const lane = this.view.width / 2;
        p.aim = clamp((((hip.x + shoulder.x) / 2 - side * lane) / lane - .5) * 2.4 + .5, -.12, 1.12);
        for (const [knee, hipIndex] of [[25, IDX.lh], [26, IDX.rh]]) {
          if (!visible(knee)) continue;
          p.legs = true;
          p.lift = Math.max(p.lift, (.95 - (point(knee).y - point(hipIndex).y) / torso) / .4);
        }
        for (const wrist of [IDX.lw, IDX.rw]) {
          if (!visible(wrist)) continue;
          const w = point(wrist);
          p.gloves.push({ x: clamp(.5 + (w.x - shoulder.x) / (torso * 2.2), 0, 1), y: clamp(.5 + (w.y - shoulder.y) / (torso * 2), 0, 1) });
        }
      });
    },
    update(dt) {
      if (this.over) return;
      this.t += dt;
      const striker = this.players[this.striker], keeper = this.players[1 - this.striker];
      if (this.phase === 'aim') {
        if (striker.tracked && striker.legs && striker.lift < .45) striker.armed = true;
        if (striker.armed && striker.legs && striker.lift >= 1 && keeper.tracked) this.kick();
        else if (!this.practice && this.t >= SHOT_CLOCK) this.finishShot('timeout');
      } else if (this.phase === 'flight') {
        const k = clamp(this.t / FLIGHT, 0, 1);
        // Only save near arrival; hovering over the distant ball is not a save.
        if (k >= .82 && this.ball.x >= 0 && this.ball.x <= 1 && keeper.tracked && keeper.gloves.some(g => Math.hypot(g.x - this.ball.x, (g.y - this.ball.y) * .7) <= .17)) this.finishShot('saved');
        else if (k >= 1) this.finishShot(this.ball.x < 0 || this.ball.x > 1 ? 'wide' : 'goal');
      } else if (this.phase === 'result' && this.t >= RESULT) {
        this.turn++;
        if (!this.practice && this.turn >= SHOTS * 2) { this.over = true; return; }
        this.striker = this.turn % 2; this.phase = 'aim'; this.t = 0; this.ball = null; this.outcome = '';
        // Each turn requires a fresh lowered knee, including after tracking loss.
        this.players[this.striker].armed = false;
      }
    },
    kick() {
      const p = this.players[this.striker];
      this.ball = { x: p.aim, y: clamp(.65 - (p.lift - 1) * .2, .15, .8) };
      p.armed = false; this.phase = 'flight'; this.t = 0;
      this.drill[this.striker] = 1;
      sfx.whack();
    },
    finishShot(outcome) {
      const p = this.players[this.striker];
      p.shots.push(outcome);
      if (outcome === 'goal') { p.goals++; sfx.bonus(); }
      else if (outcome === 'saved') { this.players[1 - this.striker].saves++; sfx.seal(); }
      else sfx.fail();
      this.outcome = outcome; this.phase = 'result'; this.t = 0;
    },
    draw(ctx) {
      const { width: W, height: H } = this.view, lane = W / 2;
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(lane, 0); ctx.lineTo(lane, H); ctx.stroke();
      for (const side of [0, 1]) {
        const p = this.players[side], color = side === 0 ? C.p1 : C.p2;
        const left = lane * side, cx = left + lane / 2;
        const gw = lane * .4, gh = H * .46, top = H * .22;
        // Keep drawing and glove collision in the same goal coordinate space.
        const at = (x, y) => ({ x: cx - gw + x * gw * 2, y: top + y * gh });
        const keeper = this.players[1 - this.striker];
        if (p.landmarks) drawSkeleton(ctx, p.landmarks, this.view, { color, glow: 0 });
        drawGoal(ctx, cx, top, gw, gh, { glow: null });
        drawHint(ctx, cx, H * .1, `P${side + 1} / ${side === this.striker ? 'STRIKER' : 'KEEPER'}`, color, lane);
        for (const g of keeper.gloves) {
          const pos = at(g.x, g.y);
          drawGlove(ctx, pos.x, pos.y, Math.min(lane, H) * .045, this.striker === 0 ? C.p2 : C.p1, 0, false, false);
        }
        if (this.phase === 'aim') {
          const target = at(this.players[this.striker].aim, .65);
          ctx.strokeStyle = this.striker === 0 ? C.p1 : C.p2; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(target.x, target.y, 10, 0, Math.PI * 2); ctx.stroke();
          drawBall(ctx, cx, H * .8, Math.min(18, lane * .06));
        } else if (this.ball) {
          const k = this.phase === 'flight' ? clamp(this.t / FLIGHT, 0, 1) : 1;
          const end = at(this.ball.x, this.ball.y);
          drawBall(ctx, lerp(cx, end.x, k), lerp(H * .8, end.y, k) - Math.sin(k * Math.PI) * H * .12, lerp(18, 10, k), k * 8);
        }
        const word = this.outcome === 'goal' ? 'GOAL!' : this.outcome === 'saved' ? 'SAVED!' : this.outcome === 'wide' ? 'WIDE!' : 'TIME’S UP';
        const help = !p.tracked ? 'STEP INTO YOUR SIDE' : side === this.striker ? (!p.legs ? 'STEP BACK / KNEES IN VIEW' : 'STEP TO AIM / LIFT A KNEE') : 'MOVE YOUR HANDS TO SAVE';
        drawHint(ctx, cx, H * .93, this.phase === 'result' ? word : help, this.phase === 'result' ? C.amber : color, lane);
      }
      ctx.restore();
    },
    getDrill() { return { label: 'TAKE A SHOT EACH', tip: 'P1 shoots first. Try your knee kick, then swap roles.', target: 1, progress: this.drill, done: this.drill.every(n => n >= 1) }; },
    getHud() {
      const pod = (p, side) => ({ value: p.goals, meta: `${side === this.striker ? 'SHOOTING' : 'KEEPING'} · ${p.shots.length}/${SHOTS} SHOTS`, ratio: p.shots.length / SHOTS });
      return { p1: pod(this.players[0], 0), p2: pod(this.players[1], 1), center: { value: this.phase === 'aim' ? Math.max(0, Math.ceil(SHOT_CLOCK - this.t)) : this.phase === 'flight' ? 'SAVE!' : 'SWAP', label: `P${this.striker + 1} SHOOTS`, ratio: clamp(1 - this.turn / (SHOTS * 2), 0, 1), danger: this.phase === 'aim' && this.t > 4 } };
    },
    isOver() { return this.over; },
    getSummary() {
      const [a, b] = this.players, winner = a.goals === b.goals ? null : a.goals > b.goals ? 1 : 2;
      return { winner, title: winner ? `PLAYER ${winner} WINS` : 'HONOURS EVEN', color: winner === 2 ? C.p2 : C.p1, record: Math.max(a.goals, b.goals), tiebreak: [a.goals, b.goals], rows: this.players.map((p, side) => ({ tag: `P${side + 1}`, value: `${p.goals} goals`, text: `${p.saves} saves · ${p.shots.length} penalties`, ratio: p.goals / SHOTS, color: side === 0 ? C.p1 : C.p2 })) };
    },
  };
}
