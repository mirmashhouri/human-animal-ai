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
    await page.route('**/api/wildlens/config', route => route.fulfill({ json: { ...realConfig, liveReady: true, keyConfigured: true, creditConfirmed: true, paidRequestsEnabled: true, archiveEnabled: true } }));
    const analyses = [], renders = [];
    const archives = []; let failArchive = true;
    await page.route('**/api/wildlens/cards', async route => {
      const body = route.request().postDataJSON();
      assert.equal(body.consent, true); assert.ok(body.token.startsWith('archive-fixture-'));
      if (failArchive) return route.fulfill({ status: 503, json: { code: 'archive_unavailable', message: 'Simulated storage failure. Your card is still available to download.' } });
      archives.push(body);
      return route.fulfill({ json: { id: body.token, fileName: 'test-card.png', savedAt: new Date().toISOString() } });
    });
    let failGeneration = false, blockAnalysis = false, groupMode = false, releaseAnalysis, analysisStarted;
    const analysis = {
      subjectVisible: true, title: 'UI test portrait', pose: 'A gently turned head', composition: 'Soft framing', animalName: 'Fox',
      animalReason: 'Test explanation: the curved silhouette and turning pose suggest a fox.',
      story: 'A simulated visual story for interface verification.', palette: ['#123456', '#aa9966', '#557744'], caption: 'A playful, happy Fox'
    };
    await page.route('**/api/wildlens/analyze', async route => {
      const body = route.request().postDataJSON(); analyses.push(body);
      if (blockAnalysis) { analysisStarted?.(); await new Promise(resolve => { releaseAnalysis = resolve; }); }
      await route.fulfill({ json: { ticket: 'simulated-ticket', analysis: { ...analysis, palette: body.palette,
          ...(groupMode ? { groupPhoto: true, animalName: 'Animal portraits', subjects: [
            { id: 1, position: 'Viewer-left person in a gray cap', animalName: 'Fox', animalReason: 'First portrait: a turning pose suggests a fox.', pose: 'Keep the left head angle', caption: 'A playful, happy Fox' },
            { id: 2, position: 'Viewer-right person in a straw hat', animalName: 'Great horned owl', animalReason: 'Second portrait: a rounded silhouette suggests an owl.', pose: 'Keep the right head angle', caption: 'Dreamy wise owl · Gentle sideways gaze' }
          ] } : {}) }, segmentationStatus: groupMode ? 'skipped' : 'segmented', paletteSource: 'measured-in-browser', promptVersion: 'test-fixture',
        personalization: { status: 'baseline', examples: 0, version: 'simulated-memory' },
        segmentationText: groupMode ? '' : '<0f>0<|box;x1=10;y1=20;x2=14;y2=24;w=100;h=100|><|mask;x=0;y=0;data=5,5,!!!!!(QO(0lu8?|>' } }).catch(() => {});
    });
    await page.route('**/api/wildlens/generate', async route => {
      const body = route.request().postDataJSON(); renders.push(body);
      if (failGeneration) return route.fulfill({ status: 502, json: { code: 'simulated_error', message: 'Simulated provider failure; no retry.' } });
      // Simulate Meta's source-shaped result without sending a photo to a provider.
      const image = await page.evaluate(async ({ original, artwork }) => {
        const photo = new Image(), animal = new Image(); photo.src = original; animal.src = artwork;
        await Promise.all([photo.decode(), animal.decode()]);
        const canvas = document.createElement('canvas'); canvas.width = photo.naturalWidth; canvas.height = photo.naturalHeight;
        const ctx = canvas.getContext('2d'), scale = Math.max(canvas.width / animal.naturalWidth, canvas.height / animal.naturalHeight);
        const w = animal.naturalWidth * scale, h = animal.naturalHeight * scale;
        ctx.drawImage(animal, (canvas.width-w)/2, (canvas.height-h)/2, w, h); return canvas.toDataURL('image/png');
      }, { original: 'data:image/jpeg;base64,' + body.imageBase64, artwork: 'data:image/png;base64,' + fixturePng.toString('base64') });
      return route.fulfill({ json: { image, model: 'simulated-muse-image', promptVersion: 'test-fixture', notice: 'UI fixture, not a new model result.', archiveToken: 'archive-fixture-' + renders.length } });
    });
    await page.goto('http://localhost:8093', { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Your selfie, a little wilder.', exact: true }).waitFor();
    assert.equal(await page.getByText('Your creative direction', { exact: true }).count(), 0);
    assert.equal(await page.getByRole('checkbox').count(), 0);
    assert.equal(await page.getByRole('switch').count(), 0);
    assert.equal(await page.getByRole('button', { name: /Art style:|Animal inspiration:|Choose an atmosphere:/ }).count(), 0);
    await page.screenshot({ path: path.join(output, 'wildlens-minimal-home.png') });
    assert.equal(await page.getByRole('button', { name: 'Explore the demo', exact: true }).count(), 0);
    assert.equal(await page.getByText('Meta connected', { exact: true }).count(), 0);
    assert.match(await page.title(), /^Wildfie/);
    const favicon = await context.request.get('http://localhost:8093/favicon.ico');
    assert.equal(favicon.status(), 200); assert.match(favicon.headers()['content-type'], /image\//);
    assert.ok((await favicon.body()).length > 100, 'A real browser-tab icon is served');
    async function upload(shape) {
      const chooserEvent = page.waitForEvent('filechooser');
      const label = await page.getByRole('button', { name: 'Upload photo', exact: true }).count() ? 'Upload photo' : 'Change photo';
      await page.getByRole('button', { name: label, exact: true }).click();
      const chooser = await chooserEvent;
      if (!shape) await chooser.setFiles(path.join(root, 'apps/mobile/assets/photos/sample-portrait.jpg'));
      else {
        const data = await page.evaluate(async ({ source, width, height }) => {
          const image = new Image(); image.src = source; await image.decode();
          const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
          const ctx = canvas.getContext('2d'), scale = Math.max(width/image.naturalWidth, height/image.naturalHeight);
          const w = image.naturalWidth*scale, h = image.naturalHeight*scale; ctx.drawImage(image,(width-w)/2,(height-h)/2,w,h);
          return canvas.toDataURL('image/jpeg').split(',')[1];
        }, { source: 'data:image/jpeg;base64,' + (await fs.readFile(path.join(root, 'apps/mobile/assets/photos/sample-portrait.jpg'))).toString('base64'), ...shape });
        await chooser.setFiles({ name: 'shape-fixture.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(data, 'base64') });
      }
      await page.getByRole('img', { name: 'Your uploaded photo', exact: true }).waitFor();
    }
    await upload({ width: 300, height: 1800 });
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 375, height: 667 }]) {
      await page.setViewportSize(viewport);
      const panel = await page.getByTestId('upload-panel').boundingBox();
      const create = await page.getByRole('button', { name: 'Create my animal', exact: true }).boundingBox();
      assert.ok(panel.height < viewport.height, 'A tall image cannot make its upload card taller than the screen');
      assert.ok(create.y >= 0 && create.y + create.height <= viewport.height, 'The create button stays on screen with a tall portrait');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2), false);
    }
    await page.screenshot({ path: path.join(output, 'wildfie-tall-upload-mobile.png') });
    await page.setViewportSize({ width: 1440, height: 1100 });
    await upload();
    assert.equal(await page.getByText(/A copy of your final comparison card will be saved on our server\./).count(), 1);
    assert.equal(analyses.length, 0, 'Selecting a photo must not send it to Meta');
    await page.getByRole('button', { name: 'Create my animal', exact: true }).click();
    await page.getByRole('img', { name: 'Your animal portrait', exact: true }).waitFor();
    assert.equal(analyses.length, 1); assert.equal(renders.length, 1, 'One click runs analysis and generation exactly once');
    assert.deepEqual({ style: analyses[0].style, mood: analyses[0].mood, subject: analyses[0].subject, segment: analyses[0].segment },
      { style: 'Painterly', mood: 'Dreamlike', subject: 'person', segment: true });
    assert.equal(analyses[0].consent, true); assert.equal(renders[0].consent, true);
    assert.equal(renders[0].animal, 'Suggested'); assert.equal(renders[0].imageBase64, analyses[0].imageBase64);
    assert.ok(renders[0].isolatedSubject.startsWith('iVBOR'), 'A real decoded mask creates the second PNG reference');
    await page.getByTestId('portrait-caption').filter({ hasText: analysis.caption }).waitFor();
    await page.getByRole('button', { name: 'Retry server save', exact: true }).waitFor();
    failArchive = false;
    await page.getByRole('button', { name: 'Retry server save', exact: true }).click();
    await page.getByTestId('server-save-status').waitFor();
    assert.equal(archives.length, 1); assert.equal(renders.length, 1, 'Retrying storage never regenerates or calls Meta again');
    assert.equal(await page.getByText(analysis.animalReason, { exact: true }).count(), 0);
    assert.equal(await page.getByTestId('portrait-details').count(), 0);
    for (const removed of ['WHY THIS ANIMAL', 'WHY THESE ANIMALS', 'A little story', 'Your colors', 'Expression & atmosphere']) assert.equal(await page.getByText(removed, { exact: true }).count(), 0);
    assert.equal(await page.getByText('The details that make it yours', { exact: true }).count(), 0, 'Original API response needs no new feature-transfer fields');
    assert.equal(await page.getByTestId('original-portrait-column').getByText('You', { exact: true }).count(), 0);
    assert.equal(await page.getByTestId('animal-portrait-column').getByText('Fox', { exact: true }).count(), 0);
    assert.ok(Number(await page.getByTestId('portrait-caption').getByText('Fox', { exact: true }).evaluate(el => getComputedStyle(el).fontWeight)) >= 700);
    const sourceShape = async () => page.evaluate(async data => { const image = new Image(); image.src = data; await image.decode(); return image.naturalWidth/image.naturalHeight; }, 'data:image/jpeg;base64,' + analyses.at(-1).imageBase64);
    async function assertLayout() {
      const original = await page.getByTestId('original-portrait-column').boundingBox();
      const animal = await page.getByTestId('animal-portrait-column').boundingBox();
      const comparison = await page.getByTestId('portrait-comparison').boundingBox();
      const caption = await page.getByTestId('artwork-caption').boundingBox();
      assert.ok(original && animal && comparison && caption);
      assert.ok(original.x + original.width <= animal.x + 1, 'Human and animal stay side by side');
      assert.ok(Math.abs(original.y - animal.y) < 2);
      const ratio = await sourceShape();
      assert.ok(Math.abs(original.width/original.height-ratio) < .02 && Math.abs(animal.width/animal.height-ratio) < .02, 'Both cards retain the uploaded photo ratio');
      assert.ok(caption.y >= comparison.y + comparison.height, 'The short caption sits below both images');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2), false);
    }
    await assertLayout();
    await page.getByTestId('portrait-comparison').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, 'wildlens-minimal-comparison-desktop.png') });
    await page.getByTestId('portrait-share-card').screenshot({ path: path.join(output, 'wildlens-share-card-desktop.png') });
    const desktopDownload = page.waitForEvent('download', { timeout: 10000 }).catch(() => null);
    await page.getByRole('button', { name: 'Save image', exact: true }).click();
    const desktopFile = await desktopDownload;
    if (!desktopFile) { await page.screenshot({ path: path.join(output, 'wildlens-export-error.png') }); throw new Error('Export failed: ' + (await page.getByRole('alert').allTextContents()).join(' / ') + ' / Browser: ' + errors.join(' / ')); }
    const desktopPng = await fs.readFile(await desktopFile.path());
    assert.deepEqual(Buffer.from(archives[0].imageBase64, 'base64'), desktopPng, 'The automatic server copy is the exact same combined PNG as the download');
    await page.setViewportSize({ width: 390, height: 844 });
    await assertLayout();
    await page.getByTestId('portrait-comparison').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, 'wildlens-minimal-comparison-mobile.png') });
    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save image', exact: true }).click();
    const download = await downloadEvent; assert.equal(download.suggestedFilename(), 'wildfie-portrait.png');
    const png = await fs.readFile(await download.path());
    assert.equal(png.readUInt32BE(16), 1800, 'The saved comparison has full resolution even from a narrow screen');
    const firstRatio = await sourceShape();
    const footerTop = Math.ceil(42 + 846 / firstRatio + 36);
    assert.ok(Math.abs(png.readUInt32BE(20) - (footerTop + 48 + 42)) <= 1, 'The PNG follows the original ratio with one phrase beneath');
    assert.ok(png.equals(desktopPng), 'Desktop and mobile save the same complete card');
    await fs.writeFile(path.join(output, 'wildlens-share-portrait.png'), png);
    const pixels = await page.evaluate(async ({ data, footerTop, imageHeight }) => {
      const image = new Image(); image.src = data; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
      function colors(x, y, w, h) { const pixels = ctx.getImageData(x, y, w, h).data, values = new Set(); for (let i = 0; i < pixels.length; i += 160) values.add(`${pixels[i] >> 4},${pixels[i+1] >> 4},${pixels[i+2] >> 4}`); return values.size; }
      const footer = ctx.getImageData(42, footerTop, 1716, canvas.height - footerTop).data; let textInk = 0;
      for (let i = 0; i < footer.length; i += 4) if (footer[i] < 120 && footer[i+1] < 140 && footer[i+2] < 120) textInk++;
      return { left: colors(70, 55, 780, Math.floor(imageHeight-25)), right: colors(950, 55, 780, Math.floor(imageHeight-25)), textInk };
    }, { data: 'data:image/png;base64,' + png.toString('base64'), footerTop, imageHeight: 846/firstRatio });
    assert.ok(pixels.left > 20 && pixels.right > 20 && pixels.textInk > 100, 'The PNG contains two real portraits and rasterized caption text below');
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
    await page.getByTestId('subject-caption-1').filter({ hasText: 'A playful, happy Fox' }).waitFor();
    assert.equal(await page.getByTestId('preference-guidance').count(), 0, 'Baseline results must not claim preference guidance');
    await page.getByTestId('subject-caption-2').filter({ hasText: 'A dreamy wise Great horned owl' }).waitFor();
    assert.equal(await page.getByText(/Gentle sideways gaze/).count(), 0);
    assert.ok(Number(await page.getByTestId('subject-caption-2').getByText('Great horned owl', { exact: true }).evaluate(el => getComputedStyle(el).fontWeight)) >= 700);
    assert.equal(renders.length, 3, 'A group creates one combined image with one click');
    assert.equal(renders[2].isolatedSubject, undefined, 'Group generation must not receive a one-person cutout');
    assert.equal(renders[2].imageBase64, analyses.at(-1).imageBase64, 'The entire original group photo reaches generation');
    await assertLayout();
    await page.getByTestId('artwork-caption').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, 'wildlens-group-details-mobile.png') });
    await page.setViewportSize({ width: 1440, height: 1100 }); await assertLayout();
    const groupDownload = page.waitForEvent('download'); await page.getByRole('button', { name: 'Save image', exact: true }).click();
    const groupPng = await fs.readFile(await (await groupDownload).path()); assert.ok(groupPng.readUInt32BE(20) > png.readUInt32BE(20), 'Every group member caption fits in the saved image');
    await fs.writeFile(path.join(output, 'wildlens-share-group.png'), groupPng);
    groupMode = false;
    for (const shape of [{ width: 600, height: 800 }, { width: 800, height: 800 }]) {
      await page.getByRole('button', { name: 'Start over', exact: true }).click(); await upload(shape);
      await page.getByRole('button', { name: 'Create my animal', exact: true }).click(); await page.getByTestId('portrait-caption').waitFor();
      await assertLayout();
      const event = page.waitForEvent('download'); await page.getByRole('button', { name: 'Save image', exact: true }).click();
      const saved = await fs.readFile(await (await event).path());
      const expected = Math.ceil(42 + 846 * shape.height / shape.width + 36 + 48 + 42);
      assert.equal(saved.readUInt32BE(20), expected, 'Portrait and square PNGs use the source aspect ratio');
    }
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ status: 'passed', oneClickPipeline: true, hiddenDefaults: true, noUploadBeforeGenerate: true,
      sideBySideAtDesktopAnd390px: true, captionBelowImages: true, exportedBothPortraitsAndCaption: true, exportWidth: 1800, groupAssignments: true,
      originalAspectRatio: ['landscape', 'portrait', 'square'], fullAnimalNameBold: true, noRepeatedLabels: true,
      tallUploadFitsDesktopAndMobile: true, noFooterOrDemo: true, brandAndFavicon: 'Wildfie',
      automaticServerCard: true, archiveFailurePreservesResult: true, storageRetryMakesNoMetaCalls: true,
      wholeGroupReference: true, cancellation: 'stops next paid stage', additionalMetaCalls: 0, pageErrors: errors }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
