import { MotionConfig } from "motion/react";
import { useArcade } from "@/engine/store";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { MenuPage } from "@/components/arcade/MenuPage";
import { Stage } from "@/components/arcade/Stage";
import { RotateGate } from "@/components/arcade/RotateGate";
import { useKeyboard } from "@/hooks/useKeyboard";
import { lazy, Suspense, useEffect, useState } from "react";
import { returnToMenu } from '@/engine/engine';
import { startPreviews, stopPreviews } from '@/game/previews.js';

const Online = lazy(() => import('./online/Online').then(module => ({ default: module.Online })));
const CommunityPage = lazy(() => import('./community/Community').then(module => ({ default: module.CommunityPage })));
const isOnline = () => location.hash === '#online' || new URLSearchParams(location.search).has('room') || new URLSearchParams(location.search).has('clip');

export default function App() {
  const inGame = useArcade((s) => s.phase !== "menu");
  const [online, setOnline] = useState(isOnline);
  const [community, setCommunity] = useState(() => new URLSearchParams(location.search).has('moment'));
  useEffect(() => { const change = () => {setOnline(isOnline());setCommunity(new URLSearchParams(location.search).has('moment'));}; window.addEventListener('hashchange', change); return () => window.removeEventListener('hashchange', change); }, []);
  useKeyboard(!online && !community);
  useEffect(() => {
    if (online || community) {
      if (useArcade.getState().phase !== 'menu') returnToMenu();
      stopPreviews();
    } else startPreviews('menu');
  }, [online, community]);

  if (community) return <Suspense fallback={<p>Opening this moment…</p>}><CommunityPage /></Suspense>;

  if (online) return <Suspense fallback={<div role="status" className="p-12 text-center">Opening online play…</div>}><Online /></Suspense>;

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
