import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// The game canvases draw text in these faces. A canvas never triggers a
// font load on its own, so warm them up before the first frame needs them.
for (const face of ['700 16px "Space Grotesk"', '700 16px "JetBrains Mono"', '400 16px "JetBrains Mono"']) {
  document.fonts?.load(face).catch(() => {});
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
