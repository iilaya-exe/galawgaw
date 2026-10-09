import { MotionConfig } from "motion/react";
import { useArcade } from "@/engine/store";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { MenuPage } from "@/components/arcade/MenuPage";
import { Stage } from "@/components/arcade/Stage";
import { RotateGate } from "@/components/arcade/RotateGate";
import { useKeyboard } from "@/hooks/useKeyboard";

export default function App() {
  const inGame = useArcade((s) => s.phase !== "menu");
  useKeyboard();

  return (
    <MotionConfig reducedMotion="user">
      <TooltipProvider delayDuration={300}>
        <div className="app-backdrop" aria-hidden="true" />
        <MenuPage hidden={inGame} />
        <Stage />
        <RotateGate />
        <Toaster
          position="top-center"
          offset={96}
        />
      </TooltipProvider>
    </MotionConfig>
  );
}
