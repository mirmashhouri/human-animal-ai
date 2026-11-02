import { useEffect, useState } from 'react';
import * as api from './api';
import type { MemoryStatus } from './types';

export default function MemoryPanel({ onError }: { onError: (error: unknown) => void }) {
  const [status, setStatus] = useState<MemoryStatus | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { let active = true; void api.call<MemoryStatus>('memory').then(value => { if (active) setStatus(value); }).catch(onError); return () => { active = false; }; }, []);
  async function toggle() {
    if (!status) return; setBusy(true);
    try { setStatus(await api.call<MemoryStatus>('memory/settings', { enabled: !status.enabled })); } catch (error) { onError(error); } finally { setBusy(false); }
  }
  return <section className="teach-card"><p className="teach-kicker">YOUR EXAMPLES, REUSED AUTOMATICALLY</p><h2>Your visual memory</h2>
    <p>Saved feedback becomes local, searchable trait vectors. With memory enabled, the public studio sends relevant reference crops and judgments to Meta alongside each new photo.</p>
    {status && <><div className="teach-score-grid"><div><strong>{status.indexedExamples}</strong><span>Ready for retrieval</span></div><div><strong>{status.labeledExamples}</strong><span>Labeled portraits</span></div><div><strong>{status.totalExamples}</strong><span>Total portraits</span></div><div><strong>{status.enabled ? 'On' : 'Off'}</strong><span>Public studio memory</span></div></div>
      <button className="teach-button" disabled={busy} onClick={() => void toggle()}>{status.enabled ? 'Turn memory off' : 'Turn memory on'}</button>
      <button className="teach-text-button" onClick={() => void api.download('memory/export','wildlens-trait-vectors.json').catch(onError)}>Export trait vectors</button>
      <p className="teach-help">{status.notice}</p></>}
    <ol><li>Confirm an animal and reasons in Animal choices, or rate features in the advanced teaching editor.</li><li>Use a single-person photo or crop and select the Training split.</li><li>Save. The vector index updates locally; no Meta request is made. Choice feedback uses separately marked AI geometry estimates; manual ratings take precedence.</li><li>When eligible memory exists, new portraits use an additional Spark geometry request before animal selection and generation. Up to six example references are included for a group.</li></ol>
    <p>Unknown ratings stay unknown. These are interpretable trait vectors, not identity embeddings or a fine-tuned model. Scores are retrieval heuristics, not probabilities. No relevant example means the original selection prompt is used.</p>
    <p>Validation and test examples never enter retrieval. Benchmarks exclude all evaluated groups and exact duplicate image bytes. Keep all photos of the same person in one group.</p>
  </section>;
}
