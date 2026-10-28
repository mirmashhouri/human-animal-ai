import { Platform } from 'react-native';
import type { Artwork, Inspection, StudioConfig, StudioOptions, StudioPhoto } from './types';

export const studioUrl = (process.env.EXPO_PUBLIC_API_URL ?? (Platform.OS === 'web' ? 'http://localhost:5086' : '')).replace(/\/$/, '');
async function request<T>(path: string, signal: AbortSignal, body?: unknown): Promise<T> {
  if (!studioUrl) throw new Error('Set EXPO_PUBLIC_API_URL to your development API address.');
  const response = await fetch(`${studioUrl}/api/wildlens/${path}`, {
    signal, ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload && typeof payload === 'object' && 'message' in payload && typeof payload.message === 'string'
      ? payload.message : `The studio could not complete the request (${response.status}).`;
    throw new Error(message);
  }
  return payload as T;
}
export const studioConfig = (signal: AbortSignal) => request<StudioConfig>('config', signal);
export async function inspectPhoto(photo: StudioPhoto, options: StudioOptions, signal: AbortSignal): Promise<Inspection> {
  const result = await request<Inspection>('analyze', signal, { imageBase64: photo.base64, consent: true, palette: photo.palette, ...options });
  if (!result?.ticket || !result.analysis || !Array.isArray(result.analysis.palette)) throw new Error('The analysis was incomplete.');
  return result;
}
export async function renderArtwork(photo: StudioPhoto, inspection: Inspection, options: StudioOptions,
  animal: string, isolated: string | undefined, signal: AbortSignal): Promise<Artwork> {
  const result = await request<Artwork>('generate', signal, {
    imageBase64: photo.base64, ticket: inspection.ticket, consent: true, style: options.style, mood: options.mood,
    animal, isolatedSubject: isolated,
  });
  if (!result?.image?.startsWith('data:image/png;base64,') || result.image.length > 14_000_030) throw new Error('The generated image was incomplete.');
  return result;
}
