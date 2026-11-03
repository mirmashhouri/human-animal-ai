const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(process.env.WILDLENS_PLAYWRIGHT_PATH || 'playwright');
(async () => {
  const root = path.resolve(__dirname, '..'), output = path.join(root, '.artifacts');
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, ...(process.env.WILDLENS_CHROMIUM ? { executablePath: process.env.WILDLENS_CHROMIUM } : {}) });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
    const page = await context.newPage(); page.setDefaultTimeout(45000);
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    // Intercept every model endpoint before navigation. No portrait or test annotation leaves this browser.
    await page.route('**/api/wildlens/config', r => r.fulfill({ json: { liveReady: true, archiveEnabled: false } }));
    const analysis = { subjectVisible: true, title: 'Test', pose: 'Forward', composition: 'Centered', animalName: 'Fox',
      animalReason: 'Visible silhouette', story: 'Test only', caption: 'A playful, happy Fox', palette: ['#123456','#654321','#aabbcc'], groupPhoto:false, subjects:[] };
    let releaseAnalysis, releaseImage, analyses=0, images=0, imageFailure=false;
    await page.route('**/api/wildlens/analyze', async r => {
      analyses++;
      await new Promise(resolve => { releaseAnalysis=resolve; });
      await r.fulfill({ json: { analysis, ticket: 'test-only', segmentationStatus: 'skipped', segmentationText:'',
        personalization: { status:'used', examples:2, version:'test', preferenceWeight:.15, selectionChanged:false } } }).catch(() => {});
    });
    const png = await fs.readFile(path.join(output,'meta-live-fox.png')).catch(() => Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1ioAAAAASUVORK5CYII=','base64'));
    await page.route('**/api/wildlens/generate', async r => {
      images++; await new Promise(resolve => { releaseImage=resolve; });
      await r.fulfill(imageFailure ? { status:502,json:{code:'test_failure',message:'Simulated image failure'} } : { json:{image:'data:image/png;base64,'+png.toString('base64'),model:'test',promptVersion:'test',notice:'Simulated result'} }).catch(() => {});
    });
    await page.goto('http://localhost:8093', { waitUntil:'networkidle', timeout:120000 });
    await page.getByRole('heading',{name:'Your selfie, a little wilder.',exact:true}).waitFor();
    const chooserEvent=page.waitForEvent('filechooser'); await page.getByRole('button',{name:'Upload photo',exact:true}).click();
    await (await chooserEvent).setFiles(path.join(root,'apps/mobile/assets/photos/sample-portrait.jpg'));
    await page.getByRole('img',{name:'Your uploaded photo',exact:true}).waitFor();
    const imageSource = el => el.tagName==='IMG' ? el.src : el.querySelector('img')?.src || getComputedStyle(el).backgroundImage;
    const uploadedSource=await page.getByRole('img',{name:'Your uploaded photo',exact:true}).evaluate(imageSource);
    async function start() { releaseAnalysis=undefined; releaseImage=undefined; await page.getByRole('button',{name:'Create my animal',exact:true}).click(); await page.getByTestId('creation-loading').waitFor(); }
    async function fits() {
      const box=await page.getByTestId('creation-loading').boundingBox(), stop=await page.getByRole('button',{name:'Stop creating',exact:true}).boundingBox();
      const original=await page.getByTestId('creation-original-column').boundingBox(), animal=await page.getByTestId('creation-animal-column').boundingBox();
      assert.ok(original && animal && original.x+original.width<=animal.x+1,'Original remains on the left, animal placeholder on the right');
      assert.ok(Math.abs(original.y-animal.y)<1 && Math.abs(original.height-animal.height)<1,'The two cards align');
      assert.ok(box && box.x>=animal.x && box.x+box.width<=animal.x+animal.width+1,'The animation stays inside the animal card');
      assert.ok(stop && stop.y+stop.height<=animal.y+animal.height+1,'Cancellation is not clipped by the animal card');
      assert.equal(await page.getByRole('img',{name:'Your original portrait',exact:true}).evaluate(imageSource),uploadedSource,'The uploaded photo stays visible throughout processing');
      assert.ok(box && stop && stop.y+stop.height<=page.viewportSize().height, 'Loading and cancellation fit the viewport');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth>innerWidth+1),false,'No horizontal overflow');
    }
    await start(); await page.getByRole('status').filter({hasText:'Finding your wild side'}).waitFor();
    await page.waitForFunction(() => document.querySelector('[data-testid="creation-loading"]').dataset.reducedMotion==='false');
    const loader=page.getByTestId('creation-loading'); assert.ok(await loader.locator('animate[attributeName="d"]').count()>=2,'A continuous outline really morphs');
    await loader.locator('svg').evaluate(svg => { svg.pauseAnimations(); svg.setCurrentTime(4.5); });
    await fits(); await page.screenshot({path:path.join(output,'wildfie-loading-desktop.png')});
    await page.setViewportSize({width:375,height:667}); await fits();
    await page.screenshot({path:path.join(output,'wildfie-loading-mobile.png')});
    await page.setViewportSize({width:320,height:568}); await fits();
    await page.setViewportSize({width:375,height:667});
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.waitForFunction(() => document.querySelector('[data-testid="creation-loading"]').dataset.reducedMotion==='true');
    assert.equal(await loader.locator('animate').count(),0,'Reduced motion removes SVG animations');
    assert.equal(await loader.locator('.wildfie-orbit').evaluate(el=>getComputedStyle(el).animationName),'none');
    await page.getByRole('button',{name:'Stop creating',exact:true}).click(); releaseAnalysis();
    await page.getByRole('alert').filter({hasText:'Creation stopped'}).waitFor();
    assert.equal(images,0,'Cancellation prevents the next image request'); assert.equal(await loader.count(),0);
    await page.emulateMedia({reducedMotion:'no-preference'}); await start();
    await page.waitForFunction(() => document.querySelector('[data-testid="creation-loading"]').dataset.reducedMotion==='false');
    releaseAnalysis(); await page.getByRole('status').filter({hasText:'A little wilder with every line'}).waitFor();
    await fits(); assert.equal(images,1); releaseImage();
    await page.getByTestId('portrait-caption').filter({hasText:'A playful, happy Fox'}).waitFor();
    assert.equal(await loader.count(),0,'Loading cleans up on success');
    const download=page.waitForEvent('download'); await page.getByRole('button',{name:'Save image',exact:true}).click();
    const saved=await fs.readFile(await (await download).path()); assert.equal(saved.readUInt32BE(16),1800,'The complete card still downloads');
    await page.getByRole('button',{name:'Start over',exact:true}).click();
    const nextChooser=page.waitForEvent('filechooser'); await page.getByRole('button',{name:'Upload photo',exact:true}).click();
    await (await nextChooser).setFiles(path.join(root,'apps/mobile/assets/photos/sample-portrait.jpg'));
    imageFailure=true; await start(); releaseAnalysis(); await page.getByRole('status').filter({hasText:'A little wilder with every line'}).waitFor(); releaseImage();
    await page.getByRole('alert').filter({hasText:'Simulated image failure'}).waitFor();
    assert.equal(await loader.count(),0,'Loading cleans up on failure');
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({status:'passed',originalLeftAndAnimationRight:true,morphingLineArt:true,desktopAnd320And375px:true,reducedMotion:true,stageMessages:true,cancellation:true,successAndErrorCleanup:true,combinedCardDownload:true,analyses,images,realMetaCalls:0,pageErrors:errors},null,2));
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
