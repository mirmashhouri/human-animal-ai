const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(process.env.WILDLENS_PLAYWRIGHT_PATH || 'playwright');
(async () => {
  const root = path.resolve(__dirname, '..');
  const output = path.join(root, '.artifacts'); await fs.mkdir(output, { recursive: true });
  const fixturePng = await fs.readFile(path.join(output, 'meta-live-fox.png')).catch(() => Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1ioAAAAASUVORK5CYII=', 'base64'));
  const browser = await chromium.launch({ headless: true, ...(process.env.WILDLENS_CHROMIUM ? { executablePath: process.env.WILDLENS_CHROMIUM } : {}) });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
    const page = await context.newPage(); page.setDefaultTimeout(30000);
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const realConfigResponse = await context.request.get('http://localhost:5086/api/wildlens/config');
    const realConfig = await realConfigResponse.json(); assert.equal(realConfigResponse.status(), 200);
    // All generation endpoints are intercepted BEFORE navigation or file selection.
    // The local-demo-only human photograph never reaches the real API or a model.
    await page.route('**/api/wildlens/config', route => route.fulfill({ json: { ...realConfig, liveReady: true, keyConfigured: true, creditConfirmed: true, paidRequestsEnabled: true } }));
    const analyses = [], renders = [];
    let failGeneration = false, blockAnalysis = false, groupMode = false, releaseAnalysis, analysisStarted;
    const analysis = {
      subjectVisible: true, title: 'UI test portrait', pose: 'A gently turned head', composition: 'Soft framing', animalName: 'Fox',
      animalReason: 'Test explanation: the curved silhouette and turning pose suggest a fox.',
      story: 'A simulated visual story for interface verification.', palette: ['#123456', '#aa9966', '#557744']
    };
    await page.route('**/api/wildlens/analyze', async route => {
      const body = route.request().postDataJSON(); analyses.push(body);
      if (blockAnalysis) { analysisStarted?.(); await new Promise(resolve => { releaseAnalysis = resolve; }); }
      await route.fulfill({ json: { ticket: 'simulated-ticket', analysis: { ...analysis, palette: body.palette,
          ...(groupMode ? { groupPhoto: true, animalName: 'Animal portraits', subjects: [
            { id: 1, position: 'Viewer-left person in a gray cap', animalName: 'Fox', animalReason: 'First portrait: a turning pose suggests a fox.', pose: 'Keep the left head angle' },
            { id: 2, position: 'Viewer-right person in a straw hat', animalName: 'Owl', animalReason: 'Second portrait: a rounded silhouette suggests an owl.', pose: 'Keep the right head angle' }
          ] } : {}) }, segmentationStatus: groupMode ? 'skipped' : 'segmented', paletteSource: 'measured-in-browser', promptVersion: 'test-fixture',
        segmentationText: groupMode ? '' : '<0f>0<|box;x1=10;y1=20;x2=14;y2=24;w=100;h=100|><|mask;x=0;y=0;data=5,5,!!!!!(QO(0lu8?|>' } }).catch(() => {});
    });
    await page.route('**/api/wildlens/generate', async route => {
      const body = route.request().postDataJSON(); renders.push(body);
      if (failGeneration) return route.fulfill({ status: 502, json: { code: 'simulated_error', message: 'Simulated provider failure; no retry.' } });
      return route.fulfill({ json: { image: 'data:image/png;base64,' + fixturePng.toString('base64'), model: 'simulated-muse-image', promptVersion: 'test-fixture', notice: 'UI fixture, not a new model result.' } });
    });
    await page.goto('http://localhost:8093', { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Your portrait, a little wilder.', exact: true }).waitFor();
    assert.equal(await page.getByText('Your creative direction', { exact: true }).count(), 0);
    assert.equal(await page.getByRole('checkbox').count(), 0);
    assert.equal(await page.getByRole('switch').count(), 0);
    assert.equal(await page.getByRole('button', { name: /Art style:|Animal inspiration:|Choose an atmosphere:/ }).count(), 0);
    await page.screenshot({ path: path.join(output, 'wildlens-minimal-home.png') });
    await page.getByRole('button', { name: 'Explore the demo', exact: true }).click();
    await page.getByText('Reference photo · layout demo', { exact: true }).waitFor();
    assert.equal(analyses.length + renders.length, 0, 'Local demo must make no provider-facing requests');
    await page.reload({ waitUntil: 'networkidle' });
    async function upload() {
      const chooserEvent = page.waitForEvent('filechooser');
      const label = await page.getByRole('button', { name: 'Upload photo', exact: true }).count() ? 'Upload photo' : 'Change photo';
      await page.getByRole('button', { name: label, exact: true }).click();
      const chooser = await chooserEvent;
      await chooser.setFiles(path.join(root, 'apps/mobile/assets/photos/sample-portrait.jpg'));
      await page.getByRole('img', { name: 'Your uploaded photo', exact: true }).waitFor();
    }
    await upload();
    assert.equal(analyses.length, 0, 'Selecting a photo must not send it to Meta');
    await page.getByRole('button', { name: 'Create my animal', exact: true }).click();
    await page.getByRole('img', { name: 'Your animal portrait', exact: true }).waitFor();
    assert.equal(analyses.length, 1); assert.equal(renders.length, 1, 'One click runs analysis and generation exactly once');
    assert.deepEqual({ style: analyses[0].style, mood: analyses[0].mood, subject: analyses[0].subject, segment: analyses[0].segment },
      { style: 'Painterly', mood: 'Dreamlike', subject: 'person', segment: true });
    assert.equal(analyses[0].consent, true); assert.equal(renders[0].consent, true);
    assert.equal(renders[0].animal, 'Suggested'); assert.equal(renders[0].imageBase64, analyses[0].imageBase64);
    assert.ok(renders[0].isolatedSubject.startsWith('iVBOR'), 'A real decoded mask creates the second PNG reference');
    await page.getByText(analysis.animalReason, { exact: true }).waitFor();
    assert.equal(await page.getByText('The details that make it yours', { exact: true }).count(), 0, 'Original API response needs no new feature-transfer fields');
    async function assertLayout() {
      const original = await page.getByTestId('original-portrait-column').boundingBox();
      const animal = await page.getByTestId('animal-portrait-column').boundingBox();
      const comparison = await page.getByTestId('portrait-comparison').boundingBox();
      const details = await page.getByTestId('portrait-details').boundingBox();
      assert.ok(original && animal && comparison && details);
      assert.ok(original.x + original.width <= animal.x + 1, 'Human and animal stay side by side');
      assert.ok(Math.abs(original.y - animal.y) < 2);
      assert.ok(details.y >= comparison.y + comparison.height, 'Explanations sit below the images');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2), false);
    }
    await assertLayout();
    await page.getByTestId('portrait-comparison').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, 'wildlens-minimal-comparison-desktop.png') });
    await page.getByText('Your colors', { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, 'wildlens-minimal-details.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await assertLayout();
    await page.getByTestId('portrait-comparison').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, 'wildlens-minimal-comparison-mobile.png') });
    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save my animal', exact: true }).click();
    const download = await downloadEvent; assert.equal(download.suggestedFilename(), 'wildlens-artwork.png');
    await page.getByRole('button', { name: 'Start over', exact: true }).click();
    assert.equal(await page.getByRole('img', { name: 'Your original portrait', exact: true }).count(), 0);
    await upload(); failGeneration = true;
    await page.getByRole('button', { name: 'Create my animal', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Simulated provider failure' }).waitFor();
    assert.equal(analyses.length, 2); assert.equal(renders.length, 2);
    assert.equal(await page.getByRole('img', { name: 'Your animal portrait', exact: true }).count(), 0, 'Failed creation must not show stale artwork');
    failGeneration = false; blockAnalysis = true;
    const started = new Promise(resolve => { analysisStarted = resolve; });
    await page.getByRole('button', { name: 'Create my animal', exact: true }).click(); await started;
    await page.getByRole('button', { name: 'Stop', exact: true }).click(); releaseAnalysis();
    await page.getByRole('alert').filter({ hasText: 'Creation stopped' }).waitFor();
    assert.equal(renders.length, 2, 'Stopping analysis must prevent the next image request');
    blockAnalysis = false; groupMode = true;
    await page.getByRole('button', { name: 'Create my animal', exact: true }).click();
    await page.getByText('WHY THESE ANIMALS', { exact: true }).waitFor();
    await page.getByTestId('subject-reason-1').getByText('Fox', { exact: true }).waitFor();
    await page.getByTestId('subject-reason-2').getByText('Owl', { exact: true }).waitFor();
    assert.equal(renders.length, 3, 'A group creates one combined image with one click');
    assert.equal(renders[2].isolatedSubject, undefined, 'Group generation must not receive a one-person cutout');
    assert.equal(renders[2].imageBase64, analyses.at(-1).imageBase64, 'The entire original group photo reaches generation');
    await assertLayout();
    await page.getByText('WHY THESE ANIMALS', { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, 'wildlens-group-details-mobile.png') });
    await page.setViewportSize({ width: 1440, height: 1100 }); await assertLayout();
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ status: 'passed', oneClickPipeline: true, hiddenDefaults: true, noUploadBeforeGenerate: true,
      sideBySideAtDesktopAnd390px: true, detailsBelowImages: true, originalApiResponse: true, groupAssignments: true,
      wholeGroupReference: true, cancellation: 'stops next paid stage', additionalMetaCalls: 0, pageErrors: errors }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
