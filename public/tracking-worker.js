// Classic worker intentionally: MediaPipe 0.10.14's WASM loader uses importScripts.
// Dynamic import loads the library without changing the worker to module mode.
let model;
self.onmessage = async ({ data }) => {
  if (data.type === 'init') {
    try {
      const { FilesetResolver, PoseLandmarker, HandLandmarker } = await import('./tracking/vision_bundle.mjs');
      const files = await FilesetResolver.forVisionTasks(new URL('./tracking/wasm', self.location.href).href);
      const build = delegate => data.mode === 'pose'
        ? PoseLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: data.modelUrl, delegate }, runningMode: 'VIDEO', numPoses: data.count, canvas: new OffscreenCanvas(1, 1) })
        : HandLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: data.modelUrl, delegate }, runningMode: 'VIDEO', numHands: data.count, canvas: new OffscreenCanvas(1, 1) });
      let delegate = 'GPU';
      try { model = await build(delegate); }
      catch { delegate = 'CPU'; model = await build(delegate); }
      self.postMessage({ type: 'ready', delegate });
    } catch (error) { self.postMessage({ type: 'error', message: String(error) }); }
  } else if (data.type === 'frame') {
    const start = performance.now();
    try {
      const result = model.detectForVideo(data.bitmap, data.timestamp);
      self.postMessage({ type: 'result', landmarks: result.landmarks, ms: performance.now() - start });
    } catch (error) { self.postMessage({ type: 'error', message: String(error) }); }
    finally { data.bitmap.close(); }
  }
};
