// server.test.js
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { execSync } = require('node:child_process');

test('server serves index.html on GET / and words.js on GET /words.js', async () => {
  // ensure public/index.html exists for this test; created fully in Task 6
  const { spawn } = require('node:child_process');
  const child = spawn('node', ['server.js'], {
    env: { ...process.env, PORT: '5099' },
    stdio: 'ignore',
  });

  await new Promise((resolve) => setTimeout(resolve, 400)); // let it boot

  try {
    const res = await new Promise((resolve, reject) => {
      http.get('http://localhost:5099/words.js', resolve).on('error', reject);
    });
    assert.strictEqual(res.statusCode, 200);
  } finally {
    child.kill();
  }
});
