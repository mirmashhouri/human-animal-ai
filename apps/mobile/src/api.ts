import { API_URL, demoResult } from './data';
import type { MatchResult, Portrait, ServerConfig, SpeciesSearch } from './types';

async function request<T>(path: string, options: RequestInit = {}, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { ...options, signal });
  if (!response.ok) {
    if (response.status === 429) throw new Error('Too many requests. Wait a minute before trying again.');
    const body = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(body?.message ?? `The server could not complete the request (${response.status}).`);
  }
  return response.json() as Promise<T>;
}

export async function getConfig(signal?: AbortSignal): Promise<ServerConfig> {
  if (!API_URL) return { mode: 'demo', provider: 'None', catalogueSize: 3, hybridEnabled: false };
  return request<ServerConfig>('/api/config', {}, signal);
}

export async function searchSpecies(query: string, field: 'common' | 'scientific', offset: number, signal: AbortSignal): Promise<SpeciesSearch> {
  if (!API_URL) throw new Error('Connect the .NET API to search GBIF. The local photo comparisons still work.');
  return request<SpeciesSearch>(`/api/catalogue/search?q=${encodeURIComponent(query)}&field=${field}&offset=${offset}`, {}, signal);
}

export async function comparePortrait(portrait: Portrait, consent: boolean, signal: AbortSignal, portraitEditConsent = false): Promise<MatchResult> {
  // Stock sample is always local. No fallback quietly disguises a failed live call as a match.
  if (portrait.isSample || !API_URL) return demoResult();
  if (!consent) throw new Error('Confirm permission to process this photograph first.');
  if (!portrait.base64) throw new Error('Choose your portrait again before comparing.');
  const result = await request<MatchResult>('/api/matches', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64: portrait.base64, consent, portraitEditConsent }),
  }, signal);
  const expectedCount = result.experience === 'animal-character' ? 1 : 3;
  if (!Array.isArray(result.matches) || result.matches.length !== expectedCount ||
    new Set(result.matches.map(item => item.animal.id)).size !== expectedCount) {
    throw new Error('The server returned an incomplete result. Please try again.');
  }
  return result;
}
