// Simulated character responses only. No real portraits or provider requests.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const catalogue = require('../data/animals.json');
(async () => {
  assert.match(process.env.KINFORM_CDP_URL || '', /^ws:\/\/127\.0\.0\.1:\d+\//);
  console.log('Connecting to isolated test browser.');
  const browser = await chromium.connectOverCDP(process.env.KINFORM_CDP_URL, { timeout: 20000 });
  const context = browser.contexts()[0];
  try {
    const page = context.pages().find(p => p.url().startsWith('http://localhost:8081'));
    assert.ok(page);
    page.setDefaultTimeout(20000);
    console.log('Installing local API simulations.');
    const errors = []; const unexpectedRequests = []; let matches = 0;
    const fieldNames = ['Face outline', 'Face length to width', 'Forehead width', 'Cheekbone width', 'Cheek fullness', 'Jaw width', 'Jaw contour', 'Chin shape', 'Eye shape', 'Eye size', 'Eye spacing', 'Eye tilt', 'Eyelid contour', 'Brow shape', 'Brow to eye spacing', 'Nose width', 'Nose length', 'Mouth width', 'Lip contour', 'Iris colour'];
    const features = fieldNames.map((feature, index) => ({ feature, keyword: index === 19 ? 'not observable' : 'simulated visible shape',
      observation: `SIMULATED observation for ${feature}`, visibility: index === 19 ? 'uncertain' : 'clear',
      salience: index === 0 || index === 8 ? 3 : index === 19 ? 0 : 1,
      artisticEmphasis: index === 0 || index === 8 ? `SIMULATED drawing direction: amplify ${feature.toLowerCase()}.` : null,
      signatureRank: index === 0 ? 1 : index === 8 ? 2 : null }));
    page.on('pageerror', e => errors.push(e.message));
    const images = await Promise.all(catalogue.map(async animal => 'data:image/jpeg;base64,' +
      (await fs.readFile(path.resolve(`apps/mobile/assets/photos/${animal.id}.jpg`))).toString('base64')));
    const animal = { ...catalogue[0], id: 'generated-test-character', imageOrigin: 'generated', photoReviewStatus: 'not_reviewed',
      sourceUrl: 'https://developers.openai.com/api/docs/guides/image-generation', licenseUrl: '',
      photoCredit: 'SIMULATED OUTPUT: bundled photo used to test transport, not cartoon quality',
      description: 'SIMULATED CHARACTER RESPONSE — not a real AI-generated image.', searchKeywords: ['rounded face'] };
    const headers = { 'access-control-allow-origin': 'http://localhost:8081', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'Content-Type' };
    await context.route('**/api/**', async route => {
      const request = route.request(); const pathname = new URL(request.url()).pathname;
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      let body;
      if (pathname === '/api/config') body = { mode: 'experimental-live', liveReady: true, model: 'gpt-5.4-mini',
        experience: 'animal-character', resultCount: 1, portraitUsedForGeneration: true,
        animalImageSource: 'Generated', imageModel: 'gpt-image-2', imageQuality: 'medium', analysisFeatureCount: 20,
        analysisCalls: 2, analysisCacheEnabled: false, artisticSignatureEnabled: true };
      else if (pathname === '/api/matches') {
        const input = request.postDataJSON();
        assert.equal(input.consent, true); assert.equal(input.portraitEditConsent, true);
        assert.match(input.imageBase64, /^\/9j\//);
        matches++;
        body = { id: `simulated-character-${matches}`, isDemo: false, experience: 'animal-character',
          catalogueVersion: 'portrait-animal-character-v1-no-cache', notice: 'SIMULATED RESULTS — no real AI request or generation took place.',
          features: features.map(feature => ({ ...feature, observation: `SIMULATED run ${matches}: ${feature.feature}` })),
          // Different fixture pixels under the same ID test fresh rendering, not likeness/species accuracy.
          matches: [{ rank: 1, animal: { ...animal, photoStatus: matches === 3 ? 'unavailable' : 'available',
            imagePath: matches === 3 ? '' : images[matches - 1], imageError: matches === 3 ? 'SIMULATED provider failure. No automatic retry.' : null } }] };
      } else { unexpectedRequests.push(pathname); return route.abort(); }
      return route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await context.route(/^https:\/\/(api\.openai\.com|www\.google\.com|www\.pinterest\.com)\//, route => route.abort());
    await page.setViewportSize({ width: 1440, height: 1200 });
    await page.goto('http://localhost:8081', { waitUntil: 'domcontentloaded', timeout: 30000 });
    console.log('Checking character flow.');
    const output = path.resolve('.artifacts'); await fs.mkdir(output, { recursive: true });
    await page.getByRole('button', { name: 'Create my character', exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, 'animal-character-welcome.png') });
    async function createFixture() {
      const choosing = page.waitForEvent('filechooser');
      await page.getByRole('button', { name: 'Create my character', exact: true }).click();
      await (await choosing).setFiles(path.resolve('apps/mobile/assets/photos/sample-portrait.jpg'));
      const create = page.getByRole('button', { name: 'Create my animal character', exact: true });
      await create.waitFor(); assert.equal(await create.isEnabled(), false);
      await page.getByText(/two billed analysis requests plus one billed image-edit request/).waitFor();
      await page.getByText(/same portrait is then sent to OpenAI/).waitFor();
      await page.getByText(/Analysis caching is off/).waitFor();
      await page.getByRole('checkbox').check(); await create.click();
      await page.getByRole('heading', { name: 'Your animal character.', exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: /^Compare with / }).count(), 0);
      assert.equal(await page.getByText('NEXT UP', { exact: true }).count(), 0);
      assert.equal(await page.getByTestId('face-profile-panel').count(), 0);
    }
    const share = page.getByRole('button', { name: 'Share character', exact: true });
    const card = page.getByTestId('comparison-card');
    const characterImage = card.getByRole('img', { name: `Portrait-inspired cartoon of ${animal.name}`, exact: true });
    await createFixture();
    await characterImage.waitFor(); assert.equal(await characterImage.getAttribute('src'), images[0]);
    await page.waitForFunction(() => document.querySelector('[data-testid="share-comparison"]')?.getAttribute('aria-disabled') !== 'true');
    await page.getByText('AI CARTOON · INSPIRED BY YOUR PORTRAIT', { exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, 'animal-character-simulated-desktop.png') });
    const downloading = page.waitForEvent('download'); await share.click();
    await (await downloading).saveAs(path.join(output, 'animal-character-simulated-share.png'));
    const png = await fs.readFile(path.join(output, 'animal-character-simulated-share.png'));
    assert.equal(png.readUInt32BE(16), 1080); assert.equal(png.readUInt32BE(20), 1350);
    await page.getByRole('button', { name: 'Show design notes +', exact: true }).click();
    const profile = page.getByTestId('face-profile-panel');
    for (const feature of fieldNames) assert.equal(await profile.getByText(feature, { exact: true }).count(), 1);
    assert.equal(await profile.getByText(/Artist’s emphasis: SIMULATED drawing direction/).count(), 2);
    await page.getByRole('button', { name: 'Hide design notes −', exact: true }).click();
    const pinterest = page.getByRole('button', { name: 'Search Pinterest', exact: true });
    const google = page.getByRole('button', { name: 'Search Google Images', exact: true });
    assert.equal(await page.locator('iframe').count(), 0);
    await page.evaluate(() => { window.__testSearchLinks = []; window.open = url => { window.__testSearchLinks.push(String(url)); return null; }; });
    const query = page.getByRole('textbox', { name: 'Animal image search words', exact: true });
    const searchWords = 'white Persian cat green eyes & face';
    await query.fill(searchWords); await pinterest.click(); await google.click();
    const links = await page.evaluate(() => window.__testSearchLinks);
    assert.equal(links.length, 2); assert.equal(new URL(links[0]).hostname, 'www.pinterest.com');
    assert.equal(new URL(links[1]).hostname, 'www.google.com');
    for (const link of links) assert.equal(new URL(link).searchParams.get('q'), searchWords);
    await query.fill('   '); assert.equal(await pinterest.isEnabled(), false); assert.equal(await google.isEnabled(), false);
    await page.getByRole('button', { name: 'Reset suggested words', exact: true }).click();
    assert.ok((await query.inputValue()).includes(animal.name));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('heading', { name: 'Your animal character.', exact: true }).scrollIntoViewIfNeeded();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const headingBox = await page.getByRole('heading', { name: 'Your animal character.', exact: true }).boundingBox();
    assert.ok(headingBox && headingBox.x >= 0 && headingBox.x + headingBox.width <= 391);
    await page.screenshot({ path: path.join(output, 'animal-character-simulated-mobile.png') });
    await google.scrollIntoViewIfNeeded();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.screenshot({ path: path.join(output, 'animal-character-links-mobile.png') });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false);
    await page.getByRole('button', { name: 'Start again ↗', exact: true }).click();
    await createFixture();
    await characterImage.waitFor(); assert.equal(await characterImage.getAttribute('src'), images[1]);
    await page.getByRole('button', { name: 'Show design notes +', exact: true }).click();
    await profile.getByRole('button', { name: 'Show all visual observations', exact: true }).click();
    assert.equal(await profile.getByText('SIMULATED run 2: Eye spacing', { exact: true }).count(), 1);
    assert.equal(await profile.getByText('SIMULATED run 1: Eye spacing', { exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Start again ↗', exact: true }).click();
    await createFixture();
    await page.getByText('Image generation unavailable', { exact: true }).waitFor();
    assert.equal(await characterImage.count(), 0); assert.equal(await share.isEnabled(), false);
    assert.equal(matches, 3); assert.deepEqual(unexpectedRequests, []); assert.deepEqual(errors, []);
    console.log('PASS single-character simulation: one output, actual-portrait edit consent, one-image billing copy, optional design notes, fresh image/profile on repeat, no stale image or export after failure, PNG export, link-only searches, mobile layout and no page errors. No paid AI requests.');
  } finally {
    await context.unrouteAll({ behavior: 'wait' });
    await browser.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
