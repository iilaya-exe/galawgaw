import { useState } from 'react';
import { useLocalHighlight, clearLocalHighlight, enableLocalHighlights, canRecordLocal } from '@/engine/localHighlights';

export function LocalHighlightSetting() {
  const enabled = useLocalHighlight(s => s.enabled);
  return <div className="local-highlight-setting"><label><input type="checkbox" checked={enabled} disabled={!canRecordLocal()} onChange={e => enableLocalHighlights(e.target.checked)} />Record same-screen highlights</label><p>{canRecordLocal() ? 'Both players agree to recording. Optional silent clips, processed on this device. Leave off for best performance.' : 'Recording is unavailable in this browser. The games still work.'}</p></div>;
}
export function LocalHighlight({ onWatch }: { onWatch?: () => void }) {
  const { url, file, processing, message } = useLocalHighlight();
  const [shareMessage, setShareMessage] = useState('');
  if (!url && !processing && !message) return null;
  async function share() {
    if (!file) return;
    try { await navigator.share({ title: 'Our GALAWGAW highlight', files: [file] }); }
    catch (error) { if (!(error instanceof DOMException && error.name === 'AbortError')) setShareMessage('Sharing was unavailable. Download the clip and send it from your photos or files.'); }
  }
  return <section className="local-highlight"><h3>Your match. The good bit.</h3>{processing ? <p role="status">Finishing your clip…</p> : <>{url && <video key={url} src={url} controls playsInline preload="metadata" onPlay={onWatch} />}<p>{message}</p>{file && <div><a href={url} download={file.name}>Download clip ↓</a>{navigator.canShare?.({ files: [file] }) && <button onClick={() => void share()}>Share clip ↗</button>}<button onClick={clearLocalHighlight}>Discard clip</button></div>}{shareMessage && <p role="status">{shareMessage}</p>}</>}</section>;
}
