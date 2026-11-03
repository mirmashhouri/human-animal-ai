import { useEffect, useState } from 'react';
import * as api from './api';
import type { MemoryStatus } from './types';

export default function MemoryPanel({ onError }: { onError: (error: unknown) => void }) {
  const [status, setStatus] = useState<MemoryStatus | null>(null); const [busy, setBusy] = useState(false);
  const preferencePercent = Math.round((status?.preferenceWeight ?? .15) * 100);
  useEffect(() => { let active = true; void api.call<MemoryStatus>('memory').then(value => { if (active) setStatus(value); }).catch(onError); return () => { active = false; }; }, []);
  async function toggle() {
    if (!status) return; setBusy(true);
    try { setStatus(await api.call<MemoryStatus>('memory/settings', { enabled: !status.enabled })); } catch (error) { onError(error); } finally { setBusy(false); }
  }
  return <section className="teach-card"><p className="teach-kicker">YOUR EXAMPLES, REUSED AUTOMATICALLY</p><h2>Your visual memory</h2>
    <p>Meta first interprets the new photo independently. Your saved examples then adjust the candidate ranking locally: {100 - preferencePercent}% visual fit + {preferencePercent}% preference support when memory is on. The preference weight cannot exceed 20%.</p>
    {status && <><div className="teach-score-grid"><div><strong>{status.indexedExamples}</strong><span>Ready for retrieval</span></div><div><strong>{status.labeledExamples}</strong><span>Labeled portraits</span></div><div><strong>{status.totalExamples}</strong><span>Total portraits</span></div><div><strong>{status.enabled ? 'On' : 'Off'}</strong><span>Public studio memory</span></div></div>
      <button className="teach-button" disabled={busy} onClick={() => void toggle()}>{status.enabled ? 'Turn memory off' : 'Turn memory on'}</button>
      <button className="teach-text-button" onClick={() => void api.download('memory/export','wildlens-trait-vectors.json').catch(onError)}>Export trait vectors</button>
      <p className="teach-help">{status.notice}</p></>}
    <ol><li>Confirm an animal and reasons in Animal choices, or rate features in the advanced teaching editor.</li><li>Use a single-person photo or crop and select the Training split.</li><li>Save. The vector index updates locally; no Meta request is made. Choice feedback uses separately marked AI geometry estimates; manual ratings take precedence.</li><li>With eligible memory, one additional Spark request estimates geometry and compares up to three animal candidates, without seeing your saved examples. Local search finds up to three references per person, at most six for a group. Only these candidates can be adjusted; repeated animal labels earn no extra votes.</li></ol>
    <p>Your teaching photos, labels and free-form notes stay local in this ranking process. New species remain eligible. The weight is a share of the ranking formula, not a probability or a promise that this percentage of results will change. Unknown features stay unknown. No relevant example means the independent result is kept.</p>
    <p>Validation and test examples never enter retrieval. Benchmarks exclude all evaluated groups and exact duplicate image bytes. Keep all photos of the same person in one group.</p>
  </section>;
}
