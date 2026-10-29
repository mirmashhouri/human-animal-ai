import type { Example, Status, Run, Prediction, Comparison } from './types';

const host = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname) ? window.location.hostname : 'localhost';
const base = (process.env.EXPO_PUBLIC_API_URL ?? `http://${host}:5086`).replace(/\/$/, '') + '/api/teaching/';
export class StudioError extends Error { constructor(message: string, public status: number) { super(message); } }
export async function call<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(base + path, { credentials: 'include', signal,
    ...(body !== undefined ? { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-WildLens-Teaching': '1' }, body: JSON.stringify(body) } : {}) });
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new StudioError(result && typeof result === 'object' && 'message' in result ? String(result.message) : `Private studio request failed (${response.status}).`, response.status);
  return result as T;
}
export const status = () => call<Status>('status');
export const cases = () => call<{ cases: Example[]; datasetHash: string }>('cases');
export const save = (item: Example) => call<Example>('cases/save', { case: item, expectedRevision: item.revision });
export const runs = () => call<Run[]>('runs');
export const photoUrl = (file: string) => base + 'photos/' + encodeURIComponent(file.split('/').at(-1) ?? '');
export const upload = (imageBase64: string) => call<{ file: string }>('photos', { imageBase64 });
export const importRun = (name: string, version: string, caseIds: string[], predictions: Prediction[]) => call<Run>('runs/import', { name, version, caseIds, predictions });
export const compare = (a: string, b: string) => call<Comparison>(`runs/compare?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`);
export const runCurrent = (name: string, caseIds: string[], consent: boolean, signal: AbortSignal, useMemory = false) => call<Run>('runs/current', { name, caseIds, consent, useMemory }, signal);
export async function download(path: string, filename: string) {
  const response = await fetch(base + path, { credentials: 'include' });
  if (!response.ok) throw new StudioError('The export could not be downloaded. Sign in again if your session expired.', response.status);
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
