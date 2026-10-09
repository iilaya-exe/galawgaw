import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, Maximize, Pause, Volume2, VolumeX } from "lucide-react";
import { returnToMenu, toggleFullscreen, toggleMute, pause } from "@/engine/engine";
import { useArcade, type HudCenter, type HudPod } from "@/engine/store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Lives } from "./Lives";

/* The bar across the top of the stage: navigation on the left, the live
   scoreboard in the middle, machine status on the right. Everything else
   on screen belongs to the players. */
export function TopBar() {
  const phase = useArcade((s) => s.phase);
  const game = useArcade((s) => s.game);
  const playMode = useArcade((s) => s.playMode);
  const round = useArcade((s) => s.series.round);
  const showHud = phase === "warmup" || phase === "countdown" || phase === "playing" || phase === "paused";

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-black/70 via-black/35 to-transparent px-3 pb-8 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-4">
      <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3">
        {/* Left: navigation + what's on */}
        <div className="pointer-events-auto flex min-w-0 items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="secondary"
                size="icon"
                className="glass-solid shrink-0 border border-white/10"
                onClick={() => (phase === "playing" ? pause() : returnToMenu())}
                aria-label={phase === "playing" ? "Pause" : "Back to games"}
              >
                {phase === "playing" ? <Pause /> : <ChevronLeft />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {phase === "playing" ? "Pause" : "Back to games"} <Kbd className="ml-1">Esc</Kbd>
            </TooltipContent>
          </Tooltip>
          {game && (
            <div className="hidden min-w-0 flex-col md:flex">
              <span className="truncate font-display text-sm font-bold leading-tight text-white">
                <span aria-hidden="true" className="mr-1.5">{game.icon}</span>
                {game.title}
              </span>
              <span className="truncate text-xs text-white/60">
                {playMode === "gauntlet" ? `Gauntlet · Round ${Math.max(1, round)}` : game.coop ? "Co-op" : "Versus"}
              </span>
            </div>
          )}
        </div>

        {/* Centre: scoreboard */}
        <AnimatePresence>
          {showHud && (
            <motion.div
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="flex items-start gap-2 sm:gap-3"
              aria-hidden="true"
            >
              <PodView side={1} />
              <Dial />
              <PodView side={2} />
            </motion.div>
          )}
        </AnimatePresence>
        {!showHud && <span />}

        {/* Right: status */}
        <StatusCluster />
      </div>
    </div>
  );
}

function PodView({ side }: { side: 1 | 2 }) {
  const pod: HudPod = useArcade((s) => (side === 1 ? s.hud.p1 : s.hud.p2));
  const gauntlet = useArcade((s) => s.playMode === "gauntlet");
  const lives = useArcade((s) => s.series.lives[side - 1]);
  const accent = pod.accent || (side === 1 ? "var(--p1)" : "var(--p2)");
  const right = side === 2;

  return (
    <div
      className={cn(
        "glass-solid relative flex w-28 flex-col gap-0.5 overflow-hidden rounded-xl border border-white/10 px-3 py-2 sm:w-40 sm:px-4",
        right ? "items-end text-right" : "items-start",
      )}
      style={{ boxShadow: `inset ${right ? "-" : ""}3px 0 0 ${accent}, 0 8px 30px -14px ${accent}` }}
    >
      <div className={cn("flex w-full items-center justify-between gap-2", right && "flex-row-reverse")}>
        <span className="font-mono text-[11px] font-bold tracking-wider" style={{ color: accent }}>{pod.tag}</span>
        {gauntlet && <Lives side={side} lives={lives} className="[&_.life]:size-2" />}
      </div>
      <motion.span
        key={pod.value}
        initial={{ scale: 1.25, opacity: 0.6 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 500, damping: 22 }}
        className={cn("font-mono text-2xl font-bold tabular-nums leading-none text-white sm:text-3xl", right ? "origin-right" : "origin-left")}
      >
        {pod.value}
      </motion.span>
      <span className="h-4 truncate text-[11px] font-medium text-white/60">{pod.meta}</span>
      <span className="absolute inset-x-0 bottom-0 h-1 bg-white/5">
        <span
          className={cn("absolute inset-y-0 transition-[width] duration-300 ease-out", right ? "right-0" : "left-0")}
          style={{ width: `${pod.ratio * 100}%`, background: accent }}
        />
      </span>
    </div>
  );
}

const DIAL_R = 19;
const DIAL_LEN = 2 * Math.PI * DIAL_R;

function Dial() {
  const center: HudCenter | null = useArcade((s) => s.hud.center);
  if (!center) return <div className="w-14 sm:w-16" />;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={cn("glass-solid relative size-14 rounded-full border border-white/10 sm:size-16", center.danger && "animate-pulse")}>
        <svg viewBox="0 0 44 44" className="absolute inset-0 -rotate-90">
          <circle cx="22" cy="22" r={DIAL_R} fill="none" stroke="white" strokeOpacity="0.1" strokeWidth="3" />
          <circle
            cx="22" cy="22" r={DIAL_R} fill="none" strokeWidth="3" strokeLinecap="round"
            stroke={center.danger ? "var(--danger)" : "var(--amber)"}
            strokeDasharray={DIAL_LEN}
            strokeDashoffset={DIAL_LEN * (1 - center.ratio)}
            className="transition-[stroke-dashoffset,stroke] duration-300 ease-linear"
          />
        </svg>
        <span className={cn(
          "absolute inset-0 flex items-center justify-center font-mono text-lg font-bold tabular-nums sm:text-xl",
          center.danger ? "text-danger" : "text-white",
        )}>
          {center.value}
        </span>
      </div>
      <span className="font-mono text-[10px] font-bold tracking-widest text-white/60">{center.label}</span>
    </div>
  );
}

function StatusCluster() {
  const telemetry = useArcade((s) => s.telemetry);
  const muted = useArcade((s) => s.muted);
  const tracking = telemetry.subjects > 0;

  return (
    <div className="pointer-events-auto flex items-center justify-end gap-1.5 sm:gap-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={cn(
              "glass-solid hidden h-9 gap-2 rounded-md border-white/10 px-3 text-xs text-white/80 sm:inline-flex",
            )}
          >
            <span className={cn("relative flex size-2")}>
              {tracking && <span className="absolute inline-flex size-full animate-ping rounded-full bg-p1 opacity-60" />}
              <span className={cn("relative inline-flex size-2 rounded-full", tracking ? "bg-p1" : telemetry.camera ? "bg-amber" : "bg-white/30")} />
            </span>
            {telemetry.camera ? (tracking ? `${telemetry.subjects} tracked` : "Looking…") : "Camera off"}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="font-mono">
          {telemetry.fps} fps · {telemetry.delegate ?? "—"} tracking
          {telemetry.delegate === "CPU" ? " (no hardware acceleration)" : ""}
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="secondary" size="icon" className="glass-solid border border-white/10" onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"}>
            {muted ? <VolumeX /> : <Volume2 />}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{muted ? "Unmute" : "Mute"} <Kbd className="ml-1">M</Kbd></TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="secondary" size="icon" className="glass-solid hidden border border-white/10 sm:inline-flex" onClick={toggleFullscreen} aria-label="Fullscreen">
            <Maximize />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Fullscreen <Kbd className="ml-1">F</Kbd></TooltipContent>
      </Tooltip>
    </div>
  );
}
