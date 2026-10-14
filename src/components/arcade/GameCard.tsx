import type { CSSProperties } from 'react';
import { useEffect, useRef } from 'react';
import { ArrowUpRight, Hand, PersonStanding, Trophy } from 'lucide-react';
import { mountPreview, unmountPreview } from '@/game/previews.js';
import { ACCENTS } from '@/engine/games';
import { hoverSound, startSingle } from '@/engine/engine';
import type { GameMeta } from '@/engine/store';

export function GameCard({ meta, best }: { meta: GameMeta; best: number }) {
  const previewRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const entry = mountPreview(previewRef.current!, meta.id);
    return () => unmountPreview(entry);
  }, [meta.id]);
  return <button type="button" data-game-card onClick={() => startSingle(meta.index)} onMouseEnter={hoverSound}
    style={{ '--game-accent': ACCENTS[meta.index % ACCENTS.length] } as CSSProperties} className="arcade-game">
    <div className="arcade-game-preview"><canvas ref={previewRef} aria-hidden="true" /><span className="arcade-game-number">{String(meta.index + 1).padStart(2, '0')}</span><span className="arcade-game-type">{meta.coop ? 'CO-OP' : 'VERSUS'}</span></div>
    <div className="arcade-game-copy"><h3><span aria-hidden="true">{meta.icon}</span> {meta.title}<ArrowUpRight aria-hidden="true" /></h3><p>{meta.blurb}</p>
      <div className="arcade-game-meta"><span>{meta.mode === 'pose' ? <PersonStanding /> : <Hand />}{meta.mode === 'pose' ? 'Full body' : 'Hands'}</span>{best > 0 && <span className="arcade-record"><Trophy />Best {best}</span>}<span className="arcade-game-play">Let’s play →</span></div>
    </div>
  </button>;
}
