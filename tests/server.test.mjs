import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

test('static server serves game assets but not repository or local files', { timeout: 10000 }, async () => {
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: new URL('..', import.meta.url), env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const exited = once(child, 'exit');
  try {
    const [output] = await once(child.stdout, 'data');
    const base = output.toString().match(/http:\/\/localhost:\d+/)[0];
    for (const route of ['/', '/index.html', '/style.css', '/src/game.js', '/src/engine.js']) {
      const response = await fetch(base + route);
      assert.equal(response.status, 200, route);
      assert.ok((await response.text()).length > 0);
    }
    for (const route of ['/.git/config', '/.env', '/server.mjs', '/package.json', '/README.md', '/tests/engine.test.mjs', '/%2egit/config', '/src/../../.git/config']) {
      const response = await fetch(base + route);
      assert.equal(response.status, 404, route);
    }
  } finally {
    child.kill();
    await exited;
  }
});
