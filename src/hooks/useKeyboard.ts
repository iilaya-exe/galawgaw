import { useEffect } from "react";
import {
  finishWarmup, hoverSound, META, pause, primaryAction, returnToMenu, startGauntlet, startShuffle, startSingle,
  toggleFullscreen, toggleMute, togglePause,
} from "@/engine/engine";
import { useArcade } from "@/engine/store";

// Moves focus through the visible game cards, wrapping at either end.
function focusCard(step: number) {
  const cards = Array.from(document.querySelectorAll<HTMLElement>("[data-game-card]"));
  if (cards.length === 0) return;
  const current = cards.indexOf(document.activeElement as HTMLElement);
  const next = current === -1 ? (step > 0 ? 0 : cards.length - 1) : (current + step + cards.length) % cards.length;
  cards[next].focus();
  cards[next].scrollIntoView({ block: "nearest", behavior: "smooth" });
  hoverSound();
}

export function useKeyboard() {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key;
      const phase = useArcade.getState().phase;

      if (key === "m" || key === "M") { toggleMute(); return; }
      if (key === "f" || key === "F") { toggleFullscreen(); return; }

      if (phase === "menu") {
        if (key === "ArrowRight" || key === "ArrowDown") { focusCard(1); event.preventDefault(); }
        else if (key === "ArrowLeft" || key === "ArrowUp") { focusCard(-1); event.preventDefault(); }
        else if (key === "g" || key === "G") startGauntlet();
        else if (key === "r" || key === "R") startShuffle();
        else if (/^[1-9]$/.test(key) && META[Number(key) - 1]) startSingle(Number(key) - 1);
        return;
      }

      if (phase === "warmup" && (key === "Enter" || key === " ")) {
        finishWarmup();
        event.preventDefault();
        return;
      }

      if (key === "Escape") {
        if (phase === "playing") pause();
        else if (phase !== "loading") returnToMenu();
      } else if ((key === "p" || key === "P") && (phase === "playing" || phase === "paused")) {
        togglePause();
      } else if (key === "Enter" && phase === "over") {
        // The focused primary button already fires its own click for Enter.
        if (!(event.target as HTMLElement).closest?.("button")) primaryAction();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
}
