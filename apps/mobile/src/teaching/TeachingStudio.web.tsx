import { useCallback, useEffect, useRef, useState } from 'react';
import * as api from './api';
import type { Example, Status } from './types';
import { filePhoto } from './photos';
import CaseEditor from './CaseEditor.web';
import Benchmarks from './Benchmarks.web';
import MemoryPanel from './MemoryPanel.web';
import ChoiceStudio from './ChoiceStudio.web';
import FeedbackStudio from './FeedbackStudio.web';
import './teaching.css';

function emptyExample(file: string, groupId?: string): Example {
  return { caseId: '', groupId: groupId ?? `photo-${file.split('/').at(-1)?.replace('.jpg', '')}`, personPosition: '', reference: { file, personOnly: false },
    acceptedAnimals: [], rejectedAnimals: [], selectionCues: [], creativeMappings: [], creativeNotes: '', confidence: 'unspecified', split: 'train', traits: [], traitScale: 5, salientFeatures: [], appearance: {}, archived: false, revision: 0 };
}
export default function TeachingStudio() {
  const [status, setStatus] = useState<Status | null>(null);
  const [examples, setExamples] = useState<Example[]>([]);
  const [selected, setSelected] = useState<Example | null>(null);
  const [tab, setTab] = useState<'feedback' | 'choices' | 'teach' | 'benchmark' | 'memory'>('feedback');
  const [password, setPassword] = useState(''); const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [dirty, setDirty] = useState(false); const [epoch, setEpoch] = useState(0);
  const [search, setSearch] = useState(''); const [showArchived, setShowArchived] = useState(false);
  const [queue, setQueue] = useState('all');
  const fileInput = useRef<HTMLInputElement>(null);
  const report = useCallback((error: unknown) => {
    setError(error instanceof Error ? error.message : String(error));
    if (error instanceof api.StudioError && error.status === 401) setStatus(previous => previous ? { ...previous, authenticated: false } : previous);
  }, []);
  useEffect(() => { let mounted = true; void api.status().then(value => { if (mounted) setStatus(value); }).catch(report); return () => { mounted = false; }; }, []);
  useEffect(() => {
    let mounted = true;
    if (status?.authenticated) void api.cases().then(result => { if (mounted) {
      setExamples(result.cases); const last = localStorage.getItem('wildlens-teaching-last-case');
      setSelected(result.cases.find(c => c.caseId === last && !c.archived) ?? result.cases.find(c => !c.archived && c.acceptedAnimals.length === 0) ?? result.cases.find(c => !c.archived) ?? null);
    } }).catch(report);
    return () => { mounted = false; };
  }, [status?.authenticated]);
  async function signIn(event: React.FormEvent) {
    event.preventDefault(); setError('');
    if (!status?.configured && password !== confirmation) { setError('The passwords do not match.'); return; }
    setBusy(true);
    try { await api.call(status?.configured ? 'login' : 'setup', { password }); setPassword(''); setConfirmation(''); setStatus(await api.status()); }
    catch (error) { report(error); } finally { setBusy(false); }
  }
  function canLeave() { if (!dirty) return true; setError('Save or discard your changes before switching examples or tabs.'); return false; }
  function select(item: Example) { if (!canLeave()) return; setSelected(item); localStorage.setItem('wildlens-teaching-last-case',item.caseId); setError(''); setNotice(''); }
  function move(direction: number) {
    if (!selected || !canLeave()) return;
    const list = examples.filter(c => !c.archived); const index = list.findIndex(c => c.caseId === selected.caseId);
    const next = list[index + direction]; if (next) select(next);
  }
  useEffect(() => {
    function warn(event: BeforeUnloadEvent) { if (dirty) event.preventDefault(); }
    window.addEventListener('beforeunload',warn); return () => window.removeEventListener('beforeunload',warn);
  }, [dirty]);
  async function upload(file: File) {
    setBusy(true); setError(''); setNotice('');
    try { const result = await api.upload(await filePhoto(file)); setSelected(emptyExample(result.file)); setDirty(true); setEpoch(n => n + 1); }
    catch (error) { report(error); } finally { setBusy(false); }
  }
  async function save(item: Example, advance = false) {
    setBusy(true); setError(''); setNotice('');
    try {
      const saved = await api.save(item); const result = await api.cases(); setExamples(result.cases);
      const index = result.cases.findIndex(c => c.caseId === saved.caseId);
      const pending = [...result.cases.slice(index + 1), ...result.cases.slice(0,index)].filter(c => !c.archived && c.acceptedAnimals.length === 0);
      const next = advance ? pending[0] ?? saved : saved;
      setSelected(next); localStorage.setItem('wildlens-teaching-last-case',next.caseId); setDirty(false); setEpoch(n => n + 1);
      if (advance) requestAnimationFrame(() => document.getElementById('teach-active-portrait')?.scrollIntoView({ block: 'start' }));
      setNotice(advance && next === saved ? 'Saved. All active portraits have labels.' : 'Saved locally. Your vector index is up to date.');
    }
    catch (error) { report(error); } finally { setBusy(false); }
  }
  async function discard() {
    setBusy(true); setError('');
    try {
      const result = await api.cases(); setExamples(result.cases);
      setSelected(result.cases.find(c => c.caseId === selected?.caseId) ?? result.cases.find(c => !c.archived) ?? null);
      setDirty(false); setEpoch(n => n + 1);
    } catch (error) { report(error); } finally { setBusy(false); }
  }
  const visible = examples.filter(c => (showArchived || !c.archived) && (queue !== 'pending' || c.acceptedAnimals.length === 0) && (queue !== 'labeled' || c.acceptedAnimals.length > 0) && `${c.personPosition} ${c.caseId} ${c.acceptedAnimals.join(' ')} ${c.groupId}`.toLowerCase().includes(search.toLowerCase()));
  const active = examples.filter(c => !c.archived);
  return <main className={`teach-root${['choices', 'feedback'].includes(tab) && status?.authenticated ? ' teach-visual-mode' : ''}`}><div className="teach-shell">
    <header className="teach-header"><a className="teach-brand" href="/">WildLens<span>.</span></a><div className="teach-inline"><span className="teach-badge">Local · private</span>{status?.authenticated && <button className="teach-text-button" onClick={() => {
      if (!canLeave()) return;
      void api.call('logout', {}).then(() => { setExamples([]); setSelected(null); setStatus(previous => previous ? { ...previous, authenticated: false } : previous); }).catch(report);
    }}>Sign out</button>}<a href="/">Public studio ↗</a></div></header>
    {error && <div role="alert" className="teach-error">{error}<button type="button" aria-label="Dismiss error" onClick={() => setError('')}>×</button></div>}
    {!status ? <section className="teach-card"><h1>Opening private studio…</h1><button className="teach-button secondary" onClick={() => void api.status().then(setStatus).catch(report)}>Retry connection</button></section> : !status.authenticated ?
      <section className="teach-login teach-card"><p className="teach-kicker">YOUR EYE, YOUR ANIMAL CHOICES</p><h1>{status.configured ? 'Welcome back.' : 'Make this space yours.'}</h1><p>{status.configured ? 'Sign in to your private teaching dataset and comparison benchmark.' : 'Choose a private studio password. Your photos and feedback stay in this project’s private data folder.'}</p>
        <form onSubmit={event => void signIn(event)}><label>Private studio password<input type="password" required minLength={status.configured ? undefined : 10} maxLength={200} autoComplete={status.configured ? 'current-password' : 'new-password'} value={password} onChange={event => setPassword(event.target.value)} /></label>
          {!status.configured && <label>Repeat password<input type="password" required minLength={10} maxLength={200} autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label>}
          <button className="teach-button" disabled={busy}>{busy ? 'Opening…' : status.configured ? 'Sign in' : 'Create private password'}</button></form><p className="teach-help">This password protects the teaching studio. Your Meta API key stays in the backend.</p></section> : <>
        <section className="teach-hero"><p className="teach-kicker">CREATOR’S WORKSPACE</p><h1>Teach your eye.</h1><p>Capture the choices, traits and creative connections that make a portrait feel right to you.</p><div className="teach-inline"><span className="teach-badge">{active.length} examples · {new Set(active.map(c => c.groupId)).size} related groups</span><span className="teach-badge">Collecting feedback · no model trained</span></div></section>
        <nav className="teach-tabs" aria-label="Private studio"><button aria-pressed={tab === 'feedback'} onClick={() => { if (canLeave()) setTab('feedback'); }}>Result feedback</button><button aria-pressed={tab === 'choices'} onClick={() => { if (canLeave()) setTab('choices'); }}>Animal choices</button><button aria-pressed={tab === 'teach'} onClick={() => { if (canLeave()) setTab('teach'); }}>Teach</button><button aria-pressed={tab === 'benchmark'} onClick={() => { if (canLeave()) setTab('benchmark'); }}>Benchmark</button><button aria-pressed={tab === 'memory'} onClick={() => { if (canLeave()) setTab('memory'); }}>Memory · RAG</button>
          <button className="teach-export" onClick={() => void api.download('export', 'wildlens-private-feedback.jsonl').catch(report)}>Export feedback</button></nav>
        {notice && <p className="teach-success" role="status">{notice}</p>}
        {tab === 'feedback' ? <FeedbackStudio examples={examples} metaReady={status.metaReady} onError={report} onDirty={setDirty}
          refresh={async () => { const result = await api.cases(); setExamples(result.cases); }} onCrop={item => { if (canLeave()) { setSelected(item); setTab('teach'); setEpoch(n => n + 1); } }} /> : tab === 'choices' ? <ChoiceStudio examples={examples} metaReady={status.metaReady} onError={report} onDirty={setDirty} refresh={async () => { const result = await api.cases(); setExamples(result.cases); }} /> : tab === 'teach' ? <div className="teach-workspace"><aside className="teach-library"><div className="teach-section-heading"><h2>Your examples</h2><span>{active.filter(c => c.acceptedAnimals.length > 0).length} / {active.length} labeled</span></div>
          <label>Queue<select aria-label="Portrait queue" value={queue} onChange={event => setQueue(event.target.value)}><option value="all">All portraits</option><option value="pending">Not yet labeled</option><option value="labeled">Labeled</option></select></label>
          <button className="teach-button" disabled={busy} onClick={() => { if (canLeave()) fileInput.current?.click(); }}>+ Add photo</button>
          <input hidden ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Add teaching photo" onChange={event => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = ''; }} />
          <label>Find an example<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Animal, position, case or group" /></label>
          <div className="teach-example-list">{visible.map(item => <button key={item.caseId} className={`teach-example ${selected?.caseId === item.caseId ? 'selected' : ''}`} disabled={busy} onClick={() => select(item)}><img loading="lazy" crossOrigin="use-credentials" src={api.photoUrl(item.reference.file)} alt="" /><strong>{item.personPosition}</strong><span>{item.acceptedAnimals.join(' / ') || 'Needs labels'}</span><small>{item.split} · {item.archived ? 'archived' : item.reference.personOnly ? 'subject ready' : 'crop needed'}</small></button>)}{visible.length === 0 && <p className="teach-help">No portraits in this queue.</p>}</div>
          <label className="teach-checkbox"><input type="checkbox" checked={showArchived} onChange={event => setShowArchived(event.target.checked)} />Show archived</label>
        </aside><section id="teach-active-portrait" className="teach-card teach-editor-card">{selected ? <><div className="teach-editor-state"><span>{dirty ? 'Unsaved changes' : 'Saved example'}</span><div className="teach-inline"><button className="teach-text-button" disabled={busy} onClick={() => move(-1)}>← Previous</button><button className="teach-text-button" disabled={busy} onClick={() => move(1)}>Skip →</button></div>{selected.caseId && <code>{selected.caseId}</code>}</div>
          <CaseEditor key={`${selected.caseId}:${selected.revision}:${epoch}`} initial={selected} busy={busy} onSave={save} onDirty={() => setDirty(true)} onError={setError}
            onDiscard={() => void discard()}
            onAnother={item => { if (!canLeave()) return; setSelected({ ...emptyExample(item.reference.originalFile ?? item.reference.file, item.groupId), split: item.split }); setDirty(true); setEpoch(n => n + 1); }} /></> : <div className="teach-empty"><h2>Your first judgment starts here.</h2><p>Add a photo, select a person and tell WildLens which animals fit your interpretation.</p></div>}</section></div>
        : tab === 'benchmark' ? <Benchmarks examples={examples} metaReady={status.metaReady} onError={report} /> : <MemoryPanel onError={report} />}
      </>}
    <footer className="teach-footer">Saved locally · restart and continue · export feedback and vectors separately. Eligible training examples guide new portraits when Memory is on; no fine-tuning.</footer>
  </div></main>;
}
