// Historical three-image regression, superseded by browser-character-smoke.cjs.
// Retained as a record of the old UI contract; do not use for the current character experience.
// Simulated generation responses only. No real portraits or provider requests.
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
    assert.ok(page);
    const errors = []; const unexpectedRequests = []; let matches = 0;
    const fieldNames = ['Face outline', 'Face length to width', 'Forehead width', 'Cheekbone width', 'Cheek fullness', 'Jaw width', 'Jaw contour', 'Chin shape', 'Eye shape', 'Eye size', 'Eye spacing', 'Eye tilt', 'Eyelid contour', 'Brow shape', 'Brow to eye spacing', 'Nose width', 'Nose length', 'Mouth width', 'Lip contour', 'Iris colour'];
    const features = fieldNames.map((feature, index) => ({ feature, keyword: index === 19 ? 'not observable' : 'simulated visible shape',
      observation: `SIMULATED observation for ${feature}`, visibility: index === 19 ? 'uncertain' : 'clear',
      salience: index === 0 || index === 8 ? 3 : index === 19 ? 0 : 1,
      artisticEmphasis: index === 0 || index === 8 ? `SIMULATED drawing direction: amplify ${feature.toLowerCase()}.` : null,
      signatureRank: index === 0 ? 1 : index === 8 ? 2 : null }));
    page.on('pageerror', e => errors.push(e.message));
    const animals = await Promise.all(catalogue.map(async (animal, index) => ({ ...animal,
      id: `generated-test-${index}`, imageOrigin: 'generated', photoReviewStatus: 'not_reviewed',
      photoStatus: 'available',
      imagePath: 'data:image/jpeg;base64,' + (await fs.readFile(path.resolve(`apps/mobile/assets/photos/${animal.id}.jpg`))).toString('base64'),
      sourceUrl: 'https://developers.openai.com/api/docs/guides/image-generation', licenseUrl: '',
      photoCredit: 'SIMULATED OUTPUT: bundled photo used only to test the generated-image transport',
      imageError: null,
      description: 'SIMULATED IMAGE-GENERATION RESULT — not a real AI-generated image.', searchKeywords: ['rounded face'],
    })));
    const headers = { 'access-control-allow-origin': 'http://localhost:8081', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'Content-Type' };
    await context.route('**/api/**', async route => {
      const request = route.request(); const pathname = new URL(request.url()).pathname;
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      let body;
      if (pathname === '/api/config') body = { mode: 'experimental-live', liveReady: true, model: 'gpt-5.4-mini', animalImageSource: 'Generated', imageModel: 'gpt-image-2', imageQuality: 'medium', analysisFeatureCount: 20, analysisCalls: 2, analysisCacheEnabled: false, artisticSignatureEnabled: true };
      else if (pathname === '/api/matches') {
        matches++;
        body = { id: `simulated-generation-test-${matches}`, isDemo: false, catalogueVersion: 'caricaturist-signature-v1-no-cache',
          notice: 'SIMULATED RESULTS — no real AI request or generation took place.',
          features: features.map(feature => ({ ...feature, observation: `SIMULATED run ${matches}: ${feature.feature}` })),
          // Deliberately different fixture pixels under the same IDs test stale-image rendering, not species accuracy.
          matches: animals.map((animal, index) => ({ rank: index + 1, animal: matches === 3 && index === 2 ?
            { ...animal, photoStatus: 'unavailable', imagePath: '', imageError: 'SIMULATED provider failure. No automatic retry.' } :
            { ...animal, imagePath: animals[(index + matches - 1) % animals.length].imagePath } })) };
      } else { unexpectedRequests.push(pathname); return route.abort(); }
      return route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await context.route(/^https:\/\/(api\.openai\.com|www\.google\.com|www\.pinterest\.com)\//, route => route.abort());
    await page.setViewportSize({ width: 1440, height: 1600 });
    await page.goto('http://localhost:8081');
    async function compareFixture() {
      const choosing = page.waitForEvent('filechooser');
      await page.getByRole('button', { name: 'Find my animal', exact: true }).click();
      await (await choosing).setFiles(path.resolve('apps/mobile/assets/photos/sample-portrait.jpg'));
      const compare = page.getByRole('button', { name: 'Find my animal match', exact: true });
      await compare.waitFor(); assert.equal(await compare.isEnabled(), false);
      await page.getByText(/two billed analysis requests.*plus three billed image-generation requests/).waitFor();
      await page.getByText(/Analysis caching is off/).waitFor();
      await page.getByText(/The AI takes a caricaturist’s view/).waitFor();
      await page.getByRole('checkbox').check(); await compare.click();
      await page.getByText('AI-GENERATED ANIMAL', { exact: true }).waitFor();
    }
    await compareFixture();
    await page.getByText('AI-GENERATED ANIMAL', { exact: true }).waitFor();
    await page.getByText('AI ILLUSTRATION · NOT A REAL PHOTOGRAPH', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Species on iNaturalist ↗', exact: true }).count(), 0);
    const share = page.getByRole('button', { name: 'Share comparison', exact: true });
    await page.waitForFunction(() => document.querySelector('[data-testid="share-comparison"]')?.getAttribute('aria-disabled') !== 'true');
    const output = path.resolve('.artifacts'); await fs.mkdir(output, { recursive: true });
    const profilePanel = page.getByTestId('face-profile-panel');
    const signature = profilePanel.getByTestId('artistic-signature');
    await signature.getByRole('heading', { name: 'The shapes an artist would emphasize.', exact: true }).waitFor();
    assert.equal(await signature.getByText(/Artist’s emphasis: SIMULATED drawing direction/).count(), 2);
    assert.equal(await signature.getByText(/Observed: SIMULATED run 1/).count(), 2);
    assert.equal(await signature.getByText(/Iris colour/).count(), 0);
    await profilePanel.getByRole('heading', { name: 'Your 20-part visual profile.', exact: true }).waitFor();
    for (const feature of fieldNames) assert.equal(await profilePanel.getByText(feature, { exact: true }).count(), 1);
    assert.equal(await profilePanel.getByText('Not reliably observable', { exact: true }).count(), 1);
    await profilePanel.getByRole('button', { name: 'Show all visual observations', exact: true }).click();
    assert.equal(await profilePanel.getByText('SIMULATED run 1: Eye spacing', { exact: true }).count(), 1);
    await profilePanel.getByRole('button', { name: 'Hide visual observations', exact: true }).click();
    await profilePanel.screenshot({ path: path.join(output, 'artist-signature-simulated-desktop.png') });
    const downloading = page.waitForEvent('download'); await share.click();
    await (await downloading).saveAs(path.join(output, 'no-cache-simulated-share.png'));
    const png = await fs.readFile(path.join(output, 'no-cache-simulated-share.png'));
    assert.equal(png.readUInt32BE(16), 1080); assert.equal(png.readUInt32BE(20), 1350);
    async function assertCurrentImages(run) { for (const [index, animal] of animals.entries()) {
      await page.getByRole('button', { name: `Compare with ${animal.name}`, exact: true }).click();
      const cardImage = page.getByTestId('comparison-card').getByRole('img', { name: `AI-generated portrait of ${animal.name}`, exact: true });
      await cardImage.waitFor();
      const expected = animals[(index + run - 1) % animals.length].imagePath;
      assert.equal(await cardImage.getAttribute('src'), expected);
      const thumbnail = page.getByRole('button', { name: `Compare with ${animal.name}`, exact: true }).getByRole('img');
      assert.equal(await thumbnail.getAttribute('src'), expected);
      await page.waitForFunction(() => document.querySelector('[data-testid="share-comparison"]')?.getAttribute('aria-disabled') !== 'true');
    } }
    await assertCurrentImages(1);
    const pinterest = page.getByRole('button', { name: 'Search Pinterest', exact: true });
    const google = page.getByRole('button', { name: 'Search Google Images', exact: true });
    assert.equal(await page.getByRole('button', { name: /screenshot/i }).count(), 0);
    assert.equal(await page.locator('iframe').count(), 0);
    await page.evaluate(() => { window.__testSearchLinks = []; window.open = url => { window.__testSearchLinks.push(String(url)); return null; }; });
    const query = page.getByRole('textbox', { name: 'Animal image search words', exact: true });
    const searchWords = 'white Persian cat green eyes & face';
    await query.fill(searchWords); await pinterest.click(); await google.click();
    const links = await page.evaluate(() => window.__testSearchLinks);
    assert.equal(links.length, 2);
    assert.equal(new URL(links[0]).hostname, 'www.pinterest.com');
    assert.equal(new URL(links[1]).hostname, 'www.google.com');
    for (const link of links) assert.equal(new URL(link).searchParams.get('q'), searchWords);
    await query.fill('   '); assert.equal(await pinterest.isEnabled(), false); assert.equal(await google.isEnabled(), false);
    await page.getByRole('button', { name: 'Reset suggested words', exact: true }).click();
    assert.match(await query.inputValue(), /Eurasian eagle-owl/);
    await page.getByTestId('animal-search-panel').screenshot({ path: path.join(output, 'generated-links-simulated-desktop.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await signature.getByRole('heading', { name: 'The shapes an artist would emphasize.', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, 'artist-signature-simulated-mobile.png') });
    await profilePanel.getByRole('heading', { name: 'Your 20-part visual profile.', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, 'no-cache-simulated-mobile.png') });
    await profilePanel.getByText('Iris colour', { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, 'no-cache-simulated-mobile-bottom.png') });
    await google.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, 'generated-links-simulated-mobile.png') });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false);
    await page.getByRole('button', { name: 'Start a new comparison ↗', exact: true }).click();
    await compareFixture();
    await page.getByText(/Every submission runs a fresh analysis/).waitFor();
    assert.equal(await page.getByText(/Reused the saved analysis/).count(), 0);
    await assertCurrentImages(2);
    await profilePanel.getByRole('button', { name: 'Show all visual observations', exact: true }).click();
    assert.equal(await profilePanel.getByText('SIMULATED run 2: Eye spacing', { exact: true }).count(), 1);
    assert.equal(await profilePanel.getByText('SIMULATED run 1: Eye spacing', { exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Start a new comparison ↗', exact: true }).click();
    await compareFixture();
    await page.getByRole('button', { name: 'Compare with Eurasian eagle-owl', exact: true }).click();
    await page.getByText('Image generation unavailable', { exact: true }).waitFor();
    assert.equal(await page.getByTestId('comparison-card').getByRole('img', { name: 'AI-generated portrait of Eurasian eagle-owl', exact: true }).count(), 0);
    assert.equal(await share.isEnabled(), false);
    assert.match(await query.inputValue(), /Eurasian eagle-owl/);
    assert.equal(matches, 3); assert.deepEqual(unexpectedRequests, []); assert.deepEqual(errors, []);
    console.log('PASS generated-mode simulation: artist signature with separate observations/drawing directions, fresh submissions, replaced profile, new image pixels under repeated animal IDs in cards/thumbnails, no stale image on failure, 20 fields, billing consent, PNG export, link-only searches and mobile layout. No real AI calls or search requests.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
