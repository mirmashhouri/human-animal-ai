import { useEffect, useState } from 'react';
import * as api from './api';
import type { Example, PortraitSuggestions, SuggestionJob, SuggestionLibrary } from './types';
import { animalChoices } from './animals';
const isRefusal = (code: string) => /policy|content_filter|content_rejected|moderation/i.test(code);

function ReviewChoices({ item, proposal, onSaved, onDirty, onError }: {
  item: Example; proposal: PortraitSuggestions; onSaved: () => Promise<void>; onDirty: (value: boolean) => void; onError: (error: unknown) => void;
}) {
  const [choice, setChoice] = useState<number | null>(null); const [custom, setCustom] = useState('');
  const [reasons, setReasons] = useState(''); const [replace, setReplace] = useState(false); const [busy, setBusy] = useState(false);
  const [loadedArtworks, setLoadedArtworks] = useState<Set<string>>(() => new Set());
  function choose(index: number) { const candidate = proposal.candidates[index]; setChoice(index); setReasons(index === 3 ? '' : (candidate?.phrases ?? candidate?.reasons ?? []).join('\n')); onDirty(true); }
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (choice === null) return; setBusy(true);
    try {
      await api.call('suggestions/review', { caseId: item.caseId, proposalId: proposal.id, expectedRevision: item.revision,
        choice: choice === 3 ? null : choice, customAnimal: choice === 3 ? custom : null,
        reasons: reasons.split('\n').map(r => r.trim()).filter(Boolean), replaceExisting: replace,
        viewedArtworks: proposal.artworks?.filter(a => loadedArtworks.has(a.file)).map(a => a.file) ?? [] });
      onDirty(false); await onSaved();
    } catch (error) { onError(error); } finally { setBusy(false); }
  }
  return <form onSubmit={event => void save(event)} className="teach-choice-form">
    <fieldset disabled={busy} className="teach-fieldset"><legend className="teach-kicker">THREE IDEAS. YOUR DECISION.</legend>
      <div className="teach-choice-grid with-artworks" role="radiogroup" aria-label="Animal interpretation">
        {proposal.candidates.map((candidate, index) => <label key={candidate.animal} className={`teach-choice ${choice === index ? 'selected' : ''}`}>
          <span className="teach-choice-title"><input type="radio" name="animal-choice" checked={choice === index} onChange={() => choose(index)} /><strong>{candidate.animal}</strong></span>
          {proposal.artworks?.find(a => a.choice === index) ? <img className="teach-animal-artwork" crossOrigin="use-credentials" src={api.artworkUrl(proposal.artworks.find(a => a.choice === index)!.file)} alt={`${candidate.animal} animal portrait`}
            onLoad={() => { const file = proposal.artworks!.find(a => a.choice === index)!.file; setLoadedArtworks(previous => new Set(previous).add(file)); }} /> : <div className="teach-artwork-pending" role="img" aria-label={`${candidate.animal} portrait not yet generated`}>{proposal.artworkFailures?.some(f => f.choice === index) ? 'Meta couldn’t generate this option. You can still choose another animal.' : 'Animal portrait preparing…'}</div>}
          {candidate.phrases ? <ol className="teach-reason-phrases">{candidate.phrases.map((reason, n) => <li key={n}>{reason}</li>)}</ol> : candidate.reasons.every(r => r.length <= 60 && r.split(/\s+/).length <= 6) ? <ol className="teach-reason-phrases">{candidate.reasons.map((reason, n) => <li key={n}>{reason}</li>)}</ol> : <small>Short reasons preparing…</small>}<small>Meta-generated comparison</small>
        </label>)}
        <label className={`teach-choice teach-custom-choice ${choice === 3 ? 'selected' : ''}`}>
          <span className="teach-choice-title"><input type="radio" name="animal-choice" checked={choice === 3} onChange={() => choose(3)} /><strong>My own animal</strong></span>
          <span>Choose a different interpretation and explain what you see.</span>
        </label>
      </div>
      {choice === 3 && <label>My animal<input required aria-label="My animal" list="teach-choice-animals" maxLength={80} value={custom} onChange={event => { setCustom(event.target.value); onDirty(true); }} placeholder="Search or write an animal · حیوان" autoFocus />
        <datalist id="teach-choice-animals">{animalChoices.map(([name, fa]) => <option key={name} value={name}>{fa}</option>)}</datalist></label>}
      {choice !== null && <label>Your reasons<textarea aria-label="Your choice reasons" required rows={3} maxLength={1502} value={reasons}
        placeholder={'Long neck\nRound eyes\nWide smile'} onChange={event => { setReasons(event.target.value); onDirty(true); }} /><span className="teach-help">One to three short phrases. Edit or add your own.</span></label>}
      {item.acceptedAnimals.length > 0 && <label className="teach-checkbox"><input type="checkbox" checked={replace} onChange={event => setReplace(event.target.checked)} />Replace existing choice ({item.acceptedAnimals.join(' / ')}) and reasons for this portrait</label>}
      <div className="teach-save-bar"><button className="teach-button" disabled={choice === null || !reasons.trim() || (choice === 3 && !custom.trim()) || (item.acceptedAnimals.length > 0 && !replace)}>{busy ? 'Saving…' : 'Confirm & next →'}</button>
        <span className="teach-help">Only your confirmed animal and reasons enter preferences. The other suggestions remain alternatives shown, not rejected labels.</span></div>
      <details className="teach-details"><summary>AI geometry used for retrieval</summary><p className="teach-help">These are AI estimates, separate from your manual feature ratings. They only enter memory after you confirm a choice. Manual ratings take precedence. Unknown stays unknown.</p>
        <div className="teach-table-wrap"><table><thead><tr><th>Feature</th><th>Estimate −5…+5</th></tr></thead><tbody>{proposal.profile.features.map(f => <tr key={f.key}><td>{f.key.replaceAll('_', ' ')}</td><td>{f.value ?? 'Unknown'}</td></tr>)}</tbody></table></div></details>
    </fieldset>
  </form>;
}

export default function ChoiceStudio({ examples, metaReady, refresh, onDirty, onError }: {
  examples: Example[]; metaReady: boolean; refresh: () => Promise<void>; onDirty: (value: boolean) => void; onError: (error: unknown) => void;
}) {
  const [library, setLibrary] = useState<SuggestionLibrary>({ proposals: [], jobs: [], version: '' });
  const [caseId, setCaseId] = useState(() => localStorage.getItem('wildlens-choice-last') ?? '');
  const [filter, setFilter] = useState('pending'); const [consent, setConsent] = useState(false); const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false); const [notice, setNotice] = useState('');
  const [epoch, setEpoch] = useState(0);
  const [collection, setCollection] = useState('starter');
  const hasStarters = examples.some(c => c.starterPack);
  const portraits = examples.filter(c => !c.archived && c.reference.personOnly && (collection === 'all' || !hasStarters || c.starterPack));
  const pending = portraits.filter(c => !c.preference);
  const visible = filter === 'pending' ? pending : portraits;
  const item = portraits.find(c => c.caseId === caseId) ?? visible[0] ?? portraits[0];
  const proposal = library.proposals.find(p => p.caseId === item?.caseId && p.referenceFile === item.reference.file);
  const active = library.jobs.find(j => ['queued', 'running'].includes(j.status));
  const latest = active ?? library.jobs[0];
  const readyCount = portraits.filter(c => library.proposals.some(p => p.caseId === c.caseId && p.referenceFile === c.reference.file)).length;
  const missing = portraits.filter(c => !library.proposals.some(p => p.caseId === c.caseId && p.referenceFile === c.reference.file));
  const artworkCount = portraits.reduce((count, c) => count + (library.proposals.find(p => p.caseId === c.caseId && p.referenceFile === c.reference.file)?.artworks?.length ?? 0), 0);
  const unavailableCount = portraits.reduce((count, c) => count + (library.proposals.find(p => p.caseId === c.caseId && p.referenceFile === c.reference.file)?.artworkFailures?.length ?? 0), 0);
  const artworkMissing = portraits.filter(c => library.proposals.some(p => p.caseId === c.caseId && p.referenceFile === c.reference.file &&
    p.candidates.some((_, index) => !p.artworks?.some(a => a.choice === index) && !p.artworkFailures?.some(f => f.choice === index && isRefusal(f.code)))));
  const imagesToGenerate = artworkMissing.slice(0, 100).reduce((count, c) => {
    const p = library.proposals.find(p => p.caseId === c.caseId)!;
    return count + p.candidates.filter((_, index) => !p.artworks?.some(a => a.choice === index) && !p.artworkFailures?.some(f => f.choice === index && isRefusal(f.code))).length;
  }, 0);
  const phrasesReady = portraits.filter(c => library.proposals.some(p => p.caseId === c.caseId && p.candidates.every(a => a.phrases?.length === 3))).length;
  useEffect(() => {
    let mounted = true; let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try { const data = await api.call<SuggestionLibrary>('suggestions'); if (mounted) setLibrary(data); }
      catch (error) { if (mounted) onError(error); }
      finally { if (mounted) timer = setTimeout(() => void load(), 2500); }
    }
    void load(); return () => { mounted = false; clearTimeout(timer); };
  }, [onError]);
  function markDirty(value: boolean) { setDirty(value); onDirty(value); }
  function select(id: string) {
    if (dirty) { onError(new Error('Confirm or discard your choice before switching portraits.')); return; }
    setCaseId(id); localStorage.setItem('wildlens-choice-last', id); setNotice('');
  }
  async function start(ids: string[], artworks = false) {
    if (!consent || !ids.length) return; setBusy(true); setNotice('');
    try { await api.call<SuggestionJob>('suggestions/start', { caseIds: ids, consent, artworks }); setLibrary(await api.call<SuggestionLibrary>('suggestions')); }
    catch (error) { onError(error); } finally { setBusy(false); }
  }
  async function saved() {
    await refresh(); setNotice('Choice saved locally. Training examples are available to Memory immediately.');
    const index = portraits.findIndex(c => c.caseId === item?.caseId);
    const next = [...portraits.slice(index + 1), ...portraits.slice(0, index)].find(c => !c.preference && library.proposals.some(p => p.caseId === c.caseId && p.referenceFile === c.reference.file));
    if (next) { setCaseId(next.caseId); localStorage.setItem('wildlens-choice-last', next.caseId); }
  }
  return <section className="teach-choices">
    <div className="teach-card"><p className="teach-kicker">CHOOSE, CORRECT, CONTINUE</p><h2>Teach by choosing.</h2><p>Compare three finished animal portraits with your original. Pick one, edit the short reasons, or choose your own animal.</p>
      <div className="teach-inline"><span className="teach-badge">{artworkCount} / {portraits.length * 3} animal portraits ready</span>{unavailableCount > 0 && <span className="teach-badge">{unavailableCount} unavailable from Meta</span>}<span className="teach-badge">{portraits.length - pending.length} confirmed</span></div>
      <details className="teach-details" open={readyCount === 0}><summary>Prepare animal portraits</summary>
        <p className="teach-help">Three Meta image edits per photo, using the original reference and the main studio’s portrait style. Completed images are saved and reused. Existing labels stay unchanged until you confirm a choice. Stop or restart without losing completed work.</p>
        <label className="teach-checkbox"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} />Send portraits to Meta for paid suggestions and animal image generation. Up to 100 photos / 300 images per batch.</label>
        <div className="teach-inline"><button className="teach-button" disabled={!metaReady || !consent || busy || Boolean(active) || missing.length === 0} onClick={() => void start(missing.slice(0, 100).map(c => c.caseId))}>{missing.length === 0 ? 'All suggestions ready' : readyCount ? `Prepare next ${Math.min(100, missing.length)} missing` : `Prepare ${Math.min(100, missing.length)} portraits`}</button>
          {item && !proposal && <button className="teach-button secondary" disabled={!metaReady || !consent || busy || Boolean(active)} onClick={() => void start([item.caseId])}>Prepare this portrait</button>}
          <button className="teach-button" disabled={!metaReady || !consent || busy || Boolean(active) || artworkMissing.length === 0} onClick={() => void start(artworkMissing.slice(0, 100).map(c => c.caseId), true)}>{artworkMissing.length === 0 ? 'All available portraits ready' : `Generate ${imagesToGenerate} animal portraits`}</button>
          {active && <button className="teach-button secondary" onClick={() => void api.call('suggestions/stop', { id: active.id }).catch(onError)}>Stop batch</button>}
          <button className="teach-text-button" onClick={() => void api.download('suggestions/export', 'wildlens-animal-choice-drafts.json').catch(onError)}>Export suggestions</button></div>
        {!metaReady && <p className="teach-help">Meta access is not ready. You can still review saved suggestions.</p>}
      </details>
      {latest && <div role="status" className="teach-batch-status"><strong>Batch {latest.status}</strong> · {latest.kind === 'artworks' ? `${artworkCount} animal portraits · ${phrasesReady} photos with short reasons` : `${latest.items.filter(i => i.state === 'complete').length} / ${latest.items.length} suggestions ready`}
        {latest.items.some(i => ['failed', 'interrupted', 'partial'].includes(i.state)) && <p>{latest.items.find(i => i.error)?.error} Completed work is saved; no automatic retries.</p>}</div>}
      <p className="teach-help">Training choices guide new requests when Memory is on. Validation/test choices remain excluded from retrieval. This is AI-assisted preference collection; use a separate blind set for a final accuracy benchmark.</p>
    </div>
    {notice && <p className="teach-success" role="status">{notice}</p>}
    <div className="teach-workspace"><aside className="teach-library">{hasStarters && <label>Portrait collection<select value={collection} onChange={event => { if (!dirty) setCollection(event.target.value); }}><option value="starter">Starter portraits</option><option value="all">All single-person photos</option></select></label>}<label>Choice queue<select value={filter} onChange={event => { if (!dirty) setFilter(event.target.value); }}><option value="pending">Not yet confirmed</option><option value="all">All portraits</option></select></label>
      <div className="teach-example-list">{visible.map(c => <button key={c.caseId} className={`teach-example ${item?.caseId === c.caseId ? 'selected' : ''}`} onClick={() => select(c.caseId)}><img crossOrigin="use-credentials" loading="lazy" src={api.photoUrl(c.reference.file)} alt="" /><strong>{c.personPosition}</strong><span>{c.preference?.animal ?? 'Your choice pending'}</span><small>{c.split} · {library.proposals.some(p => p.caseId === c.caseId && p.referenceFile === c.reference.file) ? '3 ideas ready' : 'Not prepared'}</small></button>)}</div>
    </aside><div className="teach-card">{item ? <><div className="teach-section-heading"><h2>{item.personPosition}</h2><button className="teach-text-button" onClick={() => { const next = visible[visible.findIndex(c => c.caseId === item.caseId) + 1]; if (next) select(next.caseId); }}>Skip →</button></div>
      {item.preference && <p className="teach-success">Saved choice: {item.preference.animal}</p>}
      <div className="teach-choice-layout"><div className="teach-choice-portrait"><img crossOrigin="use-credentials" src={api.photoUrl(item.reference.file)} alt="Portrait to choose an animal for" /><span className="teach-help">{item.split} · your original portrait</span></div>
        <div>{proposal ? <ReviewChoices key={`${item.caseId}:${item.revision}:${proposal.id}:${epoch}`} item={item} proposal={proposal} onSaved={saved} onDirty={markDirty} onError={onError} /> : <p>Suggestions aren’t ready for this portrait yet. Prepare them above, then choose your interpretation here.</p>}</div></div>
      {dirty && <button className="teach-text-button" onClick={() => { markDirty(false); setEpoch(n => n + 1); setNotice('Draft choice discarded.'); }}>Discard choice</button>}
    </> : <p>No single-person portraits available. Add or crop photos in the feature editor.</p>}</div></div>
  </section>;
}
