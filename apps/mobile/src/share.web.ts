import type { RefObject } from 'react';
import type { View } from 'react-native';
import { animalPhotoUri } from './data';
import type { Animal, Portrait } from './types';

async function loadImage(uri: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('A photo could not be loaded for export. Please try again.'));
    image.src = uri;
  });
}

function cover(ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number) {
  const scale = Math.max(width / image.width, height / image.height);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  ctx.drawImage(image, (image.width - sourceWidth) / 2, (image.height - sourceHeight) / 2,
    sourceWidth, sourceHeight, x, y, width, height);
}

function contain(ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number) {
  const scale = Math.min(width / image.width, height / image.height);
  const fittedWidth = image.width * scale, fittedHeight = image.height * scale;
  ctx.drawImage(image, x + (width - fittedWidth) / 2, y + (height - fittedHeight) / 2, fittedWidth, fittedHeight);
}

export async function shareComparison(_ref: RefObject<View | null>, portrait: Portrait, animal: Animal, isDemo: boolean) {
  const generated = animal.imageOrigin === 'generated';
  const [human, reference] = await Promise.all([loadImage(portrait.uri), loadImage(animalPhotoUri(animal))]);
  const canvas = document.createElement('canvas');
  canvas.width = 1080; canvas.height = 1350;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Image export is not available in this browser.');
  ctx.fillStyle = '#F6F4EC'; ctx.fillRect(0, 0, 1080, 1350);
  ctx.fillStyle = '#20291F'; ctx.font = '58px Georgia'; ctx.fillText('kinform', 64, 90);
  ctx.font = '18px sans-serif'; ctx.textAlign = 'right';
  ctx.fillText(isDemo ? 'DEMO / NOT AN AI RESULT' : generated ? 'AI ANIMAL CHARACTER' : 'A VISUAL RESEMBLANCE', 1016, 78);
  if (generated) contain(ctx, human, 44, 142, 492, 710);
  else cover(ctx, human, 44, 142, 492, 710);
  if (isDemo) cover(ctx, reference, 544, 142, 492, 710);
  else {
    // Keep the reviewed head visible even when the animal and card aspect ratios differ.
    contain(ctx, reference, 544, 142, 492, 710);
  }
  ctx.fillStyle = '#F6F4EC'; ctx.beginPath(); ctx.arc(540, 497, 38, 0, Math.PI * 2); ctx.fill();
  ctx.textAlign = 'center'; ctx.fillStyle = '#20291F'; ctx.font = '44px sans-serif'; ctx.fillText('↔', 540, 510);
  ctx.font = '18px sans-serif'; ctx.fillText(portrait.isSample ? 'SAMPLE PORTRAIT' : 'YOU', 290, 895);
  ctx.fillText(animal.name.toUpperCase(), 790, 895, 480);
  ctx.font = '23px sans-serif'; ctx.fillStyle = '#606C46';
  ctx.fillText(isDemo ? 'An example from the wild.' : generated ? 'Your face. Reimagined.' : 'An unexpected resemblance.', 540, 967);
  ctx.font = '65px Georgia'; ctx.fillStyle = '#20291F'; ctx.fillText(animal.name, 540, 1054, 950);
  ctx.font = 'italic 23px sans-serif'; ctx.fillStyle = '#737969'; ctx.fillText(animal.scientificName, 540, 1096);
  ctx.font = '17px sans-serif'; ctx.fillText(`${animal.photoCredit} · ${isDemo ? 'cropped' : 'shown in full'}`, 540, 1180, 996);
  ctx.fillText(generated ? 'AI cartoon — inspired by your portrait, not a real photograph' : animal.licenseUrl, 540, 1208, 996);
  // The source URL travels with the exported photograph, including share-alike licence notices.
  ctx.font = '12px sans-serif'; ctx.fillText(animal.sourceUrl, 540, 1236, 996);
  if (portrait.isSample) ctx.fillText('Sample portrait: Gromovataya · CC0 · local demo only', 540, 1264);
  ctx.font = '15px sans-serif'; ctx.fillText('kinform — a little more wild', 540, 1315);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Image export failed.')), 'image/png'));
  // Browser previews use a predictable download. iOS/Android builds use their native share sheet.
  // Generating the canvas first can exhaust transient user activation required by navigator.share.
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = `kinform-${animal.id}.png`;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'downloaded' as const;
}
