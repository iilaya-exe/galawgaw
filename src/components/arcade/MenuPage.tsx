import { useMemo, useState } from 'react';
import { ArrowRight, Camera, Dices, Hand, Maximize, Swords, Users, Volume2, VolumeX } from 'lucide-react';
import { META, startGauntlet, startShuffle, toggleFullscreen, toggleMute } from '@/engine/engine';
import { useArcade } from '@/engine/store';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { GameCard } from './GameCard';
import { Lives } from './Lives';
import { ArcadeHeader, ArcadeFooter, PartyPose } from './ArcadeShell';

type Filter = 'all' | 'versus' | 'coop' | 'hand' | 'pose';
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All games' }, { value: 'versus', label: 'Versus' },
  { value: 'coop', label: 'Co-op' }, { value: 'hand', label: 'Hands' }, { value: 'pose', label: 'Full body' },
];

export function MenuPage({ hidden }: { hidden: boolean }) {
  const records = useArcade(s => s.records);
  const muted = useArcade(s => s.muted);
  const [filter, setFilter] = useState<Filter>('all');
  const games = useMemo(() => META.filter(meta => filter === 'versus' ? !meta.coop : filter === 'coop' ? meta.coop : filter === 'hand' || filter === 'pose' ? meta.mode === filter : true), [filter]);
  return <div inert={hidden} aria-hidden={hidden} className="arcade-menu">
    <ArcadeHeader action={<>
      <Button variant="ghost" size="icon-sm" aria-label={muted ? 'Unmute sound' : 'Mute sound'} aria-pressed={muted} onClick={toggleMute}>{muted ? <VolumeX /> : <Volume2 />}</Button>
      <Button variant="ghost" size="icon-sm" aria-label="Fullscreen" onClick={toggleFullscreen}><Maximize /></Button>
    </>} />
    <main className="arcade-content">
      <section className="arcade-intro">
        <div><p className="arcade-eyebrow">THE WEBCAM PARTY ARCADE / {META.length} GAMES</p>
          <h1>Small games.<br /><span>Ridiculous moves.</span></h1>
          <p className="arcade-lede">Your hands are the controller. Your friend is the competition. Make some room and get a little carried away.</p>
          <div className="arcade-intro-actions"><Button size="lg" asChild><a href="#games">Pick a game <ArrowRight /></a></Button><Button size="lg" variant="outline" asChild><a href="#online"><Users /> Play online</a></Button></div>
          <p className="arcade-caption">2 players · One webcam · Nothing to install</p>
        </div><PartyPose />
      </section>
      <section className="gauntlet-strip" aria-labelledby="gauntlet-title">
        <div className="gauntlet-heading"><Swords aria-hidden="true" /><div><p className="arcade-eyebrow">THE MAIN EVENT</p><h2 id="gauntlet-title">The Gauntlet</h2></div></div>
        <p>Random games. Three lives each.<br />One very smug winner.</p>
        <div className="gauntlet-lives"><span>P1 <Lives side={1} lives={3} /></span><span>P2 <Lives side={2} lives={3} /></span></div>
        <Button onClick={startGauntlet} className="bg-amber text-ink hover:bg-amber/90">Enter the Gauntlet <ArrowRight /></Button>
      </section>
      <section id="games" className="arcade-games" aria-labelledby="games-title">
        <div className="arcade-section-heading"><div><p className="arcade-eyebrow">SAME SCREEN / SIDE BY SIDE</p><h2 id="games-title">Pick your next bad idea.</h2></div><Button variant="outline" onClick={startShuffle}><Dices /> Surprise me</Button></div>
        <div className="arcade-filter-row"><div className="arcade-filters" role="group" aria-label="Filter games">{FILTERS.map(item => <button type="button" key={item.value} aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}>{item.label}</button>)}</div><span className="arcade-game-count">{games.length} games</span></div>
        <div className="arcade-game-grid">{games.map(meta => <GameCard key={meta.id} meta={meta} best={records[meta.id] ?? 0} />)}</div>
        <p className="arcade-keyboard-hint">Keyboard shortcut: <Kbd>1</Kbd>–<Kbd>9</Kbd> pick a game · <Kbd>G</Kbd> Gauntlet · <Kbd>R</Kbd> shuffle</p>
      </section>
      <section id="how" className="arcade-how" aria-labelledby="how-title">
        <h2 id="how-title">From sitting down to showing off.</h2>
        <ol><li><Camera /><div><strong>01 / Camera on</strong><p>Allow your webcam. Same-screen video stays on your device.</p></div></li><li><Users /><div><strong>02 / Make room</strong><p>Stand side by side, one player on each half. Landscape works best.</p></div></li><li><Hand /><div><strong>03 / Find your groove</strong><p>A practice round checks your tracking. Then it’s game on.</p></div></li></ol>
      </section>
    </main><ArcadeFooter />
  </div>;
}
