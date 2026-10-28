import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const catalogue = JSON.parse(await readFile(new URL('../data/animals.json', import.meta.url), 'utf8'));
const credits = JSON.parse(await readFile(new URL('../apps/mobile/assets/photos/credits.json', import.meta.url), 'utf8'));

test('pilot catalogue accurately contains three distinct animal types', () => {
  assert.equal(catalogue.length, 3);
  assert.equal(new Set(catalogue.map(animal => animal.id)).size, catalogue.length);
});

test('every catalogue entry has a local JPEG and matching rights record', async () => {
  for (const animal of catalogue) {
    const image = await readFile(new URL(`../apps/mobile/assets/photos/${animal.id}.jpg`, import.meta.url));
    assert.equal(image[0], 0xff); assert.equal(image[1], 0xd8);
    const record = credits.find(credit => credit.id === animal.id);
    assert.ok(record?.license);
    assert.ok(animal.photoCredit.includes(record.license));
    assert.equal(new URL(animal.sourceUrl).hostname, 'commons.wikimedia.org');
    assert.equal(animal.hybridEligible, false);
  }
});

test('Android does not request microphone access for still photos', async () => {
  const config = JSON.parse(await readFile(new URL('../apps/mobile/app.json', import.meta.url), 'utf8'));
  assert.ok(config.expo.android.blockedPermissions.includes('android.permission.RECORD_AUDIO'));
  const picker = config.expo.plugins.find(plugin => Array.isArray(plugin) && plugin[0] === 'expo-image-picker');
  assert.equal(picker[1].microphonePermission, false);
});

test('default backend disables paid calls and public access', async () => {
  const config = JSON.parse(await readFile(new URL('../server/Kinform.Api/appsettings.json', import.meta.url), 'utf8'));
  assert.equal(config.Ai.Mode, 'Demo');
  assert.equal(config.Ai.EnablePaidRequests, false);
  assert.equal(config.Prototype.AllowPublicAccess, false);
  assert.equal(config.Ai.ApiKey, undefined);
});

test('Meta example selects the requested models and keeps live requests disabled', async () => {
  const example = await readFile(new URL('../server/Kinform.Api/.env.example', import.meta.url), 'utf8');
  assert.match(example, /^META_VISION_MODEL=muse-spark-1\.3$/m);
  assert.match(example, /^META_IMAGE_MODEL=muse-image-1\.0$/m);
  assert.match(example, /^MODEL_API_KEY=REPLACE-WITH-YOUR-META-KEY$/m);
  assert.match(example, /^META_ENABLE_PAID_REQUESTS=false$/m);
  assert.match(example, /^META_CREDIT_CONFIRMED=false$/m);
  assert.match(example, /^AI_ENABLE_PAID_REQUESTS=false$/m);
  const project = await readFile(new URL('../server/Kinform.Api/Kinform.Api.csproj', import.meta.url), 'utf8');
  assert.ok(project.includes('CopyToPublishDirectory="Never"'));
  assert.ok(project.includes('<Content Remove=".env;.env.*" />'));
  assert.ok(!project.includes('<UserSecretsId>'));
});
