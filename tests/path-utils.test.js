const assert = require('assert');
const { normalizeTitle, canonicalKey, buildPathFromParents } = require('../script.js');

assert.strictEqual(normalizeTitle('  Space  Exploration  '), 'Space Exploration');
assert.strictEqual(canonicalKey('  Space Exploration  '), 'space exploration');
assert.deepStrictEqual(buildPathFromParents('Target', { Target: 'Start' }), ['Start', 'Target']);
console.log('path-utils tests passed');
