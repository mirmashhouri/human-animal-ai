import { useEffect, useRef, useState } from 'react';
import * as api from './api';
import type { Example, FeedbackRound } from './types';
import { animalChoices } from './animals';
import { filePhoto } from './photos';

export default function FeedbackStudio({ examples, metaReady, refresh, onDirty, onError, onCrop }: {
  examples: Example[]; metaReady: boolean; refresh: () => Promise<void>; onDirty: (value: boolean) => void;
  onError: (error: unknown) => void; onCrop: (item: Example) => void;
}) {
  const [rounds, setRounds] = useState<FeedbackRound[]>([]);
  const [selected, setSelected] = useState(() => localStorage.getItem('wildlens-feedback-last') ?? '');
  const [queue, setQueue] = useState('pending'); const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false); const [generating, setGenerating] = useState(false);
  const [dirty, setDirty] = useState(false); const [notice, setNotice] = useState('');
  const [verdict, setVerdict] = useState<'agree' | 'disagree' | null>(null);
  const [why, setWhy] = useState(''); const [animal, setAnimal] = useState(''); const [replace, setReplace] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null); const operation = useRef<AbortController | null>(null);
  const portraits = examples.filter(c => !c.archived && Boolean(c.feedbackPack));
  const visible = portraits.filter(c => (queue !== 'pending' || !c.feedback) && (queue !== 'reviewed' || Boolean(c.feedback)) &&
    `${c.personPosition} ${c.acceptedAnimals.join(' ')}`.toLowerCase().includes(search.toLowerCase()));
  const item = visible.find(c => c.caseId === selected) ?? visible[0];
  const round = rounds.find(r => r.caseId === item?.caseId && r.referenceFile === item.reference.file);
  const current = round?.status === 'ready' && round.caseRevision === item?.revision && !round.verdict;
  function markDirty(value: boolean) { setDirty(value); onDirty(value); }
  function resetForm() { setVerdict(null); setWhy(''); setAnimal(''); setReplace(false); markDirty(false); }
  useEffect(() => {
    let active = true; void api.call<FeedbackRound[]>('feedback').then(value => { if (active) setRounds(value); }).catch(onError);
    return () => { active = false; operation.current?.abort(); };
  }, [onError]);
  function select(id: string) {
    if (dirty) { onError(new Error('Save or discard your feedback before switching portraits.')); return; }
    setSelected(id); localStorage.setItem('wildlens-feedback-last', id); resetForm(); setNotice('');
  }
  async function upload(file: File) {
    setBusy(true); setNotice('');
    try {
      const saved = await api.call<Example>('feedback/photos', { imageBase64: await filePhoto(file), title: file.name.replace(/\.[^.]+$/, '').slice(0, 180) });
      await refresh(); select(saved.caseId); setNotice('Photo saved on this computer. Generate when you are ready.');
    } catch (error) { onError(error); } finally { setBusy(false); }
  }
  async function generate() {
    if (!item || busy || !metaReady) return;
    if (dirty) { onError(new Error('Save or discard your feedback before generating again.')); return; }
    setBusy(true); setGenerating(true); setNotice(''); resetForm(); onDirty(true);
    const controller = new AbortController(); operation.current = controller;
    try {
      const generated = await api.call<FeedbackRound>('feedback/generate', { caseId: item.caseId, expectedRevision: item.revision, consent: true }, controller.signal);
      setRounds(previous => [generated, ...previous.filter(r => r.id !== generated.id)]);
      if (generated.status !== 'ready') onError(new Error(generated.error ?? 'Generation did not finish. Your previous feedback is saved.'));
    } catch (error) {
      onError(controller.signal.aborted ? new Error('Generation stopped. Work already accepted by Meta may still be billed; no retry was made.') : error);
      try { setRounds(await api.call<FeedbackRound[]>('feedback')); } catch { /* Preserve the original generation error. */ }
    } finally { operation.current = null; setGenerating(false); setBusy(false); onDirty(false); }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (!item || !round || !verdict) return;
    setBusy(true); setNotice('');
    try {
      await api.call('feedback/review', { roundId: round.id, expectedRevision: item.revision, verdict,
        preferredAnimal: verdict === 'disagree' ? animal : null, explanation: why, replaceExisting: replace });
      await refresh(); setRounds(await api.call<FeedbackRound[]>('feedback')); resetForm();
      const index = portraits.findIndex(c => c.caseId === item.caseId);
      const next = [...portraits.slice(index + 1), ...portraits.slice(0, index)].find(c => !c.feedback);
      if (next) { setSelected(next.caseId); localStorage.setItem('wildlens-feedback-last', next.caseId); }
      setNotice(item.split === 'train' ? 'Saved. Future new portraits can use this feedback immediately.' : 'Saved for evaluation; this portrait remains outside retrieval.');
    } catch (error) { onError(error); } finally { setBusy(false); }
  }
  const source = item?.source && typeof item.source === 'object' ? item.source as Record<string, unknown> : null;
  const safeLink = (url: unknown) => typeof url === 'string' && /^https:\/\/(commons\.wikimedia\.org|creativecommons\.org)\//.test(url) ? url : undefined;
  return <section className="teach-feedback-studio">
    <div className="teach-card"><div className="teach-section-heading"><div><p className="teach-kicker">LEARN FROM THE NEXT RESULT</p><h2>Agree or correct.</h2></div>
      <button className="teach-button secondary" disabled={busy} onClick={() => { if (!dirty) fileInput.current?.click(); else onError(new Error('Save or discard your feedback before uploading another photo.')); }}>Upload a new photo</button></div>
      <input ref={fileInput} hidden type="file" accept="image/jpeg,image/png,image/webp" aria-label="Upload feedback portrait" onChange={event => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = ''; }} />
      <p>Generate one animal portrait using your latest preferences. Agree with it, or explain what differs and choose your preferred animal.</p>
      <div className="teach-inline"><span className="teach-badge">{portraits.filter(c => c.feedback).length} / {portraits.length} reviewed</span>
        <button className="teach-text-button" onClick={() => void api.download('feedback/export', 'wildlens-result-feedback.json').catch(onError)}>Export result history</button></div>
      <p className="teach-help">Generate each result as you review. The next photo can use the feedback just saved. Corrections apply to that person; other portraits remain free to become different animals.</p>
    </div>
    {notice && <p className="teach-success" role="status">{notice}</p>}
    <div className="teach-workspace"><aside className="teach-library"><label>Feedback queue<select aria-label="Feedback queue" value={queue} disabled={busy || dirty} onChange={event => setQueue(event.target.value)}><option value="pending">Not yet reviewed</option><option value="reviewed">Reviewed</option><option value="all">All feedback portraits</option></select></label>
      <label>Find a portrait<input type="search" value={search} disabled={busy || dirty} onChange={event => setSearch(event.target.value)} placeholder="Name or preferred animal" /></label>
      <div className="teach-example-list">{visible.map(c => <button key={c.caseId} className={`teach-example ${item?.caseId === c.caseId ? 'selected' : ''}`} disabled={busy} onClick={() => select(c.caseId)}><img crossOrigin="use-credentials" loading="lazy" src={api.photoUrl(c.reference.file)} alt="" /><strong>{c.personPosition}</strong><span>{c.feedback ? `${c.feedback.verdict === 'agree' ? 'Agreed' : 'Corrected'} · ${c.feedback.preferredAnimal}` : 'Ready to generate'}</span><small>{c.split}</small></button>)}</div>
    </aside><div className="teach-card">{item ? <><div className="teach-section-heading"><h2>{item.personPosition}</h2><div className="teach-inline"><button className="teach-text-button" disabled={busy} onClick={() => { if (!dirty) onCrop(item); }}>Crop this photo</button>
      <button className="teach-text-button" disabled={busy} onClick={() => { const next = visible[visible.findIndex(c => c.caseId === item.caseId) + 1]; if (next) select(next.caseId); }}>Skip →</button></div></div>
      <div className="teach-feedback-comparison"><figure><img crossOrigin="use-credentials" src={api.photoUrl(item.reference.file)} alt="Original feedback portrait" /><figcaption>Original</figcaption></figure>
        <figure>{round?.artworkFile ? <img crossOrigin="use-credentials" src={api.feedbackArtworkUrl(round.artworkFile)} alt="Generated feedback animal portrait" /> : <div className="teach-feedback-placeholder">{generating ? 'Creating your animal portrait…' : 'Your animal portrait will appear here.'}</div>}<figcaption>{round?.analysis?.animalName ?? 'Animal portrait'}</figcaption></figure></div>
      {round?.analysis && <p className="teach-feedback-reason">{round.analysis.animalReason}</p>}
      {round?.error && <p className="teach-error" role="status">{round.error}</p>}
      {item.feedback && <p className="teach-success">Saved: {item.feedback.verdict === 'agree' ? 'Agree' : 'Disagree'} · {item.feedback.preferredAnimal}{item.feedback.explanation ? ` — ${item.feedback.explanation}` : ''}</p>}
      <div className="teach-inline"><button className="teach-button" disabled={busy || !metaReady || dirty} onClick={() => void generate()}>{generating ? 'Generating…' : round ? 'Generate again with latest context' : 'Generate my animal'}</button>
        {generating && <button className="teach-button secondary" onClick={() => operation.current?.abort()}>Stop generation</button>}</div>
      <p className="teach-help">By generating, you confirm permission to send this portrait and relevant teaching photos/notes to Meta for paid analysis and image generation. Only one clear person is supported here. No automatic retries.</p>
      {current && <form onSubmit={event => void save(event)} className="teach-feedback-form"><fieldset disabled={busy} className="teach-fieldset"><legend>Your feedback</legend>
        <div className="teach-feedback-verdicts">{(['agree', 'disagree'] as const).map(value => <label key={value} className={`teach-feedback-verdict ${verdict === value ? 'selected' : ''}`}><input type="radio" name="result-feedback" checked={verdict === value} onChange={() => { setVerdict(value); markDirty(true); }} /><span>{value === 'agree' ? 'Agree' : 'Disagree'}</span></label>)}</div>
        {verdict && <><label>{verdict === 'disagree' ? 'Why do you disagree?' : 'Why it fits (optional)'}<textarea aria-label="Feedback explanation" required={verdict === 'disagree'} maxLength={500} rows={3} value={why} onChange={event => { setWhy(event.target.value); markDirty(true); }} placeholder={verdict === 'disagree' ? 'Long face and visible teeth; the round bear face changes the proportions.' : 'Optional: what the result got right'} /></label>
          {verdict === 'disagree' && <label>My preferred animal<input aria-label="Preferred feedback animal" required list="feedback-animal-names" maxLength={80} value={animal} onChange={event => { setAnimal(event.target.value); markDirty(true); }} placeholder="Search or type your animal" /><datalist id="feedback-animal-names">{animalChoices.map(([name, fa]) => <option value={name} key={name}>{fa}</option>)}</datalist></label>}
          {item.acceptedAnimals.length > 0 && <label className="teach-checkbox"><input type="checkbox" checked={replace} onChange={event => setReplace(event.target.checked)} />Replace this portrait’s existing animal judgment</label>}
          <button className="teach-button" disabled={busy || (verdict === 'disagree' && (!why.trim() || !animal.trim())) || (item.acceptedAnimals.length > 0 && !replace)}>Save feedback & next →</button></>}
        {dirty && <button className="teach-text-button" type="button" onClick={resetForm}>Discard feedback</button>}
      </fieldset></form>}
      {source && <details className="teach-details teach-credit"><summary>Photo source & license</summary><p>{String(source.author ?? '')} · <a href={safeLink(source.licenseUrl)} target="_blank" rel="noreferrer">{String(source.license ?? '')}</a></p><a href={safeLink(source.sourcePage)} target="_blank" rel="noreferrer">Wikimedia source ↗</a></details>}
    </> : <div className="teach-empty"><h2>{portraits.length ? 'No portraits in this queue.' : 'Your next teaching round starts here.'}</h2><p>{portraits.length ? 'Switch the queue to review saved feedback, or upload a new portrait.' : 'Upload a single-person photo to begin.'}</p></div>}</div></div>
  </section>;
}
