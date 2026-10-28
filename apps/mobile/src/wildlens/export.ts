import type { RefObject } from 'react';
import type { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import type { Direction } from './types';
export async function exportArtwork(ref: RefObject<View | null>, _image: string, _direction: Direction) {
  if (!await Sharing.isAvailableAsync()) throw new Error('Sharing is unavailable on this device.');
  const uri = await captureRef(ref, { format: 'png', quality: 1, result: 'tmpfile' });
  await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share your WildLens artwork' });
}
