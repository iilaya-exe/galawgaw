import { useEffect, useRef, useState } from 'react';
import { Client, type Room as GameRoom } from '@colyseus/sdk';
import { Room as VideoRoom, RoomEvent, Track } from 'livekit-client';
import { api, API, type Snapshot, type OnlineGameMeta } from './api';
import { openCamera, type LocalInput } from './camera';
import { GameStage } from './GameStage';
import { ONLINE_PROTOCOL } from '../game/onlineProtocol.js';
import { unlock } from '../game/audio.js';
import { ArcadeHeader, ArcadeFooter } from '../components/arcade/ArcadeShell';
import './online.css';
import { CommunityGate, PublishHighlight } from '../community/CommunityGate';

type Guest = { token: string; id: string; name: string };
function savedGuest(): Guest | null { try { return JSON.parse(sessionStorage.getItem('galawgaw.guest') || 'null'); } catch { return null; } }
function savedHighlight() { try { return sessionStorage.getItem('galawgaw.last-highlight'); } catch { return null; } }
function exitOnline() { history.replaceState(null, '', location.pathname); window.dispatchEvent(new HashChangeEvent('hashchange')); }

export function Online() {
  const clipId = new URLSearchParams(location.search).get('clip');
  if (clipId) return <div className="online"><ArcadeHeader online onHome={exitOnline} /><main className="online-content online-highlight-page"><p className="arcade-eyebrow">THE AFTERPARTY / MATCH HIGHLIGHT</p><Clip id={clipId} token={savedGuest()?.token} share={new URLSearchParams(location.search).get('share') || undefined} /><a href="./#online" className="online-link">Back to the arcade →</a></main><ArcadeFooter /></div>;
  return <OnlineGame />;
}
function OnlineGame() {
  const [guest, setGuest] = useState<Guest | null>(savedGuest);
  const [name, setName] = useState(guest?.name || '');
  const [code, setCode] = useState(new URLSearchParams(location.search).get('room') || '');
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [lowVideo, setLowVideo] = useState(true);
  const localInput = useRef<LocalInput | null>(null);
  const renderStats = useRef({ fps: 0 });
  const networkStats = useRef({ ping: null as number | null, gap: 0, tick: 0, receivedAt: 0, nonce: 0 });
  const [performanceInfo, setPerformanceInfo] = useState({ ping: null as number | null, gap: 0, tick: 0, fps: 0, tracking: 0, background: false });
  const [tracked, setTracked] = useState(false);
  const [consent, setConsent] = useState(false);
  const [mic, setMic] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [connection, setConnection] = useState('');
  const [features, setFeatures] = useState<{ publicPlay: boolean; gauntlet?: boolean; protocol?: number; games: OnlineGameMeta[] }>({ publicPlay: false, games: [] });
  const [gameId, setGameId] = useState(new URLSearchParams(location.search).get('mode') === 'gauntlet' ? 'gauntlet' : 'copypose');
  const selectedGame = gameId === 'gauntlet' ? { title: 'The Gauntlet', blurb: 'Random versus games. Three lives each. Stay together until one player takes the crown.' } : features.games.find(g => g.id === gameId);
  const compatible = features.protocol === ONLINE_PROTOCOL;
  const [mediaVersion, setMediaVersion] = useState(0);
  const [lastHighlight, setLastHighlight] = useState(savedHighlight);
  const [report, setReport] = useState(false);
  const [reason, setReason] = useState('');
  const room = useRef<GameRoom | null>(null);
  const media = useRef<VideoRoom | null>(null);
  const localVideo = useRef<HTMLVideoElement>(null);
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const audioHost = useRef<HTMLDivElement>(null);
  const camera = useRef<Awaited<ReturnType<typeof openCamera>> | null>(null);
  const cameraAbort = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const alive = useRef(true);
  const joining = useRef(false);
  const phase = useRef(snapshot?.phase);
  phase.current = snapshot?.phase;
  const me = snapshot?.players.find(p => p.id === guest?.id);
  const opponent = snapshot?.players.find(p => p.id !== guest?.id);
  const lastMatch = useRef<string | null>(null);
  const currentMatch = useRef(snapshot);
  currentMatch.current = snapshot;

  useEffect(() => { const changed = () => { if (!room.current) { const next = savedGuest(); setGuest(next); setName(next?.name || ''); } }; window.addEventListener('galawgaw-guest', changed); return () => window.removeEventListener('galawgaw-guest', changed); }, []);

  useEffect(() => { if (snapshot?.roomId) window.scrollTo(0, 0); }, [snapshot?.roomId]);

  // Each round can use a different model. Release the old model/track before
  // opening the next one; never run two trackers or encoders together.
  useEffect(() => {
    if (!snapshot) { lastMatch.current = null; return; }
    const previous = lastMatch.current; lastMatch.current = snapshot.matchId;
    if (!previous || previous === snapshot.matchId) return;
    const hadCamera = !!camera.current;
    cameraAbort.current?.abort(); camera.current?.close(); camera.current = null;
    const oldMedia = media.current; media.current = null;
    localInput.current = null; setTracked(false); setCameraReady(false); setMic(false); setConsent(false);
    setAudioEnabled(false); setCameraBusy(false);
    const matchId = snapshot.matchId;
    void Promise.resolve(oldMedia?.disconnect()).then(() => {
      if (hadCamera && alive.current && currentMatch.current?.matchId === matchId) void enableCamera();
    });
  }, [snapshot?.matchId]);

  const clean = () => {
    localInput.current = null;
    networkStats.current = { ping: null, gap: 0, tick: 0, receivedAt: 0, nonce: 0 };
    cameraAbort.current?.abort(); cameraAbort.current = null;
    camera.current?.close(); camera.current = null;
    void media.current?.disconnect(); media.current = null;
    if (audioHost.current) audioHost.current.replaceChildren();
    const old = room.current; room.current = null; void old?.leave();
  };
  useEffect(() => {
    alive.current = true;
    api<typeof features>('/config').then(data => {
      if (!alive.current) return;
      setFeatures({ ...data, games: data.games || [] });
      if (data.protocol !== ONLINE_PROTOCOL) setError('The game server needs the latest update before this version can play online.');
    }).catch(e => setError(e.message));
    return () => { alive.current = false; clean(); };
  }, []);
  useEffect(() => {
    const timer = setInterval(() => {
      if (!room.current) return;
      const network = networkStats.current;
      setPerformanceInfo({ ping: network.ping, gap: Math.max(network.gap, network.receivedAt ? Math.round(performance.now() - network.receivedAt) : 0), tick: network.tick,
        fps: renderStats.current.fps, tracking: camera.current?.stats.ms || 0, background: camera.current?.stats.worker || false });
      if (room.current.connection.isOpen && performance.now() - network.nonce >= 2000) {
        network.nonce = performance.now(); room.current.send('ping', network.nonce);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const remote = media.current?.remoteParticipants.values().next().value;
    const publication = remote?.getTrackPublication(Track.Source.Camera);
    const track = publication?.videoTrack;
    if (track && remoteVideo.current) { const el = remoteVideo.current; track.attach(el); return () => { track.detach(el); }; }
  }, [mediaVersion, opponent?.id]);
  useEffect(() => {
    if (snapshot?.phase === 'over' && snapshot.highlightsEnabled && snapshot.players.every(p => p.recordingConsent)) {
      setLastHighlight(snapshot.matchId);
      try { sessionStorage.setItem('galawgaw.last-highlight', snapshot.matchId); } catch { /* optional convenience */ }
    }
  }, [snapshot?.phase, snapshot?.matchId]);

  async function join(mode: 'private' | 'join' | 'public') {
    if (joining.current) return;
    unlock();
    joining.current = true; setBusy(true); setError('');
    try {
      let identity = guest;
      if (!identity) {
        identity = await api<Guest>('/guest', undefined, { name });
        setGuest(identity);
        try { sessionStorage.setItem('galawgaw.guest', JSON.stringify(identity)); } catch { /* tab still works */ }
      }
      const { reservation } = await api<{ reservation: Parameters<Client['consumeSeatReservation']>[0] }>('/rooms', identity.token, { mode, gameId, ...(mode === 'join' ? { code: code.trim().toUpperCase() } : {}) });
      const joined = await new Client(API).consumeSeatReservation(reservation);
      if (!alive.current) { await joined.leave(); return; }
      room.current = joined;
      joined.onMessage('pong', ({ nonce, tickLagMs }: { nonce: number; tickLagMs: number }) => {
        if (room.current !== joined || nonce !== networkStats.current.nonce) return;
        networkStats.current.ping = Math.round(performance.now() - nonce);
        networkStats.current.tick = tickLagMs;
      });
      joined.onMessage('snapshot', (state: Snapshot) => {
        if (state.protocol !== ONLINE_PROTOCOL) { leave(); setError('The room uses a different game version. Refresh and try again.'); return; }
        if (room.current === joined) {
          const now = performance.now(), stats = networkStats.current;
          stats.gap = stats.receivedAt ? Math.round(now - stats.receivedAt) : 0; stats.receivedAt = now;
          setSnapshot(state);
        }
      });
      joined.onMessage('notice', (message: string) => setError(message));
      joined.onLeave(() => { if (room.current === joined) { clean(); setSnapshot(null); setCameraReady(false); setConnection(''); setError('Disconnected from the room. Join again to play.'); } });
      joined.onError((_code, message) => setError(message || 'Connection problem.'));
      joined.onDrop(() => setConnection('Reconnecting to the match…'));
      joined.onReconnect(() => { setConnection('Connected'); joined.send('snapshot'); });
      joined.send('snapshot');
      setConnection('Connected');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not join.');
      if (e instanceof Error && /session expired/i.test(e.message)) { setGuest(null); sessionStorage.removeItem('galawgaw.guest'); }
    } finally { joining.current = false; setBusy(false); }
  }

  async function enableCamera() {
    if (!localVideo.current || !guest || !snapshot || cameraBusy) return;
    setCameraBusy(true); setError('');
    const abort = new AbortController(); cameraAbort.current = abort;
    const activeRoom = room.current;
    try {
      const device = await openCamera(localVideo.current, abort.signal, (points, aspect, hands) => {
        localInput.current = { points, hands, aspect, at: performance.now() };
        setTracked(snapshot.game.mode === 'hand' ? hands.length > 0 : !!points && [11, 12, 15, 16, 23, 24].every(i => points[i].visibility >= .35));
        if (room.current === activeRoom && activeRoom?.connection.isOpen) activeRoom.send('input', { landmarks: points, hands, aspect, sequence: sequence.current++ });
      }, snapshot.game.mode, snapshot.game.hands, lowVideo);
      camera.current = device;
      if (snapshot.mediaEnabled) {
        const credentials = await api<{ url: string; token: string }>(`/rooms/${snapshot.roomId}/media`, guest.token, {});
        if (abort.signal.aborted) { device.close(); return; }
        const videoRoom = new VideoRoom({ adaptiveStream: true, dynacast: true,
          publishDefaults: { simulcast: false, videoEncoding: { maxBitrate: lowVideo ? 450_000 : 900_000, maxFramerate: lowVideo ? 24 : 30 } },
        }); media.current = videoRoom;
        videoRoom.on(RoomEvent.TrackSubscribed, track => {
          setMediaVersion(v => v + 1);
          if (track.kind === Track.Kind.Audio && audioHost.current) { const el = track.attach(); audioHost.current.append(el); }
        });
        videoRoom.on(RoomEvent.TrackUnsubscribed, track => { track.detach().forEach(el => { if (el.tagName === 'AUDIO') el.remove(); }); setMediaVersion(v => v + 1); });
        videoRoom.on(RoomEvent.Reconnecting, () => setConnection('Reconnecting cameras…'));
        videoRoom.on(RoomEvent.Reconnected, () => setConnection('Connected'));
        videoRoom.on(RoomEvent.Disconnected, () => { if (!abort.signal.aborted && phase.current !== 'over' && phase.current !== 'aborted') setError('Live video disconnected. Leave and rejoin to restore cameras.'); });
        await videoRoom.connect(credentials.url, credentials.token);
        if (abort.signal.aborted) { await videoRoom.disconnect(); return; }
        await videoRoom.localParticipant.publishTrack(device.stream.getVideoTracks()[0], { source: Track.Source.Camera });
        await videoRoom.startAudio().then(() => setAudioEnabled(true)).catch(() => {});
      }
      if (!abort.signal.aborted) setCameraReady(true);
    } catch (e) {
      if (!abort.signal.aborted) {
        abort.abort(); void media.current?.disconnect(); media.current = null;
        setError(e instanceof Error ? e.message : 'Could not start the camera.');
      }
    } finally { if (alive.current) setCameraBusy(false); }
  }
  async function toggleMic() {
    try { await media.current?.localParticipant.setMicrophoneEnabled(!mic); setMic(!mic); }
    catch { setError('Microphone permission was denied. You can still play.'); }
  }
  function leave() {
    clean(); setSnapshot(null); setCameraReady(false); setCameraBusy(false); setMic(false); setTracked(false); setConsent(false); setReport(false); setConnection('');
  }
  async function copyInvite() {
    try { await navigator.clipboard.writeText(`${location.origin}${location.pathname}?room=${snapshot!.roomId}#online`); setConnection('Invite link copied'); }
    catch { setConnection(`Share this room code: ${snapshot!.roomId}`); }
  }

  return <div className="online">
    <ArcadeHeader online onHome={() => { leave(); exitOnline(); }} action={snapshot ? <button onClick={leave}>Leave room</button> : undefined} />
    <main className="online-content">
    {error && <div role="alert" className="online-error">{error}<button aria-label="Dismiss message" onClick={() => setError('')}>×</button></div>}
    {!snapshot ? <section className="online-entry">
      <div className="online-entry-heading"><p className="arcade-eyebrow">THE SAME ARCADE / A DIFFERENT ROOM</p><h1>Far apart.<br /><em>Equally ridiculous.</em></h1><p>Pick a game, call a friend, and let your hands do the talking.</p></div>
      <div className="online-entry-grid">
        <fieldset className="online-game-picker" disabled={busy || !compatible}>
          <legend><span>01</span> Pick your game</legend>
          <p className="online-fine">Go head to head, or make a great mess together.</p>
          {features.gauntlet && <label className="online-game-option online-gauntlet-option"><input type="radio" name="online-game" value="gauntlet" checked={gameId === 'gauntlet'} onChange={() => setGameId('gauntlet')} /><span className="online-option-copy"><small>THE MAIN EVENT · 3 LIVES EACH</small><strong>⚔ The Gauntlet</strong><small>Random games. One champion.</small></span><span className="online-option-check">{gameId === 'gauntlet' ? '✓' : '↗'}</span></label>}
          {features.games.length ? <div className="online-game-options">{features.games.map((g, i) => <label key={g.id} className="online-game-option">
            <input type="radio" name="online-game" value={g.id} checked={gameId === g.id} onChange={() => setGameId(g.id)} />
            <span className="online-option-number">{String(i + 1).padStart(2, '0')}</span><span className="online-option-copy"><strong><span aria-hidden="true">{g.icon}</span> {g.title}</strong><small>{g.coop ? 'Co-op' : 'Versus'} · {g.mode === 'hand' ? 'Hands' : 'Full body'}</small></span><span className="online-option-check" aria-hidden="true">{gameId === g.id ? '✓' : '↗'}</span>
          </label>)}</div> : <p className="online-config-state" role="status">{error ? 'Games will appear when the server is connected.' : 'Getting the arcade ready…'}</p>}
        </fieldset>
        <div className="online-room-setup" aria-labelledby="room-setup-title">
          <h2 id="room-setup-title"><span>02</span> Get together</h2>
          <div className="online-selected-game"><span className="arcade-eyebrow">YOUR PICK</span><strong>{selectedGame ? selectedGame.title : error ? 'Connection unavailable' : 'Loading games…'}</strong><p>{selectedGame?.blurb || 'Choose a game, or join a friend with their room code.'}</p></div>
          <label>Your name<input autoComplete="nickname" maxLength={24} value={name} disabled={!!guest} onChange={e => setName(e.target.value)} placeholder="What should we call you?" /></label>
          {guest && <button className="online-link" onClick={() => { setGuest(null); sessionStorage.removeItem('galawgaw.guest'); }}>Change name</button>}
          <button className="online-primary" disabled={busy || !name.trim() || !compatible} onClick={() => void join('private')}>{busy ? 'Connecting…' : 'Create a private room →'}</button>
          <p className="online-fine">You’ll get an invite link. Camera setup comes next.</p>
          <div className="online-join-section"><label htmlFor="room-code">Got an invite? Join your friend.</label><div className="online-join"><input id="room-code" autoCapitalize="characters" spellCheck={false} maxLength={12} value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="12-character room code" /><button disabled={busy || code.trim().length !== 12 || !name.trim() || !compatible} onClick={() => void join('join')}>Join</button></div><p className="online-fine">A room code uses your host’s chosen game.</p></div>
          {features.publicPlay && <button disabled={busy || !name.trim() || !compatible} onClick={() => void join('public')}>Find a player for {selectedGame?.title}</button>}
          {lastHighlight && <a className="online-link" href={`?clip=${lastHighlight}#online`}>Watch your last highlight ↗</a>}
          <p className="online-fine">Online play shares movement data. If enabled, live video is shared with your partner. A highlight is recorded only when both players opt in.</p>
        </div>
      </div>
      <CommunityGate />
    </section> : <>
      <section className="online-room-head"><div><p className="online-eyebrow">{snapshot.public ? 'PUBLIC ROOM' : `PRIVATE ROOM · ${snapshot.roomId}`} · {snapshot.game.coop ? 'CO-OP' : 'VERSUS'}</p><h1>{snapshot.phase === 'over' ? (snapshot.game.coop ? snapshot.result?.title : snapshot.winner === null ? 'A draw!' : `${snapshot.players[snapshot.winner].name} wins!`) : snapshot.phase === 'paused' ? 'Waiting for your friend to reconnect…' : snapshot.phase === 'aborted' ? 'The match ended early.' : snapshot.game.title}</h1></div>
        <div className="online-status">{snapshot.recording && <span className="online-recording">● Recording</span>}<span>{connection}</span>{!snapshot.public && <button onClick={() => void copyInvite()}>Copy invite</button>}</div>
      </section>
      {snapshot.series && <section className="online-series" aria-label="Gauntlet standings"><div><p className="arcade-eyebrow">THE GAUNTLET / ROUND {snapshot.series.round}</p><h2>{snapshot.series.over ? `${snapshot.players[snapshot.series.lives[0] === 0 ? 1 : 0]?.name || 'Your friend'} takes the crown!` : 'Three lives. Make them count.'}</h2></div><div className="online-series-lives">{snapshot.players.map((p, i) => <span key={p.id}>{p.name}<strong aria-label={`${snapshot.series!.lives[i]} lives`}>{'●'.repeat(snapshot.series!.lives[i])}{'○'.repeat(3 - snapshot.series!.lives[i])}</strong></span>)}</div></section>}
      <GameStage snapshot={snapshot} guestId={guest?.id} localVideo={localVideo} remoteVideo={remoteVideo} localInput={localInput} renderStats={renderStats} />
      <section className="online-controls">
        {snapshot.phase === 'lobby' && <>
          <div className="online-setup-heading"><p className="arcade-eyebrow">BEFORE THE SHOW</p><h2>Get everyone in frame.</h2></div>
          <ol className="online-setup-steps" aria-label="Room setup progress"><li data-complete={cameraReady && tracked}><span>{cameraReady && tracked ? '✓' : '1'}</span>Camera ready</li><li data-complete={!!opponent}><span>{opponent ? '✓' : '2'}</span>Partner joined</li><li data-complete={!!me?.ready}><span>{me?.ready ? '✓' : '3'}</span>Ready to play</li></ol>
          <p>{!opponent ? snapshot.public ? 'Waiting for someone who picked this game…' : 'Share your room code and wait for a friend.' : snapshot.game.mode === 'hand' ? 'Raise your hands so the camera can see them.' : 'Step back until your upper body and hands fit in the camera.'}</p>
          <ol className="online-instructions">{snapshot.game.tutorial.map(t => <li key={t}>{t}</li>)}</ol>
          {!cameraReady && <label>Camera quality<select value={lowVideo ? 'light' : 'standard'} disabled={cameraBusy} onChange={e => setLowVideo(e.target.value === 'light')}><option value="light">Lighter video (recommended)</option><option value="standard">Sharper video</option></select></label>}
          {!cameraReady && <button className="online-primary" disabled={cameraBusy} onClick={() => void enableCamera()}>{cameraBusy ? 'Starting camera and tracking…' : snapshot.mediaEnabled ? 'Enable & share my camera' : 'Enable my camera'}</button>}
          {cameraReady && <p>{tracked ? '✓ Movement tracked. You’re ready.' : snapshot.game.mode === 'hand' ? 'Show your hands to the camera.' : 'Step into frame with your hands and hips visible.'}</p>}
          {snapshot.highlightsEnabled && <label className="online-consent"><input type="checkbox" checked={consent} disabled={me?.ready} onChange={e => setConsent(e.target.checked)} />Allow recording of my camera and enabled microphone for a highlight that either player can share. Highlight access expires after 30 days. See the <a href="./privacy/#retention" target="_blank" rel="noopener noreferrer">Privacy Policy</a> for storage and deletion.</label>}
          {!snapshot.mediaEnabled && <p className="online-fine">Live cameras are not connected on this server. You’ll see your friend’s tracked movements instead.</p>}
          {cameraReady && <><button className="online-primary" onClick={() => room.current?.send('ready', { ready: !me?.ready, recordingConsent: consent })}>{me?.ready ? 'Cancel ready' : 'Get ready — then step into position'}</button><p role="status">{me?.ready ? 'You can step away from the controls now. Hold your position; when both players are in frame, the 3-second countdown starts.' : 'Choose your recording preference, then get ready. No need to hold a pose while pressing a button.'}</p><div className="online-position-status">{snapshot.players.map((p, i) => <span key={p.id} data-ready={p.ready && snapshot.positioned?.[i]}>{p.name}: {!p.ready ? 'not ready yet' : snapshot.positioned?.[i] ? 'in position ✓' : snapshot.game.mode === 'hand' ? `show ${snapshot.game.hands === 2 ? 'both hands' : 'one hand'} in frame` : 'show shoulders, hips and hands'}</span>)}</div></>}
        </>}
        {snapshot.phase === 'preparing' && <p>Preparing the match{consent ? ' and recordings' : ''}…</p>}
        {snapshot.phase === 'countdown' && <button onClick={() => room.current?.send('ready', { ready: false, recordingConsent: consent })}>Cancel countdown</button>}
        {snapshot.phase === 'playing' && <p>{snapshot.game.blurb}</p>}
        {cameraReady && snapshot.mediaEnabled && <div className="online-media-buttons"><button onClick={() => void toggleMic()}>{mic ? 'Mute microphone' : 'Enable microphone'}</button>{!audioEnabled && <button onClick={() => void media.current?.startAudio().then(() => setAudioEnabled(true))}>Enable sound</button>}</div>}
        {snapshot.phase === 'over' && <section className="online-lounge"><p className="arcade-eyebrow">THE AFTERPARTY / STILL IN THE SAME ROOM</p><h2>Catch your breath. Go again?</h2><p>Your cameras stay connected here. Take your time — the next round waits for both of you.</p><ul className="online-results">{snapshot.result?.rows.map((row, i) => <li key={i}><strong>{snapshot.game.coop ? row.tag : snapshot.players[i]?.name}: {row.value}</strong><span>{row.text}</span></li>)}</ul>{snapshot.series && <ol className="online-series-history">{snapshot.series.history.map((r, i) => <li key={i}>Round {i + 1} · {r.game} · {snapshot.players[r.winner]?.name} wins{r.reason !== 'score' ? ` (${r.reason})` : ''}</li>)}</ol>}{(!snapshot.series || snapshot.series.over) && <label>Next up{snapshot.players[0]?.id === guest?.id ? <select value={snapshot.nextChoice} disabled={snapshot.saving} onChange={e => room.current?.send('next-choice', e.target.value)}><option value="gauntlet">The Gauntlet · 3 lives</option>{features.games.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}</select> : <span>{snapshot.nextChoice === 'gauntlet' ? 'The Gauntlet' : features.games.find(g => g.id === snapshot.nextChoice)?.title} · Your host picks the game.</span>}</label>}<button className="online-primary" disabled={snapshot.saving || !opponent?.connected || snapshot.nextVotes?.includes(guest!.id)} onClick={() => room.current?.send('next')}>{snapshot.saving ? 'Finishing this round…' : snapshot.nextVotes?.includes(guest!.id) ? 'Waiting for your friend…' : snapshot.series && !snapshot.series.over ? 'Continue the Gauntlet →' : 'Back to the lobby together →'}</button>{!opponent?.connected && <p>Your friend has left. Leave this room to find a new partner.</p>}{snapshot.highlightsEnabled && me?.recordingConsent && opponent?.recordingConsent && <Clip key={snapshot.matchId} id={snapshot.matchId} token={guest!.token} />}<button className="online-link" onClick={leave}>Leave room</button></section>}
        {snapshot.phase === 'aborted' && <p>A player left or the connection timed out. No highlight will be created. Leave this room to play again.</p>}
        {snapshot.public && opponent && <button className="online-link" onClick={() => setReport(!report)}>Report & block player</button>}
        {report && <form onSubmit={e => { e.preventDefault(); void api(`/rooms/${snapshot.roomId}/report`, guest!.token, { reason }).then(() => { leave(); setError('Report saved. This guest player is blocked from your future matches.'); }).catch(e => setError(e.message)); }}><label>What happened?<textarea minLength={3} maxLength={500} required value={reason} onChange={e => setReason(e.target.value)} /></label><button type="submit">Send report and leave</button></form>}
      </section>
      <div ref={audioHost} />
      <details className="online-performance"><summary>Connection &amp; performance</summary><p>{performanceInfo.fps} FPS · Tracking: {performanceInfo.tracking} ms ({performanceInfo.background ? 'background' : 'compatibility mode'})<br />Server round trip: {performanceInfo.ping === null ? 'Measuring…' : `${performanceInfo.ping} ms`} · Server delay: {performanceInfo.tick} ms · Update gap: {performanceInfo.gap} ms</p><p>High tracking time points to the device; a high round trip points to the connection or server location. Lobby updates arrive less often to save resources.</p></details>
    </>}
    </main><ArcadeFooter />
  </div>;
}

function Clip({ id, token, share }: { id: string; token?: string; share?: string }) {
  const [clip, setClip] = useState<{ status: string; url?: string; message?: string }>({ status: 'queued' });
  const [message, setMessage] = useState('');
  const [retryKey, setRetryKey] = useState(0);
  useEffect(() => {
    let cancelled = false; let timer: ReturnType<typeof setTimeout>; const started = Date.now();
    const poll = async () => {
      try {
        const data = await api<typeof clip>(`/clips/${encodeURIComponent(id)}${share ? `?share=${encodeURIComponent(share)}` : ''}`, token);
        if (cancelled) return;
        setClip(data);
        if (['ready', 'failed', 'no-recording'].includes(data.status)) return;
      } catch (e) { if (cancelled) return; if (Date.now() - started > 15_000) { setMessage(e instanceof Error ? e.message : 'Could not load highlight.'); return; } }
      if (Date.now() - started < 5 * 60_000) timer = setTimeout(poll, 3000);
      else setMessage('Still processing. Keep this page URL and check back later.');
    };
    void poll(); return () => { cancelled = true; clearTimeout(timer); };
  }, [id, token, share, retryKey]);
  async function shareClip() {
    try {
      const data = await api<{ share: string }>(`/clips/${id}/share`, token, {});
      const url = `${location.origin}${location.pathname}?clip=${id}&share=${data.share}#online`;
      if (navigator.share) await navigator.share({ title: 'Our Galawgaw highlight', url });
      else { await navigator.clipboard.writeText(url); setMessage('Share link copied.'); }
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Could not share.'); }
  }
  async function retryClip() {
    try {
      await api(`/clips/${id}/retry`, token, {});
      setClip({ status: 'queued' }); setMessage('Retry started. This can take a few minutes.'); setRetryKey(key => key + 1);
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Could not retry the highlight.'); }
  }
  return <section className="online-clip"><p className="arcade-eyebrow">WORTH A REPLAY</p><h2>Your match. The good bits.</h2>
    {clip.url && token && !share && <PublishHighlight matchId={id} url={clip.url}/>}
    {clip.url ? <><video data-social-video controls playsInline src={clip.url} /><div className="online-media-buttons"><a href={clip.url} target="_blank" rel="noreferrer">Open / save MP4</a>{token && !share && <><button onClick={() => void shareClip()}>Share highlight</button><button onClick={() => void api(`/clips/${id}/share`, token, undefined, 'DELETE').then(() => setMessage('Share link disabled.')).catch(e => setMessage(e.message))}>Disable share link</button></>}</div></> : <p>{clip.status === 'failed' ? clip.message || 'The highlight could not be rendered.' : clip.status === 'no-recording' ? 'This match was not recorded.' : 'Making your highlight… You can keep playing.'}</p>}
    {clip.status === 'failed' && token && !share && <button onClick={() => void retryClip()}>Retry highlight</button>}
    {message && <p role="status">{message}</p>}
  </section>;
}
