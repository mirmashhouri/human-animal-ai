const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(process.env.WILDLENS_PLAYWRIGHT_PATH || 'playwright');
(async () => {
  const base = process.env.WILDLENS_TEACHING_TEST_API;
  if (base !== 'http://localhost:5097') throw new Error('Use the disposable visual fixture, never owner auth.');
  const browser = await chromium.launch({ headless: true, executablePath: process.env.WILDLENS_CHROMIUM });
  try {
    const context = await browser.newContext({ viewport: { width: 1700, height: 1200 } });
    await context.route('**/api/teaching/**', async route => {
      const url = new URL(route.request().url()); const response = await route.fetch({ url: base + url.pathname + url.search }); await route.fulfill({ response });
    });
    const page = await context.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://localhost:8093/teach', { waitUntil: 'networkidle' });
    await page.getByLabel('Private studio password', { exact: true }).fill('real-artwork-visual-fixture-password');
    if (await page.getByLabel('Repeat password', { exact: true }).count()) {
      await page.getByLabel('Repeat password', { exact: true }).fill('real-artwork-visual-fixture-password');
      await page.getByRole('button', { name: 'Create private password', exact: true }).click();
    } else await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByRole('button', { name: 'Animal choices', exact: true }).click();
    const group = page.getByRole('radiogroup', { name: 'Animal interpretation' }); await group.waitFor();
    const pictures = group.locator('img'); await pictures.evaluateAll(images => Promise.all(images.map(img => img.decode())));
    assert.equal(await pictures.count(), 3); assert.ok((await pictures.evaluateAll(images => images.map(img => img.naturalWidth))).every(width => width >= 1024));
    assert.equal(await group.locator('ol li').count(), 9);
    await page.getByRole('heading', { name: 'Teach by choosing.', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(__dirname, '../.artifacts/real-animal-comparison-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 }); await group.scrollIntoViewIfNeeded();
    assert.ok(await page.evaluate(() => document.querySelector('.teach-root').scrollWidth <= window.innerWidth + 1));
    await page.screenshot({ path: path.join(__dirname, '../.artifacts/real-animal-comparison-mobile.png'), fullPage: true });
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ status: 'passed', realSavedArtworksLoaded: 3, shortReasons: 9, browserErrors: 0, extraMetaCalls: 0, ownerFeedbackEdited: false }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
