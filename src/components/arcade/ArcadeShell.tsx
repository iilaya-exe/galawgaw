import type { ReactNode } from 'react';
import { Logo } from './Logo';
import { SiteLinks } from '../SiteLinks';

export function ArcadeHeader({ online = false, onHome, action }: { online?: boolean; onHome?: () => void; action?: ReactNode }) {
  return <header className="arcade-header"><div className="arcade-header-inner">
    <a href="./" className="arcade-logo" aria-label="GALAWGAW home" onClick={onHome ? e => { e.preventDefault(); onHome(); } : undefined}><Logo /></a>
    <nav aria-label="Play mode" className="arcade-modes">
      <a href="./" aria-current={!online ? 'page' : undefined} onClick={onHome ? e => { e.preventDefault(); onHome(); } : undefined}>Same screen</a>
      <a href="./#online" aria-current={online ? 'page' : undefined}>Online</a>
    </nav>
    {action && <div className="arcade-header-actions">{action}</div>}
  </div></header>;
}

export function ArcadeFooter() {
  return <footer className="arcade-footer"><div><strong>Good company. Questionable moves.</strong><p>Same-screen video stays on your device. Online play shares movement and, when enabled, video. Recording is optional for both players.</p></div><SiteLinks /></footer>;
}

// Static artwork: no animation loop, external asset, or camera work.
export function PartyPose() {
  return <svg className="party-pose" viewBox="0 0 420 240" fill="none" role="img" aria-label="Two players pulling ridiculous poses">
    <path d="M30 207H390" stroke="currentColor" strokeOpacity=".18" strokeDasharray="4 8" />
    <g stroke="var(--p1)" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round"><circle cx="125" cy="57" r="19" /><path d="M125 89L125 145 87 196M125 145L161 192M125 102L83 122 54 80M125 102L164 81 176 39" /></g>
    <g stroke="var(--p2)" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round"><circle cx="293" cy="68" r="19" /><path d="M290 100L278 151 244 194M278 151L322 174 348 151M288 111L246 99 230 57M288 111L329 122 365 89" /></g>
    <path d="M198 101L187 119H205L193 140" stroke="var(--amber)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    <g fill="currentColor" fontFamily="JetBrains Mono,monospace" fontSize="11"><text x="105" y="232">YOU</text><text x="260" y="232">YOUR RIVAL</text></g>
  </svg>;
}
