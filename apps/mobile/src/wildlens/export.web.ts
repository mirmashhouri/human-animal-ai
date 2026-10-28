import type { RefObject } from 'react';
import type { View } from 'react-native';
import type { Direction } from './types';
export async function exportArtwork(_ref: RefObject<View | null>, image: string, _direction: Direction) {
  const response = await fetch(image);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = 'wildlens-artwork.png';
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
