// Only bounded JPEG data is accepted for generated images, never HTML/SVG.
export function safeJpegDataUri(value: string): boolean {
  return value.length <= 2_796_227 && value.startsWith('data:image/jpeg;base64,/9j/') &&
    /^[A-Za-z0-9+/]+={0,2}$/.test(value.slice(23));
}
