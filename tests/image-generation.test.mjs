import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { safeJpegDataUri } from '../apps/mobile/src/imageData.ts';

test('generated image data accepts bounded JPEG only, never an external URL or SVG', async () => {
  const bytes = await readFile(new URL('../apps/mobile/assets/photos/red-fox.jpg', import.meta.url));
  assert.ok(safeJpegDataUri('data:image/jpeg;base64,' + bytes.toString('base64')));
  for (const bad of ['https://evil.test/image.jpg', 'data:image/svg+xml,<svg/>', 'data:image/jpeg;base64,/9j/<script>', 'data:image/jpeg;base64,/9j/' + 'a'.repeat(3_000_000)])
    assert.equal(safeJpegDataUri(bad), false);
});
