import type * as React from "react";
import { useEffect, useRef } from "react";
import { Hand, PersonStanding, Play, Swords, Trophy, Users } from "lucide-react";
import { mountPreview, unmountPreview } from "@/game/previews.js";
import { ACCENTS } from "@/engine/games";
import { hoverSound, startSingle } from "@/engine/engine";
import type { GameMeta } from "@/engine/store";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function GameCard({ meta, best }: { meta: GameMeta; best: number }) {
  const previewRef = useRef<HTMLCanvasElement>(null);
  const accent = ACCENTS[meta.index % ACCENTS.length];

  useEffect(() => {
    const entry = mountPreview(previewRef.current!, meta.id);
    return () => unmountPreview(entry);
  }, [meta.id]);

  return (
    <button
      type="button"
      data-game-card
      onClick={() => startSingle(meta.index)}
      onMouseEnter={hoverSound}
      style={{ "--accent": accent } as React.CSSProperties}
      className={cn(
        "group relative flex w-full flex-col overflow-hidden rounded-xl border bg-card/70 text-left shadow-sm",
        "transition-[transform,border-color,box-shadow] duration-300 ease-out will-change-transform",
        "hover:-translate-y-1 hover:border-[color-mix(in_oklab,var(--accent)_45%,transparent)] hover:shadow-[0_18px_50px_-20px_var(--accent)]",
        "focus-visible:-translate-y-1 focus-visible:border-[color-mix(in_oklab,var(--accent)_60%,transparent)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[color-mix(in_oklab,var(--accent)_35%,transparent)]",
      )}
    >
      {/* Live preview of the real game */}
      <div
        className="relative h-32 overflow-hidden border-b"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 100%, color-mix(in oklab, var(--accent) 18%, transparent), transparent 70%), oklch(0.15 0.02 280)",
        }}
      >
        <canvas ref={previewRef} aria-hidden="true" className="absolute inset-0 size-full" />
        <span className="absolute left-3 top-3 rounded-md bg-black/40 px-1.5 py-0.5 font-mono text-[11px] font-bold text-white/70 backdrop-blur-sm">
          {String(meta.index + 1).padStart(2, "0")}
        </span>
        <Badge
          variant="outline"
          className="absolute right-3 top-3 border-white/10 bg-black/40 text-white/80 backdrop-blur-sm"
        >
          {meta.coop ? <Users /> : <Swords />}
          {meta.coop ? "Co-op" : "Versus"}
        </Badge>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="flex items-center gap-2 font-display text-lg font-bold tracking-tight">
          <span aria-hidden="true" className="text-xl transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6">
            {meta.icon}
          </span>
          {meta.title}
        </h3>
        <p className="text-sm leading-relaxed text-muted-foreground">{meta.blurb}</p>

        <div className="mt-auto flex items-center justify-between gap-2 pt-3">
          <span className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              {meta.mode === "pose" ? <PersonStanding className="size-3.5" /> : <Hand className="size-3.5" />}
              {meta.mode === "pose" ? "Full body" : "Hands"}
            </span>
            <span className={cn("flex items-center gap-1", best > 0 && "text-amber")}>
              <Trophy className="size-3.5" />
              {best > 0 ? `Best ${best}` : "No record"}
            </span>
          </span>
          <span
            className={cn(
              buttonVariants({ size: "sm", variant: "secondary" }),
              "pointer-events-none transition-colors duration-300 group-hover:bg-[var(--accent)] group-hover:text-ink group-focus-visible:bg-[var(--accent)] group-focus-visible:text-ink",
            )}
          >
            <Play className="fill-current" />
            Play
          </span>
        </div>
      </div>
    </button>
  );
}
