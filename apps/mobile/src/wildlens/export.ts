import type { RefObject } from 'react';
import type { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import type { Direction, StudioPhoto } from './types';
export async function serializeArtwork(ref: RefObject<View | null>, _photo: StudioPhoto, _image: string, _direction: Direction) {
  const base64 = await captureRef(ref, { format: 'png', quality: 1, result: 'base64' });
  if (base64.length > 11_184_812) throw new Error('The card is too large for server storage. You can still download it.');
  return base64;
}
export async function exportArtwork(ref: RefObject<View | null>, _photo: StudioPhoto, _image: string, _direction: Direction) {
  if (!await Sharing.isAvailableAsync()) throw new Error('Sharing is unavailable on this device.');
  const uri = await captureRef(ref, { format: 'png', quality: 1, result: 'tmpfile' });
  await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share your Wildfie artwork' });
}
