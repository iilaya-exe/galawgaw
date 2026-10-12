import { useEffect, useRef, useState } from 'react';
import type { Snapshot } from './api';
import { createOnlineGame, applyGameFrame } from '../game/onlineProtocol.js';
import { sfx, isMuted, setMuted } from '../game/audio.js';

// Draw only: the browser never advances rules or submits a score.
export function GameStage({ snapshot, guestId, localVideo, remoteVideo }: {
  snapshot: Snapshot; guestId?: string;
  localVideo: React.RefObject<HTMLVideoElement | null>; remoteVideo: React.RefObject<HTMLVideoElement | null>;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const latest = useRef(snapshot); latest.current = snapshot;
  const shared = snapshot.gameId === 'hullbreach';
  const previous = useRef(snapshot);
  const [muted, mute] = useState(isMuted);
  useEffect(() => {
    const old = previous.current; previous.current = snapshot;
    if (snapshot.phase !== 'playing' || old.phase !== 'playing') return;
    if (snapshot.gameId === 'freezeframe' && old.frame.phase !== snapshot.frame.phase) {
      if (snapshot.frame.phase === 'red') sfx.alarm();
      else if (snapshot.frame.phase === 'warn') sfx.count(); else sfx.go();
    } else if (snapshot.gameId === 'echo' && (old.frame.showIndex !== snapshot.frame.showIndex || old.frame.phase !== snapshot.frame.phase)) {
      if (snapshot.frame.phase === 'answer') sfx.go(); else sfx.count();
    } else if (snapshot.players.some((p, i) => p.misses > (old.players[i]?.misses || 0))) sfx.fail();
    else if (snapshot.players.some((p, i) => p.score > (old.players[i]?.score || 0))) sfx.pop(0);
  }, [snapshot]);
  useEffect(() => {
    const game = createOnlineGame(snapshot.gameId) as any;
    let frame = 0;
    const draw = () => {
      const state = latest.current;
      const el = canvas.current;
      const ctx = el?.getContext('2d');
      if (el && ctx && state.gameId === game.id) {
        applyGameFrame(game, state.frame);
        ctx.clearRect(0, 0, el.width, el.height);
        ctx.save();
        game.draw(ctx);
        ctx.restore();
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [snapshot.gameId]);
  const players = [snapshot.players[0], snapshot.players[1]];
  return <section className={`online-stage ${shared ? 'online-stage-shared' : ''}`} aria-label={`${snapshot.game.title} play area`}>
    <div className="online-game-hud">
      {([snapshot.hud.p1, snapshot.hud.center, snapshot.hud.p2]).map((hud, i) => <div key={i}>
        <span>{hud?.tag || (i === 1 ? hud?.label : `${i === 0 ? 'P1' : 'P2'} · ${players[i === 0 ? 0 : 1]?.name || 'Waiting…'}`)}</span>
        <strong>{hud?.value ?? '—'}</strong><small>{hud?.meta}</small>
      </div>)}
    </div>
    <div className="online-board" style={{ aspectRatio: shared ? '16 / 9' : '32 / 9' }}>
      <div className="online-stage-cameras">
        {players.map((p, i) => <div key={p?.id || `waiting-${i}`} className="online-stage-camera">
          <video ref={(p?.id === guestId || (!p && i === 0)) ? localVideo : remoteVideo} autoPlay playsInline muted={p?.id === guestId} />
          <span>{p ? `P${i + 1} · ${p.name}${p.id === guestId ? ' (you)' : ''}${p.ready ? ' · Ready' : ''}` : 'Waiting for a friend…'}</span>
        </div>)}
      </div>
      <canvas ref={canvas} width={shared ? 960 : 1280} height={shared ? 540 : 360} />
    </div>
    <p className="online-fine">{shared ? 'Shared board: either player can cover any leak.' : `You are P${players.findIndex(p => p?.id === guestId) + 1}. Your entire camera controls your side.`} For a larger play area, use landscape or fullscreen.</p>
    <button onClick={() => { void canvas.current?.closest('section')?.requestFullscreen().catch(() => {}); }}>Fullscreen</button>
    <button onClick={() => { setMuted(!muted); mute(!muted); }}>{muted ? 'Enable game sounds' : 'Mute game sounds'}</button>
  </section>;
}
