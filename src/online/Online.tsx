import { useEffect, useRef, useState } from 'react';
import { Client, type Room as GameRoom } from '@colyseus/sdk';
import { Room as VideoRoom, RoomEvent, Track } from 'livekit-client';
import { api, API, type Snapshot, type OnlineGameMeta } from './api';
import { openCamera, type LocalInput } from './camera';
import { GameStage } from './GameStage';
import { ONLINE_PROTOCOL } from '../game/onlineProtocol.js';
import { unlock } from '../game/audio.js';
import { SiteLinks } from '../components/SiteLinks';
import './online.css';

type Guest = { token: string; id: string; name: string };
function savedGuest(): Guest | null { try { return JSON.parse(sessionStorage.getItem('galawgaw.guest') || 'null'); } catch { return null; } }
function savedHighlight() { try { return sessionStorage.getItem('galawgaw.last-highlight'); } catch { return null; } }
function exitOnline() { history.replaceState(null, '', location.pathname); window.dispatchEvent(new HashChangeEvent('hashchange')); }

export function Online() {
  const clipId = new URLSearchParams(location.search).get('clip');
  if (clipId) return <main className="online"><header><a href="./">GALAWGAW</a></header><Clip id={clipId} token={savedGuest()?.token} share={new URLSearchParams(location.search).get('share') || undefined} /><footer className="mt-12 border-t border-white/10 py-8"><SiteLinks /></footer></main>;
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
  const [features, setFeatures] = useState<{ publicPlay: boolean; protocol?: number; games: OnlineGameMeta[] }>({ publicPlay: false, games: [] });
  const [gameId, setGameId] = useState('copypose');
  const selectedGame = features.games.find(g => g.id === gameId);
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

  useEffect(() => { if (snapshot?.roomId) window.scrollTo(0, 0); }, [snapshot?.roomId]);

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

  return <main className="online">
    <header><button className="online-brand" onClick={() => { leave(); exitOnline(); }}>GALAWGAW</button><span>ONLINE / {snapshot?.game.title.toUpperCase() || 'ALL GAMES'}</span>{snapshot && <button onClick={leave}>Leave room</button>}</header>
    {error && <div role="alert" className="online-error">{error}<button aria-label="Dismiss message" onClick={() => setError('')}>×</button></div>}
    {!snapshot ? <section className="online-entry">
      <p className="online-eyebrow">Different rooms. Same ridiculous moves.</p><h1>Bring a friend.<br /><em>Pick your game.</em></h1>
      <p>Compete or team up across the whole arcade. Pick a game, then invite a friend or find a player.</p>
      <label>Choose a game<select value={gameId} onChange={e => setGameId(e.target.value)} disabled={busy || !compatible}>
        {features.games.map(g => <option key={g.id} value={g.id}>{g.icon} {g.title} · {g.coop ? 'Co-op' : 'Versus'}</option>)}
      </select></label>
      {selectedGame && <p>{selectedGame.blurb} <span className="online-fine">{selectedGame.mode === 'hand' ? 'Hand tracking' : 'Body tracking'}</span></p>}
      <label>Your name<input maxLength={24} value={name} disabled={!!guest} onChange={e => setName(e.target.value)} placeholder="What should we call you?" /></label>
      {guest && <button className="online-link" onClick={() => { setGuest(null); sessionStorage.removeItem('galawgaw.guest'); }}>Change name</button>}
      <button className="online-primary" disabled={busy || !name.trim() || !compatible} onClick={() => void join('private')}>{busy ? 'Connecting…' : 'Create a private room'}</button>
      <div className="online-join"><input aria-label="Room code" maxLength={12} value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="12-character room code" /><button disabled={busy || code.trim().length !== 12 || !name.trim() || !compatible} onClick={() => void join('join')}>Join friend</button></div>
      {code && <p className="online-fine">Joining a code uses the host’s chosen game.</p>}
      {features.publicPlay && <button disabled={busy || !name.trim() || !compatible} onClick={() => void join('public')}>Find a player for {selectedGame?.title}</button>}
      {lastHighlight && <a href={`?clip=${lastHighlight}#online`}>Open your last highlight</a>}
      <p className="online-fine">Online movement data is sent to the game server. When live cameras are enabled, your video is shared with the other player. Recording starts only if both players opt in.</p>
      <button className="online-link" onClick={exitOnline}>Back to same-screen games</button>
    </section> : <>
      <section className="online-room-head"><div><p className="online-eyebrow">{snapshot.public ? 'PUBLIC ROOM' : `PRIVATE ROOM · ${snapshot.roomId}`} · {snapshot.game.coop ? 'CO-OP' : 'VERSUS'}</p><h1>{snapshot.phase === 'over' ? (snapshot.game.coop ? snapshot.result?.title : snapshot.winner === null ? 'A draw!' : `${snapshot.players[snapshot.winner].name} wins!`) : snapshot.phase === 'paused' ? 'Waiting for your friend to reconnect…' : snapshot.phase === 'aborted' ? 'The match ended early.' : snapshot.game.title}</h1></div>
        <div className="online-status">{snapshot.recording && <span className="online-recording">● Recording</span>}<span>{connection}</span>{!snapshot.public && <button onClick={() => void copyInvite()}>Copy invite</button>}</div>
      </section>
      <GameStage snapshot={snapshot} guestId={guest?.id} localVideo={localVideo} remoteVideo={remoteVideo} localInput={localInput} renderStats={renderStats} />
      <section className="online-controls">
        {snapshot.phase === 'lobby' && <>
          <p>{!opponent ? snapshot.public ? 'Waiting for someone who picked this game…' : 'Share your room code and wait for a friend.' : snapshot.game.mode === 'hand' ? 'Raise your hands so the camera can see them.' : 'Step back until your upper body and hands fit in the camera.'}</p>
          <ol className="online-instructions">{snapshot.game.tutorial.map(t => <li key={t}>{t}</li>)}</ol>
          {!cameraReady && <label>Camera quality<select value={lowVideo ? 'light' : 'standard'} disabled={cameraBusy} onChange={e => setLowVideo(e.target.value === 'light')}><option value="light">Lighter video (recommended)</option><option value="standard">Sharper video</option></select></label>}
          {!cameraReady && <button className="online-primary" disabled={cameraBusy} onClick={() => void enableCamera()}>{cameraBusy ? 'Starting camera and tracking…' : snapshot.mediaEnabled ? 'Enable & share my camera' : 'Enable my camera'}</button>}
          {cameraReady && <p>{tracked ? '✓ Movement tracked. You’re ready.' : snapshot.game.mode === 'hand' ? 'Show your hands to the camera.' : 'Step into frame with your hands and hips visible.'}</p>}
          {snapshot.highlightsEnabled && <label className="online-consent"><input type="checkbox" checked={consent} disabled={me?.ready} onChange={e => setConsent(e.target.checked)} />Allow recording of my camera and enabled microphone for a highlight that either player can share. Highlight access expires after 30 days. See the <a href="./privacy/#retention" target="_blank" rel="noopener noreferrer">Privacy Policy</a> for storage and deletion.</label>}
          {!snapshot.mediaEnabled && <p className="online-fine">Live cameras are not connected on this server. You’ll see your friend’s tracked movements instead.</p>}
          {cameraReady && <button className="online-primary" disabled={!tracked || !opponent} onClick={() => room.current?.send('ready', { ready: !me?.ready, recordingConsent: consent })}>{me?.ready ? 'Ready — click to cancel' : 'I’m ready'}</button>}
        </>}
        {snapshot.phase === 'preparing' && <p>Preparing the match{consent ? ' and recordings' : ''}…</p>}
        {snapshot.phase === 'countdown' && <strong className="online-countdown">{Math.max(1, Math.ceil((snapshot.startedAt - snapshot.serverNow) / 1000))}</strong>}
        {snapshot.phase === 'playing' && <p>{snapshot.game.blurb}</p>}
        {cameraReady && snapshot.mediaEnabled && <div className="online-media-buttons"><button onClick={() => void toggleMic()}>{mic ? 'Mute microphone' : 'Enable microphone'}</button>{!audioEnabled && <button onClick={() => void media.current?.startAudio().then(() => setAudioEnabled(true))}>Enable sound</button>}</div>}
        {snapshot.phase === 'over' && <><ul className="online-results">{snapshot.result?.rows.map((row, i) => <li key={i}><strong>{snapshot.game.coop ? row.tag : snapshot.players[i]?.name}: {row.value}</strong><span>{row.text}</span></li>)}</ul>{snapshot.highlightsEnabled && me?.recordingConsent && opponent?.recordingConsent && <Clip id={snapshot.matchId} token={guest!.token} />}<button onClick={leave}>Choose another game</button></>}
        {snapshot.phase === 'aborted' && <p>A player left or the connection timed out. No highlight will be created. Leave this room to play again.</p>}
        {snapshot.public && opponent && <button className="online-link" onClick={() => setReport(!report)}>Report & block player</button>}
        {report && <form onSubmit={e => { e.preventDefault(); void api(`/rooms/${snapshot.roomId}/report`, guest!.token, { reason }).then(() => { leave(); setError('Report saved. This guest player is blocked from your future matches.'); }).catch(e => setError(e.message)); }}><label>What happened?<textarea minLength={3} maxLength={500} required value={reason} onChange={e => setReason(e.target.value)} /></label><button type="submit">Send report and leave</button></form>}
      </section>
      <div ref={audioHost} />
      <details className="online-performance"><summary>Connection &amp; performance</summary><p>{performanceInfo.fps} FPS · Tracking: {performanceInfo.tracking} ms ({performanceInfo.background ? 'background' : 'compatibility mode'})<br />Server round trip: {performanceInfo.ping === null ? 'Measuring…' : `${performanceInfo.ping} ms`} · Server delay: {performanceInfo.tick} ms · Update gap: {performanceInfo.gap} ms</p><p>High tracking time points to the device; a high round trip points to the connection or server location. Lobby updates arrive less often to save resources.</p></details>
    </>}
    <footer className="mt-12 border-t border-white/10 py-8"><SiteLinks /></footer>
  </main>;
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
  return <section className="online-clip"><h2>Your match, the short version.</h2>
    {clip.url ? <><video controls playsInline src={clip.url} /><div className="online-media-buttons"><a href={clip.url} target="_blank" rel="noreferrer">Open / save MP4</a>{token && !share && <><button onClick={() => void shareClip()}>Share highlight</button><button onClick={() => void api(`/clips/${id}/share`, token, undefined, 'DELETE').then(() => setMessage('Share link disabled.')).catch(e => setMessage(e.message))}>Disable share link</button></>}</div></> : <p>{clip.status === 'failed' ? clip.message || 'The highlight could not be rendered.' : clip.status === 'no-recording' ? 'This match was not recorded.' : 'Making your highlight… You can keep playing.'}</p>}
    {clip.status === 'failed' && token && !share && <button onClick={() => void retryClip()}>Retry highlight</button>}
    {message && <p role="status">{message}</p>}
  </section>;
}
