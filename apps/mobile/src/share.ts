import type { RefObject } from 'react';
import type { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import type { Animal, Portrait } from './types';

export async function shareComparison(ref: RefObject<View | null>, _portrait: Portrait, _animal: Animal, _isDemo: boolean) {
  if (!await Sharing.isAvailableAsync()) throw new Error('File sharing is not available on this device.');
  const uri = await captureRef(ref, { format: 'png', quality: 1, result: 'tmpfile', width: 1080 });
  await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: _animal.imageOrigin === 'generated' ? 'Share your Kinform character' : 'Share your Kinform comparison', UTI: 'public.png' });
  return 'shared' as const;
}
