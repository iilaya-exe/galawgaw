import { useEffect, useRef, useState } from 'react';
import { Client, type Room as GameRoom } from '@colyseus/sdk';
import { Room as VideoRoom, RoomEvent, Track } from 'livekit-client';
import { api, API, type Snapshot, type OnlinePlayer, type Point } from './api';
import { openCamera } from './camera';
import './online.css';

type Guest = { token: string; id: string; name: string };
function savedGuest(): Guest | null { try { return JSON.parse(sessionStorage.getItem('galawgaw.guest') || 'null'); } catch { return null; } }
function savedHighlight() { try { return sessionStorage.getItem('galawgaw.last-highlight'); } catch { return null; } }
function exitOnline() { history.replaceState(null, '', location.pathname); window.dispatchEvent(new HashChangeEvent('hashchange')); }

export function Online() {
  const clipId = new URLSearchParams(location.search).get('clip');
  if (clipId) return <main className="online"><header><a href="/">GALAWGAW</a></header><Clip id={clipId} token={savedGuest()?.token} share={new URLSearchParams(location.search).get('share') || undefined} /></main>;
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
  const [tracked, setTracked] = useState(false);
  const [consent, setConsent] = useState(false);
  const [mic, setMic] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [connection, setConnection] = useState('');
  const [features, setFeatures] = useState({ publicPlay: false });
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

  const clean = () => {
    cameraAbort.current?.abort(); cameraAbort.current = null;
    camera.current?.close(); camera.current = null;
    void media.current?.disconnect(); media.current = null;
    if (audioHost.current) audioHost.current.replaceChildren();
    const old = room.current; room.current = null; void old?.leave();
  };
  useEffect(() => {
    alive.current = true;
    api<typeof features>('/config').then(setFeatures).catch(e => setError(e.message));
    return () => { alive.current = false; clean(); };
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
    joining.current = true; setBusy(true); setError('');
    try {
      let identity = guest;
      if (!identity) {
        identity = await api<Guest>('/guest', undefined, { name });
        setGuest(identity);
        try { sessionStorage.setItem('galawgaw.guest', JSON.stringify(identity)); } catch { /* tab still works */ }
      }
      const { reservation } = await api<{ reservation: Parameters<Client['consumeSeatReservation']>[0] }>('/rooms', identity.token, { mode, ...(mode === 'join' ? { code: code.trim().toUpperCase() } : {}) });
      const joined = await new Client(API).consumeSeatReservation(reservation);
      if (!alive.current) { await joined.leave(); return; }
      room.current = joined;
      joined.onMessage('snapshot', (state: Snapshot) => { if (room.current === joined) setSnapshot(state); });
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
      const device = await openCamera(localVideo.current, abort.signal, (points, aspect) => {
        setTracked(!!points && [11, 12, 15, 16, 23, 24].every(i => points[i].visibility >= .5));
        if (room.current === activeRoom && activeRoom?.connection.isOpen) activeRoom.send('input', { landmarks: points, aspect, sequence: sequence.current++ });
      });
      camera.current = device;
      if (snapshot.mediaEnabled) {
        const credentials = await api<{ url: string; token: string }>(`/rooms/${snapshot.roomId}/media`, guest.token, {});
        if (abort.signal.aborted) { device.close(); return; }
        const videoRoom = new VideoRoom({ adaptiveStream: true, dynacast: true }); media.current = videoRoom;
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
    <header><button className="online-brand" onClick={() => { leave(); exitOnline(); }}>GALAWGAW</button><span>ONLINE / COPY THE POSE</span>{snapshot && <button onClick={leave}>Leave room</button>}</header>
    {error && <div role="alert" className="online-error">{error}<button aria-label="Dismiss message" onClick={() => setError('')}>×</button></div>}
    {!snapshot ? <section className="online-entry">
      <p className="online-eyebrow">Different rooms. Same ridiculous moves.</p><h1>Bring a friend.<br /><em>Strike a pose.</em></h1>
      <p>Copy the targets, hold each pose, and outscore your friend in 40 seconds.</p>
      <label>Your name<input maxLength={24} value={name} disabled={!!guest} onChange={e => setName(e.target.value)} placeholder="What should we call you?" /></label>
      {guest && <button className="online-link" onClick={() => { setGuest(null); sessionStorage.removeItem('galawgaw.guest'); }}>Change name</button>}
      <button className="online-primary" disabled={busy || !name.trim()} onClick={() => void join('private')}>{busy ? 'Connecting…' : 'Create a private room'}</button>
      <div className="online-join"><input aria-label="Room code" maxLength={12} value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="12-character room code" /><button disabled={busy || code.trim().length !== 12 || !name.trim()} onClick={() => void join('join')}>Join friend</button></div>
      {features.publicPlay && <button disabled={busy || !name.trim()} onClick={() => void join('public')}>Find a player</button>}
      {lastHighlight && <a href={`?clip=${lastHighlight}#online`}>Open your last highlight</a>}
      <p className="online-fine">Online movement data is sent to the game server. When live cameras are enabled, your video is shared with the other player. Recording starts only if both players opt in.</p>
      <button className="online-link" onClick={exitOnline}>Back to same-screen games</button>
    </section> : <>
      <section className="online-room-head"><div><p className="online-eyebrow">{snapshot.public ? 'PUBLIC ROOM' : `PRIVATE ROOM · ${snapshot.roomId}`}</p><h1>{snapshot.phase === 'over' ? (snapshot.winner === null ? 'A very stylish draw.' : `${snapshot.players[snapshot.winner].name} wins!`) : snapshot.phase === 'paused' ? 'Waiting for your friend to reconnect…' : snapshot.phase === 'aborted' ? 'The match ended early.' : 'Copy the pose.'}</h1></div>
        <div className="online-status">{snapshot.recording && <span className="online-recording">● Recording</span>}<span>{connection}</span>{!snapshot.public && <button onClick={() => void copyInvite()}>Copy invite</button>}</div>
      </section>
      <div className="online-players">
        <PlayerTile player={me} local videoRef={localVideo} points={me?.landmarks} />
        <PlayerTile player={opponent} videoRef={remoteVideo} points={opponent?.landmarks} />
      </div>
      <section className="online-controls">
        {snapshot.phase === 'lobby' && <>
          <p>{!opponent ? 'Share your room code and wait for a friend.' : 'Both players: step back until your upper body and hands fit in the camera.'}</p>
          {!cameraReady && <button className="online-primary" disabled={cameraBusy} onClick={() => void enableCamera()}>{cameraBusy ? 'Starting camera and tracking…' : snapshot.mediaEnabled ? 'Enable & share my camera' : 'Enable my camera'}</button>}
          {cameraReady && <p>{tracked ? '✓ Body tracked. You’re ready.' : 'Step into frame with your hands and hips visible.'}</p>}
          {snapshot.highlightsEnabled && <label className="online-consent"><input type="checkbox" checked={consent} disabled={me?.ready} onChange={e => setConsent(e.target.checked)} />Allow recording of my camera and enabled microphone for a highlight that either player can share. Raw footage expires after 24 hours; highlights after 30 days.</label>}
          {!snapshot.mediaEnabled && <p className="online-fine">Live cameras are not connected on this server. You’ll see your friend’s tracked movements instead.</p>}
          {cameraReady && <button className="online-primary" disabled={!tracked || !opponent} onClick={() => room.current?.send('ready', { ready: !me?.ready, recordingConsent: consent })}>{me?.ready ? 'Ready — click to cancel' : 'I’m ready'}</button>}
        </>}
        {snapshot.phase === 'preparing' && <p>Preparing the match{consent ? ' and recordings' : ''}…</p>}
        {snapshot.phase === 'countdown' && <strong className="online-countdown">{Math.max(1, Math.ceil((snapshot.startedAt - snapshot.serverNow) / 1000))}</strong>}
        {snapshot.phase === 'playing' && <><strong className="online-timer">{Math.ceil(snapshot.remaining / 1000)}s</strong><p>Hold each pose until the meter fills.</p></>}
        {cameraReady && snapshot.mediaEnabled && <div className="online-media-buttons"><button onClick={() => void toggleMic()}>{mic ? 'Mute microphone' : 'Enable microphone'}</button>{!audioEnabled && <button onClick={() => void media.current?.startAudio().then(() => setAudioEnabled(true))}>Enable sound</button>}</div>}
        {snapshot.phase === 'over' && <><p>{me?.score ?? 0} poses matched · {me?.misses ?? 0} missed</p>{snapshot.highlightsEnabled && me?.recordingConsent && opponent?.recordingConsent && <Clip id={snapshot.matchId} token={guest!.token} />}<button onClick={leave}>Play another match</button></>}
        {snapshot.phase === 'aborted' && <p>A player left or the connection timed out. No highlight will be created. Leave this room to play again.</p>}
        {snapshot.public && opponent && <button className="online-link" onClick={() => setReport(!report)}>Report & block player</button>}
        {report && <form onSubmit={e => { e.preventDefault(); void api(`/rooms/${snapshot.roomId}/report`, guest!.token, { reason }).then(() => { leave(); setError('Report saved. This guest player is blocked from your future matches.'); }).catch(e => setError(e.message)); }}><label>What happened?<textarea minLength={3} maxLength={500} required value={reason} onChange={e => setReason(e.target.value)} /></label><button type="submit">Send report and leave</button></form>}
      </section>
      <div ref={audioHost} />
    </>}
  </main>;
}

function PlayerTile({ player, local, videoRef, points }: { player?: OnlinePlayer; local?: boolean; videoRef: React.RefObject<HTMLVideoElement | null>; points?: Point[] | null }) {
  const arms = player?.pose.arms;
  const bones = [[11, 12], [11, 23], [12, 24], [23, 24], [11, 13], [13, 15], [12, 14], [14, 16]];
  return <article className="online-player"><div className="online-player-title"><span>{player ? `${player.name}${local ? ' (you)' : ''}` : 'Waiting for a friend…'}</span><strong>{player?.score || 0}</strong></div>
    <div className="online-camera"><video ref={videoRef} autoPlay playsInline muted={!!local} style={{ transform: 'scaleX(-1)' }} />
      {points && <svg className="online-skeleton" viewBox={`0 0 ${(player?.aspect || 16 / 9) * 540} 540`} preserveAspectRatio="xMidYMid meet">{bones.map(([a, b]) => <line key={`${a}-${b}`} x1={(1 - points[a].x) * (player?.aspect || 16 / 9) * 540} y1={points[a].y * 540} x2={(1 - points[b].x) * (player?.aspect || 16 / 9) * 540} y2={points[b].y * 540} stroke="var(--p1, #22e6c8)" strokeWidth="5" />)}</svg>}
      {player && <div className="online-target">{arms && <svg viewBox="0 0 120 130" aria-label={player.pose.label}><g fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round"><circle cx="60" cy="22" r="10" /><path d="M60 33 V80 M60 80 L40 112 M60 80 L80 112" /><path d={`M60 48 L${60 - Math.cos(arms.la) * 38} ${48 + Math.sin(arms.la) * 38} M60 48 L${60 + Math.cos(arms.ra) * 38} ${48 + Math.sin(arms.ra) * 38}`} /></g></svg>}<span>{player.pose.label}</span><progress aria-label="Pose hold progress" value={player.hold} max={1} /></div>}
      {player && !player.connected && <span className="online-camera-message">Reconnecting…</span>}
    </div>
    <div className="online-player-bottom"><span>{player?.ready ? '✓ Ready' : local ? 'Your camera' : player ? 'Connected' : 'Invite someone to join'}</span><span>{player?.misses || 0} missed</span></div>
    <progress className="online-wall" aria-label="Time before next pose" value={player?.progress || 0} max={1} />
  </article>;
}

function Clip({ id, token, share }: { id: string; token?: string; share?: string }) {
  const [clip, setClip] = useState<{ status: string; url?: string }>({ status: 'queued' });
  const [message, setMessage] = useState('');
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
  }, [id, token, share]);
  async function shareClip() {
    try {
      const data = await api<{ share: string }>(`/clips/${id}/share`, token, {});
      const url = `${location.origin}${location.pathname}?clip=${id}&share=${data.share}#online`;
      if (navigator.share) await navigator.share({ title: 'Our Galawgaw highlight', url });
      else { await navigator.clipboard.writeText(url); setMessage('Share link copied.'); }
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Could not share.'); }
  }
  return <section className="online-clip"><h2>Your match, the short version.</h2>
    {clip.url ? <><video controls playsInline src={clip.url} /><div className="online-media-buttons"><a href={clip.url} target="_blank" rel="noreferrer">Open / save MP4</a>{token && !share && <><button onClick={() => void shareClip()}>Share highlight</button><button onClick={() => void api(`/clips/${id}/share`, token, undefined, 'DELETE').then(() => setMessage('Share link disabled.')).catch(e => setMessage(e.message))}>Disable share link</button></>}</div></> : <p>{clip.status === 'failed' ? 'The highlight could not be rendered.' : clip.status === 'no-recording' ? 'This match was not recorded.' : 'Making your highlight… You can keep playing.'}</p>}
    {message && <p role="status">{message}</p>}
  </section>;
}
