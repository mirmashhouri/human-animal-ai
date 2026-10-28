import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { test } from 'node:test';
import { formats, decodeMaskToRaster, recordsOfKind } from '@meta-sam/parser';

const source = await readFile(new URL('../apps/mobile/src/wildlens/palette.ts', import.meta.url), 'utf8');
const { quantizePalette } = await import('data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(source)).toString('base64'));
test('whole-image palette is pixel-derived, ordered, and ignores transparent pixels', () => {
  assert.deepEqual(quantizePalette([255,0,0,255, 255,0,0,255, 0,255,0,255, 0,0,255,0]), ['#ff0000', '#00ff00']);
  assert.deepEqual(quantizePalette([]), []);
});
test('nearby color buckets do not produce redundant palette swatches', () => {
  assert.equal(quantizePalette([30,30,30,255, 33,33,33,255, 250,250,250,255]).length, 2);
});
test('official SAM parser decodes source-pixel bounds and the documented binary mask', () => {
  const parser = formats.segmentation.image().createParser();
  parser.push('<0f>0<|box;x1=10;y1=20;x2=14;y2=24;w=100;h=100|><|mask;x=0;y=0;data=5,5,!!!!!(QO(0lu8?|>');
  const { result } = parser.finish({ status: 'completed' });
  assert.deepEqual(result.diagnostics, []);
  const record = recordsOfKind(result.records, 'mask')[0];
  assert.deepEqual(record.bounds, { left: 10, top: 20, right: 15, bottom: 25 });
  const raster = decodeMaskToRaster(record.mask);
  assert.equal(raster.length, 25);
  assert.ok([...raster].every(value => value === 0 || value === 1));
  assert.ok([...raster].some(value => value === 1));
});
