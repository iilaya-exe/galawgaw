// Visual projection only. Never run game.update(), collisions, or scoring here.
export function presentFrame(id: string, frame: Record<string, any>, ageMs: number, playing: boolean) {
  const dt = playing ? Math.min(80, Math.max(0, ageMs)) / 1000 : 0;
  const result = { ...frame };
  if (typeof frame.elapsed === 'number') result.elapsed += dt;
  if (id === 'penaltyduel' && frame.phase === 'flight') result.t = Math.min(.95, frame.t + dt);
  if (id === 'signalpop') result.bubbles = frame.bubbles.map((b: any) => ({ ...b,
    y: b.y - (b.popped ? 0 : b.vy * dt), wobble: b.wobble + dt * 2.4 }));
  if (id === 'beamdodge') result.beams = frame.beams.map((lane: any[]) => lane.map(b => ({ ...b, t: Math.min(1, b.t + b.speed * dt) })));
  // onResults assigns landmarks for display, so do not mutate the received packet.
  if (Array.isArray(frame.players)) result.players = frame.players.map((p: any) => ({ ...p }));
  if (id === 'copypose') result.players = result.players.map((p: any) => ({ ...p, progress: Math.min(.999, p.progress + p.speed * dt) }));
  return result;
}
