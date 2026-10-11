import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import type { Point } from './api';

export async function openCamera(video: HTMLVideoElement, signal: AbortSignal, onPose: (points: Point[] | null, aspect: number) => void) {
  let stream: MediaStream | undefined;
  let model: PoseLandmarker | undefined;
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
    const options = { baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task' }, runningMode: 'VIDEO' as const, numPoses: 1 };
    try { model = await PoseLandmarker.createFromOptions(files, { ...options, baseOptions: { ...options.baseOptions, delegate: 'GPU' } }); }
    catch { if (signal.aborted) throw new Error('Camera setup cancelled.'); model = await PoseLandmarker.createFromOptions(files, options); }
    if (signal.aborted) throw new Error('Camera setup cancelled.');
    const tick = (now: number) => {
      if (signal.aborted || !model) return;
      if (video.readyState >= 2 && video.currentTime !== lastTime && now - lastSent >= 65) {
        lastTime = video.currentTime; lastSent = now;
        try {
          const pose = model.detectForVideo(video, now).landmarks[0];
          onPose(pose ? pose.map(p => ({ x: Math.max(0, Math.min(1, p.x)), y: Math.max(0, Math.min(1, p.y)), visibility: p.visibility ?? 0 })) : null, video.videoWidth / video.videoHeight);
        } catch { onPose(null, 16 / 9); }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return { stream, close };
  } catch (error) { close(); signal.removeEventListener('abort', close); throw error; }
}
