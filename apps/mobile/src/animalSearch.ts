import type { Animal } from './types';

export type ImageSearchProvider = 'pinterest' | 'google';
export const MAX_SEARCH_LENGTH = 240;

export function normalizeSearchQuery(value: string): string {
  // Bound outbound text, strip controls/bidi markers, and keep Unicode code points intact.
  return Array.from(value.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ud800-\udfff]/gu, ' ')
    .replace(/\s+/gu, ' ').trim()).slice(0, MAX_SEARCH_LENGTH).join('').trim();
}

export function suggestedAnimalQuery(animal: Pick<Animal, 'name' | 'searchKeywords'>, isDemo = false): string {
  const keywords = isDemo ? [] : (animal.searchKeywords ?? []).slice(0, 3)
    .filter(word => typeof word === 'string' && word.length <= 40 && /^[a-zA-Z]+(?:[ -][a-zA-Z]+)*$/.test(word));
  return normalizeSearchQuery([animal.name.slice(0, 80), ...keywords, 'face portrait'].join(' '));
}

export function animalSearchUrl(provider: ImageSearchProvider, value: string): string | null {
  const query = normalizeSearchQuery(value);
  if (!query) return null;
  const encoded = encodeURIComponent(query);
  // Neither model output nor editable text can control the destination or add parameters.
  switch (provider) {
    case 'pinterest': return `https://www.pinterest.com/search/pins/?q=${encoded}&rs=typed`;
    case 'google': return `https://www.google.com/search?tbm=isch&safe=active&q=${encoded}`;
    default: return null;
  }
}
