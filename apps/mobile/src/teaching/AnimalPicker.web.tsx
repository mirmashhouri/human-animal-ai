import { useId, useState } from 'react';
import { animalChoices } from './animals';

export default function AnimalPicker({ label, values, onChange }: { label: string; values: string[]; onChange: (values: string[]) => void }) {
  const [search, setSearch] = useState(''); const id = useId();
  const query = search.trim().toLocaleLowerCase();
  const matches = animalChoices.filter(([name, fa]) => `${name} ${fa}`.toLocaleLowerCase().includes(query)).slice(0, query ? 24 : 12);
  const selected = (name: string) => values.some(v => v.toLowerCase() === name.toLowerCase());
  function choose(name: string) { onChange(selected(name) ? values.filter(v => v.toLowerCase() !== name.toLowerCase()) : [...values, name]); setSearch(''); }
  return <section className="teach-animal-picker" aria-label={label}>
    <label htmlFor={id}>{label}<input id={id} type="search" aria-label={`Search ${label.toLowerCase()}`} value={search} placeholder="Search animals · جست‌وجوی حیوان" maxLength={80}
      onChange={event => setSearch(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); if (matches[0]) choose(matches[0][0]); else if (query) choose(search.trim()); } }} /></label>
    {values.length > 0 && <div className="teach-animal-selected">{values.map(name => <button type="button" key={name} onClick={() => choose(name)} aria-label={`Remove ${name}`}>{name} ×</button>)}</div>}
    <div className="teach-animal-options">{matches.map(([name, fa]) => <button type="button" key={name} aria-pressed={selected(name)} onClick={() => choose(name)}><span>{name}</span><small lang="fa">{fa}</small></button>)}
      {query && !animalChoices.some(([name]) => name.toLowerCase() === query) && <button type="button" onClick={() => choose(search.trim())}>Use “{search.trim()}”</button>}</div>
    <span className="teach-help">Click to choose. Multiple animals mean equally good alternatives.</span>
  </section>;
}
