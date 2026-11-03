const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(process.env.WILDLENS_PLAYWRIGHT_PATH || 'playwright');

(async () => {
  const root = path.resolve(__dirname, '..');
  const host = 'http://127.0.0.1:5088';
  const browser = await chromium.launch({ headless: true, ...(process.env.WILDLENS_CHROMIUM ? { executablePath: process.env.WILDLENS_CHROMIUM } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1050 }, acceptDownloads: true });
    const config = await (await page.request.get(host + '/api/wildlens/config')).json();
    assert.equal(config.archiveEnabled, true); assert.equal(config.paidRequestsEnabled, false);
    const animal = 'data:image/png;base64,' + (await fs.readFile(path.join(root, '.artifacts/meta-live-fox.png'))).toString('base64');
    const photo = path.join(root, 'apps/mobile/assets/photos/sample-portrait.jpg');
    let receipt, postStatus, generationCalls = 0, saveCalls = 0;
    await page.route('**/api/wildlens/config', route => route.fulfill({ json: { ...config, liveReady: true } }));
    await page.route('**/api/wildlens/analyze', route => route.fulfill({ json: {
      ticket: 'simulated-analysis', segmentationStatus: 'skipped', segmentationText: '',
      analysis: { subjectVisible: true, title: 'Local disk verification', pose: 'Turned head', composition: 'Portrait', animalName: 'Fox', animalReason: 'Local fixture', story: 'Local fixture', palette: ['#885533','#ddbb99','#554433'], caption: 'A playful, happy Fox' },
    } }));
    await page.route('**/api/wildlens/generate', async route => {
      generationCalls++;
      const permit = await (await page.request.get(host + '/__test/permit')).json();
      await route.fulfill({ json: { image: animal, model: 'local fixture', promptVersion: 'local-check', notice: 'No Meta call', archiveToken: permit.token } });
    });
    // Only redirect the port. The POST body, response and disk write are real.
    await page.route('**/api/wildlens/cards', async route => { saveCalls++; await route.continue({ url: host + '/api/wildlens/cards' }); });
    page.on('response', async response => {
      if (response.url().endsWith('/api/wildlens/cards') && response.request().method() === 'POST') {
        postStatus = response.status(); receipt = await response.json();
      }
    });
    await page.goto('http://localhost:8093/', { waitUntil: 'networkidle' });
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Upload photo', exact: true }).click();
    await (await chooser).setFiles(photo);
    await page.getByRole('img', { name: 'Your uploaded photo', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Create my animal', exact: true }).click();
    await page.getByTestId('server-save-status').waitFor({ timeout: 30000 });
    assert.equal(postStatus, 200); assert.ok(receipt?.fileName);
    const day = new Date(receipt.savedAt).toISOString().slice(0, 10);
    const file = path.join(root, '.artifacts/archive-browser-cards', day, receipt.fileName);
    const disk = await fs.readFile(file);
    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save image', exact: true }).click();
    const download = await downloadEvent;
    assert.deepEqual(disk, await fs.readFile(await download.path()));
    assert.equal(generationCalls, 1); assert.equal(saveCalls, 1);
    await page.getByTestId('portrait-share-card').screenshot({ path: path.join(root, '.artifacts/archive-real-disk-card.png') });
    console.log(JSON.stringify({ status: 'passed', realHttpPost: postStatus, savedFile: file, bytes: disk.length, sameAsDownload: true, generationCalls, saveCalls, metaCalls: 0 }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
