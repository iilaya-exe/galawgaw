import { Smartphone } from "lucide-react";

// Every game is a split screen with two players side by side, which a
// portrait phone cannot present. Rather than squeeze it, ask for landscape.
// Only shown once a game is up — the menu works fine in portrait.
export function RotateGate() {
  return (
    <div className="rotate-gate fixed inset-0 z-50 hidden flex-col items-center justify-center gap-4 bg-background p-8 text-center">
      <Smartphone className="size-14 text-p1 [animation:rotate-hint_2.4s_ease-in-out_infinite]" />
      <h2 className="font-display text-2xl font-bold tracking-tight">Rotate your device</h2>
      <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
        GALAWGAW puts two players side by side, so it needs a landscape screen. A tablet or laptop gives
        both players more room.
      </p>
    </div>
  );
}
