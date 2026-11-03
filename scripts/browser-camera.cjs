const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(process.env.WILDLENS_PLAYWRIGHT_PATH || 'playwright');

(async () => {
  const output = path.resolve(__dirname, '../.artifacts'); await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ['--use-fake-device-for-media-stream'], ...(process.env.WILDLENS_CHROMIUM ? { executablePath: process.env.WILDLENS_CHROMIUM } : {}) });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['camera'] });
    // Never uses a physical camera, and no photo or request reaches Meta.
    let paidRequests = 0;
    await context.route('**/api/wildlens/config', route => route.fulfill({ json: { liveReady: true, keyConfigured: true, creditConfirmed: true, paidRequestsEnabled: true } }));
    await context.route('**/api/wildlens/analyze', route => { paidRequests++; return route.abort(); });
    await context.route('**/api/wildlens/generate', route => { paidRequests++; return route.abort(); });
    await context.addInitScript(() => {
      window.cameraCalls = []; window.cameraStreams = [];
      const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async constraints => {
        window.cameraCalls.push(constraints);
        if (window.denyCamera) throw new DOMException('Simulated permission denial', 'NotAllowedError');
        const stream = await original(constraints); window.cameraStreams.push(stream);
        if (window.delayCamera) await new Promise(resolve => { window.releaseCamera = resolve; });
        return stream;
      };
    });
    const page = await context.newPage(); const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://localhost:8093/', { waitUntil: 'networkidle' });
    assert.equal(await page.evaluate(() => window.cameraCalls.length), 0, 'Camera access is requested only after the user chooses it');
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await page.getByRole('button', { name: 'Use camera', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Take a selfie', exact: true }); await dialog.waitFor();
      await page.waitForFunction(() => document.querySelector('video')?.videoWidth > 0, null, { timeout: 10000 }).catch(async () => {
        await page.screenshot({ path: path.join(output, 'wildfie-camera-error.png') });
        throw new Error('Camera preview failed: ' + JSON.stringify({ alerts: await page.getByRole('alert').allTextContents(), errors, state: await page.evaluate(() => ({ calls: window.cameraCalls, streams: window.cameraStreams.map(stream => ({ active: stream.active, tracks: stream.getTracks().map(track => track.getSettings()) })), video: document.querySelector('video')?.readyState })) }));
      });
      await page.getByRole('button', { name: 'Take photo', exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Take photo', exact: true }).isEnabled(), true);
      const box = await dialog.boundingBox(); assert.ok(box.y >= 0 && box.y + box.height <= viewport.height + 1);
      assert.equal(await page.evaluate(() => window.cameraCalls.at(-1).audio), false, 'Microphone is never requested');
      await page.screenshot({ path: path.join(output, `wildfie-camera-${viewport.width}.png`) });
      await page.getByRole('button', { name: 'Take photo', exact: true }).click();
      await page.getByRole('img', { name: 'Your uploaded photo', exact: true }).waitFor();
      assert.equal(await dialog.count(), 0, 'Captured photo returns to the review screen');
      await page.waitForFunction(() => window.cameraStreams.every(stream => stream.getTracks().every(track => track.readyState === 'ended')));
      await page.getByRole('button', { name: 'Create my animal', exact: true }).click({ trial: true });
    }
    // Cancel a live stream, then cancel while a camera permission request is still pending.
    await page.getByRole('button', { name: 'Use camera', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('video')?.videoWidth > 0);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('dialog') && window.cameraStreams.every(stream => !stream.active));
    await page.evaluate(() => { window.delayCamera = true; });
    await page.getByRole('button', { name: 'Use camera', exact: true }).click();
    await page.waitForFunction(() => Boolean(window.releaseCamera));
    await page.getByRole('button', { name: 'Close camera', exact: true }).click();
    await page.evaluate(() => { window.releaseCamera(); window.delayCamera = false; });
    await page.waitForFunction(() => window.cameraStreams.every(stream => !stream.active));
    await page.evaluate(() => { window.denyCamera = true; });
    await page.getByRole('button', { name: 'Use camera', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Camera access is blocked' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Take photo', exact: true }).isDisabled(), true);
    await page.evaluate(() => { window.denyCamera = false; });
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('video')?.videoWidth > 0);
    await page.getByRole('button', { name: 'Close camera', exact: true }).click();
    await page.waitForFunction(() => window.cameraStreams.every(stream => !stream.active));
    assert.equal(paidRequests, 0); assert.deepEqual(errors, []);
    console.log(JSON.stringify({ status: 'passed', camera: 'synthetic device only', desktopAndMobileCapture: true, permissionDenialAndRetry: true, cancelStopsCamera: true, latePermissionResultStopped: true, microphone: false, metaRequests: paidRequests, pageErrors: errors }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
