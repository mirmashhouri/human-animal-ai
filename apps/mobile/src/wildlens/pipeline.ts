import { Platform } from 'react-native';
import { inspectPhoto, renderArtwork } from './api';
import { isolateSubject } from './media';
import type { StudioOptions, StudioPhoto } from './types';

export type CreationStage = 'analyzing' | 'isolating' | 'generating';
export const defaultOptions: Readonly<StudioOptions> = Object.freeze({
  style: 'Painterly', mood: 'Dreamlike', subject: 'person', segment: Platform.OS === 'web',
});

// One explicit user action owns the whole sequence; abort before starting another paid stage.
export async function createPortrait(photo: StudioPhoto, signal: AbortSignal, onStage: (stage: CreationStage) => void) {
  signal.throwIfAborted();
  onStage('analyzing');
  const inspection = await inspectPhoto(photo, defaultOptions, signal);
  signal.throwIfAborted();
  let cutout;
  if (defaultOptions.segment && inspection.segmentationStatus === 'segmented') {
    onStage('isolating');
    cutout = await isolateSubject(photo.uri, inspection.segmentationText);
    signal.throwIfAborted();
  }
  onStage('generating');
  const artwork = await renderArtwork(photo, inspection, defaultOptions, 'Suggested', cutout?.base64, signal);
  signal.throwIfAborted();
  return { inspection, artwork };
}
