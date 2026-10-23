import { useLayoutEffect, useRef, useState } from 'react';
import './recording-prompt.css';

export type RecordingChoice = 'audio' | 'video' | 'off';

export function RecordingPrompt({ online = false, available = true, onChoose, onCancel }: {
  online?: boolean; available?: boolean;
  onChoose: (choice: RecordingChoice) => Promise<void> | void; onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const alive = useRef(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useLayoutEffect(() => {
    alive.current = true;
    const opener = document.activeElement as HTMLElement | null;
    const element = dialog.current;
    element?.showModal();
    return () => { alive.current = false; element?.close(); opener?.focus(); };
  }, []);
  async function choose(choice: RecordingChoice) {
    setBusy(true); setError('');
    try { await onChoose(choice); }
    catch { if (alive.current) setError('Could not enable the microphone. Allow access and retry, or choose video only.'); }
    finally { if (alive.current) setBusy(false); }
  }
  return <dialog ref={dialog} className="recording-prompt" aria-labelledby="recording-title" aria-describedby="recording-detail" onCancel={e => { e.preventDefault(); onCancel(); }}>
    <p className="arcade-eyebrow">BEFORE THE RIDICULOUS BEGINS</p>
    <h2 id="recording-title">Keep the good bit?</h2>
    <p id="recording-detail">{online ? 'Both players must agree to record. Your camera and enabled microphone become a highlight either player can save or share. Access expires after 30 days.' : 'Save a short highlight of this round. With audio, your microphone captures voices and reactions alongside game sounds. Everyone in frame should agree.'}</p>
    <p className="recording-note">{online ? 'Microphone audio is also shared live with your partner. Video only mutes your microphone; your partner may still share audio.' : 'Clips stay on this device until you download or share them. Recording quality adjusts to protect gameplay.'}</p>
    {!available && <p>Recording is unavailable here. You can still play.</p>}
    {error && <p role="alert">{error}</p>}
    <div className="recording-choices" aria-busy={busy}>
      <button disabled={busy || !available} onClick={() => void choose('audio')}>{busy ? 'Getting ready…' : 'Record with audio'}</button>
      <button disabled={busy || !available} onClick={() => void choose('video')}>Video only</button>
      <button disabled={busy} autoFocus onClick={() => void choose('off')}>Play without recording</button>
    </div>
    <div className="recording-footer"><button onClick={onCancel}>Back</button><a href="./privacy/" target="_blank" rel="noopener noreferrer">Privacy</a></div>
  </dialog>;
}
