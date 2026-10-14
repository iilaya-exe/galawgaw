import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Cross-origin isolation unlocks SharedArrayBuffer, which MediaPipe's WASM
// runtime needs to run multi-threaded. Without it the tracker silently runs
// single-threaded — on the CPU delegate, the difference between a playable
// match and a slideshow. `credentialless` (rather than `require-corp`) keeps
// the cross-origin model loads from storage.googleapis.com working. The WASM
// runtime is served locally. Production hosts get the same pair from
// vercel.json / public/_headers.
const isolation = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "credentialless",
};

export default defineConfig({
  // Relative asset URLs, so the same build works at a domain root and under
  // a GitHub Pages project path like username.github.io/galawgaw/.
  base: "./",
  plugins: [react(), tailwindcss(), {
    name: "static-information-pages",
    configureServer(server) {
      // Vite's SPA fallback otherwise shows the arcade at these public URLs.
      server.middlewares.use((req, _res, next) => {
        if (req.url) {
          const url = new URL(req.url, "http://localhost");
          if (/^\/(about|help|contact|privacy|terms)\/$/.test(url.pathname)) {
            req.url = `${url.pathname}index.html${url.search}`;
          }
        }
        next();
      });
    },
  }],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: { headers: isolation },
  preview: { headers: isolation },
  // React, motion and the game modules are one ~190 kB (gzip) entry; the
  // tracker is split off and loaded on first launch.
  build: { chunkSizeWarningLimit: 800 },
});
