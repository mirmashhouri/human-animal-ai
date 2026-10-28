// API smoke test. Default is a free local config check; --run opts into one billed pipeline.
// Uses the CC0 red-fox reference, never the local-demo-only human portrait.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { formats, recordsOfKind, decodeMaskToRaster } from '@meta-sam/parser';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const base = 'http://127.0.0.1:5086/api/wildlens/';
async function request(path, body) {
  const response = await fetch(base + path, {
    signal: AbortSignal.timeout(195000),
    ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`${path}: ${result.code ?? response.status}: ${result.message ?? 'Request failed'}`);
  return result;
}
const config = await request('config');
console.log(JSON.stringify({ liveReady: config.liveReady, keyConfigured: config.keyConfigured,
  creditConfirmed: config.creditConfirmed, models: [config.visionModel, config.segmentationModel, config.imageModel] }, null, 2));
if (!process.argv.includes('--run')) {
  console.log('Configuration check only. No Meta requests made. Add --run for one Spark + SAM analysis and one Muse Image edit.');
  process.exit(0);
}
if (!config.liveReady) throw new Error('Finish local Meta setup and restart the API first. No Meta requests made.');
const imageBase64 = (await readFile(resolve(root, 'apps/mobile/assets/photos/red-fox.jpg'))).toString('base64');
const isolatedAnalysis = process.argv.includes('--spark-only');
const inspected = await request('analyze', { imageBase64, consent: true, subject: 'animal', segment: !isolatedAnalysis, style: 'Painterly', mood: 'Dreamlike' });
const output = resolve(root, '.artifacts'); await mkdir(output, { recursive: true });
await writeFile(resolve(output, 'meta-live-inspection.json'), JSON.stringify(inspected, null, 2));
if (isolatedAnalysis) { console.log('Spark analysis succeeded; SAM and image generation were not requested.'); process.exit(0); }
const parser = formats.segmentation.image().createParser();
parser.push(inspected.segmentationText);
const { result } = parser.finish({ status: 'completed' });
if (result.diagnostics.some(item => item.severity === 'error')) throw new Error('SAM mask validation failed. Image generation was not started.');
const masks = recordsOfKind(result.records, 'mask');
if (!masks.length) throw new Error('SAM found no subject. Image generation was not started.');
for (const record of masks) decodeMaskToRaster(record.mask);
// The browser studio additionally composites a transparent cutout reference.
// This API smoke test verifies decoding and edits the original photo directly.
const artwork = await request('generate', { imageBase64, ticket: inspected.ticket, consent: true,
  style: 'Painterly', mood: 'Dreamlike', animal: 'Fox' });
if (!artwork.image?.startsWith('data:image/png;base64,')) throw new Error('No PNG artwork was returned.');
await writeFile(resolve(output, 'meta-live-fox.png'), Buffer.from(artwork.image.slice('data:image/png;base64,'.length), 'base64'));
await writeFile(resolve(output, 'meta-live-fox-direction.json'), JSON.stringify(inspected.analysis, null, 2));
console.log(JSON.stringify({ status: 'passed', samMasksDecoded: masks.length,
  image: resolve(output, 'meta-live-fox.png'), promptVersion: artwork.promptVersion,
  note: 'Real API smoke test; generated quality still requires visual review. No automatic retries.' }, null, 2));
