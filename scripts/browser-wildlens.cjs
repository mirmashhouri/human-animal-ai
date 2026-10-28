const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(process.env.WILDLENS_PLAYWRIGHT_PATH || 'playwright');

(async () => {
  const root = path.resolve(__dirname, '..');
  const output = path.join(root, '.artifacts'); await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, ...(process.env.WILDLENS_CHROMIUM ? { executablePath: process.env.WILDLENS_CHROMIUM } : {}) });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, acceptDownloads: true });
    const page = await context.newPage(); page.setDefaultTimeout(30000);
    const errors = [], uploads = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (/\/api\/wildlens\/(analyze|generate)/.test(request.url())) uploads.push(request.url()); });
    const configResponse = await context.request.get('http://localhost:5086/api/wildlens/config');
    const config = await configResponse.json();
    assert.equal(configResponse.status(), 200); assert.equal(typeof config.liveReady, 'boolean');
    assert.equal(config.visionModel, 'muse-spark-1.3');
    await page.goto('http://localhost:8093', { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: /See yourself/ }).waitFor();
    await page.screenshot({ path: path.join(output, 'wildlens-home-desktop.png'), fullPage: true });
    await page.getByRole('button', { name: 'Explore the local demo', exact: true }).click();
    await page.getByText('Reference photo · layout demo', { exact: true }).waitFor();
    assert.equal(uploads.length, 0, 'Local demo must not upload photos');
    await page.screenshot({ path: path.join(output, 'wildlens-local-demo.png'), fullPage: true });
    await page.getByRole('button', { name: 'Clear session', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(output, 'wildlens-home-mobile.png'), fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2), false, 'Mobile layout must fit');

    // Simulate the provider-facing API contract in this isolated browser only.
    // Analyze/generate are intercepted before any upload, even when the real API is live.
    await page.route('**/api/wildlens/config', route => route.fulfill({ json: { ...config, liveReady: true, keyConfigured: true, creditConfirmed: true, paidRequestsEnabled: true } }));
    let analyzeBody, renderBody, failGeneration = false;
    const analysis = { subjectVisible: true, title: 'Simulated woodland portrait', pose: 'Fixture: gently turned head', composition: 'Fixture: soft light',
      animalName: 'Fox', animalReason: 'Fixture: a fox silhouette', story: 'Simulated visual story for browser verification.', palette: ['#123456', '#aa9966', '#557744'] };
    await page.route('**/api/wildlens/analyze', async route => {
      analyzeBody = route.request().postDataJSON();
      await route.fulfill({ json: { ticket: 'simulated-ticket', analysis, segmentationStatus: 'segmented', paletteSource: 'measured-in-browser', promptVersion: 'test-fixture',
        segmentationText: '<0f>0<|box;x1=10;y1=20;x2=14;y2=24;w=100;h=100|><|mask;x=0;y=0;data=5,5,!!!!!(QO(0lu8?|>' } });
    });
    await page.route('**/api/wildlens/generate', async route => {
      renderBody = route.request().postDataJSON();
      if (failGeneration) return route.fulfill({ status: 502, json: { code: 'simulated_error', message: 'Simulated provider failure; no retry.' } });
      await route.fulfill({ json: { image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1ioAAAAASUVORK5CYII=', model: 'simulated-muse-image', promptVersion: 'test-fixture', notice: 'Simulated output, not generated artwork.' } });
    });
    await page.reload({ waitUntil: 'networkidle' });
    const chooserEvent = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Upload photo', exact: true }).click();
    const chooser = await chooserEvent;
    await chooser.setFiles(path.join(root, 'apps/mobile/assets/photos/sample-portrait.jpg'));
    await page.getByRole('img', { name: 'Your uploaded photo', exact: true }).waitFor();
    const analyze = page.getByRole('button', { name: 'Analyze my photo', exact: true });
    assert.equal(await analyze.isEnabled(), false, 'Consent must gate upload');
    await page.getByRole('checkbox').click();
    await analyze.click();
    await page.getByRole('img', { name: 'Subject isolated by SAM', exact: true }).waitFor();
    assert.equal(analyzeBody.consent, true); assert.equal(analyzeBody.segment, true);
    assert.ok(analyzeBody.imageBase64.startsWith('/9j/')); assert.ok(analyzeBody.palette.length > 0);
    await page.getByRole('button', { name: 'Create my wild portrait', exact: true }).click();
    await page.getByRole('img', { name: 'Your Meta-generated animal-inspired portrait', exact: true }).waitFor();
    assert.equal(renderBody.imageBase64, analyzeBody.imageBase64, 'The original image must reach editing');
    assert.equal(renderBody.ticket, 'simulated-ticket');
    assert.ok(renderBody.isolatedSubject.startsWith('iVBOR'), 'The decoded SAM cutout is a PNG reference');
    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Keep my artwork', exact: true }).click();
    const download = await downloadEvent;
    assert.equal(download.suggestedFilename(), 'wildlens-artwork.png');
    await download.saveAs(path.join(output, 'simulated-download.png'));
    failGeneration = true;
    await page.getByRole('button', { name: 'Create another portrait', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Simulated provider failure' }).waitFor();
    assert.equal(await page.getByRole('img', { name: 'Your Meta-generated animal-inspired portrait', exact: true }).count(), 0, 'A failed generation cannot masquerade as earlier artwork');
    assert.equal(uploads.filter(url => url.endsWith('/generate')).length, 2, 'Failed generation is not retried');
    await page.getByRole('button', { name: 'Clear session', exact: true }).click();
    assert.equal(await page.getByRole('img', { name: 'Your uploaded photo', exact: true }).count(), 0);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ status: 'passed', realApiConfiguration: config.liveReady ? 'live requests enabled' : 'live requests disabled', demoUploads: 0,
      simulatedAnalysisCalls: 1, simulatedGenerationCalls: 2, samCutout: 'decoded and sent', consent: 'enforced', download: 'PNG', mobileOverflow: false, pageErrors: errors }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
