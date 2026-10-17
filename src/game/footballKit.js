/* ═══════════════════════════════════════════════════════════════════
   Shared drawing for the two penalty channels, Spot Kick and Super
   Save. Drawing only — no rules live here, so the server never needs it
   to agree on anything.
   ═══════════════════════════════════════════════════════════════════ */

export const KEEPER = "#ffc247";

// A football: white ball, a dark centre pentagon and five edge patches.
// Rotation is passed in so a ball in flight visibly spins.
export function drawBall(ctx, x, y, r, spin = 0, alpha = 1) {
  if (r <= 0.5) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.fillStyle = "#f4f4f2";
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.rotate(spin);
  ctx.fillStyle = "#1c1d29";
  pentagon(ctx, 0, 0, r * 0.36);
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
    pentagon(ctx, Math.cos(a) * r * 0.98, Math.sin(a) * r * 0.98, r * 0.3, a);
  }
  ctx.restore();
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = Math.max(1, r * 0.08);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function pentagon(ctx, x, y, r, rotation = 0) {
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = rotation - Math.PI / 2 + (i * Math.PI * 2) / 5;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

// A goal seen from the penalty spot: posts, crossbar and a light net.
// `ripple` (0-1) bulges the net after a goal.
export function drawGoal(ctx, cx, top, halfWidth, height, { ripple = 0, glow = null } = {}) {
  const left = cx - halfWidth;
  const right = cx + halfWidth;
  const bottom = top + height;
  const depth = height * 0.28;
  ctx.save();
  // Net: a vertical and horizontal mesh, faint so the camera stays visible.
  ctx.strokeStyle = "rgba(255,255,255,0.13)";
  ctx.lineWidth = 1;
  const bulge = ripple * height * 0.12;
  for (let i = 1; i < 14; i++) {
    const x = left + (i / 14) * halfWidth * 2;
    ctx.beginPath();
    ctx.moveTo(x, top + depth * 0.4);
    ctx.quadraticCurveTo(x, (top + bottom) / 2 - bulge, x, bottom);
    ctx.stroke();
  }
  for (let i = 1; i < 6; i++) {
    const y = top + depth * 0.4 + (i / 6) * (height - depth * 0.4);
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.quadraticCurveTo(cx, y - bulge, right, y);
    ctx.stroke();
  }
  // Frame
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = Math.max(3, halfWidth * 0.035);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (glow) {
    ctx.shadowColor = glow;
    ctx.shadowBlur = 12;
  }
  ctx.beginPath();
  ctx.moveTo(left, bottom);
  ctx.lineTo(left, top);
  ctx.lineTo(right, top);
  ctx.lineTo(right, bottom);
  ctx.stroke();
  ctx.restore();
  // Goal line
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(left - halfWidth * 0.5, bottom);
  ctx.lineTo(right + halfWidth * 0.5, bottom);
  ctx.stroke();
  ctx.restore();
}

// Keeper: the man in yellow. Two poses from the same artwork — the ready
// stance (knees bent, feet wide, gloves at the hips) and mid-dive (arms
// out, one leg trailing), which is rotated to lay him out along the dive.
const KEEPER_STAND_SRC = "sprites/keeper-stand.png";
const KEEPER_DIVE_SRC = "sprites/keeper-dive.png";
const KEEPER_PIVOT = { x: 0.46, y: 0.31 };   // chest of the dive pose, the point it turns about
const DIVE_BLEND = [0.05, 0.18];              // |dive| range over which standing fades into diving

/* A keeper in a bright kit. `dive` runs -1 (full stretch left) to 1
   (full stretch right); 0 is standing set with arms out. `s` is the
   standing height, feet on `baseY`. */
export function drawKeeper(ctx, x, baseY, s, dive = 0, color = KEEPER) {
  const stand = sprite(KEEPER_STAND_SRC);
  const diving = sprite(KEEPER_DIVE_SRC);
  if (!stand || !diving) { drawVectorKeeper(ctx, x, baseY, s, dive, color); return; }

  const height = s * 1.15;
  const amount = Math.abs(dive);
  const mix = Math.min(1, Math.max(0, (amount - DIVE_BLEND[0]) / (DIVE_BLEND[1] - DIVE_BLEND[0])));

  if (mix < 1) {
    const width = height * (stand.naturalWidth / stand.naturalHeight);
    ctx.save();
    ctx.globalAlpha *= 1 - mix;
    ctx.drawImage(stand, x - width / 2, baseY - height, width, height);
    ctx.restore();
  }
  if (mix > 0) {
    const width = height * (diving.naturalWidth / diving.naturalHeight);
    // Laid out sideways, the chest drops to about mid-goal height.
    const drop = amount * height * 0.32;
    ctx.save();
    ctx.globalAlpha *= mix;
    ctx.translate(x + dive * s * 0.45, baseY - height * (1 - KEEPER_PIVOT.y) + drop);
    ctx.rotate(dive * 1.2);
    // The raised leg should trail behind a dive, not lead it.
    if (dive > 0) ctx.scale(-1, 1);
    ctx.drawImage(diving, -width * KEEPER_PIVOT.x, -height * KEEPER_PIVOT.y, width, height);
    ctx.restore();
  }
}

function drawVectorKeeper(ctx, x, baseY, s, dive, color) {
  const lean = dive * 1.2;                 // radians of body tilt at full stretch
  const lift = Math.abs(dive) * s * 0.28;  // a dive leaves the ground
  ctx.save();
  ctx.translate(x + dive * s * 0.35, baseY - lift);
  ctx.rotate(lean);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // Legs
  ctx.strokeStyle = "#1c1d29";
  ctx.lineWidth = s * 0.13;
  ctx.beginPath();
  ctx.moveTo(-s * 0.1, -s * 0.42); ctx.lineTo(-s * 0.2 - Math.abs(dive) * s * 0.1, 0);
  ctx.moveTo(s * 0.1, -s * 0.42); ctx.lineTo(s * 0.2 + Math.abs(dive) * s * 0.1, 0);
  ctx.stroke();
  // Body
  ctx.strokeStyle = color;
  ctx.lineWidth = s * 0.3;
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.48); ctx.lineTo(0, -s * 0.78);
  ctx.stroke();
  // Arms reach up and out; a dive throws both towards the ball.
  ctx.lineWidth = s * 0.1;
  const reach = s * (0.42 + Math.abs(dive) * 0.2);
  ctx.beginPath();
  ctx.moveTo(-s * 0.1, -s * 0.8); ctx.lineTo(-reach, -s * 1.08);
  ctx.moveTo(s * 0.1, -s * 0.8); ctx.lineTo(reach, -s * 1.08);
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  for (const gx of [-reach, reach]) {
    ctx.beginPath();
    ctx.arc(gx, -s * 1.08, s * 0.085, 0, Math.PI * 2);
    ctx.fill();
  }
  // Head
  ctx.fillStyle = "#f1d3b5";
  ctx.beginPath();
  ctx.arc(0, -s * 0.98, s * 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/* Artwork lives in public/sprites/ and is loaded lazily the first time it
   is drawn. The server only runs rules and never draws, so there is no
   Image there and nothing is fetched. Until an image arrives (or if it
   fails) the drawn vector version stands in. */
const sprites = {};

function sprite(src) {
  if (typeof Image === "undefined") return null;
  let image = sprites[src];
  if (!image) {
    image = sprites[src] = new Image();
    image.decoding = "async";
    image.src = src;
  }
  return image.complete && image.naturalWidth > 0 ? image : null;
}

// Glove: the back of the blue glove, fingers up, thumb on the left.
const GLOVE_SRC = "sprites/keeper-glove.png";
const GLOVE_ANCHOR = { x: 0.5, y: 0.58 };    // palm centre within the artwork

/* A goalkeeper glove at a palm position. `angle` points from the wrist
   towards the fingers so the glove turns with the hand; `flip` mirrors it
   when the thumb is on the right. `color` is the player's halo, which is
   what tells the two keepers' gloves apart. */
export function drawGlove(ctx, x, y, r, color, angle = -Math.PI / 2, active = false, flip = false) {
  ctx.save();
  ctx.translate(x, y);

  const halo = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 1.7);
  halo.addColorStop(0, withAlpha(color, active ? 0.55 : 0.35));
  halo.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.7, 0, Math.PI * 2);
  ctx.fill();

  ctx.rotate(angle + Math.PI / 2);
  if (flip) ctx.scale(-1, 1);
  const image = sprite(GLOVE_SRC);
  if (image) {
    const height = r * 3.2;
    const width = height * (image.naturalWidth / image.naturalHeight);
    ctx.drawImage(image, -width * GLOVE_ANCHOR.x, -height * GLOVE_ANCHOR.y, width, height);
  } else {
    drawVectorGlove(ctx, r, color);
  }
  ctx.restore();
}

function drawVectorGlove(ctx, r, color) {
  ctx.fillStyle = color;
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = Math.max(2, r * 0.12);
  for (let i = 0; i < 4; i++) {
    const fx = (-0.45 + i * 0.3) * r;
    roundRect(ctx, fx - r * 0.13, -r * 1.25, r * 0.26, r * 0.8, r * 0.13);
    ctx.fill();
  }
  ctx.save();
  ctx.rotate(-0.7);
  roundRect(ctx, -r * 0.95, -r * 0.55, r * 0.26, r * 0.7, r * 0.13);
  ctx.fill();
  ctx.restore();
  roundRect(ctx, -r * 0.62, -r * 0.6, r * 1.24, r * 1.1, r * 0.4);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  roundRect(ctx, -r * 0.5, r * 0.42, r, r * 0.22, r * 0.1);
  ctx.fill();
}

// "#22e6c8" → "rgba(34,230,200,a)"; any other colour string passes through.
function withAlpha(color, alpha) {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return color;
  const n = parseInt(m[1], 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${alpha})`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

/* One hand drives both gloves: a pair held side by side, the way a keeper
   gathers a ball. `angle` points from the wrist towards the fingers; the
   gloves sit either side of that line, splayed a little, thumbs inward.
   The artwork has its thumb on the left, so the left glove is mirrored.
   `r` is the glove size passed to drawGlove. */
export function glovePair(x, y, angle, r) {
  const px = Math.cos(angle + Math.PI / 2);   // perpendicular to the fingers
  const py = Math.sin(angle + Math.PI / 2);
  const gap = r * 1.05;
  return [
    { x: x - px * gap, y: y - py * gap, angle: angle - 0.22, flip: true },
    { x: x + px * gap, y: y + py * gap, angle: angle + 0.22, flip: false },
  ];
}

// Big centred result word ("GOAL!", "SAVED!") that pops in and fades.
export function drawCallout(ctx, x, y, text, color, k, size = 44) {
  const pop = k < 0.15 ? 0.6 + (k / 0.15) * 0.5 : k < 0.3 ? 1.1 - ((k - 0.15) / 0.15) * 0.1 : 1;
  ctx.save();
  ctx.globalAlpha = k > 0.8 ? Math.max(0, (1 - k) / 0.2) : 1;
  ctx.translate(x, y);
  ctx.scale(pop, pop);
  ctx.font = `700 ${Math.round(size)}px "Space Grotesk", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = Math.max(4, size * 0.14);
  ctx.strokeStyle = "rgba(7,7,13,0.75)";
  ctx.strokeText(text, 0, 0);
  ctx.fillStyle = color;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

// Small labelled hint text, used for "STEP INTO FRAME" style prompts.
export function drawHint(ctx, x, y, text, color, pulse = true) {
  ctx.save();
  ctx.font = '700 12px "JetBrains Mono", monospace';
  ctx.textAlign = "center";
  ctx.fillStyle = color;
  if (pulse) ctx.globalAlpha = 0.6 + Math.sin(Date.now() / 240) * 0.4;
  ctx.fillText(text, x, y);
  ctx.restore();
}
