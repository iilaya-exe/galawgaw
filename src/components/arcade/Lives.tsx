import type * as React from "react";
import { cn } from "@/lib/utils";
import { SERIES_LIVES } from "@/engine/engine";

// Life pips for one player. The pip just spent animates out, keyed on the
// series' loss counter so the animation replays each time a life goes.
export function Lives({
  side,
  lives,
  losing,
  lossKey,
  className,
}: {
  side: 1 | 2;
  lives: number;
  losing?: boolean;
  lossKey?: number;
  className?: string;
}) {
  const color = side === 1 ? "var(--p1)" : "var(--p2)";
  return (
    <span className={cn("inline-flex items-center gap-1.5", side === 2 && "flex-row-reverse", className)} aria-label={`Player ${side}: ${lives} of ${SERIES_LIVES} lives`}>
      {Array.from({ length: SERIES_LIVES }, (_, index) => (
        <i
          key={`${index}-${losing && index === lives ? lossKey : 0}`}
          className="life"
          style={{ "--accent-color": color } as React.CSSProperties}
          data-spent={index >= lives ? "" : undefined}
          data-losing={losing && index === lives ? "" : undefined}
        />
      ))}
    </span>
  );
}
