import { useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  ArrowRight, Camera, Dices, Hand, Heart, Maximize, ShieldCheck, Sparkles, Swords, Users, Volume2, VolumeX, Zap,
} from "lucide-react";
import { META, startGauntlet, startShuffle, toggleFullscreen, toggleMute } from "@/engine/engine";
import { useArcade } from "@/engine/store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Kbd } from "@/components/ui/kbd";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toggle } from "@/components/ui/toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { GameCard } from "./GameCard";
import { Lives } from "./Lives";
import { Logo } from "./Logo";

type Filter = "all" | "versus" | "coop" | "hand" | "pose";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "versus", label: "Versus" },
  { value: "coop", label: "Co-op" },
  { value: "hand", label: "Hands" },
  { value: "pose", label: "Full body" },
];

const STEPS = [
  {
    icon: Camera,
    title: "Allow your camera",
    text: "Tracking runs right here in your browser. Video never leaves your device.",
  },
  {
    icon: Users,
    title: "Stand back, side by side",
    text: "Each player owns one half of the screen. A laptop or TV in landscape works best.",
  },
  {
    icon: Hand,
    title: "Warm up, then play",
    text: "A quick practice round checks you're both tracked, then the match starts.",
  },
];

const rise = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: 0.06 * i, duration: 0.5, ease: [0.22, 1, 0.36, 1] as const } }),
};

export function MenuPage({ hidden }: { hidden: boolean }) {
  const records = useArcade((s) => s.records);
  const [filter, setFilter] = useState<Filter>("all");

  const games = useMemo(
    () => META.filter((meta) => {
      if (filter === "versus") return !meta.coop;
      if (filter === "coop") return meta.coop;
      if (filter === "hand" || filter === "pose") return meta.mode === filter;
      return true;
    }),
    [filter],
  );

  return (
    <div inert={hidden} aria-hidden={hidden} className="relative min-h-dvh">
      <SiteHeader />

      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* ── Hero ─────────────────────────────────────────────── */}
        <section className="grid items-center gap-10 py-12 sm:py-16 lg:grid-cols-[1.15fr_1fr] lg:py-24">
          <div className="flex flex-col items-start gap-6">
            <motion.div variants={rise} initial="hidden" animate="show" custom={0}>
              <Badge variant="outline" className="gap-1.5 rounded-full border-white/10 bg-white/5 px-3 py-1 text-muted-foreground">
                <Sparkles className="text-amber" />
                Webcam party games · Nothing to install
              </Badge>
            </motion.div>
            <motion.h1
              variants={rise} initial="hidden" animate="show" custom={1}
              className="font-display text-4xl font-bold leading-[1.05] tracking-tight text-balance sm:text-5xl lg:text-6xl"
            >
              Get off the couch. <span className="text-gradient">Beat your friends.</span>
            </motion.h1>
            <motion.p
              variants={rise} initial="hidden" animate="show" custom={2}
              className="max-w-xl text-base leading-relaxed text-muted-foreground text-pretty sm:text-lg"
            >
              Ten two-player games you control with your hands and body. Stand in front of your webcam,
              split the screen, and play head to head or as a team.
            </motion.p>
            <motion.div variants={rise} initial="hidden" animate="show" custom={3} className="flex flex-wrap gap-3">
              <Button size="lg" onClick={startGauntlet} className="shadow-[0_10px_40px_-12px_var(--p1)]">
                <Swords />
                Start the Gauntlet
                <Kbd className="ml-1 hidden bg-black/15 text-primary-foreground/80 sm:inline-flex">G</Kbd>
              </Button>
              <Button size="lg" variant="outline" onClick={startShuffle}>
                <Dices />
                Shuffle a game
                <Kbd className="ml-1 hidden sm:inline-flex">R</Kbd>
              </Button>
            </motion.div>
            <motion.ul
              variants={rise} initial="hidden" animate="show" custom={4}
              className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground"
            >
              <li className="flex items-center gap-1.5"><ShieldCheck className="size-4 text-p1" />Private, on-device tracking</li>
              <li className="flex items-center gap-1.5"><Users className="size-4 text-p2" />2 players, 1 screen</li>
              <li className="flex items-center gap-1.5"><Zap className="size-4 text-amber" />{META.length} games</li>
            </motion.ul>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <GauntletCard />
          </motion.div>
        </section>

        {/* ── How it works ─────────────────────────────────────── */}
        <section id="how" className="scroll-mt-20 py-8">
          <div className="grid gap-4 md:grid-cols-3">
            {STEPS.map((step, index) => (
              <Card key={step.title} className="gap-0 bg-card/50 py-5">
                <CardContent className="flex gap-4">
                  <span className="relative flex size-10 shrink-0 items-center justify-center rounded-lg border bg-secondary">
                    <step.icon className="size-5 text-p1" />
                    <span className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-primary font-mono text-[10px] font-bold text-primary-foreground">
                      {index + 1}
                    </span>
                  </span>
                  <div className="flex flex-col gap-1">
                    <h3 className="font-medium">{step.title}</h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">{step.text}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* ── Games ────────────────────────────────────────────── */}
        <section id="games" className="scroll-mt-20 py-12">
          <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Pick a game</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Every game is two players, split screen.
                <span className="hidden sm:inline"> Press <Kbd>1</Kbd>–<Kbd>9</Kbd> to jump straight in.</span>
              </p>
            </div>
            <Tabs value={filter} onValueChange={(value) => setFilter(value as Filter)}>
              <TabsList className="max-w-full overflow-x-auto">
                {FILTERS.map((item) => (
                  <TabsTrigger key={item.value} value={item.value}>{item.label}</TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          <motion.div layout className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
            {games.map((meta) => (
              <motion.div
                key={meta.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className="flex"
              >
                <GameCard meta={meta} best={records[meta.id] ?? 0} />
              </motion.div>
            ))}
          </motion.div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

function SiteHeader() {
  const muted = useArcade((s) => s.muted);
  return (
    <header className="sticky top-0 z-30 border-b border-white/5 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <a href="#" className="rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
          <Logo />
        </a>
        <nav className="flex items-center gap-1">
          <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
            <a href="#how">How it works</a>
          </Button>
          <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
            <a href="#games">Games</a>
          </Button>
          <Separator orientation="vertical" className="mx-1 hidden !h-5 sm:block" />
          <Tooltip>
            <TooltipTrigger asChild>
              <Toggle size="sm" pressed={muted} onPressedChange={toggleMute} aria-label="Mute sound">
                {muted ? <VolumeX /> : <Volume2 />}
              </Toggle>
            </TooltipTrigger>
            <TooltipContent>{muted ? "Unmute" : "Mute"} <Kbd className="ml-1">M</Kbd></TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={toggleFullscreen} aria-label="Fullscreen">
                <Maximize />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Fullscreen <Kbd className="ml-1">F</Kbd></TooltipContent>
          </Tooltip>
        </nav>
      </div>
    </header>
  );
}

function GauntletCard() {
  return (
    <Card className="relative gap-5 overflow-hidden border-amber/25 bg-card/60 shadow-[0_30px_80px_-40px_var(--amber)] backdrop-blur-sm">
      {/* slow shimmer: the headline act */}
      <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/[0.06] to-transparent [animation:shimmer_5s_ease-in-out_infinite]" />
      <CardContent className="flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <Badge className="bg-amber/15 text-amber">Main event</Badge>
          <span className="text-xs text-muted-foreground">Versus · best of everything</span>
        </div>
        <div>
          <h2 className="font-display text-3xl font-bold tracking-tight">The Gauntlet</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Random games, back to back. Lose a match, lose a life. Last player standing takes the crown.
          </p>
        </div>

        <div className="flex items-center justify-between rounded-xl border bg-background/50 px-5 py-4">
          <div className="flex flex-col items-start gap-2">
            <span className="font-mono text-xs font-bold text-p1">PLAYER 1</span>
            <Lives side={1} lives={3} />
          </div>
          <span className="font-display text-sm font-bold text-muted-foreground">VS</span>
          <div className="flex flex-col items-end gap-2">
            <span className="font-mono text-xs font-bold text-p2">PLAYER 2</span>
            <Lives side={2} lives={3} />
          </div>
        </div>

        <ul className="grid gap-2 text-sm text-muted-foreground">
          <li className="flex items-center gap-2"><Dices className="size-4 text-amber" />A new random game every round</li>
          <li className="flex items-center gap-2"><Heart className="size-4 text-p2" />Three lives each</li>
          <li className="flex items-center gap-2"><Hand className="size-4 text-p1" />Hands-free: rounds advance on their own</li>
        </ul>

        <Button onClick={startGauntlet} className="w-full bg-amber text-ink hover:bg-amber/90" size="lg">
          Enter the Gauntlet
          <ArrowRight />
        </Button>
      </CardContent>
    </Card>
  );
}

function SiteFooter() {
  return (
    <footer className="mt-8 border-t border-white/5">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 text-sm text-muted-foreground sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5 text-foreground">
            <ShieldCheck className="size-4 text-p1" />
            Your camera feed is processed on your device and is never uploaded.
          </span>
          <span>Best in Chrome or Edge on a laptop or desktop with a webcam.</span>
        </div>
        <div className="hidden flex-wrap items-center gap-x-4 gap-y-2 text-xs sm:flex">
          <span className="flex items-center gap-1.5"><Kbd>←</Kbd><Kbd>→</Kbd> browse</span>
          <span className="flex items-center gap-1.5"><Kbd>Enter</Kbd> play</span>
          <span className="flex items-center gap-1.5"><Kbd>P</Kbd> pause</span>
          <span className="flex items-center gap-1.5"><Kbd>Esc</Kbd> back</span>
          <span className="flex items-center gap-1.5"><Kbd>M</Kbd> mute</span>
          <span className="flex items-center gap-1.5"><Kbd>F</Kbd> fullscreen</span>
        </div>
      </div>
    </footer>
  );
}
