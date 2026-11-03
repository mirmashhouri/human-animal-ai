// Explicit live verification: one licensed new portrait, one main-app click, no retries.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require(process.env.WILDLENS_PLAYWRIGHT_PATH || 'playwright');

(async () => {
  const root = path.resolve(__dirname, '..');
  const output = process.env.WILDLENS_PERSONALIZED_OUTPUT;
  if (!output || !path.resolve(output).startsWith(path.join(root, '.artifacts') + path.sep)) throw new Error('Use a fresh project artifact folder.');
  await fs.mkdir(output, { recursive: false });
  const feedbackFile = path.join(root, 'evaluation/private/preferences.jsonl');
  const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
  const before = digest(await fs.readFile(feedbackFile));
  const activationPath = (await fs.readFile(path.join(root, '.artifacts/latest-preference-activation-path.txt'), 'utf8')).trim();
  const activation = JSON.parse(await fs.readFile(path.join(activationPath, 'activation.json'), 'utf8'));
  assert.equal(activation.enabled, true); assert.ok(activation.readyForRetrieval > 0);
  const index = JSON.parse(await fs.readFile(path.join(root, 'evaluation/private/studio/memory-index.json'), 'utf8'));
  const queryFile = path.join(root, 'apps/mobile/assets/photos/sample-portrait.jpg');
  assert.ok(index.vectors.every(v => v.photoHash !== digest(require('node:fs').readFileSync(queryFile))), 'Use a new photo outside the teaching set.');
  const browser = await chromium.launch({ headless: true, executablePath: process.env.WILDLENS_CHROMIUM });
  let analysisCalls = 0, imageCalls = 0, inspection = null, result = null; const errors = [];
  const started = Date.now();
  try {
    const context = await browser.newContext({ viewport: { width: 1500, height: 1100 } });
    const page = await context.newPage(); page.setDefaultTimeout(30000); page.on('pageerror', e => errors.push(e.message));
    await page.route('**/api/wildlens/analyze', async route => {
      if (++analysisCalls > 1) throw new Error('One analysis request only; no automatic retry.');
      const response = await route.fetch({ timeout: 300000, maxRetries: 0 });
      inspection = await response.json();
      await fs.writeFile(path.join(output, 'inspection.json'), JSON.stringify(inspection, null, 2));
      if (!response.ok() || inspection.personalization?.status !== 'used' || inspection.personalization.examples < 1) {
        await route.fulfill({ status: 422, json: { message: 'The live check did not confirm preference retrieval. Image generation was not started.' } }); return;
      }
      await route.fulfill({ response });
    });
    await page.route('**/api/wildlens/generate', async route => {
      if (++imageCalls > 1 || inspection?.personalization?.status !== 'used') throw new Error('Image request bound or preference guard failed.');
      const response = await route.fetch({ timeout: 240000, maxRetries: 0 });
      result = await response.json();
      if (response.ok() && result.image?.startsWith('data:image/png;base64,')) {
        await fs.writeFile(path.join(output, 'artwork.png'), Buffer.from(result.image.slice('data:image/png;base64,'.length), 'base64'));
        await fs.writeFile(path.join(output, 'artwork-metadata.json'), JSON.stringify({ ...result, image: undefined }, null, 2));
      }
      await route.fulfill({ response });
    });
    await page.goto('http://localhost:8093/', { waitUntil: 'networkidle' });
    await page.getByText('Meta connected', { exact: true }).waitFor();
    const choosing = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Upload photo', exact: true }).click();
    await (await choosing).setFiles(queryFile);
    await page.getByRole('img', { name: 'Your uploaded photo', exact: true }).waitFor();
    assert.equal(analysisCalls + imageCalls, 0, 'No model calls before Create.');
    await page.getByRole('button', { name: 'Create my animal', exact: true }).click();
    console.log('One-click personalized creation started; at most two Spark + one SAM + one Muse Image calls.');
    await page.getByRole('img', { name: 'Your animal portrait', exact: true }).waitFor({ timeout: 390000 });
    await page.getByRole('img', { name: 'Your animal portrait', exact: true }).evaluate(img => img.decode());
    assert.equal(analysisCalls, 1); assert.equal(imageCalls, 1); assert.deepEqual(errors, []);
    await page.getByTestId('portrait-comparison').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, 'main-app-personalized.png'), fullPage: true });
    const after = digest(await fs.readFile(feedbackFile));
    assert.equal(after, before, 'Live creation must leave saved labels/choices untouched.');
    const summary = { status: 'passed', enabledTrainingExamples: activation.readyForRetrieval, confirmedChoices: activation.confirmedChoices,
      examplesUsed: inspection.personalization.examples, animal: inspection.analysis.animalName, reason: inspection.analysis.animalReason,
      promptVersion: inspection.promptVersion, segmentation: inspection.segmentationStatus, imageModel: result.model,
      mainAppRequests: { analysis: analysisCalls, imageGeneration: imageCalls }, maximumProviderCalls: 4,
      feedbackUnchanged: true, browserErrors: errors.length, elapsedSeconds: Math.round((Date.now() - started) / 1000),
      artwork: path.join(output, 'artwork.png'), screenshot: path.join(output, 'main-app-personalized.png'),
      query: 'New licensed CC0 sample portrait by Gromovataya, outside the teaching corpus. No fine-tuning or quality score claimed.' };
    await fs.writeFile(path.join(output, 'summary.json'), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary));
  } catch (error) {
    await fs.writeFile(path.join(output, 'partial-status.json'), JSON.stringify({ status: 'failed', error: error.message, analysisCalls, imageCalls,
      personalization: inspection?.personalization, providerError: result?.message, browserErrors: errors }, null, 2));
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
