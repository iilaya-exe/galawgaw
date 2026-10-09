import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Cross-origin isolation unlocks SharedArrayBuffer, which MediaPipe's WASM
// runtime needs to run multi-threaded. Without it the tracker silently runs
// single-threaded — on the CPU delegate, the difference between a playable
// match and a slideshow. `credentialless` (rather than `require-corp`) keeps
// the cross-origin loads working: the WASM from jsdelivr and the models from
// storage.googleapis.com. Production hosts get the same pair from
// vercel.json / public/_headers.
const isolation = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "credentialless",
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: { headers: isolation },
  preview: { headers: isolation },
  // React, motion and the game modules are one ~190 kB (gzip) entry; the
  // tracker is split off and loaded on first launch.
  build: { chunkSizeWarningLimit: 800 },
});
