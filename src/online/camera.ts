import { FilesetResolver, PoseLandmarker, HandLandmarker } from '@mediapipe/tasks-vision';
import type { Point } from './api';

export async function openCamera(video: HTMLVideoElement, signal: AbortSignal, onInput: (points: Point[] | null, aspect: number, hands: Point[][]) => void, mode: 'hand' | 'pose' = 'pose', hands = 2) {
  let stream: MediaStream | undefined;
  let model: PoseLandmarker | HandLandmarker | undefined;
  let frame = 0;
  let lastTime = -1;
  let lastSent = 0;
  const close = () => { cancelAnimationFrame(frame); stream?.getTracks().forEach(t => t.stop()); model?.close(); model = undefined; video.srcObject = null; };
  signal.addEventListener('abort', close, { once: true });
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 960 }, height: { ideal: 540 }, frameRate: { ideal: 24, max: 30 }, facingMode: 'user' }, audio: false });
    if (signal.aborted) throw new Error('Camera setup cancelled.');
    video.srcObject = stream;
    await video.play();
    const files = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm');
    if (signal.aborted) throw new Error('Camera setup cancelled.');
    const build = (delegate: 'GPU' | 'CPU') => mode === 'pose'
      ? PoseLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task', delegate }, runningMode: 'VIDEO', numPoses: 1 })
      : HandLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task', delegate }, runningMode: 'VIDEO', numHands: hands });
    try { model = await build('GPU'); }
    catch { if (signal.aborted) throw new Error('Camera setup cancelled.'); model = await build('CPU'); }
    if (signal.aborted) throw new Error('Camera setup cancelled.');
    const tick = (now: number) => {
      if (signal.aborted || !model) return;
      if (video.readyState >= 2 && video.currentTime !== lastTime && now - lastSent >= 65) {
        lastTime = video.currentTime; lastSent = now;
        try {
          const found = model.detectForVideo(video, now).landmarks.map(points => points.map(p => ({ x: Math.max(0, Math.min(1, p.x)), y: Math.max(0, Math.min(1, p.y)), visibility: p.visibility ?? 1 })));
          onInput(mode === 'pose' ? found[0] || null : null, video.videoWidth / video.videoHeight, mode === 'hand' ? found : []);
        } catch { onInput(null, 16 / 9, []); }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return { stream, close };
  } catch (error) { close(); signal.removeEventListener('abort', close); throw error; }
}
