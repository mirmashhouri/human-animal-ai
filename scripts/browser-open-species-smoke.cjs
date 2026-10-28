// Isolated agent-browser only. Stub EVERY match response: never forwards a portrait to the API.
// Real public iNaturalist photo loads are allowed; the result is explicitly a test fixture.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const catalogue = require('../data/animals.json');

(async () => {
  assert.match(process.env.KINFORM_CDP_URL || '', /^ws:\/\/127\.0\.0\.1:\d+\//);
  const browser = await chromium.connectOverCDP(process.env.KINFORM_CDP_URL);
  try {
    const context = browser.contexts()[0];
    const page = context.pages().find(p => p.url().startsWith('http://localhost:8081'));
    assert.ok(page, 'The isolated app must already be open.');
    const errors = [];
    let intercepted = 0;
    const searchRequests = [];
    // Exercise real clicks/popups but do not send simulated personal search words externally.
    await context.route(/^https:\/\/www\.(google|pinterest)\.com\//, route => {
      searchRequests.push({ url: route.request().url(), body: route.request().postData() });
      return route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Stubbed image search</title>Search test only; no external request.' });
    });
    page.on('pageerror', e => errors.push(e.message));
    const lion = { ...catalogue[0], id: 'inat-41964', name: 'Lion', scientificName: 'Panthera leo',
      imagePath: 'https://inaturalist-open-data.s3.amazonaws.com/photos/12610319/medium.jpg',
      photoCredit: '(c) Luis G. Restrepo, some rights reserved (CC BY) · iNaturalist',
      sourceUrl: 'https://www.inaturalist.org/photos/12610319', licenseUrl: 'https://www.inaturalist.org/photos/12610319',
      speciesSourceUrl: 'https://www.inaturalist.org/taxa/41964', photoStatus: 'available', photoReviewStatus: 'approved',
      matchReason: 'SIMULATED TEST: shape explanation rendering only, not a real analysis.', traits: [],
      searchKeywords: ['broad face', 'almond shaped eyes'],
      description: 'Real public species photo; simulated AI result.' };
    const result = { id: 'simulated-browser-test', isDemo: false, catalogueVersion: 'open-species-v2',
      notice: 'SIMULATED TEST RESULT — no AI analysis was performed.',
      features: [{ feature: 'Face outline', observation: 'SIMULATED TEST observation, not a measurement.' }],
      matches: [lion, catalogue[1], { ...catalogue[2], id: 'missing-test', imagePath: '', photoStatus: 'unavailable', photoReviewStatus: 'no_suitable' }]
        .map((animal, i) => ({ rank: i + 1, animal })) };
    await context.route('**/api/matches', route => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: {
        'access-control-allow-origin': 'http://localhost:8081', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'Content-Type'
      } });
      intercepted++;
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': 'http://localhost:8081' }, body: JSON.stringify(result) });
    });
    await context.route('**/api.openai.com/**', route => route.abort());
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.goto('http://localhost:8081/');
    await page.getByText('AI FEATURES + OPEN SPECIES', { exact: true }).waitFor();
    const chooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Find my animal', exact: true }).click();
    const chooser = await chooserPromise;
    await chooser.setFiles(path.resolve('apps/mobile/assets/photos/sample-portrait.jpg'));
    const compare = page.getByRole('button', { name: 'Find my animal match', exact: true });
    await compare.waitFor();
    assert.equal(await compare.isEnabled(), false);
    await page.getByRole('checkbox').check();
    await compare.click();
    await page.getByText(lion.matchReason, { exact: true }).waitFor();
    await page.getByText('AI-REVIEWED ANIMAL PORTRAIT', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Species on iNaturalist ↗', exact: true }).waitFor();
    const share = page.getByRole('button', { name: 'Share comparison', exact: true });
    await page.waitForFunction(() => document.querySelector('[data-testid="share-comparison"]')?.getAttribute('aria-disabled') !== 'true');
    const output = path.resolve('.artifacts');
    await fs.mkdir(output, { recursive: true });
    const query = page.getByRole('textbox', { name: 'Animal image search words', exact: true });
    const pinterest = page.getByRole('button', { name: 'Search Pinterest', exact: true });
    const google = page.getByRole('button', { name: 'Search Google Images', exact: true });
    const expected = 'Lion broad face almond shaped eyes face portrait';
    assert.equal(await query.inputValue(), expected);
    assert.equal(searchRequests.length, 0, 'No search provider contacted automatically.');
    await query.fill('   ');
    assert.equal(await pinterest.isEnabled(), false); assert.equal(await google.isEnabled(), false);
    const edited = 'white Persian cat green eyes & portrait';
    await query.fill(edited);
    for (const [button, host] of [[pinterest, 'www.pinterest.com'], [google, 'www.google.com']]) {
      const opening = context.waitForEvent('page');
      await button.click();
      const popup = await opening;
      await popup.waitForLoadState('domcontentloaded');
      const url = new URL(popup.url());
      assert.equal(url.hostname, host); assert.equal(url.searchParams.get('q'), edited);
      if (host === 'www.google.com') { assert.equal(url.searchParams.get('safe'), 'active'); assert.equal(url.searchParams.get('tbm'), 'isch'); }
      await popup.close();
    }
    assert.equal(searchRequests.length, 2); assert.ok(searchRequests.every(x => x.body === null));
    await page.getByRole('button', { name: 'Reset suggested words', exact: true }).click();
    assert.equal(await query.inputValue(), expected);
    await query.fill('temporary edit');
    await page.getByRole('button', { name: 'Compare with Caracal', exact: true }).click();
    assert.equal(await query.inputValue(), 'Caracal face portrait');
    await page.getByRole('button', { name: 'Compare with Lion', exact: true }).click();
    assert.equal(await query.inputValue(), expected);
    // A browser-level opening failure is explained rather than becoming an unhandled rejection.
    await page.evaluate(() => { window.__realOpen = window.open; window.open = () => { throw new Error('Test popup failure'); }; });
    await pinterest.click();
    await page.getByText('The search could not open. Please allow browser pop-ups or try again.', { exact: true }).waitFor();
    await page.evaluate(() => { window.open = window.__realOpen; delete window.__realOpen; });
    await page.getByRole('button', { name: 'Reset suggested words', exact: true }).click();
    await page.getByTestId('animal-search-panel').screenshot({ path: path.join(output, 'animal-search-simulated-desktop.png') });
    await share.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, 'open-species-simulated-desktop.png'), fullPage: true });
    const downloading = page.waitForEvent('download');
    await share.click();
    const downloaded = await downloading;
    await downloaded.saveAs(path.join(output, 'open-species-simulated-share.png'));
    const png = await fs.readFile(path.join(output, 'open-species-simulated-share.png'));
    assert.equal(png.toString('hex', 0, 8), '89504e470d0a1a0a');
    assert.equal(png.readUInt32BE(16), 1080); assert.equal(png.readUInt32BE(20), 1350);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByTestId('animal-search-panel').screenshot({ path: path.join(output, 'animal-search-simulated-mobile.png') });
    await page.screenshot({ path: path.join(output, 'open-species-simulated-mobile.png'), fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2), false);
    await page.getByRole('button', { name: 'Compare with Eurasian eagle-owl', exact: true }).click();
    await page.getByText('No suitable portrait found', { exact: true }).waitFor();
    assert.equal(await query.inputValue(), 'Eurasian eagle-owl face portrait');
    assert.equal(await pinterest.isEnabled(), true, 'External exploration remains available when no reusable photo exists.');
    assert.equal(await share.isEnabled(), false);
    assert.equal(intercepted, 1); assert.deepEqual(errors, []);
    console.log('PASS simulated analysis UI, consent, real iNaturalist image, credited PNG, mobile layout, missing-photo export guard, editable search words, isolated per-animal edits, blank-query guard, both encoded search popups, opening failure. Zero portraits forwarded to backend/OpenAI and zero search requests forwarded externally.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
