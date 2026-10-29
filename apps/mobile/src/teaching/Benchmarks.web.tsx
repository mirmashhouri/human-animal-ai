import { useEffect, useRef, useState } from 'react';
import * as api from './api';
import type { Comparison, Example, Metrics, Prediction, Run } from './types';

const percent = (value: number | null) => value === null ? '—' : `${(value * 100).toFixed(1)}%`;
function Scores({ metrics }: { metrics: Metrics }) {
  return <div className="teach-score-grid"><div><strong>{percent(metrics.top1Agreement)}</strong><span>First choice accepted · {metrics.top1Hits}/{metrics.cases}</span></div><div><strong>{percent(metrics.top3Agreement)}</strong><span>Accepted in top 3 · {metrics.top3Hits}/{metrics.cases}</span></div><div><strong>{metrics.covered}/{metrics.cases}</strong><span>Prediction coverage · {metrics.groups} related groups</span></div><div><strong>{metrics.rejectedChoices}</strong><span>Explicitly rejected first choices</span></div></div>;
}
export default function Benchmarks({ examples, metaReady, onError }: { examples: Example[]; metaReady: boolean; onError: (error: unknown) => void }) {
  const active = examples.filter(c => !c.archived && c.acceptedAnimals.length > 0);
  const [selected, setSelected] = useState(active.map(c => c.caseId));
  const [split, setSplit] = useState('all');
  const [history, setHistory] = useState<Run[]>([]);
  const [name, setName] = useState('My matcher comparison');
  const [version, setVersion] = useState('external-v1');
  const [predictions, setPredictions] = useState('');
  const [consent, setConsent] = useState(false);
  const [useMemory, setUseMemory] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [viewId, setViewId] = useState('');
  const [leftId, setLeftId] = useState(''); const [rightId, setRightId] = useState('');
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const operation = useRef<AbortController | null>(null);
  const a = leftId || history[0]?.id || '', b = rightId || history[1]?.id || '';
  const current = history.find(r => r.id === viewId) ?? history[0];
  async function refresh() { setHistory(await api.runs()); }
  useEffect(() => { let mounted = true; void api.runs().then(runs => { if (mounted) setHistory(runs); }).catch(onError); return () => { mounted = false; operation.current?.abort(); }; }, []);
  useEffect(() => {
    let mounted = true; setComparison(null);
    if (a && b && a !== b) void api.compare(a, b).then(result => { if (mounted) setComparison(result); }).catch(error => { if (mounted) onError(error); });
    return () => { mounted = false; };
  }, [a, b]);
  const displayed = active.filter(c => split === 'all' || c.split === split);
  const chosen = active.filter(c => selected.includes(c.caseId));
  async function importPredictions() {
    setBusy(true); setNotice('');
    try {
      const parsed: unknown = JSON.parse(predictions);
      const values = Array.isArray(parsed) ? parsed : parsed && typeof parsed === 'object' && 'predictions' in parsed ? parsed.predictions : null;
      if (!Array.isArray(values)) throw new Error('Import a JSON array of {caseId, animals} predictions.');
      const run = await api.importRun(name, version, chosen.map(c => c.caseId), values as Prediction[]);
      await refresh(); setViewId(run.id); setNotice('Imported predictions and froze the current labels. No model calls made.');
    } catch (error) { onError(error); } finally { setBusy(false); }
  }
  async function runMatcher() {
    const controller = new AbortController(); operation.current = controller; setBusy(true); setNotice('');
    try {
      const run = await api.runCurrent(name, chosen.map(c => c.caseId), consent, controller.signal, useMemory);
      await refresh(); setViewId(run.id); setNotice('Selection benchmark saved. No images were generated.');
    } catch (error) {
      if (controller.signal.aborted) setNotice('Stopped. Refresh runs to see the partial result. Model requests already accepted may still be billed.');
      else onError(error);
    } finally { operation.current = null; setBusy(false); }
  }
  const liveEligible = metaReady && consent && chosen.length > 0 && chosen.length <= 5 && chosen.every(c => c.reference.personOnly);
  return <div className="teach-benchmarks">
    <section className="teach-card"><p className="teach-kicker">MEASURE YOUR OWN STANDARD</p><h2>Comparison benchmark</h2><p>Compare animal choices with your accepted alternatives. Each saved run keeps a snapshot of its labels, split and model version.</p>
      <p className="teach-help">Names match after case/spacing normalization. Include acceptable species-name variants in your labels. Missing or failed predictions count as misses. Current matcher runs return one choice, so their top-3 score equals top-1.</p>
      <div className="teach-two-columns"><label>Run name<input maxLength={120} value={name} onChange={event => setName(event.target.value)} /></label><label>Show split<select aria-label="Show split" value={split} onChange={event => setSplit(event.target.value)}><option value="all">All labeled examples</option><option value="train">Training</option><option value="validation">Validation</option><option value="test">Test / held out</option><option value="unassigned">Unassigned</option></select></label></div>
      <p className="teach-help">A held-out split measures generalization. Training or unassigned examples are calibration checks; related people/photos should stay in one group.</p>
      <div className="teach-inline"><button className="teach-button secondary" disabled={busy} onClick={() => setSelected(displayed.map(c => c.caseId))}>Select displayed</button><button className="teach-text-button" disabled={busy} onClick={() => setSelected([])}>Clear selection</button><span>{chosen.length} selected · {new Set(chosen.map(c => c.groupId)).size} groups</span></div>
      <div className="teach-case-scope">{displayed.map(item => <label className="teach-checkbox" key={item.caseId}><input type="checkbox" disabled={busy} checked={selected.includes(item.caseId)} onChange={event => setSelected(ids => event.target.checked ? [...ids, item.caseId] : ids.filter(id => id !== item.caseId))} /><span><strong>{item.personPosition}</strong><small>{item.caseId} · {item.split} · {item.reference.personOnly ? 'Subject ready' : 'Crop needed for Meta'}</small></span></label>)}{displayed.length === 0 && <p>No labeled examples in this split.</p>}</div>
      <details className="teach-details" open><summary>Import predictions · no model calls</summary>
        <label>Prediction version<input value={version} maxLength={180} onChange={event => setVersion(event.target.value)} /></label>
        <label>Predictions JSON<textarea aria-label="Predictions JSON" rows={7} value={predictions} onChange={event => setPredictions(event.target.value)} placeholder={'[{"caseId":"your-case-id","animals":["horse","bear"]}]'} /></label>
        <div className="teach-inline"><button className="teach-button secondary" disabled={busy || chosen.length === 0} onClick={() => setPredictions(JSON.stringify(chosen.map(c => ({ caseId: c.caseId, animals: [] })), null, 2))}>Use selected case template</button>
          <label className="teach-file-label">Load JSON<input type="file" accept=".json,application/json" disabled={busy} onChange={event => {
            const file = event.target.files?.[0]; if (!file) return;
            if (file.size > 2 * 1024 * 1024) { onError(new Error('Choose a prediction file under 2 MB.')); return; }
            void file.text().then(setPredictions).catch(onError); event.target.value = '';
          }} /></label><button className="teach-button" disabled={busy || chosen.length === 0 || !predictions.trim() || !name.trim() || !version.trim()} onClick={() => void importPredictions()}>Save imported run</button></div>
      </details>
      <details className="teach-details"><summary>Run the current matcher · uses Meta credits</summary>
        <label>Matcher version<select aria-label="Matcher version" value={useMemory ? 'memory' : 'original'} disabled={busy} onChange={event => setUseMemory(event.target.value === 'memory')}><option value="original">Original matcher · no teaching context</option><option value="memory">Personalized · your training examples (RAG)</option></select></label>
        <p>Up to five examples per run. Original: one Spark selection request per crop. Personalized: an additional geometry request when eligible memory exists, plus selected training examples. No SAM, generated artwork or automatic retries. Evaluation labels and related groups are excluded from teaching context.</p>
        <label className="teach-checkbox"><input type="checkbox" checked={consent} disabled={busy} onChange={event => setConsent(event.target.checked)} />I have permission to send these crops to Meta and use API credits for this benchmark.</label>
        {!metaReady && <p className="teach-help">Meta access must be configured before a live benchmark.</p>}
        {chosen.some(c => !c.reference.personOnly) && <p className="teach-help">Select each person’s crop in Teach, or mark a single-person photo, before running Meta.</p>}
        <button className="teach-button" disabled={busy || !liveEligible || !name.trim()} onClick={() => void runMatcher()}>Run current matcher</button>
        {busy && operation.current && <button className="teach-button secondary" onClick={() => operation.current?.abort()}>Stop benchmark</button>}
      </details>
      {notice && <p role="status" className="teach-success">{notice}</p>}
    </section>
    <section className="teach-card"><div className="teach-section-heading"><h2>Saved runs</h2><button className="teach-text-button" onClick={() => void refresh().catch(onError)}>Refresh runs</button></div>
      {history.length === 0 ? <p>Import a prediction run or run the current matcher to establish your baseline.</p> : <>
        <label>Inspect a run<select aria-label="Inspect a run" value={current?.id ?? ''} onChange={event => setViewId(event.target.value)}>{history.map(run => <option key={run.id} value={run.id}>{run.name} · {run.version}</option>)}</select></label>
        {current && <><p className="teach-help">{current.source} · {current.version} · {current.status} · {new Date(current.createdAt).toLocaleString()}<br />Label snapshot: {current.datasetHash.slice(0, 12)}</p><Scores metrics={current.metrics} />
          <div className="teach-table-wrap"><table><thead><tr><th>Case</th><th>Accepted labels at run time</th><th>Predictions</th></tr></thead><tbody>{current.cases.map(item => {
            const predicted = current.predictions.find(p => p.caseId === item.caseId);
            return <tr key={item.caseId}><td>{item.caseId}<small>{item.split}</small></td><td>{item.acceptedAnimals.join(' / ')}</td><td>{predicted?.error ?? (predicted?.animals.length ? predicted.animals.join(' → ') : 'Missing prediction')}{predicted?.evidence && <small>{predicted.evidence.length ? `Memory: ${predicted.evidence.map(e => `${e.caseId} (revision ${e.revision})`).join(', ')}` : 'No teaching examples used'}</small>}</td></tr>;
          })}</tbody></table></div><button className="teach-text-button" onClick={() => void api.download(`runs/${current.id}/export`, 'wildlens-benchmark.json').catch(onError)}>Download run snapshot</button></>}
        <hr /><h3>Compare two versions</h3><div className="teach-two-columns"><label>Run A<select aria-label="Run A" value={a} onChange={event => setLeftId(event.target.value)}>{history.map(run => <option key={run.id} value={run.id}>{run.name} · {run.version}</option>)}</select></label>
          <label>Run B<select aria-label="Run B" value={b} onChange={event => setRightId(event.target.value)}><option value="">Choose another run</option>{history.map(run => <option key={run.id} value={run.id}>{run.name} · {run.version}</option>)}</select></label></div>
        {a === b && <p>Choose two different runs.</p>}
        {comparison && <div className="teach-comparison" aria-live="polite"><p>{comparison.comparableCases} comparable examples · {comparison.excludedCases} excluded because coverage, labels or splits differ.</p>
          <div className="teach-two-columns"><div><h3>A · {percent(comparison.a.top1Agreement)}</h3><p>{comparison.a.top1Hits}/{comparison.a.cases} first choices accepted</p></div><div><h3>B · {percent(comparison.b.top1Agreement)}</h3><p>{comparison.b.top1Hits}/{comparison.b.cases} first choices accepted</p></div></div>
          <strong>Change: {comparison.top1Delta === null ? 'No comparable data' : `${comparison.top1Delta >= 0 ? '+' : ''}${(comparison.top1Delta * 100).toFixed(1)} percentage points`}</strong>
          <p className="teach-help">Comparison uses only common cases with identical frozen accepted/rejected labels, group and split. Small samples are a calibration signal, not an accuracy guarantee.</p></div>}
      </>}
    </section>
  </div>;
}
