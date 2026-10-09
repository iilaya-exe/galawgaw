import { useEffect, useRef } from "react";
import { attach } from "@/engine/engine";
import { useArcade } from "@/engine/store";
import { cn } from "@/lib/utils";
import { TopBar } from "./Hud";
import { Overlays } from "./Overlays";

/* The full-screen play surface. It stays mounted (just invisible) while the
   menu is up, so the engine always has a sized <video> and <canvas>. */
export function Stage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const active = useArcade((s) => s.phase !== "menu");

  useEffect(() => attach(videoRef.current!, canvasRef.current!), []);

  return (
    <div
      inert={!active}
      aria-hidden={!active}
      className={cn(
        "fixed inset-0 z-40 overflow-hidden bg-ink transition-[opacity,visibility] duration-300 ease-out",
        active ? "visible opacity-100" : "invisible opacity-0",
      )}
    >
      <video ref={videoRef} autoPlay playsInline muted className="stage-video absolute inset-0 size-full" />
      <div className="stage-vignette pointer-events-none absolute inset-0" aria-hidden="true" />
      <canvas ref={canvasRef} className="absolute inset-0 size-full" />
      <TopBar />
      <Overlays />
    </div>
  );
}
