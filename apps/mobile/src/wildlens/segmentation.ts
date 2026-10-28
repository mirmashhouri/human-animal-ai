import { decodeMaskToRaster, formats, recordsOfKind } from '@meta-sam/parser';

export function readSubjectMask(text: string) {
  if (!text || text.length > 2_000_000) throw new Error('SAM returned no usable subject mask.');
  // Apply app limits before the official parser allocates a raster.
  for (const match of text.matchAll(/data=(\d+),(\d+),/g)) {
    const height = Number(match[1]), width = Number(match[2]);
    if (height < 1 || width < 1 || height > 2048 || width > 2048 || height * width > 4_194_304)
      throw new Error('SAM returned a mask larger than this studio supports.');
  }
  const parser = formats.segmentation.image().createParser();
  parser.push(text);
  const { result } = parser.finish({ status: 'completed' });
  if (result.diagnostics.some(d => d.severity === 'error')) throw new Error('SAM returned an incomplete mask. Try another photo or turn isolation off.');
  const masks = [...recordsOfKind(result.records, 'mask')];
  masks.sort((a, b) => (b.bounds.right - b.bounds.left) * (b.bounds.bottom - b.bounds.top) - (a.bounds.right - a.bounds.left) * (a.bounds.bottom - a.bounds.top));
  const selected = masks[0];
  if (!selected) throw new Error('SAM found no subject. Try a clearer photo or turn isolation off.');
  return { record: selected, raster: decodeMaskToRaster(selected.mask), count: masks.length };
}
