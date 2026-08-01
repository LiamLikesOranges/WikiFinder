const assert = require('assert');
const { normalizeTitle, canonicalKey, buildPathFromParents, findDirectLinkPath } = require('../script.js');

assert.strictEqual(normalizeTitle('  Space  Exploration  '), 'Space Exploration');
assert.strictEqual(canonicalKey('  Space Exploration  '), 'space exploration');
assert.deepStrictEqual(buildPathFromParents('Target', { Target: 'Start' }), ['Start', 'Target']);
assert.deepStrictEqual(findDirectLinkPath('Apple', 'Banana', ['Orange', 'Banana']), ['Apple', 'Banana']);
assert.strictEqual(findDirectLinkPath('Apple', 'Banana', ['Orange']), null);
console.log('path-utils tests passed');
