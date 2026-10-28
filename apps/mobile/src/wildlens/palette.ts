// Deterministic quantized whole-image colors: no emotion or personality inference.
export function quantizePalette(pixels: ArrayLike<number>, limit = 5): string[] {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if ((pixels[i + 3] ?? 0) < 128) continue;
    const r = pixels[i] ?? 0, g = pixels[i + 1] ?? 0, b = pixels[i + 2] ?? 0;
    const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
    const bucket = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    bucket.n++; bucket.r += r; bucket.g += g; bucket.b += b; buckets.set(key, bucket);
  }
  const colors: { r: number; g: number; b: number }[] = [];
  for (const entry of [...buckets.values()].sort((a, b) => b.n - a.n)) {
    const color = { r: Math.round(entry.r / entry.n), g: Math.round(entry.g / entry.n), b: Math.round(entry.b / entry.n) };
    if (colors.every(c => Math.hypot(c.r - color.r, c.g - color.g, c.b - color.b) > 45)) colors.push(color);
    if (colors.length >= limit) break;
  }
  return colors.map(c => '#' + [c.r, c.g, c.b].map(n => n.toString(16).padStart(2, '0')).join(''));
}
