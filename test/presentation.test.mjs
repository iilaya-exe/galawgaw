import { test } from 'node:test';
import assert from 'node:assert/strict';
import { presentFrame } from '../src/online/presentation.ts';
import { ONLINE_GAMES, createOnlineGame, gameFrame, applyGameFrame, mapOnlineLandmarks } from '../src/game/onlineProtocol.js';

const freeze = obj => { if (obj && typeof obj === 'object') { Object.values(obj).forEach(freeze); Object.freeze(obj); } return obj; };
test('projection is bounded after packet loss and stops for paused/finished matches', () => {
  const frame = freeze({ elapsed: 4, scores: [2,3], bubbles: [{ y: 100, vy: 80, wobble: 0, popped: false }] });
  const next = presentFrame('signalpop', frame, 10000, true);
  assert.equal(next.bubbles[0].y, 93.6);
  assert.equal(next.elapsed, 4.08);
  assert.deepEqual(next.scores, [2,3]);
  assert.equal(frame.bubbles[0].y, 100);
  assert.equal(presentFrame('signalpop', frame, 1000, false).bubbles[0].y, 100);
});
const noop = () => {};
const context = new Proxy({ measureText: () => ({width: 10}), createLinearGradient: () => ({addColorStop:noop}), createRadialGradient: () => ({addColorStop:noop}) }, {get:(o,k)=>o[k] ?? noop});
for (const meta of ONLINE_GAMES) test(`${meta.title}: immediate controls render without mutating authoritative state`, () => {
  const game = createOnlineGame(meta.id);
  const frame = freeze(gameFrame(game));
  const before = JSON.stringify(frame);
  applyGameFrame(game, presentFrame(meta.id, frame, 40, true));
  const points = Array.from({length:meta.mode === 'pose' ? 33 : 21},()=>({x:.5,y:.5,visibility:1}));
  const mapped = mapOnlineLandmarks(points,1,16/9,meta.id);
  if (game.tracker) game.tracker.assign = () => [null,mapped];
  game.onResults([mapped]);
  game.draw(context);
  assert.equal(JSON.stringify(frame), before);
  assert.equal(gameFrame(game).timeLeft, frame.timeLeft);
});
