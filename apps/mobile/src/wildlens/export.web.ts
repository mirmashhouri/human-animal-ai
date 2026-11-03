import type { RefObject } from 'react';
import type { View } from 'react-native';
import type { Direction, StudioPhoto } from './types';
import { shareCaptions, shareCardColors as colors } from './shareCard';
import { webFontFamily } from './theme';

async function loadImage(uri: string): Promise<HTMLImageElement> {
  const image = new Image(); image.crossOrigin = 'anonymous';
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve(); image.onerror = () => reject(new Error('One of the portraits could not be loaded for saving.'));
    image.src = uri;
  });
  return image;
}
type Run = { text: string; bold: boolean; width: number };
const font = (bold: boolean) => `${bold ? 700 : 400} 34px ${webFontFamily}`;
function wrapPhrase(context: CanvasRenderingContext2D, caption: ReturnType<typeof shareCaptions>[number], maxWidth: number) {
  const lines: { runs: Run[]; width: number }[] = []; let runs: Run[] = []; let width = 0;
  function finish() {
    while (runs.at(-1)?.text.trim() === '') width -= runs.pop()!.width;
    if (runs.length) lines.push({ runs, width });
    runs = []; width = 0;
  }
  for (const part of [{ text: caption.prefix, bold: false }, { text: caption.animal, bold: true }]) {
    context.font = font(part.bold);
    for (const word of part.text.match(/\S+|\s+/g) ?? []) {
      const measured = context.measureText(word).width;
      if (width + measured > maxWidth) finish();
      if (!word.trim() && !runs.length) continue;
      if (measured <= maxWidth) { runs.push({ text: word, bold: part.bold, width: measured }); width += measured; }
      else for (const character of Array.from(word)) {
        const w = context.measureText(character).width;
        if (width + w > maxWidth) finish();
        runs.push({ text: character, bold: part.bold, width: w }); width += w;
      }
    }
  }
  finish();
  return lines;
}

export async function exportArtwork(_ref: RefObject<View | null>, photo: StudioPhoto, image: string, direction: Direction) {
  const [original, animal] = await Promise.all([loadImage(photo.uri), loadImage(image)]);
  await document.fonts.ready;
  const canvas = document.createElement('canvas'); const context = canvas.getContext('2d');
  if (!context) throw new Error('Your browser could not prepare the image.');
  const width = 1800, margin = 42, gap = 24, cardWidth = (width - margin * 2 - gap) / 2;
  const imageHeight = cardWidth * original.naturalHeight / original.naturalWidth;
  const captionTop = margin + imageHeight + 36, lineHeight = 48;
  const captions = shareCaptions(direction).map(caption => wrapPhrase(context, caption, width - margin * 2 - 40));
  const captionHeight = captions.reduce((height, lines) => height + lines.length * lineHeight + 15, 0) - 15;
  canvas.width = width; canvas.height = Math.ceil(captionTop + captionHeight + margin);
  context.fillStyle = colors.paper; context.fillRect(0, 0, canvas.width, canvas.height);
  function drawCard(source: HTMLImageElement, x: number) {
    context!.save(); context!.beginPath(); context!.roundRect(x, margin, cardWidth, imageHeight, 12); context!.clip();
    context!.fillStyle = colors.image; context!.fillRect(x, margin, cardWidth, imageHeight);
    const scale = Math.min(cardWidth / source.naturalWidth, imageHeight / source.naturalHeight);
    const w = source.naturalWidth * scale, h = source.naturalHeight * scale;
    context!.drawImage(source, x + (cardWidth - w) / 2, margin + (imageHeight - h) / 2, w, h);
    context!.restore(); context!.strokeStyle = colors.border; context!.lineWidth = 2;
    context!.beginPath(); context!.roundRect(x, margin, cardWidth, imageHeight, 12); context!.stroke();
  }
  drawCard(original, margin); drawCard(animal, margin + cardWidth + gap);
  context.fillStyle = colors.text; context.textAlign = 'left'; context.textBaseline = 'top';
  let y = captionTop;
  for (const lines of captions) {
    for (const line of lines) {
      let x = (width - line.width) / 2;
      for (const run of line.runs) { context.font = font(run.bold); context.fillText(run.text, x, y); x += run.width; }
      y += lineHeight;
    }
    y += 15;
  }
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('The portrait image could not be saved.')), 'image/png'));
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = 'wildfie-portrait.png';
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
