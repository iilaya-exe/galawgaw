import { create } from 'zustand';
import { mixRecordingAudio, unlock } from '../game/audio.js';

type HighlightState = { gameId: string; choosing: boolean; enabled: boolean; recording: boolean; processing: boolean; url: string; file: File | null; message: string };
export const useLocalHighlight = create<HighlightState>(() => ({ gameId: '', choosing: false, enabled: false, recording: false, processing: false, url: '', file: null, message: '' }));
const set = useLocalHighlight.setState;
let preparedMic: MediaStream | null = null;
let choiceResolve: ((proceed: boolean) => void) | null = null;
let choiceVersion = 0;
export function requestLocalRecording() {
  cancelLocalRecordingChoice();
  set({ choosing: true, enabled: false });
  return new Promise<boolean>(resolve => { choiceResolve = resolve; });
}
export async function chooseLocalRecording(choice: 'audio' | 'video' | 'off') {
  const version = choiceVersion;
  unlock();
  if (choice === 'audio') {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
    if (version !== choiceVersion || !choiceResolve) { stream.getTracks().forEach(t => t.stop()); return; }
    stream.getAudioTracks().forEach(t => { t.enabled = false; });
    preparedMic = stream;
  }
  const resolve = choiceResolve; choiceResolve = null;
  set({ choosing: false, enabled: choice !== 'off', message: '' });
  resolve?.(true);
}
export function cancelLocalRecordingChoice() {
  choiceVersion++;
  preparedMic?.getTracks().forEach(t => t.stop()); preparedMic = null;
  const resolve = choiceResolve; choiceResolve = null;
  set({ choosing: false }); resolve?.(false);
}
export function canRecordLocal() { return typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function'; }
export function enableLocalHighlights(enabled: boolean) { set({ enabled, message: '' }); }
export function clearLocalHighlight() {
  const { url } = useLocalHighlight.getState();
  if (url) URL.revokeObjectURL(url);
  set({ url: '', file: null, gameId: '', message: '' });
}

type Capture = {
  canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; stream: MediaStream; recorder: MediaRecorder | null;
  title: string; gameId: string; started: number; lastFrame: number; score: number; previousScores: string; best: { blob: Blob; score: number } | null;
  finishing: boolean; cancelled: boolean; captionUntil: number; caption: string; quality: number; nextQuality: number | null; lowFpsSince: number; releaseAudio: () => void; microphone: MediaStream | null;
};
let capture: Capture | null = null;
const captions = ['That was completely intentional.', 'Excellent form. Questionable decisions.', 'We definitely practised this.', 'Nobody panic. Too late.'];
const codecs = ['video/webm;codecs=vp8,opus', 'video/mp4', 'video/webm'];
const qualities = [
  { width: 640, height: 360, fps: 15, bitrate: 650_000 },
  { width: 480, height: 270, fps: 12, bitrate: 420_000 },
  { width: 360, height: 202, fps: 10, bitrate: 260_000 },
];

function initialQuality() {
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  const cores = navigator.hardwareConcurrency || 8;
  if (memory <= 2 || cores <= 4) return 2;
  if (memory <= 4 || cores <= 6) return 1;
  return 0;
}

// Only one 640×360, 15fps encoder, and only after explicit opt-in. Independently
// playable ten-second segments bound memory; keep the most eventful moment.
export function startLocalHighlight(title: string, gameId = '') {
  const microphone = preparedMic; preparedMic = null;
  cancelLocalCapture();
  let releaseAudio = () => { microphone?.getTracks().forEach(t => t.stop()); };
  if (!useLocalHighlight.getState().enabled || !canRecordLocal()) { releaseAudio(); return; }
  let stream: MediaStream | null = null;
  try {
    const quality = initialQuality(), profile = qualities[quality];
    const canvas = document.createElement('canvas'); canvas.width = profile.width; canvas.height = profile.height;
    const ctx = canvas.getContext('2d')!;
    stream = canvas.captureStream(profile.fps);
    if (microphone) {
      microphone.getAudioTracks().forEach(t => { t.enabled = true; });
      const mix = mixRecordingAudio(microphone);
      mix.stream.getAudioTracks().forEach((t: MediaStreamTrack) => stream!.addTrack(t));
      releaseAudio = () => { mix.release(); microphone.getTracks().forEach(t => t.stop()); };
    }
    capture = { canvas, ctx, stream, recorder: null, title, gameId, started: 0, lastFrame: 0, score: 0, previousScores: '', best: null, finishing: false, cancelled: false, captionUntil: 0, caption: '', quality, nextQuality: null, lowFpsSince: 0, releaseAudio, microphone };
    set({ recording: true, processing: false, message: '' });
  } catch { releaseAudio(); stream?.getTracks().forEach(t => t.stop()); set({ recording: false, message: 'This browser could not record a highlight. You can keep playing.' }); }
}
function beginSegment(c: Capture, now: number) {
  const mimeType = codecs.find(type => MediaRecorder.isTypeSupported(type));
  const recorder = new MediaRecorder(c.stream, { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: qualities[c.quality].bitrate, audioBitsPerSecond: 64_000 });
  c.recorder = recorder; c.started = now; c.score = 0;
  const chunks: Blob[] = []; let bytes = 0;
  recorder.ondataavailable = event => {
    if (event.data.size) { chunks.push(event.data); bytes += event.data.size; }
    if (bytes > 4_000_000 && recorder.state !== 'inactive') recorder.stop();
  };
  recorder.onerror = () => {
    if (capture !== c || c.cancelled) return;
    cancelLocalCapture(); set({ message: 'Recording stopped, but your game is unaffected.' });
  };
  recorder.onstop = () => {
    if (c.cancelled) return;
    const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'video/webm' });
    if (blob.size && c.lastFrame - c.started >= 1500 && (!c.best || c.score >= c.best.score)) c.best = { blob, score: c.score };
    c.recorder = null;
    if (c.finishing) complete(c);
  };
  recorder.start(1000);
}
export function drawLocalHighlight(video: HTMLVideoElement, board: HTMLCanvasElement, now: number, scores: string[]) {
  const c = capture;
  if (!c || c.finishing || c.cancelled || (c.recorder && c.recorder.state !== 'recording') || now - c.lastFrame < 1000 / qualities[c.quality].fps) return;
  c.lastFrame = now;
  try {
    if (!c.recorder && c.nextQuality !== null) {
      c.quality = c.nextQuality; c.nextQuality = null;
      const profile = qualities[c.quality];
      c.canvas.width = profile.width; c.canvas.height = profile.height;
      const nextStream = c.canvas.captureStream(profile.fps);
      c.stream.getAudioTracks().forEach(t => nextStream.addTrack(t));
      c.stream.getVideoTracks().forEach(t => t.stop());
      c.stream = nextStream;
    }
    const ctx = c.ctx, joined = scores.join(' / ');
    if (c.previousScores && joined !== c.previousScores) {
      c.score++; c.captionUntil = now + 1800; c.caption = captions[c.score % captions.length];
    }
    c.previousScores = joined;
    const outputWidth = c.canvas.width, outputHeight = c.canvas.height;
    const scaleOutput = outputWidth / 640;
    ctx.setTransform(scaleOutput, 0, 0, scaleOutput, 0, 0);
    ctx.fillStyle = '#080b15'; ctx.fillRect(0, 0, 640, outputHeight / scaleOutput);
    // Match the stage's cover crop, then composite the existing game canvas.
    const ratio = board.width / board.height;
    const width = Math.min(640, 276 * ratio), height = width / ratio, x = (640 - width) / 2, y = 42 + (276 - height) / 2;
    if (video.readyState >= 2) {
      const scale = Math.max(width / video.videoWidth, height / video.videoHeight);
      const sw = width / scale, sh = height / scale;
      ctx.save(); ctx.translate(x + width, y); ctx.scale(-1, 1); ctx.globalAlpha = .7;
      ctx.drawImage(video, (video.videoWidth - sw) / 2, (video.videoHeight - sh) / 2, sw, sh, 0, 0, width, height); ctx.restore();
    }
    ctx.drawImage(board, x, y, width, height);
    ctx.font = 'bold 17px sans-serif'; ctx.fillStyle = '#22e6c8'; ctx.textAlign = 'left'; ctx.fillText('GALAWGAW / ' + c.title, 16, 27, 440);
    ctx.textAlign = 'right'; ctx.fillStyle = '#fff'; ctx.fillText(joined, 624, 27, 150);
    ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = 'bold 16px sans-serif';
    ctx.fillText(now < c.captionUntil ? c.caption : 'Good company. Questionable moves. · galawgaw.com', 320, 342, 610);
    if (!c.recorder) beginSegment(c, now);
    else if (now - c.started >= 10_000 && c.recorder.state === 'recording') c.recorder.stop();
  } catch { cancelLocalCapture(); set({ message: 'This device could not record a highlight. Your game can continue.' }); }
}

// Called by the game's existing FPS meter. A brief loading hitch changes
// nothing; two seconds of pressure lowers one level. Returning true lets the
// engine restart its own performance grace period before disabling recording.
export function adaptLocalHighlight(fps: number, now: number) {
  const c = capture;
  if (!c || c.finishing || c.cancelled || c.nextQuality !== null) return false;
  if (fps >= 27) { c.lowFpsSince = 0; return false; }
  if (!c.lowFpsSince) { c.lowFpsSince = now; return false; }
  if (now - c.lowFpsSince < 2000 || c.quality >= qualities.length - 1) return false;
  c.nextQuality = c.quality + 1;
  c.lowFpsSince = 0;
  const profile = qualities[c.nextQuality];
  // Finish the old file before changing dimensions or tracks. Each segment
  // keeps one valid video format and the same audio track throughout.
  if (c.recorder?.state === 'recording') c.recorder.stop();
  set({ message: `Highlight quality adjusted to keep gameplay smooth (${profile.height}p).` });
  return true;
}
function complete(c: Capture) {
  c.releaseAudio();
  c.stream.getTracks().forEach(t => t.stop());
  if (capture !== c || c.cancelled) return;
  capture = null;
  if (c.best) {
    clearLocalHighlight();
    const extension = c.best.blob.type.includes('mp4') ? 'mp4' : 'webm';
    const file = new File([c.best.blob], `galawgaw-highlight.${extension}`, { type: c.best.blob.type });
    set({ url: URL.createObjectURL(file), file, gameId: c.gameId, recording: false, processing: false, message: 'A short moment picked from score changes. Saved only in this tab until you download or share it.' });
  } else set({ recording: false, processing: false, message: 'This round was too short to capture a highlight.' });
}
export function finishLocalHighlight() {
  const c = capture; if (!c) return;
  c.finishing = true; set({ recording: false, processing: true });
  if (!c.recorder) complete(c);
  else if (c.recorder.state !== 'inactive') c.recorder.stop();
}
export function pauseLocalHighlight(paused: boolean) {
  capture?.microphone?.getAudioTracks().forEach(t => { t.enabled = !paused; });
  const r = capture?.recorder;
  if (r?.state === 'recording' && paused) r.pause();
  else if (r?.state === 'paused' && !paused) r.resume();
}
export function cancelLocalCapture() {
  preparedMic?.getTracks().forEach(t => t.stop()); preparedMic = null;
  const c = capture; capture = null;
  if (c) { c.cancelled = true; if (c.recorder && c.recorder.state !== 'inactive') c.recorder.stop(); c.stream.getTracks().forEach(t => t.stop()); c.releaseAudio(); }
  set({ recording: false, processing: false });
}
