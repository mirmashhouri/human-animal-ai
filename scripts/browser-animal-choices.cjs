const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(process.env.WILDLENS_PLAYWRIGHT_PATH || 'playwright');

(async () => {
  const base = process.env.WILDLENS_TEACHING_TEST_API;
  if (base !== 'http://localhost:5097') throw new Error('Use the disposable choices fixture on 5097, never owner data.');
  const browser = await chromium.launch({ headless: true, executablePath: process.env.WILDLENS_CHROMIUM });
  const errors = [], external = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1700, height: 1200 }, acceptDownloads: true });
    let showRefusal = false;
    await context.route('**/api/teaching/**', async route => {
      const u = new URL(route.request().url());
      const response = await route.fetch({ url: base + u.pathname + u.search });
      if (showRefusal && u.pathname.endsWith('/suggestions')) {
        const body = await response.json();
        for (const p of body.proposals) {
          p.artworks = p.artworks.filter(a => a.choice !== 2);
          p.artworkFailures = [{ choice: 2, code: 'http_400/content_policy_violation', message: 'Unavailable', at: new Date().toISOString() }];
        }
        await route.fulfill({ response, json: body });
      } else await route.fulfill({ response });
    });
    await context.route('**/api/wildlens/**', route => { external.push(route.request().url()); return route.abort(); });
    const page = await context.newPage(); page.setDefaultTimeout(20000); page.on('pageerror', e => errors.push(e.message));
    assert.equal((await context.request.get(base + '/api/teaching/suggestions')).status(), 401);
    assert.equal((await context.request.get(base + '/api/teaching/artworks/00000000000000000000000000000000.png')).status(), 401);
    await page.goto('http://localhost:8093/teach', { waitUntil: 'networkidle' });
    await page.getByLabel('Private studio password', { exact: true }).fill('choices-disposable-browser-password');
    await page.getByLabel('Repeat password', { exact: true }).fill('choices-disposable-browser-password');
    await page.getByRole('button', { name: 'Create private password', exact: true }).click();
    await page.getByRole('button', { name: 'Animal choices', exact: true }).click();
    await page.getByRole('heading', { name: 'Teach by choosing.', exact: true }).waitFor();
    const choices = page.getByRole('radiogroup', { name: 'Animal interpretation' });
    await choices.waitFor(); assert.equal(await choices.getByRole('radio').count(), 4);
    assert.equal(await choices.locator('ol li').count(), 9); assert.equal(await page.getByRole('slider').count(), 0);
    assert.equal(await choices.getByRole('img', { name: /animal portrait$/ }).count(), 3);
    await choices.locator('img').evaluateAll(images => Promise.all(images.map(img => img.decode())));
    const phrases = await choices.locator('ol li').allTextContents(); assert.ok(phrases.every(text => text.split(/\s+/).length <= 6));
    assert.equal(await choices.getByRole('radio', { checked: true }).count(), 0, 'No AI suggestion is automatically selected');
    const cases = async () => (await (await context.request.get(base + '/api/teaching/cases')).json()).cases;
    const initial = await cases(); assert.equal(initial.filter(c => c.acceptedAnimals.length).length, 0);
    await choices.getByRole('radio').nth(0).check();
    await page.getByRole('button', { name: 'Skip →', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Confirm or discard' }).waitFor();
    await page.getByRole('button', { name: 'Dismiss error', exact: true }).click();
    await page.getByLabel('Your choice reasons', { exact: true }).fill('Long face and prominent mouth\nVisible teeth align with a horse');
    await page.getByRole('heading', { name: 'Teach by choosing.', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(__dirname, '../.artifacts/animal-choices-desktop.png'), fullPage: true });
    let savedResponse = page.waitForResponse(r => r.url().endsWith('/suggestions/review') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Confirm & next →', exact: true }).click();
    assert.equal((await savedResponse).status(), 200);
    await page.getByRole('status').filter({ hasText: 'Choice saved locally' }).waitFor();
    let stored = await cases(); const horse = stored.find(c => c.preference?.animal === 'Horse');
    assert.ok(horse); assert.equal(horse.preference.reasonSource, 'human-written-or-edited');
    assert.equal(horse.rejectedAnimals.length, 0); assert.equal(horse.traits.length, 0);
    assert.equal(horse.preference.offeredChoices.length, 3);
    assert.ok(horse.preference.selectedArtwork?.file.endsWith('.png'));
    assert.equal(horse.preference.viewedArtworks.length, 3);
    assert.equal((await (await context.request.get(base + '/api/teaching/memory')).json()).indexedExamples, 1);
    await choices.getByRole('radio').nth(3).check();
    await page.getByLabel('My animal', { exact: true }).fill('Goldfish');
    await page.getByLabel('Your choice reasons', { exact: true }).fill('Round cheeks\nRound eyes\nHair can become flowing fins');
    savedResponse = page.waitForResponse(r => r.url().endsWith('/suggestions/review') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Confirm & next →', exact: true }).click();
    assert.equal((await savedResponse).status(), 200);
    await page.getByRole('status').filter({ hasText: 'Choice saved locally' }).waitFor();
    stored = await cases(); const fish = stored.find(c => c.preference?.animal === 'Goldfish');
    assert.ok(fish?.preference.custom); assert.equal(fish.split, 'test');
    assert.equal((await (await context.request.get(base + '/api/teaching/memory')).json()).indexedExamples, 1, 'Held-out choice does not enter retrieval');
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByText('Saved choice: Goldfish', { exact: true }).waitFor();
    const exportText = await (await context.request.get(base + '/api/teaching/export')).text();
    assert.ok(exportText.includes('offeredChoices') && exportText.includes('Goldfish') && !exportText.includes('data:image/'));
    const drafts = await (await context.request.get(base + '/api/teaching/suggestions/export')).json();
    assert.equal(drafts.proposals.length, 2);
    await page.setViewportSize({ width: 390, height: 844 });
    await choices.scrollIntoViewIfNeeded();
    assert.ok(await page.evaluate(() => document.querySelector('.teach-root').scrollWidth <= window.innerWidth + 1));
    await page.screenshot({ path: path.join(__dirname, '../.artifacts/animal-choices-mobile.png'), fullPage: true });
    showRefusal = true;
    await page.getByText('Meta couldn’t generate this option. You can still choose another animal.', { exact: true }).waitFor();
    assert.equal(await choices.locator('img').count(), 2);
    await page.getByRole('button', { name: 'All available portraits ready', exact: true, includeHidden: true }).waitFor({ state: 'attached' });
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    console.log(JSON.stringify({ status: 'passed', checks: ['4 choices and 9 reasons', 'no default selection', 'editable reasons', 'dirty navigation guard', 'confirm and next', 'custom choice', 'memory indexing', 'held-out exclusion', 'reload persistence', 'exports', '390px layout'], consoleErrors: errors.length, realMetaCalls: 0 }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
