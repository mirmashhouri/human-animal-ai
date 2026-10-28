import { quantizePalette } from './palette';
import type { IsolatedSubject } from './types';

async function loadImage(uri: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Your photo could not be decoded. Choose it again.'));
    image.src = uri;
  });
}
export async function extractPalette(uri: string): Promise<string[]> {
  const image = await loadImage(uri);
  const canvas = document.createElement('canvas'); canvas.width = 96; canvas.height = 96;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Color sampling is unavailable in this browser.');
  ctx.drawImage(image, 0, 0, 96, 96);
  return quantizePalette(ctx.getImageData(0, 0, 96, 96).data);
}
export async function isolateSubject(uri: string, text: string): Promise<IsolatedSubject> {
  const [{ readSubjectMask }, image] = await Promise.all([import('./segmentation'), loadImage(uri)]);
  const { record, raster, count } = readSubjectMask(text);
  const { bounds, mask } = record;
  if (bounds.left < 0 || bounds.top < 0 || bounds.right > image.naturalWidth || bounds.bottom > image.naturalHeight)
    throw new Error('The SAM mask does not align with this photo. Try another photo.');
  const alpha = document.createElement('canvas'); alpha.width = mask.width; alpha.height = mask.height;
  const alphaCtx = alpha.getContext('2d');
  const output = document.createElement('canvas'); output.width = image.naturalWidth; output.height = image.naturalHeight;
  const ctx = output.getContext('2d');
  const fullMask = document.createElement('canvas'); fullMask.width = output.width; fullMask.height = output.height;
  const fullCtx = fullMask.getContext('2d');
  if (!ctx || !alphaCtx || !fullCtx) throw new Error('Subject isolation is unavailable in this browser.');
  const pixels = alphaCtx.createImageData(mask.width, mask.height);
  for (let i = 0; i < raster.length; i++) {
    pixels.data[i * 4] = 255; pixels.data[i * 4 + 1] = 255; pixels.data[i * 4 + 2] = 255; pixels.data[i * 4 + 3] = raster[i] ? 255 : 0;
  }
  alphaCtx.putImageData(pixels, 0, 0);
  fullCtx.drawImage(alpha, bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top);
  ctx.drawImage(image, 0, 0); ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(fullMask, 0, 0);
  const result = output.toDataURL('image/png');
  return { uri: result, base64: result.slice('data:image/png;base64,'.length), count };
}
