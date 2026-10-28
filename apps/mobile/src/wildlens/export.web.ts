import type { RefObject } from 'react';
import type { View } from 'react-native';
import type { Direction } from './types';
export async function exportArtwork(_ref: RefObject<View | null>, image: string, direction: Direction) {
  const response = await fetch(image);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = 'wildlens-artwork.png';
  document.body.appendChild(link); link.click(); link.remove();
  const notesUrl = URL.createObjectURL(new Blob([JSON.stringify({ project: 'WildLens', generatedBy: 'Meta Muse Image', ...direction }, null, 2)], { type: 'application/json' }));
  const notes = document.createElement('a'); notes.href = notesUrl; notes.download = 'wildlens-story.json';
  document.body.appendChild(notes); notes.click(); notes.remove();
  setTimeout(() => { URL.revokeObjectURL(url); URL.revokeObjectURL(notesUrl); }, 1500);
}
