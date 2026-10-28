// Uses an isolated agent-browser CDP session. Never uploads a portrait or calls OpenAI.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

(async () => {
  const endpoint = process.env.KINFORM_CDP_URL;
  assert.match(endpoint || '', /^ws:\/\/127\.0\.0\.1:\d+\//);
  const browser = await chromium.connectOverCDP(endpoint);
  try {
    const context = browser.contexts()[0];
    const page = context.pages().find(p => p.url().startsWith('http://localhost:8081'));
    assert.ok(page, 'Open localhost:8081 in the isolated browser first.');
    const errors = [];
    const portraitRequests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (/\/api\/(matches|hybrids)/.test(request.url())) portraitRequests.push(request.url()); });
    await page.setViewportSize({ width: 1440, height: 1050 });
    await page.goto('http://localhost:8081/');
    await page.getByRole('button', { name: 'The animals', exact: true }).click();
    const input = page.getByRole('textbox', { name: 'Animal catalogue search' });
    assert.equal(await page.getByRole('radio', { name: 'Common animal name' }).getAttribute('aria-checked'), 'true');
    await input.fill('red fox');
    await page.getByRole('button', { name: 'Search GBIF', exact: true }).click();
    await page.getByTestId('species-explorer').getByText('Vulpes vulpes', { exact: true }).waitFor({ timeout: 25000 });
    assert.ok(await page.getByRole('button', { name: 'Source dataset ↗', exact: true }).count());
    console.log('PASS Common-name GBIF search returns real species and attribution links');

    await page.getByRole('radio', { name: 'Scientific animal name' }).click();
    assert.equal(await page.getByRole('radio', { name: 'Scientific animal name' }).getAttribute('aria-checked'), 'true');
    await input.fill('Vulpes');
    await page.getByRole('button', { name: 'Search GBIF', exact: true }).click();
    await page.getByText(/species records for “Vulpes”/).waitFor({ timeout: 25000 });
    await page.getByRole('button', { name: 'Next results', exact: true }).click();
    await page.getByRole('button', { name: 'Previous results', exact: true }).waitFor({ timeout: 25000 });
    console.log('PASS Scientific search and next-page navigation');
    await page.screenshot({ path: path.resolve('.artifacts/gbif-results-desktop.png'), fullPage: true });

    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.screenshot({ path: path.resolve('.artifacts/gbif-results-mobile.png'), fullPage: true });
    console.log('PASS Mobile catalogue has no horizontal overflow');
    await page.getByRole('button', { name: '← Back to discover', exact: true }).click();
    await page.getByRole('button', { name: 'Explore a sample comparison →', exact: true }).click();
    await page.getByRole('button', { name: 'Compare with Red fox', exact: true }).waitFor();
    assert.deepEqual(portraitRequests, []);
    assert.deepEqual(errors, []);
    console.log('PASS Sample still works without any portrait upload or AI call; no page errors');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
