import type * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowRight, CameraOff, Check, CircleDashed, Dices, LayoutGrid, Loader2, Pause, Play, RotateCcw, SkipForward, Trophy,
} from "lucide-react";
import {
  finishWarmup, primaryAction, resume, retry, returnToMenu,
} from "@/engine/engine";
import { useArcade, type SlotState, type StepState } from "@/engine/store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Kbd } from "@/components/ui/kbd";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { Lives } from "./Lives";

const ease = [0.22, 1, 0.36, 1] as const;

/* A centred card on a dimmed scrim — the shared shape of every modal
   overlay on the stage. */
function Modal({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      className="scrim absolute inset-0 z-30 flex justify-center overflow-y-auto p-4 pt-20 short:pb-3 short:pt-16"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.98 }}
        transition={{ duration: 0.4, ease }}
        className={cn("my-auto w-full max-w-md", className)}
      >
        <Card className="glass gap-0 border-white/10 py-0 shadow-2xl">{children}</Card>
      </motion.div>
    </motion.div>
  );
}

export function Overlays() {
  const phase = useArcade((s) => s.phase);
  return (
    <AnimatePresence mode="wait">
      {phase === "loading" && <LoadingOverlay key="loading" />}
      {phase === "error" && <ErrorOverlay key="error" />}
      {phase === "paused" && <PauseOverlay key="paused" />}
      {phase === "over" && <ResultsOverlay key="over" />}
      {phase === "countdown" && <CountdownOverlay key="countdown" />}
      {phase === "warmup" && <WarmupBar key="warmup" />}
    </AnimatePresence>
  );
}

/* ── Loading ─────────────────────────────────────────────────────── */
const STEP_COPY: Record<"cam" | "model" | "cal", { title: string; detail: string }> = {
  cam: { title: "Camera access", detail: "Allow the camera when your browser asks" },
  model: { title: "Tracking model", detail: "Downloaded once, then cached" },
  cal: { title: "Calibrating", detail: "Lining the game up with your camera" },
};

function StepIcon({ state }: { state: StepState }) {
  if (state === "done") return <span className="flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check className="size-3.5" strokeWidth={3} /></span>;
  if (state === "active") return <span className="flex size-6 items-center justify-center rounded-full bg-primary/15 text-primary"><Loader2 className="size-3.5 animate-spin" /></span>;
  return <span className="flex size-6 items-center justify-center rounded-full bg-muted text-muted-foreground"><CircleDashed className="size-3.5" /></span>;
}

function LoadingOverlay() {
  const steps = useArcade((s) => s.steps);
  const game = useArcade((s) => s.game);
  return (
    <Modal>
      <CardContent className="flex flex-col gap-6 p-6 short:gap-4 short:p-4">
        <div className="flex items-center gap-4">
          <span className="relative flex size-14 shrink-0 items-center justify-center rounded-2xl border bg-secondary text-3xl">
            <span aria-hidden="true">{game?.icon}</span>
            <span className="absolute -inset-1 animate-spin rounded-[1.2rem] border-2 border-transparent border-t-primary [animation-duration:1.4s]" />
          </span>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Getting ready</p>
            <h2 className="font-display text-2xl font-bold tracking-tight">{game?.title}</h2>
          </div>
        </div>
        <ol className="flex flex-col gap-3">
          {(["cam", "model", "cal"] as const).map((key) => (
            <li key={key} className={cn("flex items-center gap-3 transition-opacity duration-300", steps[key] === "pending" && "opacity-50")}>
              <StepIcon state={steps[key]} />
              <div className="flex flex-col">
                <span className="text-sm font-medium">{STEP_COPY[key].title}</span>
                <span className="text-xs text-muted-foreground">{STEP_COPY[key].detail}</span>
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Modal>
  );
}

/* ── Error ───────────────────────────────────────────────────────── */
function ErrorOverlay() {
  const message = useArcade((s) => s.error);
  return (
    <Modal>
      <CardContent className="flex flex-col items-center gap-5 p-6 text-center short:gap-3 short:p-4">
        <span className="flex size-14 items-center justify-center rounded-full bg-destructive/15 text-destructive ring-8 ring-destructive/5">
          <CameraOff className="size-6" />
        </span>
        <div className="flex flex-col gap-2">
          <h2 className="font-display text-2xl font-bold tracking-tight">Can't see you yet</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">{message}</p>
        </div>
        <ul className="w-full rounded-lg border bg-background/40 p-3 text-left text-xs leading-relaxed text-muted-foreground">
          <li>• Check the camera icon in the address bar and choose <span className="text-foreground">Allow</span>.</li>
          <li>• Close other apps that might be using the camera (Zoom, Meet, FaceTime).</li>
          <li>• The page must be opened over <span className="font-mono text-foreground">https://</span>.</li>
        </ul>
        <div className="flex w-full flex-col gap-2 sm:flex-row">
          <Button className="flex-1" onClick={retry}><RotateCcw />Try again</Button>
          <Button className="flex-1" variant="outline" onClick={returnToMenu}><LayoutGrid />Back to games</Button>
        </div>
      </CardContent>
    </Modal>
  );
}

/* ── Pause ───────────────────────────────────────────────────────── */
function PauseOverlay() {
  return (
    <Modal className="max-w-sm">
      <CardContent className="flex flex-col items-center gap-5 p-6 text-center short:gap-3 short:p-4">
        <span className="flex size-14 items-center justify-center rounded-full bg-secondary">
          <Pause className="size-6" />
        </span>
        <div className="flex flex-col gap-1.5">
          <h2 className="font-display text-2xl font-bold tracking-tight">Paused</h2>
          <p className="text-sm text-muted-foreground">The match is on hold. Nothing is being recorded.</p>
        </div>
        <div className="flex w-full flex-col gap-2">
          <Button size="lg" onClick={resume} autoFocus>
            <Play className="fill-current" />Resume
            <Kbd className="ml-auto bg-black/15 text-primary-foreground/80">P</Kbd>
          </Button>
          <Button size="lg" variant="outline" onClick={returnToMenu}>
            <LayoutGrid />Quit to games
            <Kbd className="ml-auto">Esc</Kbd>
          </Button>
        </div>
      </CardContent>
    </Modal>
  );
}

/* ── Countdown ───────────────────────────────────────────────────── */
function CountdownOverlay() {
  const count = useArcade((s) => s.count);
  const go = count.value === "GO";
  return (
    <motion.div
      className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center gap-6 bg-[radial-gradient(circle_at_center,oklch(0_0_0/55%),transparent_60%)]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.35 } }}
    >
      <div className="relative flex size-44 items-center justify-center sm:size-56 short:size-32">
        <AnimatePresence>
          <motion.span
            key={`ring-${count.value}`}
            className={cn("absolute inset-0 rounded-full border-4", go ? "border-primary" : "border-white/80")}
            initial={{ scale: 0.6, opacity: 0.9 }}
            animate={{ scale: 1.25, opacity: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          />
        </AnimatePresence>
        <AnimatePresence mode="popLayout">
          <motion.span
            key={count.value}
            initial={{ scale: 1.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 24 }}
            className={cn(
              "font-display text-8xl font-bold tabular-nums drop-shadow-[0_0_40px_rgba(0,0,0,0.6)] sm:text-9xl short:text-7xl",
              go ? "text-primary" : "text-white",
            )}
          >
            {count.value}
          </motion.span>
        </AnimatePresence>
      </div>
      <p className="glass-solid max-w-[90vw] rounded-full border border-white/10 px-5 py-2 text-center text-sm font-medium text-white/90">
        {count.hint}
      </p>
    </motion.div>
  );
}

/* ── Warm-up ─────────────────────────────────────────────────────────
   Everything lives in one slim bottom bar — the two halves of the screen
   are exactly where players reach, so nothing may sit on top of them.
   No backdrop blur here: this sits over live play.
   ─────────────────────────────────────────────────────────────────── */
function WarmupBar() {
  const warm = useArcade((s) => s.warm);
  return (
    <motion.div
      className="absolute inset-x-0 bottom-0 z-30 flex justify-center p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 24 }}
      transition={{ duration: 0.4, ease }}
    >
      <div className="glass-solid flex w-full max-w-3xl items-center gap-3 rounded-2xl border border-white/10 p-2.5 pl-3 shadow-2xl sm:gap-4">
        <Badge className="hidden shrink-0 bg-amber/15 text-amber sm:inline-flex">Warm-up</Badge>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-mono text-xs font-bold tracking-wide text-white">{warm.label}</span>
          <div className="relative h-5 overflow-hidden">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={warm.tip}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
                className="block truncate text-sm text-white/70"
              >
                {warm.tip}
              </motion.span>
            </AnimatePresence>
          </div>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <PlayerChip name={warm.coop ? "Crew" : "P1"} color="var(--p1)" slot={warm.slots[0]} />
          {!warm.coop && <PlayerChip name="P2" color="var(--p2)" slot={warm.slots[1]} />}
        </div>
        <Separator orientation="vertical" className="!h-8 bg-white/10" />
        <Button size="sm" variant="secondary" onClick={finishWarmup} className="shrink-0">
          <SkipForward />
          <span className="hidden sm:inline">Skip</span>
        </Button>
        <Button size="icon-sm" variant="ghost" onClick={returnToMenu} aria-label="Back to games" className="shrink-0">
          <LayoutGrid />
        </Button>
      </div>
    </motion.div>
  );
}

const SLOT_LABEL: Record<SlotState, string> = { waiting: "not seen", tracked: "tracking", done: "ready" };

function PlayerChip({ name, color, slot }: { name: string; color: string; slot: { state: SlotState; text: string } }) {
  return (
    <span
      className={cn(
        "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 transition-colors duration-300",
        slot.state === "done" ? "border-transparent" : "border-white/10 bg-white/5",
      )}
      style={slot.state === "done" ? { background: `color-mix(in oklab, ${color} 22%, transparent)` } : undefined}
      title={SLOT_LABEL[slot.state]}
    >
      {slot.state === "done" ? (
        <Check className="size-3.5" style={{ color }} strokeWidth={3} />
      ) : (
        <span
          className={cn("size-2 rounded-full", slot.state === "waiting" && "animate-pulse")}
          style={{ background: slot.state === "waiting" ? "var(--amber)" : color }}
        />
      )}
      <span className="font-mono text-xs font-bold" style={{ color }}>{name}</span>
      <span className="font-mono text-xs tabular-nums text-white/70">{slot.text}</span>
    </span>
  );
}

/* ── Results ─────────────────────────────────────────────────────── */
function ResultsOverlay() {
  const result = useArcade((s) => s.result);
  const series = useArcade((s) => s.series);
  const playMode = useArcade((s) => s.playMode);
  const autoNext = useArcade((s) => s.autoNext);
  if (!result) return null;

  const ReplayIcon = result.finale ? RotateCcw
    : playMode === "gauntlet" ? ArrowRight
    : playMode === "shuffle" ? Dices
    : RotateCcw;

  return (
    <Modal className="max-w-lg">
      <CardContent className="flex flex-col gap-5 p-6 short:gap-3 short:p-4">
        <div className="flex flex-col items-center gap-3 text-center">
          <Badge variant="outline" className="rounded-full border-white/10 bg-white/5 text-muted-foreground">{result.kicker}</Badge>
          <motion.h2
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.15, type: "spring", stiffness: 260, damping: 20 }}
            className="font-display text-3xl font-bold tracking-tight text-balance sm:text-4xl short:text-2xl"
            style={result.color ? { color: result.color, textShadow: `0 0 40px ${result.color}55` } : undefined}
          >
            {result.title}
          </motion.h2>
          {result.record !== null && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
              <Badge className="gap-1.5 bg-amber/15 px-2.5 py-1 text-amber">
                <Trophy />New record — {result.record}
              </Badge>
            </motion.div>
          )}
        </div>

        {result.finale ? (
          <SeriesLog />
        ) : (
          <div className="flex flex-col gap-3">
            {result.rows.map((row, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.25 + index * 0.08, duration: 0.35 }}
                className="flex flex-col gap-1.5 rounded-lg border bg-background/40 p-3 short:p-2"
              >
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-xs font-bold" style={{ color: row.color }}>{row.tag}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{row.text}</span>
                  <span className="font-mono text-base font-bold tabular-nums">{row.value}</span>
                </div>
                <AnimatedBar ratio={row.ratio} color={row.color} />
              </motion.div>
            ))}
          </div>
        )}

        {playMode === "gauntlet" && (
          <div className="flex flex-col items-center gap-3 rounded-lg border bg-background/40 p-3 short:flex-row short:justify-between short:p-2">
            <span className="text-sm font-medium">{result.statusHead}</span>
            <div className="flex items-center gap-4">
              <span className="font-mono text-xs font-bold text-p1">P1</span>
              <Lives side={1} lives={series.lives[0]} losing={series.lastLost === 0} lossKey={series.lossKey} />
              <span className="text-xs text-muted-foreground">vs</span>
              <Lives side={2} lives={series.lives[1]} losing={series.lastLost === 1} lossKey={series.lossKey} />
              <span className="font-mono text-xs font-bold text-p2">P2</span>
            </div>
          </div>
        )}

        {autoNext.active && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Next round in {autoNext.seconds}</span>
              <span className="text-xs text-muted-foreground">Stay where you are</span>
            </div>
            <Progress value={autoNext.ratio * 100} indicatorClassName="bg-amber transition-transform duration-200 ease-linear" className="h-1.5 bg-amber/15" />
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button size="lg" className="flex-1 short:h-10" onClick={primaryAction} autoFocus>
            <ReplayIcon />{result.replayLabel}
            <Kbd className="ml-auto bg-black/15 text-primary-foreground/80">Enter</Kbd>
          </Button>
          <Button size="lg" variant="outline" className="flex-1 short:h-10" onClick={returnToMenu}>
            <LayoutGrid />All games
            <Kbd className="ml-auto">Esc</Kbd>
          </Button>
        </div>
      </CardContent>
    </Modal>
  );
}

function AnimatedBar({ ratio, color }: { ratio: number; color: string }) {
  return (
    <span className="relative h-1.5 overflow-hidden rounded-full bg-white/5">
      <motion.span
        className="absolute inset-y-0 left-0 rounded-full"
        style={{ background: color }}
        initial={{ width: 0 }}
        animate={{ width: `${ratio * 100}%` }}
        transition={{ delay: 0.4, duration: 0.9, ease }}
      />
    </span>
  );
}

// The round-by-round log shown when a gauntlet ends.
function SeriesLog() {
  const history = useArcade((s) => s.series.history);
  const mark = { play: "", tiebreak: "tiebreak", underdog: "countback", toss: "coin toss" } as const;
  return (
    <div className="flex max-h-56 flex-col gap-1 overflow-y-auto rounded-lg border bg-background/40 p-2">
      {history.map((entry) => {
        const color = entry.winner === 1 ? "var(--p1)" : "var(--p2)";
        return (
          <div key={entry.round} className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm odd:bg-white/[0.03]">
            <span className="font-mono text-xs text-muted-foreground">R{String(entry.round).padStart(2, "0")}</span>
            <span className="flex-1 truncate">{entry.game}</span>
            {mark[entry.how] && <span className="text-xs text-muted-foreground">{mark[entry.how]}</span>}
            <span className="font-mono text-xs font-bold" style={{ color }}>P{entry.winner}</span>
          </div>
        );
      })}
    </div>
  );
}
