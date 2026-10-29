import type { Crop } from './types';

export async function filePhoto(file: File): Promise<string> {
  if (file.size > 15 * 1024 * 1024) throw new Error('Choose an image under 15 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = await load(url);
    if (image.naturalWidth < 64 || image.naturalHeight < 64) throw new Error('Choose an image at least 64 pixels wide and tall.');
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 2048 / Math.max(image.naturalWidth, image.naturalHeight));
    canvas.width = Math.round(image.naturalWidth * scale); canvas.height = Math.round(image.naturalHeight * scale);
    const context = canvas.getContext('2d'); if (!context) throw new Error('Photo processing is unavailable.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    let result = canvas.toDataURL('image/jpeg', 0.85).split(',')[1] ?? '';
    if (result.length > 2_796_204) result = canvas.toDataURL('image/jpeg', 0.65).split(',')[1] ?? '';
    if (result.length > 2_796_204) throw new Error('The photo is too large after resizing. Choose a smaller file.');
    return result;
  } finally { URL.revokeObjectURL(url); }
}
function load(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image(); image.crossOrigin = 'use-credentials'; image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Photo could not be loaded. Sign in again if your session expired.')); image.src = url;
  });
}
export async function cropPhoto(url: string, crop: Crop) {
  if (!Number.isFinite(crop.x + crop.y + crop.width + crop.height) || crop.x < 0 || crop.y < 0 || crop.width <= 0 || crop.height <= 0 || crop.x + crop.width > 1.000001 || crop.y + crop.height > 1.000001)
    throw new Error('Keep the selected region inside the photo.');
  const image = await load(url);
  const width = Math.round(crop.width * image.naturalWidth), height = Math.round(crop.height * image.naturalHeight);
  if (width < 64 || height < 64) throw new Error('Select a region at least 64 pixels wide and tall.');
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d'); if (!context) throw new Error('Cropping is unavailable.');
  context.drawImage(image, crop.x * image.naturalWidth, crop.y * image.naturalHeight, width, height, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', 0.9).split(',')[1] ?? '';
}
