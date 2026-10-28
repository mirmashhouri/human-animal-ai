import { Asset } from 'expo-asset';
import type { ImageSourcePropType } from 'react-native';
import catalogue from '../../../data/animals.json';
import type { Animal, MatchResult } from './types';
import { safeJpegDataUri } from './imageData';

export const animals: Animal[] = catalogue;
export const photos: Record<string, number> = {
  'red-fox': require('../assets/photos/red-fox.jpg'),
  caracal: require('../assets/photos/caracal.jpg'),
  'eagle-owl': require('../assets/photos/eagle-owl.jpg'),
};
export const samplePortrait = require('../assets/photos/sample-portrait.jpg') as number;
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '');

export function animalPhoto(animal: Animal): ImageSourcePropType {
  return photos[animal.id] ?? { uri: animalPhotoUri(animal) };
}

export function animalPhotoUri(animal: Animal): string {
  if (animal.imageOrigin === 'generated') return safeJpegDataUri(animal.imagePath) ? animal.imagePath : '';
  const bundled = photos[animal.id];
  if (bundled) return Asset.fromModule(bundled).uri;
  // Only the public photo CDN used by the server resolver; never an LLM-generated URL.
  return /^https:\/\/inaturalist-open-data\.s3\.amazonaws\.com\/photos\/\d+\/medium\.(?:jpg|jpeg|png)$/.test(animal.imagePath)
    ? animal.imagePath : '';
}

export function demoResult(): MatchResult {
  return {
    id: `demo-${Date.now()}`,
    isDemo: true,
    catalogueVersion: 'prototype-3-v1',
    notice: 'Fixed sample matches. This photograph has not been analysed by AI.',
    matches: animals.map((animal, index) => ({ rank: index + 1, animal })),
  };
}
