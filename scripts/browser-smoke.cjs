// Supplements agent-browser for Expo's detached file chooser and file downloads.
// Supply KINFORM_CDP_URL from the isolated agent-browser session, never a personal browser.
// Requires Playwright (a bundled workspace copy can be supplied through NODE_PATH).
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
let connectedBrowser;

(async () => {
  const endpoint = process.env.KINFORM_CDP_URL;
  if (!endpoint?.startsWith('ws://127.0.0.1:')) throw new Error('Supply the isolated local browser CDP endpoint.');
  const browser = await chromium.connectOverCDP(endpoint);
  connectedBrowser = browser;
  const context = browser.contexts()[0];
  const page = context.pages().find(p => p.url().startsWith('http://localhost:8081'));
  assert.ok(page, 'The isolated app preview must already be open.');
  const root = path.resolve(__dirname, '..');
  const output = path.join(root, '.artifacts');
  await fs.mkdir(output, { recursive: true });
  const errors = [];
  let matchUploads = 0;
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.url().includes('/api/matches')) matchUploads++; });
  page.setDefaultTimeout(15000);
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto('http://localhost:8081', { waitUntil: 'networkidle' });
  assert.ok(await page.getByText('LOCAL DEMO · 3 REFERENCE ANIMALS', { exact: true }).isVisible(), 'Refuse upload testing if the client is not local-demo mode.');
  await page.screenshot({ path: path.join(output, 'kinform-desktop.png'), fullPage: true });
  await page.getByRole('button', { name: 'Explore a sample comparison →', exact: true }).click();
  await page.getByRole('heading', { name: 'A face from the wild.' }).waitFor();
  const share = page.getByRole('button', { name: 'Share comparison', exact: true });
  await page.waitForFunction(() => document.querySelector('[data-testid="share-comparison"]')?.getAttribute('aria-disabled') !== 'true');
  await page.screenshot({ path: path.join(output, 'kinform-result.png'), fullPage: true });
  const downloadPromise = page.waitForEvent('download');
  await share.click();
  const download = await downloadPromise;
  await download.saveAs(path.join(output, 'kinform-share.png'));
  const png = await fs.readFile(path.join(output, 'kinform-share.png'));
  assert.equal(png.toString('hex', 0, 8), '89504e470d0a1a0a');
  assert.equal(png.readUInt32BE(16), 1080); assert.equal(png.readUInt32BE(20), 1350);
  await page.getByRole('button', { name: 'Compare with Caracal', exact: true }).click();
  await page.getByLabel('Reference photograph of Caracal', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Learn about the upcoming hybrid portrait', exact: true }).click();
  assert.ok(await page.getByText('Hybrid generation is not connected in this build.', { exact: false }).isVisible());
  await page.getByRole('button', { name: 'Back to my comparison', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(output, 'kinform-mobile.png'), fullPage: true });
  const overflow = await page.evaluate(() => [...document.querySelectorAll('body *')].some(el => {
    const bounds = el.getBoundingClientRect();
    return bounds.width > 0 && bounds.right > window.innerWidth + 2;
  }));
  assert.equal(overflow, false, 'Phone layout must not overflow horizontally.');
  await page.getByRole('button', { name: 'Clear session', exact: true }).click();
  await page.getByRole('heading', { name: 'A little human. A little wild.' }).waitFor();
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Find my animal', exact: true }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles(path.join(root, 'apps/mobile/assets/photos/sample-portrait.jpg'));
  await page.getByRole('heading', { name: 'Good light. Just you.' }).waitFor();
  const compare = page.getByRole('button', { name: 'Show demo comparison', exact: true });
  assert.equal(await compare.isEnabled(), false, 'Consent must gate comparison.');
  await page.getByRole('checkbox').click();
  assert.equal(await compare.isEnabled(), true);
  await page.screenshot({ path: path.join(output, 'kinform-upload.png'), fullPage: true });
  await compare.click();
  await page.getByRole('heading', { name: 'A face from the wild.' }).waitFor();
  await page.getByLabel('Your uploaded portrait', { exact: true }).waitFor();
  assert.equal(matchUploads, 0, 'Local demo must never upload a photo to the API.');
  await page.getByRole('button', { name: 'Clear session', exact: true }).click();
  assert.equal(await page.getByLabel('Your uploaded portrait', { exact: true }).count(), 0);
  await page.getByRole('button', { name: 'The animals', exact: true }).click();
  await page.getByRole('heading', { name: 'Many faces. One natural world.' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'View source photograph ↗', exact: true }).count(), 3);
  await page.getByRole('button', { name: 'Privacy', exact: true }).click();
  await page.getByRole('heading', { name: 'Private by design.' }).waitFor();
  await page.getByRole('button', { name: 'Got it', exact: true }).click();
  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(output, 'browser-check.json'), JSON.stringify({
    passed: true, checkedAt: new Date().toISOString(),
    checks: ['landing', 'sample comparison', '1080x1350 PNG export', 'animal switching', 'hybrid disclosure',
      '390px layout without horizontal overflow', 'photo upload', 'consent gate', 'no demo uploads', 'clear session', 'catalogue', 'privacy modal', 'no page errors'],
    matchUploads, errors,
  }, null, 2));
  console.log('PASS browser flow: upload, consent, sample, match switching, PNG export, mobile layout, hybrid notice, privacy, clearing; no external AI uploads.');
  await browser.close();
})().catch(async error => { console.error(error); await connectedBrowser?.close(); process.exitCode = 1; });
