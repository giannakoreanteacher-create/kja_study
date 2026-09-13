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

  // Poll for server readiness instead of fixed delay
  const maxRetries = 60; // 60 * 50ms = 3 seconds total
  let ready = false;
  for (let i = 0; i < maxRetries; i++) {
    try {
      await new Promise((resolve, reject) => {
        http.get('http://localhost:5099/words.js', () => {
          ready = true;
          resolve();
        }).on('error', reject);
      });
      break;
    } catch (e) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  try {
    assert(ready, 'Server failed to boot within timeout');
    const res = await new Promise((resolve, reject) => {
      http.get('http://localhost:5099/words.js', resolve).on('error', reject);
    });
    assert.strictEqual(res.statusCode, 200);
  } finally {
    child.kill();
  }
});
