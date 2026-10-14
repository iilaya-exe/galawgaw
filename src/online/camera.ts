import { createTracker, type Tracker } from '../tracking/tracker';
import type { Point } from './api';

export type LocalInput = { points: Point[] | null; hands: Point[][]; aspect: number; at: number };
export async function openCamera(video: HTMLVideoElement, signal: AbortSignal,
  onInput: (points: Point[] | null, aspect: number, hands: Point[][]) => void,
  mode: 'hand' | 'pose' = 'pose', hands = 2, lowVideo = true) {
  let stream: MediaStream | undefined;
  let tracker: Tracker | undefined;
  let frame = 0;
  let closed = false;
  const close = () => {
    closed = true; cancelAnimationFrame(frame); tracker?.close();
    stream?.getTracks().forEach(t => t.stop()); video.srcObject = null;
    signal.removeEventListener('abort', close);
  };
  signal.addEventListener('abort', close, { once: true });
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: {
      width: { ideal: lowVideo ? 640 : 960 }, height: { ideal: lowVideo ? 360 : 540 },
      frameRate: { ideal: lowVideo ? 24 : 30, max: 30 }, facingMode: 'user',
    }, audio: false });
    if (signal.aborted) throw new Error('Camera setup cancelled.');
    video.srcObject = stream;
    await video.play();
    tracker = await createTracker(mode, mode === 'pose' ? 1 : hands, signal);
    if (signal.aborted) throw new Error('Camera setup cancelled.');
    const tick = (now: number) => {
      if (closed) return;
      frame = requestAnimationFrame(tick);
      void tracker!.detect(video, now).then(found => {
        if (closed || found === null) return;
        const points = found.map(group => group.map(p => ({
          x: Math.round(Math.max(0, Math.min(1, p.x)) * 1000) / 1000,
          y: Math.round(Math.max(0, Math.min(1, p.y)) * 1000) / 1000,
          visibility: Math.round((p.visibility ?? 1) * 100) / 100,
        })));
        onInput(mode === 'pose' ? points[0] || null : null, video.videoWidth / video.videoHeight, mode === 'hand' ? points : []);
      }).catch(() => { if (!closed) onInput(null, 16 / 9, []); });
    };
    frame = requestAnimationFrame(tick);
    return { stream, close, stats: tracker.stats };
  } catch (error) { close(); throw error; }
}
