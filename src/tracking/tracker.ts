import type { HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision';

export type TrackingPoint = { x: number; y: number; z?: number; visibility: number };
export type TrackingStats = { delegate: 'GPU' | 'CPU'; worker: boolean; ms: number; fps: number };
type Model = HandLandmarker | PoseLandmarker;
export type Tracker = {
  stats: TrackingStats;
  detect(video: HTMLVideoElement, timestamp: number): Promise<TrackingPoint[][] | null>;
  close(): void;
};

export async function createTracker(mode: 'hand' | 'pose', count: number, signal?: AbortSignal, background = true): Promise<Tracker> {
  const modelUrl = mode === 'pose'
    ? 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'
    : 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
  let worker: Worker | undefined;
  let model: Model | undefined;
  let closed = false;
  let busy = false;
  let lastFrame = -1;
  let lastStart = -Infinity;
  let workerWarmedUp = false;
  let pending: { resolve(value: any): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> } | undefined;
  const stats: TrackingStats = { delegate: 'GPU', worker: false, ms: 0, fps: 0 };
  const cancelPending = (error: Error) => { if (pending) { clearTimeout(pending.timer); pending.reject(error); pending = undefined; } };
  const close = () => {
    closed = true;
    worker?.terminate(); worker = undefined;
    model?.close(); model = undefined;
    cancelPending(new Error('Tracking stopped.'));
    signal?.removeEventListener('abort', close);
  };
  signal?.addEventListener('abort', close, { once: true });
  const checkOpen = () => { if (closed || signal?.aborted) throw new Error('Tracking stopped.'); };
  const waitForWorker = (timeout: number) => new Promise<any>((resolve, reject) => {
    pending = { resolve, reject, timer: setTimeout(() => cancelPending(new Error('Tracking worker timed out.')), timeout) };
  });
  async function fallback() {
    worker?.terminate(); worker = undefined; stats.worker = false;
    checkOpen();
    const { FilesetResolver, PoseLandmarker, HandLandmarker } = await import('@mediapipe/tasks-vision');
    const files = await FilesetResolver.forVisionTasks(new URL(`${import.meta.env.BASE_URL}tracking/wasm`, location.href).href);
    checkOpen();
    const build = (delegate: 'GPU' | 'CPU') => mode === 'pose'
      ? PoseLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: modelUrl, delegate }, runningMode: 'VIDEO', numPoses: count })
      : HandLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: modelUrl, delegate }, runningMode: 'VIDEO', numHands: count });
    try { model = await build('GPU'); stats.delegate = 'GPU'; }
    catch { checkOpen(); model = await build('CPU'); stats.delegate = 'CPU'; }
    if (closed || signal?.aborted) { model.close(); model = undefined; checkOpen(); }
  }
  try {
    checkOpen();
    try {
      if (!background || typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') throw new Error('Background tracking unavailable.');
      worker = new Worker(new URL(`${import.meta.env.BASE_URL}tracking-worker.js`, location.href));
      worker.onmessage = ({ data }) => {
        if (!pending) return;
        const task = pending; pending = undefined; clearTimeout(task.timer);
        if (data.type === 'error') task.reject(new Error(data.message)); else task.resolve(data);
      };
      worker.onerror = () => cancelPending(new Error('Background tracking failed.'));
      const ready = waitForWorker(45_000);
      try { worker.postMessage({ type: 'init', mode, count, modelUrl }); }
      catch (error) { cancelPending(error instanceof Error ? error : new Error('Tracking initialization failed.')); }
      const result = await ready;
      stats.delegate = result.delegate; stats.worker = true;
    } catch { await fallback(); }
    return {
      stats, close,
      async detect(video, timestamp) {
        // Never queue stale camera frames. Slower devices automatically sample less often.
        const interval = Math.max(stats.worker ? 40 : 80, Math.min(150, stats.ms * 1.25));
        if (closed || busy || document.hidden || video.readyState < 2 || video.currentTime === lastFrame || timestamp - lastStart < interval) return null;
        busy = true; lastFrame = video.currentTime;
        if (Number.isFinite(lastStart)) stats.fps = Math.round(1000 / (timestamp - lastStart));
        lastStart = timestamp;
        const start = performance.now();
        try {
          let points: TrackingPoint[][];
          if (worker) {
            const width = Math.min(640, video.videoWidth);
            const bitmap = await createImageBitmap(video, { resizeWidth: width, resizeHeight: Math.max(1, Math.round(width * video.videoHeight / video.videoWidth)) });
            if (closed || !worker) { bitmap.close(); return null; }
            // The first GPU frame compiles shaders; give it more time than steady-state frames.
            const result = waitForWorker(workerWarmedUp ? 3000 : 10000);
            try { worker.postMessage({ type: 'frame', bitmap, timestamp }, [bitmap]); }
            catch (error) { bitmap.close(); cancelPending(error instanceof Error ? error : new Error('Frame transfer failed.')); }
            const data = await result;
            workerWarmedUp = true;
            stats.ms = Math.round(data.ms); points = data.landmarks;
          } else {
            points = model!.detectForVideo(video, timestamp).landmarks as TrackingPoint[][];
            stats.ms = Math.round(performance.now() - start);
          }
          // Results arriving after a stall must not control a new frame or match.
          return closed || performance.now() - start > 300 ? [] : points;
        } catch (error) {
          if (!closed && worker) {
            console.warn('Background tracking unavailable; using compatibility mode.', error);
            await fallback();
          }
          return [];
        } finally { busy = false; }
      },
    };
  } catch (error) { close(); throw error; }
}
