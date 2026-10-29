import { useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import * as api from './api';
import { cropPhoto } from './photos';
import { traitLabels, type Crop, type Example, type Trait } from './types';
import AnimalPicker from './AnimalPicker.web';
import QuickFeatures from './QuickFeatures.web';

const csv = (text: string) => text.split(',').map(s => s.trim()).filter(Boolean);
export default function CaseEditor({ initial, busy, onSave, onDirty, onError, onDiscard, onAnother }: {
  initial: Example; busy: boolean; onSave: (item: Example, advance?: boolean) => Promise<void>; onDirty: () => void;
  onError: (message: string) => void; onDiscard: () => void; onAnother: (item: Example) => void;
}) {
  const [item, setItem] = useState(initial);
  const [accepted, setAccepted] = useState(initial.acceptedAnimals.join(', '));
  const [rejected, setRejected] = useState(initial.rejectedAnimals.join(', '));
  const [cues, setCues] = useState(initial.selectionCues.join('\n'));
  const [crop, setCrop] = useState<Crop>(initial.reference.crop ?? { x: 0, y: 0, width: 1, height: 1 });
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState(Boolean(initial.reference.crop));
  const [cropping, setCropping] = useState(false);
  const [traitKey, setTraitKey] = useState(traitLabels[0]?.[0] ?? 'face_ratio');
  const origin = useRef<{ x: number; y: number } | null>(null);
  const source = item.reference.originalFile ?? item.reference.file;
  const credit = item.source && typeof item.source === 'object' ? item.source as Record<string, unknown> : null;
  const safeLink = (value: unknown) => typeof value === 'string' && /^https:\/\/(commons\.wikimedia\.org|creativecommons\.org)\//.test(value) ? value : undefined;
  function change(patch: Partial<Example>) { setItem(previous => ({ ...previous, ...patch })); onDirty(); }
  function point(event: PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (event.clientX - box.x) / box.width)), y: Math.max(0, Math.min(1, (event.clientY - box.y) / box.height)) };
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    if (!origin.current) return;
    const next = point(event); const start = origin.current;
    setCrop({ x: Math.min(start.x, next.x), y: Math.min(start.y, next.y), width: Math.abs(next.x - start.x), height: Math.abs(next.y - start.y) });
  }
  async function applyCrop() {
    setCropping(true);
    try {
      const photo = await api.upload(await cropPhoto(api.photoUrl(source), crop));
      change({ reference: { ...item.reference, file: photo.file, originalFile: source, crop, personOnly: true, kind: 'subject-crop' } }); setSelecting(false);
    } catch (error) { onError(error instanceof Error ? error.message : 'The crop could not be saved.'); }
    finally { setCropping(false); }
  }
  function updateTrait(index: number, patch: Partial<Trait>) { change({ traits: item.traits.map((trait, i) => i === index ? { ...trait, ...patch } : trait) }); }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const next = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('data-advance') === 'true';
    if (next && csv(accepted).length === 0) { onError('Choose an accepted animal before saving and moving on.'); return; }
    await onSave({ ...item, acceptedAnimals: csv(accepted), rejectedAnimals: csv(rejected), selectionCues: cues.split('\n').map(s => s.trim()).filter(Boolean) }, next);
  }
  const disabled = busy || cropping;
  return <form className="teach-editor" onSubmit={event => void submit(event)} onKeyDown={event => {
    if (event.altKey && event.key === 'Enter') { event.preventDefault(); event.currentTarget.requestSubmit(event.currentTarget.querySelector('[data-advance="true"]') as HTMLButtonElement); }
  }}>
    <fieldset disabled={disabled} className="teach-fieldset">
    <div className="teach-section-heading"><div><p className="teach-kicker">YOUR VISUAL JUDGMENT</p><h2>{initial.caseId ? 'Teach this portrait' : 'New portrait'}</h2></div>
      <span className="teach-badge">{item.reference.personOnly ? 'Subject ready' : 'Select the person'}</span></div>
    <div className="teach-editor-columns">
      <section className="teach-photo-section" aria-label="Subject reference">
        <div className={`teach-crop-frame ${selecting ? 'is-selecting' : ''}`} onPointerDown={event => {
          if (!selecting || disabled) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
          origin.current = point(event); setCrop({ ...origin.current, width: 0, height: 0 }); setSelected(false);
        }} onPointerMove={move} onPointerUp={event => { if (!origin.current) return; move(event); origin.current = null; setSelected(true); }} onPointerCancel={() => { origin.current = null; }}>
          <img crossOrigin="use-credentials" src={api.photoUrl(source)} alt="Original teaching photo" draggable={false} />
          {(selected || selecting) && <div className="teach-crop-box" aria-hidden="true" style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.width * 100}%`, height: `${crop.height * 100}%` }} />}
        </div>
        <p className="teach-help">Select this person and helpful body cues. Exclude other clear faces from the benchmark crop.</p>
        {credit && <details className="teach-details teach-credit"><summary>Photo source & license</summary><p>{String(credit.author ?? '')} · <a href={safeLink(credit.licenseUrl)} target="_blank" rel="noreferrer">{String(credit.license ?? '')}</a></p><a href={safeLink(credit.sourcePage)} target="_blank" rel="noreferrer">Wikimedia source ↗</a><p>{String(credit.modifications ?? '')}</p></details>}
        <div className="teach-inline"><button type="button" className="teach-button secondary" disabled={disabled} onClick={() => setSelecting(v => !v)}>{selecting ? 'Stop selecting' : 'Select person'}</button>
          <button type="button" className="teach-button secondary" disabled={disabled || !selected || crop.width <= 0 || crop.height <= 0} onClick={() => void applyCrop()}>{cropping ? 'Saving crop…' : 'Use selected crop'}</button></div>
        <details className="teach-details"><summary>Set crop with numbers</summary><div className="teach-crop-numbers">{(['x', 'y', 'width', 'height'] as const).map(key => <label key={key}>{key} %<input aria-label={`Crop ${key} percent`} type="number" min={0} max={100} step={0.1} value={Math.round(crop[key] * 1000) / 10} onChange={event => { setCrop({ ...crop, [key]: Number(event.target.value) / 100 }); setSelected(true); }} /></label>)}</div></details>
        {item.reference.file !== source && <div className="teach-selected-preview"><img crossOrigin="use-credentials" src={api.photoUrl(item.reference.file)} alt="Selected benchmark subject crop" /><span>Saved subject crop</span></div>}
        <label className="teach-checkbox"><input type="checkbox" checked={Boolean(item.reference.personOnly)} disabled={disabled} onChange={event => change({ reference: { ...item.reference, personOnly: event.target.checked } })} />This reference shows only this person</label>
        <button type="button" className="teach-text-button" disabled={disabled} onClick={() => onAnother(item)}>Add another person from this photo</button>
      </section>
      <section className="teach-annotations" aria-label="Preference annotations">
        <label>Person / position<input required maxLength={180} value={item.personPosition} placeholder="Viewer-left person in a gray shirt" onChange={event => change({ personPosition: event.target.value })} /></label>
        <AnimalPicker label="Accepted animals" values={csv(accepted)} onChange={values => { setAccepted(values.join(', ')); onDirty(); }} />
        <QuickFeatures item={item} change={change} />
        <details className="teach-details"><summary>Rejected animals & optional reasoning</summary>
        <AnimalPicker label="Rejected animals" values={csv(rejected)} onChange={values => { setRejected(values.join(', ')); onDirty(); }} />
        <label>Why these animals?<textarea aria-label="Why these animals?" rows={3} value={cues} placeholder={'Round cheeks\nRound eyes'} onChange={event => { setCues(event.target.value); onDirty(); }} /><span className="teach-help">Optional. Standout features and sliders can capture your judgment without typing.</span></label></details>
        <details className="teach-details"><summary>Creative notes & certainty</summary><label>Your certainty<select aria-label="Your certainty" value={item.confidence} onChange={event => change({ confidence: event.target.value as Example['confidence'] })}><option value="unspecified">Not yet specified</option><option value="certain">Clear preference</option><option value="alternatives">Several good choices</option><option value="uncertain">Still exploring</option></select></label>
        <label>Creative transformation notes<textarea aria-label="Creative transformation notes" rows={3} maxLength={4000} value={item.creativeNotes} placeholder="Keep the smile curve. Hair can become fins when choosing fish." onChange={event => change({ creativeNotes: event.target.value })} /></label>
        <details className="teach-details" open={item.creativeMappings.length > 0}><summary>Creative mappings ({item.creativeMappings.length})</summary>
          {item.creativeMappings.map((mapping, index) => <div key={index} className="teach-mapping"><div className="teach-three-columns">{(['appliesToAnimal', 'source', 'target'] as const).map(key => <label key={key}>{key === 'appliesToAnimal' ? 'Animal' : key}<input value={String(mapping[key] ?? '')} onChange={event => change({ creativeMappings: item.creativeMappings.map((m, i) => i === index ? { ...m, [key]: event.target.value } : m) })} /></label>)}</div>
            <label>Description<input value={String(mapping.description ?? '')} onChange={event => change({ creativeMappings: item.creativeMappings.map((m, i) => i === index ? { ...m, description: event.target.value } : m) })} /></label>
            <button type="button" className="teach-text-button" onClick={() => change({ creativeMappings: item.creativeMappings.filter((_, i) => i !== index) })}>Remove mapping</button></div>)}
          <button type="button" className="teach-text-button" disabled={item.creativeMappings.length >= 20} onClick={() => change({ creativeMappings: [...item.creativeMappings, { appliesToAnimal: '', source: '', target: '', description: '' }] })}>+ Add a mapping</button>
        </details>
        </details>
        <div className="teach-two-columns"><label>Related group ID<input required pattern="[a-zA-Z0-9_-]{1,100}" value={item.groupId} onChange={event => change({ groupId: event.target.value })} /></label>
          <label>Dataset split<select aria-label="Dataset split" value={item.split} onChange={event => change({ split: event.target.value as Example['split'] })}><option value="unassigned">Unassigned</option><option value="train">Training</option><option value="validation">Validation</option><option value="test">Test / held out</option></select></label></div>
        <p className="teach-help">Use the same group ID for related photos or people. A split change applies to every example in that group.</p>
      </section>
    </div>
    <details className="teach-details teach-traits"><summary>Advanced annotations · {item.traits.length} of 32</summary>
      <p className="teach-help">Stored scale: −{item.traitScale ?? 100} / +{item.traitScale ?? 100}. Quick sliders display −5 / +5. Original ratings keep their scale. Importance is your judgment for this portrait.</p>
      {item.traits.map((trait, index) => <div className="teach-trait" key={trait.key}>
        <strong>{traitLabels.find(([key]) => key === trait.key)?.[1]}</strong>
        <label>Value<input type="number" min={-(item.traitScale ?? 100)} max={item.traitScale ?? 100} value={trait.value ?? ''} disabled={trait.visibility !== 'clear'} onChange={event => updateTrait(index, { value: event.target.value === '' ? null : Number(event.target.value) })} /></label>
        <label>Visibility<select aria-label="Visibility" value={trait.visibility} onChange={event => updateTrait(index, { visibility: event.target.value as Trait['visibility'], ...(event.target.value !== 'clear' ? { value: null } : {}) })}><option value="clear">Clear</option><option value="uncertain">Uncertain</option><option value="hidden">Hidden</option></select></label>
        <label>Importance<select aria-label="Importance" value={trait.importance ?? ''} onChange={event => updateTrait(index, { importance: event.target.value === '' ? null : Number(event.target.value) })}><option value="">Unspecified</option>{[0, 1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
        <label>Rendering instruction<input maxLength={500} value={trait.renderInstruction} onChange={event => updateTrait(index, { renderInstruction: event.target.value })} /></label>
        <button type="button" className="teach-text-button" onClick={() => change({ traits: item.traits.filter((_, i) => i !== index) })}>Remove</button>
      </div>)}
      <div className="teach-inline"><label>Feature<select aria-label="Feature" value={traitKey} onChange={event => setTraitKey(event.target.value)}>{traitLabels.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><button type="button" className="teach-button secondary" disabled={item.traits.some(t => t.key === traitKey)} onClick={() => change({ traits: [...item.traits, { key: traitKey, value: null, importance: null, visibility: 'uncertain', renderInstruction: '' }] })}>Add feature</button></div>
    </details>
    <div className="teach-save-bar"><button type="submit" data-advance="true" className="teach-button" disabled={disabled}>{busy ? 'Saving…' : 'Save & next →'}</button><button type="submit" className="teach-button secondary" disabled={disabled}>Save example</button><button type="button" className="teach-button secondary" disabled={disabled} onClick={onDiscard}>Discard changes</button>
      {item.caseId && <button type="button" className="teach-text-button danger" disabled={disabled} onClick={() => void onSave({ ...item, acceptedAnimals: csv(accepted), rejectedAnimals: csv(rejected), selectionCues: cues.split('\n').map(s => s.trim()).filter(Boolean), archived: !initial.archived })}>{initial.archived ? 'Restore example' : 'Archive example'}</button>}
      <span className="teach-help">Saving updates local vectors without Meta calls. Labeled training examples with a single-person reference and a rated or standout feature can guide RAG.</span></div>
    </fieldset>
  </form>;
}
