import { useState } from 'react';
import { useLocalHighlight, clearLocalHighlight, chooseLocalRecording, cancelLocalRecordingChoice, canRecordLocal } from '@/engine/localHighlights';
import { PublishHighlight } from '@/community/CommunityGate';
import { RecordingPrompt } from './RecordingPrompt';

export function LocalRecordingPrompt() {
  const choosing = useLocalHighlight(s => s.choosing);
  return choosing ? <RecordingPrompt available={canRecordLocal()} onChoose={chooseLocalRecording} onCancel={cancelLocalRecordingChoice} /> : null;
}
export function LocalHighlight({ onWatch }: { onWatch?: () => void }) {
  const { url, file, gameId, processing, message } = useLocalHighlight();
  const [shareMessage, setShareMessage] = useState('');
  if (!url && !processing && !message) return null;
  async function share() {
    if (!file) return;
    try { await navigator.share({ title: 'Our GALAWGAW highlight', files: [file] }); }
    catch (error) { if (!(error instanceof DOMException && error.name === 'AbortError')) setShareMessage('Sharing was unavailable. Download the clip and send it from your photos or files.'); }
  }
  return <section className="local-highlight"><h3>Your match. The good bit.</h3>{processing ? <p role="status">Finishing your clip…</p> : <>{url && <video data-social-video key={url} src={url} controls playsInline preload="metadata" onPlay={onWatch} />}<p>{message}</p>{file && <div><a href={url} download={file.name}>Download clip ↓</a>{navigator.canShare?.({ files: [file] }) && <button onClick={() => void share()}>Share clip ↗</button>}<PublishHighlight gameId={gameId} file={file} url={url} onOpen={onWatch}/><button onClick={clearLocalHighlight}>Discard clip</button></div>}{shareMessage && <p role="status">{shareMessage}</p>}</>}</section>;
}
