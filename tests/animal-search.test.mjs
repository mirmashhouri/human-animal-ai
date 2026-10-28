import test from 'node:test';
import assert from 'node:assert/strict';
import { animalSearchUrl, normalizeSearchQuery, suggestedAnimalQuery, MAX_SEARCH_LENGTH } from '../apps/mobile/src/animalSearch.ts';

test('animal name and AI descriptors form a portrait query; demos and older results use species only', () => {
  const animal = { name: 'Lion', searchKeywords: ['broad face', 'almond shaped eyes'] };
  assert.equal(suggestedAnimalQuery(animal), 'Lion broad face almond shaped eyes face portrait');
  assert.equal(suggestedAnimalQuery(animal, true), 'Lion face portrait');
  assert.equal(suggestedAnimalQuery({ name: 'Caracal' }), 'Caracal face portrait');
  assert.equal(suggestedAnimalQuery({ name: 'Cat', searchKeywords: ['https://evil.test', 'round face'] }), 'Cat round face face portrait');
});

test('editable search words cannot change the fixed destination or inject parameters', () => {
  for (const provider of ['google', 'pinterest']) {
    const query = 'Persian cat green eyes &safe=off #? / " <img> 🐱';
    const url = new URL(animalSearchUrl(provider, query));
    assert.equal(url.protocol, 'https:');
    assert.equal(url.hostname, provider === 'google' ? 'www.google.com' : 'www.pinterest.com');
    assert.equal(url.searchParams.get('q'), query);
    assert.equal(url.hash, '');
    assert.equal(url.searchParams.get('safe'), provider === 'google' ? 'active' : null);
    assert.equal(url.searchParams.get('tbm'), provider === 'google' ? 'isch' : null);
    assert.equal(url.searchParams.get('rs'), provider === 'pinterest' ? 'typed' : null);
  }
  assert.equal(animalSearchUrl('other', 'cat'), null);
});

test('blank searches are disabled; Unicode, whitespace and length are handled safely', () => {
  assert.equal(animalSearchUrl('google', ' \n\t\u202e '), null);
  assert.equal(normalizeSearchQuery('  Persian\ncat  '), 'Persian cat');
  assert.equal(normalizeSearchQuery('\ud800cat'), 'cat');
  assert.equal(Array.from(normalizeSearchQuery('🐱'.repeat(300))).length, MAX_SEARCH_LENGTH);
  assert.doesNotThrow(() => animalSearchUrl('pinterest', '🐱'.repeat(300)));
});
