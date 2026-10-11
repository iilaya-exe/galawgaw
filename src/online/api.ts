export const API = (import.meta.env.VITE_API_URL || (['localhost', '127.0.0.1'].includes(location.hostname) ? 'http://localhost:2567' : '')).replace(/\/$/, '');
export async function api<T>(path: string, token?: string, body?: unknown, method?: string): Promise<T> {
  if (!API) throw new Error('Online play is not connected yet. Please try again after the server is deployed.');
  const response = await fetch(`${API}/api${path}`, {
    method: method || (body === undefined ? 'GET' : 'POST'),
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'The server could not complete that request.');
  return data as T;
}
export type Point = { x: number; y: number; visibility: number };
export type OnlinePlayer = { id: string; name: string; connected: boolean; ready: boolean; recordingConsent: boolean;
  score: number; misses: number; pose: { id: string; label: string; arms: { la: number; ra: number } };
  progress: number; hold: number; aspect: number; tracked: boolean; landmarks: Point[] | null };
export type Snapshot = {
  roomId: string; matchId: string; phase: 'lobby' | 'preparing' | 'countdown' | 'playing' | 'paused' | 'over' | 'aborted';
  serverNow: number; startedAt: number; remaining: number; winner: number | null; players: OnlinePlayer[];
  mediaEnabled: boolean; highlightsEnabled: boolean; recording: boolean; public: boolean;
};
