const test = require('node:test');
const assert = require('node:assert');
const { execSync } = require('node:child_process');
const fs = require('node:fs');

test('build-words-js produces a valid public/words.js', () => {
  execSync('node scripts/build-words-js.js', { stdio: 'inherit' });

  assert.ok(fs.existsSync('public/words.js'), 'public/words.js should exist');

  delete require.cache[require.resolve('../public/words.js')];
  const WORDS = require('../public/words.js');

  assert.strictEqual(WORDS.length, 5965);

  const counts = { A: 0, B: 0, C: 0 };
  const seenIds = new Set();
  WORDS.forEach((w, i) => {
    assert.strictEqual(w.id, i, `id ${w.id} should equal index ${i}`);
    assert.ok(!seenIds.has(w.id), `duplicate id ${w.id}`);
    seenIds.add(w.id);
    assert.ok(w.meaning && w.meaning.length > 0, `word ${w.word} missing meaning`);
    counts[w.level] += 1;
  });
  assert.deepStrictEqual(counts, { A: 982, B: 2111, C: 2872 });
});
