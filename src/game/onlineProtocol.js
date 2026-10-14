// Shared with the server via scripts/sync-games.mjs in Galawgaw_Backend.
// Clients draw server snapshots and overlay current controls; only the server calls update.
import { createSignalPop } from './signalPop.js';
import { createWhackAMole } from './whackAMole.js';
import { createCopyPose } from './copyPose.js';
import { createIceBreaker } from './iceBreaker.js';
import { createHullBreach } from './hullBreach.js';
import { createFreezeFrame } from './freezeFrame.js';
import { createBeamDodge } from './beamDodge.js';
import { createTugOfWar } from './tugOfWar.js';
import { createVaultSync } from './vaultSync.js';
import { createEcho } from './echoGame.js';

export const ONLINE_PROTOCOL = 2;
export const FACTORIES = [createSignalPop, createWhackAMole, createCopyPose, createIceBreaker,
  createHullBreach, createFreezeFrame, createBeamDodge, createTugOfWar, createVaultSync, createEcho];
export const ONLINE_GAMES = FACTORIES.map(factory => {
  const g = factory();
  return { id: g.id, title: g.title, icon: g.icon, blurb: g.blurb, mode: g.mode,
    coop: !!g.coop, hands: Math.max(1, (g.numHands || 2) / 2), tutorial: g.tutorial };
});
export function createOnlineGame(id) {
  const index = ONLINE_GAMES.findIndex(g => g.id === id);
  if (index < 0) throw new Error('Unknown game.');
  const game = FACTORIES[index]();
  // Each versus lane is a complete 16:9 camera. Hull Breach shares one board.
  game.init({ view: onlineView(id) });
  return game;
}
export function onlineView(id) {
  return id === 'hullbreach' ? { width: 960, height: 540, videoWidth: 960, videoHeight: 540 }
    : { width: 1280, height: 360, videoWidth: 1280, videoHeight: 360 };
}

// Reproduce object-fit:cover inside one player's lane and retain physical
// proportions for pose checks. A player's inputs can never enter a rival lane.
export function mapOnlineLandmarks(points, side, aspect, gameId) {
  const view = onlineView(gameId);
  const laneWidth = gameId === 'hullbreach' ? view.width : view.width / 2;
  const left = gameId === 'hullbreach' ? 0 : side * laneWidth;
  const scale = Math.max(laneWidth / aspect, view.height);
  return points.map(p => {
    const x = left + laneWidth / 2 + (.5 - p.x) * aspect * scale;
    return { ...p, x: 1 - Math.max(left + .001, Math.min(left + laneWidth - .001, x)) / view.width,
      y: (.5 * view.height + (p.y - .5) * scale) / view.height };
  });
}

// Ignore helpers with closures and functions. Nested pose definitions keep
// their labels/arms for drawing, while checks remain exclusively on the server.
export function gameFrame(game) {
  // The renderer initializes these once; repeating tutorials and metadata in
  // every 50 ms frame wastes bandwidth and serialization time.
  const { title, icon, blurb, hint, tutorial, mode, numHands, numPoses, ...state } = game;
  return JSON.parse(JSON.stringify(state, (key, value) =>
    ['fx', 'shake', 'tracker', 'meter', 'previous', 'base'].includes(key) || typeof value === 'function' ? undefined
      : typeof value === 'number' ? Math.round(value * 10000) / 10000 : value));
}
export function applyGameFrame(game, frame) {
  Object.assign(game, frame);
}

// Numeric event counters, independent of the HUD (whose values can be strings).
export function gameMetrics(game, side) {
  const p = game.players?.[side];
  switch (game.id) {
    case 'signalpop': return { score: game.scores[side], misses: game.escaped[side] };
    case 'whackamole': return { score: game.scores[side], misses: game.misses[side] };
    case 'copypose': return { score: p.score, misses: p.misses };
    case 'icebreaker': return { score: game.broken(side), misses: 0 };
    case 'hullbreach': return { score: game.sealed, misses: game.escalations };
    case 'freezeframe': return { score: Math.round(p.progress * 100), misses: p.busted };
    case 'beamdodge': return { score: p.dodged, misses: p.hits };
    case 'tugofwar': return { score: Math.round(game.work[side]), misses: 0 };
    case 'vaultsync': return { score: game.cracked, misses: 0 };
    case 'echo': return { score: p.cleared * 100 + p.step, misses: p.out ? 1 : 0 };
    default: return { score: 0, misses: 0 };
  }
}
