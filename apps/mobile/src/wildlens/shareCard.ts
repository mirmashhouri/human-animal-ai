import type { Direction } from './types';

const clean = (value: string) => value.replace(/\s+/g, ' ').trim();

// Older saved results may contain a shortened species and a second feature clause.
// Keep one phrase, always spelling out the selected animal's full name.
function phrase(caption: string | null | undefined, animalName: string) {
  const animal = clean(animalName);
  let head = clean(caption ?? '').split(/\s*[·|]\s*|\s+[—–]\s+/)[0] ?? '';
  const exact = head.toLowerCase().indexOf(animal.toLowerCase());
  if (exact >= 0) head = head.slice(0, exact) + animal;
  else {
    const short = animal.split(' ').at(-1) ?? animal;
    if (head.toLowerCase().endsWith(' ' + short.toLowerCase())) head = head.slice(0, -(short.length + 1)).trim();
    head = head ? `${head} ${animal}` : animal;
  }
  let prefix = head.slice(0, -animal.length).trim();
  if (!/^(a|an|the|your)\b/i.test(prefix)) {
    if (prefix) prefix = prefix.charAt(0).toLowerCase() + prefix.slice(1);
    const article = /^[aeiou]/i.test(prefix || animal) ? 'An' : 'A';
    prefix = prefix ? `${article} ${prefix}` : article;
  } else prefix = prefix.charAt(0).toUpperCase() + prefix.slice(1);
  prefix = Array.from(prefix).slice(0, Math.max(2, 109 - Array.from(animal).length)).join('').trim();
  return { prefix: prefix + ' ', animal, text: `${prefix} ${animal}` };
}

// Preview and PNG export share the same phrase and bold species span.
export function shareCaptions(direction: Direction): { id?: number; prefix: string; animal: string; text: string }[] {
  if (direction.groupPhoto && direction.subjects?.length) {
    return direction.subjects.map(subject => ({ id: subject.id, ...phrase(subject.caption, subject.animalName) }));
  }
  return [{ ...phrase(direction.caption, direction.animalName) }];
}

export const shareCardColors = { paper: '#ffffff', border: '#dbdbdb', image: '#fafafa', text: '#262626' };
