const assert = require('assert');
const { normalizeTitle, canonicalKey, buildPathFromParents, findDirectLinkPath, rankLinks, isCandidateRelevant, findShortestPathInGraph } = require('../script.js');

assert.strictEqual(normalizeTitle('  Space  Exploration  '), 'Space Exploration');
assert.strictEqual(canonicalKey('  Space Exploration  '), 'space exploration');
assert.deepStrictEqual(buildPathFromParents('Target', { Target: 'Start' }), ['Start', 'Target']);
assert.deepStrictEqual(findDirectLinkPath('Apple', 'Banana', ['Orange', 'Banana']), ['Apple', 'Banana']);
assert.strictEqual(findDirectLinkPath('Apple', 'Banana', ['Orange']), null);
async function run() {
  const ranked = await rankLinks(['Orange', 'Banana', 'Banana Bread'], 'Banana');
  assert.strictEqual(ranked[0], 'Banana');
  assert.ok(ranked.includes('Banana Bread'));
  assert.strictEqual(isCandidateRelevant('1-butanol', 'Dog'), false);
  assert.strictEqual(isCandidateRelevant('Dog', 'Dog'), true);
  assert.deepStrictEqual(findShortestPathInGraph('A', 'D', { A: ['B', 'C'], B: ['D'], C: ['D'] }), ['a', 'b', 'd']);
  assert.deepStrictEqual(findShortestPathInGraph('A', 'D', { A: ['B'], B: ['C'], C: ['D'] }), ['a', 'b', 'c', 'd']);
  console.log('path-utils tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
