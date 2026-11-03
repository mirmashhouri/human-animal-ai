// Render saved REAL Meta results through the browser UI without another provider call.
// The browser request/response boundary is replayed; it is not another paid end-to-end run.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(process.env.WILDLENS_PLAYWRIGHT_PATH || 'playwright');
(async () => {
  const root = path.resolve(__dirname, '..');
  const output = path.join(root, '.artifacts');
  const inspection = JSON.parse(await fs.readFile(path.join(output, 'meta-live-inspection.json'), 'utf8'));
  const png = await fs.readFile(path.join(output, 'meta-live-fox.png'));
  const browser = await chromium.launch({ headless: true, ...(process.env.WILDLENS_CHROMIUM ? { executablePath: process.env.WILDLENS_CHROMIUM } : {}) });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
    const page = await context.newPage(); page.setDefaultTimeout(30000);
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    let cutoutBytes = 0;
    await page.route('**/api/wildlens/analyze', route => route.fulfill({ json: inspection }));
    await page.route('**/api/wildlens/generate', async route => {
      const body = route.request().postDataJSON();
      assert.ok(body.isolatedSubject, 'The real SAM result must produce a cutout');
      const cutout = Buffer.from(body.isolatedSubject, 'base64');
      assert.equal(cutout.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
      cutoutBytes = cutout.length;
      await fs.writeFile(path.join(output, 'meta-live-fox-cutout.png'), cutout);
      await route.fulfill({ json: { image: 'data:image/png;base64,' + png.toString('base64'), model: 'muse-image-1.0',
        promptVersion: inspection.promptVersion, notice: 'Saved real Meta artwork replayed without another model request.' } });
    });
    await page.goto('http://localhost:8093', { waitUntil: 'networkidle' });
    const chooserEvent = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Upload photo', exact: true }).click();
    const chooser = await chooserEvent;
    await chooser.setFiles(path.join(root, 'apps/mobile/assets/photos/red-fox.jpg'));
    await page.getByRole('img', { name: 'Your uploaded photo', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Create my animal', exact: true }).click();
    await page.getByRole('button', { name: 'Save image', exact: true }).waitFor();
    await page.getByTestId('portrait-comparison').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, 'wildlens-real-meta-result-minimal.png') });
    assert.ok(cutoutBytes > 1000); assert.deepEqual(errors, []);
    console.log(JSON.stringify({ status: 'passed', mode: 'saved-real-response-replay', realMaskCutoutBytes: cutoutBytes,
      artworkDecoded: true, pageErrors: errors, additionalMetaCalls: 0 }, null, 2));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
